/**
 * P08 / Y-P08-003 — Dynamic Model-Aware Token Budget Engine (ADR-031).
 *
 * P00 Truth Audit: `50000` ÜÇ AYRI YERDE hard-code'du —
 *   - `CANONICAL_TOKEN_BUDGET.hardPackLimit` (yalnız `estimateTokenCompression`'da kullanılıyordu)
 *   - `DEFAULT_TOKEN_BUDGET` (pack builder bunu kullanıyordu)
 *   - `req.body.token_budget || 50000` (iki route'ta)
 *
 * ve ÇELİŞEN dördüncü bir değer vardı: `selectWithinBudget` default'u
 * **4000**. Yani aynı sistemde bütçe hem 50.000 hem 4.000'di ve hangisinin
 * uygulandığı çağrı yoluna bağlıydı.
 *
 * ADR-031 — BÜTÇE ADAPTER'DAN, TAVAN POLICY'DEN
 *   `available = provider_limit − rezervler`, sonra policy tavanıyla
 *   clamp. 50.000 bir ÜRÜN SABİTİ değil, olsa olsa bir organizasyon
 *   tavanıdır: "hiçbir run 30K'yı geçmesin" demek meşrudur, "context
 *   her zaman 50K'dır" demek değildir.
 *
 * BÜTÇE İSTEMCİDEN GELMEZ
 *   Eski route'lar `req.body.token_budget` kabul ediyordu. İstemcinin
 *   bütçeyi belirlemesi, policy tavanını istemciye devretmek demektir.
 *   Bu motor gövdeden gelen değeri YOK SAYAR.
 */

export interface BudgetReserves {
  /** Sistem prompt'u için ayrılan. */
  readonly systemPrompt: number;
  /** Araç tanımları için ayrılan (adapter'a göre değişir). */
  readonly toolDefinitions: number;
  /** Modelin üreteceği çıktı için ayrılan. */
  readonly expectedOutput: number;
  /**
   * Güvenlik payı.
   *
   * Tokenizer yaklaşıksa BÜYÜTÜLÜR: yaklaşık bir sayıya dayanan bütçe,
   * kesin bir sayıya dayanandan daha geniş bir pay ister. Aksi halde
   * yaklaşıklık taşmaya dönüşür.
   */
  readonly safetyMargin: number;
}

export interface BudgetInputs {
  /** Adapter'ın capability negotiation'ından gelir (P11). */
  readonly providerContextLimit: number;
  readonly reserves: BudgetReserves;
  /** Organizasyon tavanı. Yoksa yalnız provider limiti geçerlidir. */
  readonly policyCeiling?: number;
  /** Tokenizer yaklaşık mı — güvenlik payını etkiler. */
  readonly tokenizerApproximate: boolean;
}

export interface TokenBudget {
  readonly providerContextLimit: number;
  readonly reserves: BudgetReserves;
  readonly policyCeiling: number | null;
  /** Fragment'lara ayrılabilecek token. */
  readonly available: number;
  /** Tavan mı yoksa provider limiti mi bağladı. */
  readonly boundBy: "provider_limit" | "policy_ceiling";
  readonly tokenizerApproximate: boolean;
  /** Yaklaşıklık nedeniyle eklenen ek pay. */
  readonly approximationMargin: number;
}

export class BudgetError extends Error {
  constructor(
    readonly code: "INSUFFICIENT_BUDGET" | "INVALID_LIMIT",
    message: string,
    readonly detail: Record<string, number> = {}
  ) {
    super(message);
    this.name = "BudgetError";
  }
}

/**
 * Yaklaşık tokenizer için ek güvenlik payı oranı.
 *
 * Heuristic'in ölçülen sapması `tokenizer.test.ts`'te raporlanıyor;
 * %15 o sapmanın üstünde bir paydır. Sayı keyfi değil ama kesin de
 * değildir — gerçek tokenizer bağlandığında (P11) bu pay SIFIRLANIR.
 */
export const APPROXIMATION_MARGIN_RATIO = 0.15;

export function computeBudget(inputs: BudgetInputs): TokenBudget {
  if (inputs.providerContextLimit < 1) {
    throw new BudgetError("INVALID_LIMIT", "Provider context limiti pozitif olmali.", {
      providerContextLimit: inputs.providerContextLimit
    });
  }

  const reserveTotal =
    inputs.reserves.systemPrompt +
    inputs.reserves.toolDefinitions +
    inputs.reserves.expectedOutput +
    inputs.reserves.safetyMargin;

  const approximationMargin = inputs.tokenizerApproximate
    ? Math.ceil(inputs.providerContextLimit * APPROXIMATION_MARGIN_RATIO)
    : 0;

  const rawAvailable = inputs.providerContextLimit - reserveTotal - approximationMargin;

  if (rawAvailable <= 0) {
    // SIFIR YA DA NEGATIF BUTCEYLE DEVAM EDILMEZ. Eski kod bu durumda
    // clamp edip devam ederdi ve sonuc bos ama "basarili" bir context
    // olurdu — bos context, kotu context'ten daha zararlidir cunku
    // agent hicbir sey bilmeden calisir.
    throw new BudgetError(
      "INSUFFICIENT_BUDGET",
      `Rezervler (${reserveTotal}) ve yaklasiklik payi (${approximationMargin}) ` +
        `provider limitini (${inputs.providerContextLimit}) tuketiyor. ` +
        `Sifir butceyle devam etmek, bos context'i basarili bir compile gibi gosterirdi.`,
      { providerContextLimit: inputs.providerContextLimit, reserveTotal, approximationMargin }
    );
  }

  const ceiling = inputs.policyCeiling ?? null;
  const available = ceiling !== null ? Math.min(rawAvailable, ceiling) : rawAvailable;

  return {
    providerContextLimit: inputs.providerContextLimit,
    reserves: inputs.reserves,
    policyCeiling: ceiling,
    available,
    boundBy: ceiling !== null && ceiling < rawAvailable ? "policy_ceiling" : "provider_limit",
    tokenizerApproximate: inputs.tokenizerApproximate,
    approximationMargin
  };
}

/**
 * Varsayılan rezervler.
 *
 * Bu sayılar bir ÜRÜN SABİTİ DEĞİL, provider limiti bilinene kadar
 * kullanılan başlangıç değerleridir. P11 adapter'ları gerçek değerleri
 * (araç tanımlarının gerçek token boyutu, modelin azami çıktısı)
 * bildirdiğinde bunların yerini alacaklar.
 */
export function defaultReserves(providerContextLimit: number): BudgetReserves {
  return {
    systemPrompt: Math.min(5_000, Math.ceil(providerContextLimit * 0.05)),
    toolDefinitions: Math.min(5_000, Math.ceil(providerContextLimit * 0.05)),
    expectedOutput: Math.min(8_000, Math.ceil(providerContextLimit * 0.1)),
    safetyMargin: Math.min(2_000, Math.ceil(providerContextLimit * 0.02))
  };
}
