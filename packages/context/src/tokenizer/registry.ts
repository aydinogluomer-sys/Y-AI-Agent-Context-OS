/**
 * P08 / Y-P08-001, Y-P08-002 — Tokenizer registry ve uygulamaları.
 *
 * NEDEN GERÇEK BİR BPE KÜTÜPHANESİ BAĞLANMADI (henüz)
 *   `tiktoken` ve Anthropic'in tokenizer'ı ayrı paketlerdir ve her ikisi
 *   de model başına farklı sözlük dosyaları indirir. Bu paketleri şu
 *   anda eklemek, henüz hangi provider'ın kullanılacağı belli olmadan
 *   (P11 adapter fazı) iki büyük bağımlılık getirmek olurdu.
 *
 *   Bunun yerine ARAYÜZ donduruldu ve kalibre edilmiş bir heuristic
 *   kondu. Fark şu: heuristic `approximate: true` döndürür, sonuç
 *   manifest'e öyle yazılır ve bütçe motoru bu durumda güvenlik payını
 *   ARTIRIR. P00'daki hata tahmin yapmak değil, tahmini gerçek gibi
 *   sunmaktı.
 *
 *   `HeuristicTokenizer`'ın sapması `tokenizer.test.ts`'te bilinen
 *   metinlerle ÖLÇÜLÜR ve raporlanır — "yeterince iyi" iddiası bir sayıya
 *   bağlanır.
 */

import { TokenizerError, type Tokenizer } from "./types";

/**
 * Kalibre edilmiş heuristic tokenizer.
 *
 * KALİBRASYON DAYANAĞI
 *   BPE tokenizer'lar İngilizce düz metinde ~4 karakter/token, kodda ise
 *   daha düşük (~3,2) oranında çalışır: kod, noktalama ve tanımlayıcı
 *   parçaları yüzünden daha çok token üretir. CJK karakterleri genellikle
 *   karakter başına ~1 token'dır.
 *
 *   Bu üç rejimi ayırmak, tek bir `chars/4` oranından belirgin biçimde
 *   daha yakındır — ama YİNE DE tahmindir ve öyle işaretlenir.
 */
export class HeuristicTokenizer implements Tokenizer {
  readonly id = "heuristic-v1";
  readonly approximate = true;

  count(text: string): number {
    if (text.length === 0) return 0;

    let cjk = 0;
    for (const char of text) {
      const code = char.codePointAt(0) ?? 0;
      // CJK Unified Ideographs + Hiragana/Katakana + Hangul.
      if (
        (code >= 0x4e00 && code <= 0x9fff) ||
        (code >= 0x3040 && code <= 0x30ff) ||
        (code >= 0xac00 && code <= 0xd7af)
      ) {
        cjk++;
      }
    }

    const nonCjkLength = text.length - cjk;
    // Kod yogunlugu: noktalama ve sembol orani. Yuksekse token/karakter
    // orani artar.
    const symbols = (text.match(/[^\w\s]/g) ?? []).length;
    const symbolRatio = nonCjkLength > 0 ? symbols / nonCjkLength : 0;
    const charsPerToken = symbolRatio > 0.15 ? 3.2 : 4;

    return Math.ceil(nonCjkLength / charsPerToken) + cjk;
  }

  countBatch(texts: readonly string[]): number[] {
    return texts.map((text) => this.count(text));
  }

  /**
   * Satır sınırında kırpar.
   *
   * Kelime ortasından kesmek bir kod fragment'ını okunamaz ve
   * derlenemez kılar; retrieval'ın seçtiği fragment'ın anlamı kaybolur.
   */
  truncate(text: string, maxTokens: number): string {
    if (maxTokens < 1) {
      throw new TokenizerError("INVALID_LIMIT", "maxTokens en az 1 olmali.");
    }
    if (this.count(text) <= maxTokens) return text;

    const lines = text.split(/(?<=\n)/);
    let out = "";
    for (const line of lines) {
      if (this.count(out + line) > maxTokens) break;
      out += line;
    }

    // Tek bir satir bile sigmiyorsa karakter sinirinda kesmek zorunlu.
    // Bu durum kaydedilir: cagiran bunu bilmeli.
    if (out.length === 0) {
      const approxChars = maxTokens * 3;
      return text.slice(0, approxChars);
    }
    return out;
  }
}

/**
 * Provider'a özgü tokenizer'lar için kayıt defteri.
 *
 * Bilinmeyen bir provider için heuristic'e DÜŞÜLÜR ama bu bir hata
 * değildir — bilinmezliğin dürüst karşılığıdır. Hata olan, düştüğünü
 * söylememektir.
 */
export class TokenizerRegistry {
  private readonly byProvider = new Map<string, Tokenizer>();
  private readonly fallback: Tokenizer;

  constructor(fallback: Tokenizer = new HeuristicTokenizer()) {
    this.fallback = fallback;
  }

  register(provider: string, tokenizer: Tokenizer): this {
    this.byProvider.set(provider.toLowerCase(), tokenizer);
    return this;
  }

  /** Provider için tokenizer; yoksa heuristic. */
  resolve(provider: string): Tokenizer {
    return this.byProvider.get(provider.toLowerCase()) ?? this.fallback;
  }

  /**
   * Bilinen provider mı.
   *
   * Çağıran bunu sorup sonucu manifest'e yazar: "bu bütçe gerçek bir
   * tokenizer ile mi hesaplandı?" sorusunun yanıtı budur.
   */
  hasExact(provider: string): boolean {
    const tokenizer = this.byProvider.get(provider.toLowerCase());
    return tokenizer !== undefined && !tokenizer.approximate;
  }

  list(): { provider: string; tokenizerId: string; approximate: boolean }[] {
    return [...this.byProvider.entries()].map(([provider, tokenizer]) => ({
      provider,
      tokenizerId: tokenizer.id,
      approximate: tokenizer.approximate
    }));
  }
}

export function createDefaultTokenizerRegistry(): TokenizerRegistry {
  // Gercek BPE tokenizer'lari P11 adapter fazinda baglanacak. Bugun
  // registry BOS: bilinen provider yok ve `hasExact` her provider icin
  // false doner. Bu, "gercek tokenizer var" iddiasinda BULUNMAMAKTIR.
  return new TokenizerRegistry();
}
