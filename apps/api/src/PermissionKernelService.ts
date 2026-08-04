/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PermissionDecision,
  PermissionEffect,
  PermissionSubjectType,
  PermissionResourceType,
  PermissionAction,
  PermissionSensitivity,
  PermissionSubjectDTO,
  PermissionResourceDTO,
  PermissionContextDTO,
  PermissionEvaluationRequestDTO,
  PermissionRuleDTO,
  PermissionEvaluationResultDTO,
  NotFoundError,
  PermissionDeniedError,
  BaseError,
  AuditFeatureIdType,
  AuditActionType,
  AuditLogStatusType
} from "@y/shared";
import { redactSecretLeaks } from "@y/security";
import { sysLogger } from "./logger";
import crypto from "crypto";
import path from "path";

export class PermissionKernelService {
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
  ) {
    sysLogger.info("PermissionKernelService initialized successfully.");
  }

  public async loadPolicies(): Promise<PermissionRuleDTO[]> {
    try {
      const res = await this.query(
        "SELECT id, effect, subject_type as subjectType, resource_type as resourceType, action, conditions_json as conditions, description, enabled FROM permission_policies WHERE enabled = true;"
      );
      if (res && res.rows && res.rows.length > 0) {
        return res.rows.map((row: any) => ({
          id: row.id || row.ID,
          effect: (row.effect || row.EFFECT) as PermissionEffect,
          subject_type: row.subjecttype || row.subject_type || row.SUBJECT_TYPE || "*",
          resource_type: row.resourcetype || row.resource_type || row.RESOURCE_TYPE || "*",
          action: row.action || row.ACTION || "*",
          conditions: row.conditions || row.conditions_json || row.CONDITIONS_JSON || {},
          description: row.description || row.DESCRIPTION,
          enabled: row.enabled === undefined ? true : !!row.enabled
        }));
      }
    } catch (err: any) {
      sysLogger.debug("Failed to load policies from database, falling back to static rules: " + err.message);
    }

    return [
      {
        id: "policy-admin-bypass",
        effect: "allow",
        subject_type: "*",
        resource_type: "*",
        action: "*",
        conditions: { is_admin: true },
        description: "Administrative bypass override rule",
        enabled: true
      },
      {
        id: "policy-system-bypass",
        effect: "allow",
        subject_type: "system",
        resource_type: "*",
        action: "*",
        conditions: {},
        description: "System/internal action rule",
        enabled: true
      },
      {
        id: "policy-worker-jobs",
        effect: "allow",
        subject_type: "worker",
        resource_type: "index_job",
        action: "claim",
        conditions: {},
        description: "Worker claiming jobs rule",
        enabled: true
      },
      {
        id: "policy-worker-job-update",
        effect: "allow",
        subject_type: "worker",
        resource_type: "index_job",
        action: "update",
        conditions: {},
        description: "Worker updating claimed jobs rule",
        enabled: true
      },
      {
        id: "policy-worker-locks",
        effect: "allow",
        subject_type: "worker",
        resource_type: "file_lock",
        action: "*",
        conditions: {},
        description: "Worker managing file locks rule",
        enabled: true
      },
      {
        id: "policy-task-locks",
        effect: "allow",
        subject_type: "task",
        resource_type: "file_lock",
        action: "*",
        conditions: {},
        description: "Tasks managing file locks rule",
        enabled: true
      },
      {
        id: "policy-task-rw",
        effect: "allow",
        subject_type: "task",
        resource_type: "file",
        action: "*",
        conditions: {},
        description: "Tasks reading and writing project files rule",
        enabled: true
      }
    ];
  }

  public sanitizePermissionMetadata(metadata: Record<string, any> | null | undefined): Record<string, any> {
    if (!metadata) return {};
    try {
      const serial = JSON.stringify(metadata);
      const redacted = redactSecretLeaks(serial);
      return JSON.parse(redacted);
    } catch {
      return { redaction_error: "Failed to sanitize metadata" };
    }
  }

  public validateProjectBoundary(subjectProj: string | undefined, resourceProj: string | undefined): void {
    if (subjectProj && resourceProj && subjectProj !== resourceProj) {
      throw new PermissionDeniedError(`Cross-project access blocked: Subject project (${subjectProj}) does not match resource project (${resourceProj}).`);
    }
  }

  public validateTaskBoundary(subjectTask: string | undefined, resourceTask: string | undefined): void {
    if (subjectTask && resourceTask && subjectTask !== resourceTask) {
      throw new PermissionDeniedError(`Task scope violation blocked: Subject task (${subjectTask}) does not match resource task (${resourceTask}).`);
    }
  }

  public validateWorkerBoundary(subjectWorker: string | undefined, resourceWorker: string | undefined): void {
    if (subjectWorker && resourceWorker && subjectWorker !== resourceWorker) {
      throw new PermissionDeniedError(`Worker scope violation blocked: Subject worker (${subjectWorker}) does not match resource worker (${resourceWorker}).`);
    }
  }

  public validateResourceBoundary(resource: PermissionResourceDTO): void {
    if (resource.resource_type === "file") {
      const p = resource.normalized_path || resource.resource_id;
      if (!p) {
        throw new BaseError("CONTEXT_BOUNDARY_VIOLATION", "File resource normalized path is required.", 400);
      }
      
      const normalized = p.replace(/\\/g, "/");
      if (path.isAbsolute(normalized) || normalized.startsWith("/") || normalized.startsWith("..") || normalized.includes("/../")) {
        throw new BaseError("CONTEXT_BOUNDARY_VIOLATION", "Access denied: Absolute path or path traversal attempt blocked.", 400);
      }
      
      const basename = path.basename(normalized).toLowerCase();
      const forbiddenNames = [".env", "secrets.json", "credentials.json", ".env.example"];
      if (forbiddenNames.includes(basename)) {
        throw new BaseError("CONTEXT_BOUNDARY_VIOLATION", `Access denied: Reading forbidden file '${basename}' is strictly blocked.`, 403);
      }
      
      const forbiddenEndings = [".pem", ".key"];
      if (forbiddenEndings.some(ext => basename.endsWith(ext))) {
        throw new BaseError("CONTEXT_BOUNDARY_VIOLATION", `Access denied: Reading certificate/key files is strictly blocked.`, 403);
      }
    }
  }

  public evaluateConditions(conditions: Record<string, any>, request: PermissionEvaluationRequestDTO): { ok: boolean; failedFields: string[] } {
    const failedFields: string[] = [];
    if (!conditions || Object.keys(conditions).length === 0) {
      return { ok: true, failedFields: [] };
    }

    const { subject, resource, context } = request;

    for (const [key, expectedValue] of Object.entries(conditions)) {
      if (key === "is_admin") {
        const isAdmin = 
          subject.attributes?.is_admin === true || 
          subject.roles?.includes("admin") || 
          context?.admin_override === true;
        if (expectedValue === true && !isAdmin) {
          failedFields.push("is_admin");
        }
      } else if (key === "subject_id") {
        const match = expectedValue === "*" || subject.subject_id === expectedValue;
        if (!match) {
          failedFields.push("subject_id");
        }
      } else if (key === "resource_id") {
        const match = expectedValue === "*" || resource.resource_id === expectedValue;
        if (!match) {
          failedFields.push("resource_id");
        }
      } else if (key === "sensitivity") {
        const resourceSensitivity = resource.sensitivity || "public";
        if (resourceSensitivity === "secret" || resourceSensitivity === "restricted") {
          const hasAccessPrivilege = 
            subject.attributes?.is_admin === true || 
            subject.roles?.includes("admin") || 
            subject.subject_type === "system" ||
            context?.admin_override === true;
          if (!hasAccessPrivilege) {
            failedFields.push("sensitivity");
          }
        }
      } else {
        const subjectAttr = subject.attributes?.[key];
        const resourceAttr = resource.attributes?.[key];
        const contextAttr = context?.metadata_json?.[key];

        const match = subjectAttr === expectedValue || resourceAttr === expectedValue || contextAttr === expectedValue;
        if (!match) {
          failedFields.push(key);
        }
      }
    }

    return {
      ok: failedFields.length === 0,
      failedFields
    };
  }

  public matchRules(
    request: PermissionEvaluationRequestDTO,
    policies: PermissionRuleDTO[]
  ): { matched: PermissionRuleDTO[]; failedConditions: string[] } {
    const matched: PermissionRuleDTO[] = [];
    const failedConditions: string[] = [];

    const { subject, resource, action } = request;

    for (const policy of policies) {
      const subMatch = policy.subject_type === "*" || policy.subject_type === subject.subject_type;
      if (!subMatch) continue;

      const resMatch = policy.resource_type === "*" || policy.resource_type === resource.resource_type;
      if (!resMatch) continue;

      const actMatch = policy.action === "*" || policy.action === action;
      if (!actMatch) continue;

      const condResult = this.evaluateConditions(policy.conditions, request);
      if (condResult.ok) {
        matched.push(policy);
      } else {
        failedConditions.push(...condResult.failedFields.map(f => `Rule [${policy.id}] failed condition: ${f}`));
      }
    }

    return { matched, failedConditions };
  }

  public async evaluate(request: PermissionEvaluationRequestDTO): Promise<PermissionEvaluationResultDTO> {
    const startTime = new Date().toISOString();
    const subjProj = request.subject.project_id;
    const resProj = request.resource.project_id;
    const projId = subjProj || resProj || "system-scope";

    try {
      this.validateProjectBoundary(subjProj, resProj);
      this.validateTaskBoundary(request.subject.task_id, request.resource.task_id);
      this.validateWorkerBoundary(request.subject.worker_id, request.resource.worker_id);
      this.validateResourceBoundary(request.resource);
    } catch (err: any) {
      const denialReason = err.message || "Boundary violation";
      const isCrossProject = denialReason.includes("Cross-project");
      
      const res: PermissionEvaluationResultDTO = {
        decision: "deny",
        allowed: false,
        denied_reason: denialReason,
        matched_rules: [],
        failed_conditions: [],
        sanitized_context: this.sanitizePermissionMetadata(request.context?.metadata_json),
        evaluated_at: startTime
      };

      await this.recordEvaluation({
        project_id: projId,
        subject_type: request.subject.subject_type,
        subject_id: request.subject.subject_id,
        resource_type: request.resource.resource_type,
        resource_id: request.resource.resource_id,
        action: request.action,
        decision: "deny",
        denied_reason: denialReason,
        matched_rules_json: [],
        metadata_json: res.sanitized_context || {}
      });

      if (isCrossProject) {
        await this.emitPermissionAudit(
          projId,
          request.subject.subject_id || "unknown",
          "PERMISSION_CROSS_PROJECT_ACCESS_BLOCKED",
          "denied_untrusted",
          { error: denialReason, request: this.sanitizeRequest(request) },
          "Cross-project boundaries breach attempt intercepted"
        );
      } else {
        await this.emitPermissionAudit(
          projId,
          request.subject.subject_id || "unknown",
          "PERMISSION_DENIED",
          "denied_untrusted",
          { error: denialReason, request: this.sanitizeRequest(request) },
          denialReason
        );
      }

      return res;
    }

    const policies = await this.loadPolicies();
    const { matched, failedConditions } = this.matchRules(request, policies);

    let decision: PermissionDecision = "deny";
    let deniedReason = "Default deny: No explicit matching allow policy found.";

    const allowRules = matched.filter(r => r.effect === "allow");
    const denyRules = matched.filter(r => r.effect === "deny");

    if (allowRules.length > 0) {
      decision = "allow";
      deniedReason = "";
    }

    if (denyRules.length > 0) {
      decision = "deny";
      deniedReason = `Explicit deny rule matched: ${denyRules.map(r => r.id).join(", ")}`;
    }

    if (request.context?.admin_override === true) {
      const rat = request.context.rationale;
      if (!rat || rat.trim().length === 0) {
        decision = "deny";
        deniedReason = "Access denied: Admin override requires an explicit, non-empty justification rationale.";
      } else {
        const isEligibleSubject = 
          request.subject.roles?.includes("admin") || 
          request.subject.subject_type === "system";
        if (!isEligibleSubject) {
          decision = "deny";
          deniedReason = "Access denied: Current subject type is not eligible for administrative override elevation.";
        } else {
          decision = "allow";
          deniedReason = "";
          
          await this.recordOverride({
            project_id: projId,
            subject_type: request.subject.subject_type,
            subject_id: request.subject.subject_id,
            resource_type: request.resource.resource_type,
            resource_id: request.resource.resource_id,
            action: request.action,
            rationale: rat,
            metadata_json: this.sanitizePermissionMetadata(request.context.metadata_json)
          });

          await this.emitPermissionAudit(
            projId,
            request.subject.subject_id || "admin",
            "PERMISSION_BYPASS_USED",
            "authorized",
            { request: this.sanitizeRequest(request), rationale: rat },
            `Admin override successfully performed with rationale: ${rat}`
          );
        }
      }
    }

    const sanitizedContext = this.sanitizePermissionMetadata(request.context?.metadata_json);

    const result: PermissionEvaluationResultDTO = {
      decision,
      allowed: decision === "allow",
      denied_reason: deniedReason || undefined,
      matched_rules: matched.filter(r => r.effect === decision),
      failed_conditions: failedConditions,
      sanitized_context: sanitizedContext,
      evaluated_at: new Date().toISOString()
    };

    await this.recordEvaluation({
      project_id: projId,
      subject_type: request.subject.subject_type,
      subject_id: request.subject.subject_id,
      resource_type: request.resource.resource_type,
      resource_id: request.resource.resource_id,
      action: request.action,
      decision,
      denied_reason: deniedReason,
      matched_rules_json: matched,
      metadata_json: sanitizedContext
    });

    if (decision === "allow") {
      if (request.context?.admin_override !== true) {
        await this.emitPermissionAudit(
          projId,
          request.subject.subject_id,
          "PERMISSION_EVALUATED",
          "authorized",
          { request: this.sanitizeRequest(request), effect: "allow", rulesMatched: allowRules.map(r => r.id) }
        );
      }
    } else {
      await this.emitPermissionAudit(
        projId,
        request.subject.subject_id,
        "PERMISSION_DENIED",
        "denied_untrusted",
        { request: this.sanitizeRequest(request), effect: "deny", deniedReason, failedConditions }
      );
    }

    return result;
  }

  public async enforce(request: PermissionEvaluationRequestDTO): Promise<void> {
    const result = await this.evaluate(request);
    if (!result.allowed) {
      throw new PermissionDeniedError(result.denied_reason || "Access denied by Permission Kernel.");
    }
  }

  public async recordEvaluation(ev: {
    project_id: string;
    subject_type: string;
    subject_id: string;
    resource_type: string;
    resource_id: string;
    action: string;
    decision: string;
    denied_reason?: string;
    matched_rules_json: any[];
    metadata_json: Record<string, any>;
  }): Promise<void> {
    const id = `pevl_${crypto.randomBytes(8).toString("hex")}`;
    const sanitizedMeta = this.sanitizePermissionMetadata(ev.metadata_json);
    try {
      await this.query(
        `INSERT INTO permission_evaluations (
          id, project_id, subject_type, subject_id, resource_type, resource_id, action, decision, denied_reason, matched_rules_json, metadata_json, evaluated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW());`,
        [
          id,
          ev.project_id,
          ev.subject_type,
          ev.subject_id,
          ev.resource_type,
          ev.resource_id,
          ev.action,
          ev.decision,
          ev.denied_reason || null,
          JSON.stringify(ev.matched_rules_json),
          JSON.stringify(sanitizedMeta)
        ]
      );
    } catch (err) {
      sysLogger.debug("Skipped saving permission evaluation to postgres, falls back to memory storage.");
    }
  }

  public async recordOverride(ov: {
    project_id: string;
    subject_type: string;
    subject_id: string;
    resource_type: string;
    resource_id: string;
    action: string;
    rationale: string;
    metadata_json: Record<string, any>;
  }): Promise<void> {
    const id = `povr_${crypto.randomBytes(8).toString("hex")}`;
    const sanitizedMeta = this.sanitizePermissionMetadata(ov.metadata_json);
    try {
      await this.query(
        `INSERT INTO permission_overrides (
          id, project_id, subject_type, subject_id, resource_type, resource_id, action, rationale, status, metadata_json, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'used', $9, NOW());`,
        [
          id,
          ov.project_id,
          ov.subject_type,
          ov.subject_id,
          ov.resource_type,
          ov.resource_id,
          ov.action,
          ov.rationale,
          JSON.stringify(sanitizedMeta)
        ]
      );
    } catch {
      sysLogger.debug("Skipping persistence for override row.");
    }
  }

  public async emitPermissionAudit(
    projectId: string,
    actor: string,
    action: AuditActionType,
    status: AuditLogStatusType,
    metadata?: Record<string, unknown>,
    rationale = ""
  ): Promise<void> {
    try {
      await this.logAction(
        projectId,
        actor || "unknown_subject",
        "SEC",
        action,
        status,
        metadata,
        rationale
      );
    } catch (e: any) {
      sysLogger.error(`Failed to register Permission audit trail row. Error: ${e.message}`);
    }
  }

  private sanitizeRequest(req: PermissionEvaluationRequestDTO): any {
    try {
      const serial = JSON.stringify(req);
      const redacted = redactSecretLeaks(serial);
      return JSON.parse(redacted);
    } catch {
      return { redaction_error: "Serialization error matching subject resources" };
    }
  }
}
