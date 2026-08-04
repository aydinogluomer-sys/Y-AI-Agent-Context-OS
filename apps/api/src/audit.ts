/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuditLog, AuditLogStatusType, AuditFeatureIdType, AuditActionType } from "@y/shared";
import { sysLogger } from "./logger";
import { redactSecretLeaks } from "@y/security";

let activePool: any = null;

/**
 * Registers the active PostgreSQL pool for database-backed audit logging.
 */
export function registerAuditPool(pool: any): void {
  activePool = pool;
  sysLogger.info("PostgreSQL connection registered within Audit Log pipeline.");
}

/**
 * Audit Logging Helper to trace and persist security decisions,
 * model executions, and connector sync cycles sequentially.
 */
export class AuditLogHelper {
  private persistedLogs: AuditLog[] = [];

  constructor() {}

  /**
   * Safe emission and database persistence of Y OS audit logs.
   * Cleans message payloads of potential secrets before persisting.
   */
  public async logAction(
    projectId: string,
    actor: string,
    featureId: AuditFeatureIdType,
    action: AuditActionType,
    status: AuditLogStatusType,
    metadata: Record<string, unknown> = {},
    rationale = "",
    resourceId = "",
    ipAddress = "127.0.0.1"
  ): Promise<AuditLog> {
    const cleanRationale = redactSecretLeaks(rationale);
    const cleanAction = redactSecretLeaks(String(action)) as AuditActionType;
    
    // Redact nested credentials and secrets from metadata safely before DB insertion
    let cleanMetadata: Record<string, unknown> = {};
    try {
      const serialized = JSON.stringify(metadata);
      const redactedStr = redactSecretLeaks(serialized);
      cleanMetadata = JSON.parse(redactedStr);
    } catch (e) {
      cleanMetadata = { redaction_error: "Failed to cleanly serialize metadata for audit logs." };
    }

    const logId = `audit_log_${Math.random().toString(36).substring(2, 11)}`;

    const auditEntry: AuditLog = {
      id: logId,
      projectId,
      actor,
      action: cleanAction,
      status,
      ipAddress,
      resourceId,
      timestamp: new Date().toISOString(),
      rationale: cleanRationale,
    };

    // Store in-memory cache as fallback/readiness reference
    this.persistedLogs.push(auditEntry);
    
    sysLogger.info(`Audit Log [${logId}] [Feature:${featureId}] [Action:${cleanAction}] [Status:${status}] | Actor: ${actor}`, {
      projectId,
      resourceId,
    });

    if (activePool) {
      try {
        await activePool.query(
          `INSERT INTO audit_logs (id, project_id, actor, feature_id, action, status, metadata, rationale, resource_id, ip_address, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW());`,
          [
            logId,
            projectId || null,
            actor,
            featureId,
            cleanAction,
            status,
            JSON.stringify(cleanMetadata),
            cleanRationale || null,
            resourceId || null,
            ipAddress,
          ]
        );
      } catch (err: any) {
        sysLogger.error(`Database persistence of audit log failed: ${err.message}`);
      }
    }

    return auditEntry;
  }

  /**
   * Fetches audit logs from PostgreSQL or fallback cache
   */
  public async getLogsForProject(projectId: string): Promise<AuditLog[]> {
    if (activePool) {
      try {
        const res = await activePool.query(
          "SELECT id, project_id as \"projectId\", actor, action, status, ip_address as \"ipAddress\", resource_id as \"resourceId\", created_at::text as timestamp, rationale FROM audit_logs WHERE project_id = $1 ORDER BY created_at DESC;",
          [projectId]
        );
        return res.rows;
      } catch (err: any) {
        sysLogger.error(`Failed to fetch audit logs for project ${projectId} from DB: ${err.message}`);
      }
    }
    return this.persistedLogs.filter((l) => l.projectId === projectId);
  }

  /**
   * Fetches all audit logs
   */
  public async getAllLogs(): Promise<AuditLog[]> {
    if (activePool) {
      try {
        const res = await activePool.query(
          "SELECT id, project_id as \"projectId\", actor, action, status, ip_address as \"ipAddress\", resource_id as \"resourceId\", created_at::text as timestamp, rationale FROM audit_logs ORDER BY created_at DESC;"
        );
        return res.rows;
      } catch (err: any) {
        sysLogger.error(`Failed to fetch all audit logs from DB: ${err.message}`);
      }
    }
    return [...this.persistedLogs];
  }
}

export const auditHelper = new AuditLogHelper();
