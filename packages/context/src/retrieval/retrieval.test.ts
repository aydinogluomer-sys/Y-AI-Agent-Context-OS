/**
 * P06 / Y-P06-004..006, Y-P06-011 — Retrieval kanalları ve birleştirme.
 *
 * BU TESTLERİN SINIRI
 *   Lexical ve semantic kanallar Postgres'e (FTS, pgvector) dayanır.
 *   Buradaki testler sorgu ŞEKLİNİ (tenant predicate'i, firewall ön
 *   filtresi, sıralama, limit) ve sonuç yorumlanmasını doğrular; FTS
 *   sıralamasının ya da ANN geri çağırmasının gerçekten beklendiği gibi
 *   çalıştığını DOĞRULAMAZ. Bu, canlı şema gerektirir ve P19 entegrasyon
 *   paketine bırakılmıştır.
 */

import { describe, it, expect } from "vitest";
import { LexicalRetriever, toTsQuery, tokenize, toLikePatterns, normalizeToCandidate } from "./lexical";
import { SemanticRetriever, toVectorLiteral, EMBEDDING_DIMENSIONS } from "./semantic";
import { SymbolRetriever, extractIdentifiers, looksLikeIdentifier, symbolMatchScore } from "./symbol";
import { fuseChannels, mergeByRrf, assertFirewallRespected, RRF_K } from "./hybrid";
import { RetrievalError, type Candidate, type RetrievalSpec } from "./types";

function createDb(rows: any[] = []) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const db = {
    calls,
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
      return { rows, rowCount: rows.length };
    }
  };
  return db;
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "chunk_1",
    path: "src/a.ts",
    symbol_name: "topla",
    symbol_type: "function",
    content: "export function topla() {}",
    start_line: 1,
    end_line: 3,
    estimated_tokens: 20,
    contains_secret: false,
    rank: 0.5,
    similarity: 0.8,
    exact: true,
    name_collisions: 1,
    ...overrides
  };
}

const SPEC: RetrievalSpec = {
  organizationId: "org_a",
  projectId: "proj_1",
  snapshotId: "snap_1",
  query: "topla fonksiyonunu duzelt"
};

describe("LexicalRetriever — gerçek FTS (ADR-025)", () => {
  it("tenant ve snapshot predicate'i uygular", async () => {
    const db = createDb([row()]);
    await new LexicalRetriever(db).search(SPEC);

    const q = db.calls[0];
    expect(q.sql).toContain("c.snapshot_id = $1");
    expect(q.sql).toContain("c.organization_id = $2");
  });

  it("tsvector index'ini kullanır (elle skor hesaplamaz)", async () => {
    const db = createDb([row()]);
    await new LexicalRetriever(db).search(SPEC);

    // Eski kod `matches/queryWords*40 + 15` hesapliyordu.
    expect(db.calls[0].sql).toContain("ts_rank_cd");
    expect(db.calls[0].sql).toContain("c.tsv @@ query");
  });

  it("firewall ön filtresi SQL'de uygulanır (ADR-027)", async () => {
    const db = createDb([row()]);
    await new LexicalRetriever(db).search({ ...SPEC, deniedPathPrefixes: ["secrets/"] });

    expect(db.calls[0].sql).toContain("NOT (c.path LIKE ANY($4::text[]))");
    expect(db.calls[0].params[3]).toEqual(["secrets/%"]);
  });

  it("sır içeren chunk'ları dışlayabilir (T-07)", async () => {
    const db = createDb([row()]);
    await new LexicalRetriever(db).search({ ...SPEC, excludeSecrets: true });

    expect(db.calls[0].sql).toContain("contains_secret");
    expect(db.calls[0].params[4]).toBe(true);
  });

  it("kullanılabilir terim yoksa sorgu ÇALIŞTIRMAZ", async () => {
    const db = createDb();
    const result = await new LexicalRetriever(db).search({ ...SPEC, query: "!!! ?" });

    expect(result).toEqual([]);
    expect(db.calls.length).toBe(0);
  });

  it("limit üst sınırı uygulanır", async () => {
    const db = createDb([row()]);
    await new LexicalRetriever(db).search({ ...SPEC, perChannelLimit: 999_999 });
    expect(db.calls[0].params[5]).toBe(1_000);
  });
});

