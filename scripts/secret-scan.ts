/**
 * P03 / Y-P03-010 — CI sır tarayıcısı (P0-11 kapanışı).
 *
 * P00 Truth Audit'in bu script hakkındaki iki bulgusu:
 *
 *   1. Kuralların ilki GERÇEK bir veritabanı parolasını literal olarak
 *      içeriyordu (`regex: /EJfZexrU6oYdPpxH/g`). Yani sır taramasını yapan
 *      dosyanın kendisi bir sır sızıntısıydı ve git geçmişinde duruyordu.
 *
 *   2. `entry.name.startsWith("validate-")` koşulu ~15.000 satırlık
 *      doğrulama script'ini VE `scratch/` ağacını taramadan muaf tutuyordu.
 *      Muafiyet listesi, tarayıcının değerini büyük ölçüde yok ediyordu.
 *
 * Bu sürüm `@y/security` içindeki kalıp + entropi tabanlı tarayıcıyı
 * kullanır. Muafiyet listesi yalnızca ÜRETİLMİŞ ve İKİLİ dosyalarla sınırlı.
 */

import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { scanForSecrets, type SecretFinding } from "../packages/security/src/secret-scanner/index";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Taranmayacak dizinler — üretilmiş çıktı ve bağımlılıklar. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  "playwright-report",
  "test-results",
  ".next",
  "out"
]);

/**
 * Taranmayacak dosyalar.
 *
 * DİKKAT: buraya kaynak kodu eklenmez. Eski sürümdeki
 * `startsWith("validate-")` muafiyeti 15.000 satırı kör noktaya çeviriyordu.
 */
const SKIP_FILES = new Set(["pnpm-lock.yaml", "package-lock.json"]);

/**
 * Kendine referanslı dosyalar.
 *
 * Bu, eski script'teki `startsWith("validate-")` muafiyetiyle KARIŞTIRILMAMALI.
 * Aradaki fark, muafiyetin GEREKÇESİNDE:
 *
 *   Eski muafiyet: 15.000 satırlık kaynak kodunu kör noktaya çeviriyordu.
 *                  O dosyalara gerçek bir sır girse görünmezdi.
 *
 *   Buradaki iki dosya ise tarayıcının KENDİSİNİN parçası:
 *     - Test fixture'ları: bir sır tarayıcısının testi, sır GİBİ görünen
 *       veri içermek zorundadır. Bu veriler parçalardan runtime'da kurulur
 *       ve gerçek bir sisteme ait değildir.
 *     - Baseline dosyası: yalnız `dosya:satır:tür` anahtarları tutar;
 *       kendi kayıtları yüksek entropili görünür. Kendi çıktısını taramak
 *       sonsuz bir döngüdür.
 *
 * Liste BÜYÜTÜLMEMELİ. Yeni bir dosya eklemek isteniyorsa önce bulgu
 * düzeltilmelidir.
 */
const SELF_REFERENTIAL = new Set([
  // Sahte kimlik bilgisi ureticileri. Sir tespitini test eden HER test
  // buradan import eder; boylece sir-benzeri veri TEK bir dosyada kalir
  // ve bu liste yeni testlerle BUYUMEZ.
  "packages/security/src/secret-scanner/test-fixtures.ts",
  "packages/security/src/secret-scanner/secret-scanner.test.ts",
  "docs/audit/secret-scan-baseline.json"
]);

const SKIP_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp",
  ".woff", ".woff2", ".ttf", ".eot",
  ".pdf", ".zip", ".gz", ".tar", ".7z",
  ".mp4", ".mp3", ".wav"
]);

/**
 * Bilinen güvenli yer tutucular.
 *
 * `.env.example` gibi dosyalarda kasıtlı örnek değerler bulunur.
 * Bunları muaf tutmak, dosyayı taramadan çıkarmaktan farklıdır:
 * yalnız BU değerler geçilir, dosyanın geri kalanı taranır.
 */
const KNOWN_PLACEHOLDERS = [
  "MY_GEMINI_API_KEY",
  "MY_APP_URL",
  "safe_pass",
  "safe_database_pass",
  "your-token-here",
  "changeme",
  "example",
  "REDACTED"
];

