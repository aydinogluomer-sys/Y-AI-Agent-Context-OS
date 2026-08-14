import { describe, it, expect, beforeEach } from "vitest";
import {
  StructuredLogger,
  levelFromEnv,
  runWithContext,
  withContext,
  currentContext,
  hasContext,
  Tracer,
  InMemorySpanExporter,
  type LogRecord
} from "./index";

function capture() {
  const lines: string[] = [];
  return {
    lines,
    sink: (line: string) => lines.push(line),
    records: () => lines.map((l) => JSON.parse(l) as LogRecord)
  };
}

const FIXED = () => new Date("2026-08-14T12:00:00.000Z");

/**
 * P18 / Y-P18-001, Y-P18-002 — yapılandırılmış logger.
 *
 * Öncesi ölçüldü: `apps/api/src/logger.ts` bir `logPayload` nesnesi
 * KURUYOR ve HİÇ KULLANMIYORDU; çıktı biçimlenmiş metindi ve hiçbir satır
 * korelasyon anahtarı taşımıyordu.
 */
describe("StructuredLogger — JSON çıktı", () => {
  it("her satır geçerli JSON", () => {
    const out = capture();
    const log = new StructuredLogger("test", { sink: out.sink, now: FIXED });
    log.info("merhaba", { a: 1 });
    expect(() => JSON.parse(out.lines[0])).not.toThrow();
  });

  it("zorunlu alanları taşır", () => {
    const out = capture();
    new StructuredLogger("api", { sink: out.sink, now: FIXED }).warn("dikkat");
    const [r] = out.records();
    expect(r.timestamp).toBe("2026-08-14T12:00:00.000Z");
    expect(r.level).toBe("WARN");
    expect(r.logger).toBe("api");
    expect(r.message).toBe("dikkat");
  });

  it("boş meta ALAN ÜRETMEZ", () => {
    // Her satira bos bir `meta: {}` koymak, log hacmini bilgi eklemeden
    // buyutur.
    const out = capture();
    const log = new StructuredLogger("t", { sink: out.sink, now: FIXED });
    log.info("mesaj");
    log.info("mesaj", {});
    expect(out.records().every((r) => r.meta === undefined)).toBe(true);
  });
});

describe("korelasyon OTOMATİK taşınır (ADR-067)", () => {
  it("bağlam içindeki log korelasyon anahtarı taşır", () => {
    const out = capture();
    const log = new StructuredLogger("t", { sink: out.sink, now: FIXED });

    runWithContext({ correlationId: "corr-1", runId: "run-9" }, () => {
      log.info("islem");
    });

    const [r] = out.records();
    expect(r.correlationId).toBe("corr-1");
    expect(r.runId).toBe("run-9");
  });

  it("bağlam ASENKRON sınırları aşar", async () => {
    // Bu, AsyncLocalStorage secmenin butun sebebi: korelasyonu her
    // fonksiyon imzasindan gecirmek, BIR tanesini unutunca sessizce
    // korelasyonsuz log uretirdi.
    const out = capture();
    const log = new StructuredLogger("t", { sink: out.sink, now: FIXED });

    await runWithContext({ correlationId: "corr-2", runId: "run-x" }, async () => {
      await new Promise((r) => setTimeout(r, 1));
      await Promise.resolve();
      log.info("derin cagri");
    });

    expect(out.records()[0].runId).toBe("run-x");
  });

  it("bağlam DIŞINDA log korelasyonsuz kalır ve SAYILIR", () => {
    // Bu bir hata olmayabilir (surec baslangici, cron) ama GORUNUR
    // olmali - Y-P18-002'nin kabul kriteri bu.
    const out = capture();
    const log = new StructuredLogger("t", { sink: out.sink, now: FIXED });
    log.info("baglamsiz");

    expect(out.records()[0].correlationId).toBeUndefined();
    expect(log.stats().uncorrelated).toBe(1);
  });

  it("withContext üst bağlamı KİRLETMEZ", () => {
    const out = capture();
    const log = new StructuredLogger("t", { sink: out.sink, now: FIXED });

    runWithContext({ correlationId: "c" }, () => {
      withContext({ runId: "alt-run" }, () => log.info("alt"));
      log.info("ust");
    });

    const [alt, ust] = out.records();
    expect(alt.runId).toBe("alt-run");
    expect(ust.runId).toBeUndefined();
  });

  it("bağlamsız withContext correlationId olmadan REDDEDİLİR", () => {
    expect(() => withContext({ runId: "r" }, () => 1)).toThrow(/correlationId/);
  });

  it("hasContext bağlamı doğru bildirir", () => {
    expect(hasContext()).toBe(false);
    runWithContext({ correlationId: "c" }, () => {
      expect(hasContext()).toBe(true);
      expect(currentContext()?.correlationId).toBe("c");
    });
  });
});

describe("redaksiyon", () => {
  const redact = (t: string) => t.replace(/sk-[A-Za-z0-9]+/g, "[REDACTED]");

  it("mesajdaki sır redakte edilir", () => {
    const out = capture();
    new StructuredLogger("t", { sink: out.sink, now: FIXED, redact }).error(
      "token sk-abc123 basarisiz"
    );
    expect(out.records()[0].message).toBe("token [REDACTED] basarisiz");
  });

  it("İÇ İÇE meta içindeki sır da redakte edilir", () => {
    // Alan alan gezmek ic ice yapiyi kacirirdi; redaksiyon
    // serilestirilmis metin uzerinde yapiliyor.
    const out = capture();
    new StructuredLogger("t", { sink: out.sink, now: FIXED, redact }).info("x", {
      outer: { inner: { key: "sk-deep999" } }
    });
    expect(JSON.stringify(out.records()[0].meta)).toContain("[REDACTED]");
    expect(JSON.stringify(out.records()[0].meta)).not.toContain("sk-deep999");
  });
});

