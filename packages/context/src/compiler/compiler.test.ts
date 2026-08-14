/**
 * P08 — Tokenizer, bütçe ve compiler testleri.
 *
 * BU DOSYADA HİÇBİR MOCK YOKTUR — ve bu bir tesadüf değil, ADR-033'ün
 * testidir. Compiler saf bir fonksiyondur; mock gerektirmesi saflığın
 * bozulduğunun kanıtı olurdu.
 */

import { describe, it, expect } from "vitest";
import { HeuristicTokenizer, TokenizerRegistry, createDefaultTokenizerRegistry } from "../tokenizer/registry";
import { TokenizerError, type Tokenizer } from "../tokenizer/types";
import {
  APPROXIMATION_MARGIN_RATIO,
  BudgetError,
  computeBudget,
  defaultReserves,
  type TokenBudget
} from "../budget/engine";
import { CompileError, compileContext, hashInputs, type CompileInput } from "./compile";
import { emptySignals, type Candidate, type RankedCandidate } from "../retrieval/types";

// --- Yardımcılar (mock DEĞİL: saf veri kurucuları) -------------------------

function candidate(id: string, tokens: number, overrides: Partial<Candidate> = {}): Candidate {
  return {
    chunkId: id,
    path: `src/${id}.ts`,
    symbolName: id,
    symbolType: "function",
    content: `export function ${id}() {}`,
    startLine: 1,
    endLine: 5,
    estimatedTokens: tokens,
    containsSecret: false,
    channels: ["lexical"],
    rawScores: { lexical: 0.5 },
    ...overrides
  };
}

function ranked(id: string, tokens: number, score: number, rank = 1): RankedCandidate {
  return {
    candidate: candidate(id, tokens),
    signals: emptySignals(),
    finalScore: score,
    rank,
    explanation: { topReasons: [`metin eslesmesi: ${score}`], contributions: {}, missingSignals: [] }
  };
}

const BUDGET: TokenBudget = {
  providerContextLimit: 200_000,
  reserves: { systemPrompt: 5_000, toolDefinitions: 5_000, expectedOutput: 8_000, safetyMargin: 2_000 },
  policyCeiling: null,
  available: 1_000,
  boundBy: "provider_limit",
  tokenizerApproximate: false,
  approximationMargin: 0
};

function input(overrides: Partial<CompileInput> = {}): CompileInput {
  return {
    taskId: "task_1",
    snapshotId: "snap_1",
    commitSha: "a".repeat(40),
    universeHash: "u".repeat(64),
    policyVersion: "v1",
    compilerVersion: "1.0.0",
    weightsHash: "w".repeat(32),
    parserVersions: { typescript: "5.9.3" },
    budget: BUDGET,
    candidates: [ranked("a", 300, 0.9, 1), ranked("b", 300, 0.8, 2)],
    recentDiffs: null,
    recentDiffsUnavailableReason: "test ortaminda git yok",
    ...overrides
  };
}

// --- Tokenizer -------------------------------------------------------------

describe("HeuristicTokenizer — yaklaşıklık GİZLENMEZ", () => {
  const tokenizer = new HeuristicTokenizer();

  it("yaklaşık olduğunu bildirir", () => {
    expect(tokenizer.approximate).toBe(true);
  });

  it("boş metinde sıfır döner", () => {
    expect(tokenizer.count("")).toBe(0);
  });

  it("kod için düz metinden DAHA ÇOK token sayar", () => {
    // Ayni uzunlukta kod ve duz metin: kod daha cok token uretir cunku
    // noktalama ve tanimlayici parcalari BPE'de ayri token olur.
    const prose = "the quick brown fox jumps over the lazy dog and runs away";
    const code = "const x={a:1,b:[2,3]};fn(x.a,x.b[0]);if(x){y();}else{z();}";

    const perCharProse = tokenizer.count(prose) / prose.length;
    const perCharCode = tokenizer.count(code) / code.length;
    expect(perCharCode).toBeGreaterThan(perCharProse);
  });

  it("CJK karakterlerini karakter başına sayar", () => {
    // BPE'de CJK genellikle karakter basina ~1 token.
    expect(tokenizer.count("日本語テキスト")).toBeGreaterThanOrEqual(7);
  });

  it("toplu sayım tek tek sayımla AYNI sonucu verir", () => {
    const texts = ["merhaba", "const x = 1;", "日本語"];
    expect(tokenizer.countBatch(texts)).toEqual(texts.map((t) => tokenizer.count(t)));
  });

  it("chars/4 ile farkı SEMBOL YOĞUNLUĞUNA bağlıdır", () => {
    // P00'daki `chars/4` ile bu heuristic arasindaki fark OLCULUR.
    // Bulgu: seyrek sembollu kodda IKISI AYNI sonucu verir; fark yalnizca
    // sembol yogun kodda ortaya cikar. Bu, heuristic'in `chars/4`u her
    // yerde duzelttigi iddiasinda BULUNMADIGINI gosterir.
    const sparse = "export function calculateTotal(items: Item[]): number { return items.length; }";
    const dense = "const x={a:1,b:[2,3]};fn(x.a,x.b[0]);if(x){y();}else{z();}";

    const naiveOf = (t: string) => Math.ceil(t.length / 4);
    const deviationOf = (t: string) => Math.abs(tokenizer.count(t) - naiveOf(t)) / naiveOf(t);

    // Seyrek: sembol orani esigin altinda, ayni oran kullanilir.
    expect(deviationOf(sparse)).toBe(0);

    // Yogun: heuristic DAHA COK token sayar (BPE davranisina daha yakin).
    expect(tokenizer.count(dense)).toBeGreaterThan(naiveOf(dense));
    // Ama makul bir aralikta; %50'den fazla sapma kalibrasyonun bozuk
    // oldugunu gosterirdi.
    expect(deviationOf(dense)).toBeLessThan(0.5);
  });
});

