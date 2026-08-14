/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * P18 / Y-P18-004 — TRACING.
 *
 * Kabul kriteri (faz dosyası): *"Bir run'ın tam trace'i tek `run_id` ile
 * bulunabiliyor."*
 *
 * ## Kapsam kararı: veri modeli evet, OTLP hayır
 *
 * OpenTelemetry SDK'sı **kurulmadı**. Sebep, tembellik değil
 * doğrulanabilirlik:
 *
 * - SDK'nın asıl değeri **wire protokolü (OTLP) + collector
 *   entegrasyonudur**. Bir collector olmadan bu değerin çalıştığı
 *   doğrulanamaz — ve doğrulanamayan bir entegrasyonu "tamam" işaretlemek
 *   bu projede kapatılan kalıbın kendisidir.
 * - Bugün doğrulanabilen şey: span üretimi, ebeveyn-çocuk zinciri,
 *   `run_id` korelasyonu ve bir run'ın **tam trace'inin tek anahtarla
 *   bulunabilmesi**. Kabul kriterinin tamamı bu.
 *
 * Bu yüzden veri modeli **W3C Trace Context** biçimindedir (`traceId` 32
 * hex, `spanId` 16 hex) ve `SpanExporter` arayüzü OTel'in `SpanProcessor`
 * şekliyle uyumludur. Gerçek SDK bağlandığında dışa bakan yüzey
 * değişmez; değişen tek şey exporter implementasyonudur.
 *
 * **YAPILMAYAN:** OTLP ihracı, sampling politikası, collector
 * yapılandırması, otomatik enstrümantasyon (HTTP/pg). Kapanma koşulu:
 * çalışan bir collector.
 */

import { randomBytes } from "node:crypto";
import { currentContext, withContext } from "./context";

export type SpanStatus = "unset" | "ok" | "error";

export interface Span {
  /**
   * Monotonik uretim sirasi.
   *
   * Siralama icin zaman damgasi YETERSIZ: ayni milisaniyede baslayan
   * span'lar arasinda sira belirsiz kalir ve bir trace okunurken olaylar
   * yanlis sirada gorunur. Bir kanit sisteminde "once ne oldu" sorusunun
   * cevabi saat cozunurlugune birakilamaz.
   */
  readonly sequence: number;
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId: string | null;
  readonly name: string;
  readonly startedAt: number;
  endedAt: number | null;
  status: SpanStatus;
  readonly attributes: Record<string, string | number | boolean>;
  /** Kanıt için: bu span hangi run'a ait (ADR-067). */
  readonly runId: string | null;
}

export interface SpanExporter {
  export(span: Span): void;
}

/**
 * Test ve yerel teşhis için exporter.
 *
 * Üretimde bir OTLP exporter'ıyla değiştirilir. Bellek içi exporter'ın
 * sınırı **açıkça** belirtilmelidir: sınırsız büyür, bu yüzden
 * `maxSpans` ile sınırlıdır ve taşan span'lar SESSİZCE atılmaz, sayılır.
 */
export class InMemorySpanExporter implements SpanExporter {
  private readonly spans: Span[] = [];
  private droppedCount = 0;

  constructor(private readonly maxSpans = 10_000) {}

  export(span: Span): void {
    if (this.spans.length >= this.maxSpans) {
      this.droppedCount++;
      return;
    }
    this.spans.push(span);
  }

  /** Tüm span'lar. */
  all(): readonly Span[] {
    return this.spans;
  }

  /**
   * Bir run'ın tam trace'i — Y-P18-004'ün kabul kriteri.
   *
   * BAŞLAMA SIRASINA göre döner (zaman damgasına değil): bir trace'i
   * okumak, olayların sırasını görmek demektir.
   */
  byRunId(runId: string): readonly Span[] {
    return this.spans
      .filter((s) => s.runId === runId)
      .sort((a, b) => a.sequence - b.sequence);
  }

  byTraceId(traceId: string): readonly Span[] {
    return this.spans
      .filter((s) => s.traceId === traceId)
      .sort((a, b) => a.sequence - b.sequence);
  }

  dropped(): number {
    return this.droppedCount;
  }

  reset(): void {
    this.spans.length = 0;
    this.droppedCount = 0;
  }
}

export interface StartSpanOptions {
  readonly attributes?: Record<string, string | number | boolean>;
}

/** W3C Trace Context: 16 bayt = 32 hex. */
function newTraceId(): string {
  return randomBytes(16).toString("hex");
}

/** W3C Trace Context: 8 bayt = 16 hex. */
function newSpanId(): string {
  return randomBytes(8).toString("hex");
}

export class Tracer {
  private nextSequence = 0;

  constructor(
    private readonly exporter: SpanExporter,
    private readonly now: () => number = () => Date.now()
  ) {}

  /**
   * Bir span açar ve `fn`'i o span'ın bağlamında çalıştırır.
   *
   * Span **her durumda kapanır** (`finally`): hata fırlatan bir işlemin
   * süresi, başarılı olanlardan daha ilginçtir. Hata durumunda `status`
   * `error` olur ama hata YUTULMAZ — yeniden fırlatılır.
   *
   * `traceId` mevcut bağlamdan devralınır; yoksa yeni bir trace başlar.
   * Böylece bir HTTP isteğinden başlayan zincir, kuyruk ve worker
   * üzerinden aynı `traceId` ile devam eder.
   */
  startActiveSpan<T>(name: string, options: StartSpanOptions, fn: (span: Span) => T): T {
    const context = currentContext();
    const traceId = context?.traceId ?? newTraceId();
    const spanId = newSpanId();

    const span: Span = {
      sequence: this.nextSequence++,
      traceId,
      spanId,
      parentSpanId: context?.spanId ?? null,
      name,
      startedAt: this.now(),
      endedAt: null,
      status: "unset",
      attributes: { ...(options.attributes ?? {}) },
      runId: context?.runId ?? null
    };

    const finish = (status: SpanStatus): void => {
      span.endedAt = this.now();
      span.status = status;
      this.exporter.export(span);
    };

    // Bagigami span'in KENDISIYLE genislet: alt cagrilarin parentSpanId'si
    // bu span olur. Genisletmezsek zincir duz kalir ve "hangi is neyin
    // icinde" sorusu cevapsiz olur.
    return withContext({ traceId, spanId, correlationId: context?.correlationId ?? traceId }, () => {
      let ok = false;
      try {
        const result = fn(span);
        ok = true;
        return result;
      } finally {
        finish(ok ? "ok" : "error");
      }
    });
  }

  /** Asenkron sürüm. Aynı kurallar. */
  async startActiveSpanAsync<T>(
    name: string,
    options: StartSpanOptions,
    fn: (span: Span) => Promise<T>
  ): Promise<T> {
    const context = currentContext();
    const traceId = context?.traceId ?? newTraceId();
    const spanId = newSpanId();

    const span: Span = {
      sequence: this.nextSequence++,
      traceId,
      spanId,
      parentSpanId: context?.spanId ?? null,
      name,
      startedAt: this.now(),
      endedAt: null,
      status: "unset",
      attributes: { ...(options.attributes ?? {}) },
      runId: context?.runId ?? null
    };

    return withContext(
      { traceId, spanId, correlationId: context?.correlationId ?? traceId },
      async () => {
        let ok = false;
        try {
          const result = await fn(span);
          ok = true;
          return result;
        } finally {
          span.endedAt = this.now();
          span.status = ok ? "ok" : "error";
          this.exporter.export(span);
        }
      }
    );
  }
}
