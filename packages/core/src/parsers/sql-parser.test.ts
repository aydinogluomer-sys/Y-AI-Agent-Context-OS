import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SqlParser } from "./sql-parser";
import { createDefaultRegistry } from "./registry";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = resolve(HERE, "../../../../migrations");

const parser = new SqlParser();
const opts = { filePath: "migrations/0001_init.sql" };

/**
 * P17 / A7 — spec §6 SQL desteği.
 *
 * `.sql` dosyaları `detectLanguage`'da `"sql"` dönüyordu ama hiçbir parser
 * bu dili sahiplenmiyordu; yapısal parser'a düşüp **hiç sembol
 * üretmiyorlardı**. Bu üründe `schema` ve `migration` birinci sınıf sembol
 * tipleri (spec §6) ve depoda 82 migration dosyası var.
 */
describe("SqlParser — DDL sembolleri", () => {
  it("CREATE TABLE tanır", async () => {
    const result = await parser.parse("CREATE TABLE users (id TEXT PRIMARY KEY);", opts);
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].symbolName).toBe("users");
    expect(result.symbols[0].symbolType).toBe("schema");
  });

  it("IF NOT EXISTS ve şema öneki ile çalışır", async () => {
    const sql = 'CREATE TABLE IF NOT EXISTS public."user" (id TEXT);';
    const result = await parser.parse(sql, opts);
    // Tirnaklar normalize edilir; edilmezse ad `public."user"` olur ve
    // graph'ta ayni tabloya iki farkli dugum uretir.
    expect(result.symbols[0].symbolName).toBe("public.user");
  });

  it("INDEX, VIEW, TYPE, FUNCTION, TRIGGER tanır", async () => {
    const sql = [
      "CREATE UNIQUE INDEX idx_users_email ON users (email);",
      "CREATE MATERIALIZED VIEW active_users AS SELECT * FROM users;",
      "CREATE TYPE run_state AS ENUM ('queued');",
      "CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$ BEGIN RETURN NEW; END; $$ LANGUAGE plpgsql;",
      "CREATE TRIGGER trg_touch BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION touch_updated_at();"
    ].join("\n");
    const names = (await parser.parse(sql, opts)).symbols.map((s) => s.symbolName);
    expect(names).toEqual([
      "idx_users_email",
      "active_users",
      "run_state",
      "touch_updated_at",
      "trg_touch"
    ]);
  });

  it("ALTER ve DROP `migration` olarak işaretlenir", async () => {
    const sql = "ALTER TABLE users ADD COLUMN age INT;\nDROP INDEX IF EXISTS idx_old;";
    const result = await parser.parse(sql, opts);
    expect(result.symbols.map((s) => s.symbolType)).toEqual(["migration", "migration"]);
  });

  it("yorum ve boş satır sembol ÜRETMEZ", async () => {
    const sql = "-- CREATE TABLE fake (id TEXT);\n\n-- baska yorum\n";
    expect((await parser.parse(sql, opts)).symbols).toEqual([]);
  });
});

describe("ifade sınırı — `;` her zaman bitirmez", () => {
  it("dolar işaretli gövde içindeki `;` ifadeyi BİTİRMEZ", async () => {
    // Fonksiyon govdesindeki ilk `;`'de kesmek, sembol sinirini yanlis
    // uretir ve chunk'lar yarim fonksiyon tasir (ADR-020 ihlali).
    const sql = [
      "CREATE FUNCTION f() RETURNS trigger AS $$",
      "BEGIN",
      "  NEW.updated_at = NOW();",
      "  RETURN NEW;",
      "END;",
      "$$ LANGUAGE plpgsql;"
    ].join("\n");
    const [symbol] = (await parser.parse(sql, opts)).symbols;
    expect(symbol.startLine).toBe(1);
    expect(symbol.endLine).toBe(6);
    expect(symbol.text).toContain("RETURN NEW");
  });

  it("string sabiti içindeki `;` ifadeyi BİTİRMEZ", async () => {
    const sql = [
      "CREATE TABLE t (",
      "  note TEXT DEFAULT 'a;b'",
      ");"
    ].join("\n");
    const [symbol] = (await parser.parse(sql, opts)).symbols;
    expect(symbol.endLine).toBe(3);
  });

  it("satır sonu yorumundaki `;` ifadeyi BİTİRMEZ", async () => {
    const sql = ["CREATE TABLE t (", "  id TEXT -- not a; terminator", ");"].join("\n");
    const [symbol] = (await parser.parse(sql, opts)).symbols;
    expect(symbol.endLine).toBe(3);
  });

  it("bayt ofsetleri metinle tutarlı", async () => {
    const sql = "-- header\nCREATE TABLE users (id TEXT);\n";
    const [symbol] = (await parser.parse(sql, opts)).symbols;
    const slice = Buffer.from(sql, "utf-8")
      .subarray(symbol.startByte, symbol.endByte)
      .toString("utf-8");
    expect(slice).toBe(symbol.text);
  });
});

describe("confidence ÖLÇÜLÜR (ADR-021)", () => {
  it("yapısal yöntem bildirilir ve confidence ona göre düşer", async () => {
    const result = await parser.parse("CREATE TABLE t (id TEXT);", opts);
    expect(result.confidenceBasis.method).toBe("structural");
    // Yapisal taban 0.55; AST (1.0) ile ayni guveni hak etmez.
    expect(result.confidence).toBeLessThan(0.6);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("DDL bulunamazsa SESSİZ KALMAZ, uyarı üretir", async () => {
    const result = await parser.parse("SELECT * FROM users;", opts);
    expect(result.symbols).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].severity).toBe("warning");
  });

  it("boş dosya uyarı ÜRETMEZ", async () => {
    expect((await parser.parse("\n\n", opts)).diagnostics).toEqual([]);
  });
});

describe("registry entegrasyonu", () => {
  it("sql artık yapısal fallback'e DÜŞMÜYOR", async () => {
    const registry = createDefaultRegistry();
    expect(registry.supports("sql")).toBe(true);
    expect(registry.parserFor("sql").id).toBe("sql-structural");
  });
});

describe("gerçek migration dosyaları üzerinde", () => {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));

  it("POZİTİF KONTROL: migration dizini gerçekten okunuyor", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("depodaki migration'ların büyük çoğunluğu sembol üretir", async () => {
    let withSymbols = 0;
    let totalSymbols = 0;

    for (const file of files) {
      const source = readFileSync(join(MIGRATIONS, file), "utf-8");
      const result = await parser.parse(source, { filePath: `migrations/${file}` });
      if (result.symbols.length > 0) withSymbols++;
      totalSymbols += result.symbols.length;
    }

    // Onceki durum SIFIRDI: hicbir migration sembol uretmiyordu.
    expect(withSymbols).toBeGreaterThan(files.length * 0.8);
    expect(totalSymbols).toBeGreaterThan(100);
  });
});
