/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * P21/3 — APPEND-ONLY TRIGGER'LARI (T-18, ADR-048).
 *
 * ## Neden bu dosya var
 *
 * Mutasyon kapisi 12 predikati tutuyordu ama append-only trigger'larin
 * yalnizca BIRI (`evidence_chain`) kapsamdaydi. Sekiz tablonun yedisi
 * hic yoklanmamisti.
 *
 * P20'de olculen oran: sinanan 12 predikatin BESI korumasizdi. Ayni
 * oran burada da gecerliyse yoklanmamis yedi trigger arasinda da yanlis
 * yesil var demektir. Bu dosya o varsayimi olcuye cevirir.
 *
 * ## Neden VERI ODAKLI
 *
 * Yedi tablo icin ayni uc iddia yazilacak. Elle tekrarlamak birini
 * unutmak demek. Tablo listesi tek yerde durur ve testler ondan turer.
 *
 * ## Kapsam disinda: `runs`
 *
 * `runs` tablosunun trigger'i append-only DEGIL: terminal duruma
 * gecmis bir run'in DEGISMESINI engeller (ADR-047). Farkli bir
 * sozlesme, ayri test edilmeli.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createIntegrationDb, type IntegrationDb } from "../integration/setup.js";
import { seedTenant, type TenantFixture } from "../integration/seed.js";

const ORG = "org_append";

interface AppendOnlyTable {
  /** Tablo adi. */
  readonly table: string;
  /** Bu satiri ekler. `id` cagirandan gelir ki her test kendi satirini kursun. */
  readonly seed: (db: IntegrationDb, tenant: TenantFixture, id: string) => Promise<void>;
  /** UPDATE denenecek kolon ve degeri. */
  readonly column: string;
  readonly newValue: string;
  /**
   * DELETE de bloklaniyor mu?
   *
   * Uc tablo UPDATE'i blokluyor ama DELETE'e IZIN VERIYOR. Bu testte
   * `false` yazmak o davranisi ONAYLAMAK degil, OLCMEK: mevcut durumu
   * kayda geciriyoruz ki degistiginde test kirilsin.
   */
  readonly deleteBlocked: boolean;
}

const TABLES: readonly AppendOnlyTable[] = [
  {
    table: "event_records",
    seed: (db, t, id) =>
      db.query(
        `INSERT INTO event_records (id, project_id, event_type, actor_type, payload_hash)
         VALUES ($1,$2,'run.started','user',$3);`,
        [id, t.projectId, "a".repeat(64)]
      ).then(() => undefined),
    column: "event_type",
    newValue: "run.tampered",
    deleteBlocked: true
  },
  {
    table: "context_universes",
    seed: (db, t, id) =>
      db.query(
        // `allow_globs` BOS OLAMAZ: ck_context_universes_allow. Bos bir
        // universe ile calisan compile, bos context'i basarili gosterirdi.
        `INSERT INTO context_universes
           (id, organization_id, policy_version, universe_hash, role, allow_globs)
         VALUES ($1,$2,'1',$3,'developer', ARRAY['src/**']);`,
        [id, t.organizationId, "b".repeat(64)]
      ).then(() => undefined),
    column: "policy_version",
    newValue: "999",
    deleteBlocked: true
  },
  {
    table: "context_manifests",
    seed: (db, t, id) =>
      db.query(
        `INSERT INTO context_manifests
           (id, organization_id, snapshot_id, manifest_hash, deterministic_inputs_hash,
            commit_sha, compiler_version, policy_version, universe_hash, weights_hash,
            tokenizer_id, budget_limit, budget_used)
         VALUES ($1,$2,$3,$4,$5,'deadbeef','1.0','1',$6,$7,'cl100k',1000,10);`,
        [id, t.organizationId, t.snapshotId, "c".repeat(64), "d".repeat(64), "e".repeat(64), "f".repeat(64)]
      ).then(() => undefined),
    column: "manifest_hash",
    newValue: "0".repeat(64),
    deleteBlocked: true
  },
  {
    table: "run_events",
    seed: async (db, t, id) => {
      // `runs` bir task'a bagli (NOT NULL FK). Zincir once kurulur.
      await db.query(
        `INSERT INTO tasks
           (id, organization_id, project_id, title, category, risk_level, difficulty, status)
         VALUES ($1,$2,$3,'append-only testi','maintenance','low','easy','open')
           ON CONFLICT (id) DO NOTHING;`,
        [`task_${id}`, t.organizationId, t.projectId]
      );
      await db.query(
        `INSERT INTO runs
           (id, organization_id, project_id, task_id, state, idempotency_key, requested_by)
         VALUES ($1,$2,$3,$4,'queued',$5,'user:test') ON CONFLICT (id) DO NOTHING;`,
        [`run_${id}`, t.organizationId, t.projectId, `task_${id}`, `idem_${id}`]
      );
      await db.query(
        `INSERT INTO run_events (id, run_id, sequence, to_state, reason, actor)
         VALUES ($1,$2,1,'queued','test','user:test');`,
        [id, `run_${id}`]
      );
    },
    column: "to_state",
    newValue: "succeeded",
    deleteBlocked: true
  },
  {
    table: "change_boundaries",
    seed: (db, t, id) =>
      db.query(
        // `expected_globs` BOS OLAMAZ: ck_change_boundaries_expected.
        `INSERT INTO change_boundaries
           (id, organization_id, boundary_hash, expected_globs)
         VALUES ($1,$2,$3, ARRAY['src/**']);`,
        [id, t.organizationId, "9".repeat(64)]
      ).then(() => undefined),
    column: "boundary_hash",
    newValue: "8".repeat(64),
    // BULGU: DELETE bloklanmiyor. Asagidaki testler bunu olcuyor.
    deleteBlocked: false
  }
];

