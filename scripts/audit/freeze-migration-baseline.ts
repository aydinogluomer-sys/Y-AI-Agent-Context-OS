/**
 * Y-P01-004 — Göç öncesi migration SQL'inin dondurulmuş referansı.
 *
 * ADR-003 göçü `apps/api/src/db.ts` içindeki inline diziyi sildi. Parite
 * garantisinin kalıcı olması için, göç anındaki ORİJİNAL SQL'in hash'leri
 * bir fixture'a yazılır ve `packages/db/src/migrations.test.ts` dosyaları
 * bu fixture'a karşı doğrular.
 *
 * Kaynak: git geçmişindeki son inline sürüm.
 *
 * Kullanım:
 *   tsx scripts/audit/freeze-migration-baseline.ts <git-ref>
 *   (varsayılan ref: HEAD~1 — göçü yapan commit'ten önceki hal)
 */

import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { REPO_ROOT, isMain, rel } from "./lib";

const OUT = path.join(REPO_ROOT, "packages", "db", "src", "__fixtures__", "migration-baseline.json");

interface BaselineEntry {
  ordinal: number;
  version: string;
  /** Normalize edilmiş SQL'in SHA-256'sı. */
  sha256: string;
  /** İnsan gözüyle denetlenebilmesi için ilk anlamlı satır. */
  firstStatement: string;
}

/** Test ile aynı normalizasyon: yalnız boşluk farkı yok sayılır. */
export function normalizeSql(sql: string): string {
  return sql
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

function readFromGit(ref: string, filePath: string): string {
  return execFileSync("git", ["show", `${ref}:${filePath}`], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    maxBuffer: 32 * 1024 * 1024
  });
}

export function parseInlineMigrations(source: string): { version: string; sql: string }[] {
  const start = source.indexOf("const migrationVersions = [");
  if (start === -1) {
    throw new Error("Verilen ref'te inline migrationVersions dizisi yok.");
  }
  const region = source.slice(start);
  const entryRe = /version:\s*"([^"]+)",\s*sql:\s*`([\s\S]*?)`\s*\n?\s*\}/g;
  const out: { version: string; sql: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(region)) !== null) {
    out.push({ version: m[1], sql: m[2] });
  }
  return out;
}

function main(): void {
  const ref = process.argv[2] || "HEAD";
  const source = readFromGit(ref, "apps/api/src/db.ts");
  const parsed = parseInlineMigrations(source);

  const entries: BaselineEntry[] = parsed.map((p, i) => {
    const normalized = normalizeSql(p.sql);
    return {
      ordinal: i + 1,
      version: p.version,
      sha256: createHash("sha256").update(normalized, "utf-8").digest("hex"),
      firstStatement: normalized.split("\n")[0].slice(0, 120)
    };
  });

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        _comment:
          "P01/ADR-003 goc oncesi migration SQL'inin dondurulmus referansi. " +
          "packages/db/src/migrations.test.ts dosyalari buna karsi dogrular. " +
          "ELLE DUZENLEMEYIN — sema paritesi garantisi budur.",
        sourceRef: ref,
        sourceFile: "apps/api/src/db.ts",
        generatedBy: "scripts/audit/freeze-migration-baseline.ts",
        count: entries.length,
        migrations: entries
      },
      null,
      2
    ) + "\n",
    "utf-8"
  );

  console.log(`[freeze-baseline] ref=${ref} -> ${rel(OUT)}`);
  console.log(`[freeze-baseline]   ${entries.length} migration hash'lendi`);
}

if (isMain(import.meta.url)) {
  main();
}
