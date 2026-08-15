import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createIntegrationDb, type IntegrationDb } from "./setup";
import { loadMigrations } from "@y/db";
import { resolve } from "node:path";

/**
 * P19 / T3 — MIGRATION FRESH + UPGRADE.
 *
 * Spec §30: *"Fresh migration ve upgrade migration ikisi de test
 * edilmelidir."*
 *
 * Bugüne kadar doğrulanan tek şey migration dosyalarının **varlığı ve
 * konumu**ydu; uygulanabilirliği değil. Bu, 83 migration'ın hiç
 * çalıştırılmadığı anlamına geliyordu.
 *
 * ## Neden iki yol ayrı ayrı
 *
 * Fresh geçip upgrade kırılabilir. Bir migration `CREATE TABLE IF NOT
 * EXISTS` kullanıyorsa, boş bir veritabanında tabloyu kurar; mevcut bir
 * veritabanında ise **sessizce eskisini korur** ve şema sapması üretir.
 * Bu sapma yalnız upgrade yolunda ortaya çıkar.
 */

const MIGRATIONS_DIR = resolve(import.meta.dirname, "../../migrations");

describe("fresh migration — boş veritabanına tümü", () => {
  let db: IntegrationDb;

  beforeAll(async () => {
    db = await createIntegrationDb("migrations-fresh.spec.ts");
  });

  afterAll(async () => {
    await db?.close();
  });

  it("83 migration'ın tamamı uygulanır", async () => {
    const result = await db.migrate();
    const onDisk = loadMigrations(MIGRATIONS_DIR);

    expect(result.total).toBe(onDisk.length);
    expect(result.applied).toHaveLength(onDisk.length);
    expect(onDisk.length).toBeGreaterThanOrEqual(83);
  });

  it("ikinci çalıştırma HİÇBİR migration uygulamaz (idempotent)", async () => {
    // Idempotent olmayan bir runner, her dagitimda migration'lari
    // yeniden uygular ve veri kaybina yol acar.
    const result = await db.migrate();
    expect(result.applied).toEqual([]);
  });

  it("ledger uygulanan her migration'ı kaydeder", async () => {
    const { rows } = await db.query(
      "SELECT version FROM schema_migrations ORDER BY version;"
    );
    const onDisk = loadMigrations(MIGRATIONS_DIR);
    expect(rows.length).toBe(onDisk.length);

    // Ledger DOSYA NUMARASINI degil `-- Ledger version:` dizesini saklar.
    // Kaydedilen her surumun diskte bir karsiligi olmali; aksi halde
    // ledger ile dosyalar ayrisir ve "hangi migration uygulandi" sorusu
    // cevapsiz kalir.
    const diskVersions = new Set(onDisk.map((m) => m.version));
    const orphans = rows
      .map((r: { version: string }) => r.version)
      .filter((v: string) => !diskVersions.has(v));
    expect(orphans, `Ledger'da olup diskte olmayan: ${orphans.join(", ")}`).toEqual([]);
  });

  it("kanonik tablolar GERÇEKTEN oluştu", async () => {
    // Spec §30'un kanonik alan listesinden ornekler. Sema dosyasinda
    // "CREATE TABLE" yazmasi, tablonun olustugunu KANITLAMAZ — sozdizimi
    // hatasi ya da bagimlilik sirasi hatasi migration'i durdurabilir.
    const expected = [
      "users", "organizations", "projects", "repositories",
      "files", "symbols", "chunks", "graph_nodes", "graph_edges",
      "runs", "run_events", "jobs", "evidence_records", "evidence_chain",
      "cas_blobs", "policy_rules", "approval_requests", "retention_policies"
    ];
    const { rows } = await db.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = $1;",
      [db.schema]
    );
    const actual = new Set(rows.map((r: { tablename: string }) => r.tablename));
    const missing = expected.filter((t) => !actual.has(t));
    expect(missing, `Eksik tablolar: ${missing.join(", ")}`).toEqual([]);
  });

  it("pgvector kolonu GERÇEKTEN vector tipinde", async () => {
    // `vector(1536)` yazan bir migration, eklenti yuklu degilse patlar.
    // Bu test eklentinin ve kolonun birlikte calistigini kanitlar.
    const { rows } = await db.query(
      `SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS type
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND format_type(a.atttypid, a.atttypmod) LIKE 'vector%'
        LIMIT 5;`,
      [db.schema]
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("terminal run geçişini engelleyen trigger KURULU", async () => {
    // ADR-047: terminal durumlar geri alinamaz ve kural VERITABANINDA
    // zorlanir. Trigger yoksa kural yalniz uygulama katmanindadir ve
    // dogrudan SQL ile atlanabilir.
    const { rows } = await db.query(
      `SELECT tgname FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND NOT t.tgisinternal;`,
      [db.schema]
    );
    const names = rows.map((r: { tgname: string }) => r.tgname).join(" ");
    expect(names).toContain("terminal");
  });
});

describe("upgrade migration — mevcut şema üzerine", () => {
  let db: IntegrationDb;

  beforeAll(async () => {
    db = await createIntegrationDb("migrations-upgrade.spec.ts");
  });

  afterAll(async () => {
    await db?.close();
  });

  it("ilk yarı → ikinci yarı sırasıyla uygulanır", async () => {
    const all = loadMigrations(MIGRATIONS_DIR);
    const half = Math.floor(all.length / 2);

    // Ilk yariyi elle uygula: runner "hepsini ya da hicbirini" mantigiyla
    // calisiyor, bu yuzden ara durumu kendimiz kuruyoruz.
    await db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        version VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );`);

    for (const migration of all.slice(0, half)) {
      await db.query(migration.up);
      await db.query("INSERT INTO schema_migrations (version) VALUES ($1);", [
        migration.version
      ]);
    }

    const { rows: before } = await db.query("SELECT COUNT(*)::int AS c FROM schema_migrations;");
    expect(before[0].c).toBe(half);

    // Simdi runner kalan yariyi uygulamali.
    const result = await db.migrate();
    expect(result.applied).toHaveLength(all.length - half);

    const { rows: after } = await db.query("SELECT COUNT(*)::int AS c FROM schema_migrations;");
    expect(after[0].c).toBe(all.length);
  });

  it("upgrade sonrası şema fresh ile AYNI tablo kümesini verir", async () => {
    // Iki yolun ayrismasi, bu projede en sinsi hata sinifidir: fresh
    // kurulum ile mevcut kurulum farkli sema tasir ve fark ancak
    // uretimde ortaya cikar.
    const fresh = await createIntegrationDb("migrations-parity.spec.ts");
    try {
      await fresh.migrate();

      const tableSet = async (d: IntegrationDb) => {
        const { rows } = await d.query(
          "SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename;",
          [d.schema]
        );
        return rows.map((r: { tablename: string }) => r.tablename);
      };

      expect(await tableSet(db)).toEqual(await tableSet(fresh));
    } finally {
      await fresh.close();
    }
  });
});

describe("geri alma (`-- +down`)", () => {
  let db: IntegrationDb;

  beforeAll(async () => {
    db = await createIntegrationDb("migrations-down.spec.ts");
    await db.migrate();
  });

  afterAll(async () => {
    await db?.close();
  });

  it("en son migration'ın down'ı GERÇEKTEN geri alır", async () => {
    /*
     * Yazilmis ama denenmemis bir geri alma, en cok ihtiyac duyuldugu
     * anda patlar.
     *
     * Hedef tablo SABIT YAZILMAZ, son migration'in `-- +down` metninden
     * TURETILIR. Ilk yazimimda `retention_policies` sabitti ve bir sonraki
     * migration eklenince test kirildi — sabit yazmak, her migration'da
     * testi guncellemeyi gerektirir ve o guncelleme unutulur.
     */
    const all = loadMigrations(MIGRATIONS_DIR);
    const last = all[all.length - 1];
    expect(last.down, `${last.version} down bolumu yok`).toBeTruthy();

    const dropped = [...last.down!.matchAll(/DROP TABLE IF EXISTS ([a-z_]+)/gi)].map(
      (m) => m[1]
    );
    expect(dropped.length, `${last.version} down'inda DROP TABLE yok`).toBeGreaterThan(0);

    const exists = async (table: string) => {
      const { rows } = await db.query(
        `SELECT COUNT(*)::int AS c FROM pg_tables
          WHERE schemaname = $1 AND tablename = $2;`,
        [db.schema, table]
      );
      return rows[0].c > 0;
    };

    for (const table of dropped) {
      expect(await exists(table), `${table} migration sonrasi olmaliydi`).toBe(true);
    }

    await db.query(last.down!);

    for (const table of dropped) {
      expect(await exists(table), `${table} down sonrasi kalmamaliydi`).toBe(false);
    }
  });
});
