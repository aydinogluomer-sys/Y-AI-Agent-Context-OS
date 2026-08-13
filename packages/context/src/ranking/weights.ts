/**
 * P06 / Y-P06-009 — Sinyal ağırlıkları (ADR-026).
 *
 * P00 Truth Audit: skorun büyük kısmı SABİTTİ.
 *   `search-server.ts:116-120` her satıra `base_score: 70` ve
 *   `recency_score: 10` veriyordu; iki dosya arasındaki gerçek fark
 *   100 puanın küçük bir dilimiydi. Ağırlıklar ise `mergeScores`
 *   içinde üç stratejiye gömülüydü ve değiştirilemezdi.
 *
 * AĞIRLIKLAR KONFİGÜRASYONDUR
 *   Kötü bir ağırlık seti KOD DEĞİŞİKLİĞİ OLMADAN geri alınabilmelidir.
 *   Bu, retrieval kalitesi regresyonlarının en hızlı çözüm yoludur.
 *   Kullanılan setin kimliği (`hash`) `retrieval_runs`'a yazılır ve
 *   manifest'e (P09) girer: aynı sorgu farklı ağırlıklarla farklı sonuç
 *   verir, dolayısıyla ağırlık seti determinizmin girdisidir.
 *
 * TOPLAM 1 OLMALI — SESSİZ NORMALİZASYON YOK
 *   Toplamı 1 olmayan bir set, skorları 0..1 aralığından çıkarır ve
 *   eşiklerin anlamını bozar. Çalışma zamanında sessizce normalize etmek
 *   ise yapılandırma hatasını gizler: kullanıcı verdiği ağırlıkların
 *   uygulandığını sanır. Hata AÇIKÇA verilir.
 */

import { createHash } from "crypto";
import { SIGNAL_NAMES, RetrievalError, type RankingSignals } from "../retrieval/types";

export type SignalWeights = Record<keyof RankingSignals, number>;

/**
 * Varsayılan ağırlıklar.
 *
 * Bu sayılar ölçülmüş optimum değil, GEREKÇELİ bir başlangıç noktasıdır
 * ve P16 benchmark'ında ayarlanacaktır. Gerekçeler:
 *
 *   - Semantic ve lexical birlikte %38: hangi fragment'ın konuyla ilgili
 *     olduğunu esas belirleyen bunlar.
 *   - Symbol match %12: tam tanımlayıcı eşleşmesi güçlü ama dar bir
 *     sinyal; tek başına baskın olursa yeniden adlandırmalar kaçar.
 *   - Bağımlılık mesafesi + ters bağımlılık %16: "bu değişiklik neyi
 *     etkiler" sorusunun graf tarafı.
 *   - Git sinyalleri %8: yakın zamanda değişmiş dosya daha olasıdır ama
 *     bu zayıf bir kanıttır; baskın olmamalı.
 *   - Authority %5: dokümantasyon/ADR'lerin ağırlığı; küçük tutuldu çünkü
 *     P00'da `AUTHORITY_WEIGHTS` sıralamayı domine ediyordu.
 *   - `policyAlignment` %3: politika TERCİHİ (erişim kararı değil).
 */
export const DEFAULT_WEIGHTS: SignalWeights = {
  semanticSimilarity: 0.2,
  lexicalSimilarity: 0.18,
  symbolMatch: 0.12,
  dependencyDistance: 0.1,
  reverseDependency: 0.06,
  testRelationship: 0.05,
  documentRelationship: 0.03,
  architectureRelationship: 0.03,
  gitRecency: 0.05,
  changeFrequency: 0.03,
  authority: 0.05,
  taskIntent: 0.05,
  historicalRelevance: 0.02,
  policyAlignment: 0.03
};

/**
 * Semantic kanal kapalıyken kullanılan set.
 *
 * Semantic ağırlığı basitçe sıfırlamak, toplamı 1'in altına düşürür ve
 * tüm skorları küçültür — sonuçlar karşılaştırılamaz hale gelir. Bunun
 * yerine semantic'in payı lexical ve symbol'e AÇIKÇA dağıtılır ve bu
 * setin kendi hash'i olur; manifest hangi setin kullanıldığını görür.
 */
export const NO_SEMANTIC_WEIGHTS: SignalWeights = {
  ...DEFAULT_WEIGHTS,
  semanticSimilarity: 0,
  lexicalSimilarity: 0.3,
  symbolMatch: 0.2
};

const EPSILON = 1e-9;

/**
 * Ağırlık setini doğrular.
 *
 * @throws INVALID_WEIGHTS toplam 1 değilse ya da negatif ağırlık varsa.
 */
export function assertValidWeights(weights: SignalWeights): void {
  for (const name of SIGNAL_NAMES) {
    const value = weights[name];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new RetrievalError("INVALID_WEIGHTS", `${name} agirligi sayi olmali.`);
    }
    if (value < 0) {
      throw new RetrievalError("INVALID_WEIGHTS", `${name} agirligi negatif olamaz: ${value}`);
    }
  }

  const total = SIGNAL_NAMES.reduce((sum, name) => sum + weights[name], 0);
  if (Math.abs(total - 1) > 1e-6) {
    throw new RetrievalError(
      "INVALID_WEIGHTS",
      `Agirlik toplami 1 olmali, ${total.toFixed(6)} bulundu. ` +
        `Calisma zamaninda sessizce normalize EDILMEZ: bu bir yapilandirma hatasidir.`
    );
  }
}

/**
 * Ağırlık setinin kimliği.
 *
 * Anahtarlar sıralanır: nesne alan sırası hash'i değiştirmemeli, aynı
 * ağırlıklar her zaman aynı kimliği vermeli (P09 determinizm girdisi).
 */
export function weightsHash(weights: SignalWeights): string {
  const canonical = SIGNAL_NAMES.map((name) => `${name}=${weights[name].toFixed(6)}`).join("&");
  return createHash("sha256").update(canonical, "utf-8").digest("hex").slice(0, 32);
}

/**
 * Hesaplanamayan sinyaller için ağırlığın yeniden dağıtılması.
 *
 * Bir sinyal `null` ise (kanal çalışmadı) onun ağırlığını 0 sayıp geri
 * kalanı olduğu gibi bırakmak, tüm skorları küçültür ve farklı
 * çalıştırmaları karşılaştırılamaz kılar. Bunun yerine ağırlık,
 * hesaplanabilen sinyaller arasında ORANTILI dağıtılır.
 *
 * Hiçbir sinyal hesaplanamadıysa boş set döner ve skor 0 olur — bu
 * dürüst sonuçtur, uydurma bir taban skor değil.
 */
export function redistributeWeights(
  weights: SignalWeights,
  signals: RankingSignals
): SignalWeights {
  const available = SIGNAL_NAMES.filter((name) => signals[name] !== null);
  if (available.length === 0) {
    return Object.fromEntries(SIGNAL_NAMES.map((n) => [n, 0])) as SignalWeights;
  }

  const availableTotal = available.reduce((sum, name) => sum + weights[name], 0);
  if (availableTotal < EPSILON) {
    // Hesaplanabilen sinyallerin tumunun agirligi sifirsa esit dagit:
    // aksi halde skor her zaman 0 olurdu ve siralama anlamsizlasirdi.
    const equal = 1 / available.length;
    return Object.fromEntries(
      SIGNAL_NAMES.map((n) => [n, available.includes(n) ? equal : 0])
    ) as SignalWeights;
  }

  return Object.fromEntries(
    SIGNAL_NAMES.map((n) => [n, available.includes(n) ? weights[n] / availableTotal : 0])
  ) as SignalWeights;
}
