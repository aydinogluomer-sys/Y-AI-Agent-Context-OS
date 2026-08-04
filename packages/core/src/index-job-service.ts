/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  NotFoundError, 
  PermissionDeniedError, 
  ContextBoundaryViolationError,
  IndexJobDTO,
  CreateIndexJobDTO,
  IndexJobStatus,
  IndexJobType,
  IndexJobPriority
} from "@y/shared";
import { redactSecretLeaks } from "@y/security";

export interface IndexJob {
  id: string;
  project_id: string;
  task_id: string | null;
  job_type: string;
  status: string;
  priority: string;
  adapter_kind: string;
  root_path_redacted: string | null;
  requested_paths: string[] | null;
  file_path: string | null;
  metadata_json: Record<string, any>;
  attempts: number;
  max_attempts: number;
  locked_at: Date | null;
  locked_by: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  failed_at: Date | null;
  error_redacted: string | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

export class IndexJobService {
  constructor(
    private pool: any,
    private repoAdapter?: any
  ) {
    if (!pool) {
      throw new Error("A valid database connection pool is required for IndexJobService.");
    }
  }

  private async query(sql: string, params: unknown[] = []): Promise<any> {
    return this.pool.query(sql, params);
  }

  /**
   * Helper to map database rows to IndexJobDTO
   */
  public mapRowToDTO(row: any): IndexJobDTO {
    let status = row.status as IndexJobStatus;
    if (status === ("queued" as any)) status = "pending";
    if (status === ("running" as any)) status = "processing";

    return {
      id: row.id,
      projectId: row.project_id,
      taskId: row.task_id,
      jobType: row.job_type as IndexJobType,
      status: status,
      priority: row.priority as IndexJobPriority,
      adapterKind: row.adapter_kind,
      rootPathRedacted: row.root_path_redacted,
      requestedPaths: row.requested_paths,
      metadataJson: row.metadata_json,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      lockedAt: row.locked_at ? new Date(row.locked_at).toISOString() : null,
      lockedBy: row.locked_by,
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      failedAt: row.failed_at ? new Date(row.failed_at).toISOString() : null,
      errorRedacted: row.error_redacted,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : ""
    };
  }

  /**
   * Emits structural and redacted audit logs for Core/indexing activity.
   */
  private async emitAuditLog(
    projectId: string,
    actor: string,
    action: string,
    status: string,
    metadata: Record<string, any> = {},
    rationale = "",
    resourceId = ""
  ): Promise<void> {
    const logId = `audit_log_${Math.random().toString(36).substring(2, 11)}`;
    const cleanRationale = redactSecretLeaks(rationale);
    
    // Redact all metadata before database commits
    const redactedMetadata = this.sanitizeJobMetadata(metadata);

    const isSecretInMetadata = JSON.stringify(metadata) !== JSON.stringify(redactedMetadata);
    const isSecretInRationale = rationale !== cleanRationale;

    if ((isSecretInMetadata || isSecretInRationale) && action !== "INDEX_JOB_SECRET_REDACTED") {
      const redLogId = `audit_log_${Math.random().toString(36).substring(2, 11)}`;
      try {
        await this.query(
          `INSERT INTO audit_logs (
            id, project_id, actor, feature_id, action, status, metadata, rationale, resource_id, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW());`,
          [
            redLogId,
            projectId,
            "system",
            "CORE",
            "INDEX_JOB_SECRET_REDACTED",
            "authorized",
            JSON.stringify({ originalAction: action, secretInMetadata: isSecretInMetadata, secretInRationale: isSecretInRationale }),
            "Secret signature detected and redacted in index job audit log.",
            metadata?.jobId || metadata?.id || resourceId
          ]
        );
      } catch (err: any) {
        console.error(`[IndexJobService] Failed to emit INDEX_JOB_SECRET_REDACTED audit log: ${err.message}`);
      }
    }

    try {
      await this.query(
        `INSERT INTO audit_logs (
          id, project_id, actor, feature_id, action, status, metadata, rationale, resource_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW());`,
        [logId, projectId, actor, "CORE", action, status, JSON.stringify(redactedMetadata), cleanRationale, resourceId]
      );
    } catch (err: any) {
      console.error(`[IndexJobService] Failed to emit audit log: ${err.message}`);
    }
  }

  /**
   * Standard Core path validation using provided RepoAdapter
   */
  public validateFilePath(filePath: string): { valid: boolean; error?: string } {
    if (!this.repoAdapter) {
      return { valid: true };
    }
    return this.repoAdapter.validatePath(filePath);
  }

