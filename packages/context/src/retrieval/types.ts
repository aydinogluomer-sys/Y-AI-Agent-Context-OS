/**
 * P06 — Retrieval sözleşmeleri.
 *
 * `RankedCandidate[]` bu fazın gate'inde DONAR: P08 (context compiler)
 * bunun üzerine kurulur.
 *
 * P00 Truth Audit'in bu fazdaki dört bulgusu:
 *   1. "Semantic search" keyword örtüşmesiydi (`mockSemanticSearchFallback`).
 *   2. "BM25" BM25 değildi (IDF yok, TF yok, uzunluk normalizasyonu yok).
 *   3. Skorun büyük kısmı sabitti (`base_score: 70`, `recency_score: 10`).
 *   4. `local_memory_stub` üç uydurma dosya döndürüyordu.
 */

import type { AllowedContextUniverse } from "@y/security/context-firewall/universe";

export const RETRIEVAL_CHANNELS = ["lexical", "semantic", "symbol", "graph"] as const;
export type RetrievalChannel = (typeof RETRIEVAL_CHANNELS)[number];

/**
 * 14 sinyal (master plan §8).
 *
 * `null` = HESAPLANMADI. `0` = hesaplandı ve sıfır çıktı. Bu ayrım
 * korunmalıdır: bir sinyalin hiç hesaplanmadığını sıfır olarak yazmak,
 * o kanalın çalıştığı yanılsamasını üretir.
 */
export interface RankingSignals {
  semanticSimilarity: number | null;
  lexicalSimilarity: number | null;
  symbolMatch: number | null;
  dependencyDistance: number | null;
  reverseDependency: number | null;
  testRelationship: number | null;
  documentRelationship: number | null;
  architectureRelationship: number | null;
  gitRecency: number | null;
  changeFrequency: number | null;
  authority: number | null;
  taskIntent: number | null;
  historicalRelevance: number | null;
  policyAlignment: number | null;
}

export const SIGNAL_NAMES: readonly (keyof RankingSignals)[] = [
  "semanticSimilarity",
  "lexicalSimilarity",
  "symbolMatch",
  "dependencyDistance",
  "reverseDependency",
  "testRelationship",
  "documentRelationship",
  "architectureRelationship",
  "gitRecency",
  "changeFrequency",
  "authority",
  "taskIntent",
  "historicalRelevance",
  "policyAlignment"
];

export function emptySignals(): RankingSignals {
  return {
    semanticSimilarity: null,
    lexicalSimilarity: null,
    symbolMatch: null,
    dependencyDistance: null,
    reverseDependency: null,
    testRelationship: null,
    documentRelationship: null,
    architectureRelationship: null,
    gitRecency: null,
    changeFrequency: null,
    authority: null,
    taskIntent: null,
    historicalRelevance: null,
    policyAlignment: null
  };
}

/** Bir kanalın ürettiği ham aday. */
export interface Candidate {
  readonly chunkId: string;
  readonly path: string;
  readonly symbolName: string | null;
  readonly symbolType: string | null;
  readonly content: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly estimatedTokens: number;
  readonly containsSecret: boolean;
  /** Bu adayı hangi kanallar üretti. */
  readonly channels: readonly RetrievalChannel[];
  /** Kanal başına ham skor — sinyal hesaplamasının girdisi. */
  readonly rawScores: Partial<Record<RetrievalChannel, number>>;
}

export interface RankedCandidate {
  readonly candidate: Candidate;
  readonly signals: RankingSignals;
  /** Sinyaller × ağırlıklar. TÜRETİLMİŞ değer. */
  readonly finalScore: number;
  readonly rank: number;
  readonly explanation: RankingExplanation;
}

/**
 * "Bu neden seçildi?" sorusunun yanıtı.
 *
 * `contributions` her sinyalin skora KATKISINI taşır (sinyal × ağırlık).
 * Ham sinyal değeri tek başına yeterli değildir: 0,9'luk bir sinyal
 * ağırlığı 0,01 ise sonucu belirlemiyordur ve öyle sunulmamalıdır.
 */
export interface RankingExplanation {
  readonly topReasons: readonly string[];
  readonly contributions: Readonly<Record<string, number>>;
  /** Hangi sinyaller hesaplanamadı ve neden. */
  readonly missingSignals: readonly string[];
}

export interface RetrievalSpec {
  readonly organizationId: string;
  readonly projectId: string;
  readonly snapshotId: string;
  readonly query: string;
  /** Kanal başına aday üst sınırı. */
  readonly perChannelLimit?: number;
  /** Birleştirme sonrası döndürülecek aday sayısı. */
  readonly limit?: number;
  /**
   * Context Firewall (P07 / ADR-027, ADR-028).
   *
   * ZORUNLU ALAN — opsiyonel DEĞİL. Unutulması bir çalışma zamanı
   * kontrolü değil, DERLEME HATASIDIR. Y-P07-004'ün kabul kriteri tam
   * olarak budur: universe olmadan retrieval çağrısı derlenmemeli.
   *
   * Universe bir SQL predicate'ine derlenir ve kanalların sorgularına
   * gömülür. DENY kapsamındaki chunk'lar aday havuzuna HİÇ girmez;
   * sonradan filtrelenmez — DENY içeriğinin embedding'i bile
   * hesaplanmamalıdır.
   */
  readonly universe: AllowedContextUniverse;
  /** Sır içeren chunk'lar aday olamaz (T-07). */
  readonly excludeSecrets?: boolean;
}

export interface RetrievalResult {
  readonly runId: string;
  readonly candidates: readonly RankedCandidate[];
  readonly channelsUsed: readonly RetrievalChannel[];
  /**
   * Bir kanal çalışmadıysa sonuç EKSİKTİR.
   * `false` dönüp sessizce devam etmek, eksik context'i tam gibi
   * gösterirdi.
   */
  readonly degraded: boolean;
  readonly degradedReason: string | null;
  /** Semantic kanalın kapsamı: embedding'i olan chunk oranı. */
  readonly embeddingCoverage: number | null;
  readonly candidateCount: number;
  readonly durationMs: number;
}

export class RetrievalError extends Error {
  constructor(
    readonly code:
      | "EMPTY_QUERY"
      | "NO_SNAPSHOT"
      | "EMBEDDING_UNAVAILABLE"
      | "DIMENSION_MISMATCH"
      | "INVALID_WEIGHTS",
    message: string
  ) {
    super(message);
    this.name = "RetrievalError";
  }
}