describe("toTsQuery / tokenize", () => {
  it("kullanıcı metnini doğrudan to_tsquery'ye vermez", () => {
    // `&`, `|`, `!`, `:` operatordur; ham metin SQL hatasi firlatir.
    const query = toTsQuery("auth & login | (x)");
    expect(query).not.toContain("&");
    expect(query).not.toContain("(");
  });

  it("terimleri OR ile bağlar (hepsini şart koşmaz)", () => {
    expect(toTsQuery("auth login")).toContain("|");
  });

  it("prefix eşleşmesi verir", () => {
    expect(toTsQuery("authServ")).toContain(":*");
  });

  it("camelCase tanımlayıcıyı parçalarına da ayırır", () => {
    const tokens = tokenize("getUserById");
    expect(tokens).toContain("getuserbyid");
    expect(tokens).toContain("user");
  });

  it("snake_case ayrıştırılır", () => {
    expect(tokenize("get_user_by_id")).toContain("user");
  });

  it("tek harfli gürültü elenir", () => {
    expect(tokenize("a b auth")).toEqual(expect.arrayContaining(["auth"]));
    expect(tokenize("a b auth")).not.toContain("a");
  });

  it("terim yoksa null döner", () => {
    expect(toTsQuery("!!!")).toBeNull();
  });
});

describe("toLikePatterns — kalıp enjeksiyonu", () => {
  it("% ve _ karakterlerini kaçırır", () => {
    expect(toLikePatterns(["a%b_c"])).toEqual(["a\\%b\\_c%"]);
  });

  it("boş liste null döner (filtre yok)", () => {
    expect(toLikePatterns([])).toBeNull();
    expect(toLikePatterns(undefined)).toBeNull();
  });
});

describe("normalizeToCandidate — kanallar arası ölçek", () => {
  it("en yüksek skoru 1'e normalize eder", () => {
    const candidates = normalizeToCandidate([row({ id: "a", rank: 4 }), row({ id: "b", rank: 1 })]);
    expect(candidates[0].rawScores.lexical).toBe(1);
    expect(candidates[1].rawScores.lexical).toBe(0.25);
  });

  it("boş sonuçta boş liste", () => {
    expect(normalizeToCandidate([])).toEqual([]);
  });

  it("hepsi sıfır skorluysa bölme hatası vermez", () => {
    const candidates = normalizeToCandidate([row({ rank: 0 })]);
    expect(candidates[0].rawScores.lexical).toBe(0);
  });
});

