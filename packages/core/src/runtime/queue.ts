/**
 * P12 / Y-P12-003 — Genel iş kuyruğu (ADR-004).
 *
 * P00 Truth Audit: genel bir kuyruk YOKTU. `index_jobs` için
 * `FOR UPDATE SKIP LOCKED` örüntüsü vardı ve DOĞRUYDU — ama yalnız
 * index işleri için. Diğer her şey (context compile, run execute,
 * quality gate) senkron HTTP içinde ya da hiç çalışmıyordu.
 *
 * NEDEN POSTGRES, NEDEN REDIS/SQS DEĞİL (ADR-004)
 *   İş kuyruğunu ayrı bir sisteme koymak, iş durumu ile veri durumunu
 *   iki ayrı transaction sınırına böler. "İş tamamlandı" yazıldı ama
 *   sonuç yazılamadı (ya da tersi) durumu ortaya çıkar ve bunu
 *   çözmenin yolu dağıtık transaction ya da uzlaşma (reconciliation)
 *   mantığıdır — ikisi de bu ölçekte gereksiz karmaşıklık.
 *
 *   `SKIP LOCKED` ile Postgres kuyruğu, iş ve sonucu AYNI transaction'da
 *   tutar.
 *
 * ÇÖKME KURTARMA
 *   Bir worker lease'ini yenilemeden çökerse, işi başka bir worker
 *   `stale` olarak geri alır. Lease süresi dolmuş bir iş sonsuza kadar
 *   `running` kalmaz.
 */

import { newId } from "@y/shared";
import { verifyWorkerCredential, type WorkerIdentity } from "@y/security";

export const JOB_TYPES = [
  "context-compile",
  "run-execute",
  "quality-gate",
  "index",
  "embed",
  "graph"
] as const;

export type JobType = (typeof JOB_TYPES)[number];
export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface QueueDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export interface EnqueueInput {
  readonly organizationId: string;
  readonly projectId: string | null;
  readonly jobType: JobType;
  readonly runId: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
  /** Aynı anahtarla ikinci bir iş kuyruğa GİRMEZ. */
  readonly idempotencyKey: string;
  readonly maxAttempts?: number;
  readonly priority?: number;
}

export interface ClaimedJob {
  readonly id: string;
  readonly jobType: JobType;
  readonly organizationId: string;
  readonly projectId: string | null;
  readonly runId: string | null;
  readonly payload: Record<string, unknown>;
  readonly attempt: number;
  readonly maxAttempts: number;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_LEASE_SECONDS = 300;

export class JobQueue {
  /**
   * [P17 / T-15] `signingKey` ZORUNLUDUR.
   *
   * Opsiyonel yapmak, "anahtar yoksa dogrulamayi atla" davranisini
   * kacinilmaz kilardi — ve o davranis, korumanin kendisini opsiyonel
   * yapar: T-15 kapatilmis gorunur, acik kalir. Anahtarsiz kuyruk
   * calistirilamaz (fail closed).
   */
  constructor(
    private readonly db: QueueDb,
    private readonly signingKey: string,
    private readonly leaseSeconds: number = DEFAULT_LEASE_SECONDS
  ) {}

  /**
   * İşi kuyruğa alır (idempotent).
   *
   * `ON CONFLICT DO NOTHING`: aynı anahtarla ikinci çağrı yeni iş
   * üretmez. Bu, bir HTTP isteğinin iki kez gelmesi durumunda iki
   * compile başlamasını engeller.
   */
  async enqueue(input: EnqueueInput): Promise<{ jobId: string; created: boolean }> {
    const id = newId("job");

    const result = await this.db.query(
      `INSERT INTO jobs
         (id, organization_id, project_id, job_type, run_id, payload_json,
          idempotency_key, status, attempt, max_attempts, priority)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'queued', 0, $8, $9)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id;`,
      [
        id,
        input.organizationId,
        input.projectId,
        input.jobType,
        input.runId,
        JSON.stringify(input.payload),
        input.idempotencyKey,
        input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
        input.priority ?? 0
      ]
    );

    if (result.rows.length > 0) return { jobId: result.rows[0].id, created: true };

    const existing = await this.db.query(`SELECT id FROM jobs WHERE idempotency_key = $1;`, [
      input.idempotencyKey
    ]);
    return { jobId: existing.rows[0]?.id ?? id, created: false };
  }

