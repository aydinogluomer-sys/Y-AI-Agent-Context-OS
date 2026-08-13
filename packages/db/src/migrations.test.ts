/**
 * P01 / Y-P01-004 + Y-P01-005 — Migration göçünün doğrulanması.
 *
 * En kritik test: `migrations/*.sql` içeriği, `apps/api/src/db.ts` içindeki
 * inline `migrationVersions` dizisiyle **anlamsal olarak birebir** olmalı.
 * Tek bir kolon farkı bile fresh/upgrade şema paritesini bozar ve bunu
 * ancak gerçek bir veritabanında fark ederiz — o yüzden burada yakalıyoruz.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { loadMigrations, splitDirections, MigrationLoadError } from "./loader";
import { runMigrations, detectLedgerDrift, type Queryable, type QueryableClient } from "./runner";
import baseline from "./__fixtures__/migration-baseline.json" with { type: "json" };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const MIGRATIONS_DIR = path.join(ROOT, "migrations");

/** SQL'i anlamsal karşılaştırma için normalize eder (yalnız boşluk farkını yok sayar). */
function normalizeSql(sql: string): string {
  return sql
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

describe("migration dosyaları", () => {
  const loaded = loadMigrations(MIGRATIONS_DIR);

  it("en az göç edilen 35 migration mevcut", () => {
    // Yeni migration'lar ADDITIVE eklenir; alt sinir baseline'dir.
    expect(loaded.length).toBeGreaterThanOrEqual(baseline.count);
  });

  it("sıra numaraları boşluksuz ve artan", () => {
    loaded.forEach((m, i) => expect(m.ordinal).toBe(i + 1));
  });

  it("ledger version'ları benzersiz", () => {
    const versions = loaded.map((m) => m.version);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("her dosyanın dolu bir -- +up bölümü var", () => {
    for (const m of loaded) {
      expect(m.up.length, `${m.fileName} bos`).toBeGreaterThan(0);
    }
  });
});

/**
 * ADR-003 goc guvencesi.
 *
 * Goc, `apps/api/src/db.ts` icindeki inline diziyi sildi. Parite garantisinin
 * KALICI olmasi icin goc anindaki orijinal SQL'in SHA-256 hash'leri
 * `__fixtures__/migration-baseline.json` icinde dondurulmustur
 * (uretici: scripts/audit/freeze-migration-baseline.ts).
 *
 * Bir migration dosyasi elle degistirilirse bu testler kirilir.
 */
describe("dondurulmus baseline ↔ dosya paritesi (ADR-003 göç güvencesi)", () => {
  const loaded = loadMigrations(MIGRATIONS_DIR);

  it("göç edilen ilk N migration korunmuş", () => {
    expect(loaded.length).toBeGreaterThanOrEqual(baseline.count);
  });

  it("ledger version sırası ilk N'de birebir aynı", () => {
    // Baseline yalniz goc edilen migration'lari kapsar; sonrasi yeni istir.
    expect(loaded.slice(0, baseline.count).map((m) => m.version)).toEqual(
      baseline.migrations.map((m) => m.version)
    );
  });

  it("göç edilen her migration'ın SQL içeriği hash düzeyinde birebir aynı", () => {
    for (let i = 0; i < baseline.migrations.length; i++) {
      const actual = createHash("sha256").update(normalizeSql(loaded[i].up), "utf-8").digest("hex");
      expect(actual, `${loaded[i].fileName} icerigi goc anindakinden sapmis`).toBe(
        baseline.migrations[i].sha256
      );
    }
  });

  it("baseline fixture'ı göç kaynağını belgeler", () => {
    expect(baseline.sourceFile).toBe("apps/api/src/db.ts");
    expect(baseline.generatedBy).toContain("freeze-migration-baseline");
  });

  it("MAPPING.md her migration'ı listeler", () => {
    const mapping = fs.readFileSync(path.join(MIGRATIONS_DIR, "MAPPING.md"), "utf-8");
    for (const m of loaded) {
      expect(mapping, `${m.version} eslemede yok`).toContain(m.version);
    }
  });
});

describe("splitDirections", () => {
  it("+up ve +down bölümlerini ayırır", () => {
    const { up, down } = splitDirections("-- +up\nCREATE TABLE a();\n-- +down\nDROP TABLE a;");
    expect(up).toBe("CREATE TABLE a();");
    expect(down).toBe("DROP TABLE a;");
  });

  it("yalnız yorumdan oluşan +down bölümünü null sayar", () => {
    const { down } = splitDirections("-- +up\nCREATE TABLE a();\n-- +down\n-- tanimlanmadi");
    expect(down).toBeNull();
  });

  it("+up yoksa hata fırlatır", () => {
    expect(() => splitDirections("CREATE TABLE a();")).toThrow(MigrationLoadError);
  });
});

// ---------------------------------------------------------------------------
// Runner davranışı — sahte ama DÜRÜST bir Postgres istemcisiyle.
// Bu mock SQL çalıştırmaz; yalnız runner'ın protokolünü (lock/begin/commit/
// ledger) doğrular. Gerçek şema doğrulaması P19'da testcontainers ile
// integration testinde yapılır ve orada mock'a düşüş YOKTUR.
// ---------------------------------------------------------------------------

interface FakeState {
  ledger: Set<string>;
  calls: string[];
  failOn?: string;
}

function createFakePool(state: FakeState): Queryable {
  const client: QueryableClient = {
    async query(sql: string, params?: unknown[]) {
      const head = sql.trim().split(/\s+/).slice(0, 2).join(" ").toUpperCase();
      state.calls.push(head);

      if (state.failOn && sql.includes(state.failOn)) {
        throw new Error(`simulated failure on ${state.failOn}`);
      }
      if (/SELECT version FROM schema_migrations/i.test(sql)) {
        return { rows: [...state.ledger].map((v) => ({ version: v })), rowCount: state.ledger.size };
      }
      if (/INSERT INTO schema_migrations/i.test(sql)) {
        state.ledger.add(String(params?.[0]));
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {}
  };
  return { async connect() { return client; } };
}

describe("runMigrations", () => {
  const TOTAL = loadMigrations(MIGRATIONS_DIR).length;

  it("boş ledger'da tüm migration'ları uygular", async () => {
    const state: FakeState = { ledger: new Set(), calls: [] };
    const res = await runMigrations(createFakePool(state), { migrationsDir: MIGRATIONS_DIR });
    expect(res.applied.length).toBe(TOTAL);
    expect(res.skipped.length).toBe(0);
    expect(state.ledger.size).toBe(TOTAL);
  });

  it("ikinci çalıştırma no-op (idempotent)", async () => {
    const state: FakeState = { ledger: new Set(), calls: [] };
    await runMigrations(createFakePool(state), { migrationsDir: MIGRATIONS_DIR });
    const second = await runMigrations(createFakePool(state), { migrationsDir: MIGRATIONS_DIR });
    expect(second.applied.length).toBe(0);
    expect(second.skipped.length).toBe(TOTAL);
  });

  it("kısmen uygulanmış ledger'da yalnız eksikleri uygular", async () => {
    const partial = loadMigrations(MIGRATIONS_DIR).slice(0, 10).map((m) => m.version);
    const state: FakeState = { ledger: new Set(partial), calls: [] };
    const res = await runMigrations(createFakePool(state), { migrationsDir: MIGRATIONS_DIR });
    expect(res.skipped.length).toBe(10);
    expect(res.applied.length).toBe(TOTAL - 10);
  });

  it("advisory lock alır ve bırakır", async () => {
    const state: FakeState = { ledger: new Set(), calls: [] };
    await runMigrations(createFakePool(state), { migrationsDir: MIGRATIONS_DIR });
    const joined = state.calls.join(" ");
    expect(joined).toContain("SELECT PG_ADVISORY_LOCK($1);");
    expect(joined).toContain("SELECT PG_ADVISORY_UNLOCK($1);");
  });

  it("tek transaction içinde çalışır ve başarıda COMMIT eder", async () => {
    const state: FakeState = { ledger: new Set(), calls: [] };
    await runMigrations(createFakePool(state), { migrationsDir: MIGRATIONS_DIR });
    expect(state.calls).toContain("BEGIN;");
    expect(state.calls).toContain("COMMIT;");
    expect(state.calls).not.toContain("ROLLBACK;");
  });

  it("hata durumunda ROLLBACK eder ve hatayı yutmaz", async () => {
    const state: FakeState = { ledger: new Set(), calls: [], failOn: "CREATE TABLE IF NOT EXISTS tasks" };
    await expect(
      runMigrations(createFakePool(state), { migrationsDir: MIGRATIONS_DIR })
    ).rejects.toThrow(/simulated failure/);
    expect(state.calls).toContain("ROLLBACK;");
  });

  it("dry-run modunda ledger'a yazmaz", async () => {
    const state: FakeState = { ledger: new Set(), calls: [] };
    const res = await runMigrations(createFakePool(state), { migrationsDir: MIGRATIONS_DIR, dryRun: true });
    expect(res.applied.length).toBe(TOTAL);
    expect(state.ledger.size).toBe(0);
    expect(state.calls).toContain("ROLLBACK;");
  });
});

describe("detectLedgerDrift", () => {
  it("dosyası olmayan ledger kaydını tespit eder", async () => {
    const state: FakeState = { ledger: new Set(["9.9.9-hayali-migration"]), calls: [] };
    const drift = await detectLedgerDrift(createFakePool(state), MIGRATIONS_DIR);
    expect(drift.orphanedInLedger).toContain("9.9.9-hayali-migration");
  });

  it("ledger'da olmayan dosyaları tespit eder", async () => {
    const state: FakeState = { ledger: new Set(), calls: [] };
    const drift = await detectLedgerDrift(createFakePool(state), MIGRATIONS_DIR);
    expect(drift.missingFromLedger.length).toBe(loadMigrations(MIGRATIONS_DIR).length);
  });
});
