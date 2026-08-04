import { redactSecretLeaks } from "@y/security";
import { 
  NotFoundError,
  PermissionDeniedError,
  BaseError
} from "@y/shared";

export interface CreateHandoffDTO {
  source_provider: string;
  target_provider: string;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface UpdateHandoffDTO {
  status?: string;
  metadata?: Record<string, any>;
}

export class MultiAgentHandoffService {
  private supportedProviders = [
    "claude_code",
    "codex",
    "cursor",
    "windsurf",
    "devin",
    "sweep",
    "plandex",
    "generic_agent"
  ];

  private supportedStatuses = [
    "draft",
    "ready",
    "blocked",
    "accepted",
    "archived",
    "failed"
  ];

  constructor(private pool: any) {
    if (!pool) {
      throw new Error("A valid database connection pool is required for MultiAgentHandoffService.");
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
      throw new PermissionDeniedError(`Permission denied: Task ${safeTaskId} does not belong to specified project.`);
    }
  }

  /**
   * Emits structural and redacted audit logs for handoff activity.
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
         VALUES ($1, $2, $3, 'RESUME', $4, $5, $6, $7, $8, $9, NOW());`,
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
      console.error(`MultiAgentHandoffService Audit Log emission failed: ${err.message}`);
    }
  }

  /**
   * Internal routine to validate if handoff components are completely matching.
   */
  public compileCompletenessValidation(
    projectId: string,
    taskId: string,
    memoryRow: any | null,
    resumeStateRow: any | null,
    contextPackId: string | null,
    boundaryRow: any | null
  ): { ready: boolean; missing: string[]; warnings: string[]; recommendation: string } {
    const missing: string[] = [];
    const warnings: string[] = [];

    if (!projectId) missing.push("project_id");
    if (!taskId) missing.push("task_id");

    const hasMemory = !!memoryRow;
    const hasResumeState = !!resumeStateRow;
    const hasContextPack = !!contextPackId;
    const hasBoundaries = !!boundaryRow;

    if (!hasMemory) {
      missing.push("latest agent memory");
      warnings.push("Handoff payload is missing prior agent reasoning trajectory (agent memory).");
    }
    if (!hasResumeState) {
      missing.push("latest resume state");
      warnings.push("Handoff payload is missing the formal resume state snapshot.");
    }
    if (!hasContextPack) {
      missing.push("context pack reference");
      warnings.push("Handoff payload does not link to an active context pack.");
    }
    if (!hasBoundaries) {
      missing.push("boundary rules");
      warnings.push("Task boundary definition is not registered or locked.");
    }

    let nextAction = "";
    if (resumeStateRow?.next_action) {
      nextAction = resumeStateRow.next_action;
    } else if (memoryRow?.next_recommended_action) {
      nextAction = memoryRow.next_recommended_action;
    }
    if (!nextAction) {
      missing.push("next action");
      warnings.push("Recommended next action is unspecified.");
    }

    let affectedFilesCount = 0;
    if (resumeStateRow?.affected_files && Array.isArray(resumeStateRow.affected_files)) {
      affectedFilesCount = resumeStateRow.affected_files.length;
    } else if (resumeStateRow?.task_state?.featureIdsInProgress && Array.isArray(resumeStateRow.task_state.featureIdsInProgress)) {
      affectedFilesCount = resumeStateRow.task_state.featureIdsInProgress.length;
    }
    if (affectedFilesCount === 0) {
      missing.push("affected files");
      warnings.push("No active modified or target files listed.");
    }

    // Checking validation commands (check resume validationState or just see if present)
    const hasValidationCommands = resumeStateRow?.validation_state && Object.keys(resumeStateRow.validation_state).length > 0;
    if (!hasValidationCommands) {
      missing.push("validation commands");
    }

    // Checking known risks include
    const hasKnownRisks = (resumeStateRow?.task_state?.knownRisks && Array.isArray(resumeStateRow.task_state.knownRisks) && resumeStateRow.task_state.knownRisks.length > 0) || (boundaryRow?.metadata_json?.known_risks && Array.isArray(boundaryRow.metadata_json.known_risks));
    if (!hasKnownRisks) {
      missing.push("known risks");
    }

    // Checking forbidden changes include
    const hasForbiddenChanges = boundaryRow && (boundaryRow.forbidden_files?.length > 0 || boundaryRow.forbidden_patterns?.length > 0 || boundaryRow.forbidden_domains?.length > 0);
    if (!hasForbiddenChanges) {
      missing.push("forbidden changes");
    }

    const ready = missing.length === 0;
    const recommendation = ready 
      ? "Handoff package is ready for manual use." 
      : "Run a new resume-state calculation or sync task boundaries to resolve missing dependencies.";

    return {
      ready,
      missing,
      warnings,
      recommendation
    };
  }

