/**
 * P14 — Kanıt hash zinciri.
 *
 * P00 Truth Audit: `evidence_records` tablosu ve `EvidenceStoreService`
 * GERÇEKTİ — ama zincir yoktu. Her kayıt kendi başına duruyordu; bir
 * kaydın silinmesi ya da araya kayıt eklenmesi tespit edilemezdi.
 *
 * Ayrıca UI iki yerde UYDURMA hash gösteriyordu:
 *   - `App.tsx`: `"sha256-" + Math.random().toString(16)...`
 *   - `AIMissionControlPanel.tsx`: hard-code bir SHA-256
 *   İkisi de P13'te kaldırıldı.
 *
 * ZİNCİR NASIL ÇALIŞIR
 *   Her kayıt bir öncekinin hash'ini içerir:
 *
 *     entryHash(n) = sha256(canonical(payload(n)) || entryHash(n-1))
 *
 *   Bir kayıt değiştirilirse kendi hash'i değişir; sonraki kaydın
 *   `previousHash` alanı artık uyuşmaz ve zincir O NOKTADAN İTİBAREN
 *   kırılır. Araya kayıt eklemek de aynı sonucu verir.
 *
 * NE GARANTİ ETMEZ — ve bunu söylemek önemli
 *   Bu zincir, veritabanına yazma yetkisi olan birinin TÜM zinciri
 *   yeniden hesaplamasını engellemez. Ona karşı koruma dış bir çıpa
 *   gerektirir (imzalı periyodik snapshot, harici zaman damgası).
 *
 *   Zincirin gerçekten sağladığı şey: KISMİ değişikliğin tespit
 *   edilmesi. Bir kaydı sessizce düzeltmek ya da silmek artık
 *   mümkün değil; zinciri baştan yazmak gerekir ve bu, bir denetimde
 *   görünen bir eylemdir.
 */

import { createHash } from "crypto";

export const GENESIS_HASH = "0".repeat(64);

export interface EvidenceEntry {
  readonly id: string;
  readonly runId: string | null;
  readonly kind: string;
  /** Kanıtın içeriği. Kanonik serileştirilerek hash'lenir. */
  readonly payload: Readonly<Record<string, unknown>>;
  readonly sequence: number;
  readonly previousHash: string;
  readonly entryHash: string;
  readonly createdAt: string;
}

export interface AppendInput {
  readonly id: string;
  readonly runId: string | null;
  readonly kind: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly sequence: number;
  readonly previousHash: string;
  readonly createdAt: string;
}

export class EvidenceChainError extends Error {
  constructor(
    readonly code: "BROKEN_CHAIN" | "SEQUENCE_GAP" | "HASH_MISMATCH" | "EMPTY_CHAIN",
    message: string,
    readonly atSequence: number | null = null
  ) {
    super(message);
    this.name = "EvidenceChainError";
  }
}

/**
 * Kanonik serileştirme.
 *
 * Manifest'teki (P09) ile aynı gerekçe: aynı içerik farklı
 * serileştirmeyle farklı hash üretirse zincir doğrulaması anlamsızlaşır.
 * Anahtarlar sıralanır, `undefined` atlanır, unicode NFC'ye normalize
 * edilir.
 */