  /**
   * Sıradaki işi alır.
   *
   * `FOR UPDATE SKIP LOCKED`: birden çok worker aynı anda çalıştığında
   * aynı iş iki kez alınmaz ve bekleyen worker'lar bloklanmaz.
   *
   * Aynı sorgu ZAMAN AŞIMINA UĞRAMIŞ işleri de geri alır: bir worker
   * lease'ini yenilemeden çöktüyse, işi başka biri devralır. Aksi halde
   * iş sonsuza kadar `running` kalırdı.
   *
   * ## [P17 / T-15] KİMLİK BURADA DOĞRULANIR
   *
   * Önceki imza `claim(workerId: string, ...)` idi ve **herhangi bir
   * dizeyi** worker kimliği olarak kabul ediyordu. Kuyruk API'sine ulaşan
   * biri kendini var olan bir worker gibi tanıtıp bekleyen işleri üzerine
   * alabilirdi. Çalınan iş bir agent run'ıdır: manifest'e, boundary'ye ve
   * yazma yetkisine erişim demektir.
   *
   * Doğrulama **claim noktasındadır**, worker başlangıcında değil:
   * başlangıçta doğrulanan bir kimlik, süresi dolduktan sonra da iş almaya
   * devam ederdi (ADR-039'un kuyruk yüzeyindeki karşılığı).
   *
   * `jobTypes` ayrıca kimliğe karşı kontrol edilir: geçerli bir kimlik,
   * HER işi alma yetkisi değildir. Index worker'ının `run-execute`
   * alması, kimliği doğru olsa bile yetki aşımıdır.
   */
  async claim(
    credential: string,
    jobTypes: readonly JobType[]
  ): Promise<ClaimedJob | null> {
    let identity: WorkerIdentity;
    for (const jobType of jobTypes) {
      // Talep edilen HER tur icin ayri kontrol: bir turu almaya yetkili
      // olmak, digerlerini almaya yetki vermez.
      identity = verifyWorkerCredential(credential, this.signingKey, {
        requiredJobType: jobType
      });
    }
    identity = verifyWorkerCredential(credential, this.signingKey);
    const workerId = identity.workerId;

    const result = await this.db.query(
      `UPDATE jobs
          SET status = 'running',
              locked_by = $1,
              locked_at = NOW(),
              lease_expires_at = NOW() + ($3 || ' seconds')::interval,
              attempt = attempt + 1,
              updated_at = NOW()
        WHERE id = (
          SELECT id FROM jobs
           WHERE job_type = ANY($2::text[])
             AND (
               status = 'queued'
               -- Cokme kurtarma: lease suresi dolmus is geri alinir.
               OR (status = 'running' AND lease_expires_at < NOW())
             )
             AND attempt < max_attempts
           ORDER BY priority DESC, created_at
           FOR UPDATE SKIP LOCKED
           LIMIT 1
        )
        RETURNING id, job_type, organization_id, project_id, run_id, payload_json, attempt, max_attempts;`,
      [workerId, [...jobTypes], String(this.leaseSeconds)]
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id,
      jobType: row.job_type as JobType,
      organizationId: row.organization_id,
      projectId: row.project_id ?? null,
      runId: row.run_id ?? null,
      payload: typeof row.payload_json === "object" && row.payload_json !== null ? row.payload_json : {},
      attempt: Number(row.attempt ?? 1),
      maxAttempts: Number(row.max_attempts ?? DEFAULT_MAX_ATTEMPTS)
    };
  }

  /**
   * Lease yenileme.
   *
   * Uzun süren bir iş, lease'ini periyodik yenilemelidir; aksi halde
   * hâlâ çalışırken başka bir worker tarafından devralınır.
   */
  /**
   * [P17 / T-15] Lease yenileme de kimlik ister.
   *
   * Yenileme doğrulanmazsa, saldırgan başka bir worker'ın lease'ini
   * süresiz uzatarak işi rehin alabilir — ya da tersine, çöken bir
   * worker'ın işini kurtarma mekanizmasını bloklayabilir.
   */
  async renewLease(jobId: string, credential: string): Promise<boolean> {
    const workerId = verifyWorkerCredential(credential, this.signingKey).workerId;
    const result = await this.db.query(
      `UPDATE jobs
          SET lease_expires_at = NOW() + ($3 || ' seconds')::interval, updated_at = NOW()
        WHERE id = $1 AND locked_by = $2 AND status = 'running'
        RETURNING id;`,
      [jobId, workerId, String(this.leaseSeconds)]
    );
    // `false` donerse is baskasi tarafindan devralinmis demektir; cagiran
    // calismayi DURDURMALIDIR, aksi halde iki worker ayni isi yapar.
    return result.rows.length > 0;
  }

  async complete(jobId: string, result: Readonly<Record<string, unknown>>): Promise<void> {
    await this.db.query(
      `UPDATE jobs
          SET status = 'completed', locked_by = NULL, lease_expires_at = NULL,
              result_json = $2::jsonb, finished_at = NOW(), updated_at = NOW()
        WHERE id = $1;`,
      [jobId, JSON.stringify(result)]
    );
  }

  /**
   * Başarısız iş.
   *
   * Deneme hakkı kaldıysa kuyruğa döner; bittiyse `failed`. `attempt`
   * claim sırasında artırıldığı için sonsuz döngü oluşmaz.
   */
  async fail(jobId: string, error: string): Promise<"retry" | "failed"> {
    const result = await this.db.query(
      `UPDATE jobs
          SET status = CASE WHEN attempt < max_attempts THEN 'queued' ELSE 'failed' END,
              locked_by = NULL,
              lease_expires_at = NULL,
              last_error = $2,
              finished_at = CASE WHEN attempt >= max_attempts THEN NOW() ELSE NULL END,
              updated_at = NOW()
        WHERE id = $1
        RETURNING status;`,
      [jobId, error.slice(0, 2000)]
    );

    return result.rows[0]?.status === "failed" ? "failed" : "retry";
  }

  /** Bekleyen iş sayısı — geri birikim (backlog) metriği. */
  async depth(jobType?: JobType): Promise<number> {
    const result = await this.db.query(
      `SELECT COUNT(*)::int AS count FROM jobs
        WHERE status = 'queued' AND ($1::text IS NULL OR job_type = $1);`,
      [jobType ?? null]
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}
