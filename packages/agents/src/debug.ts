/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DebugLogEntryDTO,
  DebugLogQueryDTO,
  DebugDiagnosisDTO,
  DebugStatusDTO,
  NotFoundError,
  PermissionDeniedError
} from "@y/shared";
import { redactSecretLeaks } from "@y/security";

export class AgentDebugService {
  // In-memory bounded ring buffers per project/task
  private static buffers = new Map<string, DebugLogEntryDTO[]>();
  private static MAX_BUFFER_SIZE = 500;

  constructor(private pool: any) {
    if (!pool) {
      throw new Error("A valid database connection pool is required for AgentDebugService.");
    }
  }

  private async query(sql: string, params: unknown[] = []): Promise<any> {
    return this.pool.query(sql, params);
  }

  /**
   * Validates if project exists and task exists under the project.
   */
  public async validateProjectAndTaskScope(projectId: string, taskId: string): Promise<void> {
    const safeProjectId = redactSecretLeaks(String(projectId || ""));
    const safeTaskId = redactSecretLeaks(String(taskId || ""));

    const projRes = await this.query("SELECT id FROM projects WHERE id = $1 LIMIT 1;", [projectId]);
    if (projRes.rowCount === 0) {
      throw new NotFoundError(`Project scope validation failed: Project ${safeProjectId} not found.`);
    }

    const taskRes = await this.query("SELECT id, project_id FROM tasks WHERE id = $1 LIMIT 1;", [taskId]);
    if (taskRes.rowCount === 0) {
      throw new NotFoundError(`Task scope validation failed: Task ${safeTaskId} not found.`);
    }

    if (taskRes.rows[0].project_id !== projectId) {
      // Create explicit cross project access blocked warning event in the database audit log for forensic logs
      await this.emitAuditLog(
        projectId,
        "System",
        "DEBUG_CROSS_PROJECT_ACCESS_BLOCKED",
        "blocked",
        { taskId, requestedProjectId: projectId, targetTaskId: taskId },
        `Cross-project debug stream access attempt was blocked.`
      );
      throw new PermissionDeniedError(`Permission denied: Task ${safeTaskId} does not belong to specified project.`);
    }
  }

  /**
   * Emits audit logs for DEBUG actions.
   */
  public async emitAuditLog(
    projectId: string,
    actor: string,
    action: string,
    status: string,
    metadata: Record<string, any> = {},
    rationale = "",
    resourceId = "",
    ipAddress = "127.0.0.1"
  ): Promise<void> {
    const logId = `audit_log_${Math.random().toString(36).substring(2, 11)}`;
    const cleanRationale = redactSecretLeaks(rationale);

    let cleanMetadata: Record<string, any> = {};
    try {
      const redactedStr = redactSecretLeaks(JSON.stringify(metadata));
      cleanMetadata = JSON.parse(redactedStr);
    } catch {
      cleanMetadata = { redaction_error: "Serialization error during metadata logging." };
    }

    try {
      await this.query(
        `INSERT INTO audit_logs (id, project_id, actor, feature_id, action, status, metadata, rationale, resource_id, ip_address, created_at)
         VALUES ($1, $2, $3, 'SEC', $4, $5, $6, $7, $8, $9, NOW());`,
        [
          logId,
          projectId || null,
          actor,
          action,
          status,
          JSON.stringify(cleanMetadata),
          cleanRationale || null,
          resourceId || null,
          ipAddress
        ]
      );
    } catch (err: any) {
      console.error(`AgentDebugService Audit Log emission failed: ${err.message}`);
    }
  }

