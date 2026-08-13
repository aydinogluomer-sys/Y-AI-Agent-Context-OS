/**
 * P04 / Y-P04-009 — Index worker (TAM YENİDEN YAZIM).
 *
 * ESKİ HALİ NE YAPIYORDU (P00 Truth Audit, `workers/index-worker.ts:55-72`):
 *
 *     private async processJob(job): Promise<number> {
 *       const paths = job.requestedPaths || [];
 *       if (paths.length === 0) {
 *         const listed = await this.request(".../repo/files?root=.&limit=200");
 *         return Array.isArray(listed?.files) ? listed.files.length : 0;
 *       }
 *       for (const path of paths) { await this.request(".../repo/file?path=" + path); processed++; }
 *       return processed;
 *     }
 *
 *   Yani "index job" bir dosya listesi çekiyor ya da dosyaları tek tek
 *   OKUYUP ATIYOR, sonra `processedFiles` olarak dosya sayısını döndürüp
 *   `/complete` çağırıyordu. Hiçbir şey ayrıştırılmıyor, chunk'lanmıyor,
 *   hiçbir yere yazılmıyordu. Job `completed` görünüyordu; `symbols` tablosu
 *   ise zaten yoktu.
 *
 *   Bu, master plan'ın "false green" tanımının ders kitabı örneğidir: iş
 *   yapılmadan başarı raporlanması.
 *
 * YENİ HALİ
 *   claim → snapshot + dosya listesi → artımlı plan → değişmeyenleri
 *   kopyala → değişenleri ayrıştır → `symbols` + `chunks` YAZ → kanıtla
 *   birlikte tamamla.
 *
 * EN ÖNEMLİ DEĞİŞİKLİK — `assertRealWork`:
 *   Bir job, kalıcı yazım kanıtı olmadan `completed` olamaz. Ayrıştırılabilir
 *   dosya varken sıfır sembol ve sıfır chunk yazıldıysa job BAŞARISIZ olur.
 *   Eski davranışın bir daha sessizce geri gelmesini engelleyen şey budur;
 *   `index-worker.test.ts` bunu negatif testle kilitler.
 *
 * `processedFiles` alanı bilerek KALDIRILDI. Adı "işlenen dosya" diyordu ama
 * anlamı "sayılan dosya"ydı. Yerine gerçekten yazılan satırları raporlayan
 * alanlar geldi (`symbolsWritten`, `chunksWritten`).
 */

import { pathToFileURL } from "node:url";
import {
  IncrementalIndexPlanner,
  ParserRegistry,
  SymbolIndexer,
  createDefaultRegistry,
  type FileToIndex,
  type IncrementalPlan,
  type RepositoryAdapter
} from "@y/core";

export interface WorkerDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export interface ClaimedJob {
  readonly id: string;
  readonly projectId: string;
  readonly organizationId: string;
  readonly snapshotId: string | null;
  readonly jobPhase: string;
  readonly attempts: number;
  readonly maxAttempts: number;
}

export interface SnapshotRow {
  readonly id: string;
  readonly repositoryId: string;
  readonly organizationId: string;
  readonly commitSha: string;
  readonly status: string;
}

export interface IndexWorkerRunResult {
  readonly claimed: boolean;
  readonly jobId: string | null;
  readonly status: "idle" | "completed" | "failed" | "retry";
  readonly mode: "full" | "incremental" | null;
  readonly planReason: string | null;
  /** Gerçekten ayrıştırılan dosya sayısı. */
  readonly filesParsed: number;
  /** Önceki snapshot'tan kopyalanan dosya sayısı (ayrıştırılmadı). */
  readonly filesCarriedOver: number;
  readonly symbolsWritten: number;
  readonly symbolsCarriedOver: number;
  readonly chunksWritten: number;
  readonly chunksCarriedOver: number;
  /** Tam re-index'e kıyasla yapılan ayrıştırma işinin oranı. */
  readonly workRatio: number;
  readonly failures: readonly { path: string; reason: string }[];
  readonly error: string | null;
}

export interface IndexWorkerOptions {
  readonly db: WorkerDb;
  readonly workerId: string;
  /** Job'ın snapshot'ına karşılık gelen adapter'ı açar. */
  readonly openAdapter: (job: ClaimedJob, snapshot: SnapshotRow) => Promise<RepositoryAdapter>;
  readonly registry?: ParserRegistry;
  readonly planner?: IncrementalIndexPlanner;
  readonly indexer?: SymbolIndexer;
  readonly pollIntervalMs?: number;
  readonly parseTimeoutMs?: number;
}

