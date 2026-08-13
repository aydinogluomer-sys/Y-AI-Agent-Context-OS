/**
 * P06 / Y-P06-009, Y-P06-010 — 14 sinyalli açıklanabilir sıralama.
 *
 * DENETLENEBİLİRLİK SÖZLEŞMESİ (ADR-026)
 *   `finalScore` TÜRETİLMİŞ bir değerdir: sinyaller × ağırlıklar. Kayıtlı
 *   sinyallerden yeniden hesaplanabilmelidir. Hesaplanamıyorsa skor bir
 *   yerde elle düzeltilmiş demektir ve "açıklanabilir" iddiası boştur.
 *   `recomputeScore()` bunu doğrulamak için VARDIR; testler bu eşitliği
 *   kilitler.
 *
 * ESKİ HALİ NE YAPIYORDU (P00)
 *   `scoreContextItem` (`context/src/index.ts:417-518`): path eşleşmesi
 *   +45/+25, kategori dizini +20, `AUTHORITY_WEIGHTS`, recency kovaları
 *   +20/15/10/5, chunk yoğunluğu +25, sonra 100'e clamp. Sayılar koda
 *   gömülüydü, toplam 100'ü aşınca kırpılıyordu ve hangi bileşenin
 *   sonucu belirlediği kayıt altında değildi.
 */

import {
  SIGNAL_NAMES,
  type Candidate,
  type RankedCandidate,
  type RankingExplanation,
  type RankingSignals
} from "../retrieval/types";
import {
  assertValidWeights,
  redistributeWeights,
  type SignalWeights
} from "./weights";

export interface RankOptions {
  readonly weights: SignalWeights;
  /** Bu skorun altındaki adaylar döndürülmez. */
  readonly minScore?: number;
  readonly limit?: number;
}

/**
 * Adayları sıralar.
 *
 * Girdi sırası çıktıyı ETKİLEMEZ: eşit skorlu adaylar `chunkId`'ye göre
 * çözülür. Determinizm P09'un gereğidir — aynı girdi aynı manifest'i
 * üretmeli.
 */
export function rankCandidates(
  scored: readonly { candidate: Candidate; signals: RankingSignals }[],
  options: RankOptions
): RankedCandidate[] {
  assertValidWeights(options.weights);

  const withScores = scored.map((item) => {
    const effective = redistributeWeights(options.weights, item.signals);
    const finalScore = computeScore(item.signals, effective);
    return {
      candidate: item.candidate,
      signals: item.signals,
      finalScore,
      explanation: explain(item.signals, effective)
    };
  });

  withScores.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    // Esit skorda kararli siralama: aksi halde ayni girdi farkli
    // manifest uretebilirdi.
    return a.candidate.chunkId.localeCompare(b.candidate.chunkId);
  });

  const minScore = options.minScore ?? 0;
  const filtered = withScores.filter((item) => item.finalScore >= minScore);
  const limited = options.limit !== undefined ? filtered.slice(0, options.limit) : filtered;

  return limited.map((item, index) => ({ ...item, rank: index + 1 }));
}

/**
 * Ağırlıklı toplam.
 *
 * `null` sinyaller ATLANIR; ağırlıkları `redistributeWeights` tarafından
 * zaten hesaplanabilenlere dağıtılmıştır. `null`'ı 0 saymak, hiç
 * hesaplanmamış bir sinyali "sıfır çıktı" gibi göstererek skoru
 * haksızca düşürürdü.
 */
export function computeScore(signals: RankingSignals, weights: SignalWeights): number {
  let total = 0;
  for (const name of SIGNAL_NAMES) {
    const value = signals[name];
    if (value === null) continue;
    total += clamp01(value) * weights[name];
  }
  return Number(clamp01(total).toFixed(6));
}

/**
 * Denetim: kayıtlı sinyallerden skoru yeniden hesaplar.
 *
 * `retrieval_candidates` satırından okunan değerlerle çağrılır ve
 * `final_score` ile karşılaştırılır. Fark varsa skor kayıt dışı bir
 * yerden gelmiş demektir.
 */
export function recomputeScore(
  signals: RankingSignals,
  baseWeights: SignalWeights
): number {
  return computeScore(signals, redistributeWeights(baseWeights, signals));
}

/** İnsan tarafından okunabilir gerekçe. */
export function explain(signals: RankingSignals, effectiveWeights: SignalWeights): RankingExplanation {
  const contributions: Record<string, number> = {};
  const missing: string[] = [];

  for (const name of SIGNAL_NAMES) {
    const value = signals[name];
    if (value === null) {
      missing.push(name);
      continue;
    }
    contributions[name] = Number((clamp01(value) * effectiveWeights[name]).toFixed(6));
  }

  // En cok KATKI yapan sinyaller — en yuksek HAM DEGERLI olanlar degil.
  // 0,95'lik bir sinyal agirligi 0,01 ise sonucu belirlemiyordur ve
  // gerekce olarak sunulmasi yaniltici olur.
  const topReasons = Object.entries(contributions)
    .filter(([, contribution]) => contribution > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, contribution]) => describeReason(name, signals[name as keyof RankingSignals], contribution));

  return { topReasons, contributions, missingSignals: missing };
}

function describeReason(name: string, value: number | null, contribution: number): string {
  const shown = value === null ? "?" : value.toFixed(2);
  const labels: Record<string, string> = {
    semanticSimilarity: "anlamsal benzerlik",
    lexicalSimilarity: "metin eslesmesi",
    symbolMatch: "sembol adi eslesmesi",
    dependencyDistance: "bagimlilik yakinligi",
    reverseDependency: "ters bagimlilik",
    testRelationship: "iliskili test",
    documentRelationship: "iliskili dokuman",
    architectureRelationship: "mimari iliski",
    gitRecency: "yakin zamanda degismis",
    changeFrequency: "sik degisen dosya",
    authority: "otorite (ADR/dokuman)",
    taskIntent: "gorev niyetiyle ortusme",
    historicalRelevance: "gecmis gorevlerde ilgili",
    policyAlignment: "proje politikasi tercihi"
  };
  return `${labels[name] ?? name}: ${shown} (katki ${contribution.toFixed(3)})`;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
