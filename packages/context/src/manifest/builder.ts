/**
 * P09 / Y-P09-002, Y-P09-004, Y-P09-006 — Context manifest (ADR-034, ADR-036).
 *
 * ADR-034 — MANİFEST KANITIN BİRİNCİL BİRİMİDİR
 *   Run, manifest'e referansla tanımlanır. "Model tam olarak ne gördü?"
 *   sorusunun yanıtı burasıdır ve bu yanıt sonradan değiştirilemez.
 *
 * ADR-036 — DIŞLAMA KAYDI ZORUNLU VE SEBEPLİ
 *   Bir aday üretildiyse ve manifest'te YOKSA, `exclusions`'ta sebebiyle
 *   bulunmak ZORUNDADIR. İstisna yok.
 *
 *   P00'da bütçeye sığmayan öğeler sessizce kayboluyordu; yalnız toplu
 *   bir risk metni üretiliyordu. "Neyi neden görmedi" sorusu
 *   yanıtlanamıyordu — ve bu soru, "ne gördü" sorusundan daha önemlidir:
 *   agent'ın bilmediği şey, yanlış yapmasının sebebidir.
 *
 *   `assertCompleteCoverage` bu kuralı ÇALIŞMA ZAMANINDA zorlar:
 *   `|candidates| === |items| + |exclusions|` değilse manifest üretilmez.
 */

import { createHash } from "crypto";
import { canonicalJson, type CanonicalValue } from "./canonical-json";
import type { CompiledContext, ExclusionReason } from "../compiler/compile";
import type { RankedCandidate } from "../retrieval/types";

export interface ManifestItem {
  readonly fragmentId: string;
  readonly repositoryId: string;
  readonly commitSha: string;
  readonly path: string;
  readonly symbolName: string | null;
  readonly startLine: number;
  readonly endLine: number;
  /** Kaynak dosyanın/chunk'ın içerik hash'i. */
  readonly sourceHash: string;
  /** Manifest'e giren metnin hash'i (redakte/kırpılmışsa farklıdır). */
  readonly chunkHash: string;
  /** 14 sinyal + gerekçe. */
  readonly reason: Readonly<Record<string, unknown>>;
  readonly permissionDecision: "allow";
  readonly policyVersion: string;
  readonly tokenCount: number;
  readonly rank: number;
  /** İçerik redakte edildiyse işaretlenir. */
  readonly redacted: boolean;
}

export interface ManifestExclusion {
  readonly path: string;
  readonly symbolName: string | null;
  readonly reason: ExclusionReason;
  readonly detail: string;
  readonly candidateRank: number | null;
}

export interface ContextManifest {
  readonly manifestVersion: 1;
  readonly runId: string | null;
  readonly taskId: string;
  readonly snapshotId: string;
  readonly commitSha: string;
  readonly compilerVersion: string;
  readonly policyVersion: string;
  readonly universeHash: string;
  readonly weightsHash: string;
  readonly tokenizerId: string;
  readonly tokenizerApproximate: boolean;
  readonly parserVersions: Readonly<Record<string, string>>;
  readonly deterministicInputsHash: string;
  readonly budgetLimit: number;
  readonly budgetUsed: number;
  readonly items: readonly ManifestItem[];
  readonly exclusions: readonly ManifestExclusion[];
  readonly unavailableFields: readonly { field: string; reason: string }[];
  /**
   * Manifest'in kendi hash'i.
   *
   * Hesaplanırken BU ALAN hariç tutulur — kendi hash'ini içeren bir
   * yapının hash'i hesaplanamaz.
   */
  readonly manifestHash: string;
}

export class ManifestError extends Error {
  constructor(
    readonly code: "INCOMPLETE_COVERAGE" | "MISSING_INPUT",
    message: string
  ) {
    super(message);
    this.name = "ManifestError";
  }
}

export interface BuildManifestInput {
  readonly compiled: CompiledContext;
  /** Havuzdaki TÜM adaylar — dışlama hesabı için gerekli. */
  readonly allCandidates: readonly RankedCandidate[];
  readonly taskId: string;
  readonly runId: string | null;
  readonly snapshotId: string;
  readonly repositoryId: string;
  readonly commitSha: string;
  readonly compilerVersion: string;
  readonly policyVersion: string;
  readonly universeHash: string;
  readonly weightsHash: string;
  readonly tokenizerId: string;
  readonly parserVersions: Readonly<Record<string, string>>;
  /** Firewall tarafından havuza hiç girmemiş yollar (P07). */
  readonly firewallExclusions?: readonly ManifestExclusion[];
}

