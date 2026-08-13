/**
 * P06 / Y-P06-011 — Hibrit birleştirme.
 *
 * ESKİ HALİ (P00 Truth Audit)
 *   `mergeScores` (`context/src/index.ts:254-278`) üç sabit ağırlıklı
 *   "strateji" birleştiriyordu: `keyword_bm25_mvp`, `graph_weighted_mvp`,
 *   `hybrid_local_mvp`. Ağırlıklar koda gömülüydü ve stratejilerin
 *   ikisi de iddia ettikleri şeyi yapmıyordu.
 *
 * BİRLEŞTİRME YÖNTEMİ — Reciprocal Rank Fusion
 *   Kanalların ham skorları AYNI ÖLÇEKTE DEĞİLDİR: `ts_rank_cd` sınırsız,
 *   kosinüs benzerliği -1..1, sembol eşleşmesi 0..1. Bunları toplamak ya
 *   da ortalamak, ölçeği büyük olan kanalı sessizce baskın yapar.
 *
 *   RRF sadece SIRAYA bakar: `1 / (k + rank)`. Ölçek sorunu ortadan
 *   kalkar ve bir kanalın tek başına sonucu domine etmesi engellenir.
 *   `k = 60` literatürdeki yaygın değerdir; küçük `k` ilk sıraları aşırı
 *   ödüllendirir.
 *
 *   RRF yalnızca ADAY HAVUZUNU kurar. Nihai sıralama 14 sinyalli
 *   ranker'ındır; bu ikisi karıştırılmamalıdır.
 *
 * DEGRADED DURUMU AÇIKÇA TAŞINIR
 *   Bir kanal çalışmazsa sonuç eksiktir. `degraded: true` ve sebebi
 *   döner; manifest'e (P09) yazılır. Sessizce daha az kanalla devam edip
 *   sonucu tam gibi sunmak, P00'daki `is_fallback_approx` bayrağının
 *   okunmaması hatasının tekrarı olurdu.
 */

import type {
  Candidate,
  RetrievalChannel,
  RetrievalSpec
} from "./types";

export interface ChannelRunner {
  readonly channel: RetrievalChannel;
  search(spec: RetrievalSpec): Promise<Candidate[]>;
}

export interface FusionResult {
  readonly candidates: readonly Candidate[];
  readonly channelsUsed: readonly RetrievalChannel[];
  readonly failures: readonly { channel: RetrievalChannel; reason: string }[];
  readonly degraded: boolean;
  readonly degradedReason: string | null;
}

/** RRF sabiti. Literatürdeki yaygın değer. */
export const RRF_K = 60;

const DEFAULT_POOL_LIMIT = 200;

/**
 * Kanalları çalıştırır ve aday havuzunu kurar.
 *
 * Bir kanalın hatası diğerlerini DÜŞÜRMEZ ama SESSİZCE YUTULMAZ:
 * `failures` listesine yazılır ve `degraded` işaretlenir.
 */
export async function fuseChannels(
  runners: readonly ChannelRunner[],
  spec: RetrievalSpec,
  options: { poolLimit?: number } = {}
): Promise<FusionResult> {
  const poolLimit = Math.min(Math.max(1, options.poolLimit ?? DEFAULT_POOL_LIMIT), 5_000);

  const results = await Promise.all(
    runners.map(async (runner) => {
      try {
        return { channel: runner.channel, candidates: await runner.search(spec), error: null };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return { channel: runner.channel, candidates: [] as Candidate[], error: reason };
      }
    })
  );

  const failures = results
    .filter((r) => r.error !== null)
    .map((r) => ({ channel: r.channel, reason: r.error as string }));
  const channelsUsed = results.filter((r) => r.error === null).map((r) => r.channel);

  const merged = mergeByRrf(results.filter((r) => r.error === null));

  return {
    candidates: merged.slice(0, poolLimit),
    channelsUsed,
    failures,
    degraded: failures.length > 0,
    degradedReason:
      failures.length > 0
        ? failures.map((f) => `${f.channel}: ${f.reason}`).join(" | ")
        : null
  };
}

/**
 * Reciprocal Rank Fusion ile dedup + birleştirme.
 *
 * Aynı chunk birden çok kanaldan gelirse TEK aday olur ve her kanalın
 * ham skoru korunur — sinyal hesaplaması bunlara ihtiyaç duyar. Kanal
 * listesi de birleştirilir: "bu aday hem semantic hem symbol'den geldi"
 * bilgisi açıklamada kullanılır.
 */
export function mergeByRrf(
  results: readonly { channel: RetrievalChannel; candidates: Candidate[] }[]
): Candidate[] {
  const byId = new Map<string, { candidate: Candidate; fusion: number }>();

  for (const { channel, candidates } of results) {
    candidates.forEach((candidate, index) => {
      const contribution = 1 / (RRF_K + index + 1);
      const existing = byId.get(candidate.chunkId);

      if (!existing) {
        byId.set(candidate.chunkId, { candidate, fusion: contribution });
        return;
      }

      byId.set(candidate.chunkId, {
        candidate: {
          ...existing.candidate,
          channels: unique([...existing.candidate.channels, ...candidate.channels]),
          rawScores: { ...existing.candidate.rawScores, ...candidate.rawScores },
          // Sir bayragi HERHANGI bir kaynakta isaretliyse korunur.
          containsSecret: existing.candidate.containsSecret || candidate.containsSecret
        },
        fusion: existing.fusion + contribution
      });

      void channel;
    });
  }

  return [...byId.values()]
    .sort((a, b) => {
      if (b.fusion !== a.fusion) return b.fusion - a.fusion;
      // Kararli siralama: ayni girdi ayni havuzu uretmeli (P09).
      return a.candidate.chunkId.localeCompare(b.candidate.chunkId);
    })
    .map((entry) => entry.candidate);
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/**
 * Firewall ön filtresinin gerçekten uygulandığını doğrular (ADR-027).
 *
 * Bu bir SAVUNMA DERİNLİĞİ kontrolüdür: filtre zaten SQL'de uygulanıyor,
 * ama bir kanal eklendiğinde filtreyi sorgusuna koymayı unutmak kolaydır.
 * Bu fonksiyon havuzu son kez denetler ve ihlali HATA olarak bildirir —
 * sessizce ayıklamaz, çünkü sessiz ayıklama hatanın kendisini gizler.
 */
export function assertFirewallRespected(
  candidates: readonly Candidate[],
  spec: RetrievalSpec
): void {
  const denied = spec.deniedPathPrefixes ?? [];

  for (const candidate of candidates) {
    for (const prefix of denied) {
      if (candidate.path.startsWith(prefix)) {
        throw new Error(
          `Firewall ihlali: '${candidate.path}' DENY kapsaminda ama aday havuzunda. ` +
            `Bir kanal on filtreyi uygulamiyor (ADR-027).`
        );
      }
    }

    if (spec.excludeSecrets && candidate.containsSecret) {
      throw new Error(
        `Sir iceren chunk aday havuzunda: '${candidate.path}' (T-07). ` +
          `Bir kanal contains_secret filtresini uygulamiyor.`
      );
    }
  }
}
