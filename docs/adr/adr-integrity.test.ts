import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const ADR_DIR = HERE;

/**
 * P17 / A1 — ATIF BÜTÜNLÜĞÜ.
 *
 * Kaynak kodda `ADR-032` yazan bir yorum, okuyana **aranabilir bir karar**
 * vaat eder. Belge yoksa vaat karşılanmaz ve yorum, doğrulanamayan bir
 * iddiaya dönüşür — spec §64'ün "doküman ile kod arasında doğrulanmamış
 * iddia var mı" maddesi tam olarak budur.
 *
 * P17 denetiminde kod 49 ayrı ADR'ye atıf yapıyordu; `docs/adr/` altında
 * 8 belge vardı. Bu test o boşluğun geri açılmasını engeller.
 */

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  "playwright-report",
  "test-results",
  "docs"
]);

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      sourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

// Kalıbı PARÇALARDAN kuruyoruz; aksi halde bu test dosyasının kendi
// metni taramada eşleşir ve test kendini doğrulamış olurdu.
const ADR_TOKEN = "ADR" + "-";
const ADR_PATTERN = new RegExp(ADR_TOKEN + "(\\d{3})", "g");

function referencedAdrs(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of sourceFiles(REPO)) {
    if (file.startsWith(ADR_DIR)) continue;
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(ADR_PATTERN)) {
      const num = m[1];
      const rel = file.slice(REPO.length + 1).replace(/\\/g, "/");
      const list = found.get(num) ?? [];
      if (!list.includes(rel)) list.push(rel);
      found.set(num, list);
    }
  }
  return found;
}

function documentedAdrs(): Set<string> {
  const set = new Set<string>();
  for (const name of readdirSync(ADR_DIR)) {
    const m = name.match(/^ADR-(\d{3})-.+\.md$/);
    if (m) set.add(m[1]);
  }
  return set;
}

describe("ADR atıf bütünlüğü", () => {
  const referenced = referencedAdrs();
  const documented = documentedAdrs();

  it("kaynak kodda atıf yapılan HER ADR'nin belgesi var", () => {
    const missing: string[] = [];
    for (const [num, files] of referenced) {
      if (!documented.has(num)) {
        missing.push(`${ADR_TOKEN}${num} <- ${files.slice(0, 3).join(", ")}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("POZİTİF KONTROL: tarama gerçekten kaynak dosyaları okuyor", () => {
    // Tarama boş bir kümede çalışıyor olsaydı üstteki test de geçerdi.
    expect(sourceFiles(REPO).length).toBeGreaterThan(100);
    expect(referenced.size).toBeGreaterThan(30);
  });

  it("POZİTİF KONTROL: belge dizini gerçekten okunuyor", () => {
    expect(documented.size).toBeGreaterThan(30);
  });

  it("her ADR belgesi zorunlu başlıkları taşır", () => {
    const REQUIRED = ["## Decision", "## Context", "## Reason", "## Consequences"];
    const broken: string[] = [];
    for (const name of readdirSync(ADR_DIR)) {
      if (!/^ADR-\d{3}-.+\.md$/.test(name)) continue;
      const text = readFileSync(join(ADR_DIR, name), "utf8");
      for (const heading of REQUIRED) {
        if (!text.includes(heading)) broken.push(`${name}: ${heading} yok`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("register her belgeye bağlantı veriyor", () => {
    const readme = readFileSync(join(ADR_DIR, "README.md"), "utf8");
    const unlinked: string[] = [];
    for (const name of readdirSync(ADR_DIR)) {
      if (!/^ADR-\d{3}-.+\.md$/.test(name)) continue;
      if (!readme.includes(name)) unlinked.push(name);
    }
    expect(unlinked).toEqual([]);
  });
});