  /**
   * Sanitizes metadata by redacting known credentials, files, certificates, DB URLs
   */
  public sanitizeJobMetadata(metadata: Record<string, any>): Record<string, any> {
    const rawStr = JSON.stringify(metadata);
    const redactedStr = redactSecretLeaks(rawStr);
    try {
      return JSON.parse(redactedStr);
    } catch {
      return { redacted: true };
    }
  }

  // ========================================================
  // COMPLIANT PHASE 19 PUBLIC METHODS
  // ========================================================

  /**
   * Create an index job inside the queue (Phase 19 compliant)
   */
  public async createIndexJob(
    projectId: string,
    req: CreateIndexJobDTO
  ): Promise<IndexJobDTO> {
    // 1. Validate project scope
    const projRes = await this.query("SELECT id FROM projects WHERE id = $1 LIMIT 1;", [projectId]);
    if (projRes.rowCount === 0) {
      throw new NotFoundError(`Project scope validation failed: Project ${projectId} not found.`);
    }

    // 2. Validate task if provided
    if (req.taskId) {
      const taskRes = await this.query("SELECT id, project_id FROM tasks WHERE id = $1 LIMIT 1;", [req.taskId]);
      if (taskRes.rowCount === 0) {
        throw new NotFoundError(`Task scope validation failed: Task ${req.taskId} not found.`);
      }
      if (taskRes.rows[0].project_id !== projectId) {
        throw new PermissionDeniedError(`Permission denied: Task ${req.taskId} does not belong to specified project.`);
      }
    }

    // 3. Path boundaries checking via RepoAdapter
    if (req.requestedPaths && req.requestedPaths.length > 0) {
      for (const p of req.requestedPaths) {
        const validation = this.validateFilePath(p);
        if (!validation.valid) {
          await this.emitAuditLog(
            projectId,
            "system",
            "INDEX_JOB_CROSS_PROJECT_ACCESS_BLOCKED",
            "denied",
            { projectId, path: p, error: validation.error },
            `Path traversal or boundary violation blocked for path: ${p}`
          );
          throw new ContextBoundaryViolationError(`Path validation failed: ${validation.error || 'Blocked path traversal attempt.'}`);
        }
      }
    }

    const jobId = `job_${Math.random().toString(36).substring(2, 11)}`;
    const jobType = req.jobType || "repo_scan";
    const status = "pending";
    const priority = req.priority || "medium";
    const adapterKind = req.adapterKind || "local_filesystem";
    const rootPathRedacted = req.rootPathRedacted ? redactSecretLeaks(req.rootPathRedacted) : null;
    const requestedPaths = req.requestedPaths ? req.requestedPaths.map(p => redactSecretLeaks(p)) : null;
    const filePath = (requestedPaths && requestedPaths.length > 0) ? requestedPaths[0] : null;
    const maxAttempts = req.maxAttempts ?? 3;
    const sanitizedMetadata = req.metadataJson ? this.sanitizeJobMetadata(req.metadataJson) : {};

    const sql = `
      INSERT INTO index_jobs (
        id, project_id, task_id, job_type, status, priority, adapter_kind, root_path_redacted, requested_paths, file_path,
        attempts, max_attempts, metadata_json, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $11, $12, NOW(), NOW())
      RETURNING *;
    `;
    const params = [
      jobId,
      projectId,
      req.taskId || null,
      jobType,
      status,
      priority,
      adapterKind,
      rootPathRedacted,
      requestedPaths,
      filePath,
      maxAttempts,
      JSON.stringify(sanitizedMetadata)
    ];

    const res = await this.query(sql, params);

    await this.emitAuditLog(
      projectId,
      "system",
      "INDEX_JOB_CREATED",
      "authorized",
      { jobId, jobType, priority, requestedPaths, taskId: req.taskId },
      `Index job ${jobId} successfully created with status pending.`
    );

    return this.mapRowToDTO(res.rows[0]);
  }

  /**
   * Retrieves single Job state by id (Phase 19 compliant)
   */
  public async getIndexJob(jobId: string, projectId: string): Promise<IndexJobDTO> {
    const res = await this.query(
      "SELECT * FROM index_jobs WHERE id = $1 AND project_id = $2 LIMIT 1;",
      [jobId, projectId]
    );
    if (res.rowCount === 0) {
      throw new NotFoundError(`Index job ${jobId} not found under project ${projectId}.`);
    }
    return this.mapRowToDTO(res.rows[0]);
  }