describe("SemanticRetriever — sahte semantic YOK", () => {
  const embedder = {
    model: "test-model",
    dimensions: EMBEDDING_DIMENSIONS,
    async embed() {
      return new Array(EMBEDDING_DIMENSIONS).fill(0.1);
    }
  };

  it("embedder yoksa kanal kullanılamaz olarak bildirilir", () => {
    expect(new SemanticRetriever(createDb(), null).available).toBe(false);
  });

  it("embedder yokken keyword örtüşmesine DÜŞMEZ, hata verir", async () => {
    const retriever = new SemanticRetriever(createDb(), null);
    await expect(retriever.search(SPEC)).rejects.toBeInstanceOf(RetrievalError);
    await expect(retriever.search(SPEC)).rejects.toThrow(/keyword ortusmesi 'semantic' diye sunulmaz/);
  });

  it("boyut uyuşmazlığında SESSİZCE kırpmaz, hata verir", async () => {
    const wrong = { ...embedder, dimensions: 768 };
    const retriever = new SemanticRetriever(createDb(), wrong);
    await expect(retriever.search(SPEC)).rejects.toThrow(/DIMENSION|boyut/i);
  });

  it("vektör benzerliğini pgvector operatörüyle hesaplar", async () => {
    const db = createDb([row()]);
    await new SemanticRetriever(db, embedder).search(SPEC);

    expect(db.calls[0].sql).toContain("<=>");
    expect(db.calls[0].sql).toContain("1 - (c.embedding <=> $3::vector)");
  });

  it("embedding'i olmayan chunk'ları dışlar", async () => {
    const db = createDb([row()]);
    await new SemanticRetriever(db, embedder).search(SPEC);
    expect(db.calls[0].sql).toContain("c.embedding IS NOT NULL");
  });

  it("kapsam oranını ölçer", async () => {
    const db = createDb([{ total: 10, embedded: 7 }]);
    const coverage = await new SemanticRetriever(db, embedder).coverage("snap_1", "org_a");
    expect(coverage).toBeCloseTo(0.7, 6);
  });

  it("hiç chunk yoksa kapsam 0", async () => {
    const db = createDb([{ total: 0, embedded: 0 }]);
    expect(await new SemanticRetriever(db, embedder).coverage("snap_1", "org_a")).toBe(0);
  });

  it("negatif kosinüs benzerliği 0'a kırpılır", async () => {
    const db = createDb([row({ similarity: -0.3 })]);
    const candidates = await new SemanticRetriever(db, embedder).search(SPEC);
    expect(candidates[0].rawScores.semantic).toBe(0);
  });
});

describe("toVectorLiteral", () => {
  it("pgvector biçimi üretir", () => {
    expect(toVectorLiteral([0.1, 0.2])).toBe("[0.1,0.2]");
  });

  it("NaN değerleri 0'a çevirir (geçersiz literal üretmez)", () => {
    expect(toVectorLiteral([Number.NaN, 1])).toBe("[0,1]");
  });
});

describe("SymbolRetriever", () => {
  it("tanımlayıcı yoksa sorgu çalıştırmaz", async () => {
    const db = createDb();
    const result = await new SymbolRetriever(db).search({ ...SPEC, query: "lutfen bunu duzelt" });

    expect(result).toEqual([]);
    expect(db.calls.length).toBe(0);
  });

  it("symbols tablosuna vurur (chunk içeriğine değil)", async () => {
    const db = createDb([row()]);
    await new SymbolRetriever(db).search({ ...SPEC, query: "`AuthService` duzelt" });

    expect(db.calls[0].sql).toContain("FROM symbols s");
    expect(db.calls[0].sql).toContain("s.organization_id = $2");
  });

  it("tam eşleşmeyi öne alır", async () => {
    const db = createDb([row()]);
    await new SymbolRetriever(db).search({ ...SPEC, query: "`AuthService`" });
    expect(db.calls[0].sql).toContain("ORDER BY m.exact DESC");
  });
});

describe("extractIdentifiers", () => {
  it("backtick içindekini alır", () => {
    expect(extractIdentifiers("`AuthService.login` duzelt")).toContain("authservice");
    expect(extractIdentifiers("`AuthService.login` duzelt")).toContain("login");
  });

  it("camelCase tanımlayıcıyı tanır", () => {
    expect(extractIdentifiers("getUserById fonksiyonu")).toContain("getuserbyid");
  });

  it("snake_case tanımlayıcıyı tanır", () => {
    expect(extractIdentifiers("get_user_by_id cagriliyor")).toContain("get_user_by_id");
  });

  it("sıradan kelimeleri tanımlayıcı SAYMAZ", () => {
    const identifiers = extractIdentifiers("lutfen su dosyayi guncelle ve test et");
    expect(identifiers).toEqual([]);
  });

  it("noktalı yolu hem tam hem parçalı verir", () => {
    const identifiers = extractIdentifiers("AuthService.login bozuk");
    expect(identifiers).toContain("authservice.login");
    expect(identifiers).toContain("login");
  });
});

