/**
 * P19 / T2 — ENTEGRASYON TESTİ ALTYAPISI.
 *
 * ## Neden ayrı bir altyapı
 *
 * Bugüne kadarki DB testleri sorgunun **şeklini** doğruluyordu (tenant
 * predikatı var mı, firewall ön-filtre mi) — sonucunu değil. Bu ayrım her
 * test dosyasının başında yazılıdır ve dürüsttü, ama eksikti: doğru
 * yazılmış bir sorgu yanlış sonuç verebilir.
 *
 * ## Karar 1 — DB yoksa SESSİZCE ATLAMA, AÇIKÇA HATA VER
 *
 * spec §37 "DB yoksa skip + pass" kalıbını açıkça yasaklıyor. Atlanan bir
 * entegrasyon testi, CI'da yeşil görünür ve hiçbir şey doğrulamaz — yani
 * olmamasından daha kötüdür, çünkü var sanılır.
 *
 * ## Karar 2 — her test dosyası KENDİ ŞEMASINDA
 *
 * Paylaşılan bir şema, paralel testleri birbirine bağımlı yapar: bir
 * testin yazdığı satır diğerinin sayımını bozar. Daha kötüsü, tek başına
 * çalışan test ile suite içinde çalışan test **farklı sonuç verir** ve bu
 * fark ancak CI'da ortaya çıkar.
 *
 * Şema izolasyonu, veritabanını her testte yeniden kurmaktan çok daha
 * hızlıdır (83 migration × N dosya yerine şema başına bir kez).
 */

import { Pool, type PoolClient } from "pg";
import { runMigrations } from "@y/db";
import { resolve } from "node:path";

const MIGRATIONS_DIR = resolve(import.meta.dirname, "../../migrations");

export class IntegrationDbUnavailableError extends Error {
  readonly code = "INTEGRATION_DB_UNAVAILABLE";
  constructor(detail: string) {
    super(
      `Entegrasyon veritabanina baglanilamadi: ${detail}\n\n` +
        "  Bu test SESSIZCE ATLANMAZ (spec §37: 'DB yoksa skip + pass' yasak).\n" +
        "  Baslatmak icin: npm run db:test:up\n" +
        `  Beklenen: ${maskUrl(databaseUrl())}`
    );
    this.name = "IntegrationDbUnavailableError";
  }
}

function databaseUrl(): string {
  return (
    process.env.DATABASE_URL ??
    "postgresql://postgres:y_test_local@127.0.0.1:5433/y_test"
  );
}

/** Hata mesajinda parola gorunmez (ADR-051 ile ayni disiplin). */
function maskUrl(url: string): string {
  return url.replace(/:\/\/([^:]+):[^@]+@/, "://$1:***@");
}

/**
 * Şema adı test dosyasından türetilir.
 *
 * Rastgele bir ad, başarısız bir koşudan sonra hangi şemanın kime ait
 * olduğunu anlaşılmaz kılardı. Dosya adı, artık kalan şemayı doğrudan
 * suçlusuna bağlar.
 */
export function schemaNameFor(testFile: string): string {
  const base = testFile
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    .replace(/\.(spec|test)\.ts$/, "")
    .replace(/[^a-z0-9]/gi, "_")
    .toLowerCase();
  return `it_${base}`;
}

export interface IntegrationDb {
  readonly pool: Pool;
  readonly schema: string;
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
  /** Migration'ları bu şemaya uygular. */
  migrate(): Promise<{ applied: string[]; total: number }>;
  /** Tüm tabloları boşaltır — şemayı düşürmeden. */
  truncateAll(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Bağlantıyı kurar ve şemayı hazırlar.
 *
 * `search_path` **havuz düzeyinde** ayarlanır (`options`), her bağlantıda
 * ayrı ayrı değil: havuz yeni bir bağlantı açtığında ayarı unutması,
 * testin sessizce `public` şemasına yazmasına yol açardı.
 */
export async function createIntegrationDb(testFile: string): Promise<IntegrationDb> {
  const schema = schemaNameFor(testFile);
  const url = databaseUrl();

  const pool = new Pool({
    connectionString: url,
    // Havuz duzeyinde search_path: yeni acilan her baglanti da ayni
    // semayi gorur.
    options: `-c search_path=${schema},public`,
    max: 4,
    // Baglanti kurulamiyorsa UZUN SURE BEKLEME: hizli ve acik hata,
    // yavas ve belirsiz hatadan iyidir.
    connectionTimeoutMillis: 5_000
  });

  try {
    const probe = await pool.connect();
    try {
      await probe.query("SELECT 1;");
    } finally {
      probe.release();
    }
  } catch (error) {
    await pool.end().catch(() => {});
    throw new IntegrationDbUnavailableError(
      error instanceof Error ? error.message : String(error)
    );
  }

  // Sema sifirdan: onceki kosudan kalan durum, testi gecmis bir kosuya
  // bagimli yapar.
  await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE;`);
  await pool.query(`CREATE SCHEMA ${schema};`);
  /*
   * Eklentiler ACIKCA `public` semasina kurulur.
   *
   * Eklentiler VERITABANI kapsamlidir, sema degil. `SCHEMA public`
   * yazilmazsa eklenti `search_path`'in ILK semasina — yani o anki test
   * semasina — kurulur. Sonraki test semalari `IF NOT EXISTS`'i "zaten
   * var" diye gorup atlar, ama `gin_trgm_ops` operator sinifi onlarin
   * search_path'inde OLMAZ.
   *
   * Belirti: ikinci test semasinda
   *   operator class "gin_trgm_ops" does not exist for access method "gin"
   *
   * `public` her semanin search_path'inde oldugu icin buraya kurmak
   * hepsini ayni anda cozer.
   */
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector SCHEMA public;");
  await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public;");

  const db: IntegrationDb = {
    pool,
    schema,

    async query(sql, params) {
      return pool.query(sql, params as any[]);
    },

    async migrate() {
      const result = await runMigrations(
        {
          async connect(): Promise<PoolClient & { release(): void }> {
            const client = await pool.connect();
            // Migration'lar bu semaya uygulanmali; runner search_path'i
            // kendisi ayarlamiyor.
            await client.query(`SET search_path TO ${schema}, public;`);
            return client as PoolClient & { release(): void };
          }
        },
        { migrationsDir: MIGRATIONS_DIR }
      );
      return { applied: result.applied, total: result.total };
    },

    async truncateAll() {
      const { rows } = await pool.query<{ tablename: string }>(
        "SELECT tablename FROM pg_tables WHERE schemaname = $1;",
        [schema]
      );
      if (rows.length === 0) return;
      const list = rows.map((r) => `${schema}.${r.tablename}`).join(", ");
      // RESTART IDENTITY: dizi sayaclari da sifirlanir, yoksa id'ler
      // testler arasinda kayar ve beklenen deger yazmak imkansizlasir.
      await pool.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE;`);
    },

    async close() {
      await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE;`);
      await pool.end();
    }
  };

  return db;
}
