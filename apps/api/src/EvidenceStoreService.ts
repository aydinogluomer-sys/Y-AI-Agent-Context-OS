/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from "crypto";
import { 
  EvidenceRecordDTO, 
  CreateEvidenceRecordDTO, 
  EvidenceVerificationResultDTO, 
  EvidenceType, 
  EvidenceStatus,
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
export function sanitizeEvidencePayload(payload: Record<string, any>): Record<string, any> {
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

export function canonicalizeEvidencePayload(payload: Record<string, any>): string {
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

export function computeEvidenceHash(
  payload: Record<string, any>,
  sourceRefs: {
    id: string;
    project_id: string;
    task_id: string | null;
    feature_id: string | null;
    evidence_type: string;
    actor_type: string;
    actor_id: string | null;
    audit_log_id: string | null;
    quality_gate_run_id: string | null;
    quality_gate_command_result_id: string | null;
    artifact_id: string | null;
    source_table: string | null;
    source_id: string | null;
  }
): string {
  const canonicalPayloadString = canonicalizeEvidencePayload(payload);
  
  const sortedRefs: Record<string, any> = {};
  const refKeys = Object.keys(sourceRefs).sort() as Array<keyof typeof sourceRefs>;
  for (const k of refKeys) {
    sortedRefs[k] = sourceRefs[k];
  }
  const refsString = JSON.stringify(sortedRefs);
  
  const combinedData = refsString + "|" + canonicalPayloadString;
  return crypto.createHash("sha256").update(combinedData).digest("hex");
}

export function redactEvidenceMetadata(metadata: Record<string, any> | null | undefined): Record<string, any> {
  if (!metadata) return {};
  try {
    const str = JSON.stringify(metadata);
    return JSON.parse(redactSecretLeaks(str));
  } catch {
    return { error: "Failed to parse redacted metadata" };
  }
}

export class EvidenceStoreService {
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
   * Validate linked records (quality gates) belong to same project / task if provided
   */
  public async validateLinkedSourceScope(
    projectId: string,
    taskId: string | null | undefined,
    runId: string | null | undefined,
    commandResultId: string | null | undefined
  ): Promise<void> {
    if (runId) {
      const qres = await this.query("SELECT project_id, task_id FROM quality_gate_runs WHERE id = $1 LIMIT 1;", [runId]);
      if (qres.rowCount === 0) {
        throw new NotFoundError(`Linked Source Error: Quality Gate run with ID ${runId} was not found.`);
      }
      if (qres.rows[0].project_id !== projectId) {
        throw new PermissionDeniedError(`Linked Source Error: Quality Gate run does not match Project ${projectId}.`);
      }
      if (taskId && qres.rows[0].task_id && qres.rows[0].task_id !== taskId) {
        throw new PermissionDeniedError(`Linked Source Error: Quality Gate run does not match Task ${taskId}.`);
      }
    }

    if (commandResultId) {
      const cres = await this.query("SELECT project_id, task_id FROM quality_gate_command_results WHERE id = $1 LIMIT 1;", [commandResultId]);
      if (cres.rowCount === 0) {
        throw new NotFoundError(`Linked Source Error: Quality Gate command result with ID ${commandResultId} was not found.`);
      }
      if (cres.rows[0].project_id !== projectId) {
        throw new PermissionDeniedError(`Linked Source Error: Quality Gate command result does not match Project ${projectId}.`);
      }
      if (taskId && cres.rows[0].task_id && cres.rows[0].task_id !== taskId) {
        throw new PermissionDeniedError(`Linked Source Error: Quality Gate command result does not match Task ${taskId}.`);
      }
    }
  }

  /**
   * Safe audit log emitting with secrets redacted
   */
  public async emitEvidenceAudit(
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
        "SEC", // Bounded to security
        action,
        status,
        cleanMeta,
        cleanRationale,
        resourceId,
        "127.0.0.1"
      );
    } catch (err: any) {
      sysLogger.error(`Failed to emit evidence audit log: ${err.message}`);
    }
  }

  /**
   * Create and persist a new, sanitized, deterministically-hashed Evidence Record
   */
  public async createEvidenceRecord(dto: CreateEvidenceRecordDTO): Promise<EvidenceRecordDTO> {
    // 1. Scoping validations
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
        resource_type: "evidence_record",
        resource_id: "new_evidence",
        project_id: dto.project_id,
        task_id: dto.task_id || undefined
      },
      action: "write"
    });

    if (dto.task_id) {
      await this.validateTaskScope(dto.project_id, dto.task_id);
    }
    
    // 2. Cross-referencing scoping
    await this.validateLinkedSourceScope(
      dto.project_id,
      dto.task_id,
      dto.quality_gate_run_id,
      dto.quality_gate_command_result_id
    );

    // 3. Payload sanitization
    const sanitizedPayload = sanitizeEvidencePayload(dto.payload_json);
    const sizeBytes = Buffer.byteLength(JSON.stringify(sanitizedPayload), "utf8");

    // Guard rails: Enforce volume constraint
    if (sizeBytes > 5 * 1024 * 1024) {
      throw new PermissionDeniedError("Guardrail Violation: Evidence record payload exceeds maximum 5MB size limit.");
    }

    // Checking if raw metadata contains secret leaks
    const hasSecretLeakedBefore = JSON.stringify(dto.payload_json) !== JSON.stringify(sanitizedPayload);

    // 4. Record ID & metadata assembly
    const evidenceId = `evid_${crypto.randomBytes(8).toString("hex")}`;
    const cleanMetadata = redactEvidenceMetadata(dto.metadata);
    if (hasSecretLeakedBefore) {
      cleanMetadata.secrets_detected_and_redacted = true;
      await this.emitEvidenceAudit(
        dto.project_id,
        "EVIDENCE_SECRET_REDACTED",
        "redacted_and_completed",
        { record_id: evidenceId, evidence_type: dto.evidence_type },
        `A credentials link or password leak was filtered and redacted on creation of evidence record ${evidenceId}.`,
        evidenceId
      );
    }

    const payloadRefs = {
      id: evidenceId,
      project_id: dto.project_id,
      task_id: dto.task_id || null,
      feature_id: dto.feature_id || null,
      evidence_type: dto.evidence_type,
      actor_type: dto.actor_type,
      actor_id: dto.actor_id || null,
      audit_log_id: dto.audit_log_id || null,
      quality_gate_run_id: dto.quality_gate_run_id || null,
      quality_gate_command_result_id: dto.quality_gate_command_result_id || null,
      artifact_id: dto.artifact_id || null,
      source_table: dto.source_table || null,
      source_id: dto.source_id || null,
    };

    // 5. Hash generation
    const contentHash = computeEvidenceHash(sanitizedPayload, payloadRefs);

    // 6. DB Insertion using Parameterized SQL
    const status = EvidenceStatus.PENDING;
    const hashAlg = "sha256";

    await this.query(
      `INSERT INTO evidence_records (
        id, project_id, task_id, feature_id, evidence_type, status, actor_type, actor_id,
        audit_log_id, quality_gate_run_id, quality_gate_command_result_id, artifact_id,
        source_table, source_id, payload_json, content_hash, hash_algorithm, payload_size_bytes,
        created_at, verified_at, verification_meta_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NULL, '{}'::jsonb);`,
      [
        evidenceId,
        dto.project_id,
        dto.task_id || null,
        dto.feature_id || null,
        dto.evidence_type,
        status,
        dto.actor_type,
        dto.actor_id || null,
        dto.audit_log_id || null,
        dto.quality_gate_run_id || null,
        dto.quality_gate_command_result_id || null,
        dto.artifact_id || null,
        dto.source_table || null,
        dto.source_id || null,
        JSON.stringify(sanitizedPayload),
        contentHash,
        hashAlg,
        sizeBytes
      ]
    );

    await this.emitEvidenceAudit(
      dto.project_id,
      "EVIDENCE_RECORD_STORED",
      "authorized",
      { record_id: evidenceId, evidence_type: dto.evidence_type, payload_size_bytes: sizeBytes },
      `Successfully registered and stored decentralized, tamper-evident evidence file record for type: ${dto.evidence_type}.`,
      evidenceId
    );

    return {
      id: evidenceId,
      project_id: dto.project_id,
      task_id: dto.task_id || null,
      feature_id: dto.feature_id || null,
      evidence_type: dto.evidence_type,
      status,
      actor_type: dto.actor_type,
      actor_id: dto.actor_id || null,
      audit_log_id: dto.audit_log_id || null,
      quality_gate_run_id: dto.quality_gate_run_id || null,
      quality_gate_command_result_id: dto.quality_gate_command_result_id || null,
      artifact_id: dto.artifact_id || null,
      source_table: dto.source_table || null,
      source_id: dto.source_id || null,
      payload_json: sanitizedPayload,
      content_hash: contentHash,
      hash_algorithm: hashAlg,
      payload_size_bytes: sizeBytes,
      created_at: new Date().toISOString(),
      verified_at: null,
      verification_meta_json: {}
    };
  }

  /**
   * Retrieves a single evidence record and enforces project boundaries
   */
  public async getEvidenceRecord(projectId: string, id: string): Promise<EvidenceRecordDTO> {
    await this.validateProjectScope(projectId);

    // Permission enforcement check
    await this.getPermissionKernel().enforce({
      subject: {
        subject_type: "system",
        subject_id: "system",
        project_id: projectId
      },
      resource: {
        resource_type: "evidence_record",
        resource_id: id,
        project_id: projectId
      },
      action: "read"
    });

    const res = await this.query("SELECT * FROM evidence_records WHERE id = $1 LIMIT 1;", [id]);
    if (res.rowCount === 0) {
      throw new NotFoundError(`Evidence record with ID ${id} was not found.`);
    }

    const row = res.rows[0];
    if (row.project_id !== projectId) {
      await this.emitEvidenceAudit(
        projectId,
        "EVIDENCE_CROSS_PROJECT_ACCESS_BLOCKED",
        "denied_untrusted",
        { requested_id: id, source_project_id: row.project_id },
        "Vertical security scope breach detected. High-level warning emitted."
      );
      throw new PermissionDeniedError(`Permission Denied: Core security boundary restricts reading evidence across project tenants.`);
    }

    return this.mapRowToDTO(row);
  }

  /**
   * Lists evidence records, filtering strictly within the validated project scope
   */
  public async listEvidenceRecords(
    projectId: string,
    filter?: { task_id?: string; feature_id?: string; evidence_type?: string }
  ): Promise<EvidenceRecordDTO[]> {
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
        resource_type: "evidence_record",
        resource_id: "all_evidence",
        project_id: projectId,
        task_id: filter?.task_id || undefined
      },
      action: "read"
    });

    let sql = "SELECT * FROM evidence_records WHERE project_id = $1";
    const params: any[] = [projectId];

    if (filter?.task_id) {
      await this.validateTaskScope(projectId, filter.task_id);
      params.push(filter.task_id);
      sql += ` AND task_id = $${params.length}`;
    }
    if (filter?.feature_id) {
      params.push(filter.feature_id);
      sql += ` AND feature_id = $${params.length}`;
    }
    if (filter?.evidence_type) {
      params.push(filter.evidence_type);
      sql += ` AND evidence_type = $${params.length}`;
    }

    sql += " ORDER BY created_at DESC;";
    const res = await this.query(sql, params);
    return res.rows.map(row => this.mapRowToDTO(row));
  }

  /**
   * Performs an integrity verification of a single evidence record
   */
  public async verifyEvidenceRecord(projectId: string, id: string): Promise<EvidenceVerificationResultDTO> {
    // Permission enforcement check before verifying
    await this.getPermissionKernel().enforce({
      subject: {
        subject_type: "system",
        subject_id: "system",
        project_id: projectId
      },
      resource: {
        resource_type: "evidence_record",
        resource_id: id,
        project_id: projectId
      },
      action: "read"
    });

    // 1. Load the record (which validates project scope and tenant constraints)
    const record = await this.getEvidenceRecord(projectId, id);

    // 2. Compute actual hash dynamically
    const sourceRefs = {
      id: record.id,
      project_id: record.project_id,
      task_id: record.task_id,
      feature_id: record.feature_id,
      evidence_type: record.evidence_type,
      actor_type: record.actor_type,
      actor_id: record.actor_id,
      audit_log_id: record.audit_log_id,
      quality_gate_run_id: record.quality_gate_run_id,
      quality_gate_command_result_id: record.quality_gate_command_result_id,
      artifact_id: record.artifact_id,
      source_table: record.source_table,
      source_id: record.source_id,
    };

    const expectedHash = record.content_hash;
    const actualHash = computeEvidenceHash(record.payload_json, sourceRefs);
    const matched = (expectedHash === actualHash);

    const warnings: string[] = [];
    if (!matched) {
      warnings.push("Tampered content alert: Recomputed payload digest does not match the stored evidence assertion hash.");
    }

    // Checking payload if someone altered it
    const status = matched ? EvidenceStatus.VERIFIED : EvidenceStatus.CORRUPTED;
    const verifiedAt = new Date().toISOString();
    const verificationMeta = {
      recalculated_hash: actualHash,
      mismatch_detected: !matched,
      audited_by_system: true
    };

    // Update mutable verification fields in DB
    await this.query(
      "UPDATE evidence_records SET status = $1, verified_at = $2, verification_meta_json = $3 WHERE id = $4;",
      [status, verifiedAt, JSON.stringify(verificationMeta), id]
    );

    // Audit logs emitting
    if (matched) {
      await this.emitEvidenceAudit(
        projectId,
        "EVIDENCE_RECORD_VERIFIED",
        "authorized",
        { record_id: id, matched, status },
        `Evidence content integrity verified successfully. SHA-256 digest matching confirmed; no actor signature was evaluated.`,
        id
      );
    } else {
      await this.emitEvidenceAudit(
        projectId,
        "EVIDENCE_RECORD_CORRUPTION_DETECTED",
        "denied_untrusted",
        { record_id: id, expected_hash: expectedHash, actual_hash: actualHash, matched },
        `CRITICAL WARNING: Tampered record data found! Content hash mismatched during verification run.`,
        id
      );
      await this.emitEvidenceAudit(
        projectId,
        "EVIDENCE_VERIFICATION_FAILED",
        "denied_untrusted",
        { record_id: id },
        `Integrity check failed for target evidence record. Status updated to corrupted.`,
        id
      );
    }

    return {
      evidence_id: id,
      status,
      expected_hash: expectedHash,
      actual_hash: actualHash,
      matched,
      verified_at: verifiedAt,
      warnings,
      verification_meta_json: verificationMeta
    };
  }

  /**
   * Batch verification helper for rapid regression and staging safety checks
   */
  public async verifyEvidenceBatch(
    projectId: string,
    filter?: { task_id?: string; feature_id?: string; evidence_type?: string }
  ): Promise<EvidenceVerificationResultDTO[]> {
    const list = await this.listEvidenceRecords(projectId, filter);
    const results: EvidenceVerificationResultDTO[] = [];
    for (const item of list) {
      const v = await this.verifyEvidenceRecord(projectId, item.id);
      results.push(v);
    }
    return results;
  }

  /**
   * Forced administrative marking of records that are corrupted
   */
  public async markEvidenceCorrupted(projectId: string, id: string): Promise<void> {
    const record = await this.getEvidenceRecord(projectId, id);
    const verificationMeta = {
      ...record.verification_meta_json,
      force_flagged_by_operator: true,
      last_marked_at: new Date().toISOString()
    };
    await this.query(
      "UPDATE evidence_records SET status = $1, verified_at = NOW(), verification_meta_json = $2 WHERE id = $3;",
      [EvidenceStatus.CORRUPTED, JSON.stringify(verificationMeta), id]
    );
    await this.emitEvidenceAudit(
      projectId,
      "EVIDENCE_RECORD_CORRUPTION_DETECTED",
      "denied_untrusted",
      { record_id: id },
      `Operator manually flagged evidence record ${id} as corrupted.`,
      id
    );
  }

  /**
   * Helper mapping standard pg rows safely to structured DTO objects
   */
  private mapRowToDTO(row: any): EvidenceRecordDTO {
    // Handle JSON object conversion safely
    let payload_json: Record<string, any> = {};
    if (row.payload_json) {
      payload_json = typeof row.payload_json === "string" ? JSON.parse(row.payload_json) : row.payload_json;
    }

    let verification_meta_json: Record<string, any> | null = null;
    if (row.verification_meta_json) {
      verification_meta_json = typeof row.verification_meta_json === "string" ? JSON.parse(row.verification_meta_json) : row.verification_meta_json;
    }

    return {
      id: row.id,
      project_id: row.project_id,
      task_id: row.task_id || null,
      feature_id: row.feature_id || null,
      evidence_type: row.evidence_type,
      status: row.status,
      actor_type: row.actor_type,
      actor_id: row.actor_id || null,
      audit_log_id: row.audit_log_id || null,
      quality_gate_run_id: row.quality_gate_run_id || null,
      quality_gate_command_result_id: row.quality_gate_command_result_id || null,
      artifact_id: row.artifact_id || null,
      source_table: row.source_table || null,
      source_id: row.source_id || null,
      payload_json,
      content_hash: row.content_hash,
      hash_algorithm: row.hash_algorithm || "sha256",
      payload_size_bytes: row.payload_size_bytes || 0,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      verified_at: row.verified_at instanceof Date ? row.verified_at.toISOString() : row.verified_at || null,
      verification_meta_json
    };
  }
}
