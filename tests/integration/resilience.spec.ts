import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createIntegrationDb, type IntegrationDb } from "./setup";
import { seedTenant, type TenantFixture } from "./seed";
import { JobQueue, JOB_TYPES } from "@y/core";
import { issueWorkerCredential } from "@y/security";

/**
 * P19 / T6 — DAYANIKLILIK: CANLI VERİTABANI GEREKTİREN SENARYOLAR.
 *
 * `packages/core/src/runtime/resilience.test.ts` sekiz senaryoyu süreç
 * içinde doğruluyor ve **beşini canlı altyapı beklediği için kayıt altına
 * alıyor**. Bu dosya o beşten dördünü kapatıyor:
 *
 *     duplicate event (DB kısıtı) · index interruption
 *     bağlantı kaybı · stale lock
 *
 * Kalan bir tanesi (provider timeout) SDK'ya bağlı ve orada kayıtlı
 * kalıyor.
 *
 * ## Neden mock yetmiyordu
 *
 * Bir UNIQUE kısıtının "uygulandığını" mock'la göstermek, kısıtı değil
 * mock'un davranışını test etmektir. Kısıtın migration'da yazılı olması da
 * yetmez — traversal örneğinde yazılı olan bir şeyin çalışmadığı ölçüldü.
 */

const ORG = "org_res";
const KEY = "resilience-integration-signing-key-32ch";

const credential = (workerId = "worker_1") =>
  issueWorkerCredential({ workerId, jobTypes: [...JOB_TYPES], ttlSeconds: 300 }, KEY);

describe("T6 — duplicate event: UNIQUE kısıtı GERÇEKTEN uygulanıyor", () => {
  let db: IntegrationDb;
  let tenant: TenantFixture;
  let queue: JobQueue;

  beforeAll(async () => {
    db = await createIntegrationDb("resilience-duplicate.spec.ts");
    await db.migrate();
    tenant = await seedTenant(db, ORG);
    queue = new JobQueue(
      { query: (sql: string, params?: unknown[]) => db.query(sql, params) },
      KEY
    );
  });

  afterAll(async () => {
    await db?.close();
  });

  it("aynı idempotency_key ile ikinci enqueue YENİ iş üretmez", async () => {
    const input = {
      jobType: "index" as const,
      organizationId: ORG,
      projectId: tenant.projectId,
      runId: null,
      idempotencyKey: "ayni-anahtar",
      payload: { a: 1 }
    };

    const first = await queue.enqueue(input);
    const second = await queue.enqueue(input);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.jobId).toBe(first.jobId);

    const { rows } = await db.query(
      "SELECT COUNT(*)::int AS c FROM jobs WHERE idempotency_key = $1;",
      ["ayni-anahtar"]
    );
    expect(rows[0].c).toBe(1);
  });

  it("kısıt DOĞRUDAN SQL ile de atlanamaz", async () => {
    // Uygulama katmanini atlayan bir yazim, kisit yalniz kodda olsaydi
    // gecerdi. `ON CONFLICT` olmadan INSERT patlamali.
    await expect(
      db.query(
        `INSERT INTO jobs (id, organization_id, project_id, job_type, idempotency_key)
         VALUES ('job_dup', $1, $2, 'index', 'ayni-anahtar');`,
        [ORG, tenant.projectId]
      )
    ).rejects.toThrow(/duplicate key|uq_jobs_idempotency/i);
  });

  it("run_events (run_id, sequence) çifti benzersiz", async () => {
    // ADR-048: her gecis bir olaydir. Ayni sirada iki olay, zincirin
    // sirasini belirsiz yapardi ve hash zinciri dogrulanamazdi.
    // `runs.task_id` -> `tasks` FK'si var; gercek kisitlara uyuyoruz.
    await db.query(
      `INSERT INTO tasks (id, project_id, organization_id, title, category,
                          risk_level, difficulty, status)
       VALUES ('task_1', $1, $2, 'test', 'Coding', 'Low', 'Easy', 'pending');`,
      [tenant.projectId, ORG]
    );
    await db.query(
      `INSERT INTO runs (id, organization_id, project_id, task_id, state,
                         idempotency_key, requested_by)
       VALUES ('run_1', $1, $2, 'task_1', 'created', 'idem_run_1', 'tester');`,
      [ORG, tenant.projectId]
    );
    await db.query(
      `INSERT INTO run_events (id, run_id, sequence, to_state, reason, actor)
       VALUES ('ev_1', 'run_1', 1, 'queued', 'test', 'tester');`
    );

    await expect(
      db.query(
        `INSERT INTO run_events (id, run_id, sequence, to_state, reason, actor)
         VALUES ('ev_2', 'run_1', 1, 'queued', 'test', 'tester');`
      )
    ).rejects.toThrow(/duplicate key|uq_run_events_sequence/i);
  });

  it("olay kaydı APPEND-ONLY: güncelleme ve silme ENGELLENİR", async () => {
    // ADR-048 + T-18: bir gecis kaydinin sonradan degistirilmesi, kanit
    // zincirini sessizce bozardi. Kural TRIGGER'da; uygulama katmanini
    // atlayan dogrudan SQL de engellenmeli.
    await expect(
      db.query("UPDATE run_events SET reason = 'degistirildi' WHERE id = 'ev_1';")
    ).rejects.toThrow();

    await expect(
      db.query("DELETE FROM run_events WHERE id = 'ev_1';")
    ).rejects.toThrow();
  });
});

