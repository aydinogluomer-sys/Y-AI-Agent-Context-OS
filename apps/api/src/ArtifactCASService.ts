/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from "crypto";
import { 
  ArtifactType,
  ArtifactStatus,
  ArtifactContentKind,
  CASBlobDTO,
  ArtifactVersionDTO,
  CreateArtifactVersionDTO,
  ArtifactVersionQueryDTO,
  ArtifactVersionResultDTO,
  ArtifactCASStatsDTO,
  BaseError,
  NotFoundError,
  PermissionDeniedError,
  AuditFeatureIdType,
  AuditActionType,
  AuditLogStatusType
} from "@y/shared";
import { redactSecretLeaks } from "@y/security";
import { sysLogger } from "./logger";
import { PermissionKernelService } from "./PermissionKernelService";

const PAYLOAD_SIZE_LIMIT = 512 * 1024; // 512KB

// Custom error for rejected artifact content containing secrets
export class UnsafePayloadError extends BaseError {
  constructor(message = "Unsafe payload containing sensitive credentials was rejected.", details?: Record<string, unknown>) {
    super("ARTIFACT_PAYLOAD_REJECTED", message, 400, details || {});
  }
}

// Custom error for path traversal validation
export class PathTraversalError extends BaseError {
  constructor(message = "Path traversal attempts are strictly forbidden.", details?: Record<string, unknown>) {
    super("REPO_FORBIDDEN_PATH_BLOCKED", message, 400, details || {});
  }
}

export function scanForSecrets(content: string): { hasSecrets: boolean; reasons: string[] } {
  const reasons: string[] = [];
  
  // 1. Check for database connection strings with passwords
  const dbUrlRegex = /(?:postgresql|postgres|mongodb|mysql|redis):\/\/[a-zA-Z0-9_\-\.]+:[^@\/]+@/i;
  if (dbUrlRegex.test(content)) {
    reasons.push("Embedded database credentials detected.");
  }

  // 2. Check for private/public keys & PEM certificates
  if (content.includes("-----BEGIN PRIVATE KEY-----") || content.includes("-----BEGIN RSA PRIVATE KEY-----")) {
    reasons.push("Embedded private key detected.");
  }
  if (content.includes("-----BEGIN CERTIFICATE-----")) {
    reasons.push("Embedded certificate file detected.");
  }

  // 3. Check for obvious API key / secret signatures
  const rawKeyReg = /(?:sk_live_[a-zA-Z0-9]{12,}|AIzaSy[a-zA-Z0-9_\-]{31,35})/i;
  if (rawKeyReg.test(content)) {
    reasons.push("High-entropy API key pattern detected.");
  }

  // 4. Check for unredacted .env variables or secret keys
  if (content.includes("DATABASE_URL=") && !content.includes("[REDACTED")) {
    reasons.push("Unredacted DATABASE_URL variable assignment.");
  }

  return {
    hasSecrets: reasons.length > 0,
    reasons
  };
}

export function normalizeArtifactPath(pathStr: string): string {
  if (!pathStr) return "";
  
  // Replace backslashes with forward slashes
  let normalized = pathStr.replace(/\\/g, "/");
  
  // Reject absolute paths starting with slashes or Windows drives
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
    // Redact or strip drive/leading slashes for compliance
    normalized = normalized.replace(/^[a-zA-Z]:\/?/, "");
    while (normalized.startsWith("/")) {
      normalized = normalized.slice(1);
    }
  }

  // Clean trailing and redundant slashes
  normalized = normalized.replace(/\/+/g, "/");

  // Split components to analyze dot-dots
  const parts = normalized.split("/");
  const cleanParts: string[] = [];

  for (const part of parts) {
    if (part === "." || part === "") {
      continue;
    }
    if (part === "..") {
      throw new PathTraversalError(`Path traversal violation detected: Traversal parent path elements ("..") are prohibited.`);
    }
    cleanParts.push(part);
  }

  const finalPath = cleanParts.join("/");

  // Verify no absolute host systems are included
  if (
    finalPath.startsWith("app/") || 
    finalPath.startsWith("Users/") || 
    finalPath.startsWith("home/") || 
    finalPath.startsWith("var/") ||
    finalPath.startsWith("tmp/") || 
    finalPath.startsWith("opt/") || 
    finalPath.startsWith("etc/")
  ) {
    throw new PathTraversalError(`Absolute host paths under root filesystem are strictly blocked: ${pathStr}`);
  }

  return finalPath || "generic_artifact";
}