export function buildManifest(input: BuildManifestInput): ContextManifest {
  const items = input.compiled.fragments.map<ManifestItem>((fragment, index) => ({
    fragmentId: `frag_${fragment.chunkId}`,
    repositoryId: input.repositoryId,
    commitSha: input.commitSha,
    path: fragment.path,
    symbolName: fragment.symbolName,
    startLine: fragment.startLine,
    endLine: fragment.endLine,
    sourceHash: fragment.sourceContentHash,
    chunkHash: sha256(fragment.content),
    reason: {
      finalScore: fragment.finalScore,
      includedBecause: fragment.includedBecause,
      retrievalRank: fragment.rank
    },
    permissionDecision: "allow",
    policyVersion: input.policyVersion,
    tokenCount: fragment.tokens,
    rank: index + 1,
    redacted: fragment.truncated
  }));

  const exclusions: ManifestExclusion[] = [
    ...input.compiled.exclusions.map<ManifestExclusion>((exclusion) => ({
      path: exclusion.path,
      symbolName: null,
      reason: exclusion.reason,
      detail: exclusion.detail,
      candidateRank:
        input.allCandidates.find((c) => c.candidate.chunkId === exclusion.chunkId)?.rank ?? null
    })),
    ...(input.firewallExclusions ?? [])
  ];

  assertCompleteCoverage(input.allCandidates, items, input.compiled.exclusions);

  const withoutHash = {
    manifestVersion: 1 as const,
    runId: input.runId,
    taskId: input.taskId,
    snapshotId: input.snapshotId,
    commitSha: input.commitSha,
    compilerVersion: input.compilerVersion,
    policyVersion: input.policyVersion,
    universeHash: input.universeHash,
    weightsHash: input.weightsHash,
    tokenizerId: input.tokenizerId,
    tokenizerApproximate: input.compiled.tokenizerApproximate,
    parserVersions: input.parserVersions,
    deterministicInputsHash: input.compiled.inputHash,
    budgetLimit: input.compiled.tokensAvailable,
    budgetUsed: input.compiled.tokensUsed,
    items,
    exclusions,
    unavailableFields: input.compiled.unavailableFields
  };

  return { ...withoutHash, manifestHash: hashManifest(withoutHash) };
}

/**
 * Her aday ya `items`'ta ya `exclusions`'ta (ADR-036).
 *
 * Bu kontrol ÇALIŞMA ZAMANINDA yapılır, testte değil: bir aday sessizce
 * kaybolduğunda manifest üretilmemelidir. Eksik bir kanıt, kanıt
 * olmamasından tehlikelidir çünkü tam görünür.
 */
export function assertCompleteCoverage(
  allCandidates: readonly RankedCandidate[],
  items: readonly ManifestItem[],
  exclusions: readonly { chunkId: string }[]
): void {
  const accounted = new Set<string>();
  for (const item of items) accounted.add(item.fragmentId.replace(/^frag_/, ""));
  for (const exclusion of exclusions) accounted.add(exclusion.chunkId);

  const missing = allCandidates
    .map((c) => c.candidate.chunkId)
    .filter((id) => !accounted.has(id));

  if (missing.length > 0) {
    throw new ManifestError(
      "INCOMPLETE_COVERAGE",
      `${missing.length} aday ne items'ta ne exclusions'ta: ${missing.slice(0, 5).join(", ")}. ` +
        `Bir aday sessizce kaybolduysa manifest URETILMEZ (ADR-036): eksik bir kanit, ` +
        `kanit olmamasindan tehlikelidir cunku tam gorunur.`
    );
  }
}

/**
 * Manifest hash'i.
 *
 * `manifestHash` alanı hesaba KATILMAZ — kendi hash'ini içeren bir
 * yapının hash'i hesaplanamaz.
 */
export function hashManifest(manifest: Omit<ContextManifest, "manifestHash">): string {
  return sha256(canonicalJson(manifest as unknown as CanonicalValue));
}

/**
 * Y-P09-006 — Manifest doğrulama.
 *
 * Depolanan hash yeniden hesaplanır. Uyuşmazlık `tampered` demektir:
 * manifest immutable olduğu için normal işleyişte bu ASLA olmamalıdır.
 */
export function verifyManifest(manifest: ContextManifest): {
  valid: boolean;
  expectedHash: string;
  storedHash: string;
  verdict: "valid" | "tampered";
} {
  const { manifestHash, ...withoutHash } = manifest;
  const expected = hashManifest(withoutHash);
  const valid = expected === manifestHash;

  return {
    valid,
    expectedHash: expected,
    storedHash: manifestHash,
    verdict: valid ? "valid" : "tampered"
  };
}

/**
 * Provenance kapsama oranı.
 *
 * P01'deki `provenanceCoverage` ile aynı fikir: kaç fragment'ın kaynağı
 * kesin olarak biliniyor. %100 dışındaki her değer bir eksikliktir ve
 * öyle raporlanır.
 */
export function provenanceCoverage(manifest: ContextManifest): number {
  if (manifest.items.length === 0) return 1;
  const withProvenance = manifest.items.filter(
    (item) => item.sourceHash.length === 64 && item.commitSha.length > 0 && item.path.length > 0
  );
  return Number((withProvenance.length / manifest.items.length).toFixed(6));
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}