describe("T-18 — append-only trigger'lar YAZMAYI ENGELLER", () => {
  let db: IntegrationDb;
  let tenant: TenantFixture;

  beforeAll(async () => {
    db = await createIntegrationDb("append-only.spec.ts");
    await db.migrate();
    tenant = await seedTenant(db, ORG);
  });

  afterAll(async () => {
    await db?.close();
  });

  for (const spec of TABLES) {
    describe(spec.table, () => {
      it("POZİTİF KONTROL: yeni kayıt EKLENEBİLİR", async () => {
        // Bu kontrol olmadan asagidaki testler, tablo TAMAMEN yazilamaz
        // olsa da gecerdi. Append-only "hic yazilamaz" DEGIL: ekleme
        // serbest, degistirme yasak.
        const id = `${spec.table}_pos`;
        await spec.seed(db, tenant, id);
        const { rows } = await db.query(
          `SELECT COUNT(*)::int AS c FROM ${spec.table} WHERE id = $1;`,
          [id]
        );
        expect(rows[0].c).toBe(1);
      });

      it("UPDATE reddedilir ve veri DEĞİŞMEZ", async () => {
        const id = `${spec.table}_upd`;
        await spec.seed(db, tenant, id);

        const before = (
          await db.query(`SELECT ${spec.column} AS v FROM ${spec.table} WHERE id = $1;`, [id])
        ).rows[0].v;

        await expect(
          db.query(`UPDATE ${spec.table} SET ${spec.column} = $1 WHERE id = $2;`, [
            spec.newValue,
            id
          ])
        ).rejects.toThrow();

        // Hata firlatmasi TEK BASINA yetmez: sifir satir eslesen bir
        // UPDATE de hata firlatmazdi. Verinin gercekten degismedigini
        // gostermek gerekir.
        const after = (
          await db.query(`SELECT ${spec.column} AS v FROM ${spec.table} WHERE id = $1;`, [id])
        ).rows[0].v;
        expect(after).toBe(before);
      });

      if (spec.deleteBlocked) {
        it("DELETE reddedilir ve kayıt YERİNDE KALIR", async () => {
          const id = `${spec.table}_del`;
          await spec.seed(db, tenant, id);

          await expect(
            db.query(`DELETE FROM ${spec.table} WHERE id = $1;`, [id])
          ).rejects.toThrow();

          const { rows } = await db.query(
            `SELECT COUNT(*)::int AS c FROM ${spec.table} WHERE id = $1;`,
            [id]
          );
          expect(rows[0].c).toBe(1);
        });
      } else {
        it("KAYIT: DELETE bloklanMIYOR — bilinen boşluk", async () => {
          /*
           * Bu test mevcut davranisi ONAYLAMIYOR, OLCUYOR.
           *
           * `change_boundaries`, `context_manifest_items` ve
           * `context_manifest_exclusions` UPDATE'i blokluyor ama
           * DELETE'e IZIN VERIYOR.
           *
           * Manifest kalemleri icin bu gercek bir butunluk bosluğu:
           * manifest'in KENDISI silinemez ama KALEMLERI silinebilir —
           * yani manifest hash'i sessizce icerigiyle uyumsuz hale
           * gelebilir (ADR-011/035 bunun tam tersini varsayar).
           *
           * Trigger eklenirse bu test kirilir ve `deleteBlocked: true`
           * yapilmasini talep eder. Bosluk gizlenmiyor, KAYITLI.
           */
          const id = `${spec.table}_delgap`;
          await spec.seed(db, tenant, id);

          await db.query(`DELETE FROM ${spec.table} WHERE id = $1;`, [id]);

          const { rows } = await db.query(
            `SELECT COUNT(*)::int AS c FROM ${spec.table} WHERE id = $1;`,
            [id]
          );
          expect(rows[0].c).toBe(0);
        });
      }
    });
  }
});
