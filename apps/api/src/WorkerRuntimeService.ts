/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  WorkerRuntimeDTO, 
  RegisterWorkerDTO, 
  WorkerTelemetryDTO, 
  WorkerRuntimeLogDTO,
  WorkerStatusType,
  NotFoundError,
  PermissionDeniedError,
  BaseError,
  AuditFeatureIdType,
  AuditActionType,
  AuditLogStatusType,
  IndexJobDTO,
  IndexJobStatus
} from "@y/shared";
import { redactSecretLeaks } from "@y/security";
import { sysLogger } from "./logger";
import { PermissionKernelService } from "./PermissionKernelService";

/**
 * WorkerRuntimeService manages database-backed worker lifecycles, and
 * safe transaction-driven claiming from the index_jobs queue, conforming
 * to KDEBT-011 and Phase 28 scope restrictions.
 */
export class WorkerRuntimeService {
  constructor(
    private query: (sql: string, params?: any[]) => Promise<any>,
    private logAction: (
      projectId: string,
      actor: string,
      featureId: AuditFeatureIdType,
      action: AuditActionType,
      status: AuditLogStatusType,
      metadata?: Record<string, unknown>,
      rationale?: string,
      resourceId?: string,
      ipAddress?: string
    ) => Promise<any>,
    private permissionKernel?: PermissionKernelService
  ) {}

  private getPermissionKernel(): PermissionKernelService {
    if (!this.permissionKernel) {
      this.permissionKernel = new PermissionKernelService(this.query, this.logAction as any);
    }
    return this.permissionKernel;
  }

  /**
   * Helper to validate project scope and prevent cross-project boundary breaches.
   */
  public async validateProjectScope(projectId: string, workerId?: string): Promise<void> {
    if (!projectId) {
      throw new BaseError("PROJECT_SCOPE_VIOLATION", "Project ID is required.", 400);
    }
    // Verify project exists in db
    const projCheck = await this.query("SELECT id FROM projects WHERE id = $1 LIMIT 1;", [projectId]);
    if (projCheck.rowCount === 0) {
      throw new NotFoundError(`Project ${projectId} does not exist.`);
    }

    if (workerId) {
      const workerCheck = await this.query(
        "SELECT id, project_id FROM worker_registry WHERE worker_id = $1 LIMIT 1;",
        [workerId]
      );
      if (workerCheck.rowCount > 0 && workerCheck.rows[0].project_id !== projectId) {
        await this.emitWorkerAudit(
          projectId,
          workerId,
          "WORKER_CROSS_PROJECT_ACCESS_BLOCKED",
          "denied_untrusted",
          { workerId, targetProjectId: projectId, actualProjectId: workerCheck.rows[0].project_id },
          "Cross-project worker containment boundary breach blocked."
        );
        throw new PermissionDeniedError(`Worker containment breach: Worker ${workerId} belongs to another project.`);
      }
    }
  }

  /**
   * Helper to validate task scope.
   */
  public async validateTaskScope(projectId: string, taskId: string): Promise<void> {
    if (!taskId) return;
    const taskCheck = await this.query(
      "SELECT project_id FROM tasks WHERE id = $1 LIMIT 1;",
      [taskId]
    );
    if (taskCheck.rowCount === 0) {
      throw new NotFoundError(`Task ${taskId} does not exist.`);
    }
    if (taskCheck.rows[0].project_id !== projectId) {
      throw new PermissionDeniedError(`Task ${taskId} does not belong to project ${projectId}.`);
    }
  }

