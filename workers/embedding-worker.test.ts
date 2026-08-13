/**
 * P06 / Y-P06-002, Y-P06-003 — Embedding worker ve sağlayıcı testleri.
 *
 * Kabul kriteri: aynı chunk iki kez embed EDİLMEZ (idempotency).
 */

import { describe, it, expect } from "vitest";
import { EmbeddingWorker, type WorkerDb } from "./embedding-worker";
import {
  EmbeddingError,
  EmbeddingProviderRegistry,
  UnconfiguredEmbeddingProvider,
  assertNoSecrets,
  chunkBatch,
  retryDelayMs,
  type EmbeddingInput,
  type EmbeddingProvider,
  type EmbeddingVector
} from "../packages/providers/src/embedding/provider";

const MODEL = "test-embed";
const DIMENSIONS = 1536;

function fakeProvider(options: { failTimes?: number; code?: "RATE_LIMITED" | "PROVIDER_ERROR" | "NOT_CONFIGURED"; shuffle?: boolean; maxBatchSize?: number } = {}): EmbeddingProvider & { calls: number } {
  let remaining = options.failTimes ?? 0;
  const provider = {
    calls: 0,
    id: "fake",
    getCapabilities() {
      return {
        providerId: "fake",
        displayName: "Sahte",
        privacyBoundary: "local_only" as const,
        sendsContentOffDevice: false,
        models: [
          {
            id: MODEL,
            displayName: "Test",
            dimensions: DIMENSIONS,
            maxInputTokens: 8000,
            maxBatchSize: options.maxBatchSize ?? 100
          }
        ]
      };
    },
    async health() {
      return {
        providerId: "fake",
        configured: true,
        status: "ready" as const,
        checkedAt: new Date().toISOString(),
        message: "hazir"
      };
    },
    async embed(inputs: readonly EmbeddingInput[]): Promise<EmbeddingVector[]> {
      provider.calls++;
      if (remaining > 0) {
        remaining--;
        throw new EmbeddingError(options.code ?? "RATE_LIMITED", "gecici hata");
      }
      const vectors = inputs.map((input) => ({
        id: input.id,
        vector: new Array(DIMENSIONS).fill(0.1),
        model: MODEL,
        dimensions: DIMENSIONS,
        truncated: false
      }));
      // Bazi saglayicilar siralamayi korumaz; bunu taklit et.
      return options.shuffle ? [...vectors].reverse() : vectors;
    }
  };
  return provider;
}

interface Row {
  id: string;
  content: string;
  content_hash: string;
  contains_secret: boolean;
}

