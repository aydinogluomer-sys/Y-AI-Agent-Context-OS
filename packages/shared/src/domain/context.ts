/**
 * P01 / Y-P01-001 — Context firewall, compiler ve manifest sözleşmeleri.
 *
 * P00 Truth Audit bulguları:
 *   - "Semantic search" keyword örtüşmesiydi (`mockSemanticSearchFallback`).
 *   - Token bütçesi üç ayrı yerde hard-coded 50.000, dördüncü yerde çelişen 4000.
 *   - Gerçek tokenizer yoktu; iki tutarsız tahminci vardı.
 *   - Context pack'e uydurma alanlar KALICI olarak yazılıyordu:
 *     `recent_diffs` (git'e hiç bakılmadan), dependency stub'ları,
 *     statik quality gate listesi, koşulsuz `secret_scanned: true`.
 *   - Dışlanan kaynaklar sessizce kayboluyordu — sebep kaydı yoktu.
 *
 * ADR-027 (firewall ön-filtre), ADR-029 (DENY kazanır, APPROVAL retrieval'da
 * DENY gibi davranır), ADR-031 (bütçe adapter'dan), ADR-032 (uydurma alan
 * yasağı), ADR-036 (dışlama kaydı zorunlu).
 */

// ---------------------------------------------------------------------------
// Context Firewall (P07)
// ---------------------------------------------------------------------------

export type PolicyEffect = "allow" | "approval" | "deny";

export interface PolicyRule {
  readonly effect: PolicyEffect;
  /** Derlenebilir glob alt kümesi: `**`, `*`, `?`, karakter sınıfı. Geri referans yok. */
  readonly resourceGlob: string;
  readonly priority: number;
}

/**
 * Task başına hesaplanan izinli evren.
 * Retrieval bunun DIŞINA çıkamaz — SQL predicate'i olarak enjekte edilir
 * (ADR-028), sonradan filtreleme yapılmaz.
 */
export interface AllowedContextUniverse {
  readonly allow: readonly string[];
  readonly approval: readonly string[];
  readonly deny: readonly string[];
  readonly policyVersion: number;
  /** Determinism girdisi — manifest'e yazılır. */
  readonly universeHash: string;
}

/** Dosya sınıflandırması — varsayılan policy şablonlarının girdisi. */
export type FileClassKind =
  | "source"
  | "test"
  | "doc"
  | "adr"
  | "config"
  | "migration"
  | "infra"
  | "secret"
  | "generated"
  | "minified"
  | "vendor";

export interface FileClassification {
  readonly path: string;
  readonly kind: FileClassKind;
  /** Ölçülen güven; düşükse DENY değil APPROVAL'a düşürülür. */
  readonly confidence: number;
}

// ---------------------------------------------------------------------------
// Retrieval ve sıralama (P06)
// ---------------------------------------------------------------------------

/**
 * 14 sıralama sinyali (master plan §8).
 * Toplam skor bunlardan TÜRETİLİR; ayrı ayrı saklanır ki
 * "bu neden seçildi?" sorusu yanıtlanabilsin (ADR-026).
 */
export interface RankingSignals {
  readonly semanticSimilarity: number;
  readonly lexicalSimilarity: number;
  readonly symbolMatch: number;
  readonly dependencyDistance: number;
  readonly reverseDependency: number;
  readonly testRelationship: number;
  readonly documentRelationship: number;
  readonly gitRecency: number;
  readonly changeFrequency: number;
  readonly authority: number;
  readonly taskIntent: number;
  readonly projectPolicy: number;
  readonly userPermission: number;
  readonly historicalRelevance: number;
}

export interface RankedCandidate {
  readonly chunkId: string;
  readonly path: string;
  readonly symbolName: string | null;
  readonly startLine: number;
  readonly endLine: number;
  readonly signals: RankingSignals;
  readonly finalScore: number;
  readonly rank: number;
  readonly tokenCount: number;
}

// ---------------------------------------------------------------------------
// Token bütçesi (P08)
// ---------------------------------------------------------------------------

/**
 * Bütçe adapter'ın capability negotiation'ından gelir (ADR-031).
 * 50.000 bir ürün sabiti DEĞİL, olsa olsa organizasyonel tavandır.
 */
export interface TokenBudget {
  readonly providerContextLimit: number;
  readonly systemPromptReserve: number;
  readonly toolDefinitionReserve: number;
  readonly expectedOutputTokens: number;
  readonly safetyMargin: number;
  /** Organizasyonel tavan (opsiyonel). Hesabı yukarıdan clamp eder. */
  readonly policyCeiling: number | null;
  /** Türetilmiş: limit − rezervler, tavanla clamp'lenmiş. */
  readonly available: number;
  readonly tokenizerId: string;
  /** Gerçek tokenizer bulunamadıysa AÇIKÇA işaretlenir. */
  readonly approximate: boolean;
}