  /**
   * List jobs for a project with optional filters
   */
  public async listIndexJobs(projectId: string, status?: IndexJobStatus): Promise<IndexJobDTO[]> {
    let sql = "SELECT * FROM index_jobs WHERE project_id = $1";
    const params: any[] = [projectId];

    if (status) {
      sql += " AND status = $2";
      params.push(status);
    }

    sql += " ORDER BY created_at DESC;";
    const res = await this.query(sql, params);
    return res.rows.map(row => this.mapRowToDTO(row));
  }

  /**
   * Claim next worker job trans-safely (FOR UPDATE SKIP LOCKED) (Phase 19 compliant)
   */
  public async claimNextJob(
    workerId: string,
    projectId: string,
    allowedTargetPaths?: string[]
  ): Promise<any | null> {
    const projCheck = await this.query("SELECT id FROM projects WHERE id = $1 LIMIT 1;", [projectId]);
    if (projCheck.rowCount === 0) {
      throw new NotFoundError(`Project scope validation failed: Project ${projectId} not found.`);
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN;");
      
      // Select jobs that are pending / queued (supports both tags interchangeably)
      let sql = `
        SELECT * FROM index_jobs
        WHERE status IN ('pending', 'queued') AND project_id = $1 AND attempts < max_attempts
      `;
      const params: any[] = [projectId];
      
      if (allowedTargetPaths && allowedTargetPaths.length > 0) {
        const validatedPaths = allowedTargetPaths.filter(p => this.validateFilePath(p).valid);
        if (validatedPaths.length > 0) {
          sql += ` AND (file_path IS NULL OR file_path = ANY($2) OR requested_paths && $2)`;
          params.push(validatedPaths);
        } else {
          sql += ` AND file_path IS NULL AND requested_paths IS NULL`;
        }
      }
      
      sql += `
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED;
      `;
      
      const selectRes = await client.query(sql, params);
      if (selectRes.rowCount === 0) {
        await client.query("COMMIT;");
        return null;
      }
      
      const job = selectRes.rows[0];
      const nextAttempts = job.attempts + 1;
      const nextStatus = "processing";
      const actionName = "INDEX_JOB_CLAIMED";

      const updateRes = await client.query(
        `UPDATE index_jobs
         SET status = $1,
             locked_by = $2,
             locked_at = NOW(),
             attempts = $3,
             started_at = NOW(),
             updated_at = NOW()
         WHERE id = $4
         RETURNING *;`,
        [nextStatus, workerId, nextAttempts, job.id]
      );
      
      await client.query("COMMIT;");
      
      const claimedRow = updateRes.rows[0];
      
      await this.emitAuditLog(
        projectId,
        workerId,
        actionName,
        "authorized",
        { jobId: job.id, workerId, attempts: nextAttempts, status: nextStatus },
        `Index job ${job.id} successfully claimed by worker ${workerId}.`
      );

      const dto = this.mapRowToDTO(claimedRow);
      return dto;
    } catch (err: any) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Transitions a job status to processing (Phase 19 compliant)
   */
  public async markProcessing(jobId: string, projectId: string, workerId: string): Promise<IndexJobDTO> {
    const jobCheck = await this.query(
      "SELECT * FROM index_jobs WHERE id = $1 AND project_id = $2 LIMIT 1;",
      [jobId, projectId]
    );
    if (jobCheck.rowCount === 0) {
      throw new NotFoundError(`Index job ${jobId} not found under project ${projectId}.`);
    }

    const res = await this.query(
      `UPDATE index_jobs
       SET status = 'processing',
           locked_by = $1,
           locked_at = NOW(),
           started_at = NOW(),
           updated_at = NOW()
       WHERE id = $2 AND project_id = $3
       RETURNING *;`,
      [workerId, jobId, projectId]
    );

    await this.emitAuditLog(
      projectId,
      workerId,
      "INDEX_JOB_PROCESSING",
      "authorized",
      { jobId },
      `Index job ${jobId} is now processing.`
    );

    return this.mapRowToDTO(res.rows[0]);
  }

  /**
   * Transitions a job status to completed (Phase 19 compliant)
   */
  public async markCompleted(jobId: string, projectId: string, resultCount = 0): Promise<IndexJobDTO> {
    const jobCheck = await this.query(
      "SELECT * FROM index_jobs WHERE id = $1 AND project_id = $2 LIMIT 1;",
      [jobId, projectId]
    );
    if (jobCheck.rowCount === 0) {
      throw new NotFoundError(`Index job ${jobId} not found under project ${projectId}.`);
    }

    const job = jobCheck.rows[0];
    const newMetadata = { ...job.metadata_json, resultCount };

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
      [JSON.stringify(newMetadata), jobId, projectId]
    );

    await this.emitAuditLog(
      projectId,
      job.locked_by || "system",
      "INDEX_JOB_COMPLETED",
      "authorized",
      { jobId, resultCount },
      `Index job ${jobId} successfully completed.`
    );

    return this.mapRowToDTO(res.rows[0]);
  }