  /**
   * Build provider specific handoff payloads.
   */
  public generateHandoffPayload(
    sourceProvider: string,
    targetProvider: string,
    taskInfo: any,
    memoryRow: any | null,
    resumeStateRow: any | null,
    boundaryRow: any | null,
    contextPackId: string | null,
    sourceSessionRow: any | null
  ): Record<string, any> {
    const payload: Record<string, any> = {};

    const taskSummary = taskInfo?.description || taskInfo?.title || "No summary available.";
    const cleanMemory = memoryRow ? {
      id: memoryRow.id,
      status: memoryRow.status,
      what_agent_did: memoryRow.what_agent_did,
      why_agent_did_it: memoryRow.why_agent_did_it,
      next_recommended_action: memoryRow.next_recommended_action,
      confidence_score: memoryRow.confidence_score
    } : null;

    const cleanResumeState = resumeStateRow ? {
      id: resumeStateRow.id,
      status: resumeStateRow.status,
      current_phase: resumeStateRow.current_phase,
      next_action: resumeStateRow.next_action,
      affected_files: resumeStateRow.affected_files,
      failed_step: resumeStateRow.failed_step,
      validation_state: resumeStateRow.validation_state
    } : null;

    const allowedFiles = boundaryRow?.allowed_files || [];
    const forbiddenFiles = boundaryRow?.forbidden_files || [];
    const forbiddenDomains = boundaryRow?.forbidden_domains || [];
    const allowedPatterns = boundaryRow?.allowed_patterns || [];
    const forbiddenPatterns = boundaryRow?.forbidden_patterns || [];

    const defaultValidationCommands = [
      "pnpm lint",
      "pnpm typecheck",
      "pnpm build"
    ];

    // Combine any validation scripts
    const validationCommands = resumeStateRow?.validation_state?.commands || defaultValidationCommands;
    const risks = resumeStateRow?.task_state?.knownRisks || boundaryRow?.metadata_json?.known_risks || ["No critical risks identified."];
    const sourceSessionRef = sourceSessionRow?.external_session_id || sourceSessionRow?.id || null;

    // RESUME-027 Claude -> Codex
    if (sourceProvider === "claude_code" && targetProvider === "codex") {
      payload.task_summary = taskSummary;
      payload.latest_agent_memory = cleanMemory;
      payload.latest_resume_state = cleanResumeState;
      payload.latest_context_pack_ref = contextPackId;
      payload.current_phase = resumeStateRow?.current_phase || "unknown";
      payload.next_recommended_action = resumeStateRow?.next_action || memoryRow?.next_recommended_action || "Continue implementation.";
      payload.affected_files = resumeStateRow?.affected_files || [];
      payload.forbidden_files = forbiddenFiles;
      payload.forbidden_domains = forbiddenDomains;
      payload.quality_gates = resumeStateRow?.validation_state?.gates || ["lint", "typecheck"];
      payload.known_risks = risks;
      payload.validation_commands = validationCommands;
      payload.source_session_ref = sourceSessionRef;
    }
    // RESUME-028 Codex -> Claude
    else if (sourceProvider === "codex" && targetProvider === "claude_code") {
      payload.task_summary = taskSummary;
      payload.prior_codex_session_ref = sourceSessionRef;
      payload.latest_memory = cleanMemory;
      payload.latest_resume_payload = resumeStateRow?.resume_payload || {};
      payload.context_pack_ref = contextPackId;
      payload.boundaries = {
        allowed_files: allowedFiles,
        forbidden_files: forbiddenFiles,
        allowed_patterns: allowedPatterns,
        forbidden_patterns: forbiddenPatterns
      };
      payload.failed_steps = resumeStateRow?.failed_step ? [resumeStateRow.failed_step] : [];
      payload.next_action = resumeStateRow?.next_action || "Next actions to verify.";
      payload.validation_commands = validationCommands;
    }
    // RESUME-029 Claude -> Cursor
    else if (sourceProvider === "claude_code" && targetProvider === "cursor") {
      payload.task_scope = taskSummary;
      payload.affected_files = resumeStateRow?.affected_files || [];
      payload.context_pack_ref = contextPackId;
      payload.current_phase = resumeStateRow?.current_phase || "unknown";
      payload.next_action = resumeStateRow?.next_action || "Proceed with target edits.";
      payload.boundary_rules = {
        allowed_files: allowedFiles,
        forbidden_files: forbiddenFiles,
        forbidden_domains: forbiddenDomains
      };
      payload.quality_gates = ["build-check"];
      payload.warnings = ["Do not update standard schema config files."];
    }
    // RESUME-030 Cursor -> Claude
    else if (sourceProvider === "cursor" && targetProvider === "claude_code") {
      payload.prior_cursor_session_ref = sourceSessionRef;
      payload.changed_files = resumeStateRow?.affected_files || [];
      payload.failed_steps = resumeStateRow?.failed_step ? [resumeStateRow.failed_step] : [];
      payload.next_action = resumeStateRow?.next_action || "Review outstanding tasks.";
      payload.task_context = taskSummary;
      payload.validation_state = resumeStateRow?.validation_state || {};
      payload.boundary_rules = {
        allowed_patterns: allowedPatterns,
        forbidden_patterns: forbiddenPatterns
      };
    }
    // RESUME-031 Windsurf handoff
    else if (targetProvider === "windsurf") {
      payload.task_scope = taskSummary;
      payload.context_references = contextPackId ? [contextPackId] : [];
      payload.affected_files = resumeStateRow?.affected_files || [];
      payload.current_phase = resumeStateRow?.current_phase || "unknown";
      payload.blocked_items = resumeStateRow?.failed_step ? [resumeStateRow.failed_step] : [];
      payload.next_action = resumeStateRow?.next_action || "Continue execution.";
      payload.validation_commands = validationCommands;
    }
    // RESUME-032 Devin / Sweep / Plandex handoff
    else if (["devin", "sweep", "plandex"].includes(targetProvider)) {
      payload.task_summary = taskSummary;
      payload.context_refs = contextPackId ? [contextPackId] : [];
      payload.memory_refs = memoryRow ? [memoryRow.id] : [];
      payload.resume_state_refs = resumeStateRow ? [resumeStateRow.id] : [];
      payload.boundaries = {
        allowed_files: allowedFiles,
        forbidden_files: forbiddenFiles,
        allowed_patterns: allowedPatterns,
        forbidden_patterns: forbiddenPatterns,
        forbidden_domains: forbiddenDomains
      };
      payload.validation_commands = validationCommands;
      payload.allowed_files = allowedFiles;
      payload.forbidden_files = forbiddenFiles;
      payload.next_action = resumeStateRow?.next_action || "Next instruction prompt.";
    }
    // Fallback/Generic agent
    else {
      payload.task_summary = taskSummary;
      payload.source_provider = sourceProvider;
      payload.target_provider = targetProvider;
      payload.context_pack_ref = contextPackId;
      payload.memory_ref = memoryRow?.id || null;
      payload.resume_state_ref = resumeStateRow?.id || null;
      payload.next_action = resumeStateRow?.next_action || memoryRow?.next_recommended_action || "Proceed.";
      payload.boundaries = {
        allowed_files: allowedFiles,
        forbidden_files: forbiddenFiles,
        forbidden_patterns: forbiddenPatterns
      };
      payload.validation_commands = validationCommands;
    }

    return payload;
  }