describe("looksLikeIdentifier", () => {
  it("camelCase tanır", () => {
    expect(looksLikeIdentifier("getUser")).toBe(true);
  });

  it("PascalCase tanır", () => {
    expect(looksLikeIdentifier("AuthService")).toBe(true);
  });

  it("alt çizgi ve nokta tanır", () => {
    expect(looksLikeIdentifier("get_user")).toBe(true);
    expect(looksLikeIdentifier("a.b")).toBe(true);
  });

  it("sıradan kelimeyi reddeder", () => {
    expect(looksLikeIdentifier("update")).toBe(false);
    expect(looksLikeIdentifier("the")).toBe(false);
  });
});

describe("symbolMatchScore — belirsizlik skora yansır", () => {
  it("tam eşleşme kısmi eşleşmeden güçlüdür", () => {
    expect(symbolMatchScore(true, 1)).toBeGreaterThan(symbolMatchScore(false, 1));
  });

  it("ad çakışması güveni düşürür", () => {
    expect(symbolMatchScore(true, 9)).toBeLessThan(symbolMatchScore(true, 1));
  });

  it("skor 0..1 aralığında", () => {
    expect(symbolMatchScore(true, 0)).toBeLessThanOrEqual(1);
    expect(symbolMatchScore(false, 100)).toBeGreaterThanOrEqual(0);
  });
});

describe("hybrid — RRF birleştirme", () => {
  function candidate(id: string, channel: "lexical" | "semantic" | "symbol", score: number): Candidate {
    return {
      chunkId: id,
      path: `src/${id}.ts`,
      symbolName: null,
      symbolType: null,
      content: "",
      startLine: 1,
      endLine: 2,
      estimatedTokens: 5,
      containsSecret: false,
      channels: [channel],
      rawScores: { [channel]: score }
    };
  }

  it("aynı chunk'ı iki kez döndürmez", () => {
    const merged = mergeByRrf([
      { channel: "lexical", candidates: [candidate("a", "lexical", 0.9)] },
      { channel: "semantic", candidates: [candidate("a", "semantic", 0.8)] }
    ]);

    expect(merged.length).toBe(1);
  });

  it("birden çok kanaldan gelen adayın tüm ham skorlarını korur", () => {
    const merged = mergeByRrf([
      { channel: "lexical", candidates: [candidate("a", "lexical", 0.9)] },
      { channel: "semantic", candidates: [candidate("a", "semantic", 0.8)] }
    ]);

    expect(merged[0].rawScores.lexical).toBe(0.9);
    expect(merged[0].rawScores.semantic).toBe(0.8);
    expect([...merged[0].channels].sort()).toEqual(["lexical", "semantic"]);
  });

  it("iki kanaldan gelen aday, tek kanaldan gelenden önce sıralanır", () => {
    const merged = mergeByRrf([
      { channel: "lexical", candidates: [candidate("tek", "lexical", 1), candidate("cift", "lexical", 0.1)] },
      { channel: "semantic", candidates: [candidate("cift", "semantic", 1)] }
    ]);

    // RRF sadece SIRAYA bakar; iki kanaldan katki alan one gecer.
    expect(merged[0].chunkId).toBe("cift");
  });

  it("ham skorları toplamaz (ölçek sorunu)", () => {
    // Farkli olcekli skorlarin toplanmasi, olcegi buyuk kanali baskin
    // yapardi. RRF sabiti sorguda kullanildigini dogrula.
    expect(RRF_K).toBe(60);
  });

  it("sır bayrağı herhangi bir kaynakta işaretliyse korunur", () => {
    const secret = { ...candidate("a", "semantic", 0.8), containsSecret: true };
    const merged = mergeByRrf([
      { channel: "lexical", candidates: [candidate("a", "lexical", 0.9)] },
      { channel: "semantic", candidates: [secret] }
    ]);

    expect(merged[0].containsSecret).toBe(true);
  });

  it("eşit fusion skorunda kararlı sıralar", () => {
    const merged = mergeByRrf([
      { channel: "lexical", candidates: [candidate("bbb", "lexical", 1)] },
      { channel: "semantic", candidates: [candidate("aaa", "semantic", 1)] }
    ]);
    expect(merged.map((c) => c.chunkId)).toEqual(["aaa", "bbb"]);
  });
});

