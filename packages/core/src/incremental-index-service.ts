/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  NotFoundError, 
  PermissionDeniedError, 
  ContextBoundaryViolationError,
  IncrementalIndexEventDTO,
  IncrementalIndexStatusDTO,
  CreateIncrementalIndexEventDTO,
  IndexJobDTO,
  ChangeKind
} from "@y/shared";
import { redactSecretLeaks } from "@y/security";
import { RepoAdapterService } from "./repo-adapter-service";
import { IndexJobService } from "./index-job-service";
import crypto from "crypto";

export class IncrementalIndexService {
  constructor(
    private pool: any,
    private repoAdapterService: RepoAdapterService,
    private indexJobService: IndexJobService
  ) {
    if (!pool) {
      throw new Error("A valid database connection pool is required for IncrementalIndexService.");
    }
  }

  private async query(sql: string, params: unknown[] = []): Promise<any> {
    return this.pool.query(sql, params);
  }

  /**
   * Helper to map database rows to IncrementalIndexEventDTO
   */
  public mapRowToDTO(row: any): IncrementalIndexEventDTO {
    return {
      id: row.id,
      project_id: row.project_id,
      task_id: row.task_id,
      event_type: "incremental_file_change",
      path: row.path_redacted,
      normalized_path: row.normalized_path_redacted,
      hash_before: row.file_hash_before,
      hash_after: row.file_hash_after,
      change_kind: row.change_kind as ChangeKind,
      adapter_kind: row.adapter_kind,
      detected_at: row.detected_at ? new Date(row.detected_at).toISOString() : "",
      warnings: row.warnings_json || [],
      metadata: row.metadata_json || {}
    };
  }

