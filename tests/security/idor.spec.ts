/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * P21/4 — T-01 IDOR ve FAIL-CLOSED, GERCEK HTTP YUZEYINDE.
 *
 * ## Neden bu dosya var
 *
 * `requireProjectScope` 125 route'a takili ve `apps/api/src/routes/v1.test.ts`
 * onu test ediyor — ama SAHTE bir DB ile. O dosyanin kendi notu:
 * "Gercek semaya karsi dogrulama P19'da testcontainers ile yapilir."
 * Yapilmadi. Bu dosya o borcu kapatir.
 *
 * Fark onemli: sahte DB, sorgunun DONDURDUGU seyi test yazan belirler.
 * Yani test, yazanin ne bekledigini dogrular — semanin ne yaptigini
 * degil. P19'da tam bu yuzden iki uretim hatasi bulunmustu (migration
 * 0051 ve graph traversal): ikisi de sorgu SEKLI dogru, SONUCU yanlisti.
 *
 * ## Kurulan saldiri
 *
 * Alice ORG_A'nin PROJ_A1 uyesi. Ucu de denenir:
 *
 *   1. baska ORG'un projesi          -> ORG_MISMATCH
 *   2. kendi org'unda uye OLMADIGI proje -> NO_PROJECT_MEMBERSHIP
 *   3. hic var olmayan proje         -> NO_PROJECT_MEMBERSHIP (404 DEGIL)
 *
 * Ucuncusu enumeration savunmasi: "yok" ile "yetkin yok" ayni yaniti
 * vermeli, yoksa saldirgan hangi id'lerin var oldugunu ogrenir.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { requireProjectScope } from "../../apps/api/src/middleware/authz.js";
import { createIntegrationDb, type IntegrationDb } from "../integration/setup.js";
import type { Principal } from "@y/shared";

const ORG_A = "org_a_idor";
const ORG_B = "org_b_idor";

function principalFor(userId: string, orgId: string): Principal {
  return {
    sub: `oidc|${userId}`,
    userId,
    orgId,
    kind: "user",
    tokenId: `jti_${userId}`,
    expiresAt: Math.floor(Date.now() / 1000) + 3600
  };
}

/**
 * Principal'i ENJEKTE eden minimal app.
 *
 * Token dogrulamasi burada test EDILMIYOR: olculen sey, kimligi
 * dogrulanmis bir principal'in BASKA projeye erisemedigi. Token
 * katmanini da karistirmak, bir test basarisiz oldugunda hangi
 * katmanin bozuldugunu belirsizlestirirdi.
 */
function appFor(db: IntegrationDb, principal: Principal | null, minimumRole?: "viewer" | "maintainer") {
  const app = express();
  app.use((req, _res, next) => {
    if (principal) (req as express.Request & { principal?: Principal }).principal = principal;
    next();
  });
  app.get(
    "/projects/:projectId",
    requireProjectScope({ query: (sql: string, params?: unknown[]) => db.query(sql, params) }, 
      minimumRole ? { minimumRole } : {}),
    (_req, res) => {
      res.status(200).json({ ok: true });
    }
  );
  return app;
}

async function seedIdentity(db: IntegrationDb): Promise<void> {
  for (const org of [ORG_A, ORG_B]) {
    await db.query(
      `INSERT INTO organizations (id, slug, name) VALUES ($1,$1,$1)
         ON CONFLICT (id) DO NOTHING;`,
      [org]
    );
  }

  // Alice ORG_A'da, Bob ORG_B'de.
  for (const [user, org] of [["user_alice", ORG_A], ["user_bob", ORG_B]] as const) {
    await db.query(
      `INSERT INTO users (id, oidc_issuer, oidc_sub) VALUES ($1,'https://iss.test',$2)
         ON CONFLICT (id) DO NOTHING;`,
      [user, `oidc|${user}`]
    );
    await db.query(
      `INSERT INTO org_memberships (id, organization_id, user_id, role)
       VALUES ($1,$2,$3,'member') ON CONFLICT (id) DO NOTHING;`,
      [`om_${user}`, org, user]
    );
  }

  // PROJ_A1: Alice uye.  PROJ_A2: ayni org, Alice UYE DEGIL.
  // PROJ_B1: baska org.
  for (const [proj, org] of [["proj_a1", ORG_A], ["proj_a2", ORG_A], ["proj_b1", ORG_B]] as const) {
    await db.query(
      `INSERT INTO projects (id, organization_id, name) VALUES ($1,$2,$1)
         ON CONFLICT (id) DO NOTHING;`,
      [proj, org]
    );
  }

  await db.query(
    `INSERT INTO project_memberships (id, project_id, user_id, role)
     VALUES ('pm_alice_a1','proj_a1','user_alice','viewer') ON CONFLICT (id) DO NOTHING;`
  );
}

describe("T-01 — IDOR: baska projenin id'siyle erisim", () => {
  let db: IntegrationDb;
  let alice: Principal;

  beforeAll(async () => {
    db = await createIntegrationDb("idor.spec.ts");
    await db.migrate();
    await seedIdentity(db);
    alice = principalFor("user_alice", ORG_A);
  });

  afterAll(async () => {
    await db?.close();
  });

  it("POZİTİF KONTROL: kendi projesine ERİŞEBİLİR", async () => {
    // Bu kontrol olmadan asagidaki testler, muhafiz HER SEYI reddetse
    // de gecerdi. 403 donduren bir sistem "guvenli" degil, BOZUK olur.
    const res = await request(appFor(db, alice)).get("/projects/proj_a1");
    expect(res.status).toBe(200);
  });

  it("BAŞKA ORG'un projesine 403 — ORG_MISMATCH", async () => {
    const res = await request(appFor(db, alice)).get("/projects/proj_b1");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ORG_MISMATCH");
  });

  it("KENDİ org'unda üye OLMADIĞI projeye 403", async () => {
    // Cross-tenant degil ama yine yetkisiz: org uyeligi tek basina
    // her projeye erisim vermez.
    const res = await request(appFor(db, alice)).get("/projects/proj_a2");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NO_PROJECT_MEMBERSHIP");
  });

  it("VAR OLMAYAN proje de 403 döner — enumeration engellenir", async () => {
    // 404 donmek "bu id var ama yetkin yok" ile "bu id yok"u ayirt
    // edilebilir yapardi; saldirgan gecerli id'leri tarayabilirdi.
    const res = await request(appFor(db, alice)).get("/projects/proj_hic_yok");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NO_PROJECT_MEMBERSHIP");
  });

  it("kimlik YOKSA 401", async () => {
    const res = await request(appFor(db, null)).get("/projects/proj_a1");
    expect(res.status).toBe(401);
  });

  it("ROL yetersizse 403 — viewer, maintainer isteyen route'a giremez", async () => {
    const res = await request(appFor(db, alice, "maintainer")).get("/projects/proj_a1");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("INSUFFICIENT_ROLE");
  });
});
