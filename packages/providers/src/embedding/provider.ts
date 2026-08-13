/**
 * P06 / Y-P06-002 — Provider-agnostic embedding arayüzü (ADR-009).
 *
 * NEDEN ARAYÜZ
 *   Embedding sağlayıcısı değiştirilebilir olmalı: model fiyatları,
 *   gizlilik sınırları ve kalite hızla değişiyor. Sağlayıcıyı kodun
 *   içine gömmek, değiştirmeyi bir yeniden yazıma çevirirdi.
 *
 * GİZLİLİK SINIRI SÖZLEŞMENİN PARÇASI
 *   `privacyBoundary` isteğe bağlı bir bilgi değil: chunk içeriği bir
 *   dış sağlayıcıya gönderiliyorsa bu, manifest'e yazılması gereken bir
 *   OLAYDIR. `local_only` bir sağlayıcı ile `external_processor`
 *   arasındaki fark, kullanıcının bilmesi gereken en önemli farktır.
 *
 * SIR İÇEREN CHUNK GÖNDERİLMEZ
 *   P04 sır tarayıcısı chunk'ı işaretledi; `EmbeddingRequest` bu bayrağı
 *   taşır ve sağlayıcıya gönderim öncesi kontrol edilir. Bir sırrı
 *   embedding için dışarı göndermek, onu kalıcı olarak sızdırmaktır —
 *   sonuçtan geri alınamaz.
 */

export type EmbeddingPrivacyBoundary = "local_only" | "external_processor";

export interface EmbeddingModelDescriptor {
  readonly id: string;
  readonly displayName: string;
  readonly dimensions: number;
  /** Azami girdi token'ı. Aşan içerik kırpılır ve bu KAYDEDİLİR. */
  readonly maxInputTokens: number;
  /** Tek istekte gönderilebilecek azami metin sayısı. */
  readonly maxBatchSize: number;
}

export interface EmbeddingProviderCapabilities {
  readonly providerId: string;
  readonly displayName: string;
  readonly privacyBoundary: EmbeddingPrivacyBoundary;
  readonly sendsContentOffDevice: boolean;
  readonly models: readonly EmbeddingModelDescriptor[];
}

export interface EmbeddingProviderHealth {
  readonly providerId: string;
  readonly configured: boolean;
  readonly status: "ready" | "not_configured" | "unreachable";
  readonly checkedAt: string;
  readonly message: string;
}

export interface EmbeddingInput {
  /** Çağıranın satırı eşleştirebilmesi için. */
  readonly id: string;
  readonly text: string;
  /** P04 sır tarayıcısının işareti. `true` ise gönderilmez. */
  readonly containsSecret?: boolean;
}

export interface EmbeddingVector {
  readonly id: string;
  readonly vector: readonly number[];
  readonly model: string;
  readonly dimensions: number;
  /** Girdi model sınırını aştığı için kırpıldı mı. */
  readonly truncated: boolean;
}

export interface EmbeddingProvider {
  readonly id: string;
  getCapabilities(): EmbeddingProviderCapabilities;
  health(): Promise<EmbeddingProviderHealth>;
  /**
   * Toplu embedding.
   *
   * Sağlayıcı, girdi sırasını KORUMAK zorunda değildir; sonuçlar `id`
   * ile eşleştirilir. Sıraya güvenmek, batch'i yeniden sıralayan bir
   * sağlayıcıda sessizce yanlış eşleştirme üretirdi.
   */
  embed(inputs: readonly EmbeddingInput[], model?: string): Promise<EmbeddingVector[]>;
}

export class EmbeddingError extends Error {
  constructor(
    readonly code:
      | "NOT_CONFIGURED"
      | "SECRET_CONTENT"
      | "BATCH_TOO_LARGE"
      | "UNKNOWN_MODEL"
      | "PROVIDER_ERROR"
      | "RATE_LIMITED",
    message: string
  ) {
    super(message);
    this.name = "EmbeddingError";
  }
}

/**
 * Sır içeren girdileri reddeder.
 *
 * SESSİZCE ATLAMAK YERİNE HATA: atlanan bir chunk, embedding'i olmayan
 * bir chunk olarak kalır ve semantic kanalda görünmez. Bu, sessiz bir
 * kapsam kaybıdır. Çağıran, sır içeren chunk'ları ZATEN filtrelemiş
 * olmalıdır; buraya ulaşması bir hatadır ve öyle bildirilir.
 */
