/**
 * Y-P01-002 — `Math.random()` tabanlı primary key üretiminin göçü.
 *
 * P00 audit'i 60 çağrı noktasında şu kalıbı tespit etti:
 *   `prefix_${Math.random().toString(36).substring(2, 11)}`
 *
 * Bu ~44 bit tahmin edilebilir entropi demektir ve evidence/audit/event
 * kayıtlarında bütünlük riskidir (ADR-013).
 *
 * Script, kalıbı `newId("prefix")` ile değiştirir ve gereken import'u ekler.
 * `--check` modunda değişiklik yapmaz, kalan kullanım sayısını raporlar.
 */

import * as fs from "fs";
import * as path from "path";
import { REPO_ROOT, isMain, rel, walk } from "./lib";

/** `` `pfx_${Math.random().toString(36).substring(2, N)}` `` */
const TEMPLATE_RE = /`([a-z][a-z0-9_]*)_\$\{Math\.random\(\)\.toString\(36\)\.substring\(\d+,\s*\d+\)\}`/g;

/** `"id_" + Math.random().toString(36).substring(2, 11)` */
const CONCAT_RE = /"([a-z][a-z0-9_]*)_"\s*\+\s*Math\.random\(\)\.toString\(36\)\.substring\(\d+,\s*\d+\)/g;

const SKIP = new Set(["packages/shared/src/ids.ts", "packages/shared/src/ids.test.ts", "scripts/audit/migrate-ids.ts"]);

interface FileResult {
  file: string;
  replacements: number;
  importAdded: boolean;
}

function importSpecifierFor(file: string): string {
  const relPath = rel(file);
  // packages/shared içindeyse göreli import; aksi halde alias.
  if (relPath.startsWith("packages/shared/src/")) {
    const depth = relPath.split("/").length - 4;
    return depth > 0 ? `${"../".repeat(depth)}ids` : "./ids";
  }
  return "@y/shared";
}

function ensureImport(source: string, file: string): { source: string; added: boolean } {
  if (/\bnewId\s*\(/.test(source) === false) return { source, added: false };

  const spec = importSpecifierFor(file);

  // Zaten import edilmiş mi?
  const existing = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']${spec.replace("/", "\\/")}["']`);
  const m = existing.exec(source);
  if (m) {
    if (/\bnewId\b/.test(m[1])) return { source, added: false };
    const updated = source.replace(existing, (full) => full.replace(m[1], `${m[1].trimEnd()}, newId `));
    return { source: updated, added: true };
  }

  // İlk import satırından sonra ekle; yoksa dosya başına.
  const lines = source.split(/\r?\n/);
  let insertAt = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\s/.test(lines[i])) insertAt = i + 1;
    else if (insertAt > 0 && lines[i].trim() === "") break;
  }
  lines.splice(insertAt, 0, `import { newId } from "${spec}";`);
  return { source: lines.join("\n"), added: true };
}

export function migrate(check: boolean): FileResult[] {
  const files = [
    ...walk(path.join(REPO_ROOT, "apps"), [".ts", ".tsx"]),
    ...walk(path.join(REPO_ROOT, "packages"), [".ts", ".tsx"]),
    ...walk(path.join(REPO_ROOT, "workers"), [".ts"])
  ];

  const results: FileResult[] = [];

  for (const file of files) {
    if (SKIP.has(rel(file))) continue;
    const original = fs.readFileSync(file, "utf-8");
    let updated = original;
    let count = 0;

    updated = updated.replace(TEMPLATE_RE, (_full, prefix: string) => {
      count++;
      return `newId(${JSON.stringify(prefix)})`;
    });
    updated = updated.replace(CONCAT_RE, (_full, prefix: string) => {
      count++;
      return `newId(${JSON.stringify(prefix)})`;
    });

    if (count === 0) continue;

    const { source: withImport, added } = ensureImport(updated, file);
    results.push({ file: rel(file), replacements: count, importAdded: added });

    if (!check) fs.writeFileSync(file, withImport, "utf-8");
  }

  return results;
}

function countRemaining(): number {
  const files = [
    ...walk(path.join(REPO_ROOT, "apps"), [".ts", ".tsx"]),
    ...walk(path.join(REPO_ROOT, "packages"), [".ts", ".tsx"]),
    ...walk(path.join(REPO_ROOT, "workers"), [".ts"])
  ];
  let n = 0;
  for (const f of files) {
    if (SKIP.has(rel(f))) continue;
    const src = fs.readFileSync(f, "utf-8");
    for (const line of src.split(/\r?\n/)) {
      if (/Math\.random\(\)\.toString\(36\)\.substring/.test(line)) n++;
    }
  }
  return n;
}

function main(): void {
  const check = process.argv.includes("--check");
  const before = countRemaining();
  const results = migrate(check);
  const total = results.reduce((a, r) => a + r.replacements, 0);

  console.log(check ? "[migrate-ids] KONTROL MODU (yazma yok)" : "[migrate-ids] uygulanıyor");
  for (const r of results) {
    console.log(`  ${r.file.padEnd(52)} ${r.replacements} degisim${r.importAdded ? " (+import)" : ""}`);
  }
  console.log(`\n  toplam degisim : ${total}`);
  console.log(`  onceki kullanim: ${before}`);
  if (!check) {
    console.log(`  kalan kullanim : ${countRemaining()}`);
  }
}

if (isMain(import.meta.url)) {
  main();
}
