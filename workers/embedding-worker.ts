/**
 * P06 / Y-P06-003 — Embedding worker.
 *
 * P00 Truth Audit: `context_chunks.embedding_id` kolonu vardı ama HER
 * ZAMAN NULL yazılıyordu. Repo'da embedding üreten hiçbir kod yoktu.
 *
 * IDEMPOTENCY — `content_hash` + `embedding_model`
 *   Aynı chunk iki kez embed EDİLMEZ. Anahtar chunk kimliği değil,
 *   İÇERİK HASH'İ ve MODELDİR:
 *     - İçerik değişmediyse yeniden üretmek para ve zaman kaybıdır.
 *     - Model değiştiyse eski vektör KULLANILAMAZ; farklı modellerin
 *       vektörleri aynı uzayda değildir ve aralarındaki kosinüs benzerliği
 *       anlamsızdır.
 *   `embedded_content_hash` kolonu (0063) bu karşılaştırmayı mümkün kılar.
 *
 * SIR İÇEREN CHUNK GÖNDERİLMEZ (T-07)
 *   Sorgu `files.contains_secret` üzerinden filtreler. Bir sırrı embedding
 *   için dış sağlayıcıya göndermek, onu kalıcı olarak sızdırmaktır ve
 *   sonuçtan geri alınamaz.
 */

import { pathToFileURL } from "node:url";
import {
  assertNoSecrets,
  chunkBatch,
  EmbeddingError,
  retryDelayMs,
  type EmbeddingProvider,
  type EmbeddingInput
} from "../packages/providers/src/embedding/provider";
import { globToRegExpSource } from "../packages/security/src/context-firewall/glob";

export interface WorkerDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export interface EmbeddingWorkerOptions {
  readonly db: WorkerDb;
  readonly provider: EmbeddingProvider;
  readonly model: string;
  /** Tek turda işlenecek azami chunk. */
  readonly batchSize?: number;
  readonly maxAttempts?: number;
  /**
   * P07 / Y-P07-005 — DENY kapsamındaki yol glob'ları.
   *
   * ZORUNLU ALAN, opsiyonel değil. Bu liste olmadan worker çalışırsa,
   * DENY kapsamındaki bir chunk'ın içeriği harici embedding
   * sağlayıcısına gönderilir ve bu GERİ ALINAMAZ. Boş liste vermek
   * meşru bir karardır (hiçbir şey yasak değil) ama BİLİNÇLİ olmalıdır;
   * alanı unutmak bir karar değildir.
   */
  readonly deniedGlobs: readonly string[];
  /** Test edilebilirlik: gerçek beklemeyi devre dışı bırakır. */
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface EmbeddingRunResult {
  readonly processed: number;
  readonly written: number;
  readonly skippedSecrets: number;
  readonly failures: readonly { chunkId: string; reason: string }[];
  readonly exhausted: boolean;
}

const DEFAULT_BATCH_SIZE = 64;
const DEFAULT_MAX_ATTEMPTS = 3;

export class EmbeddingWorker {
  private stopped = false;

  constructor(private readonly options: EmbeddingWorkerOptions) {}

  stop(): void {
    this.stopped = true;
  }

  /**
   * Bir tur çalıştırır: bekleyen chunk'ları alır, embed eder, yazar.
   *
   * `exhausted: true` bekleyen chunk kalmadığı anlamına gelir.
   */
  async runOnce(snapshotId: string, organizationId: string): Promise<EmbeddingRunResult> {
    const batchSize = this.options.batchSize ?? DEFAULT_BATCH_SIZE;
    const pending = await this.loadPending(snapshotId, organizationId, batchSize);

    if (pending.length === 0) {
      return { processed: 0, written: 0, skippedSecrets: 0, failures: [], exhausted: true };
    }

    // Sir iceren chunk'lar SORGUDA filtreleniyor; buradaki kontrol
    // savunma derinligidir. Bir sorgu degisikligi filtreyi dusurse bile
    // sir disariya cikmaz.
    const secrets = pending.filter((c) => c.containsSecret);
    const safe = pending.filter((c) => !c.containsSecret);

    const capabilities = this.options.provider.getCapabilities();
    const descriptor = capabilities.models.find((m) => m.id === this.options.model);
    if (!descriptor) {
      throw new EmbeddingError(
        "UNKNOWN_MODEL",
        `Model ${this.options.model} saglayicida tanimli degil: ${capabilities.providerId}`
      );
    }

    const failures: { chunkId: string; reason: string }[] = [];
    let written = 0;

    for (const batch of chunkBatch(safe, descriptor.maxBatchSize)) {
      if (this.stopped) break;

      const inputs: EmbeddingInput[] = batch.map((c) => ({
        id: c.chunkId,
        text: c.content,
        containsSecret: c.containsSecret
      }));

      try {
        assertNoSecrets(inputs);
        const vectors = await this.embedWithRetry(inputs);

        // Sonuclar `id` ile eslestirilir; saglayicinin sirayi korumasina
        // GUVENILMEZ. Sira varsayimi, batch'i yeniden siralayan bir
        // saglayicida sessizce yanlis eslestirme uretirdi.
        const byId = new Map(vectors.map((v) => [v.id, v]));

        for (const chunk of batch) {
          const vector = byId.get(chunk.chunkId);
          if (!vector) {
            failures.push({ chunkId: chunk.chunkId, reason: "saglayici bu id icin vektor dondurmedi" });
            continue;
          }
          await this.writeEmbedding(chunk, vector.vector, vector.model, vector.dimensions);
          written++;
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        for (const chunk of batch) failures.push({ chunkId: chunk.chunkId, reason });
      }
    }

    return {
      processed: pending.length,
      written,
      skippedSecrets: secrets.length,
      failures,
      exhausted: pending.length < batchSize
    };
  }

  /** Bekleyen chunk kalmayana kadar çalışır. */
  async runUntilDone(snapshotId: string, organizationId: string): Promise<EmbeddingRunResult> {
    let processed = 0;
    let written = 0;
    let skippedSecrets = 0;
    const failures: { chunkId: string; reason: string }[] = [];

    while (!this.stopped) {
      const result = await this.runOnce(snapshotId, organizationId);
      processed += result.processed;
      written += result.written;
      skippedSecrets += result.skippedSecrets;
      failures.push(...result.failures);

      if (result.exhausted) break;
      // Hicbir sey yazilamadiysa donguye devam etmek sonsuz dongu olur:
      // ayni chunk'lar tekrar tekrar denenir.
      if (result.written === 0) break;
    }

    return { processed, written, skippedSecrets, failures, exhausted: true };
  }

  private async embedWithRetry(inputs: readonly EmbeddingInput[]) {
    const maxAttempts = this.options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const sleep = this.options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.options.provider.embed(inputs, this.options.model);
      } catch (error) {
        lastError = error;
        // Yalniz gecici hatalar yeniden denenir. Yapilandirma hatasini
        // yeniden denemek, ayni hatayi maxAttempts kez uretmekten baska
        // is yapmaz.
        const retriable =
          error instanceof EmbeddingError &&
          (error.code === "RATE_LIMITED" || error.code === "PROVIDER_ERROR");
        if (!retriable || attempt === maxAttempts) break;
        await sleep(retryDelayMs(attempt));
      }
    }
    throw lastError;
  }

