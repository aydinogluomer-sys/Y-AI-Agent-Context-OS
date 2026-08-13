/**
 * P01 / Y-P01-001 — Change Firewall sözleşmeleri.
 *
 * P00 Truth Audit: ürün tezinin "CHANGE" sütunu tamamen eksikti.
 * `task_boundaries` ve `boundary_checks` tabloları vardı ama ilgili
 * route'lar `/tasks/*` blocker'ı yüzünden 410 ile ölüydü; `boundary_checks`
 * yalnız yazılıyor, hiç okunmuyordu. Mutation interception yoktu.
 *
 * ADR-038 (boundary task'tan türetilir, kullanıcı genişletemez),
 * ADR-039 (enforcement mutation noktasında), ADR-040 (onay run'ı bloklar),
 * ADR-041 (hash-before / hash-after zorunlu).
 */

export type MutationOperation = "create" | "modify" | "delete" | "rename";

/** Varsayılan DENY: eşleşmeyen her yol reddedilir. */
export type MutationVerdict = "ALLOW" | "DENY" | "ASK_APPROVAL";

/**
 * Task'tan türetilmiş değişiklik sınırı.
 *
 * Kullanıcı bunu GENİŞLETEMEZ; yalnız onay verebilir (ADR-038).
 * Immutable ve hash'li — sonradan genişletilip "hep izinliydi" denemez.
 */
export interface ChangeBoundary {
  readonly id: string;
  readonly taskId: string;
  readonly runId: string;
  /** Task'ın doğrudan hedefi: seed symbol'lerin dosyaları + testleri. */
  readonly expected: readonly string[];
  /** Graph'ta 1 mesafedeki bağımlılıklar. */
  readonly allowed: readonly string[];
  /** İnsan onayı gerektiren alanlar (migrations/**, infra/** vb.). */
  readonly approval: readonly string[];
  /** Her koşulda reddedilen alanlar. DENY her zaman kazanır. */
  readonly denied: readonly string[];
  /** Türetmenin girdileri — denetlenebilirlik için. */
  readonly derivedFrom: {
    readonly seedSymbols: readonly string[];
    readonly graphDepth: number;
    readonly policyVersion: number;
  };
  readonly boundaryHash: string;
  readonly createdAt: string;
}

/**
 * Tek bir mutation girişiminin kaydı.
 *
 * Bu bir frontend uyarısı DEĞİLDİR — backend enforcement kaydıdır.
 * `hashBefore` beklenenle uyuşmazsa yazım reddedilir (optimistic
 * concurrency, T-20).
 */
export interface MutationDecision {
  readonly id: string;
  readonly runId: string;
  readonly path: string;
  readonly operation: MutationOperation;
  readonly verdict: MutationVerdict;
  readonly reason: string;
  /** Kararı veren kural — hangi kümeden eşleşti. */
  readonly ruleMatched: "expected" | "allowed" | "approval" | "denied" | "default_deny";
  readonly hashBefore: string | null;
  readonly hashAfter: string | null;
  readonly decidedAt: string;
}

export interface ApprovalRequest {
  readonly id: string;
  readonly runId: string;
  readonly mutationDecisionId: string;
  readonly requestedAt: string;
  readonly requestedBy: string;
  readonly resolvedAt: string | null;
  /** Onaylayan, isteyen OLAMAZ (self-approval varsayılan olarak kapalı). */
  readonly resolvedBy: string | null;
  readonly decision: "approved" | "rejected" | null;
  readonly rationale: string | null;
}

/**
 * Karar sırası: `denied > approval > expected/allowed > default DENY`.
 *
 * Bu fonksiyon saf ve deterministiktir; P10'un enforcement noktası bunu
 * kullanır. Glob eşleştirme çağıran tarafından yapılır — burada yalnız
 * öncelik mantığı yaşar.
 */
export function decideVerdict(matches: {
  readonly denied: boolean;
  readonly approval: boolean;
  readonly expected: boolean;
  readonly allowed: boolean;
}): { verdict: MutationVerdict; ruleMatched: MutationDecision["ruleMatched"] } {
  if (matches.denied) return { verdict: "DENY", ruleMatched: "denied" };
  if (matches.approval) return { verdict: "ASK_APPROVAL", ruleMatched: "approval" };
  if (matches.expected) return { verdict: "ALLOW", ruleMatched: "expected" };
  if (matches.allowed) return { verdict: "ALLOW", ruleMatched: "allowed" };
  return { verdict: "DENY", ruleMatched: "default_deny" };
}

/** Komut çalıştırma politikası — shell YOK, allow-list'li argüman dizisi (T-22). */
export interface CommandPolicy {
  readonly projectId: string;
  readonly allowedCommands: readonly string[];
  readonly deniedPatterns: readonly string[];
}
