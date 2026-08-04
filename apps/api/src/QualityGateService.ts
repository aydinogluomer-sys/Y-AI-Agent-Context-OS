/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  QualityGateRunDTO,
  QualityGateRunStatus,
  QualityGateCommandType,
  QualityGateCommandResultDTO,
  CreateQualityGateRunDTO,
  IngestQualityGateCommandDTO,
  AuditFeatureIdType,
  AuditActionType,
  AuditLogStatusType,
  ConflictError,
  NotFoundError,
  PermissionDeniedError
} from "@y/shared";
import { redactSecretLeaks } from "@y/security";
import crypto from "crypto";
import { sysLogger } from "./logger";

export function sanitizeCommandOutput(output: string): string {
  if (!output) return "";
  
  // 1. Redact certificates (PEM / X509 signatures)
  let redacted = output.replace(/-----BEGIN[A-Z\s]*CERTIFICATE-----(?:[A-Za-z0-9+/=\s\r\n]+)-----END[A-Z\s]*CERTIFICATE-----/g, "[REDACTED_CERTIFICATE]");
  
  // 2. Use security module to redact DATABASE_URl, postgres passwords, API keys, bearer tokens
  redacted = redactSecretLeaks(redacted);
  
  // 3. Redact absolute local paths where appropriate, replacing common workspaces with standard dot-relatives
  redacted = redacted.replace(/(?:\/[a-zA-Z0-9_\-\.]+)+\/(apps|packages|src|node_modules|dist)\//g, "./$1/");
  redacted = redacted.replace(/(?:[a-zA-Z]:\\(?:[a-zA-Z0-9_\-\.]+\\)*)(apps|packages|src|node_modules|dist)\\/g, ".\\$1\\");
  
  // 4. Truncate to keep the last 100 lines AND max 50KB
  const lines = redacted.split("\n");
  let truncatedLines = lines;
  if (lines.length > 100) {
    truncatedLines = lines.slice(-100);
  }
  
  let result = truncatedLines.join("\n");
  if (result.length > 50000) {
    result = "...[TRUNCATED FROM FRONT]...\n" + result.slice(-50000);
  }
  return result;
}

export class QualityGateService {
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
    ) => Promise<any>
  ) {}

  /**
   * Helper to validate project exists using parameterized SQL query
   */
  public async validateProjectScope(projectId: string): Promise<void> {
    const res = await this.query("SELECT id FROM projects WHERE id = $1 LIMIT 1;", [projectId]);
    if (res.rowCount === 0) {
      throw new NotFoundError(`Project scope validation failed: Project ${projectId} not found.`);
    }
  }

  /**
   * Helper to validate task exists and belongs to project
   */
  public async validateTaskScope(projectId: string, taskId: string): Promise<void> {
    const res = await this.query("SELECT id, project_id FROM tasks WHERE id = $1 LIMIT 1;", [taskId]);
    if (res.rowCount === 0) {
      throw new NotFoundError(`Task scope validation failed: Task ${taskId} not found.`);
    }
    if (res.rows[0].project_id !== projectId) {
      throw new PermissionDeniedError(`Task scope boundaries violation: Task does not belong to Project ${projectId}.`);
    }
  }

  /**
   * Safe audit log emitting with secrets redacted
   */
  public async emitQualityGateAudit(
    projectId: string,
    action: AuditActionType,
    status: AuditLogStatusType,
    metadata: Record<string, any>,
    rationale: string,
    resourceId?: string
  ): Promise<void> {
    try {
      // Redact metadata and rationale
      const cleanRationale = redactSecretLeaks(rationale);
      const serializedMeta = redactSecretLeaks(JSON.stringify(metadata));
      const cleanMeta = JSON.parse(serializedMeta);

      await this.logAction(
        projectId,
        "human-operator",
        "CORE", // Feature ID
        action,
        status,
        cleanMeta,
        cleanRationale,
        resourceId,
        "127.0.0.1"
      );
    } catch (err: any) {
      sysLogger.error(`Failed to emit quality gate audit log: ${err.message}`);
    }
  }

  /**
   * Redact sensitive details from Gate metadata payload
   */
  private redactGateMetadata(metadata: Record<string, any> | null | undefined): Record<string, any> {
    if (!metadata) return {};
    try {
      const serialized = JSON.stringify(metadata);
      const redactedStr = redactSecretLeaks(serialized);
      return JSON.parse(redactedStr);
    } catch {
      return {};
    }
  }

  /**
   * Create a new manual Quality Gate Run
   */
  public async createRun(dto: CreateQualityGateRunDTO): Promise<QualityGateRunDTO> {
    await this.validateProjectScope(dto.project_id);
    if (dto.task_id) {
      await this.validateTaskScope(dto.project_id, dto.task_id);
    }

    const runId = `qrun_${crypto.randomBytes(8).toString("hex")}`;
    const cleanMetadata = this.redactGateMetadata(dto.metadata);
    const initialStatus = QualityGateRunStatus.PENDING;

    await this.query(
      `INSERT INTO quality_gate_runs 
        (id, project_id, task_id, feature_id, status, run_by, metadata_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW());`,
      [
        runId,
        dto.project_id,
        dto.task_id || null,
        dto.feature_id || null,
        initialStatus,
        dto.run_by ? redactSecretLeaks(dto.run_by) : "manual_orchestrator",
        JSON.stringify(cleanMetadata)
      ]
    );

    await this.emitQualityGateAudit(
      dto.project_id,
      "QUALITY_GATE_RUN_CREATED",
      "authorized",
      { run_id: runId, task_id: dto.task_id, feature_id: dto.feature_id },
      `Created manual quality gate run ${runId} in project ${dto.project_id}.`,
      runId
    );

    return this.getRun(dto.project_id, runId, dto.task_id || undefined);
  }

  /**
   * Retrieve details of a Quality Gate Run with scope validation
   */
  public async getRun(projectId: string, runId: string, taskId?: string): Promise<QualityGateRunDTO> {
    const res = await this.query(
      "SELECT * FROM quality_gate_runs WHERE id = $1 AND project_id = $2 LIMIT 1;",
      [runId, projectId]
    );

    if (res.rowCount === 0) {
      throw new NotFoundError(`Quality gate run ${runId} not found in project ${projectId}.`);
    }

    const row = res.rows[0];

    if (taskId && row.task_id !== taskId) {
      throw new PermissionDeniedError(`Quality gate run task boundary violation.`);
    }

    return {
      id: row.id,
      project_id: row.project_id,
      task_id: row.task_id,
      feature_id: row.feature_id,
      status: row.status as QualityGateRunStatus,
      run_by: row.run_by,
      started_at: row.started_at ? row.started_at.toISOString() : null,
      completed_at: row.completed_at ? row.completed_at.toISOString() : null,
      summary_output: row.summary_output,
      metadata: row.metadata_json || {},
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString()
    };
  }

  /**
   * List all Quality Gate Runs for project, filtered by taskId if supplied
   */
  public async listRuns(projectId: string, taskId?: string): Promise<QualityGateRunDTO[]> {
    await this.validateProjectScope(projectId);
    if (taskId) {
      await this.validateTaskScope(projectId, taskId);
    }

    let sql = "SELECT * FROM quality_gate_runs WHERE project_id = $1";
    let params: any[] = [projectId];

    if (taskId) {
      sql += " AND task_id = $2";
      params.push(taskId);
    }

    sql += " ORDER BY created_at DESC;";

    const res = await this.query(sql, params);
    return res.rows.map((row: any) => ({
      id: row.id,
      project_id: row.project_id,
      task_id: row.task_id,
      feature_id: row.feature_id,
      status: row.status as QualityGateRunStatus,
      run_by: row.run_by,
      started_at: row.started_at ? row.started_at.toISOString() : null,
      completed_at: row.completed_at ? row.completed_at.toISOString() : null,
      summary_output: row.summary_output,
      metadata: row.metadata_json || {},
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString()
    }));
  }

  /**
   * Update Run state to "running"
   */
  public async startRun(projectId: string, runId: string, taskId?: string): Promise<QualityGateRunDTO> {
    const run = await this.getRun(projectId, runId, taskId);

    if (run.status !== QualityGateRunStatus.PENDING) {
      throw new ConflictError(`Cannot start quality gate run ${runId} in state ${run.status}.`);
    }

    await this.query(
      "UPDATE quality_gate_runs SET status = $1, started_at = NOW(), updated_at = NOW() WHERE id = $2;",
      [QualityGateRunStatus.RUNNING, runId]
    );

    await this.emitQualityGateAudit(
      projectId,
      "QUALITY_GATE_RUN_STARTED",
      "authorized",
      { run_id: runId },
      `Started quality gate run ${runId}.`,
      runId
    );

    return this.getRun(projectId, runId, taskId);
  }

  /**
   * Record command execution outcome under active run
   */
  public async ingestCommandResult(
    projectId: string,
    runId: string,
    dto: IngestQualityGateCommandDTO,
    taskId?: string
  ): Promise<QualityGateCommandResultDTO> {
    const run = await this.getRun(projectId, runId, taskId);

    // Prevent adding results to finalised runs
    const completedStates = [
      QualityGateRunStatus.PASSED,
      QualityGateRunStatus.FAILED,
      QualityGateRunStatus.WARNING,
      QualityGateRunStatus.CANCELLED,
      QualityGateRunStatus.ERROR
    ];
    if (completedStates.includes(run.status as QualityGateRunStatus)) {
      throw new ConflictError(`Involving finalized run. Cannot ingest result into run ${runId} with state ${run.status}.`);
    }

    const resultId = `qres_${crypto.randomBytes(8).toString("hex")}`;
    const rawOutput = (dto.stdout || "") + (dto.stderr || "");
    const sanitizedOutput = sanitizeCommandOutput(rawOutput);

    // Double redact database password, connection string, or leaks inside output summary manually
    const cleanOutputSummary = dto.output_summary ? redactSecretLeaks(dto.output_summary) : null;
    const cleanMetadata = this.redactGateMetadata(dto.metadata);

    // If API key, database url, or password was redacted, let's mark it in metadata
    let containsSecrets = false;
    if (rawOutput !== sanitizedOutput) {
      containsSecrets = true;
      cleanMetadata.secrets_detected_and_redacted = true;
      await this.emitQualityGateAudit(
        projectId,
        "QUALITY_GATE_SECRET_REDACTED",
        "redacted_and_completed",
        { run_id: runId, command_type: dto.command_type },
        `Potential secret detected in CLI output for command ${dto.command_type} and fully redacted.`,
        resultId
      );
    }

    await this.query(
      `INSERT INTO quality_gate_command_results 
        (id, run_id, project_id, task_id, command_type, status, exit_code, output_summary, raw_output_redacted, duration_ms, executed_at, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11);`,
      [
        resultId,
        runId,
        projectId,
        run.task_id,
        dto.command_type,
        dto.status,
        dto.exit_code !== undefined ? dto.exit_code : null,
        cleanOutputSummary,
        sanitizedOutput,
        dto.duration_ms !== undefined ? dto.duration_ms : null,
        JSON.stringify(cleanMetadata)
      ]
    );

    // Automatically transition to running if not already
    if (run.status === QualityGateRunStatus.PENDING) {
      await this.query(
        "UPDATE quality_gate_runs SET status = $1, started_at = NOW(), updated_at = NOW() WHERE id = $2;",
        [QualityGateRunStatus.RUNNING, runId]
      );
    }

    await this.emitQualityGateAudit(
      projectId,
      "QUALITY_GATE_COMMAND_INGESTED",
      "authorized",
      { run_id: runId, result_id: resultId, command_type: dto.command_type, status: dto.status },
      `Ingested sanitized result for command type: ${dto.command_type}.`,
      resultId
    );

    return {
      id: resultId,
      run_id: runId,
      project_id: projectId,
      task_id: run.task_id,
      command_type: dto.command_type,
      status: dto.status,
      exit_code: dto.exit_code !== undefined ? dto.exit_code : null,
      output_summary: cleanOutputSummary,
      raw_output_redacted: sanitizedOutput,
      duration_ms: dto.duration_ms !== undefined ? dto.duration_ms : null,
      executed_at: new Date().toISOString(),
      metadata: cleanMetadata
    };
  }

  /**
   * Finalize and aggregate Quality Gate Run outcome based on results checklist
   */
  public async completeRun(projectId: string, runId: string, taskId?: string): Promise<QualityGateRunDTO> {
    const run = await this.getRun(projectId, runId, taskId);

    const completedStates = [
      QualityGateRunStatus.PASSED,
      QualityGateRunStatus.FAILED,
      QualityGateRunStatus.WARNING,
      QualityGateRunStatus.CANCELLED,
      QualityGateRunStatus.ERROR
    ];
    if (completedStates.includes(run.status as QualityGateRunStatus)) {
      throw new ConflictError(`Cannot complete quality gate run ${runId} because it is already in finalized state ${run.status}.`);
    }

    // Retrieve all commands
    const checkRes = await this.query(
      "SELECT * FROM quality_gate_command_results WHERE run_id = $1 AND project_id = $2;",
      [runId, projectId]
    );

    const results = checkRes.rows;

    let finalStatus = QualityGateRunStatus.PASSED;
    let failCount = 0;
    let warnCount = 0;
    let passCount = 0;

    for (const cmd of results) {
      if (cmd.status === "failed" || cmd.status === "error" || (cmd.exit_code !== null && cmd.exit_code !== 0)) {
        failCount++;
      } else if (cmd.status === "warning") {
        warnCount++;
      } else if (cmd.status === "passed" || (cmd.exit_code !== null && cmd.exit_code === 0)) {
        passCount++;
      }
    }

    if (failCount > 0) {
      finalStatus = QualityGateRunStatus.FAILED;
    } else if (warnCount > 0) {
      finalStatus = QualityGateRunStatus.WARNING;
    } else {
      finalStatus = QualityGateRunStatus.PASSED;
    }

    // Generate sanitized summary output
    const summary = `Run complete. Ingested commands checklist summary: ${results.length} executed. Passed: ${passCount}, Failed: ${failCount}, Warnings: ${warnCount}.`;

    await this.query(
      "UPDATE quality_gate_runs SET status = $1, completed_at = NOW(), summary_output = $2, updated_at = NOW() WHERE id = $3;",
      [finalStatus, summary, runId]
    );

    const auditAction = finalStatus === QualityGateRunStatus.FAILED ? "QUALITY_GATE_RUN_FAILED" : "QUALITY_GATE_RUN_COMPLETED";

    await this.emitQualityGateAudit(
      projectId,
      auditAction,
      "authorized",
      { run_id: runId, final_status: finalStatus, passed_count: passCount, failed_count: failCount },
      summary,
      runId
    );

    return this.getRun(projectId, runId, taskId);
  }

  /**
   * Explicit manually cancel an active run
   */
  public async cancelRun(projectId: string, runId: string, taskId?: string): Promise<QualityGateRunDTO> {
    const run = await this.getRun(projectId, runId, taskId);

    const completedStates = [
      QualityGateRunStatus.PASSED,
      QualityGateRunStatus.FAILED,
      QualityGateRunStatus.WARNING,
      QualityGateRunStatus.CANCELLED,
      QualityGateRunStatus.ERROR
    ];
    if (completedStates.includes(run.status as QualityGateRunStatus)) {
      throw new ConflictError(`Cannot cancel quality gate run ${runId} because it is already in finalized state ${run.status}.`);
    }

    const summary = "Quality gate run cancelled manually by operator.";

    await this.query(
      "UPDATE quality_gate_runs SET status = $1, completed_at = NOW(), summary_output = $2, updated_at = NOW() WHERE id = $3;",
      [QualityGateRunStatus.CANCELLED, summary, runId]
    );

    await this.emitQualityGateAudit(
      projectId,
      "QUALITY_GATE_RUN_CANCELLED",
      "authorized",
      { run_id: runId },
      summary,
      runId
    );

    return this.getRun(projectId, runId, taskId);
  }

  /**
   * Helper to retrieve all command results under a run
   */
  public async getCommandResults(projectId: string, runId: string): Promise<QualityGateCommandResultDTO[]> {
    const checkRes = await this.query(
      "SELECT * FROM quality_gate_command_results WHERE run_id = $1 AND project_id = $2 ORDER BY executed_at ASC;",
      [runId, projectId]
    );

    return checkRes.rows.map((row: any) => ({
      id: row.id,
      run_id: row.run_id,
      project_id: row.project_id,
      task_id: row.task_id,
      command_type: row.command_type as QualityGateCommandType,
      status: row.status,
      exit_code: row.exit_code,
      output_summary: row.output_summary,
      raw_output_redacted: row.raw_output_redacted,
      duration_ms: row.duration_ms,
      executed_at: row.executed_at.toISOString(),
      metadata: row.metadata_json || {}
    }));
  }
}
