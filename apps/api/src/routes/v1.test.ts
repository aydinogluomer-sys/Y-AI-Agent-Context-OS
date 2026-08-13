/**
 * P02 / Y-P02-005 — Kanonik /api/v1 yüzeyi testleri.
 *
 * Odak: yetkinin token'dan değil DB'den geldiğinin ve cross-tenant
 * erişimin yapısal olarak engellendiğinin kanıtı (T-01, T-02).
 */

import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { IdentityRepository, type Db } from "../domain/identity/user-repository";
import { requireProjectScope } from "../middleware/authz";
import type { Principal } from "@y/shared";

const alice: Principal = {
  sub: "oidc|alice",
  userId: "user_alice",
  orgId: "org_a",
  kind: "user",
  tokenId: "jti_1",
  expiresAt: Math.floor(Date.now() / 1000) + 3600
};

/**
 * Sorguyu içeriğine göre yanıtlayan sahte DB.
 * Gerçek şemaya karşı doğrulama P19'da testcontainers ile yapılır;
 * burada amaç route/authz protokolünün doğrulanmasıdır.
 */
function createDb(overrides: Record<string, any[]> = {}): Db & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async query(sql: string, params?: unknown[]) {
      // Kirpma YOK: testler sorgunun organization_id/JOIN iceriyor mu diye
      // bakiyor; kirpilmis SQL yanlis negatif uretir.
      calls.push(sql.replace(/\s+/g, " ").trim());

      for (const [needle, rows] of Object.entries(overrides)) {
        if (sql.includes(needle)) return { rows, rowCount: rows.length };
      }

      if (sql.includes("FROM users")) {
        return { rows: [{ id: "user_alice", oidc_issuer: "iss", oidc_sub: "oidc|alice", email: "a@x", display_name: "Alice", disabled_at: null }], rowCount: 1 };
      }
      if (sql.includes("FROM organizations")) {
        return { rows: [{ id: "org_a", slug: "a", name: "Org A", role: "member" }], rowCount: 1 };
      }
      if (sql.includes("FROM org_memberships")) {
        return { rows: [{ role: "member" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  };
}

describe("IdentityRepository", () => {
  it("var olan kullanıcıyı çözer, yeniden oluşturmaz", async () => {
    const db = createDb();
    const repo = new IdentityRepository(db);
    const user = await repo.resolveUser({ issuer: "iss", sub: "oidc|alice" });

    expect(user.id).toBe("user_alice");
    expect(db.calls.some((c) => c.startsWith("INSERT INTO users"))).toBe(false);
  });

  it("bilinmeyen kullanıcıyı JIT oluşturur", async () => {
    let seen = false;
    const db: Db & { calls: string[] } = {
      calls: [],
      async query(sql: string) {
        (db.calls as string[]).push(sql.replace(/\s+/g, " ").trim());
        if (sql.includes("INSERT INTO users")) {
          seen = true;
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes("FROM users")) {
          return seen
            ? { rows: [{ id: "user_new", oidc_issuer: "iss", oidc_sub: "new", email: null, display_name: null, disabled_at: null }], rowCount: 1 }
            : { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      }
    };

    const user = await new IdentityRepository(db).resolveUser({ issuer: "iss", sub: "new" });
    expect(seen).toBe(true);
    expect(user.id).toBe("user_new");
  });

  it("kullanıcı oluşturmak yetki VERMEZ (üyelik ayrı işlem)", async () => {
    const db = createDb({ "FROM org_memberships": [] });
    const repo = new IdentityRepository(db);
    const role = await repo.orgRoleOf("org_a", "user_new");
    expect(role).toBeNull();
  });

  it("sıradan üye yalnız üyesi olduğu projeleri görür", async () => {
    const db = createDb();
    const repo = new IdentityRepository(db);
    await repo.listProjectsForUser("org_a", "user_alice", "member");

    // Sorgu project_memberships ile JOIN yapmali; duz proje listesi DEGIL.
    const projectQuery = db.calls.find((c) => c.includes("FROM projects"));
    expect(projectQuery).toContain("JOIN project_memberships");
  });

  it("org admin'i tüm org projelerini görür", async () => {
    const db = createDb();
    const repo = new IdentityRepository(db);
    await repo.listProjectsForUser("org_a", "user_alice", "admin");

    const projectQuery = db.calls.find((c) => c.includes("FROM projects"));
    expect(projectQuery).not.toContain("JOIN project_memberships");
    expect(projectQuery).toContain("organization_id");
  });

  it("proje listesi sorgusu her zaman organization_id ile sınırlıdır", async () => {
    for (const role of ["admin", "member"] as const) {
      const db = createDb();
      await new IdentityRepository(db).listProjectsForUser("org_a", "user_alice", role);
      const q = db.calls.find((c) => c.includes("FROM projects"));
      expect(q, `rol=${role}`).toContain("organization_id");
    }
  });
});

// ---------------------------------------------------------------------------

/** authn'i taklit eden minimal app — jose/JWKS testleri ayrı dosyada. */
function buildApp(principal: Principal | null, db: Db) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (principal) (req as any).principal = principal;
    next();
  });

  const identity = new IdentityRepository(db);

  app.get("/api/v1/auth/me", async (req, res, next) => {
    try {
      const p = (req as any).principal as Principal;
      const user = await identity.resolveUser({ issuer: "iss", sub: p.sub });
      res.json({ user: { id: user.id }, organizations: await identity.listOrganizationsForUser(user.id) });
    } catch (e) {
      next(e);
    }
  });

  app.get(
    "/api/v1/projects/:projectId/members",
    requireProjectScope(db, { minimumRole: "viewer" }),
    async (req, res, next) => {
      try {
        res.json({ members: await identity.listProjectMembers(req.params.projectId) });
      } catch (e) {
        next(e);
      }
    }
  );

  return app;
}

describe("/api/v1 yetkilendirme davranışı", () => {
  const scopedDb = (projectOrg: string, projectRole: string | null, orgRole: string | null): Db => ({
    async query(sql: string) {
      if (sql.includes("LEFT JOIN project_memberships")) {
        return {
          rows: [{ project_org_id: projectOrg, project_role: projectRole, org_role: orgRole }],
          rowCount: 1
        };
      }
      if (sql.includes("FROM project_memberships pm")) {
        return { rows: [{ user_id: "user_alice", role: "developer", email: "a@x", display_name: "Alice" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  });

  it("üyelik varsa üye listesi döner", async () => {
    const res = await request(buildApp(alice, scopedDb("org_a", "developer", "member"))).get(
      "/api/v1/projects/p1/members"
    );
    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(1);
  });

  it("başka org'un projesinde 403 (T-02)", async () => {
    const res = await request(buildApp(alice, scopedDb("org_b", "maintainer", "owner"))).get(
      "/api/v1/projects/p1/members"
    );
    expect(res.status).toBe(403);
    expect(res.body.members).toBeUndefined();
  });

  it("üyeliği olmayan kullanıcıda 403 (T-01)", async () => {
    const res = await request(buildApp(alice, scopedDb("org_a", null, "member"))).get(
      "/api/v1/projects/p1/members"
    );
    expect(res.status).toBe(403);
  });

  it("principal yoksa 401", async () => {
    const res = await request(buildApp(null, scopedDb("org_a", "developer", "member"))).get(
      "/api/v1/projects/p1/members"
    );
    expect(res.status).toBe(401);
  });

  it("auth/me yetkileri DB'den döndürür, token'dan değil", async () => {
    const db = createDb();
    const res = await request(buildApp(alice, db)).get("/api/v1/auth/me");
    expect(res.status).toBe(200);
    // Yanit org_memberships sorgusuna dayanmali.
    expect(db.calls.some((c) => c.includes("org_memberships"))).toBe(true);
  });
});
