import { 
  AgentSession, 
  AgentSessionProvider,
  AgentSessionStatus,
  CreateAgentSessionDTO, 
  UpdateAgentSessionDTO,
  NotFoundError,
  PermissionDeniedError,
  ConflictError,
  BaseError
} from "@y/shared";
import { redactSecretLeaks } from "@y/security";
import crypto from "crypto";

export function parseTaskStateMarkdown(content: string): {
  current_phase: string | null;
  last_action: string | null;
  failed_step: string | null;
  next_action: string | null;
  affected_files: string[] | null;
  validation_state: string | null;
} {
  const safeContent = redactSecretLeaks(content);
  
  const extractField = (keys: string[]): string | null => {
    for (const key of keys) {
      const patterns = [
        new RegExp(`(?:^|\\n)[-*\\s]*\\*?\\*?${key}\\*?\\*?\\s*[:=-]\\s*([^\n]+)`, "i"),
        new RegExp(`(?:^|\\n)[-*\\s]*\\*?\\*?${key}\\*?\\*?\\s+([^\n]+)`, "i")
      ];
      for (const pattern of patterns) {
        const match = safeContent.match(pattern);
        if (match && match[1]) {
          return match[1].trim().replace(/^['"`]+|['"`]+$/g, "");
        }
      }
    }
    return null;
  };

  const current_phase = extractField(["current phase", "phase"]);
  const last_action = extractField(["last action", "last_action", "action"]);
  const failed_step = extractField(["failed step", "failed_step"]);
  const next_action = extractField(["next action", "next_step", "next action"]);
  const validation_state = extractField(["validation state", "validation_state", "validation"]);

  const rawAffected = extractField(["affected files", "affected_files", "files"]);
  let affected_files: string[] | null = null;
  if (rawAffected) {
    affected_files = rawAffected
      .split(/[,,;\s]+/)
      .map(f => f.trim().replace(/^[-*]+|['"`\[\]\s]+/g, ""))
      .filter(f => f.length > 0);
  }

  return {
    current_phase,
    last_action,
    failed_step,
    next_action,
    affected_files,
    validation_state
  };
}

export class AgentSessionRecoveryService {
  constructor(private pool: any) {
    if (!pool) {
      throw new Error("A valid database connection pool is required for AgentSessionRecoveryService.");
    }
  }

  private async query(sql: string, params: unknown[] = []): Promise<any> {
    return this.pool.query(sql, params);
  }

  /**
   * Validates project/task scoping.
   */
  public async validateProjectAndTaskScope(projectId: string, taskId: string): Promise<void> {
    const safeProjectId = redactSecretLeaks(String(projectId || ""));
    const safeTaskId = redactSecretLeaks(String(taskId || ""));

    const projRes = await this.query("SELECT id FROM projects WHERE id = $1 LIMIT 1;", [projectId]);
    if (projRes.rowCount === 0) {
      console.warn(`[Y-OS:SECURITY-WARN] Project scope validation failed: Project ID '${safeProjectId}' returned 0 row records.`);
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
   * Emits structural and redacted audit logs.
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
    
    // Redact metadata values
    const cleanMetadata: Record<string, any> = {};
    for (const [k, v] of Object.entries(metadata)) {
      if (typeof v === "string") {
        cleanMetadata[k] = redactSecretLeaks(v);
      } else if (v && typeof v === "object") {
        cleanMetadata[k] = JSON.parse(redactSecretLeaks(JSON.stringify(v)));
      } else {
        cleanMetadata[k] = v;
      }
    }

    try {
      await this.query(
        `INSERT INTO audit_logs (id, project_id, actor, feature_id, action, status, metadata, rationale, resource_id, ip_address, created_at)
         VALUES ($1, $2, $3, 'RESUME', $4, $5, $6, $7, $8, $9, NOW());`,
        [
          logId,
          projectId,
          actor,
          action,
          status,
          JSON.stringify(cleanMetadata),
          cleanRationale,
          resourceId,
          ipAddress
        ]
      );
    } catch (err: any) {
      console.error(`AgentSessionRecoveryService Audit Log emission failed: ${err.message}`);
    }
  }

  /**
   * Create standard agent session representation.
   */
  public async createAgentSession(
    projectId: string,
    taskId: string,
    dto: CreateAgentSessionDTO,
    actor: string,
    ipAddress = "127.0.0.1"
  ): Promise<AgentSession> {
    await this.validateProjectAndTaskScope(projectId, taskId);

    const provider = dto.provider;
    if (!["claude_code", "codex", "generic_agent"].includes(provider)) {
      throw new BaseError("BAD_REQUEST", `Unsupported provider: ${provider}`, 400);
    }

    const status = dto.status || "active";
    if (!["active", "paused", "recoverable", "expired", "failed", "archived"].includes(status)) {
      throw new BaseError("BAD_REQUEST", `Unsupported status: ${status}`, 400);
    }

    // Uniqueness constraint check (status IN ('active', 'paused', 'recoverable'))
    if (["active", "paused", "recoverable"].includes(status)) {
      const activeCheck = await this.query(
        "SELECT id, status FROM agent_sessions WHERE task_id = $1 AND provider = $2 AND status IN ('active', 'paused', 'recoverable') LIMIT 1;",
        [taskId, provider]
      );
      if (activeCheck.rowCount > 0) {
        const conflictSessionId = activeCheck.rows[0].id;
        const conflictStatus = activeCheck.rows[0].status;
        
        await this.emitAuditLog(
          projectId,
          actor,
          "CROSS_PROJECT_SESSION_BLOCKED", // or custom action for active clash
          "denied_untrusted",
          { taskId, provider, conflictSessionId, conflictStatus },
          `Duplicate active agent session creation attempt on provider '${provider}'`,
          conflictSessionId,
          ipAddress
        );
        throw new ConflictError(`Conflict: An active session (${conflictStatus}) already exists for task ${taskId} and provider ${provider}.`);
      }
    }

    const id = `session_${crypto.randomUUID()}`;
    const externalSessionId = redactSecretLeaks(dto.external_session_id);
    const sessionLabel = dto.session_label ? redactSecretLeaks(dto.session_label) : null;
    const lastKnownStep = dto.last_known_step ? redactSecretLeaks(dto.last_known_step) : null;
    const recoveryPayload = dto.recovery_payload ? JSON.parse(redactSecretLeaks(JSON.stringify(dto.recovery_payload))) : {};
    const metadata = dto.metadata ? JSON.parse(redactSecretLeaks(JSON.stringify(dto.metadata))) : {};

    const agentMemoryId = dto.agent_memory_id || null;
    const resumeStateId = dto.resume_state_id || null;

    // Verify references if they are given and scoped correctly
    if (agentMemoryId) {
      const memoryCheck = await this.query("SELECT id FROM agent_memories WHERE id = $1 AND project_id = $2 LIMIT 1;", [agentMemoryId, projectId]);
      if (memoryCheck.rowCount === 0) {
        throw new NotFoundError(`Agent memory reference ${agentMemoryId} not found or out of scope.`);
      }
    }
    if (resumeStateId) {
      const stateCheck = await this.query("SELECT id FROM resume_states WHERE id = $1 AND project_id = $2 LIMIT 1;", [resumeStateId, projectId]);
      if (stateCheck.rowCount === 0) {
        throw new NotFoundError(`Resume state reference ${resumeStateId} not found or out of scope.`);
      }
    }

    const insertSql = `
      INSERT INTO agent_sessions (
        id, project_id, task_id, agent_memory_id, resume_state_id, provider,
        external_session_id, session_label, status, last_known_step, last_seen_at,
        recovery_payload, metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11, $12, NOW(), NOW())
      RETURNING *;
    `;

    const res = await this.query(insertSql, [
      id,
      projectId,
      taskId,
      agentMemoryId,
      resumeStateId,
      provider,
      externalSessionId,
      sessionLabel,
      status,
      lastKnownStep,
      JSON.stringify(recoveryPayload),
      JSON.stringify(metadata)
    ]);

    const row = res.rows[0];
    const sessionObj: AgentSession = {
      id: row.id,
      projectId: row.project_id,
      taskId: row.task_id,
      agentMemoryId: row.agent_memory_id,
      resumeStateId: row.resume_state_id,
      provider: row.provider as AgentSessionProvider,
      externalSessionId: row.external_session_id,
      sessionLabel: row.session_label,
      status: row.status as AgentSessionStatus,
      lastKnownStep: row.last_known_step,
      lastSeenAt: row.last_seen_at?.toISOString() || null,
      recoveryPayload: row.recovery_payload,
      metadata: row.metadata,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    };

    await this.emitAuditLog(
      projectId,
      actor,
      "CREATE_AGENT_SESSION",
      "authorized",
      { id, provider, status },
      `Created agent session representing external session reference for provider ${provider}`,
      id,
      ipAddress
    );

    return sessionObj;
  }

  /**
   * Update standard agent session representation.
   */
  public async updateAgentSession(
    projectId: string,
    agentSessionId: string,
    dto: UpdateAgentSessionDTO,
    actor: string,
    ipAddress = "127.0.0.1"
  ): Promise<AgentSession> {
    const checkSql = "SELECT * FROM agent_sessions WHERE id = $1 LIMIT 1;";
    const checkRes = await this.query(checkSql, [agentSessionId]);
    if (checkRes.rowCount === 0) {
      throw new NotFoundError(`Agent session with ID ${agentSessionId} not found.`);
    }

    const currentSession = checkRes.rows[0];
    if (currentSession.project_id !== projectId) {
      await this.emitAuditLog(
        projectId,
        actor,
        "CROSS_PROJECT_SESSION_BLOCKED",
        "denied_untrusted",
        { agentSessionId },
        `Cross-project modification blocked on agent session ${agentSessionId}`,
        agentSessionId,
        ipAddress
      );
      throw new PermissionDeniedError("Permission denied: Agent session belongs to different project.");
    }

    const nextStatus = dto.status || currentSession.status;
    if (!["active", "paused", "recoverable", "expired", "failed", "archived"].includes(nextStatus)) {
      throw new BaseError("BAD_REQUEST", `Unsupported status: ${nextStatus}`, 400);
    }

    // If changing status to active/paused/recoverable, check active uniqueness clashing
    if (["active", "paused", "recoverable"].includes(nextStatus) && !["active", "paused", "recoverable"].includes(currentSession.status)) {
      const activeCheck = await this.query(
        "SELECT id, status FROM agent_sessions WHERE task_id = $1 AND provider = $2 AND status IN ('active', 'paused', 'recoverable') AND id <> $3 LIMIT 1;",
        [currentSession.task_id, currentSession.provider, agentSessionId]
      );
      if (activeCheck.rowCount > 0) {
        throw new ConflictError(`Conflict: Another active session already exists for provider on this task.`);
      }
    }

    const sessionLabel = dto.session_label !== undefined ? redactSecretLeaks(dto.session_label) : currentSession.session_label;
    const lastKnownStep = dto.last_known_step !== undefined ? redactSecretLeaks(dto.last_known_step) : currentSession.last_known_step;
    const recoveryPayload = dto.recovery_payload !== undefined ? JSON.parse(redactSecretLeaks(JSON.stringify(dto.recovery_payload))) : currentSession.recovery_payload;
    const metadata = dto.metadata !== undefined ? JSON.parse(redactSecretLeaks(JSON.stringify(dto.metadata))) : currentSession.metadata;

    const updateSql = `
      UPDATE agent_sessions
      SET status = $1, session_label = $2, last_known_step = $3, recovery_payload = $4, metadata = $5, last_seen_at = NOW(), updated_at = NOW()
      WHERE id = $6
      RETURNING *;
    `;

    const res = await this.query(updateSql, [
      nextStatus,
      sessionLabel,
      lastKnownStep,
      JSON.stringify(recoveryPayload),
      JSON.stringify(metadata),
      agentSessionId
    ]);

    const row = res.rows[0];
    const sessionObj: AgentSession = {
      id: row.id,
      projectId: row.project_id,
      taskId: row.task_id,
      agentMemoryId: row.agent_memory_id,
      resumeStateId: row.resume_state_id,
      provider: row.provider as AgentSessionProvider,
      externalSessionId: row.external_session_id,
      sessionLabel: row.session_label,
      status: row.status as AgentSessionStatus,
      lastKnownStep: row.last_known_step,
      lastSeenAt: row.last_seen_at?.toISOString() || null,
      recoveryPayload: row.recovery_payload,
      metadata: row.metadata,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    };

    await this.emitAuditLog(
      projectId,
      actor,
      "UPDATE_AGENT_SESSION",
      "authorized",
      { id: agentSessionId, status: nextStatus },
      `Updated agent session details for ID ${agentSessionId}`,
      agentSessionId,
      ipAddress
    );

    return sessionObj;
  }

  /**
   * Get specific agent session.
   */
  public async getAgentSessionById(
    projectId: string,
    agentSessionId: string,
    actor: string,
    ipAddress = "127.0.0.1"
  ): Promise<AgentSession> {
    const res = await this.query("SELECT * FROM agent_sessions WHERE id = $1 LIMIT 1;", [agentSessionId]);
    if (res.rowCount === 0) {
      throw new NotFoundError(`Agent session with ID ${agentSessionId} not found.`);
    }

    const row = res.rows[0];
    if (row.project_id !== projectId) {
      await this.emitAuditLog(
        projectId,
        actor,
        "CROSS_PROJECT_SESSION_BLOCKED",
        "denied_untrusted",
        { agentSessionId },
        `Cross-project retrieve blocked on agent session ${agentSessionId}`,
        agentSessionId,
        ipAddress
      );
      throw new PermissionDeniedError("Permission denied: Agent session belongs to different project.");
    }

    return {
      id: row.id,
      projectId: row.project_id,
      taskId: row.task_id,
      agentMemoryId: row.agent_memory_id,
      resumeStateId: row.resume_state_id,
      provider: row.provider as AgentSessionProvider,
      externalSessionId: row.external_session_id,
      sessionLabel: row.session_label,
      status: row.status as AgentSessionStatus,
      lastKnownStep: row.last_known_step,
      lastSeenAt: row.last_seen_at?.toISOString() || null,
      recoveryPayload: row.recovery_payload,
      metadata: row.metadata,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    };
  }

  /**
   * List all agent sessions for task.
   */
  public async getAgentSessionsByTaskId(
    projectId: string,
    taskId: string,
    actor: string
  ): Promise<AgentSession[]> {
    await this.validateProjectAndTaskScope(projectId, taskId);

    const res = await this.query(
      "SELECT * FROM agent_sessions WHERE task_id = $1 ORDER BY created_at DESC;",
      [taskId]
    );

    return res.rows.map((row: any) => ({
      id: row.id,
      projectId: row.project_id,
      taskId: row.task_id,
      agentMemoryId: row.agent_memory_id,
      resumeStateId: row.resume_state_id,
      provider: row.provider as AgentSessionProvider,
      externalSessionId: row.external_session_id,
      sessionLabel: row.session_label,
      status: row.status as AgentSessionStatus,
      lastKnownStep: row.last_known_step,
      lastSeenAt: row.last_seen_at?.toISOString() || null,
      recoveryPayload: row.recovery_payload,
      metadata: row.metadata,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    }));
  }

  /**
   * Retrieve the latest recoverable session for task.
   */
  public async getLatestRecoverableSession(
    projectId: string,
    taskId: string,
    provider: AgentSessionProvider | null,
    actor: string,
    ipAddress = "127.0.0.1"
  ): Promise<{ session: AgentSession | null, warnings: string[] }> {
    await this.validateProjectAndTaskScope(projectId, taskId);

    let sql = `
      SELECT * FROM agent_sessions 
      WHERE task_id = $1
    `;
    const params: unknown[] = [taskId];

    if (provider) {
      sql += " AND provider = $2";
      params.push(provider);
    }

    // Order by: prefer recoverable or paused, then active, then others, then newest
    sql += `
      ORDER BY 
        CASE 
          WHEN status IN ('recoverable', 'paused') THEN 1 
          WHEN status = 'active' THEN 2 
          ELSE 3 
        END ASC, 
        created_at DESC 
      LIMIT 1;
    `;

    const res = await this.query(sql, params);
    const warnings: string[] = [];

    await this.emitAuditLog(
      projectId,
      actor,
      "READ_AGENT_SESSION",
      "authorized",
      { taskId, provider },
      `Latest session recovery requested for task ${taskId}`,
      "",
      ipAddress
    );

    if (res.rowCount === 0) {
      warnings.push("No stored agent session reference was found for this task.");
      return { session: null, warnings };
    }

    const row = res.rows[0];
    const session: AgentSession = {
      id: row.id,
      projectId: row.project_id,
      taskId: row.task_id,
      agentMemoryId: row.agent_memory_id,
      resumeStateId: row.resume_state_id,
      provider: row.provider as AgentSessionProvider,
      externalSessionId: row.external_session_id,
      sessionLabel: row.session_label,
      status: row.status as AgentSessionStatus,
      lastKnownStep: row.last_known_step,
      lastSeenAt: row.last_seen_at?.toISOString() || null,
      recoveryPayload: row.recovery_payload,
      metadata: row.metadata,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    };

    if (["expired", "failed", "archived"].includes(session.status)) {
      warnings.push(`The latest session found (${session.id}) is in an unrecoverable state (${session.status}).`);
      
      await this.emitAuditLog(
        projectId,
        actor,
        "UNRECOVERABLE_SESSION_DETECTED",
        "authorized",
        { id: session.id, status: session.status },
        `Unrecoverable agent session state encountered during latest retrieval: ${session.status}`,
        session.id,
        ipAddress
      );
    }

    return { session, warnings };
  }

  /**
   * Parse stored TASK_STATE.md format from Database/Context Vault.
   */
  public async parseTaskStateFallback(
    projectId: string,
    taskId: string,
    actor: string,
    ipAddress = "127.0.0.1"
  ): Promise<{ parsed: any | null, warning: string | null }> {
    await this.validateProjectAndTaskScope(projectId, taskId);

    // Context item matching source_uri LIKE '%TASK_STATE.md'
    const sql = `
      SELECT cc.content
      FROM context_items ci
      JOIN context_chunks cc ON ci.id = cc.context_item_id
      WHERE ci.project_id = $1
        AND (ci.source_uri LIKE '%TASK_STATE.md' OR ci.id LIKE '%TASK_STATE.md')
      ORDER BY ci.created_at DESC, cc.chunk_index ASC;
    `;

    const res = await this.query(sql, [projectId]);
    if (res.rowCount === 0) {
      await this.emitAuditLog(
        projectId,
        actor,
        "TASK_STATE_FALLBACK_MISSING",
        "authorized",
        { taskId },
        "Attempted fallback parsing but TASK_STATE.md document was not registered in the Context Vault.",
        "",
        ipAddress
      );
      return { parsed: null, warning: "TASK_STATE.md documentation structure is not registered in the Context Vault." };
    }

    const concatenatedContent = res.rows.map((row: any) => row.content).join("\n");
    const parsed = parseTaskStateMarkdown(concatenatedContent);

    await this.emitAuditLog(
      projectId,
      actor,
      "TASK_STATE_FALLBACK_PARSED",
      "authorized",
      { taskId, extractedFields: Object.keys(parsed) },
      "Successfully extracted safe contextual metadata from stored TASK_STATE.md documentation.",
      "",
      ipAddress
    );

    return { parsed, warning: null };
  }

  /**
   * Prepares a comprehensive safe recovery payload.
   */
  public async generateRecoveryPayload(
    projectId: string,
    taskId: string,
    actor: string,
    ipAddress = "127.0.0.1"
  ): Promise<any> {
    await this.validateProjectAndTaskScope(projectId, taskId);

    const { session, warnings } = await this.getLatestRecoverableSession(projectId, taskId, null, actor, ipAddress);
    
    // Fetch latest active resume state if exists
    const stateRes = await this.query(
      "SELECT id, repo_diff_snapshot, failed_step, current_phase FROM resume_states WHERE task_id = $1 AND project_id = $2 ORDER BY created_at DESC LIMIT 1;",
      [taskId, projectId]
    );

    // Fetch latest agent memory
    const memoryRes = await this.query(
      "SELECT id, what_agent_did, why_agent_did_it FROM agent_memories WHERE task_id = $1 AND project_id = $2 ORDER BY created_at DESC LIMIT 1;",
      [taskId, projectId]
    );

    // Fetch fallback from TASK_STATE.md
    const fallbackRes = await this.parseTaskStateFallback(projectId, taskId, actor, ipAddress);

    const resumeState = stateRes.rowCount > 0 ? {
      id: stateRes.rows[0].id,
      phase: stateRes.rows[0].current_phase,
      failed_step: stateRes.rows[0].failed_step,
      git_diff_redacted_length: stateRes.rows[0].repo_diff_snapshot ? JSON.stringify(stateRes.rows[0].repo_diff_snapshot).length : 0
    } : null;

    const agentMemory = memoryRes.rowCount > 0 ? {
      id: memoryRes.rows[0].id,
      what_agent_did: memoryRes.rows[0].what_agent_did,
      why_agent_did_it: memoryRes.rows[0].why_agent_did_it
    } : null;

    if (fallbackRes.warning) {
      warnings.push(fallbackRes.warning);
    }

    const payload = {
      task_id: taskId,
      project_id: projectId,
      active_session: session ? {
        id: session.id,
        provider: session.provider,
        external_session_id: session.externalSessionId,
        status: session.status,
        last_known_step: session.lastKnownStep,
        last_seen_at: session.lastSeenAt,
        recovery_payload: session.recoveryPayload
      } : null,
      resume_state_reference: resumeState,
      agent_memory_reference: agentMemory,
      task_state_fallback: fallbackRes.parsed,
      warnings,
      recovery_prepared_at: new Date().toISOString()
    };

    await this.emitAuditLog(
      projectId,
      actor,
      "GENERATE_RECOVERY_PAYLOAD",
      "authorized",
      { taskId, hasActiveSession: !!session, hasFallback: !!fallbackRes.parsed },
      `Generated safe unified agent recovery payload ready for local CLI/resumption handoff for task ${taskId}`,
      taskId,
      ipAddress
    );

    return payload;
  }
}
