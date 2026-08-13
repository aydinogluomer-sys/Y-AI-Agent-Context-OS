/**
 * P06 / Y-P06-009, Y-P06-010 — Ranker ve açıklanabilirlik testleri.
 *
 * En kritik test: `finalScore` kayıtlı sinyallerden YENİDEN
 * HESAPLANABİLİYOR mu. Hesaplanamıyorsa skor bir yerde elle
 * düzeltilmiş demektir ve "açıklanabilir sıralama" iddiası boştur.
 */

import { describe, it, expect } from "vitest";
import { rankCandidates, computeScore, recomputeScore, explain } from "./ranker";
import {
  DEFAULT_WEIGHTS,
  NO_SEMANTIC_WEIGHTS,
  assertValidWeights,
  redistributeWeights,
  weightsHash,
  type SignalWeights
} from "./weights";
import { emptySignals, RetrievalError, SIGNAL_NAMES, type Candidate, type RankingSignals } from "../retrieval/types";

function candidate(id: string, overrides: Partial<Candidate> = {}): Candidate {
  return {
    chunkId: id,
    path: `src/${id}.ts`,
    symbolName: null,
    symbolType: null,
    content: "kod",
    startLine: 1,
    endLine: 10,
    estimatedTokens: 50,
    containsSecret: false,
    channels: ["lexical"],
    rawScores: { lexical: 0.5 },
    ...overrides
  };
}

function signals(overrides: Partial<RankingSignals> = {}): RankingSignals {
  return { ...emptySignals(), ...overrides };
}

describe("weights — sessiz normalizasyon YOK", () => {
  it("varsayılan ağırlıkların toplamı 1", () => {
    expect(() => assertValidWeights(DEFAULT_WEIGHTS)).not.toThrow();
  });

  it("semantic'siz set de geçerlidir", () => {
    expect(() => assertValidWeights(NO_SEMANTIC_WEIGHTS)).not.toThrow();
  });

  it("toplamı 1 olmayan set HATA verir (sessizce normalize edilmez)", () => {
    const broken: SignalWeights = { ...DEFAULT_WEIGHTS, semanticSimilarity: 0.9 };
    expect(() => assertValidWeights(broken)).toThrow(RetrievalError);
    expect(() => assertValidWeights(broken)).toThrow(/Agirlik toplami 1 olmali/);
  });

  it("negatif ağırlık reddedilir", () => {
    const broken: SignalWeights = { ...DEFAULT_WEIGHTS, authority: -0.05, semanticSimilarity: 0.25 };
    expect(() => assertValidWeights(broken)).toThrow(/negatif/);
  });

  it("14 sinyalin tamamı ağırlık setinde var", () => {
    for (const name of SIGNAL_NAMES) {
      expect(DEFAULT_WEIGHTS[name], name).toBeTypeOf("number");
    }
    expect(SIGNAL_NAMES.length).toBe(14);
  });
});

describe("weightsHash — determinizm girdisi", () => {
  it("aynı ağırlıklar aynı hash'i verir", () => {
    expect(weightsHash(DEFAULT_WEIGHTS)).toBe(weightsHash({ ...DEFAULT_WEIGHTS }));
  });

  it("alan sırası hash'i değiştirmez", () => {
    const reordered = Object.fromEntries(
      [...SIGNAL_NAMES].reverse().map((n) => [n, DEFAULT_WEIGHTS[n]])
    ) as SignalWeights;
    expect(weightsHash(reordered)).toBe(weightsHash(DEFAULT_WEIGHTS));
  });

  it("tek bir ağırlık değişince hash değişir", () => {
    const changed: SignalWeights = {
      ...DEFAULT_WEIGHTS,
      semanticSimilarity: 0.21,
      lexicalSimilarity: 0.17
    };
    expect(weightsHash(changed)).not.toBe(weightsHash(DEFAULT_WEIGHTS));
  });
});