  /**
   * Helper to write structured redacted audit logs in a centralized way.
   */
  private async emitWorkerAudit(
    projectId: string,
    actor: string,
    action: AuditActionType,
    status: AuditLogStatusType,
    metadata: Record<string, any> = {},
    rationale = ""
  ): Promise<any> {
    // Redact metadata and rationale
    const cleanRationale = this.sanitizeWorkerLog(rationale);
    const cleanMetadata: Record<string, any> = {};
    for (const [key, val] of Object.entries(metadata)) {
      if (typeof val === "string") {
        cleanMetadata[key] = this.sanitizeWorkerLog(val);
      } else {
        cleanMetadata[key] = val;
      }
    }

    try {
      await this.logAction(
        projectId,
        actor || "system-worker-runtime",
        "WORKER",
        action,
        status,
        cleanMetadata,
        cleanRationale
      );
    } catch (err: any) {
      sysLogger.error(`[WorkerRuntimeService] Failed to emit audit log ${action}: ${err.message}`);
    }
  }

  /**
   * Redacts sensitive inputs, key formats and path details sequentially.
   */
  public sanitizeWorkerLog(message: string | null | undefined): string {
    if (!message) return "";
    let clean = message;

    // Check for potential credentials and mark redaction flags
    if (
      clean.includes("postgres://") || 
      clean.includes("postgresql://") || 
      clean.includes("aiza-sy") || 
      clean.includes("-----BEGIN CERTIFICATE-----") || 
      clean.includes("-----BEGIN RSA PRIVATE KEY-----")
    ) {
      // Log simple notice
    }

    clean = clean.replace(/-----BEGIN[A-Z\s]*CERTIFICATE-----(?:[A-Za-z0-9+/=\s\r\n\\]+)-----END[A-Z\s]*CERTIFICATE-----/g, "[REDACTED_CERTIFICATE]");
    clean = clean.replace(/-----BEGIN[A-Z\s]*PRIVATE KEY-----(?:[A-Za-z0-9+/=\s\r\n\\]+)-----END[A-Z\s]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]");
    clean = redactSecretLeaks(clean);

    // Path translations
    clean = clean.replace(/\/[a-zA-Z0-9_\-\.\/]+?\/(apps|packages|src|node_modules|dist)\//g, "./$1/");
    clean = clean.replace(/(?:[a-zA-Z]:\\(?:[a-zA-Z0-9_\-\.]+\\)*)(apps|packages|src|node_modules|dist)\\/g, ".\\$1\\");

    return clean;
  }

  /**
   * Registers a worker in the tracking table or reactivates it securely.
   */
  public async registerWorker(
    projectId: string,
    dto: RegisterWorkerDTO
  ): Promise<WorkerRuntimeDTO> {
    await this.validateProjectScope(projectId);
    
    const workerId = dto.worker_id;
    if (!workerId) {
      throw new BaseError("BAD_REQUEST", "worker_id is required for registration.", 400);
    }

    const maxConcurrency = dto.max_concurrency || 2;
    const processLabel = dto.process_label || null;
    const metadataJson = dto.metadata_json || {};

    // Generate internal ID wrkr_xxxx
    const randId = `wrkr_${Math.random().toString(36).substring(2, 11)}`;

    // Try upserting to guarantee project-worker level identity
    const queryStr = `
      INSERT INTO worker_registry (
        id, worker_id, project_id, status, process_label, max_concurrency, active_job_count, metadata_json, started_at, heartbeat_at, stopped_at, created_at, updated_at
      )
      VALUES ($1, $2, $3, 'active', $4, $5, 0, $6, NOW(), NOW(), NULL, NOW(), NOW())
      ON CONFLICT (project_id, worker_id)
      DO UPDATE SET
        status = 'active',
        process_label = EXCLUDED.process_label,
        max_concurrency = EXCLUDED.max_concurrency,
        metadata_json = EXCLUDED.metadata_json,
        started_at = NOW(),
        heartbeat_at = NOW(),
        stopped_at = NULL,
        updated_at = NOW()
      RETURNING *;
    `;

    const res = await this.query(queryStr, [
      randId,
      workerId,
      projectId,
      processLabel,
      maxConcurrency,
      JSON.stringify(metadataJson)
    ]);

    const row = res.rows[0];
    const dtoRes = this.mapRowToWorkerDTO(row);

    await this.emitWorkerAudit(
      projectId,
      workerId,
      "WORKER_REGISTERED",
      "authorized",
      { workerId, maxConcurrency, processLabel },
      `Worker registered: ${workerId}`
    );

    await this.logWorkerAction(projectId, workerId, "register", "success", `Worker registry initiated with Concurrency Limit: ${maxConcurrency}`);

    return dtoRes;
  }

  /**
   * Records worker heartbeat to keep lease integrity valid.
   */
  public async heartbeatWorker(projectId: string, workerId: string): Promise<WorkerRuntimeDTO> {
    await this.validateProjectScope(projectId, workerId);

    const res = await this.query(
      `UPDATE worker_registry
       SET heartbeat_at = NOW(), updated_at = NOW()
       WHERE worker_id = $1 AND project_id = $2
       RETURNING *;`,
      [workerId, projectId]
    );

    if (res.rowCount === 0) {
      throw new NotFoundError(`Worker ${workerId} is not registered.`);
    }

    const row = res.rows[0];
    const dto = this.mapRowToWorkerDTO(row);

    await this.emitWorkerAudit(
      projectId,
      workerId,
      "WORKER_HEARTBEAT_RECORDED",
      "authorized",
      { workerId },
      `Heartbeat logged.`
    );

    return dto;
  }

  /**
   * Pauses claiming from the production queue.
   */
  public async pauseWorker(projectId: string, workerId: string): Promise<WorkerRuntimeDTO> {
    await this.validateProjectScope(projectId, workerId);

    const res = await this.query(
      `UPDATE worker_registry
       SET status = 'paused', updated_at = NOW()
       WHERE worker_id = $1 AND project_id = $2
       RETURNING *;`,
      [workerId, projectId]
    );

    if (res.rowCount === 0) {
      throw new NotFoundError(`Worker ${workerId} is not registered.`);
    }

    const row = res.rows[0];
    const dto = this.mapRowToWorkerDTO(row);

    await this.emitWorkerAudit(
      projectId,
      workerId,
      "WORKER_PAUSED",
      "authorized",
      { workerId },
      `Worker status paused.`
    );

    await this.logWorkerAction(projectId, workerId, "pause", "success", "Worker paused processing.");

    return dto;
  }

  /**
   * Gracefully shuts down or stops a registered worker.
   */
  public async stopWorker(projectId: string, workerId: string): Promise<WorkerRuntimeDTO> {
    await this.validateProjectScope(projectId, workerId);

    const res = await this.query(
      `UPDATE worker_registry
       SET status = 'stopped', stopped_at = NOW(), updated_at = NOW()
       WHERE worker_id = $1 AND project_id = $2
       RETURNING *;`,
      [workerId, projectId]
    );

    if (res.rowCount === 0) {
      throw new NotFoundError(`Worker ${workerId} is not registered.`);
    }

    const row = res.rows[0];
    const dto = this.mapRowToWorkerDTO(row);

    await this.emitWorkerAudit(
      projectId,
      workerId,
      "WORKER_STOPPED",
      "authorized",
      { workerId },
      `Worker stopped.`
    );

    await this.logWorkerAction(projectId, workerId, "stop", "success", "Worker execution loop terminated.");

    return dto;
  }

  /**
   * Marks stale workers that missed their heartbeat deadline.
   */
  public async markWorkerStale(projectId: string, workerId: string): Promise<WorkerRuntimeDTO> {
    await this.validateProjectScope(projectId, workerId);

    const res = await this.query(
      `UPDATE worker_registry
       SET status = 'stale', updated_at = NOW()
       WHERE worker_id = $1 AND project_id = $2
       RETURNING *;`,
      [workerId, projectId]
    );

    if (res.rowCount === 0) {
      throw new NotFoundError(`Worker ${workerId} is not registered.`);
    }

    const row = res.rows[0];
    const dto = this.mapRowToWorkerDTO(row);

    await this.emitWorkerAudit(
      projectId,
      workerId,
      "WORKER_STALE_DETECTED",
      "authorized",
      { workerId },
      `Worker marked stale.`
    );

    await this.logWorkerAction(projectId, workerId, "stale_detect", "warning", "Stale state marked due to quiet heartbeats.");

    return dto;
  }

  /**
   * Securely locks and claims next pending job using transaction-locking SKIP LOCKED.
   */
  public async claimNextJob(projectId: string, workerId: string): Promise<IndexJobDTO | null> {
    await this.validateProjectScope(projectId, workerId);

    // Permission enforcement check
    await this.getPermissionKernel().enforce({
      subject: {
        subject_type: "worker",
        subject_id: workerId,
        project_id: projectId,
        worker_id: workerId
      },
      resource: {
        resource_type: "index_job",
        resource_id: "claim_job",
        project_id: projectId
      },
      action: "claim"
    });

    // 1. Double check worker exists and is in 'active' status
    const workerCheck = await this.query(
      "SELECT status, max_concurrency, active_job_count FROM worker_registry WHERE worker_id = $1 AND project_id = $2 LIMIT 1;",
      [workerId, projectId]
    );

    if (workerCheck.rowCount === 0) {
      throw new NotFoundError(`Worker ${workerId} is not registered under project ${projectId}.`);
    }

    const worker = workerCheck.rows[0];
    if (worker.status !== "active") {
      sysLogger.warn(`[WorkerRuntimeService] Claim request ignored: worker ${workerId} is in state '${worker.status}'`);
      return null;
    }

    // 2. Validate concurrency thresholds
    if (worker.active_job_count >= worker.max_concurrency) {
      sysLogger.warn(`[WorkerRuntimeService] Concurrency saturation for worker ${workerId}. Reached limit: ${worker.max_concurrency}`);
      return null;
    }

    // Begin claim update inside a transaction context
    // FOR UPDATE SKIP LOCKED locks the specific row to prevent multi-worker race double claiming
    const claimRes = await this.query(
      `WITH next_job AS (
         SELECT id FROM index_jobs
         WHERE status = 'pending' AND project_id = $1
         ORDER BY priority = 'high' DESC, priority = 'medium' DESC, created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE index_jobs
       SET status = 'processing',
           locked_by = $2,
           locked_at = NOW(),
           started_at = NOW(),
           attempts = attempts + 1,
           updated_at = NOW()
       FROM next_job
       WHERE index_jobs.id = next_job.id
       RETURNING index_jobs.*;`,
      [projectId, workerId]
    );

    if (claimRes.rowCount === 0) {
      return null; // Empty queue
    }

    // Increment worker's active job trace
    await this.query(
      `UPDATE worker_registry
       SET active_job_count = active_job_count + 1, updated_at = NOW()
       WHERE worker_id = $1 AND project_id = $2;`,
      [workerId, projectId]
    );

    const jobRow = claimRes.rows[0];
    const jobDto = this.mapJobRowToDTO(jobRow);

    await this.emitWorkerAudit(
      projectId,
      workerId,
      "WORKER_JOB_CLAIMED",
      "authorized",
      { workerId, jobId: jobDto.id, attempts: jobDto.attempts },
      `Job claimed: ${jobDto.id}`
    );

    await this.logWorkerAction(
      projectId,
      workerId,
      "claim_job",
      "success",
      `Claimed pending job instance: ${jobDto.id} (Attempt ${jobDto.attempts})`,
      null,
      jobDto.id
    );

    return jobDto;
  }

  /**
   * Marks a job successfully finished, clearing locking leases.
   */
  public async completeJob(projectId: string, workerId: string, jobId: string, metadata: Record<string, any> = {}): Promise<IndexJobDTO> {
    await this.validateProjectScope(projectId, workerId);

    // Permission enforcement check
    await this.getPermissionKernel().enforce({
      subject: {
        subject_type: "worker",
        subject_id: workerId,
        project_id: projectId,
        worker_id: workerId
      },
      resource: {
        resource_type: "index_job",
        resource_id: jobId,
        project_id: projectId
      },
      action: "update"
    });

    // Verify job belongs to project and is currently locked by this worker
    const check = await this.query(
      "SELECT locked_by, status, metadata_json FROM index_jobs WHERE id = $1 AND project_id = $2 LIMIT 1;",
      [jobId, projectId]
    );

    if (check.rowCount === 0) {
      throw new NotFoundError(`Index job ${jobId} not found under project ${projectId}.`);
    }

    const job = check.rows[0];
    if (job.locked_by !== workerId) {
      throw new PermissionDeniedError(`Worker lease mismatch: Job ${jobId} is locked by '${job.locked_by}', not '${workerId}'`);
    }

    const mergedMeta = { ...job.metadata_json, ...metadata, completedByWorker: workerId };

    const res = await this.query(
      `UPDATE index_jobs
       SET status = 'completed',
           locked_by = NULL,
           locked_at = NULL,
           completed_at = NOW(),
           metadata_json = $1,
           updated_at = NOW()
       WHERE id = $2 AND project_id = $3
       RETURNING *;`,
      [JSON.stringify(mergedMeta), jobId, projectId]
    );

    // Decrement worker's active trace
    await this.query(
      `UPDATE worker_registry
       SET active_job_count = GREATEST(0, active_job_count - 1), updated_at = NOW()
       WHERE worker_id = $1 AND project_id = $2;`,
      [workerId, projectId]
    );

    const completedJob = this.mapJobRowToDTO(res.rows[0]);

    await this.emitWorkerAudit(
      projectId,
      workerId,
      "WORKER_JOB_COMPLETED",
      "authorized",
      { workerId, jobId },
      `Job completed: ${jobId}`
    );

    await this.logWorkerAction(
      projectId,
      workerId,
      "complete_job",
      "success",
      `Job finished successfully: ${jobId}`,
      null,
      jobId
    );

    return completedJob;
  }

  /**
   * Marks a job as failed, redacting errors safely.
   */
  public async failJob(projectId: string, workerId: string, jobId: string, errorText: string): Promise<IndexJobDTO> {
    await this.validateProjectScope(projectId, workerId);

    // Permission enforcement check
    await this.getPermissionKernel().enforce({
      subject: {
        subject_type: "worker",
        subject_id: workerId,
        project_id: projectId,
        worker_id: workerId
      },
      resource: {
        resource_type: "index_job",
        resource_id: jobId,
        project_id: projectId
      },
      action: "update"
    });

    const check = await this.query(
      "SELECT locked_by, status, attempts, max_attempts FROM index_jobs WHERE id = $1 AND project_id = $2 LIMIT 1;",
      [jobId, projectId]
    );

    if (check.rowCount === 0) {
      throw new NotFoundError(`Index job ${jobId} not found under project ${projectId}.`);
    }

    const job = check.rows[0];
    if (job.locked_by !== workerId) {
      throw new PermissionDeniedError(`Worker lease mismatch: Job ${jobId} is not leased to worker ${workerId}.`);
    }

    const redactedError = this.sanitizeWorkerLog(errorText);

    // Update job to failed
    const res = await this.query(
      `UPDATE index_jobs
       SET status = 'failed',
           locked_by = NULL,
           locked_at = NULL,
           failed_at = NOW(),
           error_redacted = $1,
           last_error = $1,
           updated_at = NOW()
       WHERE id = $2 AND project_id = $3
       RETURNING *;`,
      [redactedError, jobId, projectId]
    );

    // Decrement active jobs for this worker
    await this.query(
      `UPDATE worker_registry
       SET active_job_count = GREATEST(0, active_job_count - 1), updated_at = NOW()
       WHERE worker_id = $1 AND project_id = $2;`,
      [workerId, projectId]
    );

    const failedJob = this.mapJobRowToDTO(res.rows[0]);

    // Derived eligibility status check
    const attempts = failedJob.attempts;
    const maxAttempts = failedJob.maxAttempts;
    const isRetryable = attempts < maxAttempts;

    if (isRetryable) {
      await this.emitWorkerAudit(
        projectId,
        workerId,
        "WORKER_JOB_RETRY_SCHEDULED",
        "authorized",
        { workerId, jobId, attempts, maxAttempts },
        `Job failed but retry is scheduled (attempts: ${attempts}/${maxAttempts})`
      );
    } else {
      await this.emitWorkerAudit(
        projectId,
        workerId,
        "WORKER_JOB_FAILED",
        "authorized",
        { workerId, jobId, attempts, maxAttempts },
        `Job permanently failed (attempts: ${attempts}/${maxAttempts})`
      );
    }

    // Write log entry with redacted log message
    await this.logWorkerAction(
      projectId,
      workerId,
      "fail_job",
      "error",
      `Job failed (attempts ${attempts}/${maxAttempts}): ${redactedError}`,
      null,
      jobId
    );

    return failedJob;
  }

  /**
   * Reclaims and stops workers that exceeded safe heartbeats.
   */
  public async releaseStaleWorkerLeases(projectId: string): Promise<{ evictedCount: number }> {
    await this.validateProjectScope(projectId);

    // Find active or paused workers with heartbeats older than 30 seconds
    const staleWorkersCheck = await this.query(
      `SELECT worker_id FROM worker_registry
       WHERE status IN ('active', 'paused') AND heartbeat_at < NOW() - INTERVAL '30 seconds' AND project_id = $1;`,
      [projectId]
    );

    let evictedCount = 0;
    for (const row of staleWorkersCheck.rows) {
      const wId = row.worker_id;

      // 1. Transition worker state to stop / evicted
      await this.query(
        `UPDATE worker_registry
         SET status = 'stopped', stopped_at = NOW(), updated_at = NOW()
         WHERE worker_id = $1 AND project_id = $2;`,
        [wId, projectId]
      );

      // 2. Fetch jobs currently locked by this worker
      const lockedJobs = await this.query(
        "SELECT id, attempts, max_attempts FROM index_jobs WHERE locked_by = $1 AND status = 'processing' AND project_id = $2;",
        [wId, projectId]
      );

      for (const job of lockedJobs.rows) {
        // If attempts left, put back to pending, otherwise mark permanently failed
        const canRetry = job.attempts < job.max_attempts;
        const newStatus = canRetry ? "pending" : "failed";

        await this.query(
          `UPDATE index_jobs
           SET status = $1, locked_by = NULL, locked_at = NULL, error_redacted = $2, last_error = $2, updated_at = NOW()
           WHERE id = $3 AND project_id = $4;`,
          [
            newStatus,
            canRetry ? "Lease released due to worker death." : "Lease exceeded. Worker died and max attempts exceeded.",
            job.id,
            projectId
          ]
        );

        await this.emitWorkerAudit(
          projectId,
          "system",
          "WORKER_STALE_LEASE_RELEASED",
          "authorized",
          { workerId: wId, jobId: job.id, reassignedStatus: newStatus },
          `Lease reclaimed for job: ${job.id}`
        );
      }

      await this.emitWorkerAudit(
        projectId,
        wId,
        "WORKER_STALE_EVICTED",
        "authorized",
        { workerId: wId },
        `Stale worker evicted due to missing heartbeat.`
      );

      evictedCount++;
    }

    return { evictedCount };
  }

  /**
   * Frees jobs stuck in processing where leases expired.
   */
  public async releaseStaleJobLeases(projectId: string): Promise<{ releasedCount: number }> {
    await this.validateProjectScope(projectId);

    // Find parent locked jobs quiet for more than 1 minute or locked by stopped/stale/stopped workers
    const expiredJobsCheck = await this.query(
      `SELECT ij.id, ij.locked_by, ij.attempts, ij.max_attempts
       FROM index_jobs ij
       LEFT JOIN worker_registry wr ON ij.locked_by = wr.worker_id AND ij.project_id = wr.project_id
       WHERE ij.status = 'processing' AND ij.project_id = $1
         AND (ij.locked_at < NOW() - INTERVAL '1 minute' OR wr.status IN ('stopped', 'stale') OR wr.status IS NULL);`,
      [projectId]
    );

    let releasedCount = 0;
    for (const job of expiredJobsCheck.rows) {
      const canRetry = job.attempts < job.max_attempts;
      const newStatus = canRetry ? "pending" : "failed";

      await this.query(
        `UPDATE index_jobs
         SET status = $1, locked_by = NULL, locked_at = NULL, error_redacted = $2, last_error = $2, updated_at = NOW()
         WHERE id = $3 AND project_id = $4;`,
        [newStatus, "Lease expired or worker stopped.", job.id, projectId]
      );

      // Decrement the active count if worker exists
      if (job.locked_by) {
        await this.query(
          `UPDATE worker_registry
           SET active_job_count = GREATEST(0, active_job_count - 1), updated_at = NOW()
           WHERE worker_id = $1 AND project_id = $2;`,
          [job.locked_by, projectId]
        );
      }

      await this.emitWorkerAudit(
        projectId,
        "system",
        "WORKER_STALE_LEASE_RELEASED",
        "authorized",
        { jobId: job.id, lockedBy: job.locked_by, reassignedStatus: newStatus },
        `Stale task lease released context.`
      );

      releasedCount++;
    }

    return { releasedCount };
  }

  /**
   * Fetches specific worker status.
   */
  public async getWorkerStatus(projectId: string, workerId: string): Promise<WorkerRuntimeDTO> {
    await this.validateProjectScope(projectId, workerId);

    const res = await this.query(
      "SELECT * FROM worker_registry WHERE worker_id = $1 AND project_id = $2 LIMIT 1;",
      [workerId, projectId]
    );

    if (res.rowCount === 0) {
      throw new NotFoundError(`Worker ${workerId} is not registered.`);
    }

    return this.mapRowToWorkerDTO(res.rows[0]);
  }

  /**
   * Compiles diagnostic telemetry counts.
   */
  public async getQueueTelemetry(projectId: string): Promise<WorkerTelemetryDTO> {
    await this.validateProjectScope(projectId);

    // Permission enforcement check
    await this.getPermissionKernel().enforce({
      subject: {
        subject_type: "system",
        subject_id: "system",
        project_id: projectId
      },
      resource: {
        resource_type: "worker",
        resource_id: "telemetry",
        project_id: projectId
      },
      action: "read"
    });

    // Queue counts mapping
    const qCountRes = await this.query(
      "SELECT status, COUNT(*) as count FROM index_jobs WHERE project_id = $1 GROUP BY status;",
      [projectId]
    );

    const queueCounts: Record<string, number> = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0
    };

    for (const r of qCountRes.rows) {
      queueCounts[r.status] = parseInt(r.count, 10);
    }

    // Active workers list
    const workersRes = await this.query(
      "SELECT * FROM worker_registry WHERE project_id = $1 ORDER BY updated_at DESC;",
      [projectId]
    );

    const workers = workersRes.rows.map((row: any) => this.mapRowToWorkerDTO(row));

    // Stale metrics
    const staleWorkersCount = workers.filter(w => w.status === "stale" || (w.status === "active" && new Date(w.heartbeat_at).getTime() < Date.now() - 30000)).length;

    // Processing jobs
    const activeProcessingJobs = queueCounts.processing;

    // Retryable derived counting: failed jobs where attempts < max_attempts
    const retryableRes = await this.query(
      "SELECT COUNT(*) as count FROM index_jobs WHERE status = 'failed' AND attempts < max_attempts AND project_id = $1;",
      [projectId]
    );
    const retryableJobs = parseInt(retryableRes.rows[0].count, 10);

    return {
      project_id: projectId,
      workers,
      queue_counts: queueCounts,
      stale_workers: staleWorkersCount,
      active_processing_jobs: activeProcessingJobs,
      retryable_jobs: retryableJobs,
      updated_at: new Date().toISOString()
    };
  }

