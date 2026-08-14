/**
 * P08 / Y-P08-004, Y-P08-005 — Context compiler (ADR-032, ADR-033).
 *
 * ADR-033 — DERLEME SAF FONKSİYONDUR
 *   Compiler I/O YAPMAZ. Adaylar, universe, bütçe ve git bilgisi
 *   ÖNCEDEN toplanır ve parametre olarak verilir. Sebep: determinizm
 *   testi ancak saf bir fonksiyonda anlamlıdır — bir DB çağrısı olan
 *   fonksiyon "aynı girdi aynı çıktı" iddiasını taşıyamaz, çünkü girdisi
 *   parametrelerinden ibaret değildir.
 *
 *   Bu testin somut biçimi: `compiler.test.ts` HİÇBİR mock kullanmaz.
 *   Mock gerektirmesi, saflığın bozulduğunun kanıtı olurdu.
 *
 * ADR-032 — UYDURMA ALAN YASAĞI
 *   P00'da `buildContextPack` şunları kalıcı olarak yazıyordu:
 *     - `direct_dependencies`: literal stub
 *       `{ dependency: "shared-types", detail: "…stub…", status: "stubbed" }`
 *     - `recent_diffs`: UYDURMA
 *       `{ id: "diff-recent-01", author: "User-Aydinoglu", line_changes: "+45 -12" }`
 *       — git'e hiç bakılmıyordu
 *     - `metadata.secret_scanned`: koşulsuz `true`
 *     - Chunk metni yoksa: `"Mock detailed documentation content that exceeds budget."`
 *
 *   Bu veriler `context_packs` tablosuna yazılıyordu: yani sahte veri
 *   veritabanındaydı ve okuyanın onu ayırt etme imkânı yoktu.
 *
 *   Yeni kural: bir alan hesaplanamıyorsa `null` + `unavailableReason`.
 *   Temsili değer ASLA yazılmaz.
 */

import { createHash } from "crypto";
import type { RankedCandidate } from "../retrieval/types";
import type { TokenBudget } from "../budget/engine";

export type ExclusionReason =
  | "budget"
  | "policy_denied"
  | "policy_approval_pending"
  | "contains_secret"
  | "duplicate"
  | "below_threshold";

export interface CompiledFragment {
  readonly chunkId: string;
  readonly path: string;
  readonly symbolName: string | null;
  readonly startLine: number;
  readonly endLine: number;
  readonly content: string;
  readonly tokens: number;
  readonly rank: number;
  readonly finalScore: number;
  /** "Bu neden seçildi?" — P06 ranker'ından taşınır. */
  readonly includedBecause: readonly string[];
  /** İçerik kırpıldıysa orijinalin hash'i korunur. */
  readonly sourceContentHash: string;
  readonly truncated: boolean;
}

export interface Exclusion {
  readonly chunkId: string;
  readonly path: string;
  readonly reason: ExclusionReason;
  readonly detail: string;
}

/**
 * Hesaplanamayan alanlar.
 *
 * `null` + sebep. Eski kod burada temsili değerler üretiyordu; bir
 * okuyucunun `"+45 -12"` değerinin uydurma olduğunu anlamasının yolu
 * yoktu.
 */
export interface UnavailableField {
  readonly field: string;
  readonly reason: string;
}

export interface CompileInput {
  readonly taskId: string;
  readonly snapshotId: string;
  readonly commitSha: string;
  readonly universeHash: string;
  readonly policyVersion: string;
  readonly compilerVersion: string;
  readonly weightsHash: string;
  readonly parserVersions: Readonly<Record<string, string>>;
  readonly budget: TokenBudget;
  readonly candidates: readonly RankedCandidate[];
  /**
   * Zorunlu kaynaklar: görev metninde doğrudan adı geçen semboller.
   * Bütçe yetmese bile bunlar ÖNCE yerleştirilir.
   */
  readonly requiredChunkIds?: readonly string[];
  /**
   * Gerçek git bilgisi. Hesaplanamadıysa `null` verilir ve alan
   * `unavailable` olarak raporlanır — UYDURULMAZ (ADR-032).
   */
  readonly recentDiffs: readonly { path: string; insertions: number; deletions: number; author: string; sha: string }[] | null;
  readonly recentDiffsUnavailableReason?: string;
}

export interface CompiledContext {
  readonly fragments: readonly CompiledFragment[];
  readonly exclusions: readonly Exclusion[];
  readonly unavailableFields: readonly UnavailableField[];
  readonly tokensUsed: number;
  readonly tokensAvailable: number;
  readonly budgetUtilization: number;
  /** Girdilerin kimliği — P09 manifest determinizminin temeli. */
  readonly inputHash: string;
  readonly recentDiffs: CompileInput["recentDiffs"];
  readonly tokenizerApproximate: boolean;
}

export class CompileError extends Error {
  constructor(
    readonly code: "REQUIRED_FRAGMENT_TOO_LARGE" | "INSUFFICIENT_CONTEXT" | "EMPTY_CANDIDATES",
    message: string
  ) {
    super(message);
    this.name = "CompileError";
  }
}

/**
 * Adayları bütçeye yerleştirir.
 *
 * SAF FONKSİYON: I/O yok, zaman okuma yok, rastgelelik yok. Aynı girdi
 * her zaman aynı çıktıyı verir — `determinism.test.ts` bunu 100 tekrarla
 * byte düzeyinde doğrular.
 */
