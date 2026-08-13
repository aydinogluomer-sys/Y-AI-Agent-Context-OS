/**
 * P05 / Y-P05-009 — Graph okuma servisi.
 *
 * ADR-017: burada yetki kontrolü YOK. Yetki `requireProjectScope`'ta
 * verilir; bu katman verilen scope'un sınırları içinde okur.
 *
 * TENANT İZOLASYONU
 *   Traversal'a geçen `organizationId` HER ZAMAN scope'tan gelir, istekten
 *   değil. İstemcinin verdiği bir org kimliğine güvenmek, tek bir query
 *   parametresiyle tenant sınırının aşılması demektir (T-02).
 */

import {
  GraphTraversal,
  type TraversalDb
} from "@y/graph/traversal";
import { GraphInvalidator } from "@y/graph/graph-invalidation";
import { EDGE_KINDS, type EdgeKind, type TraversalDirection, type TraversalResult } from "@y/shared";

export interface Db extends TraversalDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export interface ExpandRequest {
  readonly organizationId: string;
  readonly projectId: string;
  readonly seeds: readonly string[];
  readonly direction?: string;
  readonly depth?: number;
  readonly limit?: number;
  readonly edgeKinds?: readonly string[];
  readonly minConfidence?: number;
  readonly repositoryId?: string;
}

export interface ExpandResponse extends TraversalResult {
  readonly snapshotId: string;
  readonly commitSha: string;
  /**
   * Grafın bu snapshot için tamamlanmış olup olmadığı.
   * Yarım kalmış bir build eksik kenar bırakır; çağıran bunu bilmeli.
   */
  readonly graphComplete: boolean;
  readonly unresolvedImportRatio: number;
}

export class GraphServiceError extends Error {
  constructor(
    readonly code: "NO_READY_SNAPSHOT" | "NO_GRAPH_BUILD" | "INVALID_DIRECTION" | "INVALID_EDGE_KIND",
    message: string
  ) {
    super(message);
    this.name = "GraphServiceError";
  }
}

const DIRECTIONS: readonly TraversalDirection[] = ["forward", "reverse", "both"];

export class GraphService {
  private readonly traversal: GraphTraversal;
  private readonly invalidator: GraphInvalidator;

  constructor(private readonly db: Db) {
    this.traversal = new GraphTraversal(db);
    this.invalidator = new GraphInvalidator(db);
  }

  async expand(request: ExpandRequest): Promise<ExpandResponse> {
    const direction = parseDirection(request.direction);
    const edgeKinds = parseEdgeKinds(request.edgeKinds);

    const snapshot = await this.latestSnapshot(
      request.organizationId,
      request.projectId,
      request.repositoryId
    );
    if (!snapshot) {
      throw new GraphServiceError(
        "NO_READY_SNAPSHOT",
        "Bu projede hazir bir repository snapshot yok. Once ingestion ve index calistirilmali."
      );
    }

    const build = await this.invalidator.lastCompletedBuild(snapshot.id);
    if (!build) {
      // Graf hic uretilmemisse BOS SONUC donmek yaniltici olurdu:
      // "bagimlilik yok" ile "graf yok" ayni sey degil.
      throw new GraphServiceError(
        "NO_GRAPH_BUILD",
        `Snapshot ${snapshot.id} icin tamamlanmis bir graf build'i yok. ` +
          `Bos sonuc dondurmek "bagimlilik yok" gibi okunurdu.`
      );
    }

    const result = await this.traversal.traverse({
      snapshotId: snapshot.id,
      organizationId: request.organizationId,
      seeds: request.seeds,
      direction,
      maxDepth: request.depth,
      maxNodes: request.limit,
      edgeKinds,
      minConfidence: request.minConfidence
    });

    return {
      ...result,
      snapshotId: snapshot.id,
      commitSha: snapshot.commitSha,
      graphComplete: true,
      unresolvedImportRatio: build.unresolvedRatio
    };
  }

