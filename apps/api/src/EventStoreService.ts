/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from "crypto";
import { 
  EventRecordDTO, 
  AppendEventDTO, 
  EventQueryDTO,
  EventType, 
  EventRecordStatus,
  NotFoundError,
  PermissionDeniedError,
  AuditFeatureIdType,
  AuditActionType,
  AuditLogStatusType
} from "@y/shared";
import { redactSecretLeaks } from "@y/security";
import { sysLogger } from "./logger";
import { PermissionKernelService } from "./PermissionKernelService";

// Helper functions for sanitization, canonicalization, and hashing
export function sanitizeEventPayload(payload: Record<string, any>): Record<string, any> {
  if (!payload) return {};
  
  // 1. Redact certificates
  let str = JSON.stringify(payload);
  str = str.replace(/-----BEGIN[A-Z\s]*CERTIFICATE-----(?:[A-Za-z0-9+/=\s\r\n\\]+)-----END[A-Z\s]*CERTIFICATE-----/g, "[REDACTED_CERTIFICATE]");
  
  // 2. Redact secret leaks (DATABASE_URL, passwords, API keys, tokens)
  str = redactSecretLeaks(str);
  
  // 3. Redact absolute paths to relative
  str = str.replace(/\/[a-zA-Z0-9_\-\.\/]+?\/(apps|packages|src|node_modules|dist)\//g, "./$1/");
  str = str.replace(/(?:[a-zA-Z]:\\(?:[a-zA-Z0-9_\-\.]+\\)*)(apps|packages|src|node_modules|dist)\\/g, ".\\$1\\");
  
  let obj: Record<string, any>;
  try {
    obj = JSON.parse(str);
  } catch {
    obj = { error: "Failed to parse sanitized payload", rawStringRedacted: redactSecretLeaks(str) };
  }
  
  return obj;
}

export function canonicalizeEventPayload(payload: Record<string, any>): string {
  function deepSort(obj: any): any {
    if (obj === null || typeof obj !== "object") {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(deepSort);
    }
    const sortedKeys = Object.keys(obj).sort();
    const result: Record<string, any> = {};
    for (const key of sortedKeys) {
      result[key] = deepSort(obj[key]);
    }
    return result;
  }
  return JSON.stringify(deepSort(payload));
}

export function computeEventHash(material: Record<string, any>): string {
  const sortedMaterial = canonicalizeEventPayload(material);
  return crypto.createHash("sha256").update(sortedMaterial).digest("hex");
}

export function redactEventMetadata(metadata: Record<string, any> | null | undefined): Record<string, any> {
  if (!metadata) return {};
  try {
    const str = JSON.stringify(metadata);
    return JSON.parse(redactSecretLeaks(str));
  } catch {
    return { error: "Failed to parse redacted metadata" };
  }
}

export class EventStoreService {
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
   * Validate linked evidence belongs to project & task if supplied
   */
  public async validateLinkedEvidenceScope(
    projectId: string,
    taskId: string | null | undefined,
    evidenceId: string | null | undefined
  ): Promise<void> {
    if (!evidenceId) return;
    const res = await this.query("SELECT project_id, task_id FROM evidence_records WHERE id = $1 LIMIT 1;", [evidenceId]);
    if (res.rowCount === 0) {
      throw new NotFoundError(`Linked Evidence Error: Evidence record with ID ${evidenceId} was not found.`);
    }
    if (res.rows[0].project_id !== projectId) {
      throw new PermissionDeniedError(`Linked Reference Scope Error: Referenced evidence is not inside Project ${projectId}.`);
    }
    if (taskId && res.rows[0].task_id && res.rows[0].task_id !== taskId) {
      throw new PermissionDeniedError(`Linked Reference Scope Error: Referenced evidence is not associated with Task ${taskId}.`);
    }
  }

  /**
   * Safe audit log emitting with secrets redacted
   */
  public async emitEventStoreAudit(
    projectId: string,
    action: AuditActionType,
    status: AuditLogStatusType,
    metadata: Record<string, any>,
    rationale: string,
    resourceId?: string
  ): Promise<void> {
    try {
      const cleanRationale = redactSecretLeaks(rationale);
      const cleanMetaStr = redactSecretLeaks(JSON.stringify(metadata));
      const cleanMeta = JSON.parse(cleanMetaStr);

      await this.logAction(
        projectId,
        "human-operator",
        "SEC", // Bounded to security feature ID
        action,
        status,
        cleanMeta,
        cleanRationale,
        resourceId,
        "127.0.0.1"
      );
    } catch (err: any) {
      sysLogger.error(`Failed to emit Event Store audit log: ${err.message}`);
    }
  }

  /**
   * Check if event already exists by idempotency key
   */
  public async findByIdempotencyKey(projectId: string, idempotencyKey: string): Promise<EventRecordDTO | null> {
    const res = await this.query(
      "SELECT * FROM event_records WHERE project_id = $1 AND idempotency_key = $2 LIMIT 1;",
      [projectId, idempotencyKey]
    );
    if (res.rowCount === 0) {
      return null;
    }
    return this.mapRowToDTO(res.rows[0]);
  }

  /**
   * Appends and registers a new domain event into the passive Event Store
   */
  public async appendEvent(dto: AppendEventDTO): Promise<EventRecordDTO> {
    // 1. Scope validations
    await this.validateProjectScope(dto.project_id);

    // Permission enforcement check
    await this.getPermissionKernel().enforce({
      subject: {
        subject_type: "system",
        subject_id: "system",
        project_id: dto.project_id,
        task_id: dto.task_id || undefined
      },
      resource: {
        resource_type: "event_record",
        resource_id: "new_event",
        project_id: dto.project_id,
        task_id: dto.task_id || undefined
      },
      action: "write"
    });

    if (dto.task_id) {
      await this.validateTaskScope(dto.project_id, dto.task_id);
    }
    if (dto.evidence_record_id) {
      await this.validateLinkedEvidenceScope(dto.project_id, dto.task_id || null, dto.evidence_record_id);
    }

    // 2. Idempotency Key check
    if (dto.idempotency_key) {
      const existing = await this.findByIdempotencyKey(dto.project_id, dto.idempotency_key);
      if (existing) {
        await this.emitEventStoreAudit(
          dto.project_id,
          "EVENT_IDEMPOTENCY_REUSED" as AuditActionType,
          "authorized",
          { id: existing.id, idempotency_key: dto.idempotency_key },
          `Duplicate request filtered: event ${existing.id} already exists with identical idempotency key.`
        );
        return existing;
      }
    }

    // 3. Sanitization
    const sanitizedPayload = sanitizeEventPayload(dto.payload_json);
    const sizeBytes = Buffer.byteLength(JSON.stringify(sanitizedPayload), "utf8");

    // Check if oversized (limit at 512KB)
    if (sizeBytes > 524288) {
      await this.emitEventStoreAudit(
        dto.project_id,
        "EVENT_RECORD_FAILURE" as AuditActionType,
        "denied_untrusted",
        { size_bytes: sizeBytes, event_type: dto.event_type },
        `Event store rejected creation: payload size exceeds the threshold requirement constraint limits.`
      );
      throw new Error(`Oversized payload rejected: size ${sizeBytes} bytes exceeds maximum allowed threshold of 524,288 bytes.`);
    }

    // Audit secret redactions if any secret leak was detected on creation
    const hasSecretLeakedBefore = JSON.stringify(dto.payload_json) !== JSON.stringify(sanitizedPayload);
    const eventId = `evnt_${crypto.randomBytes(8).toString("hex")}`;

    if (hasSecretLeakedBefore) {
      await this.emitEventStoreAudit(
        dto.project_id,
        "EVENT_SECRET_REDACTED" as AuditActionType,
        "authorized",
        { record_id: eventId, event_type: dto.event_type },
        `A credentials link or password leak was filtered and redacted on creation of event record ${eventId}.`,
        eventId
      );
    }

    const cleanMetadata = redactEventMetadata(dto.metadata);

    // 4. Integrity hash hashing
    // Hashing strictly over immutable data material (project_id, task_id, feature_id, event_type, source_table, source_id, idempotency_key, payload_json)
    const immutableMaterial = {
      project_id: dto.project_id,
      task_id: dto.task_id || null,
      feature_id: dto.feature_id || null,
      event_type: dto.event_type,
      source_table: dto.source_table || null,
      source_id: dto.source_id || null,
      idempotency_key: dto.idempotency_key || null,
      payload_json: sanitizedPayload
    };
    const payloadHash = computeEventHash(immutableMaterial);

    // 5. Database insertion
    const status = EventRecordStatus.COMMITTED;
    const hashAlgorithm = "sha256";

    await this.query(
      `INSERT INTO event_records (
        id, project_id, task_id, feature_id, event_type, status, source_table, source_id,
        actor_type, actor_id, idempotency_key, audit_log_id, evidence_record_id,
        payload_json, payload_hash, hash_algorithm, payload_size_bytes, metadata_json, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW());`,
      [
        eventId,
        dto.project_id,
        dto.task_id || null,
        dto.feature_id || null,
        dto.event_type,
        status,
        dto.source_table || null,
        dto.source_id || null,
        dto.actor_type,
        dto.actor_id || null,
        dto.idempotency_key || null,
        dto.audit_log_id || null,
        dto.evidence_record_id || null,
        JSON.stringify(sanitizedPayload),
        payloadHash,
        hashAlgorithm,
        sizeBytes,
        JSON.stringify(cleanMetadata)
      ]
    );

    await this.emitEventStoreAudit(
      dto.project_id,
      "EVENT_RECORD_APPENDED" as AuditActionType,
      "authorized",
      { record_id: eventId, event_type: dto.event_type, payload_hash: payloadHash },
      `Successfully registered and stored decentralized, append-only domain event for type: ${dto.event_type}.`,
      eventId
    );

    return {
      id: eventId,
      project_id: dto.project_id,
      task_id: dto.task_id || null,
      feature_id: dto.feature_id || null,
      event_type: dto.event_type,
      status,
      source_table: dto.source_table || null,
      source_id: dto.source_id || null,
      actor_type: dto.actor_type,
      actor_id: dto.actor_id || null,
      idempotency_key: dto.idempotency_key || null,
      audit_log_id: dto.audit_log_id || null,
      evidence_record_id: dto.evidence_record_id || null,
      payload_json: sanitizedPayload,
      payload_hash: payloadHash,
      hash_algorithm: hashAlgorithm,
      payload_size_bytes: sizeBytes,
      created_at: new Date().toISOString(),
      metadata_json: cleanMetadata
    };
  }

  /**
   * Retrieves a single event record and enforces project tenant boundaries
   */
  public async getEvent(projectId: string, id: string): Promise<EventRecordDTO> {
    await this.validateProjectScope(projectId);

    // Permission enforcement check
    await this.getPermissionKernel().enforce({
      subject: {
        subject_type: "system",
        subject_id: "system",
        project_id: projectId
      },
      resource: {
        resource_type: "event_record",
        resource_id: id,
        project_id: projectId
      },
      action: "read"
    });

    const res = await this.query("SELECT * FROM event_records WHERE id = $1 LIMIT 1;", [id]);
    if (res.rowCount === 0) {
      throw new NotFoundError(`Event record with identifier ${id} was not found inside the active event store query.`);
    }

    const record = res.rows[0];
    if (record.project_id !== projectId) {
      await this.emitEventStoreAudit(
        projectId,
        "EVENT_CROSS_PROJECT_ACCESS_BLOCKED" as AuditActionType,
        "denied_untrusted",
        { target_record_id: id, attempted_project_id: projectId },
        `Vertical security scope breach detected. High-level warning emitted.`
      );
      throw new PermissionDeniedError(`Permission Denied: Core security boundary restricts reading Event across project tenants.`);
    }

    await this.emitEventStoreAudit(
      projectId,
      "EVENT_RECORD_READ" as AuditActionType,
      "authorized",
      { id },
      `Event details retrieved by human operator.`,
      id
    );

    return this.mapRowToDTO(record);
  }

  /**
   * Lists event records, filtering strictly within the validated project scope
   */
  public async listEvents(
    projectId: string,
    filter?: EventQueryDTO
  ): Promise<EventRecordDTO[]> {
    await this.validateProjectScope(projectId);

    // Permission enforcement check
    await this.getPermissionKernel().enforce({
      subject: {
        subject_type: "system",
        subject_id: "system",
        project_id: projectId,
        task_id: filter?.task_id || undefined
      },
      resource: {
        resource_type: "event_record",
        resource_id: "all_events",
        project_id: projectId,
        task_id: filter?.task_id || undefined
      },
      action: "read"
    });

    if (filter?.task_id) {
      await this.validateTaskScope(projectId, filter.task_id);
    }

    let sql = "SELECT * FROM event_records WHERE project_id = $1";
    const params: any[] = [projectId];

    if (filter?.task_id) {
      params.push(filter.task_id);
      sql += ` AND task_id = $${params.length}`;
    }

    if (filter?.feature_id) {
      params.push(filter.feature_id);
      sql += ` AND feature_id = $${params.length}`;
    }

    if (filter?.event_type) {
      params.push(filter.event_type);
      sql += ` AND event_type = $${params.length}`;
    }

    if (filter?.source_table) {
      params.push(filter.source_table);
      sql += ` AND source_table = $${params.length}`;
    }

    if (filter?.source_id) {
      params.push(filter.source_id);
      sql += ` AND source_id = $${params.length}`;
    }

    if (filter?.idempotency_key) {
      params.push(filter.idempotency_key);
      sql += ` AND idempotency_key = $${params.length}`;
    }

    // Limit & pagination
    sql += " ORDER BY created_at DESC";
    const limit = Math.min(filter?.limit || 50, 100);
    params.push(limit);
    sql += ` LIMIT $${params.length}`;

    const res = await this.query(sql, params);
    return res.rows.map((row: any) => this.mapRowToDTO(row));
  }

  /**
   * Database Row mapping to formal DTO object
   */
  private mapRowToDTO(row: any): EventRecordDTO {
    return {
      id: row.id,
      project_id: row.project_id,
      task_id: row.task_id || null,
      feature_id: row.feature_id || null,
      event_type: row.event_type as EventType,
      status: row.status as EventRecordStatus,
      source_table: row.source_table || null,
      source_id: row.source_id || null,
      actor_type: row.actor_type,
      actor_id: row.actor_id || null,
      idempotency_key: row.idempotency_key || null,
      audit_log_id: row.audit_log_id || null,
      evidence_record_id: row.evidence_record_id || null,
      payload_json: typeof row.payload_json === "string" ? JSON.parse(row.payload_json) : row.payload_json,
      payload_hash: row.payload_hash,
      hash_algorithm: row.hash_algorithm,
      payload_size_bytes: Number(row.payload_size_bytes),
      created_at: new Date(row.created_at).toISOString(),
      metadata_json: typeof row.metadata_json === "string" ? JSON.parse(row.metadata_json) : row.metadata_json
    };
  }
}
