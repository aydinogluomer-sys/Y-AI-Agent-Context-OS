/**
 * P08 / Y-P08-007, Y-P08-009 — Uydurma alanların GERİ GELMEDİĞİNİN kanıtı.
 *
 * P00 Truth Audit: `buildContextPack` bir "agent-ready context pack"
 * üretip `context_packs` tablosuna KALICI olarak yazıyordu. Pack'in
 * birçok alanı üretilmiş değil uydurulmuştu ve okuyanın onları gerçek
 * verilerden ayırt etmesinin bir yolu yoktu.
 *
 * ARANAN LİTERALLER BU DOSYADA PARÇALI KURULUR
 *   Aksi halde tarama kendi kendini bulur ve test hiçbir zaman kırılmaz.
 */

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function scannedFiles(): string[] {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "*.ts", "*.tsx"],
    { cwd: REPO_ROOT, encoding: "utf-8", maxBuffer: 32 * 1024 * 1024 }
  );
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => !file.endsWith("p08-no-fabricated-fields.test.ts"));
}

function findOccurrences(needle: string): { file: string; line: number; text: string }[] {
  const hits: { file: string; line: number; text: string }[] = [];

  for (const file of scannedFiles()) {
    let content: string;
    try {
      content = readFileSync(path.join(REPO_ROOT, file), "utf-8");
    } catch {
      continue;
    }
    if (!content.includes(needle)) continue;

    content.split(/\r?\n/).forEach((text, index) => {
      // Yorum satirlari atlanir: kaldirilan davranisi ANLATAN bir yorum,
      // davranisin kendisi degildir.
      const trimmed = text.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
      if (text.includes(needle)) hits.push({ file, line: index + 1, text: trimmed });
    });
  }
  return hits;
}

function describeHits(hits: readonly { file: string; line: number; text: string }[]): string {
  return hits.map((h) => `${h.file}:${h.line}  ${h.text.slice(0, 100)}`).join("\n");
}

describe("P08 — uydurma pack alanları kaynak ağacında yok", () => {
  it("pack üreticileri silinmiş", () => {
    for (const needle of ["buildContext" + "Pack", "buildCompressed" + "ContextPack"]) {
      const hits = findOccurrences(needle);
      expect(hits, `${needle} geri gelmis:\n${describeHits(hits)}`).toEqual([]);
    }
  });

  it("uydurma commit kimliği kalmamış", () => {
    // `recent_diffs` alaninda sabit bir kimlik uretiliyordu; git'e hic
    // bakilmiyordu.
    const hits = findOccurrences("diff-recent" + "-01");
    expect(hits, `Uydurma diff kimligi geri gelmis:\n${describeHits(hits)}`).toEqual([]);
  });

  it("uydurma satır değişikliği sayısı kalmamış", () => {
    const hits = findOccurrences("+45 " + "-12");
    expect(hits, `Uydurma satir sayisi geri gelmis:\n${describeHits(hits)}`).toEqual([]);
  });

  it("temsili chunk metni kalmamış", () => {
    // Chunk metni bulunamadiginda yerine bu cumle konuyordu.
    const hits = findOccurrences("Mock detailed documentation" + " content");
    expect(hits, `Temsili chunk metni geri gelmis:\n${describeHits(hits)}`).toEqual([]);
  });

  it("koşulsuz sır tarama bayrağı kalmamış", () => {
    // `secret_scanned: true` kosulsuz yaziliyordu — tarama calismasa bile.
    const hits = findOccurrences("secret_scanned:" + " true");
    expect(hits, `Kosulsuz sir bayragi geri gelmis:\n${describeHits(hits)}`).toEqual([]);
  });

  it("çelişen sabit bütçe değerleri kalmamış", () => {
    // `DEFAULT_TOKEN_BUDGET = 50000` ve `CANONICAL_TOKEN_BUDGET` pack
    // builder ile birlikte gitti. Butce artik adapter limitinden
    // hesaplaniyor (ADR-031).
    const hits = findOccurrences("DEFAULT_TOKEN" + "_BUDGET");
    expect(hits, `Sabit butce sabiti geri gelmis:\n${describeHits(hits)}`).toEqual([]);
  });
});

describe("P08 — testin kendisi çalışıyor mu", () => {
  it("tarama gerçekten dosya okuyor", () => {
    expect(scannedFiles().length).toBeGreaterThan(100);
  });

  it("var olan bir ismi bulabiliyor (pozitif kontrol)", () => {
    // Tarama mantigi calismiyorsa yukaridaki "bulunamadi" sonuclari da
    // anlamsizdir.
    expect(findOccurrences("compileContext").length).toBeGreaterThan(0);
  });
});
