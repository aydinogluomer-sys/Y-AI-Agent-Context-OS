/**
 * Y-P00-006 + Y-P00-011 — Fake success path & test honesty scanner.
 *
 * Master plan §7 (FALSE GREEN YASAĞI) kapsamındaki kalıpları arar.
 * P17'de (Y-P17-008) bu script CI gate'i haline gelir; şu an envanter üretir.
 *
 * Kullanım:
 *   tsx scripts/audit/scan-false-green.ts            # rapor üret, exit 0
 *   tsx scripts/audit/scan-false-green.ts --gate     # bulgu varsa exit 1
 */

import * as path from "path";
import { REPO_ROOT, rel, walk, writeCsv, writeDoc } from "./lib";
import { readLines } from "./lib";

interface Finding {
  rule: string;
  severity: "P0" | "P1" | "P2";
  file: string;
  line: number;
  text: string;
}

interface Rule {
  id: string;
  severity: "P0" | "P1" | "P2";
  description: string;
  pattern: RegExp;
  /** Bu dizinlerde ara; boşsa hepsi. */
  include?: RegExp;
  /** Bu dosyalarda arama. */
  exclude?: RegExp;
}

const RULES: Rule[] = [
  {
    id: "assert-true",
    severity: "P0",
    description: 'assert("...", true) — koşulsuz geçen sahte assertion',
    pattern: /assert\(\s*["'][^"']*["']\s*,\s*true\s*\)/
  },
  {
    id: "skip-then-pass",
    severity: "P0",
    description: "DB/bağımlılık yoksa atla ve yine de PASS say",
    pattern: /[Ss]kipping .*(?:DB|database|SQL|Live|integration)|[Ff]alling back to simulated|[Ss]andbox fallbacks activated|[Ss]imulating standard/
  },
  {
    id: "fabricated-hash",
    severity: "P0",
    description: "Math.random() ile üretilip hash gibi sunulan değer",
    pattern: /["'`]sha256-["'`]\s*\+|sha256-\$\{\s*Math\.random/
  },
  {
    id: "settimeout-success",
    severity: "P0",
    description: "setTimeout/delay sonrası koşulsuz başarı durumu",
    pattern: /(?:await\s+delay\(|setTimeout\()[^)]*\)[^\n]*(?:status:\s*["']success["']|status:\s*["']completed["'])/
  },
  {
    id: "fallback-success",
    severity: "P0",
    description: "Sağlayıcı/servis hatasında sahte başarıya düşme",
    pattern: /catch[^\n]*\{[^\n]*(?:createLocalAiSimulation|generateFallbackSimulation|isFallback:\s*true)/
  },
  {
    id: "simulation-generator",
    severity: "P0",
    description: "Uydurma çıktı üreten fonksiyon",
    pattern: /function\s+(?:generateFallbackSimulation|createLocalAiSimulation)|mockSemanticSearchFallback/
  },
  {
    id: "hardcoded-metric",
    severity: "P1",
    description: "Ölçülmeden yazılmış metrik/confidence literal'i",
    pattern: /confidenceScore:\s*\d|totalScannedDocs:\s*\d|tokensInvolved:\s*\d|compressedPackTokens:\s*\d/
  },
  {
    id: "literal-run-count",
    severity: "P0",
    description: "Run sonucunda hesaplanmadan yazılmış sayaç",
    pattern: /selectedItemsCount:\s*\d+/
  },
  {
    id: "fabricated-diff",
    severity: "P1",
    description: "Git'e bakılmadan üretilmiş diff/author kaydı",
    pattern: /line_changes:\s*["']\+\d+|author:\s*["']User-Aydinoglu["']/
  },
  {
    id: "embedded-secret",
    severity: "P0",
    description: "Kaynak kodda gömülü / parçalanmış sır",
    pattern: /obfuscatedSecretParts|EJfZexrU6o|YdPpxH/
  },
  {
    id: "permissive-fallback",
    severity: "P0",
    description: "Hata durumunda izin veren güvenlik fallback'i",
    pattern: /ALLOW_STATIC_POLICY_FALLBACK|DETERMINISTIC_TEST_MODE|ALLOW_OFFLINE_API_BOOT|ENABLE_MOCK_DB/
  },
  {
    id: "unconditional-flag",
    severity: "P1",
    description: "Doğrulanmadan true yazılan güvenlik bayrağı",
    pattern: /secret_scanned:\s*true/
  },
  {
    id: "stub-dependency",
    severity: "P1",
    description: "Gerçek analiz yerine stub bağımlılık kaydı",
    pattern: /status:\s*["']stubbed["']|Metadata-based direct import stub/
  },
  {
    id: "weak-e2e-assertion",
    severity: "P1",
    description: "toBeLessThan(400/500) — 401/404 dahi geçiren E2E iddiası",
    pattern: /expect\([^)]*status[^)]*\)\.toBeLessThan\(\s*(?:400|500)\s*\)/
  },
  {
    id: "random-primary-key",
    severity: "P1",
    description: "Math.random() ile primary key üretimi",
    pattern: /Math\.random\(\)\.toString\(36\)\.substring/
  }
];

const SCAN_EXTS = [".ts", ".tsx", ".js", ".jsx"];
const SCAN_DIRS = ["apps", "packages", "workers", "scripts", "src", "tests"];

function main(): void {
  const gateMode = process.argv.includes("--gate");
  const files: string[] = [];
  for (const dir of SCAN_DIRS) {
    files.push(...walk(path.join(REPO_ROOT, dir), SCAN_EXTS));
  }
  // Kendi tarayıcı dosyalarımız kural metinlerini içerir; hariç tut.
  const targets = files.filter((f) => !rel(f).startsWith("scripts/audit/"));

  const findings: Finding[] = [];
  for (const file of targets) {
    const lines = readLines(file);
    for (let i = 0; i < lines.length; i++) {
      for (const rule of RULES) {
        if (rule.exclude && rule.exclude.test(rel(file))) continue;
        if (rule.include && !rule.include.test(rel(file))) continue;
        if (rule.pattern.test(lines[i])) {
          findings.push({
            rule: rule.id,
            severity: rule.severity,
            file: rel(file),
            line: i + 1,
            text: lines[i].trim().slice(0, 200)
          });
        }
      }
    }
  }

  writeCsv(
    "10-false-green-findings.csv",
    ["rule", "severity", "file", "line", "text"],
    findings.map((f) => [f.rule, f.severity, f.file, f.line, f.text])
  );

  // Kural ve dosya bazlı özet
  const byRule = new Map<string, number>();
  const byFile = new Map<string, number>();
  for (const f of findings) {
    byRule.set(f.rule, (byRule.get(f.rule) || 0) + 1);
    byFile.set(f.file, (byFile.get(f.file) || 0) + 1);
  }

  const ruleRows = RULES.map((r) => {
    const count = byRule.get(r.id) || 0;
    return `| \`${r.id}\` | ${r.severity} | ${count} | ${r.description} |`;
  }).join("\n");

  const topFiles = [...byFile.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([file, count]) => `| \`${file}\` | ${count} |`)
    .join("\n");

  const p0 = findings.filter((f) => f.severity === "P0").length;
  const p1 = findings.filter((f) => f.severity === "P1").length;

  writeDoc(
    "10-test-honesty.md",
    `# 10 — Test Dürüstlüğü ve Sahte Başarı Yolları

> Üreten: \`scripts/audit/scan-false-green.ts\` · Baseline commit: \`9f10f70\`
> Kanıt standardı: her bulgu dosya:satır referanslıdır (\`10-false-green-findings.csv\`).

## Özet

| Ölçüt | Değer |
|---|---|
| Taranan dosya | ${targets.length} |
| Toplam bulgu | **${findings.length}** |
| P0 (release blocker) | **${p0}** |
| P1 (production-critical) | **${p1}** |

## Kural bazlı dağılım

| Kural | Şiddet | Bulgu | Açıklama |
|---|---|---:|---|
${ruleRows}

## En yoğun 25 dosya

| Dosya | Bulgu |
|---|---:|
${topFiles}

## Yorum

Bu tablo, mevcut test ve doğrulama altyapısının neden yanıltıcı yeşil verdiğini
açıklar. \`npm run test:deterministic\` 162 assertion'ın tamamını geçirip exit 0
dönerken, aynı koşuda 13 skip marker basılmaktadır — yani veritabanı yokken
kontroller atlanmakta ve sonuç yine \`SUCCESSFUL PASS\` olarak raporlanmaktadır.

Master plan §7 gereği bu kalıpların tamamı **PASS sayılmaz**. Bulgular
ilgili fazlarda kapatılır:

- \`assert-true\`, \`skip-then-pass\`, \`weak-e2e-assertion\` → P19 (sahte validation script'lerinin silinmesi)
- \`simulation-generator\`, \`fallback-success\`, \`literal-run-count\` → P11, P12
- \`fabricated-hash\`, \`hardcoded-metric\`, \`fabricated-diff\`, \`stub-dependency\` → P08, P09, P15
- \`embedded-secret\` → P03 (kod), P17 (credential rotasyonu)
- \`permissive-fallback\` → P02, P19
- \`random-primary-key\` → P01

P17'de (\`Y-P17-008\`) bu script \`--gate\` moduyla CI'a bağlanır ve bulgu > 0 ise
build **fail** eder.
`
  );

  console.log(`[audit] False-green scan -> docs/audit/2026-08-13-truth-audit/10-test-honesty.md`);
  console.log(`[audit]   files scanned : ${targets.length}`);
  console.log(`[audit]   findings      : ${findings.length}  (P0=${p0}, P1=${p1})`);
  for (const [rule, count] of [...byRule.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`[audit]     ${rule.padEnd(22)} ${count}`);
  }

  if (gateMode && findings.length > 0) {
    console.error(`\n[GATE FAIL] ${findings.length} false-green bulgusu var (P0=${p0}).`);
    process.exit(1);
  }
}

main();
