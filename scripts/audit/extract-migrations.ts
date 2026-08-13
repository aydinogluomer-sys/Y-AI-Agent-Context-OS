/**
 * Y-P01-004 — Inline migration'ları `migrations/*.sql` dosyalarına çıkarır.
 *
 * ADR-003: Şema, `apps/api/src/db.ts` içinde 1.100 satırlık bir string dizisi
 * olarak yaşıyor ve repo'da hiç `.sql` dosyası yok. Bu, şemayı gözden
 * geçirilemez, diff'lenemez ve araçlarla doğrulanamaz kılıyor.
 *
 * Kritik kısıt: SQL içeriği **birebir** korunur. Tek karakter değişikliği
 * bile fresh/upgrade şema paritesini bozar (Y-P01-004 acceptance).
 *
 * `schema_migrations` ledger'ı korunur — dosya adındaki sıra numarası ile
 * eski `version` string'i arasındaki eşleme `migrations/MAPPING.md`'de tutulur,
 * böylece mevcut veritabanları etkilenmez.
 */

import * as fs from "fs";
import * as path from "path";
import { REPO_ROOT, isMain, readLines, rel } from "./lib";

const DB_TS = path.join(REPO_ROOT, "apps", "api", "src", "db.ts");
const OUT_DIR = path.join(REPO_ROOT, "migrations");

export interface Migration {
  ordinal: number;
  version: string;
  sql: string;
  fileName: string;
}

/** `version: "..."` + `sql: \`...\`` çiftlerini sırayla çıkarır. */
export function parseMigrations(): Migration[] {
  const source = fs.readFileSync(DB_TS, "utf-8");
  const start = source.indexOf("const migrationVersions = [");
  if (start === -1) throw new Error("migrationVersions dizisi bulunamadi (zaten tasinmis olabilir).");

  const region = source.slice(start);
  const out: Migration[] = [];

  // version + sql template literal cifti
  const entryRe = /version:\s*"([^"]+)",\s*sql:\s*`([\s\S]*?)`\s*\n?\s*\}/g;
  let m: RegExpExecArray | null;
  let ordinal = 0;

  while ((m = entryRe.exec(region)) !== null) {
    ordinal++;
    const version = m[1];
    const sql = m[2];
    const slug = version
      .replace(/^\d+\.\d+\.\d+-/, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .toLowerCase();
    out.push({
      ordinal,
      version,
      sql,
      fileName: `${String(ordinal).padStart(4, "0")}_${slug}.sql`
    });
  }

  return out;
}

/** Template literal girintisini kaldırır ama SQL içeriğini değiştirmez. */
function dedent(sql: string): string {
  const lines = sql.replace(/^\n/, "").replace(/\s+$/, "").split("\n");
  const indents = lines.filter((l) => l.trim().length > 0).map((l) => l.match(/^\s*/)![0].length);
  const min = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join("\n");
}

function main(): void {
  const migrations = parseMigrations();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const mappingRows: string[] = [];

  for (const mig of migrations) {
    const body = dedent(mig.sql);
    const content = [
      `-- Migration ${String(mig.ordinal).padStart(4, "0")}`,
      `-- Ledger version: ${mig.version}`,
      `--`,
      `-- ADR-003 ile apps/api/src/db.ts icindeki inline migrationVersions`,
      `-- dizisinden BIREBIR cikarilmistir. Icerik degistirilmemistir.`,
      `-- schema_migrations ledger'inda bu dosya yukaridaki version string'i`,
      `-- ile kayitlidir; mevcut veritabanlari etkilenmez.`,
      ``,
      `-- +up`,
      body,
      ``,
      `-- +down`,
      `-- Geri alma bu migration icin tanimlanmamistir (P01 goc turu birebir`,
      `-- kopyadir). Down script'leri, sema degistiren yeni migration'lar icin`,
      `-- P02'den itibaren zorunludur.`,
      ``
    ].join("\n");

    fs.writeFileSync(path.join(OUT_DIR, mig.fileName), content, "utf-8");
    mappingRows.push(`| ${String(mig.ordinal).padStart(4, "0")} | \`${mig.fileName}\` | \`${mig.version}\` |`);
  }

  const mapping = `# Migration Eşlemesi

> Üreten: \`scripts/audit/extract-migrations.ts\` (Y-P01-004)

ADR-003 gereği migration'lar \`apps/api/src/db.ts\` içindeki inline
\`migrationVersions\` dizisinden dosyalara çıkarıldı. **SQL içeriği birebir
korunmuştur.**

\`schema_migrations\` tablosu eski \`version\` string'lerini tutmaya devam
eder; runner dosya adındaki sıra numarasını değil, aşağıdaki eşlemedeki
\`version\` değerini ledger anahtarı olarak kullanır. Bu sayede halihazırda
migrate edilmiş veritabanları yeniden çalıştırılmaz.

Yeni migration'lar \`${String(migrations.length + 1).padStart(4, "0")}\`'dan başlar.
Faz başına ayrılmış numara blokları için master plan Appendix K.1'e bakınız.

| # | Dosya | Ledger version |
|---|---|---|
${mappingRows.join("\n")}

Toplam: **${migrations.length}** migration.
`;

  fs.writeFileSync(path.join(OUT_DIR, "MAPPING.md"), mapping, "utf-8");

  console.log(`[extract-migrations] ${migrations.length} migration -> ${rel(OUT_DIR)}`);
  for (const mig of migrations.slice(0, 3)) {
    console.log(`  ${mig.fileName}  <-  ${mig.version}`);
  }
  console.log(`  ...`);
  for (const mig of migrations.slice(-2)) {
    console.log(`  ${mig.fileName}  <-  ${mig.version}`);
  }
}

if (isMain(import.meta.url)) {
  main();
}
