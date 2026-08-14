/**
 * P10 / Y-P10-002, Y-P10-003 — Mutation kararı (ADR-039, ADR-041).
 *
 * ADR-039 — ENFORCEMENT MUTATION NOKTASINDA, PLAN AŞAMASINDA DEĞİL
 *   Agent'ın "niyeti" değil, GERÇEK YAZMA GİRİŞİMİ değerlendirilir.
 *   Sebep: agent planını sunmayabilir, planından sapabilir ya da planı
 *   hiç üretmeyebilir. Tek güvenilir nokta dosya sistemine/VCS'e yazma
 *   anıdır.
 *
 *   Bu, kararın bir FRONTEND UYARISI olmadığı anlamına gelir. Karar
 *   backend'de verilir ve yazma yolu karar olmadan çalışamaz — tip
 *   zorunluluğu ile.
 *
 * ADR-041 — HASH-BEFORE / HASH-AFTER ZORUNLU
 *   Her yazımda dosyanın önceki hash'i kaydedilir ve yazımdan hemen önce
 *   DOĞRULANIR. Beklenen hash tutmuyorsa dosya araya giren biri
 *   tarafından değiştirilmiş demektir (T-20 write race) ve yazım
 *   REDDEDİLİR.
 *
 *   "Son yazan kazanır" davranışı, iki agent'ın aynı dosyada çalıştığı
 *   durumda birinin işini sessizce silmek demektir.
 */

import { bandFor, type BoundaryBand, type ChangeBoundary } from "./boundary";

export type MutationOperation = "create" | "modify" | "delete" | "rename";
export type MutationDecision = "ALLOW" | "DENY" | "ASK_APPROVAL";

export interface MutationRequest {
  readonly path: string;
  readonly operation: MutationOperation;
  /** Yazımdan önce dosyanın hash'i. Yeni dosyada `null`. */
  readonly expectedHashBefore: string | null;
  /** Diskteki gerçek hash. Yeni dosyada `null`. */
  readonly actualHashBefore: string | null;
}

export interface DecisionResult {
  readonly decision: MutationDecision;
  readonly path: string;
  readonly operation: MutationOperation;
  readonly band: BoundaryBand | "outside";
  /** Kararın insan tarafından okunabilir gerekçesi. */
  readonly reason: string;
  /** Hangi kural eşleşti — denetim için. */
  readonly ruleMatched: string;
}

/**
 * Bir mutation girişimini değerlendirir.
 *
 * SAF FONKSİYON: I/O yok. Karar yalnızca boundary ve istekten türer;
 * aynı girdi her zaman aynı kararı verir ve bu karar kaydedilebilir.
 */
export function decideMutation(
  boundary: ChangeBoundary,
  request: MutationRequest
): DecisionResult {
  // 1. Esszamanli degisiklik kontrolu HER SEYDEN ONCE (T-20).
  //    Sinir icinde bile olsa, bayat bir hash uzerine yazmak baskasinin
  //    isini sessizce siler.
  if (request.expectedHashBefore !== request.actualHashBefore) {
    return {
      decision: "DENY",
      path: request.path,
      operation: request.operation,
      band: bandFor(boundary, request.path),
      reason:
        `Dosya, yazma karari verildikten sonra degismis (beklenen ` +
        `${short(request.expectedHashBefore)}, bulunan ${short(request.actualHashBefore)}). ` +
        `Uzerine yazmak baskasinin isini sessizce silerdi (T-20).`,
      ruleMatched: "write_race_detected"
    };
  }

  const band = bandFor(boundary, request.path);

  switch (band) {
    case "denied":
      return {
        decision: "DENY",
        path: request.path,
        operation: request.operation,
        band,
        reason: "Yol, policy tarafindan yasaklanmis kapsamda.",
        ruleMatched: "boundary_denied"
      };

    case "approval":
      return {
        decision: "ASK_APPROVAL",
        path: request.path,
        operation: request.operation,
        band,
        reason: "Yol onay gerektiren kapsamda (migration, altyapi vb.).",
        ruleMatched: "boundary_approval"
      };

    case "expected":
      return {
        decision: "ALLOW",
        path: request.path,
        operation: request.operation,
        band,
        reason: "Yol, gorevden turetilen degisim sinirinin merkezinde.",
        ruleMatched: "boundary_expected"
      };

    case "allowed":
      return {
        decision: "ALLOW",
        path: request.path,
        operation: request.operation,
        band,
        reason: "Yol, gorevin dogrudan bagimlilik komsulugunda.",
        ruleMatched: "boundary_allowed"
      };

    case "outside":
    default:
      return {
        decision: "DENY",
        path: request.path,
        operation: request.operation,
        band: "outside",
        // Sinir disi bir yazim, sinirin var olma sebebidir. Varsayilan
        // izin vermek boundary'yi susleme haline getirirdi.
        reason:
          "Yol, gorevden turetilen degisim sinirinin DISINDA. " +
          "Genisletme kullanicidan alinmaz; insan onayi gerekir (ADR-038).",
        ruleMatched: "outside_boundary"
      };
  }
}

/**
 * Silme işlemi için ek kısıt.
 *
 * Bir dosyayı silmek, değiştirmekten daha geri döndürülemez bir
 * eylemdir: değişiklik diff'te görünür, silme ise dosyanın var olduğunu
 * bilmeyen için görünmez. Bu yüzden `expected` bandında bile silme
 * ONAY ister.
 */
export function decideWithDeletionGuard(
  boundary: ChangeBoundary,
  request: MutationRequest
): DecisionResult {
  const base = decideMutation(boundary, request);

  if (base.decision === "ALLOW" && request.operation === "delete") {
    return {
      ...base,
      decision: "ASK_APPROVAL",
      reason:
        "Silme, degistirmekten daha geri dondurulemez bir eylemdir: degisiklik " +
        "diff'te gorunur, silme ise dosyanin var oldugunu bilmeyen icin gorunmez.",
      ruleMatched: "deletion_requires_approval"
    };
  }

  return base;
}

function short(hash: string | null): string {
  if (hash === null) return "(yok)";
  return hash.slice(0, 12);
}
