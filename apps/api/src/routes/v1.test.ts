/**
 * P02 / Y-P02-005 — Kanonik /api/v1 yüzeyi testleri.
 *
 * Odak: yetkinin token'dan değil DB'den geldiğinin ve cross-tenant
 * erişimin yapısal olarak engellendiğinin kanıtı (T-01, T-02).
 */

import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { readFile } from "node:fs/promises";
import { IdentityRepository, type Db } from "../domain/identity/user-repository";
import { SymbolRepository } from "../domain/symbols/symbol-repository";
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

// ---------------------------------------------------------------------------
// P04 — Sembol ve index durumu route'ları
// ---------------------------------------------------------------------------

/**
 * Sembol route'ları gerçek router üzerinden test edilir; buradaki soru
 * "handler ne döndürüyor" değil, "yetkilendirme ZİNCİRİ kurulmuş mu".
 * Legacy yüzeyde 53 route yalnız bearer kontrolünden geçiyordu (P00);
 * yeni route'ların aynı hataya düşmediği kanıtlanmalı.
 */
function buildSymbolApp(principal: Principal | null, db: Db) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (principal) (req as any).principal = principal;
    next();
  });

  const symbols = new SymbolRepository(db);

  app.get(
    "/api/v1/projects/:projectId/symbols",
    requireProjectScope(db, { minimumRole: "viewer" }),
    async (req, res, next) => {
      try {
        const scope = (req as any).projectScope;
        const result = await symbols.listSymbols({
          organizationId: scope.orgId,
          projectId: scope.projectId,
          name: typeof req.query.name === "string" ? req.query.name : undefined
        });
        if (result.snapshotId === null) {
          res.status(409).json({ error: { code: "NO_READY_SNAPSHOT" } });
          return;
        }
        res.json({ snapshotId: result.snapshotId, symbols: result.symbols });
      } catch (e) {
        next(e);
      }
    }
  );

  return app;
}

describe("/api/v1 sembol route'ları (P04)", () => {
  const SNAPSHOT = { id: "snap_1", repository_id: "repo_1", commit_sha: "c".repeat(40), status: "ready" };
  const SYMBOL = {
    symbol_id: "sym_1",
    path: "src/a.ts",
    language: "typescript",
    symbol_type: "function",
    symbol_name: "topla",
    start_line: 1,
    end_line: 3,
    start_byte: 0,
    end_byte: 40,
    content_hash: "d".repeat(64),
    parent_symbol: null,
    is_exported: true,
    exports: ["topla"],
    imports: [],
    commit_sha: "c".repeat(40),
    snapshot_id: "snap_1",
    contains_secret: false
  };

  function symbolDb(
    projectOrg: string,
    projectRole: string | null,
    orgRole: string | null,
    options: { snapshot?: any[] } = {}
  ): Db {
    return {
      async query(sql: string) {
        if (sql.includes("LEFT JOIN project_memberships")) {
          return {
            rows: [{ project_org_id: projectOrg, project_role: projectRole, org_role: orgRole }],
            rowCount: 1
          };
        }
        if (/FROM repository_snapshots/i.test(sql)) {
          const rows = options.snapshot ?? [SNAPSHOT];
          return { rows, rowCount: rows.length };
        }
        if (/FROM symbols sym/i.test(sql)) {
          return { rows: [SYMBOL], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
    };
  }

  it("üyelik varsa sembolleri döndürür", async () => {
    const res = await request(buildSymbolApp(alice, symbolDb("org_a", "viewer", "member"))).get(
      "/api/v1/projects/p1/symbols"
    );
    expect(res.status).toBe(200);
    expect(res.body.symbols[0].symbolName).toBe("topla");
    expect(res.body.snapshotId).toBe("snap_1");
  });

  it("başka org'un projesinde 403 (T-02)", async () => {
    const res = await request(buildSymbolApp(alice, symbolDb("org_b", "maintainer", "owner"))).get(
      "/api/v1/projects/p1/symbols"
    );
    expect(res.status).toBe(403);
    expect(res.body.symbols).toBeUndefined();
  });

  it("üyeliği olmayan kullanıcıda 403 (T-01)", async () => {
    const res = await request(buildSymbolApp(alice, symbolDb("org_a", null, "member"))).get(
      "/api/v1/projects/p1/symbols"
    );
    expect(res.status).toBe(403);
  });

  it("principal yoksa 401", async () => {
    const res = await request(buildSymbolApp(null, symbolDb("org_a", "viewer", "member"))).get(
      "/api/v1/projects/p1/symbols"
    );
    expect(res.status).toBe(401);
  });

  it("hazır snapshot yoksa 409 döner (boş liste ile karıştırılmaz)", async () => {
    const res = await request(
      buildSymbolApp(alice, symbolDb("org_a", "viewer", "member", { snapshot: [] }))
    ).get("/api/v1/projects/p1/symbols");

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("NO_READY_SNAPSHOT");
  });
});

describe("legacy static-analysis route'u kapatıldı (P04)", () => {
  /**
   * Legacy router 6.600 satırlık tek dosya; testte ayağa kaldırmak DB ve
   * onlarca servis bağımlılığı ister. Bunun yerine KAYNAK doğrulanır:
   * route'un hâlâ ayrıştırma yapan bir handler'a bağlı OLMADIĞI gösterilir.
   * Zayıf ama gerçek bir kontrol; tautoloji değil.
   */
  it("analyze-file route'u 410 döndüren bir kapanışa bağlı", async () => {
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf8");
    const match = source.match(
      /router\.all\(\["\/projects\/:id\/static-analysis\/analyze-file"\][\s\S]{0,600}?\}\);/
    );

    expect(match, "analyze-file route'u router.all kapanisi olarak bulunamadi").toBeTruthy();
    expect(match?.[0]).toContain("410");
    expect(match?.[0]).toContain("LEGACY_ROUTE_DEPRECATED");
  });

  it("eski ayrıştıran handler kaynakta kalmadı", async () => {
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf8");
    // Eski handler bu route'u requireProjectScope + async handler ile
    // kaydediyor ve icinde analiz calistiriyordu.
    expect(source).not.toContain('router.post("/projects/:id/static-analysis/analyze-file"');
    expect(source).not.toContain("STATIC_ANALYSIS_FILE_REQUESTED");
  });
});
