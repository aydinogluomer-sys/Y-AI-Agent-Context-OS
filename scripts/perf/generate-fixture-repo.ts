/**
 * P18 / Y-P18-007 — PERFORMANS FIXTURE ÜRETECİ.
 *
 * Faz dosyası: *"10K/50K/100K dosya, 1M/5M/10M LOC sentetik repo'lar
 * (gerçek repo'lar P16'da; burada ölçek için sentetik uygundur)."*
 *
 * ## Neden sentetik
 *
 * Ölçek testi için gerçek repository'ye gerek yok ve **istenmez**: gerçek
 * bir repo indirilebilirliğe, ağa ve lisansa bağımlıdır; ölçüm o gün o
 * repo'nun durumuna göre değişir ve **karşılaştırılamaz** hâle gelir.
 *
 * Sentetik fixture deterministiktir: aynı tohum (`seed`) aynı repo'yu
 * üretir. Bu, performans regresyonunun ölçülebilmesinin ön koşuludur —
 * girdi değişkense çıktıdaki fark ölçüm değil gürültüdür.
 *
 * Gerçek repository'ler **P16'nın** konusudur ve orada amaç ölçek değil,
 * retrieval kalitesidir (ground truth gerektirir).
 *
 * ## Kullanım
 *
 * ```bash
 * npx tsx scripts/perf/generate-fixture-repo.ts --files 10000 --out .perf/repo-10k
 * ```
 */

import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

/**
 * Deterministik sözde-rastgele üreteç (mulberry32).
 *
 * `Math.random()` KULLANILMAZ: tohumlanamaz olduğu için aynı fixture iki
 * kez üretilemez ve ölçümler karşılaştırılamaz. (ADR-013 birincil anahtar
 * için aynı kararı kripto tarafından verir; burada gerekçe farklı —
 * tekrarlanabilirlik.)
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface FixtureSpec {
  /** Üretilecek dosya sayısı. */
  readonly fileCount: number;
  /** Dosya başına ortalama satır. Gerçek kod tabanlarında ~40–120. */
  readonly linesPerFile: number;
  /** Dizin derinliği. Düz bir ağaç, gerçek repo'ları temsil etmez. */
  readonly depth: number;
  readonly seed: number;
}

export interface FixtureResult {
  readonly root: string;
  readonly filesWritten: number;
  readonly totalLines: number;
  readonly totalBytes: number;
  readonly durationMs: number;
}

const NAMES = [
  "auth", "payment", "order", "user", "session", "cache", "queue", "index",
  "policy", "graph", "search", "report", "invoice", "webhook", "billing"
];
const VERBS = ["create", "update", "delete", "find", "resolve", "validate", "compute"];

/**
 * Bir dosyanın içeriğini üretir.
 *
 * İçerik **ayrıştırılabilir TypeScript** olmalıdır: parser'ı boş bir
 * dosyayla ölçmek, ölçtüğünü sandığın şeyi ölçmemektir. Import'lar
 * gerçek yollara işaret eder ki graph inşası da gerçek iş yapsın.
 */
function generateFile(
  rand: () => number,
  index: number,
  lines: number,
  siblings: readonly string[]
): string {
  const name = NAMES[Math.floor(rand() * NAMES.length)];
  const out: string[] = [];

  out.push(`// fixture module ${index}`);

  // Import'lar: gercek kardes dosyalara isaret eder.
  const importCount = Math.min(siblings.length, Math.floor(rand() * 4));
  for (let i = 0; i < importCount; i++) {
    const target = siblings[Math.floor(rand() * siblings.length)];
    out.push(`import { helper${i} } from "./${target}";`);
  }
  out.push("");

  out.push(`export interface ${name}Config${index} {`);
  out.push("  readonly id: string;");
  out.push("  readonly enabled: boolean;");
  out.push("}");
  out.push("");

  let emitted = out.length;
  let fn = 0;
  while (emitted < lines) {
    const verb = VERBS[Math.floor(rand() * VERBS.length)];
    out.push(`export function ${verb}${name}${index}_${fn}(input: string): string {`);
    out.push(`  const normalized = input.trim().toLowerCase();`);
    out.push(`  if (normalized.length === 0) {`);
    out.push(`    throw new Error("empty input");`);
    out.push(`  }`);
    out.push(`  return normalized + "_${fn}";`);
    out.push("}");
    out.push("");
    emitted = out.length;
    fn++;
  }

  return out.join("\n");
}

export function generateFixtureRepo(spec: FixtureSpec, outDir: string): FixtureResult {
  const started = Date.now();
  const rand = seededRandom(spec.seed);

  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  let totalLines = 0;
  let totalBytes = 0;
  const perDirectory: string[] = [];

  for (let i = 0; i < spec.fileCount; i++) {
    // Derinlik: dosya indeksinden turetilir ki dagilim deterministik olsun.
    const segments: string[] = [];
    for (let d = 0; d < spec.depth; d++) {
      segments.push(`pkg${Math.floor(i / Math.pow(8, d)) % 8}`);
    }
    const fileName = `mod${i}`;
    const relative = join(...segments, `${fileName}.ts`);
    const full = join(outDir, relative);

    mkdirSync(dirname(full), { recursive: true });

    const siblings = perDirectory.slice(-6);
    const content = generateFile(rand, i, spec.linesPerFile, siblings);
    writeFileSync(full, content, "utf-8");

    perDirectory.push(fileName);
    totalLines += content.split("\n").length;
    totalBytes += Buffer.byteLength(content, "utf-8");
  }

  return {
    root: outDir,
    filesWritten: spec.fileCount,
    totalLines,
    totalBytes,
    durationMs: Date.now() - started
  };
}

/** Faz dosyasındaki ölçek basamakları. */
export const SCALE_PRESETS: Readonly<Record<string, FixtureSpec>> = {
  small: { fileCount: 100, linesPerFile: 60, depth: 2, seed: 1 },
  "10k": { fileCount: 10_000, linesPerFile: 100, depth: 3, seed: 1 },
  "50k": { fileCount: 50_000, linesPerFile: 100, depth: 4, seed: 1 },
  "100k": { fileCount: 100_000, linesPerFile: 100, depth: 4, seed: 1 }
};

// --- CLI -------------------------------------------------------------------

function isMain(): boolean {
  const entry = process.argv[1];
  return typeof entry === "string" && entry.includes("generate-fixture-repo");
}

if (isMain()) {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const preset = get("--preset");
  const spec: FixtureSpec = preset
    ? (SCALE_PRESETS[preset] ??
      (() => {
        throw new Error(
          `Bilinmeyen preset: ${preset}. Secenekler: ${Object.keys(SCALE_PRESETS).join(", ")}`
        );
      })())
    : {
        fileCount: Number(get("--files") ?? 100),
        linesPerFile: Number(get("--lines") ?? 60),
        depth: Number(get("--depth") ?? 2),
        seed: Number(get("--seed") ?? 1)
      };

  const out = get("--out") ?? ".perf/fixture";
  const result = generateFixtureRepo(spec, out);

  console.log(
    JSON.stringify(
      {
        root: result.root,
        files: result.filesWritten,
        lines: result.totalLines,
        megabytes: +(result.totalBytes / 1_048_576).toFixed(2),
        durationMs: result.durationMs
      },
      null,
      2
    )
  );
}