  /**
   * Logs a localized action down into worker_runtime_logs table.
   */
  private async logWorkerAction(
    projectId: string,
    workerId: string,
    action: string,
    status: string,
    message: string,
    taskId?: string | null,
    indexJobId?: string | null
  ): Promise<void> {
    const logId = `wlog_${Math.random().toString(36).substring(2, 11)}`;
    const redactedMessage = this.sanitizeWorkerLog(message);

    try {
      await this.query(
        `INSERT INTO worker_runtime_logs (id, worker_id, project_id, task_id, index_job_id, action, status, message_redacted, metadata_json, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '{}'::jsonb, NOW());`,
        [logId, workerId, projectId, taskId || null, indexJobId || null, action, status, redactedMessage]
      );
    } catch (err: any) {
      sysLogger.error(`[WorkerRuntimeService] Failed to write worker log: ${err.message}`);
    }
  }

  /**
   * Retreives historical worker execution logs.
   */
  public async getWorkerLogs(projectId: string, workerId: string): Promise<WorkerRuntimeLogDTO[]> {
    await this.validateProjectScope(projectId, workerId);

    const res = await this.query(
      "SELECT * FROM worker_runtime_logs WHERE worker_id = $1 AND project_id = $2 ORDER BY created_at DESC LIMIT 150;",
      [workerId, projectId]
    );

    return res.rows.map((r: any) => ({
      id: r.id,
      worker_id: r.worker_id,
      project_id: r.project_id,
      task_id: r.task_id,
      index_job_id: r.index_job_id,
      action: r.action,
      status: r.status,
      message_redacted: r.message_redacted,
      metadata_json: r.metadata_json || {},
      created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString()
    }));
  }

