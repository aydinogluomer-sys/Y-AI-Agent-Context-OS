/**
 * P13 / Y-P13-001 — Server-Sent Events (SSE) altyapısı.
 *
 * P00 Truth Audit: repo'da HİÇBİR gerçek zamanlı mekanizma yoktu.
 *   - `text/event-stream` yok, `EventSource` yok, `res.flush` yok.
 *   - WebSocket app kodu yok — `WebSocket` string'i yalnızca
 *     `src/main.tsx`'te Vite HMR konsol gürültüsünü filtrelemek için
 *     geçiyordu.
 *   - Tarayıcıda polling de yoktu; geri bildirim `alert()` ileydi.
 *   - UI'daki "canlı" log akışları hard-coded string dizileri üzerinde
 *     `setInterval` çalıştırıyordu.
 *
 * NEDEN SSE, NEDEN WEBSOCKET DEĞİL
 *   Akış tek yönlüdür: sunucu olay yayınlar, istemci dinler. WebSocket
 *   çift yönlü bir kanal kurar ve bunun bedeli vardır: ayrı bir protokol,
 *   proxy uyumsuzlukları, kendi yeniden bağlanma mantığı ve ayrı bir
 *   kimlik doğrulama yüzeyi.
 *
 *   SSE sıradan HTTP'dir: mevcut authn middleware'i, rate limiter ve
 *   proxy yapılandırması olduğu gibi çalışır. `Last-Event-ID` başlığı
 *   kopma sonrası devamı PROTOKOLÜN KENDİSİNDE tanımlar.
 *
 * TESLİM GARANTİSİ: AT-LEAST-ONCE
 *   Kopma sonrası `Last-Event-ID`'den devam edilir. Bir olay İKİ KEZ
 *   gelebilir; kaybolmaz. İstemci `event_id` ile tekilleştirir.
 *
 *   Exactly-once vaadi vermek yanlış olurdu: TCP kopması ile olayın
 *   yazılması arasındaki yarış, sunucu tarafında çözülemez.
 */

import type { Response } from "express";

export interface SseEvent {
  /** Benzersiz kimlik — istemci tekilleştirmesi için. */
  readonly id: string;
  /** Olay tipi: `run.created`, `agent.tool_call`, `approval.requested`... */
  readonly event: string;
  readonly data: unknown;
}

/** Proxy timeout'una karşı heartbeat aralığı. */
export const HEARTBEAT_MS = 15_000;

/**
 * SSE akışını açar.
 *
 * `X-Accel-Buffering: no` NGINX içindir: varsayılan tamponlama, olayları
 * biriktirip toplu gönderir ve "gerçek zamanlı" akış saniyeler
 * gecikmeli görünür.
 */
export function openStream(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
}

/**
 * Tek bir olay yazar.
 *
 * SSE biçimi satır tabanlıdır ve `\n\n` olayı sonlandırır. Veri içinde
 * satır sonu varsa HER SATIR `data: ` ile başlamalıdır — aksi halde
 * akış bozulur ve istemci JSON'u ayrıştıramaz.
 */
export function writeEvent(res: Response, event: SseEvent): void {
  const payload = JSON.stringify(event.data);
  const lines = payload.split("\n").map((line) => `data: ${line}`).join("\n");

  res.write(`id: ${event.id}\n`);
  res.write(`event: ${event.event}\n`);
  res.write(`${lines}\n\n`);
}

/**
 * Heartbeat.
 *
 * SSE yorum satırı (`:` ile başlar) istemci tarafından yok sayılır ama
 * bağlantıyı canlı tutar. Proxy'ler sessiz bir bağlantıyı 30–60 saniye
 * sonra kapatır; heartbeat olmadan akış düzenli olarak kopar ve her
 * kopma bir yeniden bağlanma maliyetidir.
 */
export function writeHeartbeat(res: Response): void {
  res.write(`: heartbeat ${Date.now()}\n\n`);
}

/**
 * `Last-Event-ID` başlığından devam noktasını çıkarır.
 *
 * Başlık istemciden gelir ve GÜVENİLMEZ: bir sayı bekleniyor, gelen
 * başka bir şeyse baştan başlanır. Doğrulanmadan sorguya konsaydı,
 * `Last-Event-ID: 0 OR 1=1` bir enjeksiyon yüzeyi olurdu.
 */
export function parseLastEventId(header: string | undefined): number {
  if (typeof header !== "string") return 0;
  const parsed = Number.parseInt(header, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

/**
 * Akış döngüsü.
 *
 * `fetchSince` çağrıları arasında bekler; her turda yeni olayları
 * yayınlar. Bu bir polling'dir — ve öyle olduğu SÖYLENİYOR.
 *
 * Postgres `LISTEN/NOTIFY` daha zarif olurdu ama her akış için ayrı bir
 * bağlantı tutmayı gerektirir: 100 açık akış = 100 bağlantı, ki bu
 * havuzu tüketir. Polling, bağlantıyı yalnızca sorgu süresince tutar.
 * Bu bir ödünleşimdir ve burada yazılıdır.
 */
export interface StreamOptions {
  readonly res: Response;
  readonly fetchSince: (afterSequence: number) => Promise<SseEvent[]>;
  /** Akışın bittiğini söyleyen koşul (run terminal duruma geçti). */
  readonly isComplete: () => Promise<boolean>;
  readonly startAfter: number;
  readonly pollIntervalMs?: number;
  readonly heartbeatMs?: number;
  /** Test edilebilirlik. */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Sonsuz döngüye karşı üst sınır. */
  readonly maxIterations?: number;
}

export async function streamEvents(options: StreamOptions): Promise<void> {
  const pollInterval = options.pollIntervalMs ?? 1_000;
  const heartbeat = options.heartbeatMs ?? HEARTBEAT_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const maxIterations = options.maxIterations ?? Number.MAX_SAFE_INTEGER;

  openStream(options.res);

  let cursor = options.startAfter;
  let lastHeartbeat = Date.now();
  let closed = false;

  options.res.on("close", () => {
    closed = true;
  });

  for (let i = 0; i < maxIterations && !closed; i++) {
    const events = await options.fetchSince(cursor);

    for (const event of events) {
      writeEvent(options.res, event);
      const sequence = Number.parseInt(event.id, 10);
      if (Number.isFinite(sequence)) cursor = Math.max(cursor, sequence);
    }

    if (await options.isComplete()) break;

    if (Date.now() - lastHeartbeat >= heartbeat) {
      writeHeartbeat(options.res);
      lastHeartbeat = Date.now();
    }

    await sleep(pollInterval);
  }

  if (!closed) options.res.end();
}
