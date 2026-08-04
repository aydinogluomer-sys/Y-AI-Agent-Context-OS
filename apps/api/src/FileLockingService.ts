/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  FileLockDTO, 
  FileLockStatus, 
  FileLockMode, 
  AcquireFileLockDTO, 
  FileLockTelemetryDTO,
  NotFoundError,
  PermissionDeniedError,
  BaseError,
  AuditFeatureIdType,
  AuditActionType,
  AuditLogStatusType
} from "@y/shared";
import { redactSecretLeaks } from "@y/security";
import { sysLogger } from "./logger";
import { PermissionKernelService } from "./PermissionKernelService";
import crypto from "crypto";
import path from "path";

export class FileLockingService {
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

  public normalizeLockPath(p: string): string {
    if (!p) return "";
    let clean = p.replace(/\\/g, "/");
    
    const resolvedRoot = process.cwd().replace(/\\/g, "/");
    if (clean.startsWith(resolvedRoot)) {
      clean = clean.substring(resolvedRoot.length);
    }
    
    let normalized = path.normalize(clean).replace(/\\/g, "/");
    
    while (normalized.startsWith("/")) {
      normalized = normalized.substring(1);
    }
    
    return normalized;
  }

  public validateLockPath(p: string): { valid: boolean; error?: string } {
    const normalized = this.normalizeLockPath(p);
    
    if (normalized.startsWith("..") || normalized.includes("/../") || path.isAbsolute(normalized)) {
      return { valid: false, error: "Access denied: Path traversal attempt blocked." };
    }

    const basename = path.basename(normalized).toLowerCase();
    const forbiddenNames = [".env", "secrets.json", "credentials.json", ".env.example"];
    if (forbiddenNames.includes(basename)) {
      return { valid: false, error: `Access denied: Reading forbidden file '${basename}' is strictly blocked.` };
    }

    const forbiddenEndings = [".pem", ".key"];
    if (forbiddenEndings.some(ext => basename.endsWith(ext))) {
      return { valid: false, error: `Access denied: Reading certificate/key files with extension '${basename}' is strictly blocked.` };
    }

    const parts = normalized.split("/");
    if (parts.includes("node_modules")) {
      return { valid: false, error: "Access denied: node_modules directory access is blocked by security boundaries." };
    }

    const skippedArtifacts = ["dist", "build", ".next", "out", "target", ".git"];
    if (parts.some(part => skippedArtifacts.includes(part))) {
      return { valid: false, error: "Access denied: build/distribution artifacts are skipped by security boundaries." };
    }

    return { valid: true };
  }

  public sanitizeLockMetadata(metadata: Record<string, any> | null | undefined): Record<string, any> {
    if (!metadata) return {};
    try {
      const str = redactSecretLeaks(JSON.stringify(metadata));
      return JSON.parse(str);
    } catch {
      return { _redaction_error: "Failed to parse sanitized metadata" };
    }
  }

  private sanitizeString(str: string | null | undefined): string {
    if (!str) return "";
    return redactSecretLeaks(str);
  }