  /**
   * Safe helper to process and redact keys and details recursively
   */
  private redactObjectRecursively(obj: any): any {
    if (!obj) return obj;
    if (typeof obj === "string") {
      return redactSecretLeaks(obj);
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.redactObjectRecursively(item));
    }
    if (typeof obj === "object") {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (/key|token|password|secret|cert|auth|db_encoding/i.test(key)) {
          result[key] = "[REDACTED_SECRET]";
        } else {
          result[key] = this.redactObjectRecursively(value);
        }
      }
      return result;
    }
    return obj;
  }

  /**
   * Appends to bounded log ring buffer
   */
  public async appendLog(
    projectId: string,
    taskId: string,
    level: "DEBUG" | "INFO" | "WARN" | "ERROR",
    message: string,
    source: string,
    markerTaskId?: string | null,
    metadata?: Record<string, any>
  ): Promise<DebugLogEntryDTO> {
    // Redact all inputs before processing or storing
    const redactedMsg = redactSecretLeaks(message || "");
    const wasRedacted = redactedMsg !== message;

    let cleanMetadata: Record<string, any> | undefined = undefined;
    if (metadata) {
      cleanMetadata = this.redactObjectRecursively(metadata);
    }

    // Parse [Y_DEBUG:TASK-ID] markers
    let finalMarker: string | null = markerTaskId || null;
    const match = redactedMsg.match(/\[Y_DEBUG:([a-zA-Z0-9_\-]+)\]/);
    if (match) {
      finalMarker = match[1];
    }

    const logEntry: DebugLogEntryDTO = {
      id: `diag_log_${Math.random().toString(36).substring(2, 11)}`,
      project_id: projectId,
      task_id: taskId,
      level,
      message: redactedMsg,
      source: source || "system",
      timestamp: new Date().toISOString(),
      marker_task_id: finalMarker,
      redacted: wasRedacted,
      metadata: cleanMetadata
    };

    const bufferKey = `${projectId}:${taskId}`;
    if (!AgentDebugService.buffers.has(bufferKey)) {
      AgentDebugService.buffers.set(bufferKey, []);
    }

    const buffer = AgentDebugService.buffers.get(bufferKey)!;
    if (buffer.length >= AgentDebugService.MAX_BUFFER_SIZE) {
      buffer.shift(); // Evict oldest
    }

    buffer.push(logEntry);

    // Emit standard audit logs for log appending actions
    await this.emitAuditLog(
      projectId,
      "System",
      "APPEND_DEBUG_LOG",
      "authorized",
      { taskId, level, source, marker_task_id: finalMarker },
      `Appended log entry to task debug stream.`
    );

    if (wasRedacted) {
      await this.emitAuditLog(
        projectId,
        "System",
        "DEBUG_SECRET_REDACTED",
        "authorized",
        { taskId },
        "Potential credential leak prevented and redacted inside debug signal entry append."
      );
    }

    return logEntry;
  }

  /**
   * Returns list of logs in the buffer filtered by levels, searches, offset, offset, limits, and since time
   */
  public async listLogs(
    projectId: string,
    taskId: string,
    query: DebugLogQueryDTO = {}
  ): Promise<DebugLogEntryDTO[]> {
    await this.validateProjectAndTaskScope(projectId, taskId);

    // Emit secure audit events for telemetry lookup
    await this.emitAuditLog(
      projectId,
      "System",
      "READ_DEBUG_LOGS",
      "authorized",
      { taskId, query },
      `Read debug logs stream requested for task ${taskId}`
    );

    const bufferKey = `${projectId}:${taskId}`;
    const buffer = AgentDebugService.buffers.get(bufferKey) || [];

    let filtered = [...buffer];

    // Level filter
    if (query.level) {
      filtered = filtered.filter(l => l.level === query.level);
    }

    // Search query text regex/index lookup
    if (query.search) {
      const searchLower = query.search.toLowerCase();
      filtered = filtered.filter(l =>
        l.message.toLowerCase().includes(searchLower) ||
        l.source.toLowerCase().includes(searchLower)
      );
    }

    // Since filter (timestamp string check)
    if (query.since) {
      const sinceTime = new Date(query.since).getTime();
      filtered = filtered.filter(l => new Date(l.timestamp).getTime() >= sinceTime);
    }

    // Sort: Chronological as standard (older first, like a real stream)
    // No sorting change needed since buffer maintains insertion order.

    // Limit & offset pagination
    const offset = query.offset || 0;
    const limit = query.limit !== undefined ? query.limit : 1000;
    return filtered.slice(offset, offset + limit);
  }

  /**
   * Clears the log buffer for project/task
   */
  public async clearLogs(projectId: string, taskId: string): Promise<void> {
    await this.validateProjectAndTaskScope(projectId, taskId);

    // Emit secure audit events for logging actions clearance
    await this.emitAuditLog(
      projectId,
      "System",
      "CLEAR_DEBUG_LOGS",
      "authorized",
      { taskId },
      `Cleared all debug log buffer lines for task ${taskId}`
    );

    const bufferKey = `${projectId}:${taskId}`;
    AgentDebugService.buffers.delete(bufferKey);
  }

  /**
   * Gets debug system status/telemetry
   */
  public async getStatus(projectId: string): Promise<DebugStatusDTO> {
    // Validate project scope
    const projRes = await this.query("SELECT id FROM projects WHERE id = $1 LIMIT 1;", [projectId]);
    if (projRes.rowCount === 0) {
      throw new NotFoundError(`Project scope validation failed: Project ${projectId} not found.`);
    }

    // Calculate buffer sizes for tasks of this project
    let currentBufferSize = 0;
    let lastLogAt: string | null = null;
    const levels_count: Record<string, number> = { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0 };

    for (const [key, buffer] of AgentDebugService.buffers.entries()) {
      if (key.startsWith(`${projectId}:`)) {
        currentBufferSize += buffer.length;
        for (const entry of buffer) {
          levels_count[entry.level] = (levels_count[entry.level] || 0) + 1;
          if (!lastLogAt || new Date(entry.timestamp).getTime() > new Date(lastLogAt).getTime()) {
            lastLogAt = entry.timestamp;
          }
        }
      }
    }

    return {
      project_id: projectId,
      buffer_size: currentBufferSize,
      max_buffer_size: AgentDebugService.MAX_BUFFER_SIZE,
      levels_count,
      last_log_at: lastLogAt,
      redaction_enabled: true,
      healthy: true
    };
  }

  /**
   * Deterministic diagnosis generator based strictly on local evidence
   */
  public async diagnoseLogs(projectId: string, taskId: string): Promise<DebugDiagnosisDTO> {
    await this.validateProjectAndTaskScope(projectId, taskId);

    // Emit secure audit events for diagnostic executions
    await this.emitAuditLog(
      projectId,
      "System",
      "EXECUTE_BUG_DIAGNOSIS",
      "authorized",
      { taskId },
      `Executed deterministic local heuristics diagnostic check for task ${taskId}`
    );

    const bufferKey = `${projectId}:${taskId}`;
    const logs = AgentDebugService.buffers.get(bufferKey) || [];

    const evidenceRefs: string[] = [];
    const affectedFilesSet = new Set<string>();
    const warnings: string[] = [];

    // Common warnings
    warnings.push("Event Store is missing; audit_logs are currently used instead for projection.");
    warnings.push("Evidence Store is missing/partial; proof assertions remain unsigned.");

    if (logs.length === 0) {
      warnings.push("Low evidence warning: Log buffer is empty. Unable to analyze diagnostics cleanly.");
      return {
        project_id: projectId,
        task_id: taskId,
        root_cause: "No diagnostic error markers detected. Task logs are empty.",
        impact_analysis: "Unable to measure system impacts since no trace inputs are present in current stream buffer.",
        remedial_strategy: "Trigger system commands or execute developer utilities while capturing output logs into active stream buffer before diagnose execution.",
        confidence: 0.40,
        evidence_refs: [],
        affected_files: [],
        warnings,
        generated_at: new Date().toISOString()
      };
    }

    // Collect error lines and look for file paths
    let hasCompilationError = false;
    let hasPermissionDenied = false;
    let hasDatabaseCertError = false;
    let hasSecretLeakError = false;

    // Scan logs to classify error signatures
    for (const log of logs) {
      const msg = log.message.toLowerCase();

      // Look for paths like packages/... or apps/... or src/... in message
      const pathRegex = /(?:apps|packages|src|scripts)\/[a-zA-Z0-9_\-\./]+\.[a-zA-Z0-9]+/gi;
      let m;
      while ((m = pathRegex.exec(log.message)) !== null) {
        let cleanPath = m[0];
        // Clean trailing symbols
        cleanPath = cleanPath.replace(/[^a-zA-Z0-9_\-\./]/g, "");
        if (cleanPath.includes(".")) {
          affectedFilesSet.add(cleanPath);
        }
      }

      if (log.level === "ERROR" || log.level === "WARN") {
        if (msg.includes("compilation") || msg.includes("compile") || msg.includes("typescript") || msg.includes("syntax error") || msg.includes("tsc --noemit") || msg.includes("not found")) {
          hasCompilationError = true;
          evidenceRefs.push(log.id);
        } else if (msg.includes("permission denied") || msg.includes("unauthorized") || msg.includes("scope validation failed") || msg.includes("cross-project")) {
          hasPermissionDenied = true;
          evidenceRefs.push(log.id);
        } else if (msg.includes("connection failed") || msg.includes("tenant or user not found") || msg.includes("postgres connection") || msg.includes("database_url") || msg.includes("supabase")) {
          hasDatabaseCertError = true;
          evidenceRefs.push(log.id);
        } else if (msg.includes("secret leak") || msg.includes("potential api key or secret leak prevented") || msg.includes("redacted_secret")) {
          hasSecretLeakError = true;
          evidenceRefs.push(log.id);
        }
      }
    }

    // Build diagnosis heuristics
    let rootCause = "";
    let impactAnalysis = "";
    let remedialStrategy = "";
    let confidence = 0.50; // default medium-low confidence

    if (hasCompilationError) {
      rootCause = "TypeScript typecheck or compilation syntax error detected during build operations.";
      impactAnalysis = "Blocks production compilation and prevents live deployment pipelines from establishing success.";
      remedialStrategy = "Run 'pnpm typecheck' or 'pnpm lint' locally to retrieve line reference details, resolve mismatched imports, and fix missing type arguments.";
      confidence = 0.90;
    } else if (hasPermissionDenied) {
      rootCause = "Resource boundary violation or context project/task scope validation rejection.";
      impactAnalysis = "Restricts the developer from querying data assets belonging to isolated project scopes.";
      remedialStrategy = "Verify the authorization membership records of the acting system, and confirm that project scope references match targeted parameters strictly.";
      confidence = 0.85;
    } else if (hasDatabaseCertError) {
      rootCause = "Postgres connection or secure database SSL/certificate validation fault.";
      impactAnalysis = "Prevents robust database schema modifications and stops transactional query executions from succeeding.";
      remedialStrategy = "Confirm SUPABASE_CA_CERT_BASE64 values are configured, verify pooling host links conform to TLS requirements, and check direct connection fallback capabilities.";
      confidence = 0.95;
    } else if (hasSecretLeakError) {
      rootCause = "Security credential exposure prevention trigger.";
      impactAnalysis = "Prevents execution outputs from printing naked secret passwords, API keys, or long authentication token hashes.";
      remedialStrategy = "Inject explicit secrets only through authorized environments or .env properties, and confirm all output strings pass through recursive redactSecretLeaks pipelines.";
      confidence = 0.88;
    } else {
      // Find generic error
      const errorLogs = logs.filter(l => l.level === "ERROR" || l.level === "WARN");
      if (errorLogs.length > 0) {
        rootCause = "Generic anomalous signature detected inside stream runtime error logs.";
        impactAnalysis = "May provoke unexpected workflow pauses or unstable intermediate execution states.";
        remedialStrategy = "Review the captured logs in sequence, inspect relevant files connected with the task, and investigate the affected areas.";
        confidence = 0.60;
        evidenceRefs.push(...errorLogs.map(l => l.id).slice(0, 3));
      } else {
        rootCause = "No active error or warning telemetry signals are registered inside current bounded buffer.";
        impactAnalysis = "System appears functionally stable within the visible parameters of current log buffer.";
        remedialStrategy = "Capture real-time logs from compiler outputs or console diagnostics during error runs to obtain actionable diagnostic traces.";
        confidence = 0.55;
      }
    }

    // Evidence checks for warnings
    if (evidenceRefs.length < 2) {
      warnings.push("Low evidence warning: Fewer than two distinct error/warning logs found to support the classified diagnosis.");
      confidence = Math.max(0.40, confidence - 0.20);
    }

    return {
      project_id: projectId,
      task_id: taskId,
      root_cause: rootCause,
      impact_analysis: impactAnalysis,
      remedial_strategy: remedialStrategy,
      confidence,
      evidence_refs: evidenceRefs,
      affected_files: Array.from(affectedFilesSet),
      warnings,
      generated_at: new Date().toISOString()
    };
  }
}