  /**
   * Transitions a job status to failed (Phase 19 compliant)
   */
  public async markFailed(jobId: string, projectId: string, errorText: string): Promise<IndexJobDTO> {
    const jobCheck = await this.query(
      "SELECT * FROM index_jobs WHERE id = $1 AND project_id = $2 LIMIT 1;",
      [jobId, projectId]
    );
    if (jobCheck.rowCount === 0) {
      throw new NotFoundError(`Index job ${jobId} not found under project ${projectId}.`);
    }

    const job = jobCheck.rows[0];
    const redactedError = redactSecretLeaks(errorText);

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

    await this.emitAuditLog(
      projectId,
      job.locked_by || "system",
      "INDEX_JOB_FAILED",
      "authorized",
      { jobId, error: redactedError },
      `Index job ${jobId} hard failed with error.`
    );

    return this.mapRowToDTO(res.rows[0]);
  }

  /**
   * Cancel single index job (Phase 19 compliant)
   */
  public async cancelIndexJob(jobId: string, projectId: string): Promise<IndexJobDTO> {
    const jobCheck = await this.query(
      "SELECT status FROM index_jobs WHERE id = $1 AND project_id = $2 LIMIT 1;",
      [jobId, projectId]
    );
    if (jobCheck.rowCount === 0) {
      throw new NotFoundError(`Index job ${jobId} not found under project ${projectId}.`);
    }

    const currentStatus = jobCheck.rows[0].status;
    if (currentStatus === "completed" || currentStatus === "failed") {
      throw new Error(`Cannot cancel a job that has already finished. Status: ${currentStatus}`);
    }

    const res = await this.query(
      `UPDATE index_jobs
       SET status = 'cancelled',
           locked_by = NULL,
           locked_at = NULL,
           updated_at = NOW()
       WHERE id = $1 AND project_id = $2
       RETURNING *;`,
      [jobId, projectId]
    );

    await this.emitAuditLog(
      projectId,
      "system",
      "INDEX_JOB_CANCELLED",
      "authorized",
      { jobId },
      `Index job ${jobId} successfully cancelled.`
    );

    return this.mapRowToDTO(res.rows[0]);
  }

  /**
   * Reset attempts and status back to pending for manual retries (Phase 19 compliant)
   */
  public async retryFailedJob(jobId: string, projectId: string): Promise<IndexJobDTO> {
    const jobCheck = await this.query(
      "SELECT status, attempts, max_attempts FROM index_jobs WHERE id = $1 AND project_id = $2 LIMIT 1;",
      [jobId, projectId]
    );
    if (jobCheck.rowCount === 0) {
      throw new NotFoundError(`Index job ${jobId} not found under project ${projectId}.`);
    }

    const job = jobCheck.rows[0];
    if (job.attempts >= job.max_attempts) {
      throw new Error(`Cannot retry job ${jobId} manually because attempts (${job.attempts}) reaches maximum thresholds of ${job.max_attempts}.`);
    }

    const res = await this.query(
      `UPDATE index_jobs
       SET status = 'pending',
           locked_by = NULL,
           locked_at = NULL,
           attempts = 0,
           started_at = NULL,
           completed_at = NULL,
           failed_at = NULL,
           error_redacted = NULL,
           last_error = NULL,
           updated_at = NOW()
       WHERE id = $1 AND project_id = $2
       RETURNING *;`,
      [jobId, projectId]
    );

    await this.emitAuditLog(
      projectId,
      "system",
      "INDEX_JOB_RETRIED",
      "authorized",
      { jobId },
      `Index job ${jobId} manually retried, status reset to pending.`
    );

    return this.mapRowToDTO(res.rows[0]);
  }


  // ========================================================
  // BACKWARD-COMPATIBILITY METHOD ALIASES (FOR VALIDATION CHECKS)
  // ========================================================

  public async createJob(
    projectId: string,
    taskId: string | null,
    jobType: string,
    filePath: string | null = null,
    maxAttempts = 3,
    metadataJson: Record<string, any> = {}
  ): Promise<any> {
    const jobDto = await this.createIndexJob(projectId, {
      taskId,
      jobType: jobType as IndexJobType,
      requestedPaths: filePath ? [filePath] : null,
      maxAttempts,
      metadataJson
    });
    
    if (filePath) {
      await this.query(
        `UPDATE index_jobs SET file_path = $1 WHERE id = $2;`,
        [filePath, jobDto.id]
      );
    }
    
    return this.getIndexJob(jobDto.id, projectId);
  }

