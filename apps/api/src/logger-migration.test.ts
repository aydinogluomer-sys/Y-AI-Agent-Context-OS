import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runWithContext } from "@y/observability";
import { UnifiedLogger } from "./logger";

const HERE = dirname(fileURLToPath(import.meta.url));
const LOGGER_SRC = readFileSync(resolve(HERE, "./logger.ts"), "utf-8");
const CORRELATION_SRC = readFileSync(resolve(HERE, "./middleware/correlation.ts"), "utf-8");

/**
 * P18 / Y-P18-002 — LOGGER GÖÇÜ.
 *
 * Kabul kriteri (faz dosyası): *"Korelasyon taşımayan log satırı yok."*
 *
 * Öncesi ölçüldü: `UnifiedLogger` bir `logPayload` nesnesi kuruyor ve
 * **hiç kullanmıyordu**; çıktı biçimlenmiş metindi ve hiçbir satır
 * korelasyon anahtarı taşımıyordu.
 */

function captureLogger(name = "TEST") {
  const lines: string[] = [];
  const logger = new UnifiedLogger(name);
  // Sink'i test icin degistiriyoruz; redaksiyon ve seviye karari
  // UnifiedLogger'da kaldigi icin gercek yol test ediliyor.
  const inner = (logger as unknown as { inner: { sink: (l: string) => void } }).inner;
  (inner as unknown as { sink: (l: string) => void }).sink = (l) => lines.push(l);
  return { logger, lines, records: () => lines.map((l) => JSON.parse(l)) };
}

describe("logger göçü — çıktı JSON", () => {
  it("çıktı biçimlenmiş metin DEĞİL, ayrıştırılabilir JSON", () => {
    const c = captureLogger("SYSTEM");
    runWithContext({ correlationId: "corr-1" }, () => c.logger.info("test mesaji"));

    expect(c.lines).toHaveLength(1);
    expect(() => JSON.parse(c.lines[0])).not.toThrow();
    // Eski bicim `[timestamp] [Y-OS:INFO] ...` idi.
    expect(c.lines[0].startsWith("[")).toBe(false);
  });

  it("KABUL KRİTERİ: bağlam içindeki satır korelasyon taşır", () => {
    const c = captureLogger();
    runWithContext({ correlationId: "corr-2", runId: "run-7" }, () => {
      c.logger.info("a");
      c.logger.warn("b");
      c.logger.error("c");
    });

    const records = c.records();
    expect(records).toHaveLength(3);
    for (const r of records) {
      expect(r.correlationId).toBe("corr-2");
      expect(r.runId).toBe("run-7");
    }
    expect(c.logger.stats().uncorrelated).toBe(0);
  });

  it("bağlam dışındaki satır SAYILIR — sessizce kaybolmaz", () => {
    const c = captureLogger();
    c.logger.info("baglamsiz");
    expect(c.logger.stats().uncorrelated).toBe(1);
  });
});

describe("kaynak kilidi — eski davranış geri gelemez", () => {
  // Kaliplari PARCALARDAN kuruyoruz ki bu dosya taramada eslesmesin.
  const DEAD_PAYLOAD = "log" + "Payload";
  const FORMATTED = "formatted" + "Log";
  const NEWLINE = String.fromCharCode(10);

  function codeLines(src: string): string[] {
    return src
      .split(NEWLINE)
      .map((l) => l.trim())
      // Eski kalibi ACIKLAYAN yorumlar mesru.
      .filter((l) => !l.startsWith("*") && !l.startsWith("//") && !l.startsWith("/*"));
  }

  it("kullanılmayan logPayload nesnesi kalmadı", () => {
    expect(codeLines(LOGGER_SRC).filter((l) => l.includes(DEAD_PAYLOAD))).toEqual([]);
  });

  it("biçimlenmiş metin çıktısı kalmadı", () => {
    expect(codeLines(LOGGER_SRC).filter((l) => l.includes(FORMATTED))).toEqual([]);
  });

  it("logger doğrudan console'a yazmıyor", () => {
    // Dogrudan console cagrisi, sink degistirilemez hale getirir ve
    // testte gercek yolun dogrulanmasini imkansiz kilardi.
    const consoleCalls = codeLines(LOGGER_SRC).filter((l) => /console\.(log|info|warn|error|debug)/.test(l));
    expect(consoleCalls).toEqual([]);
  });

  it("redaksiyon HÂLÂ zorunlu", () => {
    expect(LOGGER_SRC).toContain("redactSecretLeaks");
  });

  it("korelasyon middleware'i AsyncLocalStorage bağlamı kuruyor", () => {
    // Baglami kurmadan yalniz `req` uzerine yazmak, eski durumdu: log
    // yazan kod `req`'e erisemedigi icin korelasyon tasimiyordu.
    expect(CORRELATION_SRC).toContain("runWithContext");
  });

  it("POZİTİF KONTROL: dosyalar gerçekten okunuyor", () => {
    expect(LOGGER_SRC.length).toBeGreaterThan(1000);
    expect(CORRELATION_SRC.length).toBeGreaterThan(500);
    expect(codeLines(LOGGER_SRC).length).toBeGreaterThan(20);
  });

  it("POZİTİF KONTROL: kalıplar gerçek metinde eşleşiyor", () => {
    expect(codeLines(`const ${DEAD_PAYLOAD} = {};`)).toHaveLength(1);
    expect(codeLines(`const ${FORMATTED} = "x";`)).toHaveLength(1);
  });
});
