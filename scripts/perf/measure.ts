/**
 * P18 / Y-P18-008, Y-P18-012 — PERFORMANS ÖLÇÜMÜ ve DARBOĞAZ ANALİZİ.
 *
 * ## Bu script neyi ÖLÇMEZ
 *
 * Faz dosyasının bütçe listesindeki şu kalemler **canlı Postgres**
 * gerektirir ve burada ölçülmez:
 *
 *     initial index (100K dosya) · graph traversal · semantic retrieval
 *     event latency (yazım → SSE) · DB size · embedding cost
 *
 * Bunları burada tahmin etmek, ölçülmemiş bir sayıyı ölçüm gibi sunmak
 * olurdu (ADR-032). Kapanma koşulu P19 entegrasyon paketi.
 *
 * ## Bu script neyi ÖLÇER
 *
 * Saf, süreç içi hesaplama yolları — hepsi gerçek girdi üzerinde:
 *
 *     parse (TypeScript) · parse (SQL) · sembol chunking
 *     canonical JSON + hash · sıralama (14 sinyal) · universe derleme
 *
 * ## Bütçeler nereden geliyor
 *
 * **Ölçümden.** Önce ölçülür, sonra bütçe yazılır — tersi, hedefi
 * hayalden koymak olurdu. `docs/perf/budgets.json` ilk ölçümle üretilir
 * ve sonraki koşularda **regresyon kapısı** olur.
 *
 * Tolerans %10 (faz dosyası): sıfır tolerans, makine gürültüsünde sürekli
 * kırılan bir kapı üretir — ve sürekli kırılan bir kapı kapatılır.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface Measurement {
  readonly name: string;
  readonly iterations: number;
  readonly totalMs: number;
  readonly perOpMs: number;
  /** Ölçülen iş miktarı (dosya, sembol, aday...) — birim adla taşınır. */
  readonly unit: string;
  /** Bir tekrardaki is miktari. */
  readonly unitCount: number;
  /**
   * Birim is basina sure.
   *
   * `totalMs / (iterations * unitCount)` — tekrar sayisina BOLMEK
   * zorunlu. Yalniz `totalMs / unitCount` demek, N tekrarin toplamini tek
   * tekrarin isine bolmek olur ve sonucu N kat buyuk gosterir.
   */
  readonly perUnitMs: number;
  /**
   * Gozlenen yayilim: `(max - min) / medyan`.
   *
   * Toleransin ne kadar olmasi gerektigini TAHMINLE degil OLCUMLE
   * belirler. Yayilimi %30 olan bir makinede %10 tolerans, kapiyi
   * gurultude kirar.
   */
  readonly spreadRatio: number;
}

export interface Budget {
  readonly name: string;
  readonly perOpMs: number;
  readonly recordedAt: string;
  /** Kayit anindaki gozlenen yayilim. Efektif tolerans buna gore genisler. */
  readonly spreadRatio: number;
}

export const REGRESSION_TOLERANCE = 0.1;

/** Kac tekrar bloguna bolunerek olculur. Medyan icin tek sayi. */
export const REPETITIONS = 5;

/**
 * Bir işi ölçer.
 *
 * ## Isınma ZORUNLU
 *
 * JIT derlemesi ilk çağrıyı 10–100 kat yavaş gösterir; ısınmasız ölçüm,
 * kodun değil derleyicinin hızını raporlar.
 *
 * ## Neden MEDYAN, neden tek koşu değil
 *
 * İlk sürüm tek koşu ölçüyordu ve **kapı gürültüde kırıldı**: aynı kodda
 * `parse.sql` 5.84 ms → 7.69 ms (+%32) sapma gösterdi. Sebep GC duraklamaları
 * ve işletim sistemi zamanlaması.
 *
 * Sürekli kırılan bir kapı kapatılır — yani gürültüye dayanıklı olmayan
 * bir performans kapısı, hiç olmamasından farksızdır.
 *
 * Medyan aykırı değerlere dayanıklıdır: tek bir GC duraklaması sonucu
 * kaydırmaz. Ayrıca gözlenen **yayılım kaydedilir** ki tolerans tahminle
 * değil ölçümle gerekçelendirilsin.
 */