describe("HeuristicTokenizer — truncate", () => {
  const tokenizer = new HeuristicTokenizer();

  it("sınır altındaki metni değiştirmez", () => {
    const text = "kisa metin";
    expect(tokenizer.truncate(text, 1_000)).toBe(text);
  });

  it("SATIR sınırında keser (kelime ortasından değil)", () => {
    const text = "birinci satir\nikinci satir\nucuncu satir\n";
    const truncated = tokenizer.truncate(text, 4);

    expect(text.startsWith(truncated)).toBe(true);
    expect(truncated.endsWith("\n") || truncated === "").toBe(true);
  });

  it("geçersiz sınırda hata verir", () => {
    expect(() => tokenizer.truncate("x", 0)).toThrow(TokenizerError);
  });

  it("tek satır bile sığmıyorsa karakter sınırında keser", () => {
    const single = "x".repeat(1000);
    const truncated = tokenizer.truncate(single, 5);
    expect(truncated.length).toBeGreaterThan(0);
    expect(truncated.length).toBeLessThan(single.length);
  });
});

describe("TokenizerRegistry — bilinmezlik dürüstçe bildirilir", () => {
  it("bilinmeyen provider için heuristic'e düşer", () => {
    const registry = new TokenizerRegistry();
    expect(registry.resolve("bilinmeyen").approximate).toBe(true);
  });

  it("hasExact bilinmeyen provider için false döner", () => {
    expect(new TokenizerRegistry().hasExact("anthropic")).toBe(false);
  });

  it("kayıtlı kesin tokenizer için true döner", () => {
    const base = new HeuristicTokenizer();
    // Kesin bir tokenizer'i taklit eden minimal uygulama. Gercek BPE
    // saymasi bu testin konusu degil; `hasExact` mantigi konusu.
    const exact: Tokenizer = {
      id: "exact",
      approximate: false,
      count: (text) => base.count(text),
      countBatch: (texts) => base.countBatch(texts),
      truncate: (text, max) => base.truncate(text, max)
    };
    const registry = new TokenizerRegistry().register("test", exact);
    expect(registry.hasExact("test")).toBe(true);
  });

  it("varsayılan registry BOŞTUR (gerçek tokenizer iddiası yok)", () => {
    // Gercek BPE tokenizer'lari P11'de baglanacak. Bugun "var" demek
    // yanlis olurdu.
    expect(createDefaultTokenizerRegistry().list()).toEqual([]);
  });
});

// --- Bütçe -----------------------------------------------------------------

