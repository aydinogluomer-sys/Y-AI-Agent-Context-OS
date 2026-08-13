/**
 * Kaynak hijyeni — ham kontrol baytlarını kaçış dizilerine çevirir.
 *
 * `git -z` NUL ayracı ve `%x1f` alan ayracı kullanır. Bunları string
 * literal içinde HAM bayt olarak yazmak çalışır ama kaynağı okunamaz kılar:
 * ayraç ekranda görünmez, diff'te kaybolur, kopyala-yapıştır sırasında
 * sessizce bozulur.
 *
 * Bu script `"\0"` ve `"\x1f"` kaçış dizilerine dönüştürür — davranış aynı,
 * kaynak denetlenebilir.
 */

import * as fs from "fs";
import * as path from "path";
import { REPO_ROOT, isMain, rel, walk } from "./lib";

const NUL = String.fromCharCode(0);
const UNIT_SEP = String.fromCharCode(31);

export function countControlBytes(source: string): number {
  let n = 0;
  for (const ch of source) {
    const code = ch.charCodeAt(0);
    if (code === 0 || code === 31) n++;
  }
  return n;
}

export function normalize(source: string): string {
  return source.split(NUL).join("\\0").split(UNIT_SEP).join("\\x1f");
}

function main(): void {
  const files = [
    ...walk(path.join(REPO_ROOT, "packages"), [".ts", ".tsx"]),
    ...walk(path.join(REPO_ROOT, "apps"), [".ts", ".tsx"]),
    ...walk(path.join(REPO_ROOT, "scripts"), [".ts"]),
    ...walk(path.join(REPO_ROOT, "workers"), [".ts"])
  ];

  let touched = 0;
  for (const file of files) {
    const before = fs.readFileSync(file, "utf-8");
    const count = countControlBytes(before);
    if (count === 0) continue;

    fs.writeFileSync(file, normalize(before), "utf-8");
    console.log(`  ${rel(file).padEnd(52)} ${count} ham kontrol bayti -> kacis dizisi`);
    touched++;
  }

  console.log(`[normalize] ${touched} dosya duzeltildi (${files.length} tarandi)`);
}

if (isMain(import.meta.url)) {
  main();
}