describe("redistributeWeights — null sinyal cezalandırmaz", () => {
  it("hesaplanamayan sinyalin ağırlığı diğerlerine dağıtılır", () => {
    const partial = signals({ lexicalSimilarity: 1, symbolMatch: 1 });
    const effective = redistributeWeights(DEFAULT_WEIGHTS, partial);

    const total = SIGNAL_NAMES.reduce((sum, n) => sum + effective[n], 0);
    expect(total).toBeCloseTo(1, 6);
    expect(effective.semanticSimilarity).toBe(0);
  });

  it("iki sinyalli aday, tek sinyalliyle karşılaştırılabilir kalır", () => {
    // Agirligi sifir saymak tum skorlari kucultur ve karsilastirmayi bozar.
    const only = computeScore(
      signals({ lexicalSimilarity: 1 }),
      redistributeWeights(DEFAULT_WEIGHTS, signals({ lexicalSimilarity: 1 }))
    );
    expect(only).toBe(1);
  });

  it("hiçbir sinyal hesaplanamadıysa skor 0 (uydurma taban skor yok)", () => {
    const none = emptySignals();
    const effective = redistributeWeights(DEFAULT_WEIGHTS, none);
    expect(computeScore(none, effective)).toBe(0);
  });
});

describe("ranker — skor TÜRETİLMİŞ değerdir (ADR-026)", () => {
  it("final skor sinyallerden yeniden hesaplanabiliyor", () => {
    const input = [
      { candidate: candidate("a"), signals: signals({ lexicalSimilarity: 0.8, semanticSimilarity: 0.6, authority: 0.3 }) },
      { candidate: candidate("b"), signals: signals({ lexicalSimilarity: 0.2, semanticSimilarity: 0.9 }) }
    ];

    const ranked = rankCandidates(input, { weights: DEFAULT_WEIGHTS });

    // Denetim: kaydedilen sinyallerden skor yeniden uretilmeli.
    for (const item of ranked) {
      expect(recomputeScore(item.signals, DEFAULT_WEIGHTS)).toBeCloseTo(item.finalScore, 6);
    }
  });

  it("katkıların toplamı final skora eşittir", () => {
    const input = [
      { candidate: candidate("a"), signals: signals({ lexicalSimilarity: 0.8, semanticSimilarity: 0.6 }) }
    ];
    const ranked = rankCandidates(input, { weights: DEFAULT_WEIGHTS });

    const sum = Object.values(ranked[0].explanation.contributions).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(ranked[0].finalScore, 5);
  });

  it("ağırlık değişimi sıralamayı BEKLENEN yönde değiştirir", () => {
    const input = [
      { candidate: candidate("lexical_guclu"), signals: signals({ lexicalSimilarity: 1, semanticSimilarity: 0.1 }) },
      { candidate: candidate("semantic_guclu"), signals: signals({ lexicalSimilarity: 0.1, semanticSimilarity: 1 }) }
    ];

    // Iki acik set: hangi sinyalin agir bastigi sonucu belirlemeli.
    // Varsayilan set taban olarak KULLANILMIYOR cunku orada semantic
    // (0,20) lexical'dan (0,18) zaten agir; testin bir sey kanitlamasi
    // icin iki ucun de acikca kurulmasi gerekir.
    const lexicalHeavy: SignalWeights = {
      ...DEFAULT_WEIGHTS,
      lexicalSimilarity: 0.3,
      semanticSimilarity: 0.08
    };
    const semanticHeavy: SignalWeights = {
      ...DEFAULT_WEIGHTS,
      semanticSimilarity: 0.3,
      lexicalSimilarity: 0.08
    };

    const a = rankCandidates(input, { weights: lexicalHeavy });
    const b = rankCandidates(input, { weights: semanticHeavy });

    expect(a[0].candidate.chunkId).toBe("lexical_guclu");
    expect(b[0].candidate.chunkId).toBe("semantic_guclu");
  });

  it("geçersiz ağırlık setiyle çalışmaz", () => {
    expect(() =>
      rankCandidates([], { weights: { ...DEFAULT_WEIGHTS, authority: 0.5 } })
    ).toThrow(RetrievalError);
  });
});

describe("ranker — determinizm", () => {
  it("girdi sırası çıktıyı etkilemez", () => {
    const a = { candidate: candidate("aaa"), signals: signals({ lexicalSimilarity: 0.5 }) };
    const b = { candidate: candidate("bbb"), signals: signals({ lexicalSimilarity: 0.5 }) };

    const forward = rankCandidates([a, b], { weights: DEFAULT_WEIGHTS });
    const reverse = rankCandidates([b, a], { weights: DEFAULT_WEIGHTS });

    expect(forward.map((r) => r.candidate.chunkId)).toEqual(reverse.map((r) => r.candidate.chunkId));
  });

  it("eşit skorda chunkId ile kararlı sıralanır", () => {
    const items = ["ccc", "aaa", "bbb"].map((id) => ({
      candidate: candidate(id),
      signals: signals({ lexicalSimilarity: 0.5 })
    }));

    const ranked = rankCandidates(items, { weights: DEFAULT_WEIGHTS });
    expect(ranked.map((r) => r.candidate.chunkId)).toEqual(["aaa", "bbb", "ccc"]);
  });

  it("rank 1'den başlar ve ardışıktır", () => {
    const items = ["a", "b", "c"].map((id, i) => ({
      candidate: candidate(id),
      signals: signals({ lexicalSimilarity: 1 - i * 0.1 })
    }));

    const ranked = rankCandidates(items, { weights: DEFAULT_WEIGHTS });
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });
});