function createDb(rows: Row[] = []) {
  const calls: { sql: string; params: unknown[] }[] = [];
  let pending = [...rows];

  const db: WorkerDb & { calls: typeof calls; updates: unknown[][] } = {
    calls,
    updates: [],
    async query(sql: string, params: unknown[] = []) {
      const flat = sql.replace(/\s+/g, " ").trim();
      calls.push({ sql: flat, params });

      if (/^SELECT c.id, c.content/i.test(flat)) {
        const limit = Number(params[3] ?? 100);
        const batch = pending.slice(0, limit);
        // Yazilanlar bir sonraki turda bekleyen sayilmaz.
        pending = pending.slice(limit);
        return { rows: batch, rowCount: batch.length };
      }
      if (/^UPDATE chunks/i.test(flat)) {
        db.updates.push(params);
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  };
  return db;
}

function row(id: string, overrides: Partial<Row> = {}): Row {
  return { id, content: `icerik ${id}`, content_hash: `hash_${id}`, contains_secret: false, ...overrides };
}

const noSleep = async () => {};

describe("EmbeddingWorker — gerçekten yazar", () => {
  it("bekleyen chunk'lar için embedding üretir ve yazar", async () => {
    const db = createDb([row("c1"), row("c2")]);
    const result = await new EmbeddingWorker({
      db,
      provider: fakeProvider(),
      model: MODEL,
      sleep: noSleep
    }).runOnce("snap_1", "org_a");

    expect(result.written).toBe(2);
    expect(db.updates.length).toBe(2);
  });

  it("vektörü pgvector literal biçiminde yazar", async () => {
    const db = createDb([row("c1")]);
    await new EmbeddingWorker({ db, provider: fakeProvider(), model: MODEL, sleep: noSleep }).runOnce(
      "snap_1",
      "org_a"
    );

    expect(String(db.updates[0][1])).toMatch(/^\[0\.1(,0\.1)*\]$/);
    expect(db.updates[0][2]).toBe(MODEL);
    expect(db.updates[0][3]).toBe(DIMENSIONS);
  });

  it("hangi İÇERİKTEN üretildiğini kaydeder (bayatlık tespiti)", async () => {
    const db = createDb([row("c1")]);
    await new EmbeddingWorker({ db, provider: fakeProvider(), model: MODEL, sleep: noSleep }).runOnce(
      "snap_1",
      "org_a"
    );

    expect(db.updates[0][4]).toBe("hash_c1");
  });

  it("bekleyen yoksa hiçbir şey yazmaz", async () => {
    const db = createDb([]);
    const result = await new EmbeddingWorker({
      db,
      provider: fakeProvider(),
      model: MODEL,
      sleep: noSleep
    }).runOnce("snap_1", "org_a");

    expect(result.exhausted).toBe(true);
    expect(db.updates.length).toBe(0);
  });
});

describe("EmbeddingWorker — idempotency", () => {
  it("bekleyen sorgusu içerik hash'i VE modeli karşılaştırır", async () => {
    const db = createDb([row("c1")]);
    await new EmbeddingWorker({ db, provider: fakeProvider(), model: MODEL, sleep: noSleep }).runOnce(
      "snap_1",
      "org_a"
    );

    const select = db.calls.find((c) => /^SELECT c.id, c.content/i.test(c.sql));
    expect(select?.sql).toContain("c.embedding IS NULL");
    expect(select?.sql).toContain("c.embedded_content_hash IS DISTINCT FROM c.content_hash");
    expect(select?.sql).toContain("c.embedding_model IS DISTINCT FROM $3");
  });

  it("model parametresi sorguya geçer", async () => {
    const db = createDb([row("c1")]);
    await new EmbeddingWorker({ db, provider: fakeProvider(), model: MODEL, sleep: noSleep }).runOnce(
      "snap_1",
      "org_a"
    );

    const select = db.calls.find((c) => /^SELECT c.id, c.content/i.test(c.sql));
    expect(select?.params[2]).toBe(MODEL);
  });
});

describe("EmbeddingWorker — sır koruması (T-07)", () => {
  it("sorgu sır içeren chunk'ları dışlar", async () => {
    const db = createDb([row("c1")]);
    await new EmbeddingWorker({ db, provider: fakeProvider(), model: MODEL, sleep: noSleep }).runOnce(
      "snap_1",
      "org_a"
    );

    const select = db.calls.find((c) => /^SELECT c.id, c.content/i.test(c.sql));
    expect(select?.sql).toContain("COALESCE(f.contains_secret, FALSE) = FALSE");
  });

  it("filtre atlansa bile sır sağlayıcıya gönderilmez", async () => {
    // Savunma derinligi: sorgu degisip sir gelse bile disari cikmaz.
    const db = createDb([row("c1", { contains_secret: true })]);
    const provider = fakeProvider();
    const result = await new EmbeddingWorker({ db, provider, model: MODEL, sleep: noSleep }).runOnce(
      "snap_1",
      "org_a"
    );

    expect(result.skippedSecrets).toBe(1);
    expect(result.written).toBe(0);
    expect(provider.calls).toBe(0);
  });
});

describe("EmbeddingWorker — sağlayıcı sırası", () => {
  it("sonuçları id ile eşleştirir (sıraya güvenmez)", async () => {
    const db = createDb([row("c1"), row("c2")]);
    await new EmbeddingWorker({
      db,
      provider: fakeProvider({ shuffle: true }),
      model: MODEL,
      sleep: noSleep
    }).runOnce("snap_1", "org_a");

    const writtenIds = db.updates.map((u) => u[0]);
    // Saglayici ters cevirdi ama yazim dogru chunk'a gitti.
    expect(writtenIds).toEqual(["c1", "c2"]);
  });

  it("sağlayıcı bir id için vektör döndürmezse hata KAYDEDİLİR", async () => {
    const partial: EmbeddingProvider = {
      ...fakeProvider(),
      async embed(inputs) {
        return inputs.slice(0, 1).map((i) => ({
          id: i.id,
          vector: new Array(DIMENSIONS).fill(0.2),
          model: MODEL,
          dimensions: DIMENSIONS,
          truncated: false
        }));
      }
    };

    const db = createDb([row("c1"), row("c2")]);
    const result = await new EmbeddingWorker({ db, provider: partial, model: MODEL, sleep: noSleep }).runOnce(
      "snap_1",
      "org_a"
    );

    expect(result.written).toBe(1);
    expect(result.failures.length).toBe(1);
    expect(result.failures[0].chunkId).toBe("c2");
  });
});

describe("EmbeddingWorker — retry", () => {
  it("geçici hatada yeniden dener", async () => {
    const provider = fakeProvider({ failTimes: 2, code: "RATE_LIMITED" });
    const db = createDb([row("c1")]);

    const result = await new EmbeddingWorker({
      db,
      provider,
      model: MODEL,
      maxAttempts: 3,
      sleep: noSleep
    }).runOnce("snap_1", "org_a");

    expect(provider.calls).toBe(3);
    expect(result.written).toBe(1);
  });

  it("yapılandırma hatasını yeniden DENEMEZ", async () => {
    const provider = fakeProvider({ failTimes: 5, code: "NOT_CONFIGURED" });
    const db = createDb([row("c1")]);

    const result = await new EmbeddingWorker({
      db,
      provider,
      model: MODEL,
      maxAttempts: 3,
      sleep: noSleep
    }).runOnce("snap_1", "org_a");

    // Ayni hatayi uc kez uretmenin anlami yok.
    expect(provider.calls).toBe(1);
    expect(result.failures.length).toBe(1);
  });

  it("deneme hakkı bitince hata failures'a yazılır", async () => {
    const provider = fakeProvider({ failTimes: 10, code: "PROVIDER_ERROR" });
    const db = createDb([row("c1")]);

    const result = await new EmbeddingWorker({
      db,
      provider,
      model: MODEL,
      maxAttempts: 2,
      sleep: noSleep
    }).runOnce("snap_1", "org_a");

    expect(result.written).toBe(0);
    expect(result.failures[0].reason).toContain("gecici hata");
  });

  it("bilinmeyen model erken hata verir", async () => {
    const db = createDb([row("c1")]);
    await expect(
      new EmbeddingWorker({ db, provider: fakeProvider(), model: "yok", sleep: noSleep }).runOnce(
        "snap_1",
        "org_a"
      )
    ).rejects.toThrow(/tanimli degil/);
  });
});

describe("EmbeddingWorker — batch", () => {
  it("sağlayıcının batch sınırına uyar", async () => {
    const provider = fakeProvider({ maxBatchSize: 2 });
    const db = createDb([row("c1"), row("c2"), row("c3"), row("c4"), row("c5")]);

    await new EmbeddingWorker({ db, provider, model: MODEL, sleep: noSleep }).runOnce("snap_1", "org_a");

    // 5 chunk / 2 = 3 cagri.
    expect(provider.calls).toBe(3);
  });

  it("runUntilDone hiçbir şey yazılamazsa sonsuz döngüye girmez", async () => {
    const provider = fakeProvider({ failTimes: 999, code: "PROVIDER_ERROR" });
    const db = createDb(Array.from({ length: 200 }, (_, i) => row(`c${i}`)));

    const result = await new EmbeddingWorker({
      db,
      provider,
      model: MODEL,
      batchSize: 10,
      maxAttempts: 1,
      sleep: noSleep
    }).runUntilDone("snap_1", "org_a");

    expect(result.written).toBe(0);
    expect(result.exhausted).toBe(true);
  });
});

describe("EmbeddingProvider — yardımcılar", () => {
  it("sır içeren girdi SESSİZCE atlanmaz, hata verir", () => {
    expect(() =>
      assertNoSecrets([{ id: "a", text: "x", containsSecret: true }])
    ).toThrow(/sir iceriyor/i);
  });

  it("temiz girdi geçer", () => {
    expect(() => assertNoSecrets([{ id: "a", text: "x" }])).not.toThrow();
  });

  it("chunkBatch sınıra göre böler", () => {
    expect(chunkBatch([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("chunkBatch geçersiz sınırda hata verir", () => {
    expect(() => chunkBatch([1], 0)).toThrow(EmbeddingError);
  });

  it("retryDelayMs üstel büyür", () => {
    const first = retryDelayMs(1, 500, 30_000);
    const third = retryDelayMs(3, 500, 30_000);
    expect(third).toBeGreaterThan(first);
  });

  it("retryDelayMs üst sınırı aşmaz", () => {
    expect(retryDelayMs(50, 500, 10_000)).toBeLessThanOrEqual(10_000);
  });
});

describe("UnconfiguredEmbeddingProvider — sahte vektör ÜRETMEZ", () => {
  it("embed çağrısı hata verir", async () => {
    await expect(new UnconfiguredEmbeddingProvider().embed()).rejects.toThrow(
      /Sahte vektor URETILMEZ/
    );
  });

  it("sağlık durumu not_configured", async () => {
    const health = await new UnconfiguredEmbeddingProvider().health();
    expect(health.status).toBe("not_configured");
    expect(health.configured).toBe(false);
  });

  it("model listesi boş (uydurma model bildirmez)", () => {
    expect(new UnconfiguredEmbeddingProvider().getCapabilities().models).toEqual([]);
  });
});

describe("EmbeddingProviderRegistry", () => {
  it("sağlayıcı kaydeder ve çözer", () => {
    const registry = new EmbeddingProviderRegistry().register(new UnconfiguredEmbeddingProvider());
    expect(registry.resolve("unconfigured")).not.toBeNull();
  });

  it("bilinmeyen sağlayıcıda null döner", () => {
    expect(new EmbeddingProviderRegistry().resolve("yok")).toBeNull();
  });

  it("gizlilik sınırını yeteneklerde bildirir", () => {
    const registry = new EmbeddingProviderRegistry().register(new UnconfiguredEmbeddingProvider());
    expect(registry.list()[0].privacyBoundary).toBe("local_only");
    expect(registry.list()[0].sendsContentOffDevice).toBe(false);
  });
});
