/**
 * P02 / Y-P02-002 — DB-backed yetkilendirme (ADR-017).
 *
 * Neyin yerini alıyor (P00 Truth Audit):
 *
 *   P0-4  `principalCanAccessProject()` saf dizi üyeliğiydi:
 *           `principal.projectIds.includes(projectId) || projectIds.includes("*")`
 *         Yani yetki tamamen token claim'inden geliyordu.
 *         DB-backed karşılığı `principalCanAccessProjectAsync` yazılmış,
 *         import edilmiş ve **hiç çağrılmamıştı**; üstelik var olmayan bir
 *         tabloyu sorguluyor ve hatayı `catch {}` ile yutarak sessizce
 *         `false` dönüyordu.
 *   P0-8  199 route'un 54'ü yalnız bearer kontrolünden geçiyordu;
 *         `GET /audit-logs` tüm projelerin logunu döndürüyordu.
 *
 * Kural: yetki HER istekte DB'den okunur. Token'a gömülü liste kullanılmaz.
 */

import type { Request, Response, NextFunction } from "express";
import {
  type Principal,
  type ProjectRole,
  type ProjectScope,
  type AuthzDecision,
  type AuthzDenialReason,
  projectRoleAtLeast,
  orgRoleAtLeast,
  isAuthzAllowed,
  isAuthzDenied,
  type OrgRole
} from "@y/shared";

export interface MembershipQuery {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export interface ScopedRequest extends Request {
  principal: Principal;
  projectScope: ProjectScope;
}

/**
 * Üyelik çözümü.
 *
 * FAIL CLOSED: sorgu başarısız olursa karar REDDİR. Hata yutulmaz —
 * çağıran `POLICY_STORE_UNAVAILABLE` görür ve `readyz` degraded'a düşer.
 */
export async function resolveProjectScope(
  db: MembershipQuery,
  principal: Principal,
  projectId: string
): Promise<AuthzDecision> {
  try {
    // Tek sorgu: proje org'a ait mi + kullanıcının proje üyeliği + org rolü.
    const res = await db.query(
      `SELECT
         p.organization_id                AS project_org_id,
         pm.role                          AS project_role,
         om.role                          AS org_role
       FROM projects p
       LEFT JOIN project_memberships pm
              ON pm.project_id = p.id AND pm.user_id = $2
       LEFT JOIN org_memberships om
              ON om.organization_id = p.organization_id AND om.user_id = $2
      WHERE p.id = $1
      LIMIT 1;`,
      [projectId, principal.userId]
    );

    if (!res.rowCount || res.rows.length === 0) {
      // Proje yok. Var olmayan proje ile yetkisiz proje aynı yanıtı almalı
      // (enumeration önleme) — çağıran katman 403 döndürür.
      return { allowed: false, reason: "NO_PROJECT_MEMBERSHIP" };
    }

    const row = res.rows[0];

    // Cross-tenant: projenin org'u principal'ın org'undan farklıysa dur.
    if (row.project_org_id !== principal.orgId) {
      return { allowed: false, reason: "ORG_MISMATCH" };
    }

    if (row.project_role) {
      return {
        allowed: true,
        scope: {
          principal,
          projectId,
          orgId: principal.orgId,
          role: row.project_role as ProjectRole,
          resolvedFrom: "project_membership"
        }
      };
    }

    // Proje üyeliği yok ama org yöneticisi ise erişebilir.
    const orgRole = row.org_role as OrgRole | null;
    if (orgRole && orgRoleAtLeast(orgRole, "admin")) {
      return {
        allowed: true,
        scope: {
          principal,
          projectId,
          orgId: principal.orgId,
          role: "maintainer",
          resolvedFrom: "org_admin"
        }
      };
    }

    return { allowed: false, reason: "NO_PROJECT_MEMBERSHIP" };
  } catch {
    // Depo erişilemiyorsa ALLOW ETME. P0-5'in tam tersi davranış.
    return { allowed: false, reason: "POLICY_STORE_UNAVAILABLE" };
  }
}

const DENIAL_STATUS: Record<AuthzDenialReason, number> = {
  NO_PRINCIPAL: 401,
  TOKEN_EXPIRED: 401,
  TOKEN_REVOKED: 401,
  ORG_MISMATCH: 403,
  NO_PROJECT_MEMBERSHIP: 403,
  INSUFFICIENT_ROLE: 403,
  POLICY_STORE_UNAVAILABLE: 503
};

/**
 * Proje kapsamını zorunlu kılan middleware.
 *
 * Handler'lar bunun ürettiği `req.projectScope`'u kullanır; ad-hoc yetki
 * kontrolü yapmazlar (ADR-017, lint kuralı ile korunacak — Y-P19-004).
 */
export function requireProjectScope(
  db: MembershipQuery,
  options: { minimumRole?: ProjectRole; paramName?: string } = {}
) {
  const { minimumRole = "viewer", paramName = "projectId" } = options;

  return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
    const principal = (req as ScopedRequest).principal;
    if (!principal) {
      res.status(401).json({
        error: { code: "AUTHENTICATION_REQUIRED", message: "Kimlik dogrulanmadi." }
      });
      return;
    }

    const projectId = req.params[paramName];
    if (!projectId) {
      res.status(400).json({
        error: { code: "PROJECT_ID_REQUIRED", message: `Route parametresi eksik: ${paramName}` }
      });
      return;
    }

    const decision = await resolveProjectScope(db, principal, projectId);

    if (isAuthzDenied(decision)) {
      res.status(DENIAL_STATUS[decision.reason]).json({
        error: { code: decision.reason, message: denialMessage(decision.reason) }
      });
      return;
    }

    if (!isAuthzAllowed(decision)) {
      // Ulasilamaz: AuthzDecision iki dalli. Yine de sessizce gecirmiyoruz.
      res.status(500).json({
        error: { code: "AUTHZ_DECISION_INVALID", message: "Yetki karari cozulemedi." }
      });
      return;
    }

    if (!projectRoleAtLeast(decision.scope.role, minimumRole)) {
      res.status(403).json({
        error: {
          code: "INSUFFICIENT_ROLE",
          message: `Bu islem en az '${minimumRole}' rolu gerektiriyor.`
        }
      });
      return;
    }

    (req as ScopedRequest).projectScope = decision.scope;
    next();
  };
}

function denialMessage(reason: AuthzDenialReason): string {
  switch (reason) {
    case "POLICY_STORE_UNAVAILABLE":
      return "Yetki deposuna ulasilamiyor. Istek reddedildi (fail-closed).";
    case "ORG_MISMATCH":
    case "NO_PROJECT_MEMBERSHIP":
      // Enumeration onleme: "proje yok" ile "yetkin yok" ayni mesaji alir.
      return "Bu projeye erisim yetkiniz yok.";
    case "INSUFFICIENT_ROLE":
      return "Rolunuz bu islem icin yetersiz.";
    default:
      return "Kimlik dogrulanmadi.";
  }
}
