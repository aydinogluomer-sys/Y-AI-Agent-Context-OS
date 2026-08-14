/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * P18 / Y-P18-002 — LOGGER GÖÇÜ.
 *
 * ## Öncesi (ölçülen)
 *
 * `UnifiedLogger` bir `logPayload` nesnesi **kuruyor ve hiç
 * kullanmıyordu**:
 *
 * ```ts
 * const logPayload = { timestamp, level, context, message, ...cleanMeta };
 * const formattedLog = `[${timestamp}] [Y-OS:${level}] ...`;
 * console.info(formattedLog);   // logPayload ATILDI
 * ```
 *
 * Niyet JSON'du, çıktı biçimlenmiş metindi. Sonuç: log'lar makineyle
 * ayrıştırılamıyor ve **hiçbir satır korelasyon anahtarı taşımıyordu**
 * (spec §27 ihlali).
 *
 * ## Göç yöntemi: 73 çağrı yeri DEĞİL, tanım değişti
 *
 * `sysLogger` 73 yerde kullanılıyor. Her çağrı yerini elle taşımak hem
 * gereksiz hem riskliydi: 73 düzenlemenin birini yanlış yapmak, o modülü
 * sessizce log'suz bırakırdı.
 *
 * Bunun yerine `sysLogger`'ın **tanımı** `@y/observability`'nin
 * `StructuredLogger`'ına bağlandı. Çağrı yüzeyi (`.debug/.info/.warn/
 * .error`) aynı kaldı; 73 çağrı yeri değişmeden JSON çıktı ve otomatik
 * korelasyon kazandı.
 */

import { redactSecretLeaks } from "@y/security";
import { StructuredLogger, levelFromEnv, type LogLevel } from "@y/observability";

export type { LogLevel };

/**
 * Geriye dönük uyumlu sarmalayıcı.
 *
 * Eski `UnifiedLogger` API'si korunuyor çünkü bu isim 73 çağrı yerinde
 * dolaylı olarak kullanılıyor. `StructuredLogger`'ı doğrudan dışa açmak
 * yerine sarmalamak, redaksiyon ve seviye kararının **tek yerde**
 * kalmasını sağlıyor.
 */
export class UnifiedLogger {
  private readonly inner: StructuredLogger;

  constructor(context: string) {
    this.inner = new StructuredLogger(context, {
      // Sir redaksiyonu ZORUNLU: log, context'ten daha genis bir kitleye
      // ulasir (ADR-051 ile ayni gerekce).
      redact: redactSecretLeaks,
      // Gecersiz LOG_LEVEL sessizce yutulmaz; acikca hata verir.
      level: levelFromEnv(process.env.LOG_LEVEL, "info")
    });
  }

  log(level: LogLevel, message: string, meta: Record<string, unknown> = {}): void {
    this.inner.log(level, message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.inner.debug(message, meta);
  }
  info(message: string, meta?: Record<string, unknown>): void {
    this.inner.info(message, meta);
  }
  warn(message: string, meta?: Record<string, unknown>): void {
    this.inner.warn(message, meta);
  }
  error(message: string, meta?: Record<string, unknown>): void {
    this.inner.error(message, meta);
  }

  /** Korelasyonsuz satır sayısı — Y-P18-002'nin kabul ölçümü. */
  stats(): { emitted: number; suppressed: number; uncorrelated: number } {
    return this.inner.stats();
  }
}

export const sysLogger = new UnifiedLogger("SYSTEM");