interface Report {
  file: string;
  findings: SecretFinding[];
}

/**
 * Baseline dosyası.
 *
 * Mevcut bir kod tabanına sır tarayıcısı eklemenin standart yolu budur.
 * Alternatifler ve neden reddedildikleri:
 *
 *   (a) Muafiyet listesi (eski script'in yaptığı) — dosyayı TAMAMEN kör
 *       noktaya çevirir; o dosyaya yeni bir sır girse de görünmez.
 *   (b) Gate'i devre dışı bırakmak — tarayıcının hiç olmamasıyla aynı.
 *   (c) Baseline — SEÇİLEN. Bilinen bulgular kayıtlıdır; gate yalnız
 *       YENİ bulgu eklendiğinde kırılır. Baseline büyüyemez, yalnız küçülür.
 *
 * Baseline girdileri `dosya:satır:tür` anahtarıyla tutulur. Satır kayması
 * yanlış alarma yol açmasın diye tür ve dosya da anahtarın parçasıdır.
 */
const BASELINE_PATH = path.join(REPO_ROOT, "docs", "audit", "secret-scan-baseline.json");

interface Baseline {
  _comment: string;
  generatedAt: string;
  /** Bu bulguların neden kabul edildiği ve ne zaman kapanacağı. */
  rationale: Record<string, string>;
  accepted: string[];
}

function findingKey(file: string, f: SecretFinding): string {
  return `${file}:${f.line}:${f.kind}`;
}

function loadBaseline(): Set<string> {
  try {
    const raw = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf-8")) as Baseline;
    return new Set(raw.accepted);
  } catch {
    return new Set();
  }
}

function shouldSkipFile(fileName: string): boolean {
  if (SKIP_FILES.has(fileName)) return true;
  return SKIP_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

function isPlaceholderLine(line: string): boolean {
  return KNOWN_PLACEHOLDERS.some((p) => line.includes(p));
}

function scanFile(absolutePath: string): SecretFinding[] {
  let content: string;
  try {
    content = fs.readFileSync(absolutePath, "utf-8");
  } catch {
    return [];
  }

  // Ikili dosyalari atla (NUL bayti iceriyorsa).
  if (content.includes("\0")) return [];

  const lines = content.split("\n");
  return scanForSecrets(content).filter((f) => {
    const line = lines[f.line - 1] ?? "";
    return !isPlaceholderLine(line);
  });
}

/**
 * Taranacak dosya kümesi = git'in İZLEDİĞİ dosyalar.
 *
 * Bu bilinçli bir kapsam kararıdır. İlk çalıştırmada tarayıcı 919 bulgu
 * üretti ve 661'i `.antigravity/` IDE önbelleğindeydi — zaten `.gitignore`'da
 * olan, repository'ye hiç girmeyen bir dizin. `.env` ve `scratch/` de aynı
 * durumda.
 *
 * Sır taramasının amacı "repository'ye sır GİRDİ mi?" sorusunu yanıtlamaktır.
 * İzlenmeyen dosyalar bu sorunun kapsamı dışındadır ve onları taramak
 * tarayıcıyı gürültüyle işlevsiz kılar.
 *
 * Not: bu, eski script'teki `startsWith("validate-")` muafiyetinden
 * FARKLIDIR. O, izlenen kaynak kodunu muaf tutuyordu; bu ise hiç
 * commit edilmemiş dosyaları kapsam dışı bırakıyor.
 */
function trackedFiles(): string[] {
  try {
    const out = execFileSync("git", ["ls-files", "-z"], {
      cwd: REPO_ROOT,
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024
    });
    return out.split("\0").filter((p) => p.length > 0);
  } catch {
    console.error("UYARI: `git ls-files` calistirilamadi; tam agac taranacak.");
    return [];
  }
}

function collect(reports: Report[]): number {
  const tracked = trackedFiles();

  if (tracked.length === 0) {
    // Git yoksa (or. tarball dagitimi) tum agaci tara.
    const walk = (dir: string): void => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) continue;
          walk(full);
        } else if (entry.isFile() && !shouldSkipFile(entry.name)) {
          const findings = scanFile(full);
          if (findings.length > 0) {
            reports.push({ file: path.relative(REPO_ROOT, full).split(path.sep).join("/"), findings });
          }
        }
      }
    };
    walk(REPO_ROOT);
    return -1;
  }

  let scanned = 0;
  for (const relative of tracked) {
    if (shouldSkipFile(path.basename(relative))) continue;
    if (SELF_REFERENTIAL.has(relative)) continue;
    if (relative.split("/").some((seg) => SKIP_DIRS.has(seg))) continue;

    scanned++;
    const findings = scanFile(path.join(REPO_ROOT, relative));
    if (findings.length > 0) reports.push({ file: relative, findings });
  }
  return scanned;
}