  /**
   * Bekleyen chunk'lar.
   *
   * "Bekleyen" iki durumdur: (a) hiç embedding'i yok, (b) embedding'i var
   * ama içerik hash'i ya da model değişmiş. İkincisini atlamak, bayat
   * vektörlerin sessizce kullanılmaya devam etmesi demekti.
   */
  private async loadPending(
    snapshotId: string,
    organizationId: string,
    limit: number
  ): Promise<{ chunkId: string; content: string; contentHash: string; containsSecret: boolean }[]> {
    // P07 / Y-P07-005: DENY kapsamindaki yollar SORGUDA elenir. Adaylari
    // bellege alip sonra filtrelemek, iceriklerini okumus olmak demektir.
    const deniedRegex = this.options.deniedGlobs.map((g) => `^${globToRegExpSource(g)}$`);

    const result = await this.options.db.query(
      `SELECT c.id, c.content, c.content_hash,
              COALESCE(f.contains_secret, FALSE) AS contains_secret
         FROM chunks c
         LEFT JOIN files f ON f.id = c.file_id
        WHERE c.snapshot_id = $1
          AND c.organization_id = $2
          -- Sir iceren chunk HIC gonderilmez (T-07).
          AND COALESCE(f.contains_secret, FALSE) = FALSE
          -- DENY kapsamindaki chunk'in embedding'i bile uretilmez (ADR-027).
          AND NOT (c.path ~ ANY($5::text[]))
          AND (
            c.embedding IS NULL
            OR c.embedded_content_hash IS DISTINCT FROM c.content_hash
            OR c.embedding_model IS DISTINCT FROM $3
          )
        ORDER BY c.id
        LIMIT $4;`,
      [snapshotId, organizationId, this.options.model, limit, deniedRegex]
    );

    return result.rows.map((row) => ({
      chunkId: row.id,
      content: row.content ?? "",
      contentHash: row.content_hash,
      containsSecret: Boolean(row.contains_secret)
    }));
  }

  private async writeEmbedding(
    chunk: { chunkId: string; contentHash: string },
    vector: readonly number[],
    model: string,
    dimensions: number
  ): Promise<void> {
    await this.options.db.query(
      `UPDATE chunks
          SET embedding = $2::vector,
              embedding_model = $3,
              embedding_dim = $4,
              embedded_content_hash = $5,
              embedded_at = NOW()
        WHERE id = $1;`,
      [
        chunk.chunkId,
        `[${vector.join(",")}]`,
        model,
        dimensions,
        // Hangi ICERIKTEN uretildigi kaydedilir; icerik degisirse
        // embedding bayat sayilir ve yeniden uretilir.
        chunk.contentHash
      ]
    );
  }
}

async function main(): Promise<void> {
  const { Pool } = await import("pg");
  const { UnconfiguredEmbeddingProvider } = await import(
    "../packages/providers/src/embedding/provider"
  );

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL gerekli.");

  const snapshotId = process.env.EMBEDDING_SNAPSHOT_ID;
  const organizationId = process.env.EMBEDDING_ORG_ID;
  if (!snapshotId || !organizationId) {
    throw new Error("EMBEDDING_SNAPSHOT_ID ve EMBEDDING_ORG_ID gerekli.");
  }

  const pool = new Pool({ connectionString });
  // Gercek saglayici P14'te baglanacak. Bugun yapilandirilmamis saglayici
  // ACIKCA hata verir; sahte vektor uretmez.
  // DENY glob'lari policy store'dan gelir. Bugun yalnizca varsayilan
  // sinif tabanli DENY'ler var; policy entegrasyonu P08 compile akisinda.
  const deniedGlobs = (process.env.EMBEDDING_DENY_GLOBS || "secrets/**,node_modules/**,vendor/**")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);

  const worker = new EmbeddingWorker({
    db: pool,
    provider: new UnconfiguredEmbeddingProvider(),
    model: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
    deniedGlobs
  });

  process.once("SIGINT", () => worker.stop());
  process.once("SIGTERM", () => worker.stop());

  try {
    console.log(JSON.stringify(await worker.runUntilDone(snapshotId, organizationId)));
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
