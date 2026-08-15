/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * P20 / FAZ 2 — CI SCRIPT REFERANSLARI KAPISI.
 *
 * CI, `package.json`'da OLMAYAN bir script cagirirsa adim "Missing
 * script" ile duser. Bu sessiz bir bozulma degil, gurultulu bir hata —
 * ama YALNIZ CI kosarsa gorulur.
 *
 * Bu depoda tam olarak bu oldu: `test:deterministic`,
 * `legacy:test:deterministic` olarak yeniden adlandirildi ve CI eski adi
 * cagirmaya devam etti. CI hic kosturulmadigi icin adim aylarca OLU
 * kaldi. Bir kapinin var olmasi, calistigi anlamina gelmiyor.
 *
 * Bu kontrol yerelde saniyeler surer ve o sinifi kapatir.
 *
 * NOT: yalnizca `run:` satirlari taranir. Yorum satirlari (`#`) haric
 * tutulur — aksi halde "bu script ARTIK YOK" diye YAZILMIS bir aciklama
 * bulgu sayilirdi. Ilk yazimimda tam bu oldu.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const WORKFLOW_DIR = join(process.cwd(), ".github", "workflows");

interface Finding {
  readonly workflow: string;
  readonly line: number;
  readonly script: string;
}

function packageScripts(): Set<string> {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
  return new Set(Object.keys(pkg.scripts ?? {}));
}

function scan(): Finding[] {
  const scripts = packageScripts();
  const findings: Finding[] = [];

  let files: string[];
  try {
    files = readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
  } catch {
    console.error(`HATA: ${WORKFLOW_DIR} okunamadi.`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.error("HATA: hic workflow dosyasi bulunamadi. Kapi bos tarama yapiyor olabilir.");
    process.exit(1);
  }

  for (const file of files) {
    const lines = readFileSync(join(WORKFLOW_DIR, file), "utf8").split("\n");
    for (const [index, raw] of lines.entries()) {
      // Yorum satirlari haric: aciklama metni referans degildir.
      if (raw.trim().startsWith("#")) continue;

      for (const match of raw.matchAll(/(?:pnpm|npm|yarn) run ([a-zA-Z0-9:_-]+)/g)) {
        const script = match[1];
        if (!scripts.has(script)) {
          findings.push({ workflow: file, line: index + 1, script });
        }
      }
    }
  }

  return findings;
}

const findings = scan();

if (findings.length > 0) {
  console.error(`CI ${findings.length} adet VAR OLMAYAN script cagiriyor:\n`);
  for (const f of findings) {
    console.error(`  ${f.workflow}:${f.line}  ->  "${f.script}"`);
  }
  console.error("\nBu adimlar CI'da 'Missing script' ile DUSER.");
  console.error("package.json'daki adi duzeltin ya da adimi kaldirin.");
  process.exit(1);
}

console.log("CI script referanslarinin hepsi package.json'da mevcut.");
