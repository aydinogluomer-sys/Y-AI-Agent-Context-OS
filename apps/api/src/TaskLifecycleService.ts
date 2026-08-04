/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  TaskStatusType, 
  TaskTransitionActionType, 
  TaskTransitionDTO, 
  TaskLifecycleStateDTO, 
  TransitionRequestDTO,
  ConflictError,
  NotFoundError,
  AuditFeatureIdType,
  AuditActionType,
  AuditLogStatusType
} from "@y/shared";
import { sysLogger } from "./logger";

const ACTION_TO_STATUS: Record<TaskTransitionActionType, TaskStatusType> = {
  start: "running",
  pause: "paused",
  resume: "running",
  complete: "completed",
  fail: "failed",
  retry: "pending",
  cancel: "cancelled",
  archive: "archived",
};

const STATUS_ALLOWED_ACTIONS: Record<TaskStatusType, TaskTransitionActionType[]> = {
  pending: ["start", "cancel"],
  running: ["pause", "complete", "fail", "cancel"],
  paused: ["resume", "cancel"],
  failed: ["retry", "cancel", "archive"],
  completed: ["archive"],
  cancelled: ["archive"],
  archived: [],
};

const ALL_ACTIONS: TaskTransitionActionType[] = ["start", "pause", "resume", "complete", "fail", "retry", "cancel", "archive"];

export class TaskLifecycleService {
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
   * Helper utility to retrieve permitted actions list
   */
  public getAllowedActions(status: TaskStatusType): TaskTransitionActionType[] {
    return STATUS_ALLOWED_ACTIONS[status] || [];
  }

  /**
   * Helper utility to retrieve blocked actions list
   */
  public getBlockedActions(status: TaskStatusType): TaskTransitionActionType[] {
    const allowed = this.getAllowedActions(status);
    return ALL_ACTIONS.filter(act => !allowed.includes(act));
  }

  /**
   * Asserts/validates project scope alignment
   */
  public assertProjectScope(projectId: string, taskProjectId: string): void {
    if (projectId !== taskProjectId) {
      throw new ConflictError(`Cross-project validation failed: Task does not belong to project ${projectId}.`);
    }
  }

  /**
   * Asserts/validates task existence scope
   */
  public assertTaskScope(taskId: string, exists: boolean): void {
    if (!exists) {
      throw new NotFoundError(`Task ${taskId} not found.`);
    }
  }

  /**
   * Redacts sensitive infrastructure keywords (e.g. database URLs, secrets, keys) from request metadata
   */
  public sanitizeTransitionMetadata(metadata: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    const SENSITIVE_PATTERNS = ["key", "password", "secret", "token", "cert", "db", "url", "connection"];

    for (const [key, val] of Object.entries(metadata)) {
      const lowerKey = key.toLowerCase();
      const matchesSensitive = SENSITIVE_PATTERNS.some(pat => lowerKey.includes(pat));
      
      if (matchesSensitive) {
        sanitized[key] = "[REDACTED_SECURE]";
      } else if (typeof val === "object" && val !== null) {
        if (Array.isArray(val)) {
          sanitized[key] = val.map(item => typeof item === "object" && item !== null ? this.sanitizeTransitionMetadata(item) : item);
        } else {
          sanitized[key] = this.sanitizeTransitionMetadata(val);
        }
      } else {
        // Scan string contents for dangerous leakage patterns
        if (typeof val === "string") {
          let containsLeak = false;
          // Check for DB URL pattern
          if (val.includes("postgresql://") || val.includes("mongodb://") || val.includes("mysql://") || val.includes("@")) {
            containsLeak = true;
          }
          if (containsLeak) {
            sanitized[key] = "[REDACTED_LEAK_PREVENTION]";
          } else {
            sanitized[key] = val;
          }
        } else {
          sanitized[key] = val;
        }
      }
    }
    return sanitized;
  }

  /**
   * Wrapper to delegate audit log actions to core audit framework
   */
  public async emitLifecycleAudit(
    projectId: string,
    actor: string,
    featureId: AuditFeatureIdType,
    action: AuditActionType,
    status: AuditLogStatusType,
    metadata?: Record<string, unknown>,
    rationale?: string,
    resourceId?: string,
    ipAddress?: string
  ): Promise<any> {
    const sanitizedMetadata = metadata ? this.sanitizeTransitionMetadata(metadata) : {};
    return this.logAction(projectId, actor, featureId, action, status, sanitizedMetadata, rationale, resourceId, ipAddress);
  }

