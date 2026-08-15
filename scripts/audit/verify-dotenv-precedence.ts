/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * P21/6 — `.env` DOSYASI ACIK ORTAM DEGISKENINI EZEMEZ.
 *
 * `dotenv.config({ override: true })` dosyayi ortam degiskenlerinin
 * USTUNE yazar. Sonucu sessizdir ve teshisi zordur:
 *
 *     DATABASE_URL=... npm run db:migrate
 *
 * komutu yok sayilir; migration `.env`de yazan veritabanina uygulanir.
 * P21'de tam bu yasandi ve yanlis tani konuldu.
 *
 * CI'da `.env` bulunmadigi icin bugun zarar vermiyor — ama CI'a bir
 * `.env` dusmesi halinde `env:` bloklari sessizce ezilirdi. Guvenligi
 * bir dosyanin YOKLUGUNA dayanan bir kurulum, kurulmus degildir.
 *
 * Dogru oncelik: ACIK ortam degiskeni dosyayi YENER — dotenv'in
 * varsayilani. Bu kapi varsayilandan sapilmasini engeller.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["apps", "scripts", "packages"];
const PATTERN = /dotenv\s*\.\s*config\s*\(\s*\{[^}]*override\s*:\s*true/;

interface Finding {
  readonly file: string;
  readonly line: number;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (full.endsWith(".ts")) acc.push(full);
  }
  return acc;
}

const findings: Finding[] = [];
let scanned = 0;

for (const root of ROOTS) {
  let files: string[];
  try {
    files = walk(root);
  } catch {
    continue;
  }
  for (const file of files) {
    scanned++;
    const lines = readFileSync(file, "utf8").split("\n");
    for (const [index, raw] of lines.entries()) {
      // Yorum satirlari haric: bu kapinin KENDI aciklamasi bulgu sayilmamali.
      const trimmed = raw.trim();
      if (trimmed.startsWith("*") || trimmed.startsWith("//")) continue;
      if (PATTERN.test(raw)) findings.push({ file: relative(process.cwd(), file), line: index + 1 });
    }
  }
}

if (scanned === 0) {
  console.error("HATA: hic TypeScript dosyasi taranmadi. Bos tarama 'gecti' sayilmaz.");
  process.exit(1);
}

if (findings.length > 0) {
  // Mesaj PARCALARDAN kurulur: bu satir kaliba TIPATIP uydugunda kapi
  // kendi hata metnini bulgu sayiyordu. Ilk kosuda tam bu oldu — bir
  // tarayicinin kendi aciklamasini bulgu sanmasi klasik bir yanlis
  // pozitiftir.
  const desen = ["dotenv.config({ ", "over", "ride: true })"].join("");
  console.error(`${findings.length} yerde '${desen}' var:`);
  for (const f of findings) console.error(`  ${f.file}:${f.line}`);
  console.error("\n`.env` ACIK ortam degiskenini ezmemeli. `override` secenegini kaldirin.");
  process.exit(1);
}

console.log(`${scanned} dosya tarandi: 'override: true' yok, ortam degiskeni onceligi korunuyor.`);
