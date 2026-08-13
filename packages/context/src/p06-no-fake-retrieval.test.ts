/**
 * P06 / Y-P06-012 — Sahte retrieval yollarının GERİ GELMEDİĞİNİN kanıtı.
 *
 * Bu dosya bir "negatif test"tir: bir şeyin çalıştığını değil, bir şeyin
 * ARTIK OLMADIĞINI doğrular. Bunun bir teste değmesinin sebebi, silinen
 * kodun silinme biçimidir — bu fonksiyonlar tek bir yerden değil,
 * onlarca çağrı noktasından kullanılıyordu ve bir tanesinin geri
 * gelmesi sessiz bir gerileme olurdu.
 *
 * ARANAN İSİMLER BU DOSYADA PARÇALI KURULUR
 *   Aksi halde tarama kendi kendini bulur ve test hiçbir zaman
 *   kırılmaz — P03'te bu tuzağa bir kez düşüldü (sır tarayıcısı kendi
 *   yorumunu yakalamıştı).
 */

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Taranan dosyalar.
 *
 * `--cached --others --exclude-standard`: izlenen dosyalara EK OLARAK
 * henüz commit edilmemiş yeni dosyalar da taranır. Yalnız `ls-files`
 * kullanmak, sahte bir yolu YENİ bir dosyada geri getiren bir
 * değişikliği kaçırırdı — bu testin pozitif kontrolü tam olarak bunu
 * yakaladı.
 */
function trackedSourceFiles(): string[] {
  const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.ts", "*.tsx"], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    maxBuffer: 32 * 1024 * 1024
  });
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    // Bu testin kendisi haric: aranan isimleri tanimi geregi iceriyor.
    .filter((file) => !file.endsWith("p06-no-fake-retrieval.test.ts"))
    // False-green tarayicisi da haric: kurallari YASAK KALIPLARIN adlarini
    // tasir. Bir dedektorun aradigi seyi adlandirmasi, o seyin geri
    // gelmesi degildir. Kural silinirse koruma zayiflar; bu yuzden
    // asagida ayri bir test onun VARLIGINI dogruluyor.
    .filter((file) => !file.endsWith("scripts/audit/scan-false-green.ts"));
}

function findOccurrences(needle: string): { file: string; line: number; text: string }[] {
  const hits: { file: string; line: number; text: string }[] = [];

  for (const file of trackedSourceFiles()) {
    let content: string;
    try {
      content = readFileSync(path.join(REPO_ROOT, file), "utf-8");
    } catch {
      continue;
    }
    if (!content.includes(needle)) continue;

    content.split(/\r?\n/).forEach((text, index) => {
      // Yorum satirlari ATLANIR: kaldirilan davranisi ANLATAN bir yorum,
      // davranisin kendisi degildir. Aksi halde silmenin gerekcesini
      // yazmak testi kirardi — ve bu, gerekce yazmamaya tesvik ederdi.
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

describe("P06 — sahte retrieval yolları kaynak ağacında yok", () => {
  it("sahte semantic arama fonksiyonu silinmiş", () => {
    // Bu fonksiyon keyword ortusmesi hesaplayip sonucu 30 ile carpip
    // `semantic_score` adiyla sunuyordu.
    const needle = "mockSemantic" + "SearchFallback";
    const hits = findOccurrences(needle);
    expect(hits, `Sahte semantic fonksiyonu geri gelmis:\n${describeHits(hits)}`).toEqual([]);
  });

  it("statik bellek stub modu silinmiş", () => {
    // Bu mod uc uydurma dosya donduruyordu; birinin adi
    // `src/services/auth.ts` idi ve hicbir repo'da varligi kontrol
    // edilmiyordu.
    const needle = "local_memory" + "_stub";
    const hits = findOccurrences(needle);
    expect(hits, `Statik stub modu geri gelmis:\n${describeHits(hits)}`).toEqual([]);
  });

  it("BM25 olmayan fonksiyonun BM25 adı silinmiş", () => {
    // Fonksiyon duruyor (mesru bir sinyal) ama adi artik yaptigi isi
    // anlatiyor: `scoreKeywordOverlap`.
    const needle = "scoreKeyword" + "BM25";
    const hits = findOccurrences(needle);
    expect(hits, `Yaniltici BM25 adi geri gelmis:\n${describeHits(hits)}`).toEqual([]);
  });

  it("`is_fallback_approx` bayrağı kalmamış", () => {
    // Bu bayrak "sonuc yaklasiktir" demek icin vardi ama hicbir yerde
    // OKUNMUYORDU. Okunmayan bir uyari, olmayan bir uyaridir.
    const needle = "is_fallback" + "_approx";
    const hits = findOccurrences(needle);
    expect(hits, `Okunmayan yaklasiklik bayragi geri gelmis:\n${describeHits(hits)}`).toEqual([]);
  });
});

describe("P06 — testin kendisi çalışıyor mu", () => {
  it("tarama gerçekten dosya okuyor (boş küme üzerinde çalışmıyor)", () => {
    // Bu kontrol olmadan yukaridaki dort test, `git ls-files` bos
    // dondugu icin de gecerdi — klasik yanlis yesil.
    expect(trackedSourceFiles().length).toBeGreaterThan(100);
  });

  it("false-green tarayıcısının kuralı hâlâ yerinde", () => {
    // Yukarida o dosya taramadan haric tutuldu. Haric tutulan bir dosyanin
    // korumasi da denetlenmeli: kural silinirse bu test kirilir.
    const scanner = readFileSync(
      path.join(REPO_ROOT, "scripts/audit/scan-false-green.ts"),
      "utf-8"
    );
    expect(scanner).toContain("mockSemantic" + "SearchFallback");
  });

  it("var olan bir ismi bulabiliyor (pozitif kontrol)", () => {
    // Tarama mantiginin calistigini gosteren kontrol: kesin var olan bir
    // sembol bulunmali. Bulunamiyorsa yukaridaki "bulunamadi" sonuclari
    // da anlamsizdir.
    const hits = findOccurrences("LexicalRetriever");
    expect(hits.length).toBeGreaterThan(0);
  });
});
