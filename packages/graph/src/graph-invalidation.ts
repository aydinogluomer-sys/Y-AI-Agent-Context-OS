/**
 * P05 / Y-P05-006 — Artımlı graf güncellemesi.
 *
 * P04'ün `symbol_invalidations` tablosu, bir snapshot'tan diğerine geçerken
 * HANGİ dosyaların neden yeniden ayrıştırıldığını yazıyor. Graf bunu
 * yeniden hesaplamaz, OKUR. Aynı soruyu iki kez, iki farklı yöntemle
 * yanıtlamak er ya da geç iki farklı cevap üretir — ve hangisinin doğru
 * olduğu belli olmaz.
 *
 * KAPSAM
 *   P04 zaten bağımlıları (değişen dosyayı import edenleri) invalidation
 *   listesine dahil ediyor. Graf için gereken kapsam da tam olarak budur:
 *   bir dosyanın node'ları ve o dosyadan ÇIKAN kenarlar yalnız o dosya
 *   yeniden ayrıştırıldığında değişir.
 *
 *   Silinen dosyalar da kapsamdadır: onlara giden kenarlar sahipsiz kalır
 *   ve tombstone bırakılması gerekir.
 *
 * NE ZAMAN TAM BUILD
 *   - Snapshot için invalidation kaydı yok (ilk index).
 *   - Bu snapshot'ın daha önce tamamlanmış bir graf build'i yok — artımlı
 *     güncellenecek bir taban yok.
 *   - Etkilenen dosya oranı eşiği aştı; artımlı yol artık ucuz değil.
 *
 *   Her karar `reason` alanına yazılır. Sessizce tam build'e düşmek,
 *   artımlı yolun hiç çalışmadığını gizleyebilirdi.
 */

export interface InvalidationDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export interface GraphInvalidationPlan {
  readonly mode: "full" | "incremental";
  readonly reason: string;
  /** Yeniden inşa edilecek dosya yolları (artımlı modda). */
  readonly affectedPaths: readonly string[];
  /** Snapshot'taki toplam dosya sayısı — oran buradan hesaplanır. */
  readonly totalPaths: number;
  /**
   * Dokunulan dosya oranı.
   * P05 kabul kriteri: tek dosya değişiminde < 0,02.
   */
  readonly touchRatio: number;
}

export interface PlanParams {
  readonly organizationId: string;
  readonly snapshotId: string;
  /** Bu oranın üstünde tam build daha ucuz. */
  readonly fullRebuildThreshold?: number;
}

const DEFAULT_FULL_REBUILD_THRESHOLD = 0.3;

export class GraphInvalidator {
  constructor(private readonly db: InvalidationDb) {}

  async plan(params: PlanParams): Promise<GraphInvalidationPlan> {
    const threshold = params.fullRebuildThreshold ?? DEFAULT_FULL_REBUILD_THRESHOLD;
    const totalPaths = await this.countFiles(params.snapshotId);

    const hasBaseline = await this.hasCompletedBuild(params.snapshotId);
    if (!hasBaseline) {
      return fullPlan(totalPaths, "bu snapshot icin tamamlanmis graf build'i yok");
    }

    const affected = await this.invalidatedPaths(params);
    if (affected.length === 0) {
      return fullPlan(totalPaths, "invalidation kaydi yok; artimli guncellenecek fark bilinmiyor");
    }

    const ratio = totalPaths > 0 ? affected.length / totalPaths : 1;
    if (ratio > threshold) {
      return fullPlan(
        totalPaths,
        `etkilenen dosya orani %${(ratio * 100).toFixed(1)} > esik %${(threshold * 100).toFixed(1)}`
      );
    }

    return {
      mode: "incremental",
      reason: `${affected.length} dosya etkilendi`,
      affectedPaths: affected,
      totalPaths,
      touchRatio: ratio
    };
  }

  /**
   * Son tamamlanmış build.
   * P06 retrieval bunu kullanır: `status = 'failed'` ya da `'running'` olan
   * bir build'in grafı EKSİK olabilir ve context üretiminde kullanılamaz.
   */
  async lastCompletedBuild(
    snapshotId: string
  ): Promise<{ id: string; nodeCount: number; edgeCount: number; unresolvedRatio: number } | null> {
    const result = await this.db.query(
      `SELECT id, node_count, edge_count, unresolved_imports, total_imports
         FROM graph_build_runs
        WHERE snapshot_id = $1 AND status = 'completed'
        ORDER BY finished_at DESC
        LIMIT 1;`,
      [snapshotId]
    );
    const row = result.rows[0];
    if (!row) return null;

    const total = Number(row.total_imports ?? 0);
    return {
      id: row.id,
      nodeCount: Number(row.node_count ?? 0),
      edgeCount: Number(row.edge_count ?? 0),
      unresolvedRatio: total > 0 ? Number(row.unresolved_imports ?? 0) / total : 0
    };
  }

  private async countFiles(snapshotId: string): Promise<number> {
    const result = await this.db.query(
      `SELECT COUNT(*)::int AS count FROM files WHERE snapshot_id = $1;`,
      [snapshotId]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  private async hasCompletedBuild(snapshotId: string): Promise<boolean> {
    return (await this.lastCompletedBuild(snapshotId)) !== null;
  }

  /**
   * P04'ün yazdığı invalidation izleri.
   *
   * `full_reindex` kaydı varsa artımlı yola girmenin anlamı yoktur: tüm
   * dosyalar yeniden ayrıştırılmış demektir.
   */
  private async invalidatedPaths(params: PlanParams): Promise<string[]> {
    const result = await this.db.query(
      `SELECT path, reason FROM symbol_invalidations
        WHERE to_snapshot_id = $1 AND organization_id = $2;`,
      [params.snapshotId, params.organizationId]
    );

    if (result.rows.some((r) => r.reason === "full_reindex")) return [];
    return result.rows.map((r) => r.path as string);
  }
}

function fullPlan(totalPaths: number, reason: string): GraphInvalidationPlan {
  return {
    mode: "full",
    reason,
    affectedPaths: [],
    totalPaths,
    touchRatio: totalPaths > 0 ? 1 : 0
  };
}