  /**
   * Emits core audit logs with strict redaction.
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
    
    // Check and redact metadata
    const rawMetaStr = JSON.stringify(metadata);
    const redMetaStr = redactSecretLeaks(rawMetaStr);
    let redactedMetadata: Record<string, any>;
    try {
      redactedMetadata = JSON.parse(redMetaStr);
    } catch {
      redactedMetadata = { redacted: true };
    }

    const isSecretInMetadata = rawMetaStr !== redMetaStr;
    const isSecretInRationale = rationale !== cleanRationale;

    if ((isSecretInMetadata || isSecretInRationale) && action !== "INCREMENTAL_INDEX_SECRET_REDACTED") {
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
            "INCREMENTAL_INDEX_SECRET_REDACTED",
            "authorized",
            JSON.stringify({ originalAction: action, secretInMetadata: isSecretInMetadata, secretInRationale: isSecretInRationale }),
            "Secret signature detected and redacted in incremental indexing audit log.",
            metadata?.eventId || resourceId
          ]
        );
      } catch (err: any) {
        console.error(`[IncrementalIndexService] Failed to emit INCREMENTAL_INDEX_SECRET_REDACTED log: ${err.message}`);
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
      console.error(`[IncrementalIndexService] Failed to emit audit log ${action}: ${err.message}`);
    }
  }

  /**
   * 1. Register or trigger manual/received file change signal
   */
  public async createIncrementalIndexEvent(
    projectId: string,
    req: CreateIncrementalIndexEventDTO
  ): Promise<IncrementalIndexEventDTO> {
    // Validate project scope
    const projRes = await this.query("SELECT id FROM projects WHERE id = $1 LIMIT 1;", [projectId]);
    if (projRes.rowCount === 0) {
      throw new NotFoundError(`Project scope validation failed: Project ${projectId} not found.`);
    }

    // Validate task if provided
    if (req.task_id) {
      const taskRes = await this.query("SELECT id, project_id FROM tasks WHERE id = $1 LIMIT 1;", [req.task_id]);
      if (taskRes.rowCount === 0) {
        throw new NotFoundError(`Task scope validation failed: Task ${req.task_id} not found.`);
      }
      if (taskRes.rows[0].project_id !== projectId) {
        throw new PermissionDeniedError(`Permission denied: Task ${req.task_id} does not belong to specified project.`);
      }
    }

    const adapter = await this.repoAdapterService.getAdapterForProject(projectId);
    const adapterKind = (adapter as any).constructor.name;

    const rawPath = req.path;
    const cleanPath = redactSecretLeaks(rawPath);
    let normalizedPath = cleanPath;
    if (typeof (adapter as any).normalizePath === "function") {
      normalizedPath = (adapter as any).normalizePath(cleanPath);
    }

    // Route every path through RepoAdapter validation
    const pathVal = adapter.validatePath(normalizedPath);
    if (!pathVal.valid) {
      const isTraversal = pathVal.error?.includes("traversal");
      const auditAction = isTraversal 
        ? "INCREMENTAL_INDEX_CROSS_PROJECT_ACCESS_BLOCKED" 
        : "INCREMENTAL_INDEX_PATH_BLOCKED";

      await this.emitAuditLog(
        projectId,
        "system",
        auditAction,
        "denied",
        { path: rawPath, normalizedPath, error: pathVal.error },
        `Path traversal or boundary violation blocked: ${pathVal.error || "Access denied"}`
      );

      if (pathVal.error?.includes("forbidden") || pathVal.error?.includes("credential") || pathVal.error?.includes("env")) {
        // Emit explicit forbidden audit log
        await this.emitAuditLog(
          projectId,
          "system",
          "INCREMENTAL_INDEX_FORBIDDEN_FILE_BLOCKED",
          "denied",
          { path: rawPath, error: pathVal.error },
          `Access to forbidden credential/env file blocked: ${normalizedPath}`
        );
      }

      throw new ContextBoundaryViolationError(`Path validation failed: ${pathVal.error || "Blocked path traversal."}`);
    }

    // Debounce duplicate events for the same path within the last 1500ms
    const recentRes = await this.query(
      `SELECT id, index_job_id, change_kind, detected_at, file_hash_after, metadata_json, warnings_json 
       FROM incremental_index_events 
       WHERE project_id = $1 AND normalized_path_redacted = $2 AND detected_at >= NOW() - INTERVAL '1500 milliseconds'
       ORDER BY detected_at DESC LIMIT 1;`,
      [projectId, normalizedPath]
    );

    if (recentRes.rowCount > 0) {
      const recent = recentRes.rows[0];
      // Skip queueing another job, but return mapped existing event
      return {
        id: recent.id,
        project_id: projectId,
        task_id: req.task_id || null,
        event_type: "incremental_file_change",
        path: normalizedPath,
        normalized_path: normalizedPath,
        hash_before: null,
        hash_after: recent.file_hash_after,
        change_kind: recent.change_kind as ChangeKind,
        adapter_kind: adapterKind,
        detected_at: new Date(recent.detected_at).toISOString(),
        warnings: recent.warnings_json || ["Event debounced naturally."],
        metadata: { ...recent.metadata_json, debounced: true }
      };
    }

    // Compute bezpieczny hash through RepoAdapter
    let hashAfter: string | null = null;
    const warnings: string[] = [];

    if (req.change_kind !== "deleted") {
      try {
        const hashRes = await adapter.getFileHash(normalizedPath);
        if (hashRes.ok && hashRes.data) {
          hashAfter = hashRes.data;
        } else {
          warnings.push(hashRes.warnings?.[0] || hashRes.errors?.[0] || "Failed to compute file hash.");
        }
      } catch (err: any) {
        warnings.push(`Hash resolution exception: ${err.message}`);
      }
    }

    // Retrieve last hash for hash_before comparison
    let hashBefore: string | null = null;
    const prevRes = await this.query(
      `SELECT file_hash_after FROM incremental_index_events 
       WHERE project_id = $1 AND normalized_path_redacted = $2
       ORDER BY detected_at DESC LIMIT 1;`,
      [projectId, normalizedPath]
    );
    if (prevRes.rowCount > 0 && prevRes.rows[0].file_hash_after) {
      hashBefore = prevRes.rows[0].file_hash_after;
    }

    // Sanitize metadata
    const rawMetadata = req.metadata || {};
    const sanitizedMetadata = redactSecretLeaks(JSON.stringify(rawMetadata));
    let metadataJson: Record<string, any> = {};
    try {
      metadataJson = JSON.parse(sanitizedMetadata);
    } catch {
      metadataJson = { redacted: true };
    }

    const eventId = `event_${Math.random().toString(36).substring(2, 11)}`;

    // Enqueue bound index_jobs through our IndexJobService
    let indexJobId: string | null = null;
    try {
      const job = await this.indexJobService.createIndexJob(projectId, {
        taskId: req.task_id,
        jobType: "file_delta_scan",
        priority: "medium",
        adapterKind: adapterKind === "LocalFilesystemRepoAdapter" ? "local" : "github",
        rootPathRedacted: "/",
        requestedPaths: [normalizedPath],
        maxAttempts: 3,
        metadataJson: {
          triggeredByEvent: eventId,
          changeKind: req.change_kind,
          path: normalizedPath
        }
      });
      indexJobId = job.id;

      await this.emitAuditLog(
        projectId,
        "system",
        "INCREMENTAL_INDEX_JOB_ENQUEUED",
        "authorized",
        { eventId, indexJobId, path: normalizedPath },
        `Successfully enqueued index job ${indexJobId} for file delta change on path: ${normalizedPath}`
      );
    } catch (jobErr: any) {
      warnings.push(`Failed to enqueue index jobs automatically: ${jobErr.message}`);
    }

    // Persist event in DB
    await this.query(
      `INSERT INTO incremental_index_events (
        id, project_id, task_id, adapter_kind, path_redacted, normalized_path_redacted, 
        file_hash_before, file_hash_after, change_kind, index_job_id, warnings_json, metadata_json, detected_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW());`,
      [
        eventId,
        projectId,
        req.task_id || null,
        adapterKind,
        normalizedPath,
        normalizedPath,
        hashBefore,
        hashAfter,
        req.change_kind,
        indexJobId,
        JSON.stringify(warnings),
        JSON.stringify(metadataJson)
      ]
    );

    await this.emitAuditLog(
      projectId,
      "system",
      "INCREMENTAL_INDEX_EVENT_CREATED",
      "authorized",
      { eventId, path: normalizedPath, changeKind: req.change_kind, hashAfter },
      `Recorded file change incremental event for ${normalizedPath} (${req.change_kind})`
    );

    return {
      id: eventId,
      project_id: projectId,
      task_id: req.task_id || null,
      event_type: "incremental_file_change",
      path: normalizedPath,
      normalized_path: normalizedPath,
      hash_before: hashBefore,
      hash_after: hashAfter,
      change_kind: req.change_kind,
      adapter_kind: adapterKind,
      index_job_id: indexJobId,
      detected_at: new Date().toISOString(),
      warnings,
      metadata: metadataJson
    };
  }

