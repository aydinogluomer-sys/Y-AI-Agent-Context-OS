/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * P18 / Y-P18-001, Y-P18-002 — YAPILANDIRILMIŞ LOGGER.
 *
 * ## Öncesi (ölçülen)
 *
 * `apps/api/src/logger.ts` bir `logPayload` nesnesi **kuruyor ve hiç
 * kullanmıyordu**:
 *
 * ```ts
 * const logPayload = { timestamp, level, context, message, ...cleanMeta };
 * const formattedLog = `[${timestamp}] [Y-OS:${level}] ...`;
 * console.info(formattedLog);   // logPayload ATILDI
 * ```
 *
 * Yani niyet JSON'du, çıktı biçimlenmiş metindi. Sonuç: log'lar makineyle
 * ayrıştırılamıyor, hiçbir satır korelasyon anahtarı taşımıyordu.
 *
 * ## Kararlar
 *
 * **JSON, tek satır.** Biçimlenmiş metin insan için okunaklıdır ama
 * toplayıcı için değildir. Üretimde log'ları okuyan şey insan değil,
 * sorgudur.
 *
 * **Korelasyon otomatik.** `AsyncLocalStorage`'dan alınır; çağıranın
 * eklemesi gerekmez (bkz. `context.ts`).
 *
 * **Redaksiyon KORUNDU ve zorunlu.** Mesaj ve meta, yazılmadan önce sır
 * tarayıcısından geçer. Bu, log'un context'ten daha geniş bir kitleye
 * ulaşmasındandır (ADR-051 ile aynı gerekçe).
 *
 * **Seviye eşiği ölçülür, varsayılmaz.** `suppressed()` kaç satırın
 * eşiğe takıldığını sayar — sessizce kaybolan log, olmayan log'dan daha
 * tehlikelidir çünkü var sanılır.
 */

import { currentContext } from "./context";

export type LogLevel = "debug" | "info" | "warn" | "error";

const SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export interface LogRecord {
  readonly timestamp: string;
  readonly level: Uppercase<LogLevel>;
  readonly logger: string;
  readonly message: string;
  readonly correlationId?: string;
  readonly runId?: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly actorId?: string;
  readonly organizationId?: string;
  readonly projectId?: string;
  readonly meta?: Record<string, unknown>;
}

/** Sır redaksiyonu. Enjekte edilebilir — paket `@y/security`'ye bağımlı değil. */
export type Redactor = (text: string) => string;

export interface LoggerOptions {
  readonly level?: LogLevel;
  readonly redact?: Redactor;
  /** Çıktı hedefi. Test için değiştirilebilir. */
  readonly sink?: (line: string) => void;
  readonly now?: () => Date;
}

const identity: Redactor = (t) => t;

export class StructuredLogger {
  private readonly level: LogLevel;
  private readonly threshold: number;
  private readonly redact: Redactor;
  private readonly sink: (line: string) => void;
  private readonly now: () => Date;
  private suppressedCount = 0;
  private emittedCount = 0;
  private uncorrelatedCount = 0;

  constructor(
    private readonly name: string,
    options: LoggerOptions = {}
  ) {
    this.level = options.level ?? "info";
    this.threshold = SEVERITY[this.level];
    this.redact = options.redact ?? identity;
    this.sink = options.sink ?? ((line) => process.stdout.write(line + "\n"));
    this.now = options.now ?? (() => new Date());
  }

  /** Aynı redaksiyon, hedef ve SEVİYEYİ paylaşan alt logger. */
  child(name: string): StructuredLogger {
    return new StructuredLogger(`${this.name}.${name}`, {
      // Seviye ACIKCA tasiniyor. Tasinmazsa alt logger varsayilana
      // doner ve `debug` ile kurulmus bir sistemde alt bilesenler
      // sessizce sessizlesir.
      level: this.level,
      redact: this.redact,
      sink: this.sink,
      now: this.now
    });
  }

  log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (SEVERITY[level] < this.threshold) {
      this.suppressedCount++;
      return;
    }

    const context = currentContext();
    if (!context) this.uncorrelatedCount++;

    let safeMeta: Record<string, unknown> | undefined;
    if (meta && Object.keys(meta).length > 0) {
      // Redaksiyon serilestirilmis metin uzerinde: ic ice nesnelerdeki
      // sirlar da yakalanir. Alan alan gezmek, ic ice yapiyi kacirirdi.
      safeMeta = JSON.parse(this.redact(JSON.stringify(meta)));
    }

    const record: LogRecord = {
      timestamp: this.now().toISOString(),
      level: level.toUpperCase() as Uppercase<LogLevel>,
      logger: this.name,
      message: this.redact(message),
      ...(context?.correlationId ? { correlationId: context.correlationId } : {}),
      ...(context?.runId ? { runId: context.runId } : {}),
      ...(context?.traceId ? { traceId: context.traceId } : {}),
      ...(context?.spanId ? { spanId: context.spanId } : {}),
      ...(context?.actorId ? { actorId: context.actorId } : {}),
      ...(context?.organizationId ? { organizationId: context.organizationId } : {}),
      ...(context?.projectId ? { projectId: context.projectId } : {}),
      ...(safeMeta ? { meta: safeMeta } : {})
    };

    this.emittedCount++;
    this.sink(JSON.stringify(record));
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log("debug", message, meta);
  }
  info(message: string, meta?: Record<string, unknown>): void {
    this.log("info", message, meta);
  }
  warn(message: string, meta?: Record<string, unknown>): void {
    this.log("warn", message, meta);
  }
  error(message: string, meta?: Record<string, unknown>): void {
    this.log("error", message, meta);
  }

  /**
   * Ölçümler.
   *
   * `uncorrelated` sıfırdan büyükse, bir kod yolu bağlam dışında log
   * yazıyor demektir. Bu bir hata olmayabilir (süreç başlangıcı, cron)
   * ama **görünür** olmalıdır — Y-P18-002'nin kabul kriteri budur.
   */
  stats(): { emitted: number; suppressed: number; uncorrelated: number } {
    return {
      emitted: this.emittedCount,
      suppressed: this.suppressedCount,
      uncorrelated: this.uncorrelatedCount
    };
  }
}

/** Ortamdan seviye okur; geçersiz değer SESSİZCE kabul edilmez. */
export function levelFromEnv(value: string | undefined, fallback: LogLevel = "info"): LogLevel {
  if (!value) return fallback;
  const normalized = value.toLowerCase();
  if (normalized in SEVERITY) return normalized as LogLevel;
  throw new RangeError(
    `Gecersiz log seviyesi: ${value}. Beklenen: ${Object.keys(SEVERITY).join(", ")}`
  );
}