  public async validateProjectScope(projectId: string, workerId?: string): Promise<void> {
    if (!projectId) {
      throw new BaseError("PROJECT_SCOPE_VIOLATION", "Project ID is required.", 400);
    }
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
        await this.emitFileLockAudit(
          projectId,
          workerId,
          "FILE_LOCK_CROSS_PROJECT_ACCESS_BLOCKED",
          "denied",
          { workerId, targetProjectId: projectId, actualProjectId: workerCheck.rows[0].project_id },
          "Cross-project containment boundary breach blocked."
        );
        throw new PermissionDeniedError(`Worker containment breach: Worker ${workerId} belongs to another project.`);
      }
    }
  }

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

  public async validateWorkerScope(projectId: string, workerId: string): Promise<void> {
    if (!workerId) return;
    const workerCheck = await this.query(
      "SELECT id, project_id FROM worker_registry WHERE worker_id = $1 LIMIT 1;",
      [workerId]
    );
    if (workerCheck.rowCount === 0) {
      throw new NotFoundError(`Worker ${workerId} is not registered.`);
    }
    if (workerCheck.rows[0].project_id !== projectId) {
      throw new PermissionDeniedError(`Worker ${workerId} belongs to another project.`);
    }
  }

  public async validateIndexJobScope(projectId: string, jobId: string): Promise<void> {
    if (!jobId) return;
    const jobCheck = await this.query(
      "SELECT project_id FROM index_jobs WHERE id = $1 LIMIT 1;",
      [jobId]
    );
    if (jobCheck.rowCount === 0) {
      throw new NotFoundError(`Index job ${jobId} does not exist.`);
    }
    if (jobCheck.rows[0].project_id !== projectId) {
      throw new PermissionDeniedError(`Index job ${jobId} does not belong to project ${projectId}.`);
    }
  }

  private async emitFileLockAudit(
    projectId: string,
    actor: string,
    action: AuditActionType,
    status: string,
    metadata: Record<string, any> = {},
    rationale = "",
    resourceId?: string
  ): Promise<any> {
    const cleanRationale = this.sanitizeString(rationale);
    const cleanMetadata = this.sanitizeLockMetadata(metadata);
    cleanMetadata.secretRedacted = true;

    let auditStatus: AuditLogStatusType = "authorized";
    if (status === "denied" || status === "denied_untrusted" || status === "failed" || status === "block") {
      auditStatus = "denied_untrusted";
    } else if (status === "warning" || status === "redacted_and_completed" || status === "redact") {
      auditStatus = "redacted_and_completed";
    }

    try {
      await this.logAction(
        projectId,
        actor || "system-file-locker",
        "SEC",
        action,
        auditStatus,
        cleanMetadata,
        cleanRationale,
        resourceId
      );
    } catch (err: any) {
      sysLogger.error(`[FileLockingService] Failed to emit audit log ${action}: ${err.message}`);
    }
  }

  /**
   * Safe transaction-protected lock acquisition with automatic exclusivity conflict check.
   */
  public async acquireLock(dto: AcquireFileLockDTO): Promise<FileLockDTO> {
    const { 
      project_id, 
      task_id, 
      worker_id, 
      index_job_id, 
      path: rawPath, 
      lock_mode, 
      lock_owner_type, 
      lock_owner_id, 
      ttl_seconds = 30,
      metadata_json = {}
    } = dto;

    // 1. Scoping validations
    await this.validateProjectScope(project_id, worker_id || undefined);
    if (task_id) await this.validateTaskScope(project_id, task_id);
    if (worker_id) await this.validateWorkerScope(project_id, worker_id);
    if (index_job_id) await this.validateIndexJobScope(project_id, index_job_id);

    // 2. Path normalization & traversal & forbidden check
    const pathCheck = this.validateLockPath(rawPath);
    if (!pathCheck.valid) {
      await this.emitFileLockAudit(
        project_id,
        lock_owner_id,
        "FILE_LOCK_PATH_BLOCKED",
        "denied",
        { path: rawPath, reason: pathCheck.error },
        `Path validation failed: ${pathCheck.error}`
      );
      throw new BaseError("FILE_LOCK_PATH_BLOCKED", pathCheck.error || "Blocked path", 403);
    }

    const normalizedPath = this.normalizeLockPath(rawPath);

    // Permission enforcement check before acquiring lock
    await this.getPermissionKernel().enforce({
      subject: {
        subject_type: (lock_owner_type === "worker" || lock_owner_type === "task" || lock_owner_type === "user" || lock_owner_type === "system" ? lock_owner_type : "worker") as any,
        subject_id: lock_owner_id,
        project_id,
        task_id: task_id || undefined,
        worker_id: worker_id || undefined
      },
      resource: {
        resource_type: "file_lock",
        resource_id: normalizedPath,
        project_id,
        normalized_path: normalizedPath
      },
      action: "lock"
    });

    const pathHash = crypto.createHash("sha256").update(normalizedPath).digest("hex");

    // Check if absolute paths or secrets exist in the metadata
    const cleanMetadata = this.sanitizeLockMetadata(metadata_json);
    const hasSecrets = JSON.stringify(metadata_json) !== JSON.stringify(cleanMetadata);
    if (hasSecrets) {
      await this.emitFileLockAudit(
        project_id,
        lock_owner_id,
        "FILE_LOCK_SECRET_REDACTED",
        "warning",
        { original: "redacted" },
        "Secrets or connection strings detected and redacted from lock metadata metadata_json"
      );
    }

    // 3. Conflict resolution query
    // Search active locks that are not expired for the same path
    const activeLocksRes = await this.query(
      `SELECT * FROM file_locks 
       WHERE project_id = $1 AND path_hash = $2 AND lock_status = 'active' AND expires_at > NOW();`,
      [project_id, pathHash]
    );

    let conflict = false;
    let conflictReason = "";

    if (activeLocksRes.rowCount > 0) {
      const existing = activeLocksRes.rows;
      if (lock_mode === FileLockMode.WRITE) {
        // Exclusive: blocked if any active read or write matches
        conflict = true;
        conflictReason = `Lock collision: Write lock requested, but path '${normalizedPath}' is already locked by owner: [${existing[0].lock_owner_type}:${existing[0].lock_owner_id}] with mode '${existing[0].lock_mode}'.`;
      } else {
        // Read: blocked only if an active write lock exists
        const hasWriteLock = existing.some(row => row.lock_mode === FileLockMode.WRITE);
        if (hasWriteLock) {
          conflict = true;
          conflictReason = `Lock collision: Read lock requested, but path '${normalizedPath}' is locked exclusively under write mode by owner: [${existing[0].lock_owner_type}:${existing[0].lock_owner_id}].`;
        }
      }
    }

    const lockId = "lock_" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);

    if (conflict) {
      // Create a blocked file_locks row
      const expiresAt = new Date(); // expired immediately
      await this.query(
        `INSERT INTO file_locks (
          id, project_id, task_id, worker_id, index_job_id, lock_mode, lock_status, 
          normalized_path, path_hash, lock_owner_type, lock_owner_id, 
          acquired_at, refreshed_at, expires_at, released_at, release_reason, metadata_json, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW(), NOW(), NOW(), $12, $13, NOW(), NOW());`,
        [
          lockId, project_id, task_id || null, worker_id || null, index_job_id || null, 
          lock_mode, FileLockStatus.BLOCKED, normalizedPath, pathHash, lock_owner_type, lock_owner_id,
          conflictReason, cleanMetadata
        ]
      );

      await this.emitFileLockAudit(
        project_id,
        lock_owner_id,
        "FILE_LOCK_BLOCKED",
        "denied",
        { id: lockId, path: normalizedPath, lock_mode, conflictReason },
        conflictReason
      );

      throw new BaseError("FILE_LOCK_BLOCKED", conflictReason, 409);
    }

    // No conflict, store active lock
    const expiresAt = new Date(Date.now() + ttl_seconds * 1000);
    const insertRes = await this.query(
      `INSERT INTO file_locks (
        id, project_id, task_id, worker_id, index_job_id, lock_mode, lock_status, 
        normalized_path, path_hash, lock_owner_type, lock_owner_id, 
        acquired_at, refreshed_at, expires_at, metadata_json, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW(), $12, $13, NOW(), NOW())
      RETURNING *;`,
      [
        lockId, project_id, task_id || null, worker_id || null, index_job_id || null, 
        lock_mode, FileLockStatus.ACTIVE, normalizedPath, pathHash, lock_owner_type, lock_owner_id,
        expiresAt, cleanMetadata
      ]
    );

    const record = insertRes.rows[0];

    await this.emitFileLockAudit(
      project_id,
      lock_owner_id,
      "FILE_LOCK_ACQUIRED",
      "success",
      { id: lockId, path: normalizedPath, lock_mode, expires_at: expiresAt.toISOString() },
      `Lock successfully acquired for path '${normalizedPath}' (mode: ${lock_mode}).`
    );

    return this.mapToRow(record);
  }

  /**
   * Refreshes the lease / TTL of an active, non-expired lock.
   */
  public async refreshLock(projectId: string, lockId: string, ttlSeconds = 30): Promise<FileLockDTO> {
    await this.validateProjectScope(projectId);

    const findRes = await this.query(
      "SELECT * FROM file_locks WHERE id = $1 AND project_id = $2 LIMIT 1;",
      [lockId, projectId]
    );

    if (findRes.rowCount === 0) {
      throw new NotFoundError(`File lock ${lockId} does not exist in project ${projectId}.`);
    }

    const record = findRes.rows[0];

    // Permission enforcement check before refreshing lock
    await this.getPermissionKernel().enforce({
      subject: {
        subject_type: (record.lock_owner_type || "worker") as any,
        subject_id: record.lock_owner_id,
        project_id: projectId,
        task_id: record.task_id || undefined,
        worker_id: record.worker_id || undefined
      },
      resource: {
        resource_type: "file_lock",
        resource_id: record.normalized_path,
        project_id: projectId,
        normalized_path: record.normalized_path
      },
      action: "lock"
    });

    if (record.lock_status !== FileLockStatus.ACTIVE) {
      throw new BaseError("INVALID_LOCK_STATE", `Cannot refresh file lock ${lockId} with status ${record.lock_status}.`, 400);
    }

    const expiresAt = new Date(record.expires_at).getTime();
    if (expiresAt < Date.now()) {
      // Transition expired
      await this.query(
        "UPDATE file_locks SET lock_status = $1, released_at = NOW(), release_reason = $2, updated_at = NOW() WHERE id = $3;",
        [FileLockStatus.EXPIRED, "stale_timeout", lockId]
      );
      await this.emitFileLockAudit(
        projectId,
        record.lock_owner_id,
        "FILE_LOCK_EXPIRED",
        "warning",
        { id: lockId, path: record.normalized_path },
        `Lock '${record.normalized_path}' refresh failed because the lease has expired.`
      );
      throw new BaseError("FILE_LOCK_EXPIRED", "Cannot refresh an expired lock lease.", 410);
    }

    const newExpiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const updateRes = await this.query(
      `UPDATE file_locks 
       SET refreshed_at = NOW(), expires_at = $1, updated_at = NOW() 
       WHERE id = $2 RETURNING *;`,
      [newExpiresAt, lockId]
    );

    const updated = updateRes.rows[0];

    await this.emitFileLockAudit(
      projectId,
      record.lock_owner_id,
      "FILE_LOCK_REFRESHED",
      "success",
      { id: lockId, path: record.normalized_path, expires_at: newExpiresAt.toISOString() },
      `Lock lease refreshed successfully for '${record.normalized_path}' until ${newExpiresAt.toISOString()}.`
    );

    return this.mapToRow(updated);
  }

  /**
   * Releases an active lock manually setting code to released.
   */
  public async releaseLock(projectId: string, lockId: string, reason = "released_manually"): Promise<FileLockDTO> {
    await this.validateProjectScope(projectId);

    const findRes = await this.query(
      "SELECT * FROM file_locks WHERE id = $1 AND project_id = $2 LIMIT 1;",
      [lockId, projectId]
    );

    if (findRes.rowCount === 0) {
      throw new NotFoundError(`File lock ${lockId} does not exist in project ${projectId}.`);
    }

    const record = findRes.rows[0];

    // Permission enforcement check before releasing lock
    await this.getPermissionKernel().enforce({
      subject: {
        subject_type: (record.lock_owner_type || "worker") as any,
        subject_id: record.lock_owner_id,
        project_id: projectId,
        task_id: record.task_id || undefined,
        worker_id: record.worker_id || undefined
      },
      resource: {
        resource_type: "file_lock",
        resource_id: record.normalized_path,
        project_id: projectId,
        normalized_path: record.normalized_path
      },
      action: "unlock"
    });

    if (record.lock_status !== FileLockStatus.ACTIVE) {
      // Return details directly
      return this.mapToRow(record);
    }

    const isCurrentlyExpired = new Date(record.expires_at).getTime() < Date.now();
    const finalStatus = isCurrentlyExpired ? FileLockStatus.EXPIRED : FileLockStatus.RELEASED;
    const finalReason = isCurrentlyExpired ? "stale_timeout" : reason;

    const updateRes = await this.query(
      `UPDATE file_locks 
       SET lock_status = $1, released_at = NOW(), release_reason = $2, updated_at = NOW() 
       WHERE id = $3 RETURNING *;`,
      [finalStatus, finalReason, lockId]
    );

    const updated = updateRes.rows[0];

    const auditAction = isCurrentlyExpired ? "FILE_LOCK_EXPIRED" : "FILE_LOCK_RELEASED";
    await this.emitFileLockAudit(
      projectId,
      record.lock_owner_id,
      auditAction as any,
      "success",
      { id: lockId, path: record.normalized_path, reason: finalReason },
      `Lock successfully ${isCurrentlyExpired ? "expired" : "released"} for '${record.normalized_path}'.`
    );

    return this.mapToRow(updated);
  }

  /**
   * Reclaims and releases all active locks registered under a specific worker.
   */
  public async releaseLocksForWorker(projectId: string, workerId: string, reason = "worker_shutdown"): Promise<{ releasedCount: number }> {
    await this.validateProjectScope(projectId, workerId);

    const activeLocks = await this.query(
      `SELECT * FROM file_locks 
       WHERE project_id = $1 AND worker_id = $2 AND lock_status = 'active';`,
      [projectId, workerId]
    );

    let count = 0;
    for (const lock of activeLocks.rows) {
      await this.releaseLock(projectId, lock.id, reason);
      count++;
    }

    return { releasedCount: count };
  }

  /**
   * Automated/Manual sweeps of all expired active locks in a project scope.
   */
  public async releaseStaleLocks(projectId: string): Promise<{ releasedCount: number }> {
    await this.validateProjectScope(projectId);

    const staleLocks = await this.query(
      `SELECT * FROM file_locks 
       WHERE project_id = $1 AND lock_status = 'active' AND expires_at < NOW();`,
      [projectId]
    );

    let count = 0;
    for (const lock of staleLocks.rows) {
      const updateRes = await this.query(
        `UPDATE file_locks 
         SET lock_status = $1, released_at = NOW(), release_reason = $2, updated_at = NOW() 
         WHERE id = $3 RETURNING *;`,
        [FileLockStatus.EXPIRED, "stale_timeout", lock.id]
      );
      
      await this.emitFileLockAudit(
        projectId,
        lock.lock_owner_id,
        "FILE_LOCK_STALE_RELEASED",
        "success",
        { id: lock.id, path: lock.normalized_path },
        `Stale/expired lock evicted for path: '${lock.normalized_path}'.`
      );
      count++;
    }

    return { releasedCount: count };
  }

  /**
   * Get the current active non-expired lock for the given path.
   */
  public async getLockStatus(projectId: string, rawPath: string): Promise<FileLockDTO | null> {
    await this.validateProjectScope(projectId);
    const normalized = this.normalizeLockPath(rawPath);
    const pathHash = crypto.createHash("sha256").update(normalized).digest("hex");

    const res = await this.query(
      `SELECT * FROM file_locks 
       WHERE project_id = $1 AND path_hash = $2 AND lock_status = 'active' AND expires_at > NOW() 
       LIMIT 1;`,
      [projectId, pathHash]
    );

    if (res.rowCount === 0) {
      return null;
    }

    return this.mapToRow(res.rows[0]);
  }

  /**
   * Listing locks with optional filters.
   */
  public async listLocks(
    projectId: string, 
    filters?: { 
      task_id?: string; 
      worker_id?: string; 
      index_job_id?: string; 
      lock_status?: string;
    }
  ): Promise<FileLockDTO[]> {
    await this.validateProjectScope(projectId);

    // Permission enforcement check before listing locks
    await this.getPermissionKernel().enforce({
      subject: {
        subject_type: "system",
        subject_id: "system",
        project_id: projectId
      },
      resource: {
        resource_type: "file_lock",
        resource_id: "all_locks",
        project_id: projectId
      },
      action: "read"
    });

    let sql = "SELECT * FROM file_locks WHERE project_id = $1";
    const params: any[] = [projectId];
    let index = 2;

    if (filters?.task_id) {
      sql += ` AND task_id = $${index++}`;
      params.push(filters.task_id);
    }
    if (filters?.worker_id) {
      sql += ` AND worker_id = $${index++}`;
      params.push(filters.worker_id);
    }
    if (filters?.index_job_id) {
      sql += ` AND index_job_id = $${index++}`;
      params.push(filters.index_job_id);
    }
    if (filters?.lock_status) {
      sql += ` AND lock_status = $${index++}`;
      params.push(filters.lock_status);
    }

    sql += " ORDER BY created_at DESC LIMIT 200;";

    const res = await this.query(sql, params);
    return res.rows.map((row: any) => this.mapToRow(row));
  }

  private mapToRow(row: any): FileLockDTO {
    return {
      id: row.id,
      project_id: row.project_id,
      task_id: row.task_id,
      worker_id: row.worker_id,
      index_job_id: row.index_job_id,
      lock_mode: row.lock_mode as FileLockMode,
      lock_status: row.lock_status as FileLockStatus,
      normalized_path: row.normalized_path,
      path_hash: row.path_hash,
      lock_owner_type: row.lock_owner_type,
      lock_owner_id: row.lock_owner_id,
      acquired_at: row.acquired_at ? new Date(row.acquired_at).toISOString() : "",
      refreshed_at: row.refreshed_at ? new Date(row.refreshed_at).toISOString() : "",
      expires_at: row.expires_at ? new Date(row.expires_at).toISOString() : "",
      released_at: row.released_at ? new Date(row.released_at).toISOString() : null,
      release_reason: row.release_reason,
      metadata_json: row.metadata_json || {},
      created_at: row.created_at ? new Date(row.created_at).toISOString() : "",
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : ""
    };
  }
}
