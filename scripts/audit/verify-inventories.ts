/**
 * Y-P00-011 / Y-P19-010 — Drift detector.
 *
 * Envanter CSV'lerinin kaynak kodla hâlâ tutarlı olduğunu doğrular.
 * P00 exit gate'i ve ileride CI gate'i (P19).
 *
 * exit 0 = envanter güncel · exit 1 = drift var, envanteri yeniden üret.
 */

import * as fs from "fs";
import * as path from "path";
import { REPO_ROOT, readCsv, readLines, walk } from "./lib";
import { collectRoutes } from "./inventory-api";
import { collectNavItems } from "./inventory-ui";

interface Check {
  name: string;
  expected: number | string;
  actual: number | string;
  ok: boolean;
  detail?: string;
}

const checks: Check[] = [];

function check(name: string, expected: number | string, actual: number | string, detail?: string): void {
  checks.push({ name, expected, actual, ok: expected === actual, detail });
}

function main(): void {
  // --- API envanteri ---
  const apiCsv = readCsv("02-api-inventory.csv").slice(1).filter((r) => r.length > 1);
  const apiLive = collectRoutes();
  check("API route sayısı (CSV vs kaynak)", apiLive.length, apiCsv.length);

  const csvShadowed = apiCsv.filter((r) => r[5]).length;
  const liveShadowed = apiLive.filter((r) => r.shadowedBy).length;
  check("Gölgelenmiş route sayısı", liveShadowed, csvShadowed, "router.all(/tasks/*) blocker'ı");

  // --- UI envanteri ---
  const uiCsv = readCsv("03-ui-inventory.csv").slice(1).filter((r) => r.length > 1);
  const uiLive = collectNavItems();
  check("Nav item sayısı (CSV vs kaynak)", uiLive.length, uiCsv.length);

  const csvReal = uiCsv.filter((r) => r[7] === "REAL").length;
  const liveReal = uiLive.filter((i) => i.verdict === "REAL").length;
  check("Gerçek API'ye bağlı ekran sayısı", liveReal, csvReal);

  // App.tsx `case` sayısı: kendi ekranı olan item sayısı.
  // REAL'den fazla olabilir — `case` sahibi olup yine de backend'e gitmeyen
  // ekranlar var (chat-cockpit). Bu fark bilinçli olarak izlenir.
  const appLines = readLines(path.join(REPO_ROOT, "apps", "web", "src", "App.tsx"));
  const caseCount = appLines.filter((l) => /case\s+"[^"]+"\s*:/.test(l)).length;
  const csvWithOwnScreen = uiCsv.filter((r) => r[5] !== "ModuleSimulationPanel").length;
  check("App.tsx `case` sayısı = kendi ekranı olan item", caseCount, csvWithOwnScreen, "eşleşmezse switch/nav sapması var");

  // --- DB envanteri (P01/ADR-003 sonrasi migrations/*.sql kaynakli) ---
  const dbCsv = readCsv("04-db-inventory.csv").slice(1).filter((r) => r.length > 1);
  const migrationsDir = path.join(REPO_ROOT, "migrations");
  const createStatements = new Set<string>();
  const sqlFileList = fs.existsSync(migrationsDir)
    ? fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"))
    : [];
  for (const f of sqlFileList) {
    for (const line of readLines(path.join(migrationsDir, f))) {
      const m = /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([A-Za-z0-9_]+)/i.exec(line);
      if (m) createStatements.add(m[1]);
    }
  }
  check("Tablo sayısı (CSV vs migrations/*.sql DDL)", createStatements.size, dbCsv.length);

  // db.ts artik inline SQL tasimamali
  const dbTs = readLines(path.join(REPO_ROOT, "apps", "api", "src", "db.ts"));
  const inlineDdl = dbTs.filter((l) => /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+[a-z_]+/i.test(l)).length;
  check("db.ts icinde kalan inline CREATE TABLE", 0, inlineDdl, "ADR-003: sema migrations/*.sql'de yasar");

  // --- Migration konumu (ADR-003) ---
  const sqlFiles = walk(migrationsDir, [".sql"]);
  check("Migration konumu", "migrations/*.sql", sqlFiles.length > 0 ? "migrations/*.sql" : "inline (db.ts)", `${sqlFiles.length} dosya`);

  // --- Rapor ---
  const failed = checks.filter((c) => !c.ok);
  const pad = Math.max(...checks.map((c) => c.name.length));

  console.log("=== Truth Audit envanter doğrulaması ===\n");
  for (const c of checks) {
    const mark = c.ok ? "✅" : "❌";
    const line = `${mark} ${c.name.padEnd(pad)}  beklenen=${c.expected}  gerçek=${c.actual}`;
    console.log(c.detail ? `${line}\n     ${c.detail}` : line);
  }

  console.log(`\nToplam: ${checks.length} kontrol, ${failed.length} başarısız`);

  if (failed.length > 0) {
    console.error("\n[DRIFT] Envanter kaynak kodla uyuşmuyor. Yeniden üret:");
    console.error("  npx tsx scripts/audit/inventory-api.ts");
    console.error("  npx tsx scripts/audit/inventory-ui.ts");
    console.error("  npx tsx scripts/audit/inventory-db.ts");
    console.error("  npx tsx scripts/audit/generate-reports.ts");
    process.exit(1);
  }

  console.log("\n[OK] Envanterler kaynak kodla tutarlı.");
}

main();
