import { 
  ResumeState, 
  CreateResumeStateDTO, 
  UpdateResumeStateDTO,
  NotFoundError,
  PermissionDeniedError,
  ConflictError,
  BaseError,
  ResumeSchedule,
  ResumeScheduleType,
  ResumeScheduleStatus,
  CreateResumeScheduleDTO,
  UpdateResumeScheduleDTO
} from "@y/shared";
import { redactSecretLeaks } from "@y/security";

export class ResumeEngineService {
  constructor(private pool: any) {
    if (!pool) {
      throw new Error("A valid database connection pool is required for ResumeEngineService.");
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
   * Emits structural and redacted audit logs for RESUME activity.
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
      cleanMetadata = this.redactObjectRecursively(metadata);
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
      console.error(`ResumeEngineService Audit Log emission failed: ${err.message}`);
    }
  }

  /**
   * Recursively redacts all sensitive strings from an object
   */
  private redactObjectRecursively(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === "string") {
      return redactSecretLeaks(obj);
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.redactObjectRecursively(item));
    }
    if (typeof obj === "object") {
      const copy: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        const cleanKey = redactSecretLeaks(key);
        copy[cleanKey] = this.redactObjectRecursively(value);
      }
      return copy;
    }
    return obj;
  }

  /**
   * Implements pause task logic (RESUME-007)
   */
  public async pauseTask(
    projectId: string,
    taskId: string,
    pausedReason: string,
    actor: string,
    ipAddress = "127.0.0.1"
  ): Promise<ResumeState> {
    await this.validateProjectAndTaskScope(projectId, taskId);

    // Update task status in database
    await this.query(
      "UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2 AND project_id = $3;",
      ["paused", taskId, projectId]
    );

    const id = `resume_state_${Math.random().toString(36).substring(2, 11)}`;
    const defaultTaskState = {
      taskId,
      projectId,
      featureIdsInProgress: [],
      currentStep: "paused",
      completedSteps: [],
      pendingSteps: [],
      blockedSteps: [],
      knownRisks: [],
      validationStatus: "unknown"
    };

    const defaultRepoDiff = {
      source: "metadata_only",
      files: []
    };

    const redactedReason = redactSecretLeaks(pausedReason);

    await this.query(
      `INSERT INTO resume_states (
        id, project_id, task_id, status, paused_reason, task_state, repo_diff_snapshot,
        current_phase, failed_step, next_action, affected_files, validation_state,
        resume_payload, confidence_score, metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW());`,
      [
        id,
        projectId,
        taskId,
        "paused",
        redactedReason,
        JSON.stringify(defaultTaskState),
        JSON.stringify(defaultRepoDiff),
        "Pause Phase",
        null,
        "Awaiting resume action",
        JSON.stringify([]),
        JSON.stringify({}),
        JSON.stringify({}),
        100.0,
        JSON.stringify({})
      ]
    );

    await this.emitAuditLog(
      projectId,
      actor,
      "PAUSE_TASK",
      "authorized",
      { id, taskId, status: "paused", pausedReason: redactedReason },
      `Task ${taskId} is successfully paused by ${actor}`,
      id,
      ipAddress
    );

    return this.getResumeStateById(projectId, id, actor, ipAddress);
  }

  /**
   * Creates a brand new resumable state
   */
  public async createResumeState(
    projectId: string,
    taskId: string,
    dto: CreateResumeStateDTO,
    actor: string,
    ipAddress = "127.0.0.1"
  ): Promise<ResumeState> {
    await this.validateProjectAndTaskScope(projectId, taskId);

    const id = `resume_state_${Math.random().toString(36).substring(2, 11)}`;

    // Redact all entries before database write
    const cleanStatus = redactSecretLeaks(dto.status || "paused");
    const cleanPausedReason = dto.pausedReason ? redactSecretLeaks(dto.pausedReason) : null;
    const cleanTaskState = this.redactObjectRecursively(dto.taskState || {});
    const cleanRepoDiff = this.redactObjectRecursively(dto.repoDiffSnapshot || { source: "metadata_only", files: [] });
    const cleanPhase = dto.currentPhase ? redactSecretLeaks(dto.currentPhase) : null;
    const cleanFailedStep = dto.failedStep ? this.redactObjectRecursively(dto.failedStep) : null;
    const cleanNextAction = dto.nextAction ? redactSecretLeaks(dto.nextAction) : null;
    const cleanAffectedFiles = this.redactObjectRecursively(dto.affectedFiles || []);
    const cleanValidation = this.redactObjectRecursively(dto.validationState || {});
    const cleanPayload = this.redactObjectRecursively(dto.resumePayload || {});
    const cleanScore = dto.confidenceScore !== undefined ? Number(dto.confidenceScore) : 100.0;
    const cleanMetadata = this.redactObjectRecursively(dto.metadata || {});

    await this.query(
      `INSERT INTO resume_states (
        id, project_id, task_id, agent_memory_id, context_pack_id, change_simulation_id,
        status, paused_reason, task_state, repo_diff_snapshot,
        current_phase, failed_step, next_action, affected_files, validation_state,
        resume_payload, confidence_score, metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW());`,
      [
        id,
        projectId,
        taskId,
        dto.agentMemoryId || null,
        dto.contextPackId || null,
        dto.changeSimulationId || null,
        cleanStatus,
        cleanPausedReason,
        JSON.stringify(cleanTaskState),
        JSON.stringify(cleanRepoDiff),
        cleanPhase,
        cleanFailedStep ? JSON.stringify(cleanFailedStep) : null,
        cleanNextAction,
        JSON.stringify(cleanAffectedFiles),
        JSON.stringify(cleanValidation),
        JSON.stringify(cleanPayload),
        cleanScore,
        JSON.stringify(cleanMetadata)
      ]
    );

    await this.emitAuditLog(
      projectId,
      actor,
      "CREATE_RESUME_STATE",
      "authorized",
      { id, taskId, status: cleanStatus, repoDiffSnapshot: cleanRepoDiff, nextAction: cleanNextAction, failedStep: cleanFailedStep },
      `Created resume state ${id} for task ${taskId}`,
      id,
      ipAddress
    );

    return this.getResumeStateById(projectId, id, actor, ipAddress);
  }

  /**
   * Updates an existing resumable state (RESUME-008 to RESUME-013)
   */
  public async updateResumeState(
    projectId: string,
    resumeStateId: string,
    updates: UpdateResumeStateDTO,
    actor: string,
    ipAddress = "127.0.0.1"
  ): Promise<ResumeState> {
    const checkRes = await this.query("SELECT id, project_id, task_id FROM resume_states WHERE id = $1 LIMIT 1;", [resumeStateId]);
    if (checkRes.rowCount === 0) {
      throw new NotFoundError(`Resume State ${resumeStateId} not found.`);
    }
    if (checkRes.rows[0].project_id !== projectId) {
      throw new PermissionDeniedError(`Permission denied: Resume State ${resumeStateId} cross-project access is blocked.`);
    }

    const taskId = checkRes.rows[0].task_id;
    await this.validateProjectAndTaskScope(projectId, taskId);

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(redactSecretLeaks(updates.status));
    }
    if (updates.pausedReason !== undefined) {
      fields.push(`paused_reason = $${idx++}`);
      values.push(updates.pausedReason ? redactSecretLeaks(updates.pausedReason) : null);
    }
    if (updates.taskState !== undefined) {
      fields.push(`task_state = $${idx++}`);
      values.push(JSON.stringify(this.redactObjectRecursively(updates.taskState)));
    }
    if (updates.repoDiffSnapshot !== undefined) {
      fields.push(`repo_diff_snapshot = $${idx++}`);
      values.push(JSON.stringify(this.redactObjectRecursively(updates.repoDiffSnapshot)));
    }
    if (updates.currentPhase !== undefined) {
      fields.push(`current_phase = $${idx++}`);
      values.push(updates.currentPhase ? redactSecretLeaks(updates.currentPhase) : null);
    }
    if (updates.failedStep !== undefined) {
      fields.push(`failed_step = $${idx++}`);
      values.push(updates.failedStep ? JSON.stringify(this.redactObjectRecursively(updates.failedStep)) : null);
    }
    if (updates.nextAction !== undefined) {
      fields.push(`next_action = $${idx++}`);
      values.push(updates.nextAction ? redactSecretLeaks(updates.nextAction) : null);
    }
    if (updates.affectedFiles !== undefined) {
      fields.push(`affected_files = $${idx++}`);
      values.push(JSON.stringify(this.redactObjectRecursively(updates.affectedFiles)));
    }
    if (updates.validationState !== undefined) {
      fields.push(`validation_state = $${idx++}`);
      values.push(JSON.stringify(this.redactObjectRecursively(updates.validationState)));
    }
    if (updates.resumePayload !== undefined) {
      fields.push(`resume_payload = $${idx++}`);
      values.push(JSON.stringify(this.redactObjectRecursively(updates.resumePayload)));
    }
    if (updates.confidenceScore !== undefined) {
      fields.push(`confidence_score = $${idx++}`);
      values.push(Number(updates.confidenceScore));
    }
    if (updates.metadata !== undefined) {
      fields.push(`metadata = $${idx++}`);
      values.push(JSON.stringify(this.redactObjectRecursively(updates.metadata)));
    }
    if (updates.agentMemoryId !== undefined) {
      fields.push(`agent_memory_id = $${idx++}`);
      values.push(updates.agentMemoryId || null);
    }
    if (updates.contextPackId !== undefined) {
      fields.push(`context_pack_id = $${idx++}`);
      values.push(updates.contextPackId || null);
    }
    if (updates.changeSimulationId !== undefined) {
      fields.push(`change_simulation_id = $${idx++}`);
      values.push(updates.changeSimulationId || null);
    }

    if (fields.length > 0) {
      fields.push(`updated_at = NOW()`);
      
      const queryStr = `UPDATE resume_states SET ${fields.join(", ")} WHERE id = $${idx++} AND project_id = $${idx++};`;
      values.push(resumeStateId);
      values.push(projectId);
      
      await this.query(queryStr, values);
    }

    await this.emitAuditLog(
      projectId,
      actor,
      "UPDATE_RESUME_STATE",
      "authorized",
      { id: resumeStateId, taskId, updates: this.redactObjectRecursively(updates) },
      `Updated resume state ${resumeStateId}`,
      resumeStateId,
      ipAddress
    );

    return this.getResumeStateById(projectId, resumeStateId, actor, ipAddress);
  }

  /**
   * Retrieves single resume state by ID under project constraints
   */
  public async getResumeStateById(
    projectId: string,
    resumeStateId: string,
    actor: string,
    ipAddress = "127.0.0.1"
  ): Promise<ResumeState> {
    const res = await this.query("SELECT * FROM resume_states WHERE id = $1 AND project_id = $2 LIMIT 1;", [resumeStateId, projectId]);
    if (res.rowCount === 0) {
      throw new NotFoundError(`Resume State ${resumeStateId} under project ${projectId} not found.`);
    }

    await this.emitAuditLog(
      projectId,
      actor,
      "READ_RESUME_STATE",
      "authorized",
      { id: resumeStateId },
      `Read resume state ${resumeStateId}`,
      resumeStateId,
      ipAddress
    );

    return this.mapRowToResumeState(res.rows[0]);
  }

  /**
   * Retrieves latest resume state for task (RESUME-014)
   */
  public async getLatestResumeStateForTask(
    projectId: string,
    taskId: string,
    actor: string,
    ipAddress = "127.0.0.1"
  ): Promise<ResumeState | null> {
    await this.validateProjectAndTaskScope(projectId, taskId);

    const res = await this.query(
      "SELECT * FROM resume_states WHERE task_id = $1 AND project_id = $2 ORDER BY created_at DESC LIMIT 1;",
      [taskId, projectId]
    );

    if (res.rowCount === 0) {
      return null;
    }

    await this.emitAuditLog(
      projectId,
      actor,
      "READ_RESUME_STATE",
      "authorized",
      { taskId, id: res.rows[0].id },
      `Read latest resume state for task ${taskId}`,
      res.rows[0].id,
      ipAddress
    );

    return this.mapRowToResumeState(res.rows[0]);
  }

  /**
   * Evaluates exact resume payload (RESUME-014)
   */
  public async getResumePayload(
    projectId: string,
    taskId: string,
    actor: string,
    ipAddress = "127.0.0.1"
  ): Promise<any> {
    await this.validateProjectAndTaskScope(projectId, taskId);

    const state = await this.getLatestResumeStateForTask(projectId, taskId, actor, ipAddress);
    if (!state) {
      await this.emitAuditLog(
        projectId,
        actor,
        "RESUME_BLOCKED",
        "denied_untrusted",
        { taskId },
        `Resume blocked for task ${taskId}: no resume state found.`,
        "",
        ipAddress
      );
      throw new NotFoundError(`No resumable state found for task '${taskId}'.`);
    }

    // Load active boundaries for task
    let allowedBoundaries: Record<string, any> = {};
    let forbiddenBoundaries: Record<string, any> = {};
    const boundRes = await this.query(
      `SELECT allowed_files, forbidden_files, allowed_patterns, forbidden_patterns, allowed_domains, forbidden_domains 
       FROM task_boundaries WHERE task_id = $1 ORDER BY created_at DESC LIMIT 1;`,
      [taskId]
    );

    if (boundRes.rowCount > 0) {
      const boundRow = boundRes.rows[0];
      allowedBoundaries = {
        files: boundRow.allowed_files || [],
        patterns: boundRow.allowed_patterns || [],
        domains: boundRow.allowed_domains || []
      };
      forbiddenBoundaries = {
        files: boundRow.forbidden_files || [],
        patterns: boundRow.forbidden_patterns || [],
        domains: boundRow.forbidden_domains || []
      };
    }

    const warnings: string[] = [];
    if (state.failedStep && !state.failedStep.resolved) {
      warnings.push(`Task was paused due to failed step: ${state.failedStep.message || "Unknown error"}. Resolution recommended.`);
    }

    const payload = {
      task_id: state.taskId,
      project_id: state.projectId,
      resume_state_id: state.id,
      current_phase: state.currentPhase || "Unknown",
      task_state: state.taskState,
      repo_diff_snapshot: state.repoDiffSnapshot,
      failed_step: state.failedStep,
      next_action: state.nextAction || "",
      affected_files: state.affectedFiles,
      validation_state: state.validationState,
      allowed_boundaries: allowedBoundaries,
      forbidden_boundaries: forbiddenBoundaries,
      context_refs: {
        context_pack_id: state.contextPackId
      },
      agent_memory_refs: {
        agent_memory_id: state.agentMemoryId
      },
      ready_to_resume: true,
      warnings
    };

    await this.emitAuditLog(
      projectId,
      actor,
      "GET_RESUME_PAYLOAD",
      "authorized",
      { taskId, resumeStateId: state.id },
      `Generated resume payload for task ${taskId}`,
      state.id,
      ipAddress
    );

    return payload;
  }

  private mapRowToResumeState(row: any): ResumeState {
    const taskState = typeof row.task_state === "string" ? JSON.parse(row.task_state) : row.task_state;
    const repoDiffSnapshot = typeof row.repo_diff_snapshot === "string" ? JSON.parse(row.repo_diff_snapshot) : row.repo_diff_snapshot;
    const failedStep = row.failed_step ? (typeof row.failed_step === "string" ? JSON.parse(row.failed_step) : row.failed_step) : null;
    const affectedFiles = typeof row.affected_files === "string" ? JSON.parse(row.affected_files) : row.affected_files;
    const validationState = typeof row.validation_state === "string" ? JSON.parse(row.validation_state) : row.validation_state;
    const resumePayload = typeof row.resume_payload === "string" ? JSON.parse(row.resume_payload) : row.resume_payload;
    const metadata = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;

    return {
      id: row.id,
      projectId: row.project_id,
      taskId: row.task_id,
      agentMemoryId: row.agent_memory_id,
      contextPackId: row.context_pack_id,
      changeSimulationId: row.change_simulation_id,
      status: row.status,
      pausedReason: row.paused_reason,
      taskState,
      repoDiffSnapshot,
      currentPhase: row.current_phase,
      failedStep,
      nextAction: row.next_action,
      affectedFiles,
      validationState,
      resumePayload,
      confidenceScore: Number(row.confidence_score || 100),
      metadata,
      createdAt: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
      updatedAt: row.updated_at.toISOString ? row.updated_at.toISOString() : row.updated_at,

      // backward compatibility fields
      sessionSnapshotRef: row.id,
      gitDiffSnapshot: repoDiffSnapshot?.redacted_diffs?.join("\n") || "",
      lastHaltedStep: failedStep?.failed_command || failedStep?.failed_endpoint || "unknown",
      nextRecommendedAction: row.next_action || ""
    };
  }

  /**
   * Creates a resume schedule entry for persistent timed resumes (RESUME-015 to RESUME-019)
   */
  public async createResumeSchedule(
    projectId: string,
    taskId: string,
    dto: CreateResumeScheduleDTO,
    actor: string,
    ipAddress = "127.0.0.1"
  ): Promise<ResumeSchedule> {
    await this.validateProjectAndTaskScope(projectId, taskId);

    const scheduleType = dto.schedule_type;
    let delayMinutes = 0;

    if (scheduleType === "one_hour") {
      delayMinutes = 60;
    } else if (scheduleType === "three_hours") {
      delayMinutes = 180;
    } else if (scheduleType === "one_day") {
      delayMinutes = 1440;
    } else if (scheduleType === "custom") {
      delayMinutes = Number(dto.delay_minutes);
    } else {
      await this.emitAuditLog(
        projectId,
        actor,
        "REJECT_INVALID_SCHEDULE",
        "denied_untrusted",
        { taskId, scheduleType },
        `Schedule rejection: invalid schedule type '${scheduleType}'`,
        "",
        ipAddress
      );
      throw new BaseError("BAD_REQUEST", `Invalid schedule_type '${scheduleType}'. Must be one_hour, three_hours, one_day, or custom.`, 400);
    }

    // Minimum delay: 5 minutes. Maximum delay: 30 days.
    const MIN_DELAY = 5;
    const MAX_DELAY = 30 * 24 * 60; // 43200 minutes

    if (isNaN(delayMinutes) || delayMinutes < MIN_DELAY || delayMinutes > MAX_DELAY) {
      await this.emitAuditLog(
        projectId,
        actor,
        "REJECT_INVALID_SCHEDULE",
        "denied_untrusted",
        { taskId, scheduleType, delayMinutes },
        `Schedule rejection: delay minutes ${delayMinutes} out of safe bounds [5 - 43200]`,
        "",
        ipAddress
      );
      throw new BaseError("BAD_REQUEST", `Invalid delay_minutes: must be between 5 minutes and 30 days. Received: ${delayMinutes}`, 400);
    }

    // Active schedule uniqueness check (Phase 13.1) - check conflict / replace only after inputs are validated
    const activeRes = await this.query(
      "SELECT id, resume_at, status, queue_status FROM resume_schedules WHERE task_id = $1 AND status IN ('scheduled', 'ready', 'requeued') LIMIT 1;",
      [taskId]
    );

    if (activeRes.rowCount > 0) {
      const activeSched = activeRes.rows[0];
      if (dto.replace_existing === true) {
        await this.query(
          "UPDATE resume_schedules SET status = 'cancelled', queue_status = 'cancelled', updated_at = NOW() WHERE id = $1 AND project_id = $2;",
          [activeSched.id, projectId]
        );
        
        await this.emitAuditLog(
          projectId,
          actor,
          "CANCEL_RESUME_SCHEDULE",
          "authorized",
          { 
            id: activeSched.id, 
            project_id: projectId,
            task_id: taskId, 
            status: "cancelled", 
            queue_status: "cancelled", 
            reason: "Replaced by replacement schedule" 
          },
          `Cancelled schedule ${activeSched.id} due to replacement`,
          activeSched.id,
          ipAddress
        );

        await this.emitAuditLog(
          projectId,
          actor,
          "RESUME_SCHEDULE_REPLACED",
          "authorized",
          { 
            project_id: projectId,
            task_id: taskId,
            status: "scheduled",
            queue_status: "waiting",
            previous_schedule_id: activeSched.id,
            reason: dto.reason || "User replaced existing schedule"
          },
          `Replaced existing schedule ${activeSched.id} for task ${taskId}`,
          activeSched.id,
          ipAddress
        );
      } else {
        const resumeAtStr = activeSched.resume_at.toISOString ? activeSched.resume_at.toISOString() : activeSched.resume_at;
        
        await this.emitAuditLog(
          projectId,
          actor,
          "RESUME_SCHEDULE_DUPLICATE_REJECTED",
          "denied_conflict",
          { 
            project_id: projectId,
            task_id: taskId,
            schedule_id: activeSched.id,
            resume_at: resumeAtStr,
            status: activeSched.status,
            queue_status: activeSched.queue_status,
            reason: "Duplicate schedule insertion rejected"
          },
          `Duplicate active schedule rejection for task ${taskId}: existing active schedule ${activeSched.id} set at ${resumeAtStr}`,
          activeSched.id,
          ipAddress
        );

        throw new ConflictError(`Task ${taskId} already has an active resume schedule.`, {
          schedule_id: activeSched.id,
          resume_at: resumeAtStr,
          status: activeSched.status,
          queue_status: activeSched.queue_status
        });
      }
    }

    // Find latest resume_state_id if exists
    const stateRes = await this.query(
      "SELECT id FROM resume_states WHERE task_id = $1 AND project_id = $2 ORDER BY created_at DESC LIMIT 1;",
      [taskId, projectId]
    );
    const resumeStateId = stateRes.rowCount > 0 ? stateRes.rows[0].id : null;

    const id = `schedule_${Math.random().toString(36).substring(2, 11)}`;
    const now = new Date();
    const resumeAt = new Date(now.getTime() + delayMinutes * 60000);

    const cleanReason = dto.reason ? redactSecretLeaks(dto.reason) : null;
    const redactedMetadata = this.redactObjectRecursively(dto.metadata || {});
    const finalMetadata = {
      ...redactedMetadata,
      reason: cleanReason,
      scheduled_by: actor
    };

    await this.query(
      `INSERT INTO resume_schedules (
        id, project_id, task_id, resume_state_id, schedule_type, delay_minutes,
        resume_at, status, queue_status, attempts, last_attempt_at, next_attempt_at,
        metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW());`,
      [
        id,
        projectId,
        taskId,
        resumeStateId,
        scheduleType,
        delayMinutes,
        resumeAt,
        "scheduled",
        "waiting",
        0,
        null,
        resumeAt,
        JSON.stringify(finalMetadata)
      ]
    );

    await this.emitAuditLog(
      projectId,
      actor,
      "CREATE_RESUME_SCHEDULE",
      "authorized",
      { id, taskId, scheduleType, delayMinutes, resumeAt: resumeAt.toISOString(), resumeStateId },
      `Created persistent resume schedule ${id} for task ${taskId} set at ${resumeAt.toISOString()}`,
      id,
      ipAddress
    );

    // Trigger paused queue addition log (REQ)
    await this.emitAuditLog(
      projectId,
      actor,
      "ADD_TASK_TO_PAUSED_QUEUE",
      "authorized",
      { id, taskId, status: "paused", key: "scheduler" },
      `Task ${taskId} added to paused queue via schedule creation ${id}`,
      id,
      ipAddress
    );

    return this.getResumeScheduleById(projectId, id, actor, ipAddress);
  }

  /**
   * Retrieves single schedule entry
   */
  public async getResumeScheduleById(
    projectId: string,
    scheduleId: string,
    actor: string,
    ipAddress = "127.0.0.1"
  ): Promise<ResumeSchedule> {
    const res = await this.query("SELECT * FROM resume_schedules WHERE id = $1 LIMIT 1;", [scheduleId]);
    if (res.rowCount === 0) {
      throw new NotFoundError(`Resume Schedule ${scheduleId} not found.`);
    }

    const row = res.rows[0];
    if (row.project_id !== projectId) {
      await this.emitAuditLog(
        projectId,
        actor,
        "DENIED_CROSS_PROJECT",
        "denied_untrusted",
        { scheduleId },
        `Cross-project schedule access blocked for actor ${actor}`,
        scheduleId,
        ipAddress
      );
      throw new PermissionDeniedError(`Permission denied: Resume Schedule ${scheduleId} does not belong to specified project.`);
    }

    return this.mapRowToResumeSchedule(row);
  }

  /**
   * Retrieves schedules of a task
   */
  public async getResumeSchedulesForTask(
    projectId: string,
    taskId: string,
    actor: string,
    ipAddress = "127.0.0.1"
  ): Promise<ResumeSchedule[]> {
    await this.validateProjectAndTaskScope(projectId, taskId);

    const res = await this.query(
      "SELECT * FROM resume_schedules WHERE task_id = $1 AND project_id = $2 ORDER BY created_at DESC;",
      [taskId, projectId]
    );

    return res.rows.map(row => this.mapRowToResumeSchedule(row));
  }

  /**
   * Lists the paused/resume queue (RESUME-020)
   */
  public async getProjectResumeQueue(
    projectId: string,
    filters: {
      status?: ResumeScheduleStatus;
      queue_status?: string;
      task_id?: string;
      limit?: number;
      offset?: number;
    },
    actor: string,
    ipAddress = "127.0.0.1"
  ): Promise<ResumeSchedule[]> {
    // Validate project scope
    const projRes = await this.query("SELECT id FROM projects WHERE id = $1 LIMIT 1;", [projectId]);
    if (projRes.rowCount === 0) {
      throw new NotFoundError(`Project scope validation failed: Project ${projectId} not found.`);
    }

    await this.emitAuditLog(
      projectId,
      actor,
      "READ_RESUME_STATE",
      "authorized",
      filters,
      `Listed paused resume queue for project ${projectId}`,
      "",
      ipAddress
    );

    const conditions: string[] = ["project_id = $1"];
    const params: any[] = [projectId];
    let idx = 2;

    if (filters.status) {
      conditions.push(`status = $${idx++}`);
      params.push(filters.status);
    }
    if (filters.queue_status) {
      conditions.push(`queue_status = $${idx++}`);
      params.push(filters.queue_status);
    }
    if (filters.task_id) {
      conditions.push(`task_id = $${idx++}`);
      params.push(filters.task_id);
    }

    const limit = filters.limit ? Number(filters.limit) : 50;
    const offset = filters.offset ? Number(filters.offset) : 0;

    let queryStr = `SELECT * FROM resume_schedules WHERE ${conditions.join(" AND ")} ORDER BY resume_at ASC`;
    queryStr += ` LIMIT $${idx++} OFFSET $${idx++};`;
    params.push(limit, offset);

    const res = await this.query(queryStr, params);
    return res.rows.map(row => this.mapRowToResumeSchedule(row));
  }

  /**
   * Updates schedule entry parameters cleanly (redacting secrets)
   */
  public async updateResumeSchedule(
    projectId: string,
    scheduleId: string,
    dto: UpdateResumeScheduleDTO,
    actor: string,
    ipAddress = "127.0.0.1"
  ): Promise<ResumeSchedule> {
    const existing = await this.getResumeScheduleById(projectId, scheduleId, actor, ipAddress);

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (dto.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(redactSecretLeaks(dto.status));
    }
    if (dto.queueStatus !== undefined) {
      fields.push(`queue_status = $${idx++}`);
      values.push(redactSecretLeaks(dto.queueStatus));
    }
    if (dto.attempts !== undefined) {
      fields.push(`attempts = $${idx++}`);
      values.push(Number(dto.attempts));
    }
    if (dto.delay_minutes !== undefined) {
      fields.push(`delay_minutes = $${idx++}`);
      values.push(Number(dto.delay_minutes));
    }
    if (dto.resume_at !== undefined) {
      fields.push(`resume_at = $${idx++}`);
      values.push(new Date(dto.resume_at));
      fields.push(`next_attempt_at = $${idx++}`);
      values.push(new Date(dto.resume_at));
    }
    if (dto.metadata !== undefined) {
      fields.push(`metadata = $${idx++}`);
      const redactedMeta = this.redactObjectRecursively(dto.metadata);
      values.push(JSON.stringify({ ...existing.metadata, ...redactedMeta }));
    }

    if (fields.length > 0) {
      fields.push(`updated_at = NOW()`);
      const queryStr = `UPDATE resume_schedules SET ${fields.join(", ")} WHERE id = $${idx++} AND project_id = $${idx++};`;
      values.push(scheduleId);
      values.push(projectId);
      await this.query(queryStr, values);
    }

    await this.emitAuditLog(
      projectId,
      actor,
      "UPDATE_RESUME_SCHEDULE",
      "authorized",
      { id: scheduleId, updates: this.redactObjectRecursively(dto) },
      `Updated schedule ${scheduleId}`,
      scheduleId,
      ipAddress
    );

    return this.getResumeScheduleById(projectId, scheduleId, actor, ipAddress);
  }

  /**
   * Cancels scheduled resume state
   */
  public async cancelResumeSchedule(
    projectId: string,
    scheduleId: string,
    actor: string,
    ipAddress = "127.0.0.1"
  ): Promise<ResumeSchedule> {
    await this.getResumeScheduleById(projectId, scheduleId, actor, ipAddress);

    await this.query(
      "UPDATE resume_schedules SET status = 'cancelled', queue_status = 'cancelled', updated_at = NOW() WHERE id = $1 AND project_id = $2;",
      [scheduleId, projectId]
    );

    await this.emitAuditLog(
      projectId,
      actor,
      "CANCEL_RESUME_SCHEDULE",
      "authorized",
      { id: scheduleId },
      `Cancelled scheduler entry ${scheduleId}`,
      scheduleId,
      ipAddress
    );

    return this.getResumeScheduleById(projectId, scheduleId, actor, ipAddress);
  }

  /**
   * Scans and prepares pending schedules where resumeAt is due (RESUME-021)
   */
  public async autoRequeueReadySchedules(
    projectId: string,
    actor: string,
    ipAddress = "127.0.0.1"
  ): Promise<ResumeSchedule[]> {
    // Scope project verification
    const projRes = await this.query("SELECT id FROM projects WHERE id = $1 LIMIT 1;", [projectId]);
    if (projRes.rowCount === 0) {
      throw new NotFoundError(`Project scope validation failed: Project ${projectId} not found.`);
    }

    await this.emitAuditLog(
      projectId,
      actor,
      "SCAN_AUTO_REQUEUE",
      "authorized",
      {},
      `Started scheduled auto requeue ready scan for project ${projectId}`,
      "",
      ipAddress
    );

    // Fetch schedules that are in active statuses and past due (<= NOW) (Phase 13.1)
    const res = await this.query(
      "SELECT * FROM resume_schedules WHERE project_id = $1 AND status IN ('scheduled', 'ready', 'requeued') AND resume_at <= NOW() ORDER BY resume_at ASC;",
      [projectId]
    );

    const updatedSchedules: ResumeSchedule[] = [];

    for (const row of res.rows) {
      const scheduleId = row.id;
      const taskId = row.task_id;
      const currentAttempts = Number(row.attempts || 0);

      // If already requeued, skip further attempts incrementing to satisfy idempotency
      if (row.status === "requeued") {
        await this.emitAuditLog(
          projectId,
          actor,
          "RESUME_REQUEUE_IDEMPOTENT_SKIP",
          "authorized",
          { 
            id: scheduleId, 
            project_id: projectId,
            task_id: taskId, 
            status: row.status, 
            queue_status: row.queue_status, 
            attempts: currentAttempts 
          },
          `Idempotent skipped requeue processing for already-requeued schedule ${scheduleId}`,
          scheduleId,
          ipAddress
        );
        const schedObj = await this.getResumeScheduleById(projectId, scheduleId, actor, ipAddress);
        updatedSchedules.push(schedObj);
        continue;
      }

      // Link any latest state that might have been saved in between
      const newestStateRes = await this.query(
        "SELECT id FROM resume_states WHERE task_id = $1 AND project_id = $2 ORDER BY created_at DESC LIMIT 1;",
        [taskId, projectId]
      );
      const newestStateId = newestStateRes.rowCount > 0 ? newestStateRes.rows[0].id : row.resume_state_id;

      // transition ready to 'requeued' and queue_status to 'requeued'
      const nextAttemptAt = new Date(Date.now() + 60000 * 60); // hypothetical next attempt in 1 hour if failed
      
      await this.query(
        `UPDATE resume_schedules 
         SET status = 'requeued', 
             queue_status = 'requeued', 
             attempts = $1, 
             resume_state_id = $2,
             last_attempt_at = NOW(), 
             next_attempt_at = $3,
             updated_at = NOW() 
         WHERE id = $4 AND project_id = $5;`,
        [currentAttempts + 1, newestStateId, nextAttemptAt, scheduleId, projectId]
      );

      // Audit log emit schedule became ready
      await this.emitAuditLog(
        projectId,
        actor,
        "RESUME_SCHEDULE_READY",
        "authorized",
        { id: scheduleId, taskId, attempts: currentAttempts + 1 },
        `Schedule ${scheduleId} became ready and due. Transitioned to requeued.`,
        scheduleId,
        ipAddress
      );

      // Audit log emit requeued task for resume
      await this.emitAuditLog(
        projectId,
        actor,
        "REQUEUE_TASK_FOR_RESUME",
        "authorized",
        { id: scheduleId, taskId, attempts: currentAttempts + 1 },
        `Task ${taskId} successfully auto requeued via schedule ${scheduleId} (Attempts: ${currentAttempts + 1})`,
        scheduleId,
        ipAddress
      );

      // Audit log emit requeue transitioned event
      await this.emitAuditLog(
        projectId,
        actor,
        "RESUME_REQUEUE_TRANSITIONED",
        "authorized",
        { 
          id: scheduleId, 
          project_id: projectId,
          task_id: taskId, 
          status: "requeued", 
          queue_status: "requeued", 
          attempts: currentAttempts + 1 
        },
        `Successfully transitioned and requeued task schedule ${scheduleId}`,
        scheduleId,
        ipAddress
      );

      const updated = await this.getResumeScheduleById(projectId, scheduleId, actor, ipAddress);
      updatedSchedules.push(updated);
    }

    return updatedSchedules;
  }

  private mapRowToResumeSchedule(row: any): ResumeSchedule {
    const metadata = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;
    return {
      id: row.id,
      projectId: row.project_id,
      taskId: row.task_id,
      resumeStateId: row.resume_state_id,
      scheduleType: row.schedule_type,
      delayMinutes: Number(row.delay_minutes || 0),
      resumeAt: row.resume_at.toISOString ? row.resume_at.toISOString() : row.resume_at,
      status: row.status,
      queueStatus: row.queue_status,
      attempts: Number(row.attempts || 0),
      lastAttemptAt: row.last_attempt_at ? (row.last_attempt_at.toISOString ? row.last_attempt_at.toISOString() : row.last_attempt_at) : null,
      nextAttemptAt: row.next_attempt_at ? (row.next_attempt_at.toISOString ? row.next_attempt_at.toISOString() : row.next_attempt_at) : null,
      metadata,
      createdAt: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
      updatedAt: row.updated_at.toISOString ? row.updated_at.toISOString() : row.updated_at
    };
  }
}