  /**
   * Admin rebuild: graf build job'ını kuyruğa alır.
   *
   * Build'in KENDİSİNİ burada çalıştırmayız (ADR-019): büyük bir repo'nun
   * graf inşası HTTP isteğini bloke eder, timeout'a düşer ve yarım kalan
   * iş hiçbir iz bırakmaz. Handler yalnız kuyruğa koyar ve job kimliğini
   * döndürür.
   */
  async requestRebuild(params: {
    organizationId: string;
    projectId: string;
    jobId: string;
    repositoryId?: string;
  }): Promise<{ jobId: string; snapshotId: string }> {
    const snapshot = await this.latestSnapshot(
      params.organizationId,
      params.projectId,
      params.repositoryId
    );
    if (!snapshot) {
      throw new GraphServiceError("NO_READY_SNAPSHOT", "Hazir snapshot yok; graf uretilemez.");
    }

    await this.db.query(
      `INSERT INTO index_jobs
         (id, project_id, organization_id, snapshot_id, job_type, job_phase, status, metadata_json)
       VALUES ($1, $2, $3, $4, 'graph_build', 'graph', 'queued', $5::jsonb)
       ON CONFLICT (id) DO NOTHING;`,
      [
        params.jobId,
        params.projectId,
        params.organizationId,
        snapshot.id,
        JSON.stringify({ trigger: "admin_rebuild" })
      ]
    );

    return { jobId: params.jobId, snapshotId: snapshot.id };
  }

  async buildStatus(
    organizationId: string,
    projectId: string,
    repositoryId?: string
  ): Promise<{
    snapshotId: string | null;
    commitSha: string | null;
    lastBuild: {
      id: string;
      nodeCount: number;
      edgeCount: number;
      unresolvedRatio: number;
    } | null;
  }> {
    const snapshot = await this.latestSnapshot(organizationId, projectId, repositoryId);
    if (!snapshot) return { snapshotId: null, commitSha: null, lastBuild: null };

    return {
      snapshotId: snapshot.id,
      commitSha: snapshot.commitSha,
      lastBuild: await this.invalidator.lastCompletedBuild(snapshot.id)
    };
  }

  private async latestSnapshot(
    organizationId: string,
    projectId: string,
    repositoryId?: string
  ): Promise<{ id: string; commitSha: string } | null> {
    const result = await this.db.query(
      `SELECT s.id, s.commit_sha
         FROM repository_snapshots s
         JOIN repositories r ON r.id = s.repository_id
        WHERE s.organization_id = $1
          AND r.project_id = $2
          AND ($3::text IS NULL OR s.repository_id = $3)
          AND s.status = 'ready'
        ORDER BY s.created_at DESC
        LIMIT 1;`,
      [organizationId, projectId, repositoryId ?? null]
    );
    const row = result.rows[0];
    return row ? { id: row.id, commitSha: row.commit_sha } : null;
  }
}

function parseDirection(value: string | undefined): TraversalDirection {
  if (value === undefined || value === "") return "forward";
  if (!(DIRECTIONS as readonly string[]).includes(value)) {
    throw new GraphServiceError(
      "INVALID_DIRECTION",
      `direction su degerlerden biri olmali: ${DIRECTIONS.join(", ")}`
    );
  }
  return value as TraversalDirection;
}

function parseEdgeKinds(values: readonly string[] | undefined): EdgeKind[] | undefined {
  if (!values || values.length === 0) return undefined;
  for (const value of values) {
    if (!(EDGE_KINDS as readonly string[]).includes(value)) {
      // Bilinmeyen bir edge turunu SESSIZCE yok saymak, cagirana
      // filtrenin uygulandigi izlenimi verirdi.
      throw new GraphServiceError("INVALID_EDGE_KIND", `Bilinmeyen edge turu: ${value}`);
    }
  }
  return values as EdgeKind[];
}