  /**
   * 2. Read full status and settings
   */
  public async getIncrementalIndexStatus(projectId: string): Promise<IncrementalIndexStatusDTO> {
    const projRes = await this.query("SELECT id FROM projects WHERE id = $1 LIMIT 1;", [projectId]);
    if (projRes.rowCount === 0) {
      throw new NotFoundError(`Project focus validation failed: Project ${projectId} not found.`);
    }

    // Count pending events
    const countRes = await this.query(
      `SELECT COUNT(*)::integer as total FROM incremental_index_events 
       WHERE project_id = $1 AND index_job_id IS NOT NULL;`,
      [projectId]
    );

    // Get latest event
    const latestRes = await this.query(
      `SELECT detected_at, index_job_id FROM incremental_index_events 
       WHERE project_id = $1 
       ORDER BY detected_at DESC LIMIT 1;`,
      [projectId]
    );

    const hasWatcherEnabled = process.env.ENABLE_INCREMENTAL_WATCHER === "true";

    return {
      project_id: projectId,
      enabled: true, // Core incremental is enabled, background daemon depends on env
      watched_roots: [hasWatcherEnabled ? "." : "manual-only/reindex-triggers"],
      excluded_patterns: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.next/**"],
      debounce_ms: 1500,
      pending_events: countRes.rows[0]?.total || 0,
      last_event_at: latestRes.rowCount > 0 ? new Date(latestRes.rows[0].detected_at).toISOString() : null,
      last_job_id: latestRes.rowCount > 0 ? latestRes.rows[0].index_job_id : null,
      healthy: true,
      warnings: hasWatcherEnabled ? [] : ["Native file-system watch daemon is in sleep mode. Manual polling UI active."]
    };
  }

  /**
   * 3. List recent tracked events
   */
  public async listIncrementalIndexEvents(projectId: string): Promise<IncrementalIndexEventDTO[]> {
    const projRes = await this.query("SELECT id FROM projects WHERE id = $1 LIMIT 1;", [projectId]);
    if (projRes.rowCount === 0) {
      throw new NotFoundError(`Project focus validation failed: Project ${projectId} not found.`);
    }

    const res = await this.query(
      `SELECT * FROM incremental_index_events 
       WHERE project_id = $1 
       ORDER BY detected_at DESC LIMIT 100;`,
      [projectId]
    );

    return res.rows.map((row: any) => this.mapRowToDTO(row));
  }

  /**
   * 4. Scan a specific safe single path manually
   */
  public async scanPath(projectId: string, p: string, taskId?: string | null): Promise<IncrementalIndexEventDTO> {
    return this.createIncrementalIndexEvent(projectId, {
      project_id: projectId,
      task_id: taskId,
      path: p,
      change_kind: "modified"
    });
  }

  /**
   * 5. Run full/delta reindexing queue batch
   */
  public async rebuildDelta(projectId: string, taskId?: string | null): Promise<IndexJobDTO> {
    const projRes = await this.query("SELECT id FROM projects WHERE id = $1 LIMIT 1;", [projectId]);
    if (projRes.rowCount === 0) {
      throw new NotFoundError(`Project focus validation failed: Project ${projectId} not found.`);
    }

    const job = await this.indexJobService.createIndexJob(projectId, {
      taskId: taskId || null,
      jobType: "context_reindex",
      priority: "high",
      adapterKind: "local",
      rootPathRedacted: "/",
      requestedPaths: ["*"],
      maxAttempts: 3,
      metadataJson: {
        rebuildType: "delta_full_rebuild",
        triggered_at: new Date().toISOString()
      }
    });

    await this.emitAuditLog(
      projectId,
      "system",
      "INCREMENTAL_INDEX_JOB_ENQUEUED",
      "authorized",
      { rebuildJobId: job.id },
      `Enqueued whole project context reindex job ${job.id}`
    );

    return job;
  }
}
