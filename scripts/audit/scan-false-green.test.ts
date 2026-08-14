import { describe, it, expect } from "vitest";
import { RULES } from "./scan-false-green";

function ruleById(id: string) {
  const rule = RULES.find((r) => r.id === id);
  if (!rule) throw new Error(`Kural yok: ${id}`);
  return rule;
}

/** Tarayicinin bir satiri o kural icin bulgu sayip saymayacagi. */
function matches(id: string, file: string, line: string): boolean {
  const rule = ruleById(id);
  if (rule.exclude && rule.exclude.test(file)) return false;
  if (rule.include && !rule.include.test(file)) return false;
  return rule.pattern.test(line);
}

describe("skip-then-pass kurali — kapsam", () => {
  const PROD_LOG =
    '    sysLogger.info("Skipping mock data pre-seeding as mock database mode is inactive.");';

  it("URETIM kodundaki dogru bir 'atlama' gunlugunu bulgu SAYMAZ", () => {
    // "Atla ve yine de PASS say" bir TEST VERDIKTININ bozulmasidir.
    // Uretim kodunun bozacak bir verdikti yoktur; bu satir dogru
    // davranisi dogru sekilde gunluge yaziyor.
    expect(matches("skip-then-pass", "apps/api/src/index.ts", PROD_LOG)).toBe(false);
    expect(matches("skip-then-pass", "packages/core/src/x.ts", PROD_LOG)).toBe(false);
  });

  it("DOGRULAMA script'lerinde AYNI satiri bulgu SAYAR", () => {
    // POZITIF KONTROL: kural kapsam yuzunden tamamen olu kalmis olsaydi
    // ustteki test de gecerdi. Ayni metnin dogru yuzeyde YAKALANDIGINI
    // kanitla.
    const SCRIPT_LOG =
      '    console.warn("  Skipping integration tests: DATABASE_URL is unavailable or offline.");';
    expect(matches("skip-then-pass", "scripts/validate-vault.ts", SCRIPT_LOG)).toBe(true);
    expect(matches("skip-then-pass", "scripts/validate-segment-1-10.ts", SCRIPT_LOG)).toBe(true);
  });

  it("test ve spec dosyalarinda da yakalar", () => {
    const L = '  it.skip("Skipping live database check", () => {});';
    expect(matches("skip-then-pass", "packages/graph/src/traversal.test.ts", L)).toBe(true);
    expect(matches("skip-then-pass", "tests/e2e/run.spec.ts", L)).toBe(true);
  });

  it("Windows ters bolu ile verilen yollarda da calisir", () => {
    // Ters boluyu KOD NOKTASINDAN kuruyoruz. Dize kacisiyla yazmak
    // ("scripts\validate...") kirilgan: bir katman kacisi daraltirsa
    // dize sessizce "scripts" + dikey-sekme + "alidate..." olur ve test
    // olcmek istedigi seyi olcmez. Bu tam olarak bir kez yasandi.
    const BACKSLASH = String.fromCharCode(92);
    const winPath = `scripts${BACKSLASH}validate-vault.ts`;
    expect(winPath.charCodeAt(7)).toBe(92); // yol gercekten ters bolulu

    const L = '    console.warn("Skipping integration DB checks");';
    expect(matches("skip-then-pass", winPath, L)).toBe(true);
  });
});

describe("skip-then-pass kurali — tespit edicinin kendisi muaf", () => {
  const DETECTOR_LINE = "  /skipping (?:part|stage|integration|live|sql)[^\r\n]*/gi,";
  const FIXTURE_LINE =
    '  detectSkipMarkers("Stage result: PASS ... Skipping live database trigger assertions.")';

  it("validation-suite.ts (tespit edicinin KENDISI) muaf", () => {
    // Bir kalibi tespit eden arac o kalibi ICERMEK ZORUNDADIR. Bunu bulgu
    // saymak, kacinmanin tek yolunu "tespit edicinin kaliplarini sil"
    // haline getirirdi — yani tarayiciyi korlestirirdi.
    expect(matches("skip-then-pass", "scripts/validation-suite.ts", DETECTOR_LINE)).toBe(false);
  });

  it("validate-phase-2-runner.ts (tespit edicinin TESTI) muaf", () => {
    expect(matches("skip-then-pass", "scripts/validate-phase-2-runner.ts", FIXTURE_LINE)).toBe(
      false
    );
  });

  it("POZITIF KONTROL: muafiyet DAR — ayni satir baska bir script'te yakalanir", () => {
    // Muafiyet cok genis olsaydi (ornegin tum scripts/) ustteki iki test
    // yine gecerdi ama kural olu olurdu.
    expect(matches("skip-then-pass", "scripts/validate-vault.ts", FIXTURE_LINE)).toBe(true);
    expect(matches("skip-then-pass", "scripts/validate-segment-1-10.ts", FIXTURE_LINE)).toBe(true);
  });
});

describe("kural envanteri saglam", () => {
  it("kural kimlikleri benzersiz", () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("her kuralin aciklamasi ve siddeti var", () => {
    for (const r of RULES) {
      expect(r.description.length).toBeGreaterThan(5);
      expect(["P0", "P1", "P2"]).toContain(r.severity);
    }
  });

  it("POZITIF KONTROL: RULES gercekten dolu", () => {
    expect(RULES.length).toBeGreaterThan(5);
  });
});
