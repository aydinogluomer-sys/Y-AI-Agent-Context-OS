/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * P18 / Y-P18-001 — KORELASYON BAĞLAMI (ADR-067).
 *
 * Spec §27: structured logs · correlation IDs · run IDs · trace IDs.
 *
 * Bir run onlarca bileşene yayılır: API isteği, kuyruk, worker, adapter,
 * evidence yazımı. Ortak bir anahtar olmadan bu parçaları birleştirmek
 * **zaman damgası eşleştirmeye** kalır — ve eşzamanlı run'larda bu yöntem
 * yanlış sonuç verir. Kanıt iddiasında bulunan bir sistemde "hangi log
 * hangi run'a ait" sorusunun cevabı tahmin olamaz.
 *
 * ## Neden AsyncLocalStorage
 *
 * Alternatif, korelasyon anahtarını her fonksiyon imzasından geçirmekti.
 * Reddedildi: yüzlerce imza değişir ve **bir tanesini unutmak sessizce
 * korelasyonsuz log üretir**. Sessiz kayıp, bu projede kapatılan kalıbın
 * kendisidir.
 *
 * `AsyncLocalStorage` bağlamı çağrı ağacı boyunca otomatik taşır; unutma
 * ihtimali yapısal olarak ortadan kalkar.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export interface CorrelationContext {
  /** HTTP isteği başına. İstemciden gelebilir (doğrulanmış olmak kaydıyla). */
  readonly correlationId: string;
  /** Bir agent run'ının tamamı. Birinci sınıf anahtar (ADR-067). */
  readonly runId?: string;
  /** Dağıtık iz. OpenTelemetry bağlandığında aynı değeri taşır. */
  readonly traceId?: string;
  readonly spanId?: string;
  /** Doğrulanmış principal. Audit aktörüyle aynı değer (ADR-017). */
  readonly actorId?: string;
  /** Tenant izolasyonu için (T-02). */
  readonly organizationId?: string;
  readonly projectId?: string;
}

const storage = new AsyncLocalStorage<CorrelationContext>();

/** Bağlamı belirli bir çağrı ağacı için çalıştırır. */
export function runWithContext<T>(context: CorrelationContext, fn: () => T): T {
  return storage.run(context, fn);
}

/**
 * Mevcut bağlam. Bağlam dışında çağrılırsa `undefined`.
 *
 * `undefined` dönmesi bir hata DEĞİLDİR: süreç başlangıcı, cron ve test
 * kodu bağlam dışındadır. Ama bu durumda log satırı korelasyonsuz kalır
 * ve `hasContext()` ile ölçülebilir.
 */
export function currentContext(): CorrelationContext | undefined {
  return storage.getStore();
}

export function hasContext(): boolean {
  return storage.getStore() !== undefined;
}

/**
 * Mevcut bağlamı genişletir.
 *
 * Tipik kullanım: HTTP katmanı `correlationId` kurar, run servisi üzerine
 * `runId` ekler. Bağlam **değiştirilmez**; yeni bir bağlamla yeni bir
 * çağrı ağacı açılır — böylece bir alt ağacın eklediği alan üst ağacı
 * kirletmez.
 */
export function withContext<T>(patch: Partial<CorrelationContext>, fn: () => T): T {
  const current = storage.getStore();
  if (!current) {
    if (!patch.correlationId) {
      throw new Error(
        "withContext: bagLam yokken correlationId zorunludur. " +
          "Korelasyonsuz bir baglam kurmak, sessiz kayip uretir."
      );
    }
    return storage.run(patch as CorrelationContext, fn);
  }
  return storage.run({ ...current, ...patch }, fn);
}
