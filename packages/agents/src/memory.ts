import { 
  AgentMemory, 
  CreateAgentMemoryDTO, 
  UpdateAgentMemoryDTO,
  NotFoundError,
  PermissionDeniedError
} from "@y/shared";
import { redactSecretLeaks } from "@y/security";
import crypto from "crypto";

export class PersistentAgentMemoryService {
  constructor(private pool: any) {
    if (!pool) {
      throw new Error("A valid database connection pool is required for PersistentAgentMemoryService.");
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
   * Emits structural and redacted audit logs for AGENT activity.
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
      console.error(`PersistentAgentMemoryService Audit Log emission failed: ${err.message}`);
    }
  }

  /**
   * Creates agent memory records persistently under project/task scope constraints.
   */
  public async createMemory(
    projectId: string,
    taskId: string,
    dto: CreateAgentMemoryDTO,
    actor: string,
    ipAddress = "127.0.0.1"
  ): Promise<AgentMemory> {
    await this.validateProjectAndTaskScope(projectId, taskId);

    const memoryId = dto.id || `mem_${crypto.randomUUID()}`;
    const agentRunId = dto.agentRunId || null;
    const status = dto.status || "completed";
    const nextRecommendedAction = dto.nextRecommendedAction || "";
    const confidenceScore = dto.confidenceScore !== undefined ? dto.confidenceScore : 100.0;
    const sourceRefs = dto.sourceRefs || [];

    // Redact metadata secrets
    const cleanMetadata = this.redactObjectRecursively(dto.metadataJson || {});

    // Scrub secrets from the components
    const whatAgentDid = this.redactAgentDid(dto.whatAgentDid || []);
    const whyAgentDidIt = this.redactRationale(dto.whyAgentDidIt || []);
    const whatChanged = this.redactChanged(dto.whatChanged || {});
    const whatFailed = this.redactFailed(dto.whatFailed || []);
    const whatRemains = this.redactRemains(dto.whatRemains || []);

    await this.query(
      `INSERT INTO agent_memories (
        id, project_id, task_id, agent_run_id, status, 
        what_agent_did, why_agent_did_it, what_changed, what_failed, what_remains, 
        next_recommended_action, confidence_score, source_refs, metadata_json, 
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        what_agent_did = EXCLUDED.what_agent_did,
        why_agent_did_it = EXCLUDED.why_agent_did_it,
        what_changed = EXCLUDED.what_changed,
        what_failed = EXCLUDED.what_failed,
        what_remains = EXCLUDED.what_remains,
        next_recommended_action = EXCLUDED.next_recommended_action,
        confidence_score = EXCLUDED.confidence_score,
        source_refs = EXCLUDED.source_refs,
        metadata_json = EXCLUDED.metadata_json,
        updated_at = NOW();`,
      [
        memoryId,
        projectId,
        taskId,
        agentRunId,
        status,
        JSON.stringify(whatAgentDid),
        JSON.stringify(whyAgentDidIt),
        JSON.stringify(whatChanged),
        JSON.stringify(whatFailed),
        JSON.stringify(whatRemains),
        nextRecommendedAction,
        confidenceScore,
        JSON.stringify(sourceRefs),
        JSON.stringify(cleanMetadata)
      ]
    );

    // Audit logs of transaction lifecycle
    await this.emitAuditLog(
      projectId,
      actor,
      "CREATE_AGENT_MEMORY",
      "authorized",
      { memory_id: memoryId, agent_run_id: agentRunId },
      `Agent memory persistent run details saved successfully.`,
      memoryId,
      ipAddress
    );

    // Filter and record unresolved failures trace
    const unresolvedFailures = whatFailed.filter(f => !f.resolved);
    if (unresolvedFailures.length > 0) {
      await this.emitAuditLog(
        projectId,
        actor,
        "UPDATE_AGENT_MEMORY",
        "redacted_and_completed",
        { memory_id: memoryId, unresolved_count: unresolvedFailures.length },
        `Durable tracking registered unresolved system execution failures in memory record.`,
        memoryId,
        ipAddress
      );
    }

    // Filter and record next action generated trace
    if (nextRecommendedAction) {
      await this.emitAuditLog(
        projectId,
        actor,
        "UPDATE_AGENT_MEMORY",
        "redacted_and_completed",
        { memory_id: memoryId },
        `Next bounded continuity roadmap steps generated dynamically in memory.`,
        memoryId,
        ipAddress
      );
    }

    // Filter and record blocked/partial features captured trace
    const blockedOrPartial = whatRemains.filter(r => r.status === "blocked" || r.status === "partial");
    if (blockedOrPartial.length > 0) {
      await this.emitAuditLog(
        projectId,
        actor,
        "UPDATE_AGENT_MEMORY",
        "redacted_and_completed",
        { memory_id: memoryId, feature_ids: blockedOrPartial.map(p => p.feature_id) },
        `Continuity scope locked and serialized partial/blocked milestone references in metadata.`,
        memoryId,
        ipAddress
      );
    }

    return this.mapRowToAgentMemory({
      id: memoryId,
      project_id: projectId,
      task_id: taskId,
      agent_run_id: agentRunId,
      status,
      what_agent_did: whatAgentDid,
      why_agent_did_it: whyAgentDidIt,
      what_changed: whatChanged,
      what_failed: whatFailed,
      what_remains: whatRemains,
      next_recommended_action: nextRecommendedAction,
      confidence_score: confidenceScore,
      source_refs: sourceRefs,
      metadata_json: cleanMetadata,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  /**
   * Retrieves agent memories by task ID with scope validation.
   */
  public async getMemoriesByTaskId(
    projectId: string,
    taskId: string,
    actor = "system",
    ipAddress = "127.0.0.1"
  ): Promise<AgentMemory[]> {
    await this.validateProjectAndTaskScope(projectId, taskId);

    const res = await this.query(
      "SELECT * FROM agent_memories WHERE project_id = $1 AND task_id = $2 ORDER BY created_at DESC;",
      [projectId, taskId]
    );

    await this.emitAuditLog(
      projectId,
      actor,
      "READ_AGENT_MEMORY",
      "authorized",
      { task_id: taskId, count: res.rowCount },
      `Read agent memories for task ${taskId}.`,
      "",
      ipAddress
    );

    return res.rows.map(row => this.mapRowToAgentMemory(row));
  }

  /**
   * Retrieves the latest task execution status from memory cleanly.
   */
  public async getLatestMemoryForTask(
    projectId: string,
    taskId: string,
    actor = "system",
    ipAddress = "127.0.0.1"
  ): Promise<AgentMemory | null> {
    await this.validateProjectAndTaskScope(projectId, taskId);

    const res = await this.query(
      "SELECT * FROM agent_memories WHERE project_id = $1 AND task_id = $2 ORDER BY created_at DESC LIMIT 1;",
      [projectId, taskId]
    );

    if (res.rowCount === 0) return null;

    await this.emitAuditLog(
      projectId,
      actor,
      "READ_AGENT_MEMORY",
      "authorized",
      { task_id: taskId, memory_id: res.rows[0].id },
      `Read latest agent memory for task ${taskId}.`,
      res.rows[0].id,
      ipAddress
    );

    return this.mapRowToAgentMemory(res.rows[0]);
  }

  /**
   * Updates an existing memory record incrementally.
   */
  public async updateMemory(
    projectId: string,
    memoryId: string,
    updates: UpdateAgentMemoryDTO,
    actor: string,
    ipAddress = "127.0.0.1"
  ): Promise<AgentMemory> {
    const currentRes = await this.query(
      "SELECT * FROM agent_memories WHERE id = $1 LIMIT 1;",
      [memoryId]
    );
    if (currentRes.rowCount === 0) {
      throw new NotFoundError(`Agent memory to update not found: ${memoryId}`);
    }

    const current = currentRes.rows[0];
    if (current.project_id !== projectId) {
      throw new PermissionDeniedError(`Access denied: Target agent memory does not belong to specified project.`);
    }

    await this.validateProjectAndTaskScope(projectId, current.task_id);

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(updates.status);
    }
    if (updates.whatAgentDid !== undefined) {
      fields.push(`what_agent_did = $${idx++}`);
      values.push(JSON.stringify(this.redactAgentDid(updates.whatAgentDid)));
    }
    if (updates.whyAgentDidIt !== undefined) {
      fields.push(`why_agent_did_it = $${idx++}`);
      values.push(JSON.stringify(this.redactRationale(updates.whyAgentDidIt)));
    }
    if (updates.whatChanged !== undefined) {
      fields.push(`what_changed = $${idx++}`);
      values.push(JSON.stringify(this.redactChanged(updates.whatChanged)));
    }
    if (updates.whatFailed !== undefined) {
      fields.push(`what_failed = $${idx++}`);
      values.push(JSON.stringify(this.redactFailed(updates.whatFailed)));
    }
    if (updates.whatRemains !== undefined) {
      fields.push(`what_remains = $${idx++}`);
      values.push(JSON.stringify(this.redactRemains(updates.whatRemains)));
    }
    if (updates.nextRecommendedAction !== undefined) {
      fields.push(`next_recommended_action = $${idx++}`);
      values.push(updates.nextRecommendedAction);
    }
    if (updates.confidenceScore !== undefined) {
      fields.push(`confidence_score = $${idx++}`);
      values.push(updates.confidenceScore);
    }
    if (updates.sourceRefs !== undefined) {
      fields.push(`source_refs = $${idx++}`);
      values.push(JSON.stringify(updates.sourceRefs));
    }
    if (updates.metadataJson !== undefined) {
      const cleanMetadata = this.redactObjectRecursively(updates.metadataJson);
      fields.push(`metadata_json = $${idx++}`);
      values.push(JSON.stringify(cleanMetadata));
    }

    if (fields.length > 0) {
      fields.push(`updated_at = NOW()`);
      await this.query(
        `UPDATE agent_memories SET ${fields.join(", ")} WHERE id = $${idx} AND project_id = $${idx + 1};`,
        [...values, memoryId, projectId]
      );
    }

    const refreshedRes = await this.query("SELECT * FROM agent_memories WHERE id = $1 LIMIT 1;", [memoryId]);
    const refreshed = refreshedRes.rows[0];

    await this.emitAuditLog(
      projectId,
      actor,
      "UPDATE_AGENT_MEMORY",
      "authorized",
      { memory_id: memoryId },
      `Updated persistent agent memory successfully.`,
      memoryId,
      ipAddress
    );

    const finalFailed = refreshed.what_failed || [];
    const unresolvedFailures = finalFailed.filter((f: any) => !f.resolved);
    if (updates.whatFailed !== undefined && unresolvedFailures.length > 0) {
      await this.emitAuditLog(
        projectId,
        actor,
        "UPDATE_AGENT_MEMORY",
        "redacted_and_completed",
        { memory_id: memoryId, unresolved_count: unresolvedFailures.length },
        `Durable tracking registered unresolved system execution failures in memory record.`,
        memoryId,
        ipAddress
      );
    }

    if (updates.nextRecommendedAction !== undefined && refreshed.next_recommended_action) {
      await this.emitAuditLog(
        projectId,
        actor,
        "UPDATE_AGENT_MEMORY",
        "redacted_and_completed",
        { memory_id: memoryId },
        `Next bounded continuity roadmap steps generated dynamically in memory.`,
        memoryId,
        ipAddress
      );
    }

    const finalRemains = refreshed.what_remains || [];
    const blockedOrPartial = finalRemains.filter((r: any) => r.status === "blocked" || r.status === "partial");
    if (updates.whatRemains !== undefined && blockedOrPartial.length > 0) {
      await this.emitAuditLog(
        projectId,
        actor,
        "UPDATE_AGENT_MEMORY",
        "redacted_and_completed",
        { memory_id: memoryId, feature_ids: blockedOrPartial.map((p: any) => p.feature_id) },
        `Continuity scope locked and serialized partial/blocked milestone references in metadata.`,
        memoryId,
        ipAddress
      );
    }

    return this.mapRowToAgentMemory(refreshed);
  }

  // --- PRIVATE REDACTION HELPER METHODS ---

  private redactAgentDid(did: any[]): any[] {
    return did.map(item => ({
      action_type: redactSecretLeaks(String(item.action_type || "")),
      description: redactSecretLeaks(String(item.description || "")),
      related_files: (item.related_files || []).map((f: any) => redactSecretLeaks(String(f))),
      related_feature_ids: (item.related_feature_ids || []).map((id: any) => redactSecretLeaks(String(id))),
      timestamp: item.timestamp || new Date().toISOString(),
      confidence: item.confidence !== undefined ? Number(item.confidence) : 100.0,
    }));
  }

  private redactRationale(reasons: any[]): any[] {
    return reasons.map(item => {
      const label = item.rationale_type || item.type || "unknown";
      const desc = item.description || "";
      return {
        rationale_type: redactSecretLeaks(String(label)),
        description: redactSecretLeaks(String(desc || "unknown")),
        source: redactSecretLeaks(String(item.source || "system")),
      };
    });
  }

  private redactChanged(changed: any): any {
    return {
      files_changed: (changed.files_changed || []).map((f: any) => redactSecretLeaks(String(f))),
      database_changes: (changed.database_changes || []).map((f: any) => redactSecretLeaks(String(f))),
      api_changes: (changed.api_changes || []).map((f: any) => redactSecretLeaks(String(f))),
      ui_changes: (changed.ui_changes || []).map((f: any) => redactSecretLeaks(String(f))),
      test_changes: (changed.test_changes || []).map((f: any) => redactSecretLeaks(String(f))),
      security_changes: (changed.security_changes || []).map((f: any) => redactSecretLeaks(String(f))),
      audit_logging_changes: (changed.audit_logging_changes || []).map((f: any) => redactSecretLeaks(String(f))),
    };
  }

  private redactFailed(failed: any[]): any[] {
    return failed.map(item => ({
      failure_type: redactSecretLeaks(String(item.failure_type || "")),
      message: redactSecretLeaks(String(item.message || "")),
      affected_area: redactSecretLeaks(String(item.affected_area || "")),
      resolved: !!item.resolved,
      resolution: item.resolution ? redactSecretLeaks(String(item.resolution)) : undefined,
    }));
  }

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

  private redactRemains(remains: any[]): any[] {
    return remains.map(item => ({
      feature_id: redactSecretLeaks(String(item.feature_id || "")),
      status: redactSecretLeaks(String(item.status || "pending")),
      description: redactSecretLeaks(String(item.description || "")),
      risks: (item.risks || []).map((r: any) => redactSecretLeaks(String(r))),
    }));
  }

  public mapRowToAgentMemory(row: any): AgentMemory {
    return {
      id: row.id,
      projectId: row.project_id,
      taskId: row.task_id,
      agentRunId: row.agent_run_id,
      status: row.status,
      whatAgentDid: typeof row.what_agent_did === "string" ? JSON.parse(row.what_agent_did) : (row.what_agent_did || []),
      whyAgentDidIt: typeof row.why_agent_did_it === "string" ? JSON.parse(row.why_agent_did_it) : (row.why_agent_did_it || []),
      whatChanged: typeof row.what_changed === "string" ? JSON.parse(row.what_changed) : (row.what_changed || {}),
      whatFailed: typeof row.what_failed === "string" ? JSON.parse(row.what_failed) : (row.what_failed || []),
      whatRemains: typeof row.what_remains === "string" ? JSON.parse(row.what_remains) : (row.what_remains || []),
      nextRecommendedAction: row.next_recommended_action,
      confidenceScore: Number(row.confidence_score || 0.0),
      sourceRefs: typeof row.source_refs === "string" ? JSON.parse(row.source_refs) : (row.source_refs || []),
      metadataJson: typeof row.metadata_json === "string" ? JSON.parse(row.metadata_json) : (row.metadata_json || {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
