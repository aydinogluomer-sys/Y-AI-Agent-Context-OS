/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * P21/4 — PROJE KAPSAMLI ROUTE'LAR MUHAFIZSIZ OLAMAZ (T-01, ADR-017).
 *
 * `tests/security/idor.spec.ts` muhafizin CALISTIGINI kanitliyor. Bu kapi
 * farkli bir soruyu cevapliyor: muhafiz her yere TAKILI MI?
 *
 * Ikisi ayri sorular. Calisan ama bir route'a takilmamis bir muhafiz,
 * tam olarak o route'ta hicbir sey yapmaz — ve testler gecmeye devam
 * eder cunku test edilen route korunuyordur.
 *
 * Bugun 125 proje kapsamli route'un 125'i muhafizli. Bu kapi o sayinin
 * DUSMESINI engeller: yarin eklenen bir route unutulursa CI kirilir.
 *
 * Kapsam: `/projects/:id...` kalibindaki route tanimlari.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILES = [join("apps", "api", "src", "index.ts")];
const GUARD = "requireProjectScope";

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

const findings: Finding[] = [];
let scanned = 0;

for (const file of FILES) {
  const lines = readFileSync(file, "utf8").split("\n");
  for (const [index, raw] of lines.entries()) {
    // `router.get("/projects/:id...` kalibini ara.
    if (!/router\.(get|post|patch|put|delete)\(\s*["'`]\/projects\/:id/.test(raw)) continue;
    scanned++;
    if (!raw.includes(GUARD)) {
      findings.push({ file, line: index + 1, text: raw.trim().slice(0, 100) });
    }
  }
}

if (scanned === 0) {
  console.error("HATA: hic proje kapsamli route bulunamadi.");
  console.error("Kapi muhtemelen yanlis dosyaya bakiyor ya da kalip degisti.");
  console.error("BOS TARAMA 'gecti' SAYILMAZ: yoklamadigi bir seyi yokluyor");
  console.error("sanmak, hic yoklamamaktan daha tehlikelidir.");
  process.exit(1);
}

if (findings.length > 0) {
  console.error(`${findings.length} proje kapsamli route MUHAFIZSIZ:\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}`);
    console.error(`    ${f.text}`);
  }
  console.error(`\nHer '/projects/:id' route'u '${GUARD}' kullanmali (ADR-017, T-01).`);
  console.error("Aksi halde o route baska projenin id'siyle cagrilabilir.");
  process.exit(1);
}

console.log(`Proje kapsamli ${scanned} route'un hepsi ${GUARD} kullaniyor.`);
