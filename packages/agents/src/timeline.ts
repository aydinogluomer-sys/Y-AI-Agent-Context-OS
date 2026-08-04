/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  TimelineEventDTO, 
  TimelineSummaryDTO, 
  TimelineDecision, 
  TimelineFailedAttempt, 
  TimelineRecoveryAttempt,
  TimelineSourceType,
  NotFoundError,
  PermissionDeniedError
} from "@y/shared";
import { redactSecretLeaks } from "@y/security";

export class AgentTimelineService {
  constructor(private pool: any) {
    if (!pool) {
      throw new Error("A valid database connection pool is required for AgentTimelineService.");
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
   * Emits structural and redacted audit logs for TIMELINE.
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
         VALUES ($1, $2, $3, 'AGENT', $4, $5, $6, $7, $8, $9, NOW());`,
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
      console.error(`AgentTimelineService Audit Log emission failed: ${err.message}`);
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
   * Fetches, aggregates, normalizes, sorts, and filters timeline events.
   */
  public async getTimeline(
    projectId: string,
    taskId: string,
    options: {
      order?: "asc" | "desc";
      source_type?: string;
      event_type?: string;
      status?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<TimelineEventDTO[]> {
    await this.validateProjectAndTaskScope(projectId, taskId);

    let canonicalRows: any[] = [];
    try {
      const canonicalRes = await this.query(
        `SELECT * FROM event_records
         WHERE project_id = $1 AND task_id = $2
         ORDER BY created_at ASC;`,
        [projectId, taskId]
      );
      canonicalRows = canonicalRes.rows || [];
    } catch {
      canonicalRows = [];
    }

    if (canonicalRows.length > 0) {
      let canonicalEvents: TimelineEventDTO[] = canonicalRows.map((row: any) => {
        const payload =
          typeof row.payload_json === "string"
            ? JSON.parse(row.payload_json)
            : row.payload_json || {};
        const metadata =
          typeof row.metadata_json === "string"
            ? JSON.parse(row.metadata_json)
            : row.metadata_json || {};
        const title = String(payload.title || row.event_type)
          .split("_")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
          .join(" ");

        return {
          id: row.id,
          project_id: projectId,
          task_id: taskId,
          source_type: "event_store",
          source_id: row.source_id || row.id,
          event_type: row.event_type,
          title,
          summary: redactSecretLeaks(
            payload.summary ||
              payload.description ||
              payload.rationale ||
              `Canonical event recorded: ${row.event_type}`
          ),
          status: row.status || "committed",
          timestamp: new Date(row.created_at).toISOString(),
          feature_id: row.feature_id || null,
          confidence: null,
          source_completeness: "canonical_event_store",
          warnings: [],
          metadata: this.redactObjectRecursively({
            ...metadata,
            payload,
            payload_hash: row.payload_hash,
          }),
        };
      });

      if (options.source_type) {
        canonicalEvents = canonicalEvents.filter(
          (event) => event.source_type === options.source_type
        );
      }
      if (options.event_type) {
        canonicalEvents = canonicalEvents.filter(
          (event) => event.event_type === options.event_type
        );
      }
      if (options.status) {
        canonicalEvents = canonicalEvents.filter(
          (event) => event.status === options.status
        );
      }

      const orderSign = options.order === "desc" ? -1 : 1;
      canonicalEvents.sort(
        (a, b) =>
          (new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) *
          orderSign
      );

      const offset = options.offset || 0;
      const limit = options.limit || 100;
      return canonicalEvents.slice(offset, offset + limit);
    }

    // Fetch from all allowed tables
    const taskRes = await this.query("SELECT * FROM tasks WHERE project_id = $1 AND id = $2;", [projectId, taskId]);
    const auditRes = await this.query(
      `SELECT * FROM audit_logs 
       WHERE project_id = $1 
         AND (resource_id = $2 OR metadata->>'taskId' = $2 OR metadata->>'task_id' = $2 OR metadata->'task'->>'id' = $2);`,
      [projectId, taskId]
    );
    const memoryRes = await this.query("SELECT * FROM agent_memories WHERE project_id = $1 AND task_id = $2;", [projectId, taskId]);
    const resumeStateRes = await this.query("SELECT * FROM resume_states WHERE project_id = $1 AND task_id = $2;", [projectId, taskId]);
    const scheduleRes = await this.query("SELECT * FROM resume_schedules WHERE project_id = $1 AND task_id = $2;", [projectId, taskId]);
    const sessionRes = await this.query("SELECT * FROM agent_sessions WHERE project_id = $1 AND task_id = $2;", [projectId, taskId]);
    const handoffRes = await this.query("SELECT * FROM agent_handoffs WHERE project_id = $1 AND task_id = $2;", [projectId, taskId]);

    const events: TimelineEventDTO[] = [];

    const standardWarnings = [
      "Compatibility aggregation fallback: no canonical event_records exist for this task.",
      "Evidence integrity uses SHA-256 content digests; actor signatures are not implemented."
    ];

    // 1. Map Task events
    for (const task of taskRes.rows) {
      events.push({
        id: `evt_task_created_${task.id}`,
        project_id: projectId,
        task_id: taskId,
        source_type: "task",
        source_id: task.id,
        event_type: "TASK_CREATED",
        title: "Task Created",
        summary: redactSecretLeaks(`Task initiated under category ${task.category} by Human Owner: ${task.human_owner || "Anonymous"}.`),
        status: task.status,
        timestamp: new Date(task.created_at).toISOString(),
        feature_id: "CORE",
        confidence: null,
        source_completeness: "partial_mvp",
        warnings: [...standardWarnings],
        metadata: this.redactObjectRecursively({
          title: task.title,
          category: task.category,
          risk_level: task.risk_level,
          difficulty: task.difficulty
        })
      });

      events.push({
        id: `evt_task_status_${task.id}`,
        project_id: projectId,
        task_id: taskId,
        source_type: "task",
        source_id: task.id,
        event_type: "TASK_STATUS_CHANGED",
        title: "Task Status Updated",
        summary: redactSecretLeaks(`Task status is now: ${task.status}. Description: ${task.description || "none"}`),
        status: task.status,
        timestamp: new Date(task.updated_at).toISOString(),
        feature_id: "CORE",
        confidence: null,
        source_completeness: "partial_mvp",
        warnings: [...standardWarnings],
        metadata: this.redactObjectRecursively({
          status: task.status,
          owner_agent: task.owner_agent
        })
      });
    }

    // 2. Map Audit Log events
    for (const log of auditRes.rows) {
      events.push({
        id: `evt_audit_${log.id}`,
        project_id: projectId,
        task_id: taskId,
        source_type: "audit_log",
        source_id: log.id,
        event_type: log.action,
        title: String(log.action).split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' '),
        summary: redactSecretLeaks(log.rationale || `Audit log emitted for action: ${log.action}`),
        status: log.status,
        timestamp: new Date(log.created_at).toISOString(),
        feature_id: log.feature_id,
        confidence: null,
        source_completeness: "partial_mvp",
        warnings: [...standardWarnings],
        metadata: this.redactObjectRecursively(log.metadata || {})
      });
    }

    // 3. Map Agent Memory events
    for (const mem of memoryRes.rows) {
      events.push({
        id: `evt_memory_${mem.id}`,
        project_id: projectId,
        task_id: taskId,
        source_type: "agent_memory",
        source_id: mem.id,
        event_type: "AGENT_MEMORY_CREATED",
        title: "Agent Memory Logged",
        summary: redactSecretLeaks(mem.next_recommended_action || "Agent persisted a step memory checkpoint."),
        status: mem.status,
        timestamp: new Date(mem.created_at).toISOString(),
        feature_id: "AGENT",
        confidence: mem.confidence_score ? Number(mem.confidence_score) : null,
        source_completeness: "partial_mvp",
        warnings: [...standardWarnings],
        metadata: this.redactObjectRecursively({
          what_agent_did: mem.what_agent_did,
          why_agent_did_it: mem.why_agent_did_it,
          what_failed: mem.what_failed,
          what_remains: mem.what_remains
        })
      });
    }

    // 4. Map Resume State events
    for (const rstate of resumeStateRes.rows) {
      events.push({
        id: `evt_resume_state_${rstate.id}`,
        project_id: projectId,
        task_id: taskId,
        source_type: "resume_state",
        source_id: rstate.id,
        event_type: "RESUME_STATE_SNAPSHOT",
        title: "Task Paused Checkpoint",
        summary: redactSecretLeaks(rstate.paused_reason || `Task saved checkpoint on phase: ${rstate.current_phase || "unknown"}`),
        status: rstate.status,
        timestamp: new Date(rstate.created_at).toISOString(),
        feature_id: "RESUME",
        confidence: rstate.confidence_score ? Number(rstate.confidence_score) : null,
        source_completeness: "partial_mvp",
        warnings: [...standardWarnings],
        metadata: this.redactObjectRecursively({
          current_phase: rstate.current_phase,
          failed_step: rstate.failed_step,
          next_action: rstate.next_action,
          affected_files: rstate.affected_files,
          validation_state: rstate.validation_state
        })
      });
    }

    // 5. Map Resume Schedule events
    for (const sched of scheduleRes.rows) {
      events.push({
        id: `evt_schedule_${sched.id}`,
        project_id: projectId,
        task_id: taskId,
        source_type: "resume_schedule",
        source_id: sched.id,
        event_type: `RESUME_SCHEDULE_${String(sched.status).toUpperCase()}`,
        title: `Pause timer ${sched.status}`,
        summary: redactSecretLeaks(`Timed auto-resume scheduled for task in ${sched.delay_minutes} minutes (At ${new Date(sched.resume_at).toISOString()}). Status: ${sched.status}, Queue Status: ${sched.queue_status}`),
        status: sched.status,
        timestamp: new Date(sched.created_at).toISOString(),
        feature_id: "RESUME",
        confidence: null,
        source_completeness: "partial_mvp",
        warnings: [...standardWarnings],
        metadata: this.redactObjectRecursively({
          schedule_type: sched.schedule_type,
          attempts: sched.attempts,
          last_attempt_at: sched.last_attempt_at,
          next_attempt_at: sched.next_attempt_at,
          metadata: sched.metadata
        })
      });
    }

    // 6. Map Agent Session events
    for (const sess of sessionRes.rows) {
      // Create a redacted external ID to shield sensitive details
      const redactedExternalId = String(sess.external_session_id || "").substring(0, 8) + "-redacted";

      events.push({
        id: `evt_session_${sess.id}`,
        project_id: projectId,
        task_id: taskId,
        source_type: "agent_session",
        source_id: sess.id,
        event_type: `AGENT_SESSION_${String(sess.status).toUpperCase()}`,
        title: `Agent Session Registered (${sess.provider})`,
        summary: redactSecretLeaks(`Active session with provider: ${sess.provider}. Label: ${sess.session_label || "unnamed"}, Last known step: ${sess.last_known_step || "init"}`),
        status: sess.status,
        timestamp: new Date(sess.created_at).toISOString(),
        feature_id: "AGENT",
        confidence: null,
        source_completeness: "partial_mvp",
        warnings: [...standardWarnings],
        metadata: this.redactObjectRecursively({
          provider: sess.provider,
          external_session_id: redactedExternalId,
          last_known_step: sess.last_known_step,
          last_seen_at: sess.last_seen_at,
          recovery_payload: sess.recovery_payload
        })
      });
    }

    // 7. Map Agent Handoff events
    for (const handoff of handoffRes.rows) {
      events.push({
        id: `evt_handoff_${handoff.id}`,
        project_id: projectId,
        task_id: taskId,
        source_type: "agent_handoff",
        source_id: handoff.id,
        event_type: `AGENT_HANDOFF_${String(handoff.status).toUpperCase()}`,
        title: `Agent Control Handoff`,
        summary: redactSecretLeaks(`Transition control: ${handoff.source_provider} -> ${handoff.target_provider} (${handoff.status})`),
        status: handoff.status,
        timestamp: new Date(handoff.created_at).toISOString(),
        feature_id: "AGENT",
        confidence: null,
        source_completeness: "partial_mvp",
        warnings: [...standardWarnings],
        metadata: this.redactObjectRecursively({
          source_provider: handoff.source_provider,
          target_provider: handoff.target_provider,
          status: handoff.status,
          validation_result: handoff.validation_result,
          missing_context_warnings: handoff.missing_context_warnings,
          preserved_context_refs: handoff.preserved_context_refs
        })
      });
    }

    // Filter in-memory
    let filteredEvents = events;

    if (options.source_type) {
      filteredEvents = filteredEvents.filter(e => e.source_type === options.source_type);
    }
    if (options.event_type) {
      filteredEvents = filteredEvents.filter(e => e.event_type === options.event_type);
    }
    if (options.status) {
      filteredEvents = filteredEvents.filter(e => e.status === options.status);
    }

    // Sort chronologically
    const orderSign = options.order === "desc" ? -1 : 1;
    filteredEvents.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return (timeA - timeB) * orderSign;
    });

    // Pagination
    const offset = options.offset || 0;
    const limit = options.limit || 100;
    filteredEvents = filteredEvents.slice(offset, offset + limit);

    return filteredEvents;
  }

  /**
   * Generates summary, decisons, failures, recoveries, and states based on constraints.
   */
  public async getTimelineSummary(
    projectId: string,
    taskId: string
  ): Promise<TimelineSummaryDTO> {
    await this.validateProjectAndTaskScope(projectId, taskId);

    // Fetch all events chronologically (asc) to build summary states
    const eventsAll = await this.getTimeline(projectId, taskId, { order: "asc" });

    const major_decisions: TimelineDecision[] = [];
    const failed_attempts: TimelineFailedAttempt[] = [];
    const recovery_attempts: TimelineRecoveryAttempt[] = [];
    const usesCanonicalEventStore = eventsAll.some(
      (event) => event.source_type === "event_store"
    );
    const summaryWarnings: string[] = usesCanonicalEventStore
      ? []
      : [
          "Compatibility aggregation fallback is active because no canonical task events exist.",
          "Evidence integrity uses SHA-256 content digests; actor signatures are not implemented."
        ];

    // Load raw sources to analyze non-flat properties
    const taskRes = await this.query("SELECT * FROM tasks WHERE project_id = $1 AND id = $2;", [projectId, taskId]);
    const memoryRes = await this.query("SELECT * FROM agent_memories WHERE project_id = $1 AND task_id = $2;", [projectId, taskId]);
    const resumeStateRes = await this.query("SELECT * FROM resume_states WHERE project_id = $1 AND task_id = $2;", [projectId, taskId]);
    const scheduleRes = await this.query("SELECT * FROM resume_schedules WHERE project_id = $1 AND task_id = $2;", [projectId, taskId]);
    const sessionRes = await this.query("SELECT * FROM agent_sessions WHERE project_id = $1 AND task_id = $2;", [projectId, taskId]);
    const handoffRes = await this.query("SELECT * FROM agent_handoffs WHERE project_id = $1 AND task_id = $2;", [projectId, taskId]);
    const auditRes = await this.query(
      `SELECT * FROM audit_logs 
       WHERE project_id = $1 
         AND (resource_id = $2 OR metadata->>'taskId' = $2 OR metadata->>'task_id' = $2);`,
      [projectId, taskId]
    );

    const taskObj = taskRes.rows[0];
    const taskStatus = taskObj ? taskObj.status : "unknown";

    // 1. Extract Decisions (RESUME-035)
    // From agent_memories rationale & recommended actions
    for (const mem of memoryRes.rows) {
      if (Array.isArray(mem.why_agent_did_it)) {
        mem.why_agent_did_it.forEach((item: any, idx: number) => {
          major_decisions.push({
            id: `${mem.id}_why_${idx}`,
            timestamp: new Date(mem.created_at).toISOString(),
            source: "agent_memory",
            title: "Agent Rationale",
            decision: redactSecretLeaks(typeof item === "string" ? item : JSON.stringify(item))
          });
        });
      }
      if (mem.next_recommended_action) {
        major_decisions.push({
          id: `${mem.id}_next_action`,
          timestamp: new Date(mem.created_at).toISOString(),
          source: "agent_memory",
          title: "Next Recommended Action Decision",
          decision: redactSecretLeaks(mem.next_recommended_action)
        });
      }
    }
    // From resume_states next_action
    for (const rstate of resumeStateRes.rows) {
      if (rstate.next_action) {
        major_decisions.push({
          id: `${rstate.id}_next_action`,
          timestamp: new Date(rstate.created_at).toISOString(),
          source: "resume_state",
          title: "Paused State Next Action Decision",
          decision: redactSecretLeaks(rstate.next_action)
        });
      }
    }
    // From agent_handoffs validation result
    for (const handoff of handoffRes.rows) {
      if (handoff.validation_result && Object.keys(handoff.validation_result).length > 0) {
        major_decisions.push({
          id: `${handoff.id}_validation`,
          timestamp: new Date(handoff.created_at).toISOString(),
          source: "agent_handoff",
          title: "continuity Handoff Validation Result Decision",
          decision: redactSecretLeaks(typeof handoff.validation_result === 'string' ? handoff.validation_result : JSON.stringify(handoff.validation_result))
        });
      }
    }
    // From audit logs
    for (const audit of auditRes.rows) {
      if (audit.rationale) {
        major_decisions.push({
          id: `${audit.id}_audit_dec`,
          timestamp: new Date(audit.created_at).toISOString(),
          source: "audit_log",
          title: `Audit Trait Decision (${audit.action})`,
          decision: redactSecretLeaks(audit.rationale)
        });
      }
    }

    // Add missing decision warning if none found
    if (major_decisions.length === 0) {
      summaryWarnings.push("No persisted decision source found in current MVP timeline sources.");
    }

    // 2. Extract Failed Attempts (RESUME-036)
    for (const mem of memoryRes.rows) {
      if (Array.isArray(mem.what_failed)) {
        mem.what_failed.forEach((failItem: any, idx: number) => {
          failed_attempts.push({
            id: `${mem.id}_fail_${idx}`,
            timestamp: new Date(mem.created_at).toISOString(),
            failure_type: "Agent Execution Failure Summary",
            message: redactSecretLeaks(typeof failItem === 'string' ? failItem : JSON.stringify(failItem)),
            resolved: mem.status === "completed" || mem.status === "resolved",
            resolution: mem.status === "completed" ? "Agent successfully bypassed or solved step internally." : undefined,
            affected_files: mem.what_changed ? Object.keys(mem.what_changed) : []
          });
        });
      }
    }
    for (const rstate of resumeStateRes.rows) {
      if (rstate.failed_step && (typeof rstate.failed_step === 'string' || Object.keys(rstate.failed_step).length > 0)) {
        failed_attempts.push({
          id: `${rstate.id}_field_fail`,
          timestamp: new Date(rstate.created_at).toISOString(),
          failure_type: "Checkpoint Pause Failed Step",
          message: redactSecretLeaks(typeof rstate.failed_step === 'string' ? rstate.failed_step : JSON.stringify(rstate.failed_step)),
          resolved: rstate.status === "active",
          resolution: rstate.status === "active" ? "Resumed and processed into active queue." : undefined,
          affected_files: Array.isArray(rstate.affected_files) ? rstate.affected_files : []
        });
      }
    }
    for (const sched of scheduleRes.rows) {
      if (sched.status === "failed") {
        failed_attempts.push({
          id: `${sched.id}_sched_fail`,
          timestamp: new Date(sched.updated_at).toISOString(),
          failure_type: "Resume Timer Trigger Failure",
          message: `Scheduled pause-timer failed execution after ${sched.attempts} requeue check attempts.`,
          resolved: false
        });
      }
    }
    for (const handoff of handoffRes.rows) {
      if (handoff.status === "failed") {
        failed_attempts.push({
          id: `${handoff.id}_handoff_fail`,
          timestamp: new Date(handoff.updated_at).toISOString(),
          failure_type: "Agent Transitions Validation Failure",
          message: redactSecretLeaks(`Handoff validation failed between providers: ${handoff.source_provider} and ${handoff.target_provider}.`),
          resolved: false
        });
      }
    }
    for (const audit of auditRes.rows) {
      if (audit.status === "denied_untrusted" || audit.action.includes("FAILED") || audit.action.includes("REJECTED")) {
        failed_attempts.push({
          id: `${audit.id}_audit_fail`,
          timestamp: new Date(audit.created_at).toISOString(),
          failure_type: "Audit Security/Operation Rejection",
          message: redactSecretLeaks(audit.rationale || `Refused task progression action: ${audit.action}`),
          resolved: false
        });
      }
    }

    // 3. Extract Recovery Attempts (RESUME-037)
    for (const rstate of resumeStateRes.rows) {
      if (rstate.resume_payload && Object.keys(rstate.resume_payload).length > 0) {
        recovery_attempts.push({
          id: `${rstate.id}_payload_recovery`,
          timestamp: new Date(rstate.created_at).toISOString(),
          recovery_type: "Resume Checkpoint Snapshot Created",
          readiness_status: rstate.status,
          warnings: rstate.validation_state && Array.isArray(rstate.validation_state.warnings) ? rstate.validation_state.warnings : [],
          next_action: rstate.next_action || undefined
        });
      }
    }
    for (const sched of scheduleRes.rows) {
      if (sched.status === "ready" || sched.status === "requeued") {
        recovery_attempts.push({
          id: `${sched.id}_timer_requeue`,
          timestamp: new Date(sched.updated_at).toISOString(),
          recovery_type: "Timer Ingress Requeue Recovery",
          readiness_status: sched.status,
          warnings: [],
          next_action: `Task trigger queued automatically. Attempts: ${sched.attempts}`
        });
      }
    }
    for (const sess of sessionRes.rows) {
      if (sess.recovery_payload && Object.keys(sess.recovery_payload).length > 0) {
        recovery_attempts.push({
          id: `${sess.id}_session_rec`,
          timestamp: new Date(sess.created_at).toISOString(),
          recovery_type: "Agent Recovery Payload Compiled",
          readiness_status: sess.status,
          warnings: [],
          next_action: sess.last_known_step || undefined
        });
      }
    }
    for (const handoff of handoffRes.rows) {
      if (handoff.status === "validated" || handoff.status === "completed") {
        recovery_attempts.push({
          id: `${handoff.id}_handoff_continuity`,
          timestamp: new Date(handoff.updated_at).toISOString(),
          recovery_type: "Agent Handoff Package Verification",
          readiness_status: handoff.status,
          warnings: Array.isArray(handoff.missing_context_warnings) ? handoff.missing_context_warnings : [],
          next_action: `Continuity restored to ${handoff.target_provider}.`
        });
      }
    }

    // Timeline Summary values
    const first_known_action = eventsAll.length > 0 ? eventsAll[0].timestamp : null;
    const latest_known_action = eventsAll.length > 0 ? eventsAll[eventsAll.length - 1].timestamp : null;

    // Remaining work and recommendations (RESUME-038)
    let remaining_work: string | null = null;
    let next_recommended_action: string | null = null;

    for (const mem of memoryRes.rows) {
      if (Array.isArray(mem.what_remains) && mem.what_remains.length > 0) {
        remaining_work = mem.what_remains.join("; ");
      }
      if (mem.next_recommended_action) {
        next_recommended_action = mem.next_recommended_action;
      }
    }

    if (!remaining_work && taskObj) {
      remaining_work = `Fulfill acceptance criteria constraints: ${Array.isArray(taskObj.acceptance_criteria) ? taskObj.acceptance_criteria.join(", ") : "none"}`;
    }

    // Label based on whether task status represents full completion
    const final_or_current_state = (taskStatus === "completed" || taskStatus === "complete") ? "final_resolution_path" : "current_resolution_path";

    return {
      project_id: projectId,
      task_id: taskId,
      first_known_action,
      latest_known_action,
      major_decisions,
      failed_attempts,
      recovery_attempts,
      final_or_current_state,
      remaining_work,
      next_recommended_action,
      source_completeness: "partial_mvp",
      warnings: summaryWarnings
    };
  }

  /**
   * Fetches the chronological timeline of events across all tasks of a project.
   */
  public async getProjectTimeline(
    projectId: string,
    options: {
      order?: "asc" | "desc";
      source_type?: string;
      event_type?: string;
      status?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<TimelineEventDTO[]> {
    // Validate project scope
    const projRes = await this.query("SELECT id FROM projects WHERE id = $1 LIMIT 1;", [projectId]);
    if (projRes.rowCount === 0) {
      throw new NotFoundError(`Project scope validation failed: Project ${projectId} not found.`);
    }

    // Load tasks for this project
    const tasksRes = await this.query("SELECT id FROM tasks WHERE project_id = $1;", [projectId]);
    const taskIds = tasksRes.rows.map((r: any) => r.id);

    const events: TimelineEventDTO[] = [];

    // Query each task's timeline
    for (const tid of taskIds) {
      try {
        const taskEvents = await this.getTimeline(projectId, tid, options);
        events.push(...taskEvents);
      } catch {
        // Skip silent error for invalid task sub-scopes during aggregate
      }
    }

    // Sort globally
    const orderSign = options.order === "desc" ? -1 : 1;
    events.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return (timeA - timeB) * orderSign;
    });

    const offset = options.offset || 0;
    const limit = options.limit || 100;

    return events.slice(offset, offset + limit);
  }
}