describe("ranker — limitler", () => {
  it("minScore altındaki adaylar elenir", () => {
    const items = [
      { candidate: candidate("yuksek"), signals: signals({ lexicalSimilarity: 1 }) },
      { candidate: candidate("dusuk"), signals: signals({ lexicalSimilarity: 0.01 }) }
    ];

    const ranked = rankCandidates(items, { weights: DEFAULT_WEIGHTS, minScore: 0.5 });
    expect(ranked.length).toBe(1);
    expect(ranked[0].candidate.chunkId).toBe("yuksek");
  });

  it("limit uygulanır", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      candidate: candidate(`c${i}`),
      signals: signals({ lexicalSimilarity: 1 - i * 0.05 })
    }));

    expect(rankCandidates(items, { weights: DEFAULT_WEIGHTS, limit: 3 }).length).toBe(3);
  });
});

describe("explain — 'bu neden seçildi?'", () => {
  it("en çok KATKI yapan sinyalleri sıralar (en yüksek ham değeri değil)", () => {
    // authority ham degeri 1 ama agirligi 0.05; lexical 0.6 ama agirligi 0.18.
    // Gerekce KATKIYA gore verilmeli.
    const s = signals({ authority: 1, lexicalSimilarity: 0.6 });
    const effective = redistributeWeights(DEFAULT_WEIGHTS, s);
    const explanation = explain(s, effective);

    expect(explanation.topReasons[0]).toContain("metin eslesmesi");
  });

  it("hesaplanamayan sinyalleri listeler", () => {
    const s = signals({ lexicalSimilarity: 0.5 });
    const explanation = explain(s, redistributeWeights(DEFAULT_WEIGHTS, s));

    expect(explanation.missingSignals).toContain("semanticSimilarity");
    expect(explanation.missingSignals.length).toBe(13);
  });

  it("her katkı sinyal × ağırlıktır", () => {
    const s = signals({ lexicalSimilarity: 0.5, semanticSimilarity: 0.5 });
    const effective = redistributeWeights(DEFAULT_WEIGHTS, s);
    const explanation = explain(s, effective);

    expect(explanation.contributions.lexicalSimilarity).toBeCloseTo(
      0.5 * effective.lexicalSimilarity,
      6
    );
  });

  it("katkısı sıfır olan sinyal gerekçe olarak gösterilmez", () => {
    const s = signals({ lexicalSimilarity: 0.8, authority: 0 });
    const explanation = explain(s, redistributeWeights(DEFAULT_WEIGHTS, s));

    expect(explanation.topReasons.some((r) => r.includes("otorite"))).toBe(false);
  });

  it("seçilen her aday için açıklama üretilir", () => {
    const items = ["a", "b"].map((id) => ({
      candidate: candidate(id),
      signals: signals({ lexicalSimilarity: 0.7 })
    }));

    for (const ranked of rankCandidates(items, { weights: DEFAULT_WEIGHTS })) {
      expect(ranked.explanation.topReasons.length).toBeGreaterThan(0);
      expect(Object.keys(ranked.explanation.contributions).length).toBeGreaterThan(0);
    }
  });
});

describe("computeScore — sınırlar", () => {
  it("skor 0..1 aralığında kalır", () => {
    const s = signals(
      Object.fromEntries(SIGNAL_NAMES.map((n) => [n, 5])) as Partial<RankingSignals>
    );
    expect(computeScore(s, DEFAULT_WEIGHTS)).toBeLessThanOrEqual(1);
  });

  it("negatif sinyal 0 sayılır", () => {
    const s = signals({ lexicalSimilarity: -3 });
    expect(computeScore(s, redistributeWeights(DEFAULT_WEIGHTS, s))).toBe(0);
  });

  it("NaN sinyal skoru bozmaz", () => {
    const s = signals({ lexicalSimilarity: Number.NaN, semanticSimilarity: 1 });
    const score = computeScore(s, redistributeWeights(DEFAULT_WEIGHTS, s));
    expect(Number.isFinite(score)).toBe(true);
  });
});
