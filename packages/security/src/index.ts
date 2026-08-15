/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// P03 / Y-P03-002 — Path guvenligi (T-03 traversal, T-04 symlink escape).
// Onceden packages/core/src/repo-adapter.ts icindeydi; Context Firewall (P07),
// Change Firewall (P10) ve quality gate sandbox'i (P14) da ayni korumayi
// kullanacagi icin ayri modul. Kopyalanan guvenlik kodu, sapan guvenlik kodudur.
export {
  PathGuard,
  isPathAllowed,
  isBinaryBuffer,
  DENIED_BASENAMES,
  DENIED_EXTENSIONS,
  DENIED_DIRECTORIES,
  type PathCheck,
  type PathRejectionReason,
  type PathGuardOptions
} from "./path-guard/index";


// SEC Module - Secret redaction and credential protection bounds

// P03 / Y-P03-010 — Sır tespiti ve maskeleme.
//
// P0-11 KAPATILDI: bu dosya artık hiçbir gerçek sır içermiyor.
// Önceki hali gerçek bir DB parolasını iki parçaya bölüp runtime'da
// birleştiriyor ve ondan regex kuruyordu; ayrıca belirli bir Supabase
// project host'u hard-code'luydu. Bu yaklaşım (a) sırrı kaynakta ve git
// geçmişinde tutuyor, (b) yalnız O parolayı koruyor, (c) parola rotate
// edildiğinde sessizce işlevsizleşiyordu.
//
// Yerine kalıp + entropi tabanlı tarayıcı: ./secret-scanner
export {
  scanForSecrets,
  redactSecrets,
  containsSecret,
  shannonEntropy,
  isRedactionMarker,
  type SecretFinding,
  type SecretKind
} from "./secret-scanner/index";

// P17 / T-09 — MCP escalation: sunucu allow-list + tool filtresi.
// DENY-BY-DEFAULT, iki katman. MCP agent'a CALISMA ZAMANINDA yeni
// araclar kazandirir; bilinmeyen bir arac, Y'nin korumadigi bir yoldur.
export {
  decideMcpToolCall,
  filterMcpTools,
  assertValidMcpPolicy,
  McpPolicyError,
  EMPTY_MCP_POLICY,
  type McpPolicy,
  type McpServerGrant,
  type McpDecision,
  type McpRejectionReason
} from "./mcp/allowlist";

// P17 / T-15 — Worker kimligi imzalidir; imzasiz = DENY (spec §54).
// Dogrulama CLAIM NOKTASINDA yapilir, worker baslangicinda degil:
// baslangicta dogrulanan bir kimlik, suresi dolduktan sonra da is alir.
export {
  issueWorkerCredential,
  verifyWorkerCredential,
  WorkerIdentityError,
  MissingSigningKeyError,
  MAX_TTL_SECONDS,
  verifyWorkerCredentialWithReplayCheck,
  type WorkerIdentity,
  type WorkerCredential,
  type WorkerIdentityRejection,
  type IssueOptions,
  type VerifyOptions,
  type VerifiedWorker
} from "./worker-identity/identity";

// P14 — Kanit hash zinciri (T-18 event forgery).
// Barrel'da EKSIKTI: `verify:evidence-chain` script'i yazilirken ortaya
// cikti. Yalniz paket ici kullanilan bir modul, disaridan dogrulanamaz.
export {
  verifyChain,
  prepareEntry,
  computeEntryHash,
  canonicalize,
  EvidenceChainError,
  type EvidenceEntry,
  type AppendInput,
  type VerificationResult
} from "./evidence/chain";

// P19/T7 — T-14 tekrar saldirisi: kullanilmis nonce deposu.
export {
  PostgresNonceStore,
  InMemoryNonceStore,
  NonceReplayError,
  type NonceStore,
  type NonceRecord,
  type NonceStoreDb
} from "./worker-identity/nonce-store";

// P17 / T-05 · ADR-063 — Repository icerigi DATA'dir.
// Azaltim YAPISALDIR: repo icerigi tip duzeyinde talimattan ayrilir ve
// talimat kanalina konamaz. Tespit bir GOZLEMDIR, bir kapi degil.
export {
  systemInstruction,
  userInstruction,
  untrustedRepositoryContent,
  scanForInjectionAttempt,
  buildAgentPayload,
  assertNoRawContentInPrompt,
  RawContentInPromptError,
  type TrustLevel,
  type InstructionText,
  type UntrustedContent,
  type InjectionPatternId,
  type InjectionObservation,
  type AgentPayload
} from "./trust/boundary";

import { redactSecrets as redactSecretsImpl } from "./secret-scanner/index";

/**
 * Geriye dönük uyumlu API.
 *
 * ~20 çağrı noktası bu adı kullanıyor (audit, permission metadata, hata
 * yanıtları, repo dosya okuma). İsim korundu, implementasyon değişti.
 */
export function redactSecretLeaks(text: string): string {
  return redactSecretsImpl(text);
}

/**
 * SERVER-SIDE AUTHORIZATION BOUNDARY
 * Read-only Default Security Policy:
 * 1. Read-only permissions require zero special credentials.
 * 2. High risk actions (write repo edits, committing changes, deleting assets, override decisions)
 *    MUST require explicit Human Review approval flags.
 */
export function evaluateAuthorizationScope(
  actorRole: "admin" | "developer" | "reviewer",
  requestedActionType: "read" | "write" | "admin_override",
  isApprovedByHuman: boolean
): { authorized: boolean; reason: string } {
  // Read actions are safe and connect seamlessly
  if (requestedActionType === "read") {
    return { authorized: true, reason: "Authorized under read-only default policy constraint scopes." };
  }

  // Write actions require human approval point checks
  if (requestedActionType === "write") {
    if (isApprovedByHuman) {
      return { authorized: true, reason: "Authorized. Verified direct Human Approval signoff." };
    }
    return { authorized: false, reason: "Blocked: Action type 'write' requires explicit human confirmation." };
  }

  // Admin overrides require reviewer or higher roles
  if (requestedActionType === "admin_override") {
    if (actorRole === "admin" && isApprovedByHuman) {
      return { authorized: true, reason: "Authorized admin bypass authority." };
    }
    return { authorized: false, reason: "Blocked: Requires combined admin-tier bypass keys + verified human consent." };
  }

  return { authorized: false, reason: "Untrusted security bounds evaluation. Action rejected by default." };
}
