/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * P18 — Observability paketi (Y-P18-001).
 *
 * Spec §27: structured logs · correlation IDs · run IDs · trace IDs ·
 * metrics · health.
 *
 * Bu paket **bilerek bağımlılıksızdır**: `@y/security`'nin redaksiyonunu
 * import etmez, `Redactor` fonksiyonunu enjekte alır. Gerekçe, gözlem
 * katmanının en alt katman olması — kendisini gözlemleyen bir şeye
 * bağımlı olması döngü üretirdi.
 */

export {
  runWithContext,
  withContext,
  currentContext,
  hasContext,
  type CorrelationContext
} from "./context";

export {
  StructuredLogger,
  levelFromEnv,
  type LogLevel,
  type LogRecord,
  type LoggerOptions,
  type Redactor
} from "./logger";

export {
  Tracer,
  InMemorySpanExporter,
  type Span,
  type SpanStatus,
  type SpanExporter,
  type StartSpanOptions
} from "./tracing";
