/**
 * Y-P00-004 — Database inventory.
 *
 * apps/api/src/db.ts içindeki inline migrationVersions dizisini ayrıştırır
 * (repo'da hiç .sql dosyası yok) ve her tablo için uygulama kodundaki
 * gerçek okuma/yazma sayısını çıkarır. read=0 && write=0 => ölü şema.
 */

import * as fs from "fs";
import * as path from "path";
import { REPO_ROOT, readLines, rel, walk, writeCsv, isMain } from "./lib";

const DB_TS = path.join(REPO_ROOT, "apps", "api", "src", "db.ts");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "migrations");
const CODE_DIRS = ["apps", "packages", "workers", "scripts"];

export interface TableRecord {
  table: string;
  migrationVersion: string;
  definedAtLine: number;
  columnCount: number;
  hasProjectId: boolean;
  hasOrgId: boolean;
  reads: number;
  writes: number;
  verdict: string;
}

/**
 * P01 / ADR-003 sonrası: şema `migrations/NNNN_*.sql` dosyalarında yaşar.
 * (Önceden `apps/api/src/db.ts` içinde 1.170 satırlık inline string diziydi.)
 */
function collectMigrations(): { table: string; version: string; line: number; body: string }[] {
  const out: { table: string; version: string; line: number; body: string }[] = [];

  const files = fs.existsSync(MIGRATIONS_DIR)
    ? fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql"))
        .sort()
    : [];

  for (const fileName of files) {
    const lines = readLines(path.join(MIGRATIONS_DIR, fileName));
    const versionLine = lines.find((l) => /^--\s*Ledger version:/.test(l)) || "";
    const version = versionLine.replace(/^--\s*Ledger version:\s*/, "").trim() || fileName;

    for (let i = 0; i < lines.length; i++) {
      const cm = /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([A-Za-z0-9_]+)/i.exec(lines[i]);
      if (!cm) continue;

      // Tablo gövdesini kapanış parantezine kadar topla
      const bodyLines: string[] = [];
      for (let j = i; j < Math.min(i + 60, lines.length); j++) {
        bodyLines.push(lines[j]);
        if (/^\s*\)\s*;/.test(lines[j]) && j > i) break;
      }
      out.push({ table: cm[1], version, line: i + 1, body: bodyLines.join("\n") });
    }
  }
  return out;
}

function countUsage(table: string, files: string[]): { reads: number; writes: number } {
  const readRe = new RegExp(`\\b(?:FROM|JOIN)\\s+${table}\\b`, "i");
  const writeRe = new RegExp(`\\b(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+${table}\\b`, "i");
  let reads = 0;
  let writes = 0;

  for (const file of files) {
    // db.ts'in kendi DDL'i kullanım sayılmaz
    if (file === DB_TS) continue;
    const lines = readLines(file);
    for (const line of lines) {
      if (readRe.test(line)) reads++;
      if (writeRe.test(line)) writes++;
    }
  }
  return { reads, writes };
}

function main(): void {
  const migrations = collectMigrations();
  const files: string[] = [];
  for (const dir of CODE_DIRS) {
    files.push(...walk(path.join(REPO_ROOT, dir), [".ts", ".tsx"]));
  }

  const seen = new Set<string>();
  const records: TableRecord[] = [];

  for (const m of migrations) {
    if (seen.has(m.table)) continue; // index_jobs iki kez drop/create ediliyor
    seen.add(m.table);

    const { reads, writes } = countUsage(m.table, files);
    const columnCount = (m.body.match(/^\s{2,}[a-z_]+\s+[A-Z]/gm) || []).length;
    const hasProjectId = /project_id/.test(m.body);
    const hasOrgId = /organization_id|org_id|tenant_id/.test(m.body);

    let verdict: string;
    if (reads === 0 && writes === 0) verdict = "DEAD (0 read, 0 write) -> DROP";
    else if (reads === 0) verdict = "WRITE-ONLY (never read) -> DROP";
    else if (writes === 0) verdict = "READ-ONLY (never written) -> investigate";
    else if (!hasOrgId) verdict = "KEEP + ALTER (needs organization_id)";
    else verdict = "KEEP";

    records.push({
      table: m.table,
      migrationVersion: m.version,
      definedAtLine: m.line,
      columnCount,
      hasProjectId,
      hasOrgId,
      reads,
      writes,
      verdict
    });
  }

  const target = writeCsv(
    "04-db-inventory.csv",
    ["table", "migration_version", "defined_at_line", "column_count", "has_project_id", "has_org_id", "reads", "writes", "verdict"],
    records.map((r) => [
      r.table,
      r.migrationVersion,
      r.definedAtLine,
      r.columnCount,
      r.hasProjectId,
      r.hasOrgId,
      r.reads,
      r.writes,
      r.verdict
    ])
  );

  const dead = records.filter((r) => r.reads === 0 && r.writes === 0);
  const writeOnly = records.filter((r) => r.reads === 0 && r.writes > 0);
  const readOnly = records.filter((r) => r.writes === 0 && r.reads > 0);
  const noOrg = records.filter((r) => !r.hasOrgId);
  const versions = new Set(migrations.map((m) => m.version)).size;

  console.log(`[audit] DB inventory -> ${rel(target)}`);
  console.log(`[audit]   migration versions : ${versions}`);
  console.log(`[audit]   tables             : ${records.length}`);
  console.log(`[audit]   DEAD (0r/0w)       : ${dead.length}  ${dead.map((d) => d.table).join(", ")}`);
  console.log(`[audit]   WRITE-ONLY         : ${writeOnly.length}  ${writeOnly.map((d) => d.table).join(", ")}`);
  console.log(`[audit]   READ-ONLY          : ${readOnly.length}  ${readOnly.map((d) => d.table).join(", ")}`);
  console.log(`[audit]   without org/tenant : ${noOrg.length} / ${records.length}  (tenant isolation kolonu yok)`);
}

if (isMain(import.meta.url)) {
  main();
}
