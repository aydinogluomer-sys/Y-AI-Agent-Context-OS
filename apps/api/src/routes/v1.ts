/**
 * P02 / Y-P02-005 — Kanonik `/api/v1` yüzeyi (ADR-001).
 *
 * Legacy `apps/api/src/index.ts` (195 route, tek dosya) yerine geçecek
 * yüzeyin ilk dilimi. Buraya eklenen her route:
 *
 *   1. `authn` middleware'inden geçer (OIDC + JWKS),
 *   2. proje-kapsamlı ise `requireProjectScope`'tan geçer (DB-backed),
 *   3. SQL yazmaz — `domain/` katmanını çağırır,
 *   4. handler içinde ad-hoc yetki kontrolü YAPMAZ (ADR-017).
 *
 * P00 Truth Audit'te legacy yüzeyin 53 route'u yalnız bearer kontrolünden
 * geçiyordu; bu yapı onu tekrarlamayı yapısal olarak zorlaştırır.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { orgRoleAtLeast, type ProjectRole } from "@y/shared";
import { authnMiddleware, type AuthnConfig, type AuthenticatedRequest } from "../middleware/authn";
import { requireProjectScope, type ScopedRequest } from "../middleware/authz";
import { IdentityRepository, type Db } from "../domain/identity/user-repository";

export interface V1Dependencies {
  db: Db;
  authn: AuthnConfig;
  /** Kimlik sağlayıcısının issuer'ı — kullanıcı çözümünde kullanılır. */
  issuer: string;
}

/** async handler'larda atılan hataların error middleware'ine ulaşmasını sağlar. */
function wrap(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };
}

const PROJECT_ROLES: readonly ProjectRole[] = ["maintainer", "developer", "reviewer", "viewer"];

export function createV1Router(deps: V1Dependencies): Router {
  const router = Router();
  const identity = new IdentityRepository(deps.db);

  // Tüm /api/v1 yüzeyi kimlik doğrulaması ister. İstisna yok:
  // sağlık probe'ları /api/v1 altında değil, kök seviyededir.
  router.use(authnMiddleware(deps.authn));

  // --- Kimlik -------------------------------------------------------------

  router.get(
    "/auth/me",
    wrap(async (req, res) => {
      const principal = (req as AuthenticatedRequest).principal;
      const user = await identity.resolveUser({ issuer: deps.issuer, sub: principal.sub });
      const orgs = await identity.listOrganizationsForUser(user.id);

      res.json({
        user: {
          id: user.id,
          sub: user.oidcSub,
          email: user.email,
          displayName: user.displayName
        },
        // Yetki listesi token'dan DEĞİL, DB'den geliyor (ADR-017).
        organizations: orgs,
        activeOrgId: principal.orgId
      });
    })
  );

  // --- Organizasyonlar ----------------------------------------------------

  router.get(
    "/orgs",
    wrap(async (req, res) => {
      const principal = (req as AuthenticatedRequest).principal;
      const user = await identity.resolveUser({ issuer: deps.issuer, sub: principal.sub });
      res.json({ organizations: await identity.listOrganizationsForUser(user.id) });
    })
  );

  router.get(
    "/orgs/:orgId/projects",
    wrap(async (req, res) => {
      const principal = (req as AuthenticatedRequest).principal;
      const orgId = req.params.orgId;

      // Token'daki org ile istenen org farklıysa dur (T-02).
      if (orgId !== principal.orgId) {
        res.status(403).json({
          error: { code: "ORG_MISMATCH", message: "Bu organizasyona erisim yetkiniz yok." }
        });
        return;
      }

      const user = await identity.resolveUser({ issuer: deps.issuer, sub: principal.sub });
      const orgRole = await identity.orgRoleOf(orgId, user.id);
      if (!orgRole) {
        res.status(403).json({
          error: { code: "NO_ORG_MEMBERSHIP", message: "Bu organizasyona erisim yetkiniz yok." }
        });
        return;
      }

      res.json({ projects: await identity.listProjectsForUser(orgId, user.id, orgRole) });
    })
  );

  // --- Proje üyelikleri ---------------------------------------------------

  router.get(
    "/projects/:projectId/members",
    requireProjectScope(deps.db, { minimumRole: "viewer" }),
    wrap(async (req, res) => {
      const scope = (req as ScopedRequest).projectScope;
      res.json({ members: await identity.listProjectMembers(scope.projectId) });
    })
  );

  router.post(
    "/projects/:projectId/members",
    requireProjectScope(deps.db, { minimumRole: "maintainer" }),
    wrap(async (req, res) => {
      const scope = (req as ScopedRequest).projectScope;
      const { userId, role } = req.body ?? {};

      if (typeof userId !== "string" || userId.length === 0) {
        res.status(400).json({ error: { code: "USER_ID_REQUIRED", message: "userId gerekli." } });
        return;
      }
      if (!PROJECT_ROLES.includes(role)) {
        res.status(400).json({
          error: {
            code: "INVALID_ROLE",
            message: `role su degerlerden biri olmali: ${PROJECT_ROLES.join(", ")}`
          }
        });
        return;
      }

      await identity.upsertProjectMembership(scope.projectId, userId, role);
      res.status(201).json({ ok: true });
    })
  );

  router.delete(
    "/projects/:projectId/members/:userId",
    requireProjectScope(deps.db, { minimumRole: "maintainer" }),
    wrap(async (req, res) => {
      const scope = (req as ScopedRequest).projectScope;
      const removed = await identity.removeProjectMembership(scope.projectId, req.params.userId);

      // Son maintainer'ın kendini silmesi projeyi sahipsiz bırakır.
      // Bu kontrol repository seviyesinde değil burada: bir ürün kuralıdır.
      if (!removed) {
        res.status(404).json({ error: { code: "MEMBERSHIP_NOT_FOUND", message: "Uyelik bulunamadi." } });
        return;
      }
      res.status(204).end();
    })
  );

  return router;
}

/** Org rolü yeterliliğini kontrol eden yardımcı (org-kapsamlı route'lar için). */
export function requireOrgRole(identity: IdentityRepository, issuer: string, minimum: Parameters<typeof orgRoleAtLeast>[1]) {
  return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
    const principal = (req as AuthenticatedRequest).principal;
    const orgId = req.params.orgId ?? principal.orgId;

    if (orgId !== principal.orgId) {
      res.status(403).json({ error: { code: "ORG_MISMATCH", message: "Erisim yetkiniz yok." } });
      return;
    }

    const user = await identity.resolveUser({ issuer, sub: principal.sub });
    const role = await identity.orgRoleOf(orgId, user.id);

    if (!role || !orgRoleAtLeast(role, minimum)) {
      res.status(403).json({
        error: { code: "INSUFFICIENT_ORG_ROLE", message: `Bu islem en az '${minimum}' org rolu gerektiriyor.` }
      });
      return;
    }
    next();
  };
}
