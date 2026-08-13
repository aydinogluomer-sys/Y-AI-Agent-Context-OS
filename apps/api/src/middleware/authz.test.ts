/**
 * P02 / Y-P02-002 — Yetkilendirme testleri.
 *
 * Bunlar master plan Appendix I'deki T-01 (IDOR), T-02 (cross-tenant) ve
 * T-10 (fail-closed) tehditlerinin otomatik karşılıklarıdır.
 * Her biri P00'daki somut bir bulgunun regresyon testidir.
 */

import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { resolveProjectScope, requireProjectScope, type MembershipQuery } from "./authz";
import type { AuthzDecision, Principal } from "@y/shared";

/** Kok tsconfig'de strict kapali; daraltmaya bagimli olmadan sebebi okur. */
function reasonOf(d: AuthzDecision): string {
  return (d as { reason?: string }).reason ?? "";
}

const alice: Principal = {
  sub: "oidc|alice",
  userId: "user_alice",
  orgId: "org_a",
  kind: "user",
  tokenId: "jti_alice",
  expiresAt: Math.floor(Date.now() / 1000) + 3600
};

interface Row {
  project_org_id: string;
  project_role: string | null;
  org_role: string | null;
}

/** Sorgu davranışını senaryo bazında taklit eden dürüst bir sahte DB. */
function db(rows: Row[] | Error): MembershipQuery {
  return {
    async query() {
      if (rows instanceof Error) throw rows;
      return { rows, rowCount: rows.length };
    }
  };
}

describe("resolveProjectScope — üyelik çözümü", () => {
  it("proje üyeliği olan kullanıcıya izin verir", async () => {
    const d = await resolveProjectScope(
      db([{ project_org_id: "org_a", project_role: "developer", org_role: "member" }]),
      alice,
      "proj_1"
    );
    expect(d.allowed).toBe(true);
    if (d.allowed) {
      expect(d.scope.role).toBe("developer");
      expect(d.scope.resolvedFrom).toBe("project_membership");
    }
  });

  it("proje üyeliği olmayan org admin'ine maintainer olarak izin verir", async () => {
    const d = await resolveProjectScope(
      db([{ project_org_id: "org_a", project_role: null, org_role: "admin" }]),
      alice,
      "proj_1"
    );
    expect(d.allowed).toBe(true);
    if (d.allowed) expect(d.scope.resolvedFrom).toBe("org_admin");
  });

  it("üyeliği olmayan sıradan org üyesini reddeder (T-01 IDOR)", async () => {
    const d = await resolveProjectScope(
      db([{ project_org_id: "org_a", project_role: null, org_role: "member" }]),
      alice,
      "proj_1"
    );
    expect(d.allowed).toBe(false);
    expect(reasonOf(d)).toBe("NO_PROJECT_MEMBERSHIP");
  });

  it("başka organizasyonun projesini reddeder (T-02 cross-tenant)", async () => {
    const d = await resolveProjectScope(
      db([{ project_org_id: "org_b", project_role: "maintainer", org_role: "owner" }]),
      alice,
      "proj_other"
    );
    expect(d.allowed).toBe(false);
    expect(reasonOf(d)).toBe("ORG_MISMATCH");
  });

  it("var olmayan projeyi reddeder", async () => {
    const d = await resolveProjectScope(db([]), alice, "proj_yok");
    expect(d.allowed).toBe(false);
  });

  it("DB erişilemezse REDDEDER, izin vermez (T-10 fail-closed)", async () => {
    // P00 bulgusu P0-5: mevcut kernel bu durumda STATIK ALLOW listesine
    // dusuyordu. Buradaki davranis onun tam tersidir.
    const d = await resolveProjectScope(db(new Error("connection refused")), alice, "proj_1");
    expect(d.allowed).toBe(false);
    expect(reasonOf(d)).toBe("POLICY_STORE_UNAVAILABLE");
  });

  it("token claim'lerine değil, DB satırına bakar", async () => {
    // Principal tipi zaten projectIds tasimiyor; bu test sozlesmeyi kilitler.
    expect(Object.keys(alice)).not.toContain("projectIds");
    expect(Object.keys(alice)).not.toContain("roles");
  });
});

// ---------------------------------------------------------------------------

function buildApp(rows: Row[] | Error, principal: Principal | null, minimumRole?: any) {
  const app = express();
  app.use((req, _res, next) => {
    if (principal) (req as any).principal = principal;
    next();
  });
  app.get(
    "/projects/:projectId/things",
    requireProjectScope(db(rows), minimumRole ? { minimumRole } : {}),
    (req, res) => res.json({ ok: true, scope: (req as any).projectScope })
  );
  return app;
}

describe("requireProjectScope — HTTP davranışı", () => {
  const ok: Row[] = [{ project_org_id: "org_a", project_role: "developer", org_role: "member" }];

  it("principal yoksa 401 döner", async () => {
    const res = await request(buildApp(ok, null)).get("/projects/p1/things");
    expect(res.status).toBe(401);
  });

  it("yetkili istekte scope'u handler'a geçirir", async () => {
    const res = await request(buildApp(ok, alice)).get("/projects/p1/things");
    expect(res.status).toBe(200);
    expect(res.body.scope.projectId).toBe("p1");
    expect(res.body.scope.orgId).toBe("org_a");
  });

  it("cross-tenant istekte 403 döner", async () => {
    const rows: Row[] = [{ project_org_id: "org_b", project_role: "maintainer", org_role: "owner" }];
    const res = await request(buildApp(rows, alice)).get("/projects/p1/things");
    expect(res.status).toBe(403);
  });

  it("yetersiz rolde 403 döner", async () => {
    const rows: Row[] = [{ project_org_id: "org_a", project_role: "viewer", org_role: "member" }];
    const res = await request(buildApp(rows, alice, "maintainer")).get("/projects/p1/things");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("INSUFFICIENT_ROLE");
  });

  it("DB erişilemezse 503 döner ve isteği GEÇİRMEZ", async () => {
    const res = await request(buildApp(new Error("down"), alice)).get("/projects/p1/things");
    expect(res.status).toBe(503);
    expect(res.body.ok).toBeUndefined();
  });

  it("var olmayan proje ile yetkisiz proje aynı mesajı döner (enumeration önleme)", async () => {
    const missing = await request(buildApp([], alice)).get("/projects/p1/things");
    const forbidden = await request(
      buildApp([{ project_org_id: "org_b", project_role: null, org_role: null }], alice)
    ).get("/projects/p1/things");
    expect(missing.body.error.message).toBe(forbidden.body.error.message);
  });
});