describe("T6 — index interruption: lease dolunca iş DEVRALINIR", () => {
  let db: IntegrationDb;
  let tenant: TenantFixture;
  let queue: JobQueue;

  beforeAll(async () => {
    db = await createIntegrationDb("resilience-interrupt.spec.ts");
    await db.migrate();
    tenant = await seedTenant(db, ORG);
    queue = new JobQueue(
      { query: (sql: string, params?: unknown[]) => db.query(sql, params) },
      KEY
    );
  });

  afterAll(async () => {
    await db?.close();
  });

  beforeEach(async () => {
    await db.query("DELETE FROM jobs;");
  });

  it("worker iş ortasında ÖLÜRSE başka worker devralır", async () => {
    await queue.enqueue({
      jobType: "index",
      organizationId: ORG,
      projectId: tenant.projectId,
      runId: null,
      idempotencyKey: "kesilen-is",
      payload: {}
    });

    const claimed = await queue.claim(credential("worker_1"), ["index"]);
    expect(claimed).not.toBeNull();

    // Ikinci worker HENUZ alamaz: lease canli.
    expect(await queue.claim(credential("worker_2"), ["index"])).toBeNull();

    // Worker_1 coktu: lease yenilenmiyor. Zamani ILERLETMEK yerine
    // lease'i gecmise cekiyoruz - gercek saat beklemek testi
    // dakikalarca yavaslatirdi ve sonucu degistirmezdi.
    await db.query(
      "UPDATE jobs SET lease_expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1;",
      [claimed!.id]
    );

    const recovered = await queue.claim(credential("worker_2"), ["index"]);
    expect(recovered).not.toBeNull();
    expect(recovered!.id).toBe(claimed!.id);
    // Devralinan is attempt sayacini ARTIRIR: yoksa cokup duran bir is
    // sonsuza kadar yeniden denenirdi.
    expect(recovered!.attempt).toBe(2);
  });

  it("deneme hakkı BİTEN iş devralınmaz", async () => {
    await queue.enqueue({
      jobType: "index",
      organizationId: ORG,
      projectId: tenant.projectId,
      runId: null,
      idempotencyKey: "hakki-biten",
      payload: {}
    });

    // max_attempts varsayilani 3; attempt'i doldur ve lease'i gecmise cek.
    await db.query(
      `UPDATE jobs SET attempt = max_attempts, status = 'running',
                      lease_expires_at = NOW() - INTERVAL '1 minute';`
    );

    expect(await queue.claim(credential("worker_2"), ["index"])).toBeNull();
  });

  it("eşzamanlı iki claim AYNI işi almaz", async () => {
    await queue.enqueue({
      jobType: "index",
      organizationId: ORG,
      projectId: tenant.projectId,
      runId: null,
      idempotencyKey: "tek-is",
      payload: {}
    });

    // `FOR UPDATE SKIP LOCKED` gercekten calisiyor mu: iki claim ayni
    // anda baslatiliyor.
    const [a, b] = await Promise.all([
      queue.claim(credential("worker_a"), ["index"]),
      queue.claim(credential("worker_b"), ["index"])
    ]);

    const claimed = [a, b].filter((x) => x !== null);
    expect(claimed).toHaveLength(1);
  });
});

