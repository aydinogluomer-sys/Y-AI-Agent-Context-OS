/**
 * P06 / Y-P06-005 — Gerçek semantic retrieval (pgvector, ADR-008).
 *
 * ESKİ HALİ (P00 Truth Audit, `context/src/index.ts:634-666`):
 *
 *     export function mockSemanticSearchFallback(...) {
 *       let score = computeLexicalOverlap(query, textToMatch);
 *       score += (keywordHits / queryWords.length) * 0.4;
 *       return { semantic_similarity: similarity, is_fallback_approx: true, ... }
 *     }
 *
 *   Bu fonksiyon `search-server.ts:98` ve `:290`'dan çağrılıyor, sonuç
 *   30 ile çarpılıp `semantic_score` adıyla sunuluyordu. `is_fallback_approx`
 *   bayrağı vardı ama hiçbir yerde okunmuyordu — dürüstlük niyeti kodda
 *   duruyor, çıktıda kayboluyordu.
 *
 * KANAL ERİŞİLEMEZSE NE OLUR
 *   Embedding sağlayıcısı çalışmıyorsa ya da hiçbir chunk embed
 *   edilmemişse bu kanal **DEVRE DIŞI KALIR** ve retrieval `degraded`
 *   işaretlenir. Keyword örtüşmesini "semantic" diye sunmak yerine
 *   kanalın yokluğu AÇIKÇA raporlanır; lexical + symbol ile devam edilir.
 *   Sessiz sahte skor yok.
 *
 * BOYUT UYUŞMAZLIĞI
 *   `chunks.embedding` sabit boyutludur (0063: 1536). Farklı boyutlu bir
 *   model kullanılırsa sorgu vektörü kolonla uyuşmaz. Sessizce kırpmak ya
 *   da sıfırla doldurmak, anlamsız ama makul GÖRÜNEN benzerlik skorları
 *   üretirdi — hatanın en tehlikeli biçimi. Bu yüzden hata fırlatılır.
 */

import { RetrievalError, type Candidate, type RetrievalSpec } from "./types";

export interface SemanticDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export interface QueryEmbedder {
  readonly model: string;
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
}

const DEFAULT_LIMIT = 100;
export const EMBEDDING_DIMENSIONS = 1536;

export class SemanticRetriever {
  constructor(
    private readonly db: SemanticDb,
    private readonly embedder: QueryEmbedder | null
  ) {}

  /** Kanal kullanılabilir mi. `false` ise `degraded` işaretlenmeli. */
  get available(): boolean {
    return this.embedder !== null;
  }

  /**
   * Embedding kapsamı: bu snapshot'ta embedding'i olan chunk oranı.
   *
   * 1'den küçükse semantic sonuçlar EKSİKTİR. Compile (P08) bunu
   * manifest'e yazar ve uyarır; sessizce eksik döndürmez.
   */
  async coverage(snapshotId: string, organizationId: string): Promise<number> {
    const result = await this.db.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(embedding)::int AS embedded
         FROM chunks WHERE snapshot_id = $1 AND organization_id = $2;`,
      [snapshotId, organizationId]
    );
    const row = result.rows[0];
    const total = Number(row?.total ?? 0);
    if (total === 0) return 0;
    return Number(row?.embedded ?? 0) / total;
  }

  async search(spec: RetrievalSpec): Promise<Candidate[]> {
    if (!this.embedder) {
      throw new RetrievalError(
        "EMBEDDING_UNAVAILABLE",
        "Embedding saglayicisi yapilandirilmamis. Semantic kanal devre disi; " +
          "keyword ortusmesi 'semantic' diye sunulmaz."
      );
    }

    if (this.embedder.dimensions !== EMBEDDING_DIMENSIONS) {
      throw new RetrievalError(
        "DIMENSION_MISMATCH",
        `Model ${this.embedder.model} ${this.embedder.dimensions} boyut uretiyor, ` +
          `sema ${EMBEDDING_DIMENSIONS} bekliyor. Kirpmak ya da sifirla doldurmak ` +
          `anlamsiz ama makul GORUNEN skorlar uretirdi.`
      );
    }

    const vector = await this.embedder.embed(spec.query);
    if (vector.length !== EMBEDDING_DIMENSIONS) {
      throw new RetrievalError(
        "DIMENSION_MISMATCH",
        `Sorgu vektoru ${vector.length} boyutlu, ${EMBEDDING_DIMENSIONS} bekleniyordu.`
      );
    }

    const limit = Math.min(Math.max(1, spec.perChannelLimit ?? DEFAULT_LIMIT), 1_000);

    const result = await this.db.query(
      `SELECT c.id, c.path, c.symbol_name, c.symbol_type, c.content,
              c.start_line, c.end_line, c.estimated_tokens,
              COALESCE(f.contains_secret, FALSE) AS contains_secret,
              -- Kosinus MESAFESI 0..2; benzerlik = 1 - mesafe.
              1 - (c.embedding <=> $3::vector) AS similarity
         FROM chunks c
         LEFT JOIN files f ON f.id = c.file_id
        WHERE c.snapshot_id = $1
          AND c.organization_id = $2
          AND c.embedding IS NOT NULL
          AND ($4::text[] IS NULL OR NOT (c.path LIKE ANY($4::text[])))
          AND ($5::boolean IS NOT TRUE OR COALESCE(f.contains_secret, FALSE) = FALSE)
        ORDER BY c.embedding <=> $3::vector, c.id
        LIMIT $6;`,
      [
        spec.snapshotId,
        spec.organizationId,
        toVectorLiteral(vector),
        toLikePatterns(spec.deniedPathPrefixes),
        spec.excludeSecrets ?? false,
        limit
      ]
    );

    return result.rows.map((row) => ({
      chunkId: row.id,
      path: row.path,
      symbolName: row.symbol_name ?? null,
      symbolType: row.symbol_type ?? null,
      content: row.content ?? "",
      startLine: Number(row.start_line ?? 0),
      endLine: Number(row.end_line ?? 0),
      estimatedTokens: Number(row.estimated_tokens ?? 0),
      containsSecret: Boolean(row.contains_secret),
      channels: ["semantic" as const],
      // Kosinus benzerligi zaten -1..1; negatifleri 0'a kirp.
      rawScores: { semantic: Math.max(0, Math.min(1, Number(row.similarity ?? 0))) }
    }));
  }
}

/** pgvector literal biçimi: `[0.1,0.2,...]`. */
export function toVectorLiteral(vector: readonly number[]): string {
  return `[${vector.map((v) => (Number.isFinite(v) ? v : 0)).join(",")}]`;
}

function toLikePatterns(prefixes: readonly string[] | undefined): string[] | null {
  if (!prefixes || prefixes.length === 0) return null;
  return prefixes.map((p) => `${p.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
}