  public async getJob(jobId: string, projectId: string): Promise<any> {
    return this.getIndexJob(jobId, projectId);
  }

  public async updateJobStatus(
    jobId: string,
    projectId: string,
    status: 'completed' | 'failed' | 'running' | 'queued' | 'processing' | 'pending' | 'cancelled',
    errorMsg?: string,
    metadataJson?: Record<string, any>
  ): Promise<any> {
    let canonicalStatus = status as string;
    if (status === "queued" || status === "pending") {
      canonicalStatus = "pending";
    } else if (status === "running" || status === "processing") {
      canonicalStatus = "processing";
    }

    const jobCheck = await this.query(
      "SELECT * FROM index_jobs WHERE id = $1 AND project_id = $2 LIMIT 1;",
      [jobId, projectId]
    );
    if (jobCheck.rowCount === 0) {
      throw new NotFoundError(`Index job ${jobId} not found under project ${projectId}.`);
    }

    const job = jobCheck.rows[0];
    const newMetadata = { ...job.metadata_json, ...metadataJson };
    
    let lockBy = job.locked_by;
    let lockAt = job.locked_at;

    if (canonicalStatus === "completed" || canonicalStatus === "failed") {
      lockBy = null;
      lockAt = null;
    }

    const res = await this.query(
      `UPDATE index_jobs
       SET status = $1,
           last_error = $2,
           error_redacted = $2,
           locked_by = $3,
           locked_at = $4,
           metadata_json = $5,
           updated_at = NOW()
       WHERE id = $6 AND project_id = $7
       RETURNING *;`,
      [canonicalStatus, errorMsg || job.last_error, lockBy, lockAt, JSON.stringify(newMetadata), jobId, projectId]
    );

    const auditAction = canonicalStatus === "completed" ? "INDEX_JOB_COMPLETED" : 
                        canonicalStatus === "failed" ? "INDEX_JOB_FAILED" : 
                        canonicalStatus === "processing" ? "INDEX_JOB_PROCESSING" : 
                        "INDEX_JOB_CREATED";

    await this.emitAuditLog(
      projectId,
      job.locked_by || "system",
      auditAction,
      "authorized",
      { jobId, status: canonicalStatus, errorMsg },
      `Index job ${jobId} status transitioned to ${canonicalStatus}.`
    );

    return this.mapRowToDTO(res.rows[0]);
  }

  public async retryJob(jobId: string, projectId: string, errorMsg?: string): Promise<any> {
    return this.retryFailedJob(jobId, projectId);
  }

  public async cancelJob(jobId: string, projectId: string): Promise<any> {
    return this.cancelIndexJob(jobId, projectId);
  }

  /**
   * Release stale locks on jobs that are stuck in 'running' or 'processing' state
   */
  public async releaseStaleLocks(staleThresholdMs = 15 * 60 * 1000): Promise<{ releasedCount: number }> {
    const thresholdDate = new Date(Date.now() - staleThresholdMs);
    
    // Select running or processing stale jobs
    const staleCheck = await this.query(
      `SELECT id, project_id, status, attempts, max_attempts FROM index_jobs
       WHERE status IN ('running', 'processing') AND locked_at < $1;`,
      [thresholdDate]
    );

    let releasedCount = 0;

    for (const job of staleCheck.rows) {
      const isMaxAttempt = job.attempts >= job.max_attempts;
      
      // Maintain status naming tag style:
      // running -> completed / queued / failed
      // processing -> completed / pending / failed
      const nextStatus = isMaxAttempt 
        ? "failed" 
        : "pending";
        
      const errorMsg = isMaxAttempt 
        ? `Stale lock exceeded max attempts limit of ${job.max_attempts}. Hard failing job.`
        : `Stale lock timeout of ${staleThresholdMs}ms exceeded. Re-queuing job.`;

      await this.query(
        `UPDATE index_jobs
         SET status = $1,
             locked_by = NULL,
             locked_at = NULL,
             error_redacted = $2,
             last_error = $2,
             updated_at = NOW()
         WHERE id = $3;`,
         [nextStatus, errorMsg, job.id]
      );

      await this.emitAuditLog(
        job.project_id,
        "system",
        "INDEX_JOB_STALE_LOCK_RELEASED",
        "authorized",
        { jobId: job.id, nextStatus, isMaxAttempt },
        `Stale lock on job ${job.id} released. Status transitioned to ${nextStatus}.`
      );

      releasedCount++;
    }

    return { releasedCount };
  }
}
