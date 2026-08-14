import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");

/**
 * P17 / A9 — KAYNAK DOSYALARINDA LİTERAL KONTROL KARAKTERİ YOK.
 *
 * `packages/graph/src/builder.ts` üç adet **literal NUL baytı** (0x00)
 * içeriyordu; import ve kenar anahtarlarında ayıraç olarak kullanılıyordu.
 *
 * Çalışma zamanı açısından sorun yoktu. Sorun ARAÇLARDAYDI: `file(1)`
 * dosyayı `data`, `grep` ise "Binary file matches" olarak görüyor ve
 * **eşleşen satırları hiç göstermiyordu**. 694 satırlık bir kaynak
 * dosyası, satır bazlı her aramaya görünmez hâle geliyordu.
 *
 * Bu denetim sırasında fiilen yaşandı: ADR atıflarını tararken çıktıda
 * satır yerine "Binary file ... matches" göründü.
 *
 * Ayıracın NUL olması DOĞRU — dosya yolunda ve sembol adında geçemeyeceği
 * garanti olan tek karakter. Değişen şey ayıraç değil, kaynakta nasıl
 * yazıldığı: artık kaçış dizisi.
 *
 * NOT: bu dosya ayıracı `String.fromCharCode(0)` ile kurar. Kaçış
 * dizisiyle yazsaydı testin kendisi taramaya takılmazdı ama okuyan için
 * belirsiz kalırdı — burada niyet, karakterin kod noktasını açıkça
 * söylemek.
 */

const NUL = String.fromCharCode(0);

const SKIP = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  "playwright-report",
  "test-results"
]);

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) sourceFiles(full, acc);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry)) acc.push(full);
  }
  return acc;
}

describe("kaynak hijyeni — literal kontrol karakteri yok", () => {
  const files = sourceFiles(REPO);

  it("POZİTİF KONTROL: tarama gerçekten dosya buluyor", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("hiçbir kaynak dosyası literal NUL baytı içermiyor", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const buf = readFileSync(file);
      let count = 0;
      for (const byte of buf) if (byte === 0) count++;
      if (count > 0) offenders.push(`${file.slice(REPO.length + 1)}: ${count} NUL`);
    }
    expect(
      offenders,
      "Literal NUL bayti iceren dosyalar grep tarafindan binary sayilir " +
        "ve eslesen satirlari GOSTERILMEZ. Kacis dizisi kullanin."
    ).toEqual([]);
  });

  it("builder.ts artık satır bazlı okunabiliyor", () => {
    const text = readFileSync(join(REPO, "packages/graph/src/builder.ts"), "utf-8");
    expect(text).toContain("pairKey");
    expect(text.includes(NUL)).toBe(false);
    expect(text.split("\n").length).toBeGreaterThan(500);
  });
});

describe("ayıraç davranışı değişmedi", () => {
  it("kaçış dizisi literal NUL ile AYNI karakteri üretir", () => {
    expect("\u0000".charCodeAt(0)).toBe(0);
    expect("\u0000").toBe(NUL);
    expect("\u0000".length).toBe(1);
  });

  it("ayıraç bileşik anahtarı hâlâ ayırıyor", () => {
    const key = `src/a.ts${NUL}./b`;
    const [path, specifier] = key.split(NUL);
    expect(path).toBe("src/a.ts");
    expect(specifier).toBe("./b");
  });

  it("ayıraç yol veya sembol adında GEÇEMEZ — çakışma imkânsız", () => {
    // Ayiracin NUL secilmesinin gerekcesi bu. Baska bir ayirac (ornegin
    // "|" ya da ":") gercek bir yol veya sembol adinda gecebilir ve iki
    // farkli anahtari ayni gostererek kenar kaybina yol acardi.
    const realisticPaths = [
      "src/a.ts",
      "packages/graph/src/builder.ts",
      "src/weird|name.ts",
      "src/a:b.ts",
      "src/bosluk olan.ts"
    ];
    for (const p of realisticPaths) {
      expect(p.includes(NUL)).toBe(false);
    }
  });
});
