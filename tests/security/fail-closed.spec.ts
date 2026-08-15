/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * P21/4 — FAIL-CLOSED: politika deposu duserse HER ISTEK REDDEDILIR.
 *
 * ## Neden ayri bir dosya
 *
 * IDOR testleri "yanlis kisi reddediliyor mu" diye sorar. Bu dosya daha
 * kotu bir senaryoyu sorar: yetkiyi BELIRLEYEMEDIGIMIZDE ne oluyor?
 *
 * Yanlis cevap "gecir" olurdu. Bir yetki sisteminin en tehlikeli hatasi
 * budur cunku SESSIZDIR: hicbir istek reddedilmez, hicbir log dikkat
 * cekmez, sistem saglikli gorunur.
 *
 * `resolveProjectScope` bunu `catch` icinde ele aliyor ve
 * `POLICY_STORE_UNAVAILABLE` (503) donuyor. Bu dosya o davranisin
 * YAZILI degil GERCEK oldugunu olcer.
 *
 * ## Yontem: gercek bozulma, sahte hata degil
 *
 * `db.query` yerine hata firlatan bir sahte koymak, kendi yazdigimiz
 * senaryoyu dogrulamak olurdu. Bunun yerine deponun KENDISI bozulur:
 *
 *   1. `projects` tablosu DUSURULUR   -> sorgu gercekten patlar
 *   2. baglanti havuzu KAPATILIR      -> depoya gercekten ulasilamaz
 *
 * Her ikisinde de ONCE ayni istegin 200 dondugu gosterilir. Tek degisen
 * deponun durumudur.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { requireProjectScope } from "../../apps/api/src/middleware/authz.js";
import { createIntegrationDb, type IntegrationDb } from "../integration/setup.js";
import type { Principal } from "@y/shared";

const ORG = "org_failclosed";

const alice: Principal = {
  sub: "oidc|alice",
  userId: "user_alice",
  orgId: ORG,
  kind: "user",
  tokenId: "jti_alice",
  expiresAt: Math.floor(Date.now() / 1000) + 3600
};

function appFor(db: IntegrationDb) {
  const app = express();
  app.use((req, _res, next) => {
    (req as express.Request & { principal?: Principal }).principal = alice;
    next();
  });
  app.get(
    "/projects/:projectId",
    requireProjectScope({ query: (sql: string, params?: unknown[]) => db.query(sql, params) }),
    (_req, res) => {
      res.status(200).json({ ok: true });
    }
  );
  return app;
}

async function seed(db: IntegrationDb): Promise<void> {
  await db.query(`INSERT INTO organizations (id, slug, name) VALUES ($1,$1,$1);`, [ORG]);
  await db.query(
    `INSERT INTO users (id, oidc_issuer, oidc_sub) VALUES ('user_alice','https://iss.test','oidc|alice');`
  );
  await db.query(
    `INSERT INTO org_memberships (id, organization_id, user_id, role)
     VALUES ('om_alice',$1,'user_alice','member');`,
    [ORG]
  );
  await db.query(
    `INSERT INTO projects (id, organization_id, name) VALUES ('proj_fc',$1,'fc');`,
    [ORG]
  );
  await db.query(
    `INSERT INTO project_memberships (id, project_id, user_id, role)
     VALUES ('pm_alice','proj_fc','user_alice','viewer');`
  );
}

describe("Politika deposu TABLOSU düşerse fail-closed", () => {
  let db: IntegrationDb;

  beforeAll(async () => {
    db = await createIntegrationDb("fail-closed-table.spec.ts");
    await db.migrate();
    await seed(db);
  });

  afterAll(async () => {
    await db?.close();
  });

  it("POZİTİF KONTROL: depo SAĞLAMKEN aynı istek 200 döner", async () => {
    // Bu kontrol sarttir. Olmadan, asagidaki test muhafiz HER ZAMAN 503
    // dondurse de gecerdi — ve o zaman "fail-closed" degil "tamamen
    // bozuk" olurdu.
    const res = await request(appFor(db)).get("/projects/proj_fc");
    expect(res.status).toBe(200);
  });

  it("tablo DÜŞÜNCE istek 503 ile REDDEDİLİR — asla 200 değil", async () => {
    // Deponun kendisi bozuluyor; sahte bir hata enjekte edilmiyor.
    await db.query("DROP TABLE project_memberships, projects CASCADE;");

    const res = await request(appFor(db)).get("/projects/proj_fc");

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("POLICY_STORE_UNAVAILABLE");

    // En onemlisi: SESSIZCE GECIRMEDI. Bir yetki sisteminin en tehlikeli
    // hatasi, karar veremedigi durumda ALLOW donmesidir.
    expect(res.status).not.toBe(200);
  });
});

describe("Politika deposu BAĞLANTISI koparsa fail-closed", () => {
  let db: IntegrationDb;

  beforeAll(async () => {
    db = await createIntegrationDb("fail-closed-conn.spec.ts");
    await db.migrate();
    await seed(db);
  });

  it("POZİTİF KONTROL: bağlantı AÇIKKEN aynı istek 200 döner", async () => {
    const res = await request(appFor(db)).get("/projects/proj_fc");
    expect(res.status).toBe(200);
  });

  it("bağlantı KAPANINCA istek 503 ile REDDEDİLİR", async () => {
    // `close()` semayi dusurur ve havuzu sonlandirir: depoya ulasilamaz
    // durumun gercek karsiligi.
    await db.close();

    const res = await request(appFor(db)).get("/projects/proj_fc");

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("POLICY_STORE_UNAVAILABLE");
  });
});