  /**
   * Map mapping db row to Worker DTO.
   */
  private mapRowToWorkerDTO(row: any): WorkerRuntimeDTO {
    return {
      id: row.id,
      worker_id: row.worker_id,
      project_id: row.project_id,
      status: row.status as WorkerStatusType,
      process_label: row.process_label,
      started_at: row.started_at ? new Date(row.started_at).toISOString() : new Date().toISOString(),
      heartbeat_at: row.heartbeat_at ? new Date(row.heartbeat_at).toISOString() : new Date().toISOString(),
      stopped_at: row.stopped_at ? new Date(row.stopped_at).toISOString() : null,
      max_concurrency: row.max_concurrency || 2,
      active_job_count: row.active_job_count || 0,
      metadata_json: row.metadata_json || {},
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
    };
  }

  /**
   * Maps db row to IndexJobDTO.
   */
  private mapJobRowToDTO(row: any): IndexJobDTO {
    return {
      id: row.id,
      projectId: row.project_id,
      taskId: row.task_id || null,
      jobType: row.job_type,
      status: row.status as IndexJobStatus,
      priority: row.priority || "medium",
      adapterKind: row.adapter_kind || "local",
      rootPathRedacted: row.root_path_redacted || null,
      requestedPaths: row.requested_paths || null,
      metadataJson: row.metadata_json || {},
      attempts: row.attempts || 0,
      maxAttempts: row.max_attempts || 3,
      lockedAt: row.locked_at ? new Date(row.locked_at).toISOString() : null,
      lockedBy: row.locked_by || null,
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      failedAt: row.failed_at ? new Date(row.failed_at).toISOString() : null,
      errorRedacted: row.error_redacted || null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
    };
  }
}