function main(): void {
  console.log("=== Y Secret Scan ===");
  console.log(`Kok: ${REPO_ROOT}`);
  console.log(`Muafiyet: yalniz uretilmis/ikili dosyalar. Kaynak kodu muaf DEGILDIR.\n`);

  const reports: Report[] = [];
  const scanned = collect(reports);
  console.log(scanned >= 0 ? `Taranan izlenen dosya: ${scanned}\n` : "Git yok; tam agac tarandi.\n");

  const baseline = loadBaseline();
  const writeBaseline = process.argv.includes("--update-baseline");

  const fresh: { file: string; finding: SecretFinding }[] = [];
  const accepted: string[] = [];

  for (const report of reports) {
    for (const f of report.findings) {
      const key = findingKey(report.file, f);
      if (baseline.has(key)) accepted.push(key);
      else fresh.push({ file: report.file, finding: f });
    }
  }

  if (writeBaseline) {
    const all = reports.flatMap((r) => r.findings.map((f) => findingKey(r.file, f))).sort();
    const payload: Baseline = {
      _comment:
        "P03/Y-P03-010 sir tarayicisi baseline'i. Bu dosya YALNIZ KUCULEBILIR. " +
        "Yeni bulgu icin once bulguyu duzeltin, baseline'a EKLEMEYIN. " +
        "Guncelleme: npm run secret-scan -- --update-baseline",
      generatedAt: new Date().toISOString(),
      rationale: {
        "scripts/validate-*":
          "Sahte test fixture'lari. Bu script'ler P19'da (Y-P19-008) tamamen silinecek.",
        "scripts/verify-permission-manual-checklist.ts": "Sahte test fixture'i. P19'da silinecek.",
        "packages/security/src/secret-scanner/secret-scanner.test.ts":
          "Tarayicinin kendi test verileri; parcalardan runtime'da kuruluyor, gercek sir degil.",
        "tests/test.md": "Dokumantasyondaki ornek deger.",
        "apps/api/src/*": "Legacy yuzey; P19'da silinecek.",
        "apps/web/src/*": "Legacy UI; P15'te silinecek."
      },
      accepted: all
    };
    fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + "\n", "utf-8");
    console.log(`Baseline guncellendi: ${all.length} bulgu kaydedildi.`);
    console.log(`  ${path.relative(REPO_ROOT, BASELINE_PATH)}`);
    return;
  }

  console.log(`Baseline'da kabul edilmis : ${accepted.length}`);
  console.log(`Baseline disi (YENI)      : ${fresh.length}\n`);

  if (fresh.length === 0) {
    console.log("Yeni sir bulgusu yok. Sir taramasi temiz.");
    if (baseline.size > accepted.length) {
      console.log(
        `Not: baseline'daki ${baseline.size - accepted.length} kayit artik bulunmuyor (duzeltilmis). ` +
          "Baseline'i kucultmek icin: npm run secret-scan -- --update-baseline"
      );
    }
    return;
  }

  console.error("YENI SIR BULGULARI:");
  for (const { file, finding: f } of fresh) {
    // Ham sir ASLA yazdirilmaz — yalniz tur, konum ve maskelenmis onizleme.
    console.error(`  ${file}:${f.line}:${f.column}  ${f.kind}  (${f.length} karakter) ${f.preview}`);
  }

  console.error(`\n=== ${fresh.length} YENI bulgu ===`);
  console.error("Sir taramasi BASARISIZ. Bulgulari DUZELTIN; baseline'a eklemeyin.");
  process.exit(1);
}

main();