describe("T6 — bağlantı kaybı: havuz KENDİNİ TOPARLAR", () => {
  let db: IntegrationDb;
  let tenant: TenantFixture;
  let queue: JobQueue;

  beforeAll(async () => {
    db = await createIntegrationDb("resilience-conn.spec.ts");
    await db.migrate();
    tenant = await seedTenant(db, ORG);
    queue = new JobQueue(
      { query: (sql: string, params?: unknown[]) => db.query(sql, params) },
      KEY
    );
  });

  afterAll(async () => {
    await db?.close();
  });

  it("sunucu bağlantıları KESERSE sonraki sorgu yeniden bağlanır", async () => {
    /*
     * `docker compose restart` yerine `pg_terminate_backend`.
     *
     * Test edilen sey ayni: havuzdaki baglantilarin sunucu tarafindan
     * koparilmasi ve havuzun yeniden baglanmasi. Docker'i testin icinden
     * yonetmek testi konteyner calisma zamanina baglar ve CI'da farkli
     * davranir.
     *
     * ILK YAZIMIM ZAYIFTI. Kesme sorgusu `pid <> pg_backend_pid()` ile
     * KENDI oturumunu haric tutuyordu, sonra bir sorgu calistirip
     * "yeniden baglandi" diyordu. Ama havuz `max: 4` — sorgu, hic
     * dokunulmamis bir baglantiya dusmus olabilirdi. O zaman test
     * yeniden baglanmayi degil "havuzda baska baglanti vardi"yi olcerdi.
     *
     * Bu surum hicbir baglantiyi hayatta birakmaz:
     *   1. Ayri bir istemci alinir (kesici).
     *   2. Kesicinin KENDISI haric her sey sonlandirilir.
     *   3. Kesici havuza GERI VERILMEZ, IMHA EDILIR.
     * Geriye kullanilabilir tek baglanti kalmaz; sonraki sorgu YENI bir
     * baglanti acmak ZORUNDADIR ve bunu pid degisimiyle kanitlariz.
     */
    await queue.enqueue({
      jobType: "index",
      organizationId: ORG,
      projectId: tenant.projectId,
      runId: null,
      idempotencyKey: "baglanti-once",
      payload: {}
    });

    const killer = await db.pool.connect();
    let livePids: number[];
    try {
      const killerPid = (await killer.query("SELECT pg_backend_pid() AS pid;")).rows[0].pid;

      /*
       * Havuzu IKINCI bir baglanti acmaya zorla.
       *
       * Ilk denemede `livePids` BOS cikti ve pozitif kontrol testi
       * kirdi — dogru davranis. Sebep: havuzda o an tek baglanti vardi
       * ve `pool.connect()` onu bana verdi; geriye sonlandirilacak
       * baska baglanti kalmadi.
       *
       * Kesici cekilmisken bir sorgu calistirmak havuzu yeni bir
       * baglanti acmaya zorlar; boylece sonlandirilacak GERCEK bir
       * hedef olusur.
       */
      await db.query("SELECT 1;");

      livePids = (
        await killer.query(
          `SELECT pid FROM pg_stat_activity
            WHERE datname = current_database() AND pid <> $1;`,
          [killerPid]
        )
      ).rows.map((r: { pid: number }) => Number(r.pid));

      // POZITIF KONTROL: havuz gercekten baglanti tutuyor olmali.
      // Tutmuyorsa "yeni pid" iddiasi bos yere gecerdi.
      expect(livePids.length).toBeGreaterThan(0);

      await killer.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
          WHERE datname = current_database() AND pid <> $1;`,
        [killerPid]
      );
      livePids.push(killerPid);
    } finally {
      // `release(err)` istemciyi havuzdan CIKARIR ve baglantiyi kapatir.
      // Argumansiz `release()` onu havuza geri verirdi ve sonraki sorgu
      // bu SAG baglantiya dusebilirdi — olcmek istedigimiz seyi yok eder.
      killer.release(new Error("test: baglanti kasitli imha edildi"));
    }

    // 1. ILK sorgu HATA VERIR — havuz seffaf toparlanmiyor.
    //
    //    Bu, testi guclendirirken ORTAYA CIKAN bir bulgu. Onceki surum
    //    hayatta kalan bir baglantiya dustugu icin bunu hic gormemisti.
    //    node-postgres havuzu olmus bir istemciyi geri verebiliyor ve
    //    sorguyu KENDILIGINDEN yeniden denemiyor.
    //
    //    Cagiran icin sonucu: DB yeniden baslatildiginda ucustaki sorgu
    //    BASARISIZ OLUR. "Havuz kendini toparlar" ifadesi ancak SONRAKI
    //    sorgu icin dogru. Yeniden deneme cagiranin sorumlulugunda.
    await expect(
      db.query("SELECT 1;")
    ).rejects.toThrow(/terminating connection|Connection terminated|socket hang up/i);

    // 2. SONRAKI sorgu calisir: olu istemci havuzdan atilmis ve YENI
    //    baglanti acilmistir.
    const { rows } = await db.query(
      "SELECT COUNT(*)::int AS c, pg_backend_pid() AS pid FROM jobs WHERE idempotency_key = $1;",
      ["baglanti-once"]
    );

    // 3. VERI KAYBI OLMAMALI.
    expect(rows[0].c).toBe(1);

    // 4. Ve bu GERCEKTEN yeni bir baglanti olmali. Asil eksik iddia buydu:
    //    eski pid'lerden biri donerse havuz hic yeniden baglanmamistir.
    expect(livePids).not.toContain(Number(rows[0].pid));

    // 5. Kuyruk da calismaya devam etmeli.
    const claimed = await queue.claim(credential(), ["index"]);
    expect(claimed).not.toBeNull();
  });

  it("bağlantı hatası SESSİZCE YUTULMAZ", async () => {
    // Hatayi yutup bos sonuc donmek, "is yok" ile "DB erisilemedi"yi
    // ayni gosterirdi; worker bos kuyruk sanip beklemeye gecerdi.
    await expect(db.query("SELECT * FROM kesinlikle_olmayan_tablo;")).rejects.toThrow();
  });
});
