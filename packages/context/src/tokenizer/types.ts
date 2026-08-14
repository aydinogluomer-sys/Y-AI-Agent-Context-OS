/**
 * P08 / Y-P08-001, Y-P08-002 — Tokenizer sözleşmesi (ADR-010).
 *
 * P00 Truth Audit: gerçek tokenizer YOKTU. İki tutarsız tahminci vardı:
 *
 *   1. `estimateTokens` (`context/src/index.ts:48-70`):
 *      `max(words * 1.3, bytes / 3.8 + cjk) * 1.05`
 *   2. `chars / 4` (`chunkContent`, `search-server.ts:114` ve `:309`)
 *
 *   Aynı metin için iki farklı sayı üretiyorlardı ve hangisinin
 *   kullanıldığı çağrı noktasına bağlıydı. Bütçe hesabı bu yüzden
 *   sistematik olarak yanlıştı: context ya taşıyor ya da gereksiz
 *   küçülüyordu.
 *
 * YAKLAŞIKLIK GİZLENMEZ
 *   Gerçek tokenizer yoksa heuristic kullanılır — ama sonuç
 *   `approximate: true` ile işaretlenir ve bu bayrak manifest'e (P09)
 *   yazılır. P00'daki hata tahmincilerin varlığı değil, tahminin GERÇEK
 *   GİBİ sunulmasıydı.
 */

export interface TokenCount {
  readonly tokens: number;
  /**
   * Sayım gerçek bir tokenizer'dan mı geldi.
   *
   * `true` = yaklaşık. Bu bayrak okunmak ZORUNDADIR: bütçe kararı
   * yaklaşık bir sayıya dayanıyorsa güvenlik payı artırılmalıdır.
   */
  readonly approximate: boolean;
  readonly tokenizerId: string;
}

export interface Tokenizer {
  readonly id: string;
  readonly approximate: boolean;
  /** Metnin token sayısı. */
  count(text: string): number;
  /** Toplu sayım — tek tek çağırmakla AYNI sonucu vermelidir. */
  countBatch(texts: readonly string[]): number[];
  /**
   * Metni azami token sayısına kırpar.
   *
   * Kırpma SATIR SINIRINDA yapılır: bir kod fragment'ını kelimenin
   * ortasından kesmek, onu okunamaz ve derlenemez kılar.
   */
  truncate(text: string, maxTokens: number): string;
}

export class TokenizerError extends Error {
  constructor(
    readonly code: "UNKNOWN_PROVIDER" | "INVALID_LIMIT",
    message: string
  ) {
    super(message);
    this.name = "TokenizerError";
  }
}