  /**
   * Validates state transition. Returns current status and computed target status if valid.
   */
  public async validateTransition(
    projectId: string,
    taskId: string,
    action: TaskTransitionActionType,
    targetStatus?: TaskStatusType,
    isAdminOverride = false
  ): Promise<{ currentStatus: TaskStatusType; finalTargetStatus: TaskStatusType }> {
    const taskRes = await this.query(
      "SELECT id, project_id as \"projectId\", status, title FROM tasks WHERE id = $1 LIMIT 1;",
      [taskId]
    );

    this.assertTaskScope(taskId, taskRes.rowCount > 0);

    const task = taskRes.rows[0];
    const taskProjId = task.projectId || task.project_id;
    this.assertProjectScope(projectId, taskProjId);

    const currentStatus = task.status as TaskStatusType;
    const allowed = this.getAllowedActions(currentStatus);

    if (!allowed.includes(action) && !isAdminOverride) {
      throw new ConflictError(
        `Illegal transition action requested: Cannot execute action "${action}" when task is in state "${currentStatus}".`
      );
    }

    const expectedTargetStatus = ACTION_TO_STATUS[action];
    if (targetStatus && targetStatus !== expectedTargetStatus && !isAdminOverride) {
      throw new ConflictError(
        `Target status mismatch: Action "${action}" produces status "${expectedTargetStatus}", but received requested target "${targetStatus}".`
      );
    }

    const finalTargetStatus = isAdminOverride && targetStatus ? targetStatus : expectedTargetStatus;
    return { currentStatus, finalTargetStatus };
  }

  /**
   * Writes Transition History Record to the DB
   */
  public async recordStatusHistory(
    projectId: string,
    taskId: string,
    fromStatus: TaskStatusType,
    toStatus: TaskStatusType,
    action: TaskTransitionActionType,
    actorType: string,
    actorId: string,
    rationale: string | null,
    metadata: Record<string, any>
  ): Promise<string> {
    const historyId = `history_${Math.random().toString(36).substring(2, 11)}`;
    const sanitizedMeta = this.sanitizeTransitionMetadata(metadata);

    await this.query(
      `INSERT INTO task_status_history (id, project_id, task_id, from_status, to_status, action, actor_type, actor_id, rationale, metadata, metadata_json, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW());`,
      [
        historyId,
        projectId,
        taskId,
        fromStatus,
        toStatus,
        action,
        actorType,
        actorId,
        rationale,
        JSON.stringify(sanitizedMeta),
        JSON.stringify(sanitizedMeta)
      ]
    );

    return historyId;
  }

