/**
 * P01 / Y-P01-005 — Dosya tabanlı migration runner.
 *
 * Eski runner (`apps/api/src/db.ts:runMigrations`) inline dizi üzerinde
 * çalışıyordu ve iki eksiği vardı:
 *   1. Eşzamanlı çalıştırmaya karşı koruma yok (iki instance aynı anda
 *      boot ederse aynı migration iki kez uygulanabilir).
 *   2. `MockDatabaseConnector.runMigrations()` migration'ları "uygulanmış"
 *      sayıp canned bir liste döndürüyordu — testlerin yanlış yeşil
 *      vermesinin kaynaklarından biri.
 *
 * Bu runner:
 *   - `pg_advisory_lock` ile serileştirir,
 *   - tek transaction içinde uygular, hata durumunda tamamen geri alır,
 *   - ledger'da olan migration'ları atlar (idempotent),
 *   - `schema_migrations` şemasını bozmadan aynı anahtarı kullanır.
 */

import { loadMigrations, type LoadedMigration } from "./loader";

/** `pg` Pool/Client'ın ihtiyacımız olan minimum yüzeyi. */
export interface QueryableClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
  release?(): void;
}

export interface Queryable {
  connect(): Promise<QueryableClient>;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
  total: number;
}

/** Aynı veritabanına karşı eşzamanlı runner'ları serileştiren sabit kilit anahtarı. */
const ADVISORY_LOCK_KEY = 0x59_4d_49_47; // "YMIG"

/**
 * Ledger şeması, `apps/api/src/db.ts`'teki mevcut tanımla BİREBİR aynıdır.
 * Farklı bir tanım kullanmak, halihazırda migrate edilmiş veritabanlarında
 * `CREATE TABLE IF NOT EXISTS` sessizce eskisini koruyacağı için fresh ve
 * upgrade yolları arasında sinsi bir şema sapması üretirdi.
 */
const LEDGER_DDL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    version VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );
`;

export interface RunOptions {
  migrationsDir: string;
  /** Yalnız hangi migration'ların uygulanacağını raporla, uygulama. */
  dryRun?: boolean;
  logger?: (message: string) => void;
}

export async function runMigrations(pool: Queryable, options: RunOptions): Promise<MigrationResult> {
  const { migrationsDir, dryRun = false, logger = () => {} } = options;
  const migrations = loadMigrations(migrationsDir);

  const client = await pool.connect();
  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    // Kilit transaction DIŞINDA alınır ki ledger okuması da korunsun.
    await client.query("SELECT pg_advisory_lock($1);", [ADVISORY_LOCK_KEY]);

    await client.query("BEGIN;");
    await client.query(LEDGER_DDL);

    const existing = await client.query("SELECT version FROM schema_migrations;");
    const appliedVersions = new Set<string>(existing.rows.map((r: any) => r.version));

    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) {
        skipped.push(migration.version);
        continue;
      }

      if (dryRun) {
        applied.push(migration.version);
        logger(`[dry-run] uygulanacak: ${migration.fileName} (${migration.version})`);
        continue;
      }

      logger(`uygulanıyor: ${migration.fileName} (${migration.version})`);
      await client.query(migration.up);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1);", [migration.version]);
      applied.push(migration.version);
    }

    if (dryRun) {
      await client.query("ROLLBACK;");
    } else {
      await client.query("COMMIT;");
    }

    return { applied, skipped, total: migrations.length };
  } catch (error) {
    await client.query("ROLLBACK;").catch(() => {
      /* rollback hatası orijinal hatayı gizlemesin */
    });
    throw error;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1);", [ADVISORY_LOCK_KEY]).catch(() => {});
    client.release?.();
  }
}

/** Ledger'da kayıtlı ama dosyası olmayan migration'ları bulur (drift). */
export async function detectLedgerDrift(
  pool: Queryable,
  migrationsDir: string
): Promise<{ orphanedInLedger: string[]; missingFromLedger: string[] }> {
  const migrations: LoadedMigration[] = loadMigrations(migrationsDir);
  const fileVersions = new Set(migrations.map((m) => m.version));

  const client = await pool.connect();
  try {
    await client.query(LEDGER_DDL);
    const res = await client.query("SELECT version FROM schema_migrations;");
    const ledgerVersions = new Set<string>(res.rows.map((r: any) => r.version));

    return {
      orphanedInLedger: [...ledgerVersions].filter((v) => !fileVersions.has(v)),
      missingFromLedger: [...fileVersions].filter((v) => !ledgerVersions.has(v))
    };
  } finally {
    client.release?.();
  }
}