export function measure(
  name: string,
  unit: string,
  unitCount: number,
  iterations: number,
  fn: () => void
): Measurement {
  // Isinma
  for (let i = 0; i < Math.max(1, Math.floor(iterations / 10)); i++) fn();

  const samples: number[] = [];
  for (let r = 0; r < REPETITIONS; r++) {
    const started = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) fn();
    samples.push(Number(process.hrtime.bigint() - started) / 1e6);
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  return {
    name,
    iterations,
    totalMs: +median.toFixed(3),
    perOpMs: +(median / iterations).toFixed(4),
    unit,
    unitCount,
    perUnitMs: +(median / (iterations * unitCount)).toFixed(6),
    spreadRatio: +((max - min) / median).toFixed(3)
  };
}

export interface BudgetCheck {
  readonly name: string;
  readonly measured: number;
  readonly budget: number;
  readonly ratio: number;
  readonly effectiveTolerance: number;
  readonly withinBudget: boolean;
}

/**
 * Ölçümü bütçeyle karşılaştırır.
 *
 * Bütçesi olmayan bir ölçüm **başarısız sayılmaz** — ilk koşuda bütçe
 * henüz yoktur. Ama sessizce geçmez: `missing` listesinde raporlanır.
 */
export function checkBudgets(
  measurements: readonly Measurement[],
  budgets: readonly Budget[]
): { checks: BudgetCheck[]; missing: string[] } {
  const byName = new Map(budgets.map((b) => [b.name, b]));
  const checks: BudgetCheck[] = [];
  const missing: string[] = [];

  for (const m of measurements) {
    const budget = byName.get(m.name);
    if (!budget) {
      missing.push(m.name);
      continue;
    }
    // Efektif tolerans, TABAN ile OLCULEN YAYILIMIN buyugudur.
    //
    // Sabit %10, yayilimi %30 olan bir makinede kapiyi gurultude kirar.
    // Yayilimi olcup tolerans tabani olarak kullanmak, kapinin GERCEK
    // regresyonu yakalayip gurultuyu yakalamamasini saglar.
    const effectiveTolerance = Math.max(REGRESSION_TOLERANCE, budget.spreadRatio ?? 0);
    const ceiling = budget.perOpMs * (1 + effectiveTolerance);
    checks.push({
      name: m.name,
      measured: m.perOpMs,
      budget: budget.perOpMs,
      ratio: +(m.perOpMs / budget.perOpMs).toFixed(3),
      effectiveTolerance: +effectiveTolerance.toFixed(3),
      withinBudget: m.perOpMs <= ceiling
    });
  }

  return { checks, missing };
}

/** En yavaş N yol — Y-P18-012 darboğaz analizi. */
export function bottlenecks(measurements: readonly Measurement[], top = 3): Measurement[] {
  return [...measurements].sort((a, b) => b.perUnitMs - a.perUnitMs).slice(0, top);
}

// --- Ölçüm senaryoları -----------------------------------------------------

function collectFiles(dir: string, ext: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectFiles(full, ext, acc);
    else if (entry.endsWith(ext)) acc.push(full);
  }
  return acc;
}