describe("computeBudget — 50.000 bir ürün sabiti DEĞİL (ADR-031)", () => {
  it("bütçe provider limitinden rezervler çıkarılarak hesaplanır", () => {
    const budget = computeBudget({
      providerContextLimit: 100_000,
      reserves: { systemPrompt: 5_000, toolDefinitions: 5_000, expectedOutput: 8_000, safetyMargin: 2_000 },
      tokenizerApproximate: false
    });

    expect(budget.available).toBe(80_000);
    expect(budget.boundBy).toBe("provider_limit");
  });

  it("policy tavanı bütçeyi DARALTIR", () => {
    const budget = computeBudget({
      providerContextLimit: 200_000,
      reserves: defaultReserves(200_000),
      policyCeiling: 30_000,
      tokenizerApproximate: false
    });

    expect(budget.available).toBe(30_000);
    expect(budget.boundBy).toBe("policy_ceiling");
  });

  it("policy tavanı provider limitinden büyükse etkisizdir", () => {
    const budget = computeBudget({
      providerContextLimit: 50_000,
      reserves: { systemPrompt: 1_000, toolDefinitions: 1_000, expectedOutput: 1_000, safetyMargin: 1_000 },
      policyCeiling: 999_999,
      tokenizerApproximate: false
    });

    expect(budget.available).toBe(46_000);
    expect(budget.boundBy).toBe("provider_limit");
  });

  it("yaklaşık tokenizer güvenlik payını ARTIRIR", () => {
    const exact = computeBudget({
      providerContextLimit: 100_000,
      reserves: defaultReserves(100_000),
      tokenizerApproximate: false
    });
    const approximate = computeBudget({
      providerContextLimit: 100_000,
      reserves: defaultReserves(100_000),
      tokenizerApproximate: true
    });

    expect(approximate.available).toBeLessThan(exact.available);
    expect(approximate.approximationMargin).toBe(
      Math.ceil(100_000 * APPROXIMATION_MARGIN_RATIO)
    );
  });

  it("rezervler limiti aşarsa SIFIR BÜTÇEYLE devam etmez", () => {
    expect(() =>
      computeBudget({
        providerContextLimit: 10_000,
        reserves: { systemPrompt: 5_000, toolDefinitions: 5_000, expectedOutput: 5_000, safetyMargin: 1_000 },
        tokenizerApproximate: false
      })
    ).toThrow(BudgetError);
  });

  it("sıfır bütçe hatası GEREKÇE taşır", () => {
    try {
      computeBudget({
        providerContextLimit: 1_000,
        reserves: { systemPrompt: 500, toolDefinitions: 500, expectedOutput: 500, safetyMargin: 500 },
        tokenizerApproximate: false
      });
      expect.unreachable("hata bekleniyordu");
    } catch (error) {
      expect((error as BudgetError).code).toBe("INSUFFICIENT_BUDGET");
      expect((error as BudgetError).detail.reserveTotal).toBe(2_000);
    }
  });

  it("geçersiz provider limiti reddedilir", () => {
    expect(() =>
      computeBudget({
        providerContextLimit: 0,
        reserves: defaultReserves(1000),
        tokenizerApproximate: false
      })
    ).toThrow(/pozitif olmali/);
  });

  it("rezervler provider limitiyle ORANTILIDIR (sabit değil)", () => {
    // Eski kod her provider icin ayni 5000/5000/8000/2000 kullaniyordu;
    // 8K'lik bir modelde bu, butcenin tamamini yerdi.
    const small = defaultReserves(8_000);
    const large = defaultReserves(200_000);
    expect(small.systemPrompt).toBeLessThan(large.systemPrompt);
  });
});

// --- Compiler --------------------------------------------------------------