export function computeAvailableBudget(
  b: Omit<TokenBudget, "available" | "approximate"> & { approximate?: boolean }
): number {
  const raw =
    b.providerContextLimit -
    b.systemPromptReserve -
    b.toolDefinitionReserve -
    b.expectedOutputTokens -
    b.safetyMargin;
  const clamped = b.policyCeiling === null ? raw : Math.min(raw, b.policyCeiling);
  return clamped;
}

// ---------------------------------------------------------------------------
// Manifest ve provenance (P09)
// ---------------------------------------------------------------------------

/**
 * Bir adayın manifest'e girmeme sebebi.
 * Küme KAPALIDIR: bir aday üretildiyse ve manifest'te yoksa, burada
 * sebebiyle bulunmak ZORUNDADIR (ADR-036).
 */
export type ExclusionReason =
  | "policy_denied"
  | "approval_required"
  | "budget"
  | "rank_cutoff"
  | "duplicate"
  | "secret_redacted"
  | "unavailable";

export interface ManifestItem {
  readonly fragmentId: string;
  readonly repositoryId: string;
  readonly commitSha: string;
  readonly path: string;
  readonly symbolName: string | null;
  readonly startLine: number;
  readonly endLine: number;
  /** Kaynak dosyanın hash'i. */
  readonly sourceHash: string;
  /** Fragment içeriğinin hash'i. */
  readonly chunkHash: string;
  readonly signals: RankingSignals;
  readonly permissionDecision: PolicyEffect;
  readonly policyVersion: number;
  readonly tokenCount: number;
  readonly rank: number;
  /** Sır redaksiyonu uygulandıysa işaretlenir. */
  readonly redacted: boolean;
  /**
   * [P17 / T-05 · ADR-063] GÜVEN SEVİYESİ.
   *
   * Repository'den okunan her fragment `untrusted_repository_content`'tir
   * ve ASLA talimat değildir (spec §29). Alan sabit görünse de manifest'e
   * yazılır: kanıt, "model ne gördü" sorusunun yanında "onu ne olarak
   * gördü" sorusunu da cevaplamak zorundadır.
   *
   * Sabit bir değeri kaydetmenin değeri, gelecekte başka bir güven
   * seviyesi eklendiğinde eski manifest'lerin hangi varsayımla
   * üretildiğinin belli olmasıdır.
   */
  readonly trust: "untrusted_repository_content";
  /**
   * Bu fragment üzerinde tespit edilen enjeksiyon DENEMESİ sayısı.
   *
   * Sıfır olması içeriğin güvenli olduğunu GÖSTERMEZ — koruma tespit
   * değil, trust boundary'nin kendisidir. Sayı kanıt içindir.
   */
  readonly injectionObservationCount: number;
}

export interface ManifestExclusion {
  readonly path: string;
  readonly symbolName: string | null;
  readonly reason: ExclusionReason;
  readonly detail: string | null;
  readonly candidateRank: number | null;
}

/**
 * Agent'a verilen içeriğin TEK kaynağı (ADR-037).
 * Immutable · versioned · hashable · auditable.
 */
export interface ContextManifest {
  readonly id: string;
  readonly runId: string;
  /** `sha256(canonical_json(manifest_without_hash))` */
  readonly manifestHash: string;
  readonly compilerVersion: string;
  readonly policyVersion: number;
  readonly universeHash: string;
  /** `(commit, task, policy, compiler, config, weights, parsers)` hash'i. */
  readonly deterministicInputsHash: string;
  readonly snapshotId: string;
  readonly tokenizerId: string;
  readonly weightsHash: string;
  readonly budgetLimit: number;
  readonly budgetUsed: number;
  readonly items: readonly ManifestItem[];
  readonly exclusions: readonly ManifestExclusion[];
  readonly createdAt: string;
}

/**
 * Provenance kapsama oranı. HER ZAMAN 1.0 olmalıdır.
 * 1.0'ın altı, bir adayın ne dahil ne de dışlama kaydında olduğu
 * anlamına gelir — compile başarısız sayılır (P09 acceptance).
 */
export function provenanceCoverage(
  candidateCount: number,
  manifest: Pick<ContextManifest, "items" | "exclusions">
): number {
  if (candidateCount === 0) return 1;
  return (manifest.items.length + manifest.exclusions.length) / candidateCount;
}