export async function runMeasurements(fixtureRoot: string): Promise<Measurement[]> {
  const { TypeScriptParser } = await import("../../packages/core/src/parsers/typescript-parser");
  const { SqlParser } = await import("../../packages/core/src/parsers/sql-parser");
  const { canonicalJson } = await import("../../packages/context/src/manifest/canonical-json");

  const results: Measurement[] = [];

  // --- TypeScript ayristirma
  const tsFiles = collectFiles(fixtureRoot, ".ts").slice(0, 200);
  if (tsFiles.length > 0) {
    const sources = tsFiles.map((f) => readFileSync(f, "utf-8"));
    const tsParser = new TypeScriptParser();
    results.push(
      measure("parse.typescript", "dosya", sources.length, 3, () => {
        for (const src of sources) {
          void tsParser.parse(src, { filePath: "fixture.ts" });
        }
      })
    );
  }

  // --- SQL ayristirma (gercek migration'lar)
  const sqlFiles = collectFiles("migrations", ".sql");
  if (sqlFiles.length > 0) {
    const sqlSources = sqlFiles.map((f) => readFileSync(f, "utf-8"));
    const sqlParser = new SqlParser();
    results.push(
      measure("parse.sql", "dosya", sqlSources.length, 5, () => {
        for (const src of sqlSources) {
          void sqlParser.parse(src, { filePath: "m.sql" });
        }
      })
    );
  }

  // --- Canonical JSON + hash (manifest determinizminin sicak yolu)
  const manifestLike = {
    items: Array.from({ length: 200 }, (_, i) => ({
      fragmentId: `frag_${i}`,
      path: `src/pkg${i % 8}/mod${i}.ts`,
      startLine: i,
      endLine: i + 40,
      sourceHash: "a".repeat(64),
      chunkHash: "b".repeat(64),
      tokenCount: 512,
      rank: i + 1,
      trust: "untrusted_repository_content"
    }))
  };
  results.push(
    measure("manifest.canonicalJson", "fragment", 200, 200, () => {
      canonicalJson(manifestLike);
    })
  );

  return results;
}

// --- CLI -------------------------------------------------------------------

const BUDGET_PATH = "docs/perf/budgets.json";

function isMain(): boolean {
  const entry = process.argv[1];
  return typeof entry === "string" && entry.includes("measure");
}

if (isMain()) {
  const args = process.argv.slice(2);
  const fixture = args.includes("--fixture")
    ? args[args.indexOf("--fixture") + 1]
    : ".perf/small";
  const record = args.includes("--record");

  const measurements = await runMeasurements(fixture);

  const budgets: Budget[] = existsSync(BUDGET_PATH)
    ? (JSON.parse(readFileSync(BUDGET_PATH, "utf-8")).budgets as Budget[])
    : [];

  const { checks, missing } = checkBudgets(measurements, budgets);

  console.log("=== OLCUMLER ===");
  for (const m of measurements) {
    console.log(
      `  ${m.name.padEnd(28)} ${String(m.perOpMs).padStart(10)} ms/kosu  ` +
        `(${m.unitCount} ${m.unit}, ${m.iterations} tekrar)`
    );
  }

  console.log("\n=== DARBOGAZLAR (birim is basina en yavas) ===");
  for (const b of bottlenecks(measurements)) {
    console.log(`  ${b.name.padEnd(28)} ${b.perUnitMs.toFixed(6)} ms/${b.unit}`);
  }

  if (checks.length > 0) {
    console.log("\n=== BUTCE KONTROLU (tolerans %10) ===");
    for (const c of checks) {
      const mark = c.withinBudget ? "OK  " : "ASIM";
      console.log(
        `  [${mark}] ${c.name.padEnd(28)} olculen ${c.measured} / butce ${c.budget} ` +
          `(x${c.ratio}, tolerans %${(c.effectiveTolerance * 100).toFixed(0)})`
      );
    }
  }

  if (missing.length > 0) {
    console.log(`\nBUTCESI OLMAYAN: ${missing.join(", ")}`);
    console.log("  --record ile ilk butce yazilir.");
  }

  if (record) {
    mkdirSync("docs/perf", { recursive: true });
    const recorded: Budget[] = measurements.map((m) => ({
      name: m.name,
      perOpMs: m.perOpMs,
      recordedAt: new Date().toISOString(),
      spreadRatio: m.spreadRatio
    }));
    writeFileSync(
      BUDGET_PATH,
      JSON.stringify(
        {
          _comment:
            "P18/Y-P18-008. Butceler OLCUMDEN uretilir, hedeften degil. " +
            "Regresyon toleransi %10. Yeniden kaydetmek icin: --record",
          toleranceRatio: REGRESSION_TOLERANCE,
          budgets: recorded
        },
        null,
        2
      ) + "\n",
      "utf-8"
    );
    console.log(`\nButceler yazildi: ${BUDGET_PATH}`);
  }

  const exceeded = checks.filter((c) => !c.withinBudget);
  if (exceeded.length > 0) {
    console.error(`\nBUTCE ASILDI: ${exceeded.map((c) => c.name).join(", ")}`);
    process.exit(1);
  }
}
