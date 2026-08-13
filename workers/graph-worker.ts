/**
 * P05 / Y-P05-008 — Graph worker.
 *
 * P00 Truth Audit: graf senkronizasyonu YALNIZ elle tetikleniyordu
 * (`POST /projects/:id/graph/sync`). Hiçbir şey otomatik çalıştırmıyordu.
 * Sonuç: index güncellenip graf güncellenmiyordu ve kimse fark etmiyordu —
 * çünkü grafın bayat olduğunu söyleyen bir sinyal yoktu.
 *
 * Artık graf build bir JOB'dır ve index job'ı tamamlanınca kuyruğa girer.
 * Elle tetikleme kalır ama admin yetkisi ister; normal akış otomatiktir.
 *
 * TASARIM — index worker ile aynı iskelet
 *   Aynı kuyruk tablosu (`index_jobs`), aynı `FOR UPDATE SKIP LOCKED`
 *   claim'i, aynı retry mantığı. İki farklı kuyruk mekanizması tutmak,
 *   birinde düzeltilen hatanın diğerinde kalması demektir.
 *
 * KANIT ZORUNLULUĞU
 *   Index worker'daki `assertRealWork`'ün graf karşılığı burada da var:
 *   dosyası olan bir snapshot için sıfır node üretildiyse job `completed`
 *   olamaz. Boş bir graf "bağımlılık yok" gibi okunur ve Change
 *   Firewall'ı (P10) yanlış yönlendirir.
 */

import { pathToFileURL } from "node:url";
import { GraphBuilder, type BuildResult } from "@y/graph/builder";
import { GraphInvalidator } from "@y/graph/graph-invalidation";

export interface WorkerDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export interface ClaimedGraphJob {
  readonly id: string;
  readonly projectId: string;
  readonly organizationId: string;
  readonly snapshotId: string | null;
  readonly attempts: number;
  readonly maxAttempts: number;
}

export interface GraphWorkerRunResult {
  readonly claimed: boolean;
  readonly jobId: string | null;
  readonly status: "idle" | "completed" | "failed" | "retry";
  readonly mode: "full" | "incremental" | null;
  readonly planReason: string | null;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly tombstoneCount: number;
  readonly unresolvedRatio: number;
  readonly touchRatio: number;
  readonly durationMs: number;
  readonly error: string | null;
}

export interface GraphWorkerOptions {
  readonly db: WorkerDb;
  readonly workerId: string;
  readonly builder?: GraphBuilder;
  readonly invalidator?: GraphInvalidator;
  readonly pollIntervalMs?: number;
  /**
   * Çözülemeyen import oranı bu eşiği aşarsa build tamamlanır ama
   * `degraded` işaretlenir. Sessizce geçmek, zayıf bir grafın sağlam
   * görünmesi demektir.
   */
  readonly unresolvedRatioThreshold?: number;
}

export class EmptyGraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmptyGraphError";
  }
}

const IDLE: GraphWorkerRunResult = {
  claimed: false,
  jobId: null,
  status: "idle",
  mode: null,
  planReason: null,
  nodeCount: 0,
  edgeCount: 0,
  tombstoneCount: 0,
  unresolvedRatio: 0,
  touchRatio: 0,
  durationMs: 0,
  error: null
};

const DEFAULT_UNRESOLVED_THRESHOLD = 0.4;

export class GraphWorker {
  private readonly db: WorkerDb;
  private readonly builder: GraphBuilder;
  private readonly invalidator: GraphInvalidator;
  private stopped = false;

  constructor(private readonly options: GraphWorkerOptions) {
    if (!options.workerId) {
      throw new Error("Graph worker bir workerId gerektirir (kuyruk sahipligi icin).");
    }
    this.db = options.db;
    this.builder = options.builder ?? new GraphBuilder(this.db);
    this.invalidator = options.invalidator ?? new GraphInvalidator(this.db);
  }

  stop(): void {
    this.stopped = true;
  }