export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new EvidenceChainError("HASH_MISMATCH", `Kanit yukunde NaN/Infinity olamaz.`);
    }
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (typeof value === "string") return JSON.stringify(value.normalize("NFC"));

  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalize(v === undefined ? null : v)).join(",")}]`;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const parts: string[] = [];
    for (const key of Object.keys(obj).sort()) {
      if (obj[key] === undefined) continue;
      parts.push(`${JSON.stringify(key.normalize("NFC"))}:${canonicalize(obj[key])}`);
    }
    return `{${parts.join(",")}}`;
  }

  throw new EvidenceChainError("HASH_MISMATCH", `Serilestirlemeyen tur: ${typeof value}`);
}

/**
 * Bir kaydın hash'i.
 *
 * `previousHash` hesaba KATILIR — zinciri kuran şey budur. Kayıt
 * kimliği ve zaman damgası da katılır: aynı içerikli iki kaydın aynı
 * hash'i olması, birinin diğerinin yerine geçebilmesi demek olurdu.
 */
export function computeEntryHash(input: Omit<AppendInput, "id"> & { id: string }): string {
  const material = canonicalize({
    createdAt: input.createdAt,
    id: input.id,
    kind: input.kind,
    payload: input.payload,
    previousHash: input.previousHash,
    runId: input.runId,
    sequence: input.sequence
  });
  return createHash("sha256").update(material, "utf-8").digest("hex");
}

/** Zincire yeni kayıt hazırlar (yazım çağırana ait). */
export function prepareEntry(input: AppendInput): EvidenceEntry {
  return { ...input, entryHash: computeEntryHash(input) };
}

export interface VerificationResult {
  readonly valid: boolean;
  readonly verifiedCount: number;
  /** Zincirin ilk kırıldığı sıra. Sağlamsa `null`. */
  readonly brokenAtSequence: number | null;
  readonly reason: string | null;
}

/**
 * Zinciri baştan sona doğrular.
 *
 * ÜÇ AYRI KONTROL:
 *   1. Sıra boşluğu: `sequence` 1'den başlayarak birer artmalı.
 *      Bir kayıt SİLİNDİYSE burada yakalanır.
 *   2. Bağ: her kaydın `previousHash`'i bir öncekinin `entryHash`'i
 *      olmalı. Araya kayıt EKLENDİYSE burada yakalanır.
 *   3. İçerik: her kaydın `entryHash`'i içeriğinden yeniden
 *      hesaplanabilmeli. Bir kayıt DEĞİŞTİRİLDİYSE burada yakalanır.
 *
 * Üçü ayrı ayrı kontrol edilir çünkü üç farklı saldırıyı yakalarlar ve
 * hangisinin olduğunu bilmek, olayı incelemenin ilk adımıdır.
 */
export function verifyChain(entries: readonly EvidenceEntry[]): VerificationResult {
  if (entries.length === 0) {
    // Bos zincir GECERLIDIR: henuz kanit uretilmemis olabilir.
    return { valid: true, verifiedCount: 0, brokenAtSequence: null, reason: null };
  }

  const sorted = [...entries].sort((a, b) => a.sequence - b.sequence);
  let expectedPrevious = GENESIS_HASH;

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    const expectedSequence = i + 1;

    if (entry.sequence !== expectedSequence) {
      return {
        valid: false,
        verifiedCount: i,
        brokenAtSequence: entry.sequence,
        reason:
          `Sira boslugu: ${expectedSequence} bekleniyordu, ${entry.sequence} bulundu. ` +
          `Bir kayit SILINMIS olabilir.`
      };
    }

    if (entry.previousHash !== expectedPrevious) {
      return {
        valid: false,
        verifiedCount: i,
        brokenAtSequence: entry.sequence,
        reason:
          `Zincir bagi kirik: onceki hash ${short(expectedPrevious)} bekleniyordu, ` +
          `${short(entry.previousHash)} bulundu. Araya kayit EKLENMIS olabilir.`
      };
    }

    const recomputed = computeEntryHash(entry);
    if (recomputed !== entry.entryHash) {
      return {
        valid: false,
        verifiedCount: i,
        brokenAtSequence: entry.sequence,
        reason:
          `Icerik hash'i uyusmuyor: ${short(recomputed)} hesaplandi, ` +
          `${short(entry.entryHash)} kayitli. Kayit DEGISTIRILMIS.`
      };
    }

    expectedPrevious = entry.entryHash;
  }

  return {
    valid: true,
    verifiedCount: sorted.length,
    brokenAtSequence: null,
    reason: null
  };
}

/**
 * Zincirin ucu — yeni kaydın bağlanacağı nokta.
 *
 * Boş zincirde genesis hash döner. Bu, ilk kaydın da bir öncekine
 * bağlanmasını sağlar ve "ilk kayıt özeldir" istisnasını ortadan
 * kaldırır.
 */
export function chainHead(entries: readonly EvidenceEntry[]): { sequence: number; hash: string } {
  if (entries.length === 0) return { sequence: 0, hash: GENESIS_HASH };

  const last = [...entries].sort((a, b) => b.sequence - a.sequence)[0];
  return { sequence: last.sequence, hash: last.entryHash };
}

function short(hash: string): string {
  return hash.slice(0, 12);
}