/**
 * "İş yapıldı" iddiasının kanıtı yoksa fırlatılır.
 * Bu hata sınıfı P00 bulgusunun kalıcı bekçisidir.
 */
export class NoRealWorkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoRealWorkError";
  }
}

const IDLE: IndexWorkerRunResult = {
  claimed: false,
  jobId: null,
  status: "idle",
  mode: null,
  planReason: null,
  filesParsed: 0,
  filesCarriedOver: 0,
  symbolsWritten: 0,
  symbolsCarriedOver: 0,
  chunksWritten: 0,
  chunksCarriedOver: 0,
  workRatio: 0,
  failures: [],
  error: null
};

export class IndexWorker {
  private readonly db: WorkerDb;
  private readonly registry: ParserRegistry;
  private readonly planner: IncrementalIndexPlanner;
  private readonly indexer: SymbolIndexer;
  private stopped = false;

  constructor(private readonly options: IndexWorkerOptions) {
    if (!options.workerId) {
      throw new Error("Index worker bir workerId gerektirir (kuyruk sahipligi icin).");
    }
    this.db = options.db;
    this.registry = options.registry ?? createDefaultRegistry();
    this.planner = options.planner ?? new IncrementalIndexPlanner(this.db);
    this.indexer = options.indexer ?? new SymbolIndexer(this.db, this.registry);
  }

  stop(): void {
    this.stopped = true;
  }