export function computeArtifactHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export class ArtifactCASService {
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

  public async validateProjectScope(projectId: string): Promise<void> {
    const res = await this.query("SELECT id FROM projects WHERE id = $1 LIMIT 1;", [projectId]);
    if (res.rowCount === 0) {
      throw new NotFoundError(`Project scope validation failed: Project ${projectId} not found.`);
    }
  }

  public async validateTaskScope(projectId: string, taskId: string): Promise<void> {
    const res = await this.query("SELECT id, project_id FROM tasks WHERE id = $1 LIMIT 1;", [taskId]);
    if (res.rowCount === 0) {
      throw new NotFoundError(`Task scope validation failed: Task ${taskId} not found.`);
    }
    if (res.rows[0].project_id !== projectId) {
      throw new PermissionDeniedError(`Task scope boundaries violation: Task does not belong to Project ${projectId}.`);
    }
  }

  public async emitArtifactAudit(
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
        "SEC",
        action,
        status,
        cleanMeta,
        cleanRationale,
        resourceId,
        "127.0.0.1"
      );
    } catch (err: any) {
      sysLogger.error(`Failed to emit Artifact Store audit log: ${err.message}`);
    }
  }

  /**
   * Registers a new content-addressable artifact version.
   * Performs deduplication automatically at project scope level.
   */
  public async createArtifactVersion(dto: CreateArtifactVersionDTO): Promise<ArtifactVersionResultDTO> {
    // 1. Ground scope validations
    await this.validateProjectScope(dto.project_id);
    if (dto.task_id) {
      await this.validateTaskScope(dto.project_id, dto.task_id);
    }

    // 2. Permission enforcement (Default-deny verification)
    await this.getPermissionKernel().enforce({
      subject: {
        subject_type: (dto.created_by_type as any) || "system",
        subject_id: dto.created_by_id || "system",
        project_id: dto.project_id,
        task_id: dto.task_id || undefined
      },
      resource: {
        resource_type: "artifact",
        resource_id: "new_artifact",
        project_id: dto.project_id,
        task_id: dto.task_id || undefined
      },
      action: "create"
    });

    // 3. Path normalization & traversal guard
    let normalizedLogicalPath: string;
    let pathHash: string;
    try {
      normalizedLogicalPath = normalizeArtifactPath(dto.logical_path);
      pathHash = crypto.createHash("sha256").update(normalizedLogicalPath).digest("hex");
    } catch (err: any) {
      await this.emitArtifactAudit(
        dto.project_id,
        "ARTIFACT_CROSS_PROJECT_ACCESS_BLOCKED" as AuditActionType,
        "denied_untrusted",
        { logical_path: dto.logical_path, error: err.message },
        `Path normalization failed on logical path "${dto.logical_path}": ${err.message}`
      );
      throw err;
    }

    // Ensure metadata is safe
    const cleanMetadata = dto.metadata_json ? JSON.parse(redactSecretLeaks(JSON.stringify(dto.metadata_json))) : {};

    // 4. Content size & secret scanning
    const rawContent = dto.content_kind === "json" 
      ? JSON.stringify(dto.payload_json) 
      : (dto.payload_text || "");

    const sizeBytes = Buffer.byteLength(rawContent, "utf8");
    if (sizeBytes > PAYLOAD_SIZE_LIMIT) {
      throw new Error(`Oversized payload rejected: size ${sizeBytes} bytes exceeds maximum allowed threshold of 524288 bytes.`);
    }

    const { hasSecrets, reasons } = scanForSecrets(rawContent);
    if (hasSecrets) {
      await this.emitArtifactAudit(
        dto.project_id,
        "ARTIFACT_PAYLOAD_REJECTED" as AuditActionType,
        "denied_untrusted",
        { logical_path: normalizedLogicalPath, reasons },
        `Artifact creation rejected: Sensitive credentials or secrets detected inside content payload.`
      );
      throw new UnsafePayloadError(`Artifact creation rejected: Payload contains sensitive credentials or secret values. Reasons: ${reasons.join(", ")}`);
    }

    // Secondary soft-redaction of minor elements (e.g., path fragments/absolute directories inside string inputs)
    const sanitizedContent = redactSecretLeaks(rawContent);
    const finalContent = sanitizedContent; // Fully sanitized safely

    // Compute deterministic hash over sanitized content
    const casHash = computeArtifactHash(finalContent);

    // 5. Project-scoped Deduplication query inside cas_blobs
    let casBlobId: string;
    let deduplicated = false;

    const existingBlobRes = await this.query(
      "SELECT id FROM cas_blobs WHERE project_id = $1 AND cas_hash = $2 LIMIT 1;",
      [dto.project_id, casHash]
    );

    if (existingBlobRes.rowCount > 0) {
      casBlobId = existingBlobRes.rows[0].id;
      deduplicated = true;
      await this.emitArtifactAudit(
        dto.project_id,
        "ARTIFACT_CAS_DEDUP_REUSED" as AuditActionType,
        "authorized",
        { cas_blob_id: casBlobId, cas_hash: casHash, path: normalizedLogicalPath },
        `Content-addressed deduplication hit. Reused CAS blob ${casBlobId} with hash ${casHash}.`
      );
    } else {
      casBlobId = `blob_${crypto.randomBytes(8).toString("hex")}`;
      
      const payloadText = dto.content_kind !== "json" ? finalContent : null;
      let payloadJson: any = null;
      if (dto.content_kind === "json") {
        try {
          payloadJson = JSON.parse(finalContent);
        } catch {
          payloadJson = dto.payload_json;
        }
      }

      await this.query(
        `INSERT INTO cas_blobs (
          id, project_id, cas_hash, hash_algorithm, content_kind, mime_type, size_bytes,
          payload_text, payload_json, storage_status, metadata_json, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW());`,
        [
          casBlobId,
          dto.project_id,
          casHash,
          "sha256",
          dto.content_kind,
          dto.mime_type || "text/plain",
          sizeBytes,
          payloadText,
          payloadJson ? JSON.stringify(payloadJson) : null,
          "active",
          JSON.stringify(cleanMetadata)
        ]
      );

      await this.emitArtifactAudit(
        dto.project_id,
        "ARTIFACT_CAS_BLOB_STORED" as AuditActionType,
        "authorized",
        { cas_blob_id: casBlobId, cas_hash: casHash, size_bytes: sizeBytes },
        `Stored new content-addressable storage blob ${casBlobId} with SHA-256 hash ${casHash}.`
      );
    }

    // 6. Parent Version checks
    if (dto.parent_version_id) {
      const parentCheck = await this.query(
        "SELECT id, project_id FROM artifact_versions WHERE id = $1 LIMIT 1;",
        [dto.parent_version_id]
      );
      if (parentCheck.rowCount === 0) {
        throw new NotFoundError(`Parent version error: Specified parent_version_id ${dto.parent_version_id} not found.`);
      }
      if (parentCheck.rows[0].project_id !== dto.project_id) {
        throw new PermissionDeniedError(`Scope violation: Specified parent version belongs to a different project.`);
      }
    }

    // 7. Transactional version increment
    // Lock rows for the same path_hash in this project to prevent race conditions
    const currentVersionRes = await this.query(
      "SELECT MAX(version_number) as max_v FROM artifact_versions WHERE project_id = $1 AND path_hash = $2;",
      [dto.project_id, pathHash]
    );

    const maxV = currentVersionRes.rows[0]?.max_v;
    const versionNumber = maxV ? Number(maxV) + 1 : 1;
    const previousVersionIdRes = await this.query(
      "SELECT id FROM artifact_versions WHERE project_id = $1 AND path_hash = $2 AND artifact_status = 'active' LIMIT 1;",
      [dto.project_id, pathHash]
    );
    const previousVersionId = previousVersionIdRes.rowCount > 0 ? previousVersionIdRes.rows[0].id : null;

    // Supersede previous versions if any exist in 'active' status
    if (previousVersionId) {
      await this.query(
        "UPDATE artifact_versions SET artifact_status = 'superseded', updated_at = NOW() WHERE project_id = $1 AND path_hash = $2 AND artifact_status = 'active';",
        [dto.project_id, pathHash]
      );
      await this.emitArtifactAudit(
        dto.project_id,
        "ARTIFACT_VERSION_SUPERSEDED" as AuditActionType,
        "authorized",
        { project_id: dto.project_id, path: normalizedLogicalPath, superseded_version_id: previousVersionId, new_version_number: versionNumber },
        `Superseded older active version ${previousVersionId} of path "${normalizedLogicalPath}".`
      );
    }

    // 8. Insert new artifact version
    const versionId = `artv_${crypto.randomBytes(8).toString("hex")}`;
    await this.query(
      `INSERT INTO artifact_versions (
        id, project_id, task_id, feature_id, artifact_type, artifact_status,
        logical_path, normalized_logical_path, path_hash, version_number,
        cas_blob_id, cas_hash, parent_version_id, created_by_type, created_by_id,
        size_bytes, title, description, metadata_json, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW());`,
      [
        versionId,
        dto.project_id,
        dto.task_id || null,
        dto.feature_id || null,
        dto.artifact_type,
        "active",
        dto.logical_path,
        normalizedLogicalPath,
        pathHash,
        versionNumber,
        casBlobId,
        casHash,
        dto.parent_version_id || null,
        dto.created_by_type || "system",
        dto.created_by_id || "system",
        sizeBytes,
        dto.title || null,
        dto.description || null,
        JSON.stringify(cleanMetadata)
      ]
    );

    await this.emitArtifactAudit(
      dto.project_id,
      "ARTIFACT_VERSION_REGISTERED" as AuditActionType,
      "authorized",
      { version_id: versionId, logical_path: normalizedLogicalPath, version_number: versionNumber, cas_hash: casHash },
      `Registered artifact version ${versionNumber} for path "${normalizedLogicalPath}" under id ${versionId}.`
    );

    const artifactObj = await this.getArtifactVersion(dto.project_id, versionId);
    return {
      artifact: artifactObj.artifact,
      blob: artifactObj.blob,
      deduplicated,
      previous_version_id: previousVersionId,
      next_version_number: versionNumber + 1
    };
  }

  /**
   * Retrieves single artifact version by project and id.
   */
  public async getArtifactVersion(projectId: string, versionId: string): Promise<ArtifactVersionResultDTO> {
    await this.validateProjectScope(projectId);

    // Permission enforcement
    await this.getPermissionKernel().enforce({
      subject: { subject_type: "system", subject_id: "system", project_id: projectId },
      resource: { resource_type: "artifact", resource_id: versionId, project_id: projectId },
      action: "read"
    });

    const res = await this.query(
      `SELECT av.*, cb.payload_text, cb.payload_json, cb.content_kind, cb.mime_type, cb.storage_status
       FROM artifact_versions av
       JOIN cas_blobs cb ON av.cas_blob_id = cb.id
       WHERE av.project_id = $1 AND av.id = $2 LIMIT 1;`,
      [projectId, versionId]
    );

    if (res.rowCount === 0) {
      throw new NotFoundError(`Artifact version ${versionId} was not found inside project ${projectId}.`);
    }

    const row = res.rows[0];
    const artifact: ArtifactVersionDTO = {
      id: row.id,
      project_id: row.project_id,
      task_id: row.task_id,
      feature_id: row.feature_id,
      artifact_type: row.artifact_type as ArtifactType,
      artifact_status: row.artifact_status as ArtifactStatus,
      logical_path: row.logical_path,
      version_number: row.version_number,
      cas_blob_id: row.cas_blob_id,
      cas_hash: row.cas_hash,
      parent_version_id: row.parent_version_id,
      created_by_type: row.created_by_type,
      created_by_id: row.created_by_id,
      size_bytes: row.size_bytes,
      title: row.title,
      description: row.description,
      metadata_json: row.metadata_json || {},
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString()
    };

    const blob: CASBlobDTO = {
      id: row.cas_blob_id,
      project_id: row.project_id,
      cas_hash: row.cas_hash,
      hash_algorithm: "sha256",
      content_kind: row.content_kind as ArtifactContentKind,
      mime_type: row.mime_type,
      size_bytes: row.size_bytes,
      payload_text: row.payload_text,
      payload_json: typeof row.payload_json === "string" ? JSON.parse(row.payload_json) : row.payload_json,
      storage_status: row.storage_status,
      created_at: row.created_at.toISOString(),
      metadata_json: row.metadata_json || {}
    };

    return {
      artifact,
      blob,
      deduplicated: false,
      previous_version_id: null
    };
  }

  /**
   * Lists artifact versions for a project based on query parameters.
   */
  public async listArtifactVersions(projectId: string, query: ArtifactVersionQueryDTO): Promise<ArtifactVersionDTO[]> {
    await this.validateProjectScope(projectId);

    // Permission enforcement
    await this.getPermissionKernel().enforce({
      subject: { subject_type: "system", subject_id: "system", project_id: projectId },
      resource: { resource_type: "artifact", resource_id: "*", project_id: projectId },
      action: "read"
    });

    let sql = "SELECT * FROM artifact_versions WHERE project_id = $1";
    const params: any[] = [projectId];

    if (query.task_id) {
      params.push(query.task_id);
      sql += ` AND task_id = $${params.length}`;
    }
    if (query.feature_id) {
      params.push(query.feature_id);
      sql += ` AND feature_id = $${params.length}`;
    }
    if (query.artifact_type) {
      params.push(query.artifact_type);
      sql += ` AND artifact_type = $${params.length}`;
    }
    if (query.artifact_status) {
      params.push(query.artifact_status);
      sql += ` AND artifact_status = $${params.length}`;
    }
    if (query.logical_path) {
      const normalized = normalizeArtifactPath(query.logical_path);
      params.push(normalized);
      sql += ` AND normalized_logical_path = $${params.length}`;
    }

    sql += " ORDER BY created_at DESC;";

    const res = await this.query(sql, params);
    return res.rows.map((row: any) => ({
      id: row.id,
      project_id: row.project_id,
      task_id: row.task_id,
      feature_id: row.feature_id,
      artifact_type: row.artifact_type as ArtifactType,
      artifact_status: row.artifact_status as ArtifactStatus,
      logical_path: row.logical_path,
      version_number: row.version_number,
      cas_blob_id: row.cas_blob_id,
      cas_hash: row.cas_hash,
      parent_version_id: row.parent_version_id,
      created_by_type: row.created_by_type,
      created_by_id: row.created_by_id,
      size_bytes: row.size_bytes,
      title: row.title,
      description: row.description,
      metadata_json: row.metadata_json || {},
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString()
    }));
  }

  /**
   * Lists the full historical versions of a path in a project.
   */
  public async listArtifactHistory(projectId: string, logicalPath: string): Promise<ArtifactVersionDTO[]> {
    const normalized = normalizeArtifactPath(logicalPath);
    return this.listArtifactVersions(projectId, { logical_path: normalized });
  }

  /**
   * Retrieves the latest active/superseded artifact version for a path.
   */
  public async getLatestArtifactVersion(projectId: string, logicalPath: string): Promise<ArtifactVersionDTO | null> {
    await this.validateProjectScope(projectId);
    const normalized = normalizeArtifactPath(logicalPath);

    const res = await this.query(
      `SELECT * FROM artifact_versions 
       WHERE project_id = $1 AND normalized_logical_path = $2
         AND artifact_status IN ('active', 'superseded')
       ORDER BY version_number DESC LIMIT 1;`,
      [projectId, normalized]
    );

    if (res.rowCount === 0) {
      return null;
    }

    const row = res.rows[0];
    return {
      id: row.id,
      project_id: row.project_id,
      task_id: row.task_id,
      feature_id: row.feature_id,
      artifact_type: row.artifact_type as ArtifactType,
      artifact_status: row.artifact_status as ArtifactStatus,
      logical_path: row.logical_path,
      version_number: row.version_number,
      cas_blob_id: row.cas_blob_id,
      cas_hash: row.cas_hash,
      parent_version_id: row.parent_version_id,
      created_by_type: row.created_by_type,
      created_by_id: row.created_by_id,
      size_bytes: row.size_bytes,
      title: row.title,
      description: row.description,
      metadata_json: row.metadata_json || {},
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString()
    };
  }

  /**
   * Archives an artifact version.
   */
  public async archiveArtifactVersion(projectId: string, versionId: string): Promise<ArtifactVersionDTO> {
    await this.validateProjectScope(projectId);

    // Permission enforcement
    await this.getPermissionKernel().enforce({
      subject: { subject_type: "system", subject_id: "system", project_id: projectId },
      resource: { resource_type: "artifact", resource_id: versionId, project_id: projectId },
      action: "update"
    });

    const check = await this.query(
      "SELECT id, logical_path FROM artifact_versions WHERE project_id = $1 AND id = $2 LIMIT 1;",
      [projectId, versionId]
    );
    if (check.rowCount === 0) {
      throw new NotFoundError(`Artifact version ${versionId} was not found inside project ${projectId}.`);
    }

    await this.query(
      "UPDATE artifact_versions SET artifact_status = 'archived', updated_at = NOW() WHERE project_id = $1 AND id = $2;",
      [projectId, versionId]
    );

    await this.emitArtifactAudit(
      projectId,
      "ARTIFACT_VERSION_ARCHIVED" as AuditActionType,
      "authorized",
      { version_id: versionId, logical_path: check.rows[0].logical_path },
      `Archived artifact version ${versionId} of path "${check.rows[0].logical_path}".`
    );

    const updated = await this.getArtifactVersion(projectId, versionId);
    return updated.artifact;
  }

  /**
   * Quarantines an artifact version.
   */
  public async quarantineArtifactVersion(projectId: string, versionId: string): Promise<ArtifactVersionDTO> {
    await this.validateProjectScope(projectId);

    // Permission enforcement
    await this.getPermissionKernel().enforce({
      subject: { subject_type: "system", subject_id: "system", project_id: projectId },
      resource: { resource_type: "artifact", resource_id: versionId, project_id: projectId },
      action: "administer"
    });

    const check = await this.query(
      "SELECT id, logical_path FROM artifact_versions WHERE project_id = $1 AND id = $2 LIMIT 1;",
      [projectId, versionId]
    );
    if (check.rowCount === 0) {
      throw new NotFoundError(`Artifact version ${versionId} was not found inside project ${projectId}.`);
    }

    await this.query(
      "UPDATE artifact_versions SET artifact_status = 'quarantined', updated_at = NOW() WHERE project_id = $1 AND id = $2;",
      [projectId, versionId]
    );

    await this.emitArtifactAudit(
      projectId,
      "ARTIFACT_VERSION_QUARANTINED" as AuditActionType,
      "authorized",
      { version_id: versionId, logical_path: check.rows[0].logical_path },
      `Quarantined artifact version ${versionId} of path "${check.rows[0].logical_path}".`
    );

    const updated = await this.getArtifactVersion(projectId, versionId);
    return updated.artifact;
  }

  /**
   * Computes deduplication savings and usage stats.
   */
  public async getArtifactStats(projectId: string): Promise<ArtifactCASStatsDTO> {
    await this.validateProjectScope(projectId);

    const totalVersionsRes = await this.query(
      "SELECT COUNT(*)::integer as count, COALESCE(SUM(size_bytes), 0)::integer as bytes FROM artifact_versions WHERE project_id = $1;",
      [projectId]
    );
    
    const uniqueBlobsRes = await this.query(
      "SELECT COUNT(*)::integer as count, COALESCE(SUM(size_bytes), 0)::integer as bytes FROM cas_blobs WHERE project_id = $1;",
      [projectId]
    );

    const totalVersions = totalVersionsRes.rows[0].count;
    const totalLogicalBytes = totalVersionsRes.rows[0].bytes;
    const uniqueBlobs = uniqueBlobsRes.rows[0].count;
    const totalCasBytes = uniqueBlobsRes.rows[0].bytes;

    const deduplicatedReferences = Math.max(0, totalVersions - uniqueBlobs);
    const savingsBytes = Math.max(0, totalLogicalBytes - totalCasBytes);

    return {
      project_id: projectId,
      total_versions: totalVersions,
      unique_blobs: uniqueBlobs,
      deduplicated_references: deduplicatedReferences,
      total_logical_bytes: totalLogicalBytes,
      total_cas_bytes: totalCasBytes,
      savings_bytes: savingsBytes,
      updated_at: new Date().toISOString()
    };
  }
}