export function compileContext(input: CompileInput): CompiledContext {
  const required = new Set(input.requiredChunkIds ?? []);
  const fragments: CompiledFragment[] = [];
  const exclusions: Exclusion[] = [];

  let used = 0;

  // Zorunlu kaynaklar ONCE. Bir gorev metninde adi gecen sembol,
  // skoru dusuk olsa bile context'te olmalidir: agent onu aramaya
  // gonderilmemeli.
  const ordered = [...input.candidates].sort((a, b) => {
    const aRequired = required.has(a.candidate.chunkId) ? 0 : 1;
    const bRequired = required.has(b.candidate.chunkId) ? 0 : 1;
    if (aRequired !== bRequired) return aRequired - bRequired;
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    // Kararli siralama: ayni girdi ayni cikti (ADR-033).
    return a.candidate.chunkId.localeCompare(b.candidate.chunkId);
  });

  const seenPaths = new Set<string>();

  for (const ranked of ordered) {
    const candidate = ranked.candidate;
    const tokens = candidate.estimatedTokens;
    const isRequired = required.has(candidate.chunkId);

    // Ayni chunk iki kez gelmemeli; geldiyse ikincisi kopyadir.
    const dedupKey = `${candidate.path}:${candidate.startLine}-${candidate.endLine}`;
    if (seenPaths.has(dedupKey)) {
      exclusions.push({
        chunkId: candidate.chunkId,
        path: candidate.path,
        reason: "duplicate",
        detail: `Ayni satir araligi zaten dahil: ${dedupKey}`
      });
      continue;
    }

    if (used + tokens <= input.budget.available) {
      seenPaths.add(dedupKey);
      used += tokens;
      fragments.push(toFragment(ranked, candidate.content, false));
      continue;
    }

    // Zorunlu bir fragment butceden buyukse SESSIZCE KESILMEZ.
    if (isRequired) {
      if (tokens > input.budget.available) {
        throw new CompileError(
          "REQUIRED_FRAGMENT_TOO_LARGE",
          `Zorunlu fragment '${candidate.path}' ${tokens} token, butce ` +
            `${input.budget.available}. Sessizce kesmek, agent'a yarim bir tanim ` +
            `vermek olurdu; bu, hic vermemekten daha yaniltici.`
        );
      }
      // Butce doldu ama fragment tek basina sigiyor: bu bir siralama
      // hatasidir ve acikca bildirilir.
      throw new CompileError(
        "INSUFFICIENT_CONTEXT",
        `Zorunlu fragment '${candidate.path}' butceye sigmadi (kullanilan ${used}, ` +
          `gereken ${tokens}, toplam ${input.budget.available}).`
      );
    }

    exclusions.push({
      chunkId: candidate.chunkId,
      path: candidate.path,
      reason: "budget",
      detail: `${tokens} token gerekiyordu, kalan ${input.budget.available - used}`
    });
  }

  if (fragments.length === 0 && input.candidates.length > 0) {
    throw new CompileError(
      "INSUFFICIENT_CONTEXT",
      `${input.candidates.length} aday vardi ama hicbiri butceye sigmadi. ` +
        `Bos bir context uretmek, agent'i hicbir sey bilmeden calistirmak olurdu.`
    );
  }

  const unavailableFields: UnavailableField[] = [];
  if (input.recentDiffs === null) {
    unavailableFields.push({
      field: "recentDiffs",
      reason: input.recentDiffsUnavailableReason ?? "git gecmisi okunamadi"
    });
  }

  return {
    fragments,
    exclusions,
    unavailableFields,
    tokensUsed: used,
    tokensAvailable: input.budget.available,
    budgetUtilization:
      input.budget.available > 0 ? Number((used / input.budget.available).toFixed(6)) : 0,
    inputHash: hashInputs(input),
    recentDiffs: input.recentDiffs,
    tokenizerApproximate: input.budget.tokenizerApproximate
  };
}

function toFragment(
  ranked: RankedCandidate,
  content: string,
  truncated: boolean
): CompiledFragment {
  const candidate = ranked.candidate;
  return {
    chunkId: candidate.chunkId,
    path: candidate.path,
    symbolName: candidate.symbolName,
    startLine: candidate.startLine,
    endLine: candidate.endLine,
    content,
    tokens: candidate.estimatedTokens,
    rank: ranked.rank,
    finalScore: ranked.finalScore,
    includedBecause: ranked.explanation.topReasons,
    // Icerik kirpilsa bile ORIJINALIN hash'i korunur: ozetin/kirpilmis
    // metnin hangi kaynaktan geldigi kaybolmamali (P09 provenance).
    sourceContentHash: sha256(candidate.content),
    truncated
  };
}

/**
 * Derleme girdilerinin kimliği.
 *
 * P09'un determinizm iddiası buna dayanır: `(commit, task, policy,
 * compiler, weights, parser sürümleri, bütçe, aday kimlikleri)` aynıysa
 * çıktı aynıdır. İçerik değil KİMLİK hash'lenir — içerik zaten
 * `chunkId` üzerinden sabittir ve büyük metinleri hash'lemek pahalıdır.
 */
export function hashInputs(input: CompileInput): string {
  const canonical = JSON.stringify({
    budgetAvailable: input.budget.available,
    candidates: [...input.candidates]
      .map((c) => `${c.candidate.chunkId}:${c.finalScore}`)
      .sort(),
    commitSha: input.commitSha,
    compilerVersion: input.compilerVersion,
    parserVersions: Object.fromEntries(
      Object.entries(input.parserVersions).sort(([a], [b]) => a.localeCompare(b))
    ),
    policyVersion: input.policyVersion,
    required: [...(input.requiredChunkIds ?? [])].sort(),
    snapshotId: input.snapshotId,
    taskId: input.taskId,
    universeHash: input.universeHash,
    weightsHash: input.weightsHash
  });
  return createHash("sha256").update(canonical, "utf-8").digest("hex");
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}
