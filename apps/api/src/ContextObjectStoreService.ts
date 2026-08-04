/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from "crypto";
import { 
  ContextObjectDTO,
  CreateContextObjectDTO,
  ContextObjectRefDTO,
  ContextObjectType,
  ContextObjectStatus,
  NotFoundError,
  PermissionDeniedError,
  BaseError,
  AuditFeatureIdType,
  AuditActionType,
  AuditLogStatusType
} from "@y/shared";
import { redactSecretLeaks } from "@y/security";
import { sysLogger } from "./logger";
import { PermissionKernelService } from "./PermissionKernelService";

// Helper functions for sanitization, canonicalization, and hashing
export function sanitizeContextPayload(
  payloadText: string | null | undefined,
  payloadJson: Record<string, any> | null | undefined
): { 
  sanitizedText: string | null; 
  sanitizedJson: Record<string, any> | null; 
  secretRedacted: boolean;
} {
  let secretRedacted = false;
  let sanitizedText: string | null = null;
  let sanitizedJson: Record<string, any> | null = null;

  // 1. Sanitize text payload
  if (payloadText !== null && payloadText !== undefined) {
    let text = payloadText;
    
    // Check if contains typical sensitive patterns to set our flag
    if (
      text.includes("postgres://") || 
      text.includes("postgresql://") || 
      text.includes("aiza-sy-") || 
      text.includes("-----BEGIN CERTIFICATE-----") || 
      text.includes("-----BEGIN RSA PRIVATE KEY-----") ||
      /AIZA[0-9a-zA-Z_\-]{35}/i.test(text)
    ) {
      secretRedacted = true;
    }

    // Perform redactions just in case
    text = text.replace(/-----BEGIN[A-Z\s]*CERTIFICATE-----(?:[A-Za-z0-9+/=\s\r\n\\]+)-----END[A-Z\s]*CERTIFICATE-----/g, "[REDACTED_CERTIFICATE]");
    text = text.replace(/-----BEGIN[A-Z\s]*PRIVATE KEY-----(?:[A-Za-z0-9+/=\s\r\n\\]+)-----END[A-Z\s]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]");
    text = redactSecretLeaks(text);

    // Absolute path redaction to relative
    text = text.replace(/\/[a-zA-Z0-9_\-\.\/]+?\/(apps|packages|src|node_modules|dist)\//g, "./$1/");
    text = text.replace(/(?:[a-zA-Z]:\\(?:[a-zA-Z0-9_\-\.]+\\)*)(apps|packages|src|node_modules|dist)\\/g, ".\\$1\\");

    sanitizedText = text;
  }

  // 2. Sanitize JSON payload
  if (payloadJson !== null && payloadJson !== undefined) {
    let jsonStr = JSON.stringify(payloadJson);

    if (
      jsonStr.includes("postgres://") || 
      jsonStr.includes("postgresql://") || 
      jsonStr.includes("aiza-sy-") || 
      jsonStr.includes("-----BEGIN CERTIFICATE-----") || 
      jsonStr.includes("-----BEGIN RSA PRIVATE KEY-----") ||
      /AIZA[0-9a-zA-Z_\-]{35}/i.test(jsonStr)
    ) {
      secretRedacted = true;
    }

    // Perform redactions just in case
    jsonStr = jsonStr.replace(/-----BEGIN[A-Z\s]*CERTIFICATE-----(?:[A-Za-z0-9+/=\s\r\n\\]+)-----END[A-Z\s]*CERTIFICATE-----/g, "[REDACTED_CERTIFICATE]");
    jsonStr = jsonStr.replace(/-----BEGIN[A-Z\s]*PRIVATE KEY-----(?:[A-Za-z0-9+/=\s\r\n\\]+)-----END[A-Z\s]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]");
    jsonStr = redactSecretLeaks(jsonStr);

    // Absolute path redaction
    jsonStr = jsonStr.replace(/\/[a-zA-Z0-9_\-\.\/]+?\/(apps|packages|src|node_modules|dist)\//g, "./$1/");
    jsonStr = jsonStr.replace(/(?:[a-zA-Z]:\\(?:[a-zA-Z0-9_\-\.]+\\)*)(apps|packages|src|node_modules|dist)\\/g, ".\\$1\\");

    try {
      sanitizedJson = JSON.parse(jsonStr);
    } catch {
      sanitizedJson = { error: "Failed to parse sanitized JSON", rawStringRedacted: redactSecretLeaks(jsonStr) };
    }
  }

  return { sanitizedText, sanitizedJson, secretRedacted };
}

export function canonicalizeContextPayload(payload: Record<string, any>): string {
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

export function computeContentHash(
  payloadText: string | null,
  payloadJson: Record<string, any> | null
): string {
  let material = "";
  if (payloadText !== null) {
    material += payloadText;
  }
  if (payloadJson !== null) {
    material += "|" + canonicalizeContextPayload(payloadJson);
  }
  if (!material) {
    material = "empty_payload";
  }
  return crypto.createHash("sha256").update(material).digest("hex");
}

export class ContextObjectStoreService {
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

  public sanitizeContextPayload(
    payloadText: string | null | undefined,
    payloadJson: Record<string, any> | null | undefined
  ) {
    return sanitizeContextPayload(payloadText, payloadJson);
  }

  public canonicalizeContextPayload(payload: Record<string, any>): string {
    return canonicalizeContextPayload(payload);
  }

  public computeContentHash(
    payloadText: string | null,
    payloadJson: Record<string, any> | null
  ): string {
    return computeContentHash(payloadText, payloadJson);
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
   * Helper to validate linked sources do not bypass project boundaries
   */
  public async validateSourceScope(
    projectId: string,
    sourceTable: string | null | undefined,
    sourceId: string | null | undefined
  ): Promise<void> {
    if (!sourceTable || !sourceId) return;

    if (sourceTable === "tasks") {
      await this.validateTaskScope(projectId, sourceId);
    } else if (sourceTable === "projects") {
      if (sourceId !== projectId) {
        throw new PermissionDeniedError(`Source scope boundary violation: Project source reference mismatch.`);
      }
    } else {
      // Validate table query matching project_id if the schema supports it
      try {
        const res = await this.query(
          `SELECT project_id FROM ${sourceTable} WHERE id = $1 LIMIT 1;`,
          [sourceId]
        );
        if (res.rowCount > 0 && res.rows[0].project_id !== projectId) {
          throw new PermissionDeniedError(`Source scope boundaries violation: Referenced content belongs to another project.`);
        }
      } catch (err: any) {
        if (err instanceof PermissionDeniedError) throw err;
        // If table doesn't have project_id or isn't queryable, we log clean info
        sysLogger.debug(`Dynamic source check skipped for table ${sourceTable}: ${err.message}`);
      }
    }
  }

  /**
   * Safe audit emitter wrapper
   */
  public async emitContextObjectAudit(
    projectId: string,
    action: AuditActionType,
    status: AuditLogStatusType,
    metadata: Record<string, any>,
    rationale: string,
    resourceId?: string
  ): Promise<void> {
    try {
      // Filter out any potential secrets from audit metadata
      const cleanMetaStr = redactSecretLeaks(JSON.stringify(metadata || {}));
      const cleanMeta = JSON.parse(cleanMetaStr);

      await this.logAction(
        projectId,
        "ai-agent",
        "CTX",
        action,
        status,
        cleanMeta,
        rationale,
        resourceId
      );
    } catch (err: any) {
      sysLogger.error(`Failed to emit Context Object audit log: ${err.message}`);
    }
  }

  /**
   * Create Context Object
   */
  public async createContextObject(dto: CreateContextObjectDTO): Promise<ContextObjectDTO> {
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
        resource_type: "context_object",
        resource_id: "new_context_object",
        project_id: dto.project_id,
        task_id: dto.task_id || undefined
      },
      action: "write"
    });

    if (dto.task_id) {
      await this.validateTaskScope(dto.project_id, dto.task_id);
    }
    if (dto.source_table && dto.source_id) {
      await this.validateSourceScope(dto.project_id, dto.source_table, dto.source_id);
    }

    const rawText = dto.payload_text || null;
    const rawJson = dto.payload_json || null;

    // Check strict max payload size
    const textBytes = rawText ? Buffer.byteLength(rawText, "utf8") : 0;
    const jsonBytes = rawJson ? Buffer.byteLength(JSON.stringify(rawJson), "utf8") : 0;
    const totalBytes = textBytes + jsonBytes;
    
    const MAX_SIZE = 1024 * 1024; // 1MB
    if (totalBytes > MAX_SIZE) {
      await this.emitContextObjectAudit(
        dto.project_id,
        "CONTEXT_OBJECT_PAYLOAD_REJECTED",
        "denied_untrusted",
        { size_bytes: totalBytes, limit: MAX_SIZE },
        `Context payload rejected: Size ${totalBytes} bytes exceeds strict 1MB limits.`
      );
      throw new BaseError(
        "CONTEXT_OBJECT_PAYLOAD_REJECTED",
        `Context payload rejected: Size ${totalBytes} bytes exceeds strict 1MB limits.`,
        400
      );
    }

    // Check for raw DATABASE_URL, postgres connections, keys, private certs and redact/reject them
    const combinedStr = (rawText || "") + "|" + (rawJson ? JSON.stringify(rawJson) : "");
    const containsSecrets = 
      combinedStr.includes("postgres://") || 
      combinedStr.includes("postgresql://") || 
      combinedStr.includes("aiza-sy-") || 
      /AIZA[0-9a-zA-Z_\-]{35}/i.test(combinedStr) ||
      combinedStr.includes("-----BEGIN CERTIFICATE-----") || 
      combinedStr.includes("-----BEGIN RSA PRIVATE KEY-----") ||
      combinedStr.includes("DATABASE_URL") ||
      combinedStr.includes(".env");

    if (containsSecrets) {
      await this.emitContextObjectAudit(
        dto.project_id,
        "CONTEXT_OBJECT_SECRET_REDACTED",
        "redacted_and_completed",
        { object_type: dto.object_type },
        "Potential sensitive credentials or absolute workspace parameters identified inside payload during verification. Sanitization executed."
      );
    }

    // Apply sanitization
    const { sanitizedText, sanitizedJson } = this.sanitizeContextPayload(rawText, rawJson);

    // Compute deterministic SHA-256 content_hash
    const content_hash = this.computeContentHash(sanitizedText, sanitizedJson);

    // Calculate payload size
    const finalTxBytes = sanitizedText ? Buffer.byteLength(sanitizedText, "utf8") : 0;
    const finalJsBytes = sanitizedJson ? Buffer.byteLength(JSON.stringify(sanitizedJson), "utf8") : 0;
    const finalBytes = finalTxBytes + finalJsBytes;

    const id = `cobj_${crypto.randomBytes(16).toString("hex")}`;
    const cleanMetadata = dto.metadata ? JSON.parse(redactSecretLeaks(JSON.stringify(dto.metadata))) : {};

    // Try finding existing deduplication match (project_id + content_hash + object_type)
    const exactMatch = await this.query(
      `SELECT * FROM context_objects 
       WHERE project_id = $1 AND content_hash = $2 AND object_type = $3 LIMIT 1;`,
      [dto.project_id, content_hash, dto.object_type]
    );

    if (exactMatch.rowCount > 0) {
      const existing = exactMatch.rows[0];
      await this.emitContextObjectAudit(
        dto.project_id,
        "CONTEXT_OBJECT_READ",
        "authorized",
        { id: existing.id, deduplicated: true, content_hash },
        "Deduplication matched. Returned existing identical Context Object reference."
      );
      return {
        id: existing.id,
        project_id: existing.project_id,
        task_id: existing.task_id,
        feature_id: existing.feature_id,
        object_type: existing.object_type,
        status: existing.status,
        source_table: existing.source_table,
        source_id: existing.source_id,
        content_hash: existing.content_hash,
        hash_algorithm: existing.hash_algorithm,
        payload_size_bytes: existing.payload_size_bytes,
        payload_text: existing.payload_text,
        payload_json: existing.payload_json,
        metadata_json: existing.metadata_json,
        created_at: existing.created_at.toISOString ? existing.created_at.toISOString() : existing.created_at,
        updated_at: existing.updated_at.toISOString ? existing.updated_at.toISOString() : existing.updated_at,
        stale_at: existing.stale_at ? (existing.stale_at.toISOString ? existing.stale_at.toISOString() : existing.stale_at) : null,
        quarantined_at: existing.quarantined_at ? (existing.quarantined_at.toISOString ? existing.quarantined_at.toISOString() : existing.quarantined_at) : null,
      };
    }

    // Insert new context object record
    await this.query(
      `INSERT INTO context_objects (
        id, project_id, task_id, feature_id, object_type, status, source_table, source_id,
        content_hash, hash_algorithm, payload_size_bytes, payload_text, payload_json, metadata_json,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8, 'sha256', $9, $10, $11, $12, NOW(), NOW());`,
      [
        id,
        dto.project_id,
        dto.task_id || null,
        dto.feature_id || null,
        dto.object_type,
        dto.source_table || null,
        dto.source_id || null,
        content_hash,
        finalBytes,
        sanitizedText,
        sanitizedJson ? JSON.stringify(sanitizedJson) : null,
        JSON.stringify(cleanMetadata)
      ]
    );

    await this.emitContextObjectAudit(
      dto.project_id,
      "CONTEXT_OBJECT_STORED",
      "authorized",
      { id, content_hash, object_type: dto.object_type },
      "New context object recorded and securely persisted locally."
    );

    const freshRes = await this.query("SELECT * FROM context_objects WHERE id = $1 LIMIT 1;", [id]);
    const row = freshRes.rows[0];

    return {
      id: row.id,
      project_id: row.project_id,
      task_id: row.task_id,
      feature_id: row.feature_id,
      object_type: row.object_type,
      status: row.status,
      source_table: row.source_table,
      source_id: row.source_id,
      content_hash: row.content_hash,
      hash_algorithm: row.hash_algorithm,
      payload_size_bytes: row.payload_size_bytes,
      payload_text: row.payload_text,
      payload_json: row.payload_json,
      metadata_json: row.metadata_json,
      created_at: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
      updated_at: row.updated_at.toISOString ? row.updated_at.toISOString() : row.updated_at,
      stale_at: null,
      quarantined_at: null
    };
  }

  /**
   * Get Context Object Detail
   */
  public async getContextObject(projectId: string, objectId: string): Promise<ContextObjectDTO> {
    await this.validateProjectScope(projectId);

    // Permission enforcement check
    await this.getPermissionKernel().enforce({
      subject: {
        subject_type: "system",
        subject_id: "system",
        project_id: projectId
      },
      resource: {
        resource_type: "context_object",
        resource_id: objectId,
        project_id: projectId
      },
      action: "read"
    });

    const res = await this.query("SELECT * FROM context_objects WHERE id = $1 LIMIT 1;", [objectId]);
    if (res.rowCount === 0) {
      throw new NotFoundError(`Context object ${objectId} not found.`);
    }

    const row = res.rows[0];
    if (row.project_id !== projectId) {
      await this.emitContextObjectAudit(
        projectId,
        "CONTEXT_OBJECT_ACCESS_DENIED",
        "denied_untrusted",
        { id: objectId, target_project_id: row.project_id },
        "Cross-project context boundaries boundary violation blocked."
      );
      throw new PermissionDeniedError("Cross-project context access is strictly forbidden.");
    }

    await this.emitContextObjectAudit(
      projectId,
      "CONTEXT_OBJECT_READ",
      "authorized",
      { id: objectId, status: row.status },
      "Context object details loaded."
    );

    return {
      id: row.id,
      project_id: row.project_id,
      task_id: row.task_id,
      feature_id: row.feature_id,
      object_type: row.object_type,
      status: row.status,
      source_table: row.source_table,
      source_id: row.source_id,
      content_hash: row.content_hash,
      hash_algorithm: row.hash_algorithm,
      payload_size_bytes: row.payload_size_bytes,
      payload_text: row.payload_text,
      payload_json: row.payload_json,
      metadata_json: row.metadata_json,
      created_at: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
      updated_at: row.updated_at.toISOString ? row.updated_at.toISOString() : row.updated_at,
      stale_at: row.stale_at ? (row.stale_at.toISOString ? row.stale_at.toISOString() : row.stale_at) : null,
      quarantined_at: row.quarantined_at ? (row.quarantined_at.toISOString ? row.quarantined_at.toISOString() : row.quarantined_at) : null,
    };
  }

  /**
   * List Context Objects by Query (Omit payloads by default)
   */
  public async listContextObjects(
    projectId: string,
    filters: {
      task_id?: string | null;
      feature_id?: string | null;
      object_type?: ContextObjectType | string | null;
      status?: ContextObjectStatus | string | null;
      source_table?: string | null;
      source_id?: string | null;
      limit?: number;
    } = {}
  ): Promise<ContextObjectDTO[]> {
    await this.validateProjectScope(projectId);

    // Permission enforcement check
    await this.getPermissionKernel().enforce({
      subject: {
        subject_type: "system",
        subject_id: "system",
        project_id: projectId,
        task_id: filters.task_id || undefined
      },
      resource: {
        resource_type: "context_object",
        resource_id: "all_context_objects",
        project_id: projectId,
        task_id: filters.task_id || undefined
      },
      action: "read"
    });

    let sql = `
      SELECT id, project_id, task_id, feature_id, object_type, status, source_table, source_id,
             content_hash, hash_algorithm, payload_size_bytes, metadata_json, created_at, updated_at, stale_at, quarantined_at
      FROM context_objects
      WHERE project_id = $1
    `;
    const params: any[] = [projectId];
    let idx = 2;

    if (filters.task_id) {
      await this.validateTaskScope(projectId, filters.task_id);
      sql += ` AND task_id = $${idx}`;
      params.push(filters.task_id);
      idx++;
    }
    if (filters.feature_id) {
      sql += ` AND feature_id = $${idx}`;
      params.push(filters.feature_id);
      idx++;
    }
    if (filters.object_type) {
      sql += ` AND object_type = $${idx}`;
      params.push(filters.object_type);
      idx++;
    }
    if (filters.status) {
      sql += ` AND status = $${idx}`;
      params.push(filters.status);
      idx++;
    }
    if (filters.source_table) {
      sql += ` AND source_table = $${idx}`;
      params.push(filters.source_table);
      idx++;
    }
    if (filters.source_id) {
      sql += ` AND source_id = $${idx}`;
      params.push(filters.source_id);
      idx++;
    }

    sql += " ORDER BY created_at DESC";

    if (filters.limit) {
      sql += ` LIMIT $${idx}`;
      params.push(filters.limit);
    }

    const res = await this.query(sql, params);

    return res.rows.map((row: any) => ({
      id: row.id,
      project_id: row.project_id,
      task_id: row.task_id,
      feature_id: row.feature_id,
      object_type: row.object_type,
      status: row.status,
      source_table: row.source_table,
      source_id: row.source_id,
      content_hash: row.content_hash,
      hash_algorithm: row.hash_algorithm,
      payload_size_bytes: row.payload_size_bytes,
      payload_text: null, // OMIT BY DEFAULT
      payload_json: null, // OMIT BY DEFAULT
      metadata_json: row.metadata_json,
      created_at: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
      updated_at: row.updated_at.toISOString ? row.updated_at.toISOString() : row.updated_at,
      stale_at: row.stale_at ? (row.stale_at.toISOString ? row.stale_at.toISOString() : row.stale_at) : null,
      quarantined_at: row.quarantined_at ? (row.quarantined_at.toISOString ? row.quarantined_at.toISOString() : row.quarantined_at) : null,
    }));
  }

  /**
   * Mark Stale State Transition
   */
  public async markStale(projectId: string, objectId: string): Promise<ContextObjectDTO> {
    await this.validateProjectScope(projectId);

    // Permission enforcement check
    await this.getPermissionKernel().enforce({
      subject: {
        subject_type: "system",
        subject_id: "system",
        project_id: projectId
      },
      resource: {
        resource_type: "context_object",
        resource_id: objectId,
        project_id: projectId
      },
      action: "transition"
    });

    const check = await this.query("SELECT project_id, status FROM context_objects WHERE id = $1 LIMIT 1;", [objectId]);
    if (check.rowCount === 0) {
      throw new NotFoundError(`Context object ${objectId} not found.`);
    }
    if (check.rows[0].project_id !== projectId) {
      throw new PermissionDeniedError("Cross-project transition blocked.");
    }

    await this.query(
      `UPDATE context_objects 
       SET status = 'stale', stale_at = NOW(), updated_at = NOW() 
       WHERE id = $1;`,
      [objectId]
    );

    await this.emitContextObjectAudit(
      projectId,
      "CONTEXT_OBJECT_STATE_TRANSITIONED",
      "authorized",
      { id: objectId, prev_status: check.rows[0].status, final_status: "stale" },
      "Context object marked as stale."
    );

    return this.getContextObject(projectId, objectId);
  }

  /**
   * Mark Quarantined State Transition
   */
  public async markQuarantined(projectId: string, objectId: string): Promise<ContextObjectDTO> {
    await this.validateProjectScope(projectId);

    // Permission enforcement check
    await this.getPermissionKernel().enforce({
      subject: {
        subject_type: "system",
        subject_id: "system",
        project_id: projectId
      },
      resource: {
        resource_type: "context_object",
        resource_id: objectId,
        project_id: projectId
      },
      action: "transition"
    });

    const check = await this.query("SELECT project_id, status FROM context_objects WHERE id = $1 LIMIT 1;", [objectId]);
    if (check.rowCount === 0) {
      throw new NotFoundError(`Context object ${objectId} not found.`);
    }
    if (check.rows[0].project_id !== projectId) {
      throw new PermissionDeniedError("Cross-project transition blocked.");
    }

    await this.query(
      `UPDATE context_objects 
       SET status = 'quarantined', quarantined_at = NOW(), updated_at = NOW() 
       WHERE id = $1;`,
      [objectId]
    );

    await this.emitContextObjectAudit(
      projectId,
      "CONTEXT_OBJECT_QUARANTINED",
      "authorized",
      { id: objectId, prev_status: check.rows[0].status, final_status: "quarantined" },
      "Context object quarantined successfully."
    );

    return this.getContextObject(projectId, objectId);
  }

  /**
   * Create Context Object Link / Reference
   */
  public async createContextObjectRef(dto: {
    project_id: string;
    task_id?: string | null;
    context_object_id: string;
    ref_type: string;
    ref_table?: string | null;
    ref_id?: string | null;
    metadata?: Record<string, any> | null;
  }): Promise<ContextObjectRefDTO> {
    await this.validateProjectScope(dto.project_id);
    if (dto.task_id) {
      await this.validateTaskScope(dto.project_id, dto.task_id);
    }

    // Verify context object exists and scopes correctly
    const objCheck = await this.query("SELECT project_id FROM context_objects WHERE id = $1 LIMIT 1;", [dto.context_object_id]);
    if (objCheck.rowCount === 0) {
      throw new NotFoundError(`Reference target Context object ${dto.context_object_id} not found.`);
    }
    if (objCheck.rows[0].project_id !== dto.project_id) {
      throw new PermissionDeniedError("Ref connection bypass across project is forbidden.");
    }

    if (dto.ref_table && dto.ref_id) {
      await this.validateSourceScope(dto.project_id, dto.ref_table, dto.ref_id);
    }

    const refId = `cref_${crypto.randomBytes(16).toString("hex")}`;
    const cleanMetadata = dto.metadata ? JSON.parse(redactSecretLeaks(JSON.stringify(dto.metadata))) : {};

    await this.query(
      `INSERT INTO context_object_refs (
        id, project_id, task_id, context_object_id, ref_type, ref_table, ref_id, metadata_json, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW());`,
      [
        refId,
        dto.project_id,
        dto.task_id || null,
        dto.context_object_id,
        dto.ref_type,
        dto.ref_table || null,
        dto.ref_id || null,
        JSON.stringify(cleanMetadata)
      ]
    );

    await this.emitContextObjectAudit(
      dto.project_id,
      "CONTEXT_OBJECT_REF_CREATED",
      "authorized",
      { id: refId, context_object_id: dto.context_object_id, ref_type: dto.ref_type },
      "New relational linkage created to trace context history footprint."
    );

    const freshRes = await this.query("SELECT * FROM context_object_refs WHERE id = $1 LIMIT 1;", [refId]);
    const row = freshRes.rows[0];

    return {
      id: row.id,
      project_id: row.project_id,
      task_id: row.task_id,
      context_object_id: row.context_object_id,
      ref_type: row.ref_type,
      ref_table: row.ref_table,
      ref_id: row.ref_id,
      created_at: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
      metadata_json: row.metadata_json
    };
  }

  /**
   * List references/linkages of a context object
   */
  public async listContextObjectRefs(projectId: string, objectId: string): Promise<ContextObjectRefDTO[]> {
    await this.validateProjectScope(projectId);

    // Verify ownership
    const objCheck = await this.query("SELECT project_id FROM context_objects WHERE id = $1 LIMIT 1;", [objectId]);
    if (objCheck.rowCount === 0) {
      throw new NotFoundError(`Context object ${objectId} not found.`);
    }
    if (objCheck.rows[0].project_id !== projectId) {
      throw new PermissionDeniedError("Cross-project read blocked.");
    }

    const res = await this.query(
      `SELECT * FROM context_object_refs 
       WHERE context_object_id = $1 AND project_id = $2 
       ORDER BY created_at DESC;`,
      [objectId, projectId]
    );

    return res.rows.map((row: any) => ({
      id: row.id,
      project_id: row.project_id,
      task_id: row.task_id,
      context_object_id: row.context_object_id,
      ref_type: row.ref_type,
      ref_table: row.ref_table,
      ref_id: row.ref_id,
      created_at: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
      metadata_json: row.metadata_json
    }));
  }
}