  /**
   * Reads task's current status, computes allowed/blocked actions, and generates dynamic warnings
   */
  public async getTaskLifecycleState(projectId: string, taskId: string): Promise<TaskLifecycleStateDTO> {
    const taskRes = await this.query(
      "SELECT id, project_id as \"projectId\", status, title FROM tasks WHERE id = $1 LIMIT 1;",
      [taskId]
    );

    this.assertTaskScope(taskId, taskRes.rowCount > 0);

    const task = taskRes.rows[0];
    const taskProjId = task.projectId || task.project_id;
    this.assertProjectScope(projectId, taskProjId);

    const currentStatus = task.status as TaskStatusType;
    const allowedActions = this.getAllowedActions(currentStatus);
    const blockedActions = this.getBlockedActions(currentStatus);

    // Dynamic warnings based on linked systems
    const warnings: string[] = [];

    if (currentStatus === "archived") {
      warnings.push("This task is archived. Archives are final and no transitions are permitted.");
    }

    // Checking active agent sessions
    try {
      const sessionRes = await this.query(
        "SELECT COUNT(*) as count FROM agent_sessions WHERE task_id = $1 AND status IN ('active', 'paused', 'recoverable');",
        [taskId]
      );
      const sessionCount = parseInt(sessionRes.rows[0]?.count || "0", 10);
      if (sessionCount > 0) {
        warnings.push(`There are ${sessionCount} active, paused, or recoverable agent sessions associated with this task.`);
      }
    } catch (err: any) {
      sysLogger.warn(`Failed to inspect agent sessions for lifecycle warnings: ${err.message}`);
    }

    // Checking active resume schedules
    try {
      const scheduleRes = await this.query(
        "SELECT COUNT(*) as count FROM resume_schedules WHERE task_id = $1 AND status IN ('scheduled', 'ready', 'requeued');",
        [taskId]
      );
      const scheduleCount = parseInt(scheduleRes.rows[0]?.count || "0", 10);
      if (scheduleCount > 0) {
        warnings.push(`This task has ${scheduleCount} active or scheduled timed resume timers active.`);
      }
    } catch (err: any) {
      sysLogger.warn(`Failed to inspect resume schedules for lifecycle warnings: ${err.message}`);
    }

    // Fetch last transition timestamp
    let lastTransitionAt: string | null = null;
    try {
      const lastHistRes = await this.query(
        "SELECT created_at as \"createdAt\" FROM task_status_history WHERE task_id = $1 ORDER BY created_at DESC LIMIT 1;",
        [taskId]
      );
      if (lastHistRes.rowCount > 0) {
        lastTransitionAt = lastHistRes.rows[0].createdAt;
      }
    } catch (err: any) {
      sysLogger.warn(`Failed to inspect status history for state extraction: ${err.message}`);
    }

    return {
      taskId,
      projectId,
      currentStatus,
      allowedActions,
      blockedActions,
      lastTransitionAt,
      warnings,
    };
  }

  /**
   * Alias for backward compatibility with getTaskLifecycleState
   */
  public async getLifecycleState(projectId: string, taskId: string): Promise<TaskLifecycleStateDTO> {
    return this.getTaskLifecycleState(projectId, taskId);
  }

