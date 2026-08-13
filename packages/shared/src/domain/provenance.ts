/**
 * P01 / Y-P01-001 — Provenance mode ayrımı (ADR-015).
 *
 * Master plan §7 (FALSE GREEN YASAĞI): simülasyon gerekiyorsa
 * **type-level ve UI-level** açıkça ayrılmalıdır. Production DTO ile
 * simulation DTO aynı tip OLAMAZ.
 *
 * P00 Truth Audit'in gösterdiği tehlike tam olarak buydu:
 *   - `apps/web/src/lib/api/ai.ts` uydurma bir sonucu gerçek sonuçla aynı
 *     şekilde döndürüyordu (`isFallback: true` bayrağı vardı ama tip aynıydı).
 *   - `navigation.ts` 113 ekranın tamamını `status:"implemented"` ilan
 *     ediyordu; dürüstlük rozeti elle bakıma bağlı olduğu için kırılmıştı.
 *
 * Buradaki yaklaşım farkı: dürüstlük işareti VERİDEN türer, elle
 * bakımdan değil. `Provenanced<T>` sarmalayıcısı olmadan bir sonucu
 * UI'ya taşımak tip hatası verir.
 */

export type ProvenanceMode = "PRODUCTION" | "DEMO" | "FIXTURE" | "SIMULATED";

/** Gerçek sistemden, gerçek yan etkilerle üretilmiş sonuç. */
export interface ProductionResult<T> {
  readonly mode: "PRODUCTION";
  readonly value: T;
  /** Sonucun dayandığı kanıt kaydı (evidence/manifest hash'i). */
  readonly evidenceRef: string;
}

/** Demo/fixture/simülasyon sonucu — sebebi belirtmek ZORUNLU. */
export interface NonProductionResult<T> {
  readonly mode: Exclude<ProvenanceMode, "PRODUCTION">;
  readonly value: T;
  /** Neden gerçek üretim yolu kullanılmadı? Boş bırakılamaz. */
  readonly reason: string;
}

export type Provenanced<T> = ProductionResult<T> | NonProductionResult<T>;

export function isProduction<T>(result: Provenanced<T>): result is ProductionResult<T> {
  return result.mode === "PRODUCTION";
}

export function production<T>(value: T, evidenceRef: string): ProductionResult<T> {
  if (!evidenceRef) {
    throw new Error("ProductionResult evidenceRef olmadan olusturulamaz.");
  }
  return { mode: "PRODUCTION", value, evidenceRef };
}

export function simulated<T>(
  value: T,
  reason: string,
  mode: Exclude<ProvenanceMode, "PRODUCTION"> = "SIMULATED"
): NonProductionResult<T> {
  if (!reason || reason.trim().length === 0) {
    throw new Error("Simule sonuc, sebep belirtilmeden olusturulamaz.");
  }
  return { mode, value, reason };
}

/**
 * UI'da rozet gösterilmesi gerekip gerekmediğini belirler.
 * `mode !== "PRODUCTION"` olan her yüzey kalıcı ve kapatılamaz bir rozet
 * göstermek zorundadır (master plan §7).
 */
export function requiresProvenanceBadge<T>(result: Provenanced<T>): boolean {
  return !isProduction(result);
}