describe("compileContext — bütçeye yerleştirme", () => {
  it("adayları bütçeye sığdığı kadar dahil eder", () => {
    const result = compileContext(input());
    expect(result.fragments.length).toBe(2);
    expect(result.tokensUsed).toBe(600);
  });

  it("bütçe dolunca kalanları exclusions'a YAZAR (sessizce atmaz)", () => {
    const result = compileContext(
      input({
        budget: { ...BUDGET, available: 400 },
        candidates: [ranked("a", 300, 0.9, 1), ranked("b", 300, 0.8, 2)]
      })
    );

    expect(result.fragments.length).toBe(1);
    expect(result.exclusions.length).toBe(1);
    expect(result.exclusions[0].reason).toBe("budget");
    expect(result.exclusions[0].detail).toContain("token");
  });

  it("zorunlu kaynak skoru düşük olsa bile ÖNCE gelir", () => {
    const result = compileContext(
      input({
        budget: { ...BUDGET, available: 400 },
        candidates: [ranked("yuksek", 300, 0.9, 1), ranked("zorunlu", 300, 0.1, 2)],
        requiredChunkIds: ["zorunlu"]
      })
    );

    expect(result.fragments[0].chunkId).toBe("zorunlu");
  });

  it("zorunlu fragment bütçeden büyükse SESSİZCE KESMEZ", () => {
    expect(() =>
      compileContext(
        input({
          budget: { ...BUDGET, available: 100 },
          candidates: [ranked("dev", 5_000, 0.5, 1)],
          requiredChunkIds: ["dev"]
        })
      )
    ).toThrow(CompileError);
  });

  it("hiçbir aday sığmazsa BOŞ CONTEXT üretmez", () => {
    expect(() =>
      compileContext(
        input({
          budget: { ...BUDGET, available: 10 },
          candidates: [ranked("a", 300, 0.9, 1)]
        })
      )
    ).toThrow(/Bos bir context uretmek/);
  });

  it("aynı satır aralığını iki kez dahil etmez", () => {
    const duplicate: RankedCandidate = {
      ...ranked("b", 300, 0.8, 2),
      candidate: { ...candidate("b", 300), path: "src/a.ts", startLine: 1, endLine: 5 }
    };

    const result = compileContext(
      input({ candidates: [ranked("a", 300, 0.9, 1), duplicate] })
    );

    expect(result.fragments.length).toBe(1);
    expect(result.exclusions[0].reason).toBe("duplicate");
  });

  it("bütçe kullanım oranını raporlar", () => {
    const result = compileContext(input({ budget: { ...BUDGET, available: 1_200 } }));
    expect(result.budgetUtilization).toBeCloseTo(0.5, 5);
  });

  it("her fragment 'bu neden seçildi' bilgisini taşır", () => {
    const result = compileContext(input());
    for (const fragment of result.fragments) {
      expect(fragment.includedBecause.length).toBeGreaterThan(0);
    }
  });

  it("her fragment kaynak içerik hash'ini taşır (provenance)", () => {
    const result = compileContext(input());
    for (const fragment of result.fragments) {
      expect(fragment.sourceContentHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("compileContext — uydurma alan YASAĞI (ADR-032)", () => {
  it("git bilgisi yoksa null döner ve SEBEBİ yazılır", () => {
    const result = compileContext(input({ recentDiffs: null, recentDiffsUnavailableReason: "git yok" }));

    // Eski kod burada `{ author: "User-Aydinoglu", line_changes: "+45 -12" }`
    // uyduruyordu ve bunu veritabanina yaziyordu.
    expect(result.recentDiffs).toBeNull();
    expect(result.unavailableFields).toEqual([{ field: "recentDiffs", reason: "git yok" }]);
  });

  it("gerçek git bilgisi verilirse aynen taşınır", () => {
    const diffs = [{ path: "src/a.ts", insertions: 3, deletions: 1, author: "gercek", sha: "abc" }];
    const result = compileContext(input({ recentDiffs: diffs }));

    expect(result.recentDiffs).toEqual(diffs);
    expect(result.unavailableFields).toEqual([]);
  });

  it("yaklaşık tokenizer bilgisi çıktıya taşınır", () => {
    const result = compileContext(
      input({ budget: { ...BUDGET, tokenizerApproximate: true } })
    );
    expect(result.tokenizerApproximate).toBe(true);
  });
});

describe("compileContext — DETERMİNİZM (ADR-033)", () => {
  it("aynı girdi 100 kez → aynı çıktı (byte düzeyinde)", () => {
    const spec = input();
    const first = JSON.stringify(compileContext(spec));

    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(compileContext(spec))).toBe(first);
    }
  });

  it("aday sırası çıktıyı DEĞİŞTİRMEZ", () => {
    const forward = compileContext(input({ candidates: [ranked("a", 300, 0.5, 1), ranked("b", 300, 0.5, 2)] }));
    const reverse = compileContext(input({ candidates: [ranked("b", 300, 0.5, 2), ranked("a", 300, 0.5, 1)] }));

    expect(forward.fragments.map((f) => f.chunkId)).toEqual(reverse.fragments.map((f) => f.chunkId));
  });

  it("girdi hash'i aynı girdide aynıdır", () => {
    expect(hashInputs(input())).toBe(hashInputs(input()));
  });

  it("commit değişince hash değişir", () => {
    expect(hashInputs(input({ commitSha: "b".repeat(40) }))).not.toBe(hashInputs(input()));
  });

  it("policy sürümü değişince hash değişir", () => {
    expect(hashInputs(input({ policyVersion: "v2" }))).not.toBe(hashInputs(input()));
  });

  it("ağırlık seti değişince hash değişir", () => {
    expect(hashInputs(input({ weightsHash: "x".repeat(32) }))).not.toBe(hashInputs(input()));
  });

  it("parser sürümü değişince hash değişir", () => {
    expect(hashInputs(input({ parserVersions: { typescript: "6.0.0" } }))).not.toBe(hashInputs(input()));
  });

  it("universe değişince hash değişir", () => {
    expect(hashInputs(input({ universeHash: "z".repeat(64) }))).not.toBe(hashInputs(input()));
  });

  it("parser sürümlerinin ALAN SIRASI hash'i değiştirmez", () => {
    const a = hashInputs(input({ parserVersions: { typescript: "5.9.3", python: "1.0" } }));
    const b = hashInputs(input({ parserVersions: { python: "1.0", typescript: "5.9.3" } }));
    expect(a).toBe(b);
  });
});