  async runOnce(): Promise<IndexWorkerRunResult> {
    const job = await this.claimNext();
    if (!job) return IDLE;

    let adapter: RepositoryAdapter | null = null;
    try {
      const snapshot = await this.loadSnapshot(job);
      adapter = await this.options.openAdapter(job, snapshot);
      await adapter.connect();

      const result = await this.indexJob(job, snapshot, adapter);
      await this.completeJob(job, result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = await this.failJob(job, message);
      return { ...IDLE, claimed: true, jobId: job.id, status, error: message };
    } finally {
      if (adapter) {
        // Baglanti sizintisi worker'i uzun vadede dusurur; hata olsa da kapat.
        await adapter.disconnect().catch(() => undefined);
      }
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

  /**
   * İşin kendisi. Ayrı bir metot olması, testin adapter/DB üzerinden
   * gerçekten yazım yapıldığını doğrulayabilmesi içindir.
   */
  private async indexJob(
    job: ClaimedJob,
    snapshot: SnapshotRow,
    adapter: RepositoryAdapter
  ): Promise<IndexWorkerRunResult> {
    await this.registry.initialize();

    const files = await this.loadFiles(snapshot.id);
    const currentPaths = files.map((f) => f.path);

    const planParams = {
      organizationId: snapshot.organizationId,
      repositoryId: snapshot.repositoryId,
      toSnapshotId: snapshot.id,
      toCommitSha: snapshot.commitSha,
      currentPaths,
      parserVersions: this.registry.versions()
    };

    const plan = await this.planner.plan(adapter, planParams);
    const previous = await this.planner.findPrevious(snapshot.repositoryId, snapshot.id);

    const carried = await this.planner.carryOver(plan, {
      fromSnapshotId: previous?.id,
      toSnapshotId: snapshot.id,
      toCommitSha: snapshot.commitSha,
      repositoryId: snapshot.repositoryId
    });

    const toParse = selectFilesToParse(files, plan);
    const indexed = await this.indexer.indexSnapshot(adapter, toParse, {
      organizationId: snapshot.organizationId,
      repositoryId: snapshot.repositoryId,
      snapshotId: snapshot.id,
      commitSha: snapshot.commitSha,
      parseTimeoutMs: this.options.parseTimeoutMs
    });

    await this.planner.record(plan, { ...planParams, fromSnapshotId: previous?.id ?? null });

    const result: IndexWorkerRunResult = {
      claimed: true,
      jobId: job.id,
      status: "completed",
      mode: plan.mode,
      planReason: plan.reason,
      filesParsed: indexed.filesProcessed,
      filesCarriedOver: plan.filesToCarryOver.length,
      symbolsWritten: indexed.symbolsWritten,
      symbolsCarriedOver: carried.symbols,
      chunksWritten: indexed.chunksWritten,
      chunksCarriedOver: carried.chunks,
      workRatio: plan.workRatio,
      failures: indexed.failures,
      error: null
    };

    assertRealWork(result, toParse.length);
    return result;
  }

  /**
   * Kuyruktan tek job alır.
   *
   * `FOR UPDATE SKIP LOCKED`: birden çok worker aynı anda çalıştığında aynı
   * job iki kez alınmaz. Eski akış bunu API'ye devrediyordu; kuyruk
   * sahipliği artık veritabanında, tek yerde.
   */
  private async claimNext(): Promise<ClaimedJob | null> {
    const result = await this.db.query(
      `UPDATE index_jobs
          SET status = 'running',
              locked_by = $1,
              locked_at = NOW(),
              attempts = attempts + 1,
              updated_at = NOW()
        WHERE id = (
          SELECT id FROM index_jobs
           WHERE status = 'queued'
           ORDER BY created_at
           FOR UPDATE SKIP LOCKED
           LIMIT 1
        )
        RETURNING id, project_id, organization_id, snapshot_id, job_phase, attempts, max_attempts;`,
      [this.options.workerId]
    );

    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      projectId: row.project_id,
      organizationId: row.organization_id,
      snapshotId: row.snapshot_id,
      jobPhase: row.job_phase,
      attempts: Number(row.attempts ?? 0),
      maxAttempts: Number(row.max_attempts ?? 3)
    };
  }

  private async loadSnapshot(job: ClaimedJob): Promise<SnapshotRow> {
    if (!job.snapshotId) {
      // Snapshot'siz bir index job'i hangi commit'i index'leyecegini bilmez.
      // Eski akis bunu sormuyordu bile; "guncel calisma dizini" varsayiyordu.
      throw new Error(`Job ${job.id} bir snapshot'a bagli degil; index'lenecek commit belirsiz.`);
    }

    const result = await this.db.query(
      `SELECT id, repository_id, organization_id, commit_sha, status
         FROM repository_snapshots WHERE id = $1;`,
      [job.snapshotId]
    );
    const row = result.rows[0];
    if (!row) throw new Error(`Snapshot bulunamadi: ${job.snapshotId}`);
    if (row.status === "failed") {
      throw new Error(`Snapshot ${row.id} failed durumda; index'lenemez.`);
    }

    return {
      id: row.id,
      repositoryId: row.repository_id,
      organizationId: row.organization_id,
      commitSha: row.commit_sha,
      status: row.status
    };
  }

  private async loadFiles(snapshotId: string): Promise<FileToIndex[]> {
    const result = await this.db.query(
      `SELECT id, path, language, is_binary, size_bytes
         FROM files WHERE snapshot_id = $1 ORDER BY path;`,
      [snapshotId]
    );
    return result.rows.map((row) => ({
      fileId: row.id,
      path: row.path,
      language: row.language ?? null,
      isBinary: Boolean(row.is_binary),
      sizeBytes: Number(row.size_bytes ?? 0)
    }));
  }

  private async completeJob(job: ClaimedJob, result: IndexWorkerRunResult): Promise<void> {
    // metadata_json'a KANIT yazilir: kac sembol, kac chunk, hangi modda.
    // "resultCount" tek basina dosya sayisi kadar anlamsizdi.
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
          mode: result.mode,
          planReason: result.planReason,
          filesParsed: result.filesParsed,
          filesCarriedOver: result.filesCarriedOver,
          symbolsWritten: result.symbolsWritten,
          symbolsCarriedOver: result.symbolsCarriedOver,
          chunksWritten: result.chunksWritten,
          chunksCarriedOver: result.chunksCarriedOver,
          workRatio: result.workRatio,
          failures: result.failures.slice(0, 50)
        })
      ]
    );
  }

  /**
   * Başarısız job: denemeler tükenmediyse kuyruğa geri döner.
   * `attempts` claim sırasında artırıldığı için sonsuz döngü oluşmaz —
   * `max_attempts` sayısı kadar denenir, sonra `failed` olur.
   */
  private async failJob(job: ClaimedJob, message: string): Promise<"failed" | "retry"> {
    const willRetry = job.attempts < job.maxAttempts;
    await this.db.query(
      `UPDATE index_jobs
          SET status = $2,
              last_error = $3,
              locked_by = NULL,
              locked_at = NULL,
              updated_at = NOW()
        WHERE id = $1;`,
      [job.id, willRetry ? "queued" : "failed", message.slice(0, 2000)]
    );
    return willRetry ? "retry" : "failed";
  }
}