  /**
   * Performs an atomic, audited, and validated task lifecycle state transition
   */
  public async transitionTask(projectId: string, dto: TransitionRequestDTO, actor: string, ipAddress = "127.0.0.1"): Promise<TaskTransitionDTO> {
    const { taskId, action, targetStatus, rationale, metadata = {} } = dto;

    await this.emitLifecycleAudit(
      projectId,
      actor,
      "TASK",
      "TASK_TRANSITION_REQUESTED",
      "authorized",
      { taskId, action, targetStatus, metadata },
      rationale || `Requested transition action: ${action}`,
      taskId,
      ipAddress
    );

    // Validate the state transition & scopes
    let currentStatus: TaskStatusType;
    let finalTargetStatus: TaskStatusType;

    const isAdminOverride = metadata.adminOverride === true;

    try {
      const validated = await this.validateTransition(projectId, taskId, action, targetStatus, isAdminOverride);
      currentStatus = validated.currentStatus;
      finalTargetStatus = validated.finalTargetStatus;
    } catch (validationErr: any) {
      // Trigger blocked/failed audits based on cross-project vs standard illegal transitions
      if (validationErr.message.includes("Cross-project")) {
        await this.emitLifecycleAudit(
          projectId,
          actor,
          "TASK",
          "TASK_LIFECYCLE_CROSS_PROJECT_ACCESS_BLOCKED",
          "denied_untrusted",
          { taskId, action, error: validationErr.message },
          validationErr.message,
          taskId,
          ipAddress
        );
      } else {
        await this.emitLifecycleAudit(
          projectId,
          actor,
          "TASK",
          "TASK_TRANSITION_BLOCKED",
          "denied_untrusted",
          { taskId, action, currentStatus: "unknown" },
          validationErr.message,
          taskId,
          ipAddress
        );
      }
      throw validationErr;
    }

    if (isAdminOverride) {
      await this.emitLifecycleAudit(
        projectId,
        actor,
        "TASK",
        "TASK_TRANSITION_ADMIN_OVERRIDE_USED",
        "authorized",
        { taskId, action, currentStatus },
        `Admin override applied to transition task ${taskId} from status ${currentStatus} using action ${action}`,
        taskId,
        ipAddress
      );
    }

    const sanitizedMeta = this.sanitizeTransitionMetadata(metadata);

    // Begin State Update Transaction block
    try {
      await this.query("BEGIN;");

      // Update task status in database
      await this.query(
        "UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2;",
        [finalTargetStatus, taskId]
      );

      // System integrates / integrations - e.g. pause/cancel schedules
      if (["paused", "cancelled", "completed", "failed"].includes(finalTargetStatus)) {
        await this.query(
          "UPDATE resume_schedules SET status = 'cancelled', updated_at = NOW() WHERE task_id = $1 AND status IN ('scheduled', 'ready', 'requeued');",
          [taskId]
        );
      }

      // Record to status history using modular helper call
      const historyId = await this.recordStatusHistory(
        projectId,
        taskId,
        currentStatus,
        finalTargetStatus,
        action,
        dto.actorType || "user",
        dto.actorId || actor,
        rationale || null,
        sanitizedMeta
      );

      await this.query("COMMIT;");

      await this.emitLifecycleAudit(
        projectId,
        actor,
        "TASK",
        "TASK_TRANSITION_COMPLETED",
        "authorized",
        { taskId, fromStatus: currentStatus, toStatus: finalTargetStatus, action },
        `Successfully transitioned task ${taskId} from "${currentStatus}" to "${finalTargetStatus}" via action "${action}".`,
        taskId,
        ipAddress
      );

      await this.emitLifecycleAudit(
        projectId,
        actor,
        "TASK",
        "TASK_TRANSITION_HISTORY_RECORDED",
        "authorized",
        { taskId, historyId, fromStatus: currentStatus, toStatus: finalTargetStatus },
        `Recorded status transition history element ${historyId}.`,
        taskId,
        ipAddress
      );

      return {
        id: historyId,
        projectId,
        taskId,
        fromStatus: currentStatus,
        toStatus: finalTargetStatus,
        action,
        actorType: dto.actorType || "user",
        actorId: dto.actorId || actor,
        rationale: rationale || null,
        metadata: sanitizedMeta,
        createdAt: new Date().toISOString()
      };
    } catch (txError: any) {
      try {
        await this.query("ROLLBACK;");
      } catch (rbErr) {
        // ignore
      }
      sysLogger.error(`Database transaction failed during transitionTask of ${taskId}: ${txError.message}`);
      await this.emitLifecycleAudit(
        projectId,
        actor,
        "TASK",
        "TASK_TRANSITION_FAILED",
        "denied_untrusted",
        { taskId, action, error: txError.message },
        `Transaction rollback during state transition: ${txError.message}`,
        taskId,
        ipAddress
      );
      throw txError;
    }
  }

  /**
   * Fetches historical transitions for a given task ordered newest first
   */
  public async getStatusHistory(projectId: string, taskId: string): Promise<TaskTransitionDTO[]> {
    const taskRes = await this.query(
      "SELECT id, project_id as \"projectId\" FROM tasks WHERE id = $1 LIMIT 1;",
      [taskId]
    );

    this.assertTaskScope(taskId, taskRes.rowCount > 0);

    const taskProjId = taskRes.rows[0].projectId || taskRes.rows[0].project_id;
    this.assertProjectScope(projectId, taskProjId);

    const histRes = await this.query(
      `SELECT 
        id, 
        project_id as "projectId", 
        task_id as "taskId", 
        from_status as "fromStatus", 
        to_status as "toStatus", 
        action, 
        actor_type as "actorType", 
        actor_id as "actorId", 
        rationale, 
        COALESCE(metadata_json, metadata) as "metadata_json", 
        created_at as "createdAt"
       FROM task_status_history 
       WHERE task_id = $1 
       ORDER BY created_at DESC;`,
      [taskId]
    );

    return histRes.rows.map(row => ({
      id: row.id,
      projectId: row.projectId,
      taskId: row.taskId,
      fromStatus: row.fromStatus || null,
      toStatus: row.toStatus,
      action: row.action as TaskTransitionActionType,
      actorType: row.actorType,
      actorId: row.actorId || null,
      rationale: row.rationale || null,
      metadata: typeof row.metadata_json === "string" ? JSON.parse(row.metadata_json) : (row.metadata_json || {}),
      createdAt: typeof row.createdAt === "object" ? row.createdAt.toISOString() : String(row.createdAt)
    }));
  }
}