  async runOnce(): Promise<GraphWorkerRunResult> {
    const job = await this.claimNext();
    if (!job) return IDLE;

    try {
      const snapshot = await this.loadSnapshot(job);
      const plan = await this.invalidator.plan({
        organizationId: snapshot.organizationId,
        snapshotId: snapshot.id
      });

      const build = await this.builder.build({
        organizationId: snapshot.organizationId,
        projectId: job.projectId,
        repositoryId: snapshot.repositoryId,
        snapshotId: snapshot.id,
        onlyPaths: plan.mode === "incremental" ? plan.affectedPaths : undefined
      });

      assertGraphNotEmpty(build, plan.mode, snapshot.fileCount);

      const result: GraphWorkerRunResult = {
        claimed: true,
        jobId: job.id,
        status: "completed",
        mode: build.mode,
        planReason: plan.reason,
        nodeCount: build.nodeCount,
        edgeCount: build.edgeCount,
        tombstoneCount: build.tombstoneCount,
        unresolvedRatio: build.unresolvedRatio,
        touchRatio: plan.touchRatio,
        durationMs: build.durationMs,
        error: null
      };

      await this.completeJob(job, result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = await this.failJob(job, message);
      return { ...IDLE, claimed: true, jobId: job.id, status, error: message };
    }
  }

  async run(): Promise<void> {
    const interval = Math.max(250, this.options.pollIntervalMs ?? 2_000);
    while (!this.stopped) {
      await this.runOnce();
      if (!this.stopped) {
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    }
  }

  /** Çözülemeyen import oranı eşiği — sağlık raporu için. */
  isDegraded(result: GraphWorkerRunResult): boolean {
    const threshold = this.options.unresolvedRatioThreshold ?? DEFAULT_UNRESOLVED_THRESHOLD;
    return result.unresolvedRatio > threshold;
  }

  private async claimNext(): Promise<ClaimedGraphJob | null> {
    const result = await this.db.query(
      `UPDATE index_jobs
          SET status = 'running',
              locked_by = $1,
              locked_at = NOW(),
              attempts = attempts + 1,
              updated_at = NOW()
        WHERE id = (
          SELECT id FROM index_jobs
           WHERE status = 'queued' AND job_phase = 'graph'
           ORDER BY created_at
           FOR UPDATE SKIP LOCKED
           LIMIT 1
        )
        RETURNING id, project_id, organization_id, snapshot_id, attempts, max_attempts;`,
      [this.options.workerId]
    );

    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      projectId: row.project_id,
      organizationId: row.organization_id,
      snapshotId: row.snapshot_id,
      attempts: Number(row.attempts ?? 0),
      maxAttempts: Number(row.max_attempts ?? 3)
    };
  }

  private async loadSnapshot(job: ClaimedGraphJob): Promise<{
    id: string;
    repositoryId: string;
    organizationId: string;
    fileCount: number;
  }> {
    if (!job.snapshotId) {
      throw new Error(`Job ${job.id} bir snapshot'a bagli degil; graf hangi commit'e ait olacak belirsiz.`);
    }

    const result = await this.db.query(
      `SELECT s.id, s.repository_id, s.organization_id, s.status,
              (SELECT COUNT(*)::int FROM files f WHERE f.snapshot_id = s.id) AS file_count
         FROM repository_snapshots s WHERE s.id = $1;`,
      [job.snapshotId]
    );

    const row = result.rows[0];
    if (!row) throw new Error(`Snapshot bulunamadi: ${job.snapshotId}`);
    if (row.status !== "ready") {
      throw new Error(`Snapshot ${row.id} '${row.status}' durumda; graf uretilemez.`);
    }

    return {
      id: row.id,
      repositoryId: row.repository_id,
      organizationId: row.organization_id,
      fileCount: Number(row.file_count ?? 0)
    };
  }

  private async completeJob(job: ClaimedGraphJob, result: GraphWorkerRunResult): Promise<void> {
    await this.db.query(
      `UPDATE index_jobs
          SET status = 'completed',
              last_error = NULL,
              locked_by = NULL,
              locked_at = NULL,
              metadata_json = metadata_json || $2::jsonb,
              updated_at = NOW()
        WHERE id = $1;`,
      [
        job.id,
        JSON.stringify({
          graphMode: result.mode,
          planReason: result.planReason,
          nodeCount: result.nodeCount,
          edgeCount: result.edgeCount,
          tombstoneCount: result.tombstoneCount,
          unresolvedRatio: result.unresolvedRatio,
          touchRatio: result.touchRatio,
          degraded: this.isDegraded(result)
        })
      ]
    );
  }

  private async failJob(job: ClaimedGraphJob, message: string): Promise<"failed" | "retry"> {
    const willRetry = job.attempts < job.maxAttempts;
    await this.db.query(
      `UPDATE index_jobs
          SET status = $2, last_error = $3, locked_by = NULL, locked_at = NULL, updated_at = NOW()
        WHERE id = $1;`,
      [job.id, willRetry ? "queued" : "failed", message.slice(0, 2000)]
    );
    return willRetry ? "retry" : "failed";
  }
}

/**
 * Dosyası olan bir snapshot için boş graf üretilemez.
 *
 * Artımlı modda kural uygulanmaz: etkilenen dosya kümesi boşsa hiç node
 * üretilmemesi doğrudur ve bu bir hata değildir.
 */
export function assertGraphNotEmpty(
  build: BuildResult,
  mode: "full" | "incremental",
  fileCount: number
): void {
  if (mode === "incremental") return;
  if (fileCount === 0) return;

  if (build.nodeCount === 0) {
    throw new EmptyGraphError(
      `Snapshot'ta ${fileCount} dosya var ama hicbir graf node'u uretilmedi. ` +
        `Bos bir graf "bagimlilik yok" gibi okunur ve Change Firewall'i yanlis yonlendirir.`
    );
  }
}

/** Index job'ı bitince graf job'ını kuyruğa alır (otomatik tetikleme). */
export async function enqueueGraphJob(
  db: WorkerDb,
  params: { jobId: string; organizationId: string; projectId: string; snapshotId: string }
): Promise<void> {
  await db.query(
    `INSERT INTO index_jobs
       (id, project_id, organization_id, snapshot_id, job_type, job_phase, status, metadata_json)
     VALUES ($1, $2, $3, $4, 'graph_build', 'graph', 'queued', '{}'::jsonb)
     ON CONFLICT (id) DO NOTHING;`,
    [params.jobId, params.projectId, params.organizationId, params.snapshotId]
  );
}

async function main(): Promise<void> {
  const { Pool } = await import("pg");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL gerekli. Graph worker dogrudan veritabanina yazar (ADR-019).");
  }

  const pool = new Pool({ connectionString });
  const worker = new GraphWorker({
    db: pool,
    workerId: process.env.GRAPH_WORKER_ID || `graph-worker-${process.pid}`,
    pollIntervalMs: Number(process.env.GRAPH_WORKER_POLL_MS || 2_000)
  });

  process.once("SIGINT", () => worker.stop());
  process.once("SIGTERM", () => worker.stop());

  try {
    if (process.env.GRAPH_WORKER_RUN_ONCE === "true") {
      console.log(JSON.stringify(await worker.runOnce()));
      return;
    }
    await worker.run();
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