describe("seviye eşiği", () => {
  it("eşik altındaki satır SESSİZCE kaybolmaz, sayılır", () => {
    const out = capture();
    const log = new StructuredLogger("t", { level: "warn", sink: out.sink, now: FIXED });
    log.debug("a");
    log.info("b");
    log.warn("c");

    expect(out.lines).toHaveLength(1);
    expect(log.stats().suppressed).toBe(2);
    expect(log.stats().emitted).toBe(1);
  });

  it("child logger SEVİYEYİ devralır", () => {
    // Tasinmazsa alt logger varsayilana doner ve `debug` ile kurulmus bir
    // sistemde alt bilesenler sessizce sessizlesir.
    const out = capture();
    const parent = new StructuredLogger("p", { level: "debug", sink: out.sink, now: FIXED });
    parent.child("c").debug("gorunmeli");
    expect(out.lines).toHaveLength(1);
    expect(out.records()[0].logger).toBe("p.c");
  });

  it("geçersiz seviye SESSİZCE kabul edilmez", () => {
    expect(() => levelFromEnv("verbose")).toThrow(RangeError);
    expect(levelFromEnv(undefined)).toBe("info");
    expect(levelFromEnv("ERROR")).toBe("error");
  });
});

/**
 * P18 / Y-P18-004 — tracing.
 *
 * Kabul kriteri: "Bir run'ın tam trace'i tek `run_id` ile bulunabiliyor."
 */
describe("Tracer — span zinciri", () => {
  let exporter: InMemorySpanExporter;
  let tracer: Tracer;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    tracer = new Tracer(exporter);
  });

  it("span W3C Trace Context biçiminde kimlik taşır", () => {
    runWithContext({ correlationId: "c" }, () => {
      tracer.startActiveSpan("islem", {}, () => 1);
    });
    const [span] = exporter.all();
    expect(span.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(span.spanId).toMatch(/^[0-9a-f]{16}$/);
  });

  it("iç içe span'lar ebeveyn-çocuk zinciri kurar", () => {
    runWithContext({ correlationId: "c" }, () => {
      tracer.startActiveSpan("ust", {}, () => {
        tracer.startActiveSpan("alt", {}, () => 1);
      });
    });

    const spans = exporter.all();
    const alt = spans.find((s) => s.name === "alt")!;
    const ust = spans.find((s) => s.name === "ust")!;
    expect(alt.parentSpanId).toBe(ust.spanId);
    expect(alt.traceId).toBe(ust.traceId);
    expect(ust.parentSpanId).toBeNull();
  });

  it("KABUL KRİTERİ: bir run'ın tam trace'i run_id ile bulunuyor", () => {
    runWithContext({ correlationId: "c1", runId: "run-A" }, () => {
      tracer.startActiveSpan("context.compile", {}, () => {
        tracer.startActiveSpan("retrieval", {}, () => 1);
        tracer.startActiveSpan("ranking", {}, () => 1);
      });
    });
    runWithContext({ correlationId: "c2", runId: "run-B" }, () => {
      tracer.startActiveSpan("context.compile", {}, () => 1);
    });

    const trace = exporter.byRunId("run-A");
    expect(trace).toHaveLength(3);
    expect(trace.map((s) => s.name)).toEqual(["context.compile", "retrieval", "ranking"]);
    // Hepsi AYNI trace'te.
    expect(new Set(trace.map((s) => s.traceId)).size).toBe(1);
    // run-B karismiyor.
    expect(exporter.byRunId("run-B")).toHaveLength(1);
  });

  it("HATA durumunda da span KAPANIR ve error işaretlenir", () => {
    // Hata firlatan bir islemin suresi, basarili olanlardan daha ilginctir.
    expect(() =>
      runWithContext({ correlationId: "c" }, () => {
        tracer.startActiveSpan("patlayan", {}, () => {
          throw new Error("boom");
        });
      })
    ).toThrow("boom");

    const [span] = exporter.all();
    expect(span.status).toBe("error");
    expect(span.endedAt).not.toBeNull();
  });

  it("hata YUTULMAZ — yeniden fırlatılır", () => {
    let caught: unknown;
    try {
      runWithContext({ correlationId: "c" }, () =>
        tracer.startActiveSpan("x", {}, () => {
          throw new TypeError("ozel");
        })
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(TypeError);
  });

  it("asenkron span da zinciri korur", async () => {
    await runWithContext({ correlationId: "c", runId: "run-async" }, async () => {
      await tracer.startActiveSpanAsync("ust", {}, async () => {
        await tracer.startActiveSpanAsync("alt", {}, async () => 1);
      });
    });

    const trace = exporter.byRunId("run-async");
    expect(trace).toHaveLength(2);
    const alt = trace.find((s) => s.name === "alt")!;
    const ust = trace.find((s) => s.name === "ust")!;
    expect(alt.parentSpanId).toBe(ust.spanId);
  });

  it("exporter taşan span'ları SESSİZCE atmaz, sayar", () => {
    const small = new InMemorySpanExporter(2);
    const t = new Tracer(small);
    runWithContext({ correlationId: "c" }, () => {
      for (let i = 0; i < 5; i++) t.startActiveSpan(`s${i}`, {}, () => 1);
    });
    expect(small.all()).toHaveLength(2);
    expect(small.dropped()).toBe(3);
  });

  it("span attribute'ları taşır", () => {
    runWithContext({ correlationId: "c" }, () => {
      tracer.startActiveSpan("db.query", { attributes: { table: "symbols", rows: 42 } }, () => 1);
    });
    expect(exporter.all()[0].attributes).toEqual({ table: "symbols", rows: 42 });
  });
});
