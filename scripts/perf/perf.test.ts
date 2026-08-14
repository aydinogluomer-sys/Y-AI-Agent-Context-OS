import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { generateFixtureRepo, SCALE_PRESETS } from "./generate-fixture-repo";
import {
  measure,
  checkBudgets,
  bottlenecks,
  REGRESSION_TOLERANCE,
  type Budget,
  type Measurement
} from "./measure";

/**
 * P18 / Y-P18-007, Y-P18-008, Y-P18-012.
 *
 * Bu test performansı ÖLÇMEZ — ölçüm makinesi değişkendir ve CI'da
 * kararlı bir sayı üretmez. Test edilen şey **ölçüm aracının kendisi**:
 * fixture deterministik mi, bütçe kapısı gerçekten kırılıyor mu, birim
 * hesabı doğru mu.
 *
 * Gerçek ölçüm `npm run perf` ile elle çalıştırılır ve sonucu
 * `docs/perf/budgets.json` içindedir.
 */

const TMP = ".perf/__test";

describe("Y-P18-007 — fixture üreteci deterministik", () => {
  it("aynı tohum AYNI repo'yu üretir", () => {
    // Determinizm, performans regresyonunun olculebilmesinin on kosulu:
    // girdi degiskense ciktidaki fark olcum degil GURULTUDUR.
    const spec = { fileCount: 20, linesPerFile: 30, depth: 2, seed: 42 };

    const a = generateFixtureRepo(spec, `${TMP}/a`);
    const b = generateFixtureRepo(spec, `${TMP}/b`);

    expect(a.filesWritten).toBe(b.filesWritten);
    expect(a.totalLines).toBe(b.totalLines);
    expect(a.totalBytes).toBe(b.totalBytes);
  });

  it("farklı tohum FARKLI içerik üretir", () => {
    const base = { fileCount: 20, linesPerFile: 30, depth: 2 };
    const a = generateFixtureRepo({ ...base, seed: 1 }, `${TMP}/s1`);
    const b = generateFixtureRepo({ ...base, seed: 2 }, `${TMP}/s2`);
    // Dosya sayisi ayni ama icerik farkli olmali.
    expect(a.filesWritten).toBe(b.filesWritten);
    expect(a.totalBytes).not.toBe(b.totalBytes);
  });

  it("üretilen dosyalar AYRIŞTIRILABİLİR TypeScript", async () => {
    // Parser'i bos bir dosyayla olcmek, olctugunu sandigin seyi
    // olcmemektir.
    const { TypeScriptParser } = await import("../../packages/core/src/parsers/typescript-parser");
    generateFixtureRepo({ fileCount: 5, linesPerFile: 40, depth: 1, seed: 7 }, `${TMP}/parse`);

    const { readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    function collect(dir: string, acc: string[] = []): string[] {
      for (const e of readdirSync(dir)) {
        const full = join(dir, e);
        if (statSync(full).isDirectory()) collect(full, acc);
        else if (e.endsWith(".ts")) acc.push(full);
      }
      return acc;
    }

    const files = collect(`${TMP}/parse`);
    expect(files.length).toBe(5);

    const parser = new TypeScriptParser();
    const result = await parser.parse(readFileSync(files[0], "utf-8"), {
      filePath: files[0]
    });
    // Gercek sembol cikiyor: interface + fonksiyonlar.
    expect(result.symbols.length).toBeGreaterThan(1);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("ölçek preset'leri faz dosyasındaki basamakları taşır", () => {
    expect(Object.keys(SCALE_PRESETS)).toContain("10k");
    expect(Object.keys(SCALE_PRESETS)).toContain("50k");
    expect(Object.keys(SCALE_PRESETS)).toContain("100k");
    expect(SCALE_PRESETS["100k"].fileCount).toBe(100_000);
  });
});

describe("Y-P18-008 — birim hesabı", () => {
  it("perUnitMs tekrar sayısına BÖLÜNÜR", () => {
    // Ilk yazimimda bolunmuyordu ve sonuc N kat buyuk cikiyordu:
    // 100 dosyalik 3 tekrar "2.20 ms/dosya" diyordu, gercegi 0.58.
    // Is yuku OLCULEBILIR olmali: mikrosaniyelik bir is olculdugunde
    // 3 haneye yuvarlama baskin gelir ve test kendi yuvarlamasini
    // olcmeye baslar.
    let calls = 0;
    const m = measure("test", "birim", 10, 5, () => {
      calls++;
      let acc = 0;
      for (let i = 0; i < 200_000; i++) acc += i % 7;
      if (acc < 0) throw new Error("olmaz");
    });

    expect(m.totalMs).toBeGreaterThan(1);

    expect(m.iterations).toBe(5);
    expect(m.unitCount).toBe(10);

    // Iliskiyi GORELI toleransla dogruluyoruz: alanlar farkli
    // hassasiyetlerde yuvarlaniyor (totalMs 3 hane, perUnitMs 6 hane) ve
    // mutlak karsilastirma bu yuvarlamayi hata sanardi.
    const expectedPerUnit = m.totalMs / (m.iterations * m.unitCount);
    expect(Math.abs(m.perUnitMs - expectedPerUnit) / expectedPerUnit).toBeLessThan(0.1);

    // Asil degismez: perUnitMs = perOpMs / unitCount
    expect(Math.abs(m.perUnitMs - m.perOpMs / m.unitCount) / m.perUnitMs).toBeLessThan(0.1);
    // Isinma turu da calisti (iterations/10 = 0 -> en az 1).
    expect(calls).toBeGreaterThan(5);
  });

  it("darboğaz sıralaması BİRİM İŞ başına yapılır", () => {
    // Toplam sureye gore siralamak, cok tekrar edilen ucuz bir isi
    // darbogaz gosterirdi.
    const fast: Measurement = {
      name: "cok-tekrar-ucuz", iterations: 1000, totalMs: 100,
      perOpMs: 0.1, unit: "x", unitCount: 100, perUnitMs: 0.001, spreadRatio: 0.05
    };
    const slow: Measurement = {
      name: "az-tekrar-pahali", iterations: 2, totalMs: 50,
      perOpMs: 25, unit: "x", unitCount: 10, perUnitMs: 2.5, spreadRatio: 0.05
    };
    expect(bottlenecks([fast, slow], 1)[0].name).toBe("az-tekrar-pahali");
  });
});

describe("Y-P18-008 — bütçe kapısı", () => {
  const budgets: Budget[] = [
    { name: "a", perOpMs: 10, recordedAt: "2026-08-14T00:00:00.000Z", spreadRatio: 0.05 }
  ];
  const make = (name: string, perOpMs: number): Measurement => ({
    name, iterations: 1, totalMs: perOpMs, perOpMs, unit: "x", unitCount: 1,
    perUnitMs: perOpMs, spreadRatio: 0.05
  });

  it("tolerans içindeki ölçüm GEÇER", () => {
    const { checks } = checkBudgets([make("a", 10.5)], budgets);
    expect(checks[0].withinBudget).toBe(true);
  });

  it("toleransı AŞAN ölçüm KIRILIR", () => {
    // Tolerans %10; 12 > 11 tavani.
    const { checks } = checkBudgets([make("a", 12)], budgets);
    expect(checks[0].withinBudget).toBe(false);
    expect(checks[0].ratio).toBe(1.2);
  });

  it("efektif tolerans ÖLÇÜLEN yayılıma göre genişler", () => {
    // Bu makinede parse.typescript yayilimi %64 olctu. Sabit %10 ile
    // kapi gurultude kirilirdi; olculen yayilim taban olunca kapi
    // GERCEK regresyonu yakalar, gurultuyu yakalamaz.
    const noisy: Budget[] = [
      { name: "a", perOpMs: 10, recordedAt: "2026-08-14T00:00:00.000Z", spreadRatio: 0.6 }
    ];
    const { checks } = checkBudgets([make("a", 15)], noisy);
    expect(checks[0].effectiveTolerance).toBe(0.6);
    // 15 <= 10 * 1.6 -> gecer
    expect(checks[0].withinBudget).toBe(true);

    // Ama 3 kat regresyon YAKALANIR.
    expect(checkBudgets([make("a", 30)], noisy).checks[0].withinBudget).toBe(false);
  });

  it("tolerans %10 — sıfır DEĞİL", () => {
    // Sifir tolerans, makine gurultusunde surekli kirilan bir kapi
    // uretir; surekli kirilan bir kapi kapatilir.
    expect(REGRESSION_TOLERANCE).toBe(0.1);
  });

  it("bütçesi olmayan ölçüm SESSİZCE geçmez", () => {
    const { checks, missing } = checkBudgets([make("bilinmeyen", 1)], budgets);
    expect(checks).toEqual([]);
    expect(missing).toEqual(["bilinmeyen"]);
  });
});

describe("kaydedilmiş bütçeler", () => {
  const PATH = "docs/perf/budgets.json";

  it("bütçe dosyası var ve ÖLÇÜMDEN üretilmiş", () => {
    expect(existsSync(PATH)).toBe(true);
    const parsed = JSON.parse(readFileSync(PATH, "utf-8"));
    expect(parsed.toleranceRatio).toBe(0.1);
    expect(parsed.budgets.length).toBeGreaterThan(0);
    for (const b of parsed.budgets as Budget[]) {
      // Hedeften degil olcumden geldigi icin her butce bir zaman
      // damgasi tasir.
      expect(b.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(b.perOpMs).toBeGreaterThan(0);
    }
  });
});