export function assertNoSecrets(inputs: readonly EmbeddingInput[]): void {
  const offending = inputs.filter((input) => input.containsSecret === true);
  if (offending.length === 0) return;

  throw new EmbeddingError(
    "SECRET_CONTENT",
    `${offending.length} girdi sir iceriyor olarak isaretli ve embedding icin ` +
      `disariya gonderilemez (T-07). Ilk: ${offending[0].id}. ` +
      `Bir sirri embedding icin gondermek onu kalici olarak sizdirmaktir.`
  );
}

/**
 * Batch'i sağlayıcının sınırına göre böler.
 *
 * Sınırı aşan bir isteği göndermek, sağlayıcıya göre ya hata ya da
 * SESSİZCE KIRPMA üretir. İkincisi daha tehlikelidir: eksik embedding
 * üretilir ve bu fark edilmez.
 */
export function chunkBatch<T>(items: readonly T[], maxBatchSize: number): T[][] {
  if (maxBatchSize < 1) {
    throw new EmbeddingError("BATCH_TOO_LARGE", "maxBatchSize en az 1 olmali.");
  }
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += maxBatchSize) {
    batches.push(items.slice(i, i + maxBatchSize));
  }
  return batches;
}

/**
 * Yeniden deneme gecikmesi (üstel geri çekilme + jitter).
 *
 * Jitter olmadan, aynı anda rate limit'e takılan tüm worker'lar aynı anda
 * yeniden dener ve limiti tekrar doldururlar (thundering herd).
 * Jitter kriptografik olmak zorunda değildir — bu bir kimlik değil,
 * zamanlama dağıtımıdır (ADR-013 kapsamı dışında).
 */
export function retryDelayMs(attempt: number, baseMs = 500, maxMs = 30_000): number {
  const exponential = Math.min(maxMs, baseMs * Math.pow(2, Math.max(0, attempt - 1)));
  const jitter = exponential * 0.25 * Math.random();
  const withJitter = exponential - exponential * 0.125 + jitter;
  // SINIR JITTER'DAN SONRA uygulanir. Once kirpip sonra jitter eklemek,
  // "azami gecikme" olarak duyurulan degerin %12,5 uzerine cikabiliyordu —
  // yani ust sinir aslinda ust sinir degildi (testin yakaladigi hata).
  return Math.round(Math.min(maxMs, withJitter));
}

export class EmbeddingProviderRegistry {
  private readonly providers = new Map<string, EmbeddingProvider>();

  register(provider: EmbeddingProvider): this {
    this.providers.set(provider.id, provider);
    return this;
  }

  resolve(providerId: string): EmbeddingProvider | null {
    return this.providers.get(providerId) ?? null;
  }

  list(): EmbeddingProviderCapabilities[] {
    return [...this.providers.values()].map((p) => p.getCapabilities());
  }

  async health(): Promise<EmbeddingProviderHealth[]> {
    return Promise.all([...this.providers.values()].map((p) => p.health()));
  }
}

/**
 * Yapılandırılmamış sağlayıcı.
 *
 * NE YAPMAZ: sahte vektör üretmez. Rastgele ya da sıfır bir vektör
 * döndürmek, anlamsız ama makul GÖRÜNEN benzerlik skorları üretirdi —
 * P00'daki sahte semantic aramanın tam olarak yaptığı şey. Bunun yerine
 * açıkça hata verir ve retrieval kanalı `degraded` işaretler.
 */
export class UnconfiguredEmbeddingProvider implements EmbeddingProvider {
  readonly id = "unconfigured";

  getCapabilities(): EmbeddingProviderCapabilities {
    return {
      providerId: this.id,
      displayName: "Yapilandirilmamis",
      privacyBoundary: "local_only",
      sendsContentOffDevice: false,
      models: []
    };
  }

  async health(): Promise<EmbeddingProviderHealth> {
    return {
      providerId: this.id,
      configured: false,
      status: "not_configured",
      checkedAt: new Date().toISOString(),
      message: "Embedding saglayicisi yapilandirilmamis. Semantic kanal devre disi."
    };
  }

  async embed(): Promise<EmbeddingVector[]> {
    throw new EmbeddingError(
      "NOT_CONFIGURED",
      "Embedding saglayicisi yok. Sahte vektor URETILMEZ: anlamsiz ama makul " +
        "gorunen benzerlik skorlari, hicbir skor olmamasindan daha zararlidir."
    );
  }
}