  /**
   * Creates a handoff.
   */
  public async createHandoff(
    projectId: string,
    taskId: string,
    dto: CreateHandoffDTO,
    actor: string,
    ipAddress = "127.0.0.1"
  ): Promise<any> {
    await this.validateProjectAndTaskScope(projectId, taskId);

    const sourceProvider = String(dto.source_provider || "").toLowerCase();
    const targetProvider = String(dto.target_provider || "").toLowerCase();
    const reason = redactSecretLeaks(dto.reason || "");
    const rawMetadata = dto.metadata || {};

    if (!this.supportedProviders.includes(sourceProvider)) {
      throw new Error(`Unsupported source provider: ${sourceProvider}`);
    }
    if (!this.supportedProviders.includes(targetProvider)) {
      throw new Error(`Unsupported target provider: ${targetProvider}`);
    }

    // Fetch latest task details
    const taskRes = await this.query("SELECT id, title, description FROM tasks WHERE id = $1 LIMIT 1;", [taskId]);
    const taskInfo = taskRes.rows[0];

    // Fetch latest agent memories
    const memRes = await this.query("SELECT * FROM agent_memories WHERE task_id = $1 ORDER BY created_at DESC LIMIT 1;", [taskId]);
    const memoryRow = memRes.rowCount > 0 ? memRes.rows[0] : null;

    // Fetch latest resume states
    const resumeRes = await this.query("SELECT * FROM resume_states WHERE task_id = $1 ORDER BY created_at DESC LIMIT 1;", [taskId]);
    const resumeStateRow = resumeRes.rowCount > 0 ? resumeRes.rows[0] : null;

    // Fetch latest task boundaries
    const boundRes = await this.query("SELECT * FROM task_boundaries WHERE task_id = $1 ORDER BY created_at DESC LIMIT 1;", [taskId]);
    const boundaryRow = boundRes.rowCount > 0 ? boundRes.rows[0] : null;

    // Fetch active/latest source session
    const sourceSessRes = await this.query("SELECT * FROM agent_sessions WHERE task_id = $1 AND provider = $2 ORDER BY created_at DESC LIMIT 1;", [taskId, sourceProvider]);
    const sourceSessionRow = sourceSessRes.rowCount > 0 ? sourceSessRes.rows[0] : null;

    // Determine current Context Pack identifier
    const contextPackId = resumeStateRow?.context_pack_id || boundaryRow?.context_pack_id || null;

    // Compile completeness validation
    const valResult = this.compileCompletenessValidation(projectId, taskId, memoryRow, resumeStateRow, contextPackId, boundaryRow);

    // Initial status determined by completeness validation: "ready" if all parameters verified, else "blocked" or "draft"
    const status = valResult.ready ? "ready" : "blocked";

    // Build the dynamic provider specific payload
    const rawPayload = this.generateHandoffPayload(
      sourceProvider,
      targetProvider,
      taskInfo,
      memoryRow,
      resumeStateRow,
      boundaryRow,
      contextPackId,
      sourceSessionRow
    );

    // Sanitization & Redaction
    const handoffPayload = JSON.parse(redactSecretLeaks(JSON.stringify(rawPayload)));
    const validationResult = JSON.parse(redactSecretLeaks(JSON.stringify(valResult)));
    const missingContextWarnings = JSON.parse(redactSecretLeaks(JSON.stringify(valResult.warnings || [])));
    const preservedContextRefs = contextPackId ? [contextPackId] : [];
    const metadata = JSON.parse(redactSecretLeaks(JSON.stringify({
      ...rawMetadata,
      reason,
      generated_at: new Date().toISOString()
    })));

    const handoffId = `handoff_${Math.random().toString(36).substring(2, 11)}`;

    await this.query(
      `INSERT INTO agent_handoffs (
        id, project_id, task_id, source_provider, target_provider, 
        source_agent_session_id, target_agent_session_id, resume_state_id, 
        agent_memory_id, context_pack_id, status, handoff_payload, 
        validation_result, missing_context_warnings, preserved_context_refs, 
        metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW());`,
      [
        handoffId,
        projectId,
        taskId,
        sourceProvider,
        targetProvider,
        sourceSessionRow?.id || null,
        null, // target_agent_session_id initially null
        resumeStateRow?.id || null,
        memoryRow?.id || null,
        contextPackId,
        status,
        JSON.stringify(handoffPayload),
        JSON.stringify(validationResult),
        JSON.stringify(missingContextWarnings),
        JSON.stringify(preservedContextRefs),
        JSON.stringify(metadata)
      ]
    );

    // Write audit trail logs
    await this.emitAuditLog(
      projectId,
      actor,
      "CREATE_AGENT_HANDOFF",
      valResult.ready ? "authorized" : "redacted_and_completed",
      {
        handoffId,
        taskId,
        sourceProvider,
        targetProvider,
        status,
        missing: valResult.missing
      },
      `Successfully generated ${sourceProvider} to ${targetProvider} handoff package. Status: ${status}.`,
      handoffId,
      ipAddress
    );

    return {
      handoff_id: handoffId,
      task_id: taskId,
      project_id: projectId,
      source_provider: sourceProvider,
      target_provider: targetProvider,
      status,
      validation_result: valResult,
      handoff_payload: handoffPayload,
      missing_context_warnings: missingContextWarnings,
      preserved_context_refs: preservedContextRefs,
      metadata,
      source_agent_session_id: sourceSessionRow?.id || null,
      target_agent_session_id: null,
      resume_state_id: resumeStateRow?.id || null,
      agent_memory_id: memoryRow?.id || null,
      context_pack_id: contextPackId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  /**
   * Updates handoff status or metadata.
   */
  public async updateHandoff(
    projectId: string,
    handoffId: string,
    dto: UpdateHandoffDTO,
    actor: string,
    ipAddress = "127.0.0.1"
  ): Promise<any> {
    const checkRes = await this.query("SELECT * FROM agent_handoffs WHERE id = $1 LIMIT 1;", [handoffId]);
    if (checkRes.rowCount === 0) {
      throw new NotFoundError(`Handoff ID ${handoffId} not found.`);
    }

    const row = checkRes.rows[0];
    if (row.project_id !== projectId) {
      // Create cross-project audit warning
      await this.emitAuditLog(
        row.project_id,
        actor,
        "CROSS_PROJECT_HANDOFF_BLOCKED",
        "denied_untrusted",
        { handoffId, requestedProjectId: projectId },
        `Cross-project handoff mutate access blocked.`,
        handoffId,
        ipAddress
      );
      throw new PermissionDeniedError(`Permission denied: Handoff ${handoffId} does not belong to specified project.`);
    }

    const nextStatus = dto.status ? String(dto.status).toLowerCase() : null;
    if (nextStatus && !this.supportedStatuses.includes(nextStatus)) {
      throw new Error(`Unsupported handoff status value: ${nextStatus}`);
    }

    const safeMetadata = dto.metadata ? JSON.parse(redactSecretLeaks(JSON.stringify(dto.metadata))) : null;

    let updateSql = "UPDATE agent_handoffs SET updated_at = NOW()";
    const params: unknown[] = [handoffId];
    let counter = 2;

    if (nextStatus) {
      updateSql += `, status = $${counter}`;
      params.push(nextStatus);
      counter++;
    }

    if (safeMetadata) {
      const mergedMetadata = { ...row.metadata, ...safeMetadata };
      updateSql += `, metadata = $${counter}`;
      params.push(JSON.stringify(mergedMetadata));
      counter++;
    }

    updateSql += ` WHERE id = $1 RETURNING *;`;

    const nextRes = await this.query(updateSql, params);
    const updatedRow = nextRes.rows[0];

    await this.emitAuditLog(
      projectId,
      actor,
      "UPDATE_AGENT_HANDOFF",
      "authorized",
      {
        handoffId,
        status: updatedRow.status
      },
      `Updated handoff ${handoffId}.`,
      handoffId,
      ipAddress
    );

    return {
      handoff_id: updatedRow.id,
      task_id: updatedRow.task_id,
      project_id: updatedRow.project_id,
      source_provider: updatedRow.source_provider,
      target_provider: updatedRow.target_provider,
      status: updatedRow.status,
      validation_result: updatedRow.validation_result,
      handoff_payload: updatedRow.handoff_payload,
      missing_context_warnings: updatedRow.missing_context_warnings,
      preserved_context_refs: updatedRow.preserved_context_refs,
      metadata: updatedRow.metadata,
      source_agent_session_id: updatedRow.source_agent_session_id,
      target_agent_session_id: updatedRow.target_agent_session_id,
      resume_state_id: updatedRow.resume_state_id,
      agent_memory_id: updatedRow.agent_memory_id,
      context_pack_id: updatedRow.context_pack_id,
      created_at: updatedRow.created_at,
      updated_at: updatedRow.updated_at
    };
  }

  /**
   * Re-evaluates completeness and updates handoff validation result.
   */
  public async validateHandoff(
    projectId: string,
    handoffId: string,
    actor: string,
    ipAddress = "127.0.0.1"
  ): Promise<any> {
    const checkRes = await this.query("SELECT * FROM agent_handoffs WHERE id = $1 LIMIT 1;", [handoffId]);
    if (checkRes.rowCount === 0) {
      throw new NotFoundError(`Handoff ID ${handoffId} not found.`);
    }

    const row = checkRes.rows[0];
    if (row.project_id !== projectId) {
      throw new PermissionDeniedError(`Permission denied: Handoff ${handoffId} does not belong to specified project.`);
    }

    // Load active models again to re-validate
    const memRes = await this.query("SELECT * FROM agent_memories WHERE task_id = $1 ORDER BY created_at DESC LIMIT 1;", [row.task_id]);
    const memoryRow = memRes.rowCount > 0 ? memRes.rows[0] : null;

    const resumeRes = await this.query("SELECT * FROM resume_states WHERE task_id = $1 ORDER BY created_at DESC LIMIT 1;", [row.task_id]);
    const resumeStateRow = resumeRes.rowCount > 0 ? resumeRes.rows[0] : null;

    const boundRes = await this.query("SELECT * FROM task_boundaries WHERE task_id = $1 ORDER BY created_at DESC LIMIT 1;", [row.task_id]);
    const boundaryRow = boundRes.rowCount > 0 ? boundRes.rows[0] : null;

    const contextPackId = resumeStateRow?.context_pack_id || boundaryRow?.context_pack_id || null;

    const valResult = this.compileCompletenessValidation(projectId, row.task_id, memoryRow, resumeStateRow, contextPackId, boundaryRow);
    const status = valResult.ready ? "ready" : "blocked";

    const taskRes = await this.query("SELECT id, title, description FROM tasks WHERE id = $1 LIMIT 1;", [row.task_id]);
    const taskInfo = taskRes.rows[0];

    const sourceSessRes = await this.query("SELECT * FROM agent_sessions WHERE task_id = $1 AND provider = $2 ORDER BY created_at DESC LIMIT 1;", [row.task_id, row.source_provider]);
    const sourceSessionRow = sourceSessRes.rowCount > 0 ? sourceSessRes.rows[0] : null;

    const rawPayload = this.generateHandoffPayload(
      row.source_provider,
      row.target_provider,
      taskInfo,
      memoryRow,
      resumeStateRow,
      boundaryRow,
      contextPackId,
      sourceSessionRow
    );

    const handoffPayload = JSON.parse(redactSecretLeaks(JSON.stringify(rawPayload)));
    const validationResult = JSON.parse(redactSecretLeaks(JSON.stringify(valResult)));
    const missingContextWarnings = JSON.parse(redactSecretLeaks(JSON.stringify(valResult.warnings || [])));

    const nextRes = await this.query(
      `UPDATE agent_handoffs 
       SET status = $1, handoff_payload = $2, validation_result = $3, missing_context_warnings = $4, updated_at = NOW()
       WHERE id = $5 RETURNING *;`,
      [
        status, 
        JSON.stringify(handoffPayload), 
        JSON.stringify(validationResult), 
        JSON.stringify(missingContextWarnings), 
        handoffId
      ]
    );

    const updatedRow = nextRes.rows[0];

    await this.emitAuditLog(
      projectId,
      actor,
      "VALIDATE_AGENT_HANDOFF",
      valResult.ready ? "authorized" : "redacted_and_completed",
      {
        handoffId,
        status: updatedRow.status,
        missing: valResult.missing
      },
      `Validated handoff ${handoffId}. Status is now: ${status}.`,
      handoffId,
      ipAddress
    );

    return {
      handoff_id: updatedRow.id,
      task_id: updatedRow.task_id,
      project_id: updatedRow.project_id,
      source_provider: updatedRow.source_provider,
      target_provider: updatedRow.target_provider,
      status: updatedRow.status,
      validation_result: updatedRow.validation_result,
      handoff_payload: updatedRow.handoff_payload,
      missing_context_warnings: updatedRow.missing_context_warnings,
      preserved_context_refs: updatedRow.preserved_context_refs,
      metadata: updatedRow.metadata,
      source_agent_session_id: updatedRow.source_agent_session_id,
      target_agent_session_id: updatedRow.target_agent_session_id,
      resume_state_id: updatedRow.resume_state_id,
      agent_memory_id: updatedRow.agent_memory_id,
      context_pack_id: updatedRow.context_pack_id,
      created_at: updatedRow.created_at,
      updated_at: updatedRow.updated_at
    };
  }

  /**
   * List all handoffs for a task.
   */
  public async getHandoffsByTaskId(
    projectId: string,
    taskId: string,
    actor: string
  ): Promise<any[]> {
    await this.validateProjectAndTaskScope(projectId, taskId);

    const res = await this.query("SELECT * FROM agent_handoffs WHERE task_id = $1 ORDER BY created_at DESC;", [taskId]);
    
    await this.emitAuditLog(
      projectId,
      actor,
      "READ_AGENT_HANDOFF",
      "authorized",
      { taskId, count: res.rowCount },
      `Listed handoffs for task ${taskId}.`,
      "",
      "127.0.0.1"
    );

    return res.rows.map(r => ({
      handoff_id: r.id,
      task_id: r.task_id,
      project_id: r.project_id,
      source_provider: r.source_provider,
      target_provider: r.target_provider,
      status: r.status,
      validation_result: r.validation_result,
      handoff_payload: r.handoff_payload,
      missing_context_warnings: r.missing_context_warnings,
      preserved_context_refs: r.preserved_context_refs,
      metadata: r.metadata,
      source_agent_session_id: r.source_agent_session_id,
      target_agent_session_id: r.target_agent_session_id,
      resume_state_id: r.resume_state_id,
      agent_memory_id: r.agent_memory_id,
      context_pack_id: r.context_pack_id,
      created_at: r.created_at,
      updated_at: r.updated_at
    }));
  }

  /**
   * Retrieves the latest handoff for a task.
   */
  public async getLatestHandoff(
    projectId: string,
    taskId: string,
    actor: string
  ): Promise<any | null> {
    await this.validateProjectAndTaskScope(projectId, taskId);

    const res = await this.query("SELECT * FROM agent_handoffs WHERE task_id = $1 ORDER BY created_at DESC LIMIT 1;", [taskId]);
    
    if (res.rowCount === 0) {
      return null;
    }

    const r = res.rows[0];

    await this.emitAuditLog(
      projectId,
      actor,
      "READ_AGENT_HANDOFF",
      "authorized",
      { handoffId: r.id, taskId },
      `Retrieved latest handoff for task ${taskId}.`,
      r.id,
      "127.0.0.1"
    );

    return {
      handoff_id: r.id,
      task_id: r.task_id,
      project_id: r.project_id,
      source_provider: r.source_provider,
      target_provider: r.target_provider,
      status: r.status,
      validation_result: r.validation_result,
      handoff_payload: r.handoff_payload,
      missing_context_warnings: r.missing_context_warnings,
      preserved_context_refs: r.preserved_context_refs,
      metadata: r.metadata,
      source_agent_session_id: r.source_agent_session_id,
      target_agent_session_id: r.target_agent_session_id,
      resume_state_id: r.resume_state_id,
      agent_memory_id: r.agent_memory_id,
      context_pack_id: r.context_pack_id,
      created_at: r.created_at,
      updated_at: r.updated_at
    };
  }

  /**
   * Retrieves a handoff by its unique identifier.
   */
  public async getHandoff(
    projectId: string,
    handoffId: string,
    actor: string
  ): Promise<any> {
    const res = await this.query("SELECT * FROM agent_handoffs WHERE id = $1 LIMIT 1;", [handoffId]);
    if (res.rowCount === 0) {
      throw new NotFoundError(`Handoff ID ${handoffId} not found.`);
    }

    const r = res.rows[0];
    if (r.project_id !== projectId) {
      await this.emitAuditLog(
        r.project_id,
        actor,
        "CROSS_PROJECT_HANDOFF_BLOCKED",
        "denied_untrusted",
        { handoffId, requestedProjectId: projectId },
        `Cross-project handoff read access blocked.`,
        handoffId,
        "127.0.0.1"
      );
      throw new PermissionDeniedError(`Permission denied: Handoff ${handoffId} does not belong to specified project.`);
    }

    await this.emitAuditLog(
      projectId,
      actor,
      "READ_AGENT_HANDOFF",
      "authorized",
      { handoffId, taskId: r.task_id },
      `Retrieved handoff ${handoffId} details.`,
      handoffId,
      "127.0.0.1"
    );

    return {
      handoff_id: r.id,
      task_id: r.task_id,
      project_id: r.project_id,
      source_provider: r.source_provider,
      target_provider: r.target_provider,
      status: r.status,
      validation_result: r.validation_result,
      handoff_payload: r.handoff_payload,
      missing_context_warnings: r.missing_context_warnings,
      preserved_context_refs: r.preserved_context_refs,
      metadata: r.metadata,
      source_agent_session_id: r.source_agent_session_id,
      target_agent_session_id: r.target_agent_session_id,
      resume_state_id: r.resume_state_id,
      agent_memory_id: r.agent_memory_id,
      context_pack_id: r.context_pack_id,
      created_at: r.created_at,
      updated_at: r.updated_at
    };
  }
}