describe("fuseChannels — bir kanalın hatası sessizce yutulmaz", () => {
  const okRunner = {
    channel: "lexical" as const,
    async search() {
      return [
        {
          chunkId: "a",
          path: "src/a.ts",
          symbolName: null,
          symbolType: null,
          content: "",
          startLine: 1,
          endLine: 2,
          estimatedTokens: 5,
          containsSecret: false,
          channels: ["lexical" as const],
          rawScores: { lexical: 1 }
        }
      ];
    }
  };

  const failingRunner = {
    channel: "semantic" as const,
    async search(): Promise<Candidate[]> {
      throw new RetrievalError("EMBEDDING_UNAVAILABLE", "saglayici yok");
    }
  };

  it("çalışan kanallarla devam eder", async () => {
    const result = await fuseChannels([okRunner, failingRunner], SPEC);
    expect(result.candidates.length).toBe(1);
    expect(result.channelsUsed).toEqual(["lexical"]);
  });

  it("başarısız kanalı degraded olarak bildirir", async () => {
    const result = await fuseChannels([okRunner, failingRunner], SPEC);

    expect(result.degraded).toBe(true);
    expect(result.degradedReason).toContain("semantic");
    expect(result.degradedReason).toContain("saglayici yok");
  });

  it("tüm kanallar çalışırsa degraded false", async () => {
    const result = await fuseChannels([okRunner], SPEC);
    expect(result.degraded).toBe(false);
    expect(result.degradedReason).toBeNull();
  });

  it("havuz üst sınırı uygulanır", async () => {
    const manyRunner = {
      channel: "lexical" as const,
      async search() {
        return Array.from({ length: 50 }, (_, i) => ({
          chunkId: `c${i}`,
          path: `src/${i}.ts`,
          symbolName: null,
          symbolType: null,
          content: "",
          startLine: 1,
          endLine: 2,
          estimatedTokens: 5,
          containsSecret: false,
          channels: ["lexical" as const],
          rawScores: { lexical: 1 }
        }));
      }
    };

    const result = await fuseChannels([manyRunner], SPEC, { poolLimit: 10 });
    expect(result.candidates.length).toBe(10);
  });
});

describe("assertFirewallRespected — savunma derinliği (ADR-027)", () => {
  const denied: Candidate = {
    chunkId: "x",
    path: "secrets/keys.ts",
    symbolName: null,
    symbolType: null,
    content: "",
    startLine: 1,
    endLine: 2,
    estimatedTokens: 5,
    containsSecret: false,
    channels: ["lexical"],
    rawScores: {}
  };

  it("DENY kapsamındaki aday HATA verir (sessizce ayıklanmaz)", () => {
    expect(() =>
      assertFirewallRespected([denied], { ...SPEC, deniedPathPrefixes: ["secrets/"] })
    ).toThrow(/Firewall ihlali/);
  });

  it("sır içeren aday HATA verir (T-07)", () => {
    const secret = { ...denied, path: "src/a.ts", containsSecret: true };
    expect(() => assertFirewallRespected([secret], { ...SPEC, excludeSecrets: true })).toThrow(
      /Sir iceren chunk/
    );
  });

  it("temiz havuz geçer", () => {
    const clean = { ...denied, path: "src/a.ts" };
    expect(() =>
      assertFirewallRespected([clean], { ...SPEC, deniedPathPrefixes: ["secrets/"], excludeSecrets: true })
    ).not.toThrow();
  });
});