/** Plana göre hangi dosyaların gerçekten ayrıştırılacağını seçer. */
export function selectFilesToParse(files: readonly FileToIndex[], plan: IncrementalPlan): FileToIndex[] {
  if (plan.mode === "full") return [...files];
  const parseSet = new Set(plan.filesToParse);
  return files.filter((f) => parseSet.has(f.path));
}

/**
 * Kalıcı yazım kanıtı yoksa job tamamlanamaz.
 *
 * KURAL: ayrıştırılacak dosya varsa, sonuçta sembol VEYA chunk yazılmış
 * olmalıdır. İkisi de sıfırsa yapılan iş "dosya okuyup atmak"tır — P00'da
 * bulunan davranışın ta kendisi.
 *
 * NEDEN "sembol VEYA chunk" ve neden yalnız sembol değil:
 *   Semboller içermeyen ama meşru bir dosya vardır (düz metin, veri
 *   dosyası). Böyle bir dosyada chunk yazılır, sembol yazılmaz. Kuralı
 *   "sembol zorunlu" yapmak bu dosyaları yanlışlıkla hata sayardı — yani
 *   yanlış KIRMIZI üretirdi. Yanlış yeşil kadar zararlı olmasa da doğru
 *   değildir.
 *
 * Ayrıştırılacak dosya YOKSA (boş repo ya da tamamı kopyalanan artımlı
 * çalıştırma) kural uygulanmaz; bu durumda `filesParsed = 0` raporlanır ve
 * bu dürüst bir sonuçtur.
 */
export function assertRealWork(result: IndexWorkerRunResult, eligibleFileCount: number): void {
  if (eligibleFileCount === 0) return;

  if (result.filesParsed === 0) {
    throw new NoRealWorkError(
      `Job ${result.jobId}: ${eligibleFileCount} dosya ayristirilacakti, hicbiri islenemedi. ` +
        `Ilk hatalar: ${describeFailures(result.failures)}`
    );
  }

  if (result.symbolsWritten === 0 && result.chunksWritten === 0) {
    throw new NoRealWorkError(
      `Job ${result.jobId}: ${result.filesParsed} dosya islendi ama hicbir sembol ya da chunk ` +
        `yazilmadi. Kalici yazim kaniti olmadan job 'completed' olamaz (P00 bulgusu).`
    );
  }
}

function describeFailures(failures: readonly { path: string; reason: string }[]): string {
  if (failures.length === 0) return "(kayitli hata yok)";
  return failures
    .slice(0, 3)
    .map((f) => `${f.path}: ${f.reason}`)
    .join(" | ");
}

async function main(): Promise<void> {
  const { Pool } = await import("pg");
  const { WorkspaceManager, LocalRepositoryAdapter } = await import("@y/core");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL gerekli. Index worker dogrudan veritabanina yazar (ADR-019).");
  }

  const workspaceRoot = process.env.Y_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error("Y_WORKSPACE_ROOT gerekli. Repo koku kullanicidan alinmaz, hesaplanir (ADR-018).");
  }

  const pool = new Pool({ connectionString });
  const workspace = new WorkspaceManager(workspaceRoot);

  const worker = new IndexWorker({
    db: pool,
    workerId: process.env.INDEX_WORKER_ID || `index-worker-${process.pid}`,
    pollIntervalMs: Number(process.env.INDEX_WORKER_POLL_MS || 2_000),
    async openAdapter(job, snapshot) {
      // Repo koku KULLANICIDAN gelmez; WorkspaceManager hesaplar (ADR-018).
      const location = workspace.locate(snapshot.organizationId, job.projectId, snapshot.repositoryId);
      return new LocalRepositoryAdapter(location.absolutePath);
    }
  });

  process.once("SIGINT", () => worker.stop());
  process.once("SIGTERM", () => worker.stop());

  try {
    if (process.env.INDEX_WORKER_RUN_ONCE === "true") {
      const result = await worker.runOnce();
      console.log(JSON.stringify(result));
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
