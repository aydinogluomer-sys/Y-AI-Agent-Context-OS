/**
 * P12 — Run FSM ve iş kuyruğu testleri.
 *
 * P00'un en kritik bulgusu buradaydı: `POST .../runs` dört olay yazıp
 * `status: "completed"` dönüyordu. Hiçbir context derlenmiyor, hiçbir
 * model çağrılmıyor, hiçbir dosyaya dokunulmuyordu.
 */

import { describe, it, expect } from "vitest";
import { RunError, RunService, type RunDb } from "./run-service";
import { JobQueue, JOB_TYPES, type QueueDb } from "./queue";
import { canTransition, guardTransition, isTerminal, RUN_STATES } from "@y/shared";
import { issueWorkerCredential } from "@y/security";

// --- Sahte DB (durum tutan, dürüst) ---------------------------------------

function createRunDb(initial: Partial<Record<string, unknown>> = {}) {
  const runs = new Map<string, Record<string, unknown>>();
  const events: Record<string, unknown>[] = [];
  const calls: { sql: string; params: unknown[] }[] = [];

  const db: RunDb & { runs: typeof runs; events: typeof events; calls: typeof calls } = {
    runs,
    events,
    calls,
    async query(sql: string, params: unknown[] = []) {
      const flat = sql.replace(/\s+/g, " ").trim();
      calls.push({ sql: flat, params });

      if (/^INSERT INTO runs/i.test(flat)) {
        const [id, orgId, projectId, taskId, adapterId, key, requestedBy] = params as string[];
        const existing = [...runs.values()].find(
          (r) => r.task_id === taskId && r.idempotency_key === key
        );
        // ON CONFLICT DO NOTHING davranisi.
        if (existing) return { rows: [], rowCount: 0 };

        runs.set(id, {
          id,
          organization_id: orgId,
          project_id: projectId,
          task_id: taskId,
          adapter_id: adapterId,
          state: "created",
          manifest_id: null,
          boundary_id: null,
          agent_session_id: null,
          idempotency_key: key,
          requested_by: requestedBy,
          attempt: 1,
          ...initial
        });
        return { rows: [{ id }], rowCount: 1 };
      }

      if (/^UPDATE runs SET state/i.test(flat)) {
        const [id, to, expected] = params as string[];
        const run = runs.get(id);
        // Kosullu guncelleme: durum arada degistiyse eslesmez.
        if (!run || run.state !== expected) return { rows: [], rowCount: 0 };
        run.state = to;
        return { rows: [{ id }], rowCount: 1 };
      }

      if (/^UPDATE runs SET manifest_id/i.test(flat)) {
        const [id, manifestId] = params as string[];
        const run = runs.get(id);
        if (run) run.manifest_id = manifestId;
        return { rows: [], rowCount: 1 };
      }

      if (/^UPDATE runs SET boundary_id/i.test(flat)) {
        const [id, boundaryId] = params as string[];
        const run = runs.get(id);
        if (run) run.boundary_id = boundaryId;
        return { rows: [], rowCount: 1 };
      }

      if (/^UPDATE runs SET agent_session_id/i.test(flat)) {
        const [id, sessionId] = params as string[];
        const run = runs.get(id);
        if (run) run.agent_session_id = sessionId;
        return { rows: [], rowCount: 1 };
      }

      if (/FROM runs WHERE id/i.test(flat)) {
        const run = runs.get(params[0] as string);
        return { rows: run ? [run] : [], rowCount: run ? 1 : 0 };
      }

      if (/FROM runs WHERE task_id/i.test(flat)) {
        const [taskId, key] = params as string[];
        const run = [...runs.values()].find(
          (r) => r.task_id === taskId && r.idempotency_key === key
        );
        return { rows: run ? [run] : [], rowCount: run ? 1 : 0 };
      }

      if (/^INSERT INTO run_events/i.test(flat)) {
        const [id, runId, fromState, toState, reason, actor] = params as string[];
        events.push({
          id,
          run_id: runId,
          sequence: events.filter((e) => e.run_id === runId).length + 1,
          from_state: fromState,
          to_state: toState,
          reason,
          actor,
          created_at: new Date().toISOString()
        });
        return { rows: [], rowCount: 1 };
      }

      if (/FROM run_events WHERE run_id/i.test(flat)) {
        const rows = events.filter((e) => e.run_id === params[0]);
        return { rows, rowCount: rows.length };
      }

      return { rows: [], rowCount: 0 };
    }
  };
  return db;
}

const CREATE_INPUT = {
  organizationId: "org_a",
  projectId: "proj_1",
  taskId: "task_1",
  adapterId: "claude-code",
  idempotencyKey: "key_1",
  requestedBy: "user_alice"
};

/**
 * [P17 / T-15] Kuyruk artik IMZALI worker kimligi istiyor.
 *
 * Testlerde gercek imzalama kullaniliyor, mock DEGIL: dogrulamanin
 * atlanabilir oldugunu gosteren bir test, dogrulamayi test etmis olmaz.
 */
const TEST_SIGNING_KEY = "test-signing-key-at-least-32-chars-long!!";

function testCredential(
  workerId: string,
  jobTypes: readonly string[] = [...JOB_TYPES]
): string {
  return issueWorkerCredential(
    { workerId, jobTypes, ttlSeconds: 300 },
    TEST_SIGNING_KEY
  );
}

describe("FSM sözleşmesi (P01'de donduruldu)", () => {
  it("13 durum tanımlı", () => {
    expect(RUN_STATES.length).toBe(13);
  });

  it("terminal durumlardan çıkış yok", () => {
    for (const state of ["completed", "failed", "cancelled"] as const) {
      expect(isTerminal(state)).toBe(true);
      for (const target of RUN_STATES) {
        expect(canTransition(state, target), `${state} -> ${target}`).toBe(false);
      }
    }
  });

  it("manifest olmadan ready'ye geçilemez (ADR-046)", () => {
    const verdict = guardTransition("awaiting_policy", "ready", {
      hasManifest: false,
      hasChangeBoundary: true,
      hasAgentSession: true
    });
    expect(verdict.ok).toBe(false);
  });

  it("boundary olmadan running'e geçilemez", () => {
    const verdict = guardTransition("ready", "running", {
      hasManifest: true,
      hasChangeBoundary: false,
      hasAgentSession: true
    });
    expect(verdict.ok).toBe(false);
  });
});

describe("RunService — idempotency", () => {
  it("aynı anahtarla ikinci istek YENİ run üretmez", async () => {
    const db = createRunDb();
    const service = new RunService(db);

    const first = await service.createOrGet(CREATE_INPUT);
    const second = await service.createOrGet(CREATE_INPUT);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.run.id).toBe(first.run.id);
    expect(db.runs.size).toBe(1);
  });

  it("farklı anahtar farklı run üretir", async () => {
    const db = createRunDb();
    const service = new RunService(db);

    await service.createOrGet(CREATE_INPUT);
    await service.createOrGet({ ...CREATE_INPUT, idempotencyKey: "key_2" });

    expect(db.runs.size).toBe(2);
  });

  it("oluşturma bir olay yazar (ADR-048)", async () => {
    const db = createRunDb();
    await new RunService(db).createOrGet(CREATE_INPUT);

    expect(db.events.length).toBe(1);
    expect(db.events[0].to_state).toBe("created");
  });
});

describe("RunService — durum geçişleri", () => {
  async function readyRun() {
    const db = createRunDb();
    const service = new RunService(db);
    const { run } = await service.createOrGet(CREATE_INPUT);

    await service.transition(run.id, "queued", { reason: "kuyruga alindi", actor: "sistem" });
    await service.transition(run.id, "preparing_context", { reason: "context", actor: "worker" });
    return { db, service, runId: run.id };
  }

  it("geçerli geçiş uygulanır", async () => {
    const { db, runId } = await readyRun();
    expect(db.runs.get(runId)?.state).toBe("preparing_context");
  });

  it("her geçiş bir olay yazar", async () => {
    const { db } = await readyRun();
    // created + queued + preparing_context
    expect(db.events.length).toBe(3);
  });

  it("geçersiz geçiş REDDEDİLİR (sessizce yok sayılmaz)", async () => {
    const { service, runId } = await readyRun();
    await expect(
      service.transition(runId, "completed", { reason: "atla", actor: "x" })
    ).rejects.toThrow(RunError);
  });

  it("manifest olmadan ready'ye geçilemez", async () => {
    const { service, runId } = await readyRun();
    await service.transition(runId, "awaiting_policy", { reason: "policy", actor: "worker" });

    await expect(
      service.transition(runId, "ready", { reason: "hazir", actor: "worker" })
    ).rejects.toThrow(/manifest/i);
  });

  it("manifest bağlandıktan sonra ready'ye geçilir", async () => {
    const { service, runId } = await readyRun();
    await service.transition(runId, "awaiting_policy", { reason: "policy", actor: "worker" });
    await service.attachManifest(runId, "manifest_1");

    const run = await service.transition(runId, "ready", { reason: "hazir", actor: "worker" });
    expect(run.state).toBe("ready");
  });

  it("boundary olmadan running'e geçilemez", async () => {
    const { service, runId } = await readyRun();
    await service.transition(runId, "awaiting_policy", { reason: "p", actor: "w" });
    await service.attachManifest(runId, "manifest_1");
    await service.transition(runId, "ready", { reason: "h", actor: "w" });

    await expect(
      service.transition(runId, "running", { reason: "basla", actor: "w" })
    ).rejects.toThrow(/boundary/i);
  });
});

describe("RunService — terminal durumlar (ADR-047)", () => {
  it("terminal run'a geçiş REDDEDİLİR", async () => {
    const db = createRunDb();
    const service = new RunService(db);
    const { run } = await service.createOrGet(CREATE_INPUT);

    await service.transition(run.id, "cancelled", { reason: "iptal", actor: "user" });

    // P00'daki `cancel` route'u tam olarak bunu YAPMIYORDU: zaten
    // "completed" olmus bir run'a `cancelled` olayi ekliyordu.
    await expect(
      service.transition(run.id, "queued", { reason: "yeniden", actor: "user" })
    ).rejects.toThrow(RunError);
  });

  it("terminal hata mesajı yeniden denemenin YENİ run gerektirdiğini söyler", async () => {
    const db = createRunDb();
    const service = new RunService(db);
    const { run } = await service.createOrGet(CREATE_INPUT);
    await service.transition(run.id, "cancelled", { reason: "iptal", actor: "user" });

    try {
      await service.transition(run.id, "queued", { reason: "x", actor: "y" });
      expect.unreachable("hata bekleniyordu");
    } catch (error) {
      expect((error as Error).message).toContain("YENI");
      expect((error as Error).message).toContain("kanit zinciri");
    }
  });
});

describe("RunService — eşzamanlılık", () => {
  it("durum arada değişirse geçiş reddedilir (lost update yok)", async () => {
    const db = createRunDb();
    const service = new RunService(db);
    const { run } = await service.createOrGet(CREATE_INPUT);

    // Baska bir aktor durumu degistirdi.
    db.runs.get(run.id)!.state = "queued";

    // Bizim gecisimiz `created -> queued` bekliyordu; kosullu guncelleme
    // eslesmeyecek.
    await expect(
      service.transition(run.id, "queued", { reason: "x", actor: "y" })
    ).rejects.toThrow(/arada degisti|Gecersiz gecis/);
  });
});

describe("RunService — olay zinciri", () => {
  it("olaylar sıralı okunur", async () => {
    const db = createRunDb();
    const service = new RunService(db);
    const { run } = await service.createOrGet(CREATE_INPUT);
    await service.transition(run.id, "queued", { reason: "kuyruk", actor: "sistem" });

    const events = await service.events(run.id);
    expect(events.map((e) => e.toState)).toEqual(["created", "queued"]);
    expect(events[1].fromState).toBe("created");
  });

  it("sorgu run_id ile SINIRLI (tüm task olaylarını çekmez)", async () => {
    const db = createRunDb();
    const service = new RunService(db);
    const { run } = await service.createOrGet(CREATE_INPUT);
    await service.events(run.id);

    // INSERT de `FROM run_events` iceriyor (sequence hesabi icin);
    // aranan SELECT sorgusudur.
    const q = db.calls.find((c) => /^SELECT sequence/i.test(c.sql));
    expect(q?.sql).toContain("WHERE run_id = $1");
  });
});

// --- Kuyruk ----------------------------------------------------------------

function createQueueDb() {
  const jobs = new Map<string, Record<string, unknown>>();
  const calls: { sql: string; params: unknown[] }[] = [];

  const db: QueueDb & { jobs: typeof jobs; calls: typeof calls } = {
    jobs,
    calls,
    async query(sql: string, params: unknown[] = []) {
      const flat = sql.replace(/\s+/g, " ").trim();
      calls.push({ sql: flat, params });

      if (/^INSERT INTO jobs/i.test(flat)) {
        const [id, orgId, projectId, jobType, runId, payload, key, maxAttempts, priority] =
          params as any[];
        if ([...jobs.values()].some((j) => j.idempotency_key === key)) {
          return { rows: [], rowCount: 0 };
        }
        jobs.set(id, {
          id,
          organization_id: orgId,
          project_id: projectId,
          job_type: jobType,
          run_id: runId,
          payload_json: JSON.parse(payload),
          idempotency_key: key,
          status: "queued",
          attempt: 0,
          max_attempts: maxAttempts,
          priority
        });
        return { rows: [{ id }], rowCount: 1 };
      }

      if (/SELECT id FROM jobs WHERE idempotency_key/i.test(flat)) {
        const job = [...jobs.values()].find((j) => j.idempotency_key === params[0]);
        return { rows: job ? [{ id: job.id }] : [], rowCount: job ? 1 : 0 };
      }

      if (/^UPDATE jobs SET status = 'running'/i.test(flat)) {
        const [workerId, types] = params as [string, string[]];
        const job = [...jobs.values()].find(
          (j) =>
            types.includes(j.job_type as string) &&
            j.status === "queued" &&
            Number(j.attempt) < Number(j.max_attempts)
        );
        if (!job) return { rows: [], rowCount: 0 };

        job.status = "running";
        job.locked_by = workerId;
        job.attempt = Number(job.attempt) + 1;
        return { rows: [job], rowCount: 1 };
      }

      if (/^UPDATE jobs SET lease_expires_at/i.test(flat)) {
        const [jobId, workerId] = params as string[];
        const job = jobs.get(jobId);
        const ok = job && job.locked_by === workerId && job.status === "running";
        return { rows: ok ? [{ id: jobId }] : [], rowCount: ok ? 1 : 0 };
      }

      if (/^UPDATE jobs SET status = 'completed'/i.test(flat)) {
        const job = jobs.get(params[0] as string);
        if (job) job.status = "completed";
        return { rows: [], rowCount: 1 };
      }

      if (/^UPDATE jobs SET status = CASE/i.test(flat)) {
        const job = jobs.get(params[0] as string);
        if (!job) return { rows: [], rowCount: 0 };
        job.status = Number(job.attempt) < Number(job.max_attempts) ? "queued" : "failed";
        return { rows: [{ status: job.status }], rowCount: 1 };
      }

      if (/COUNT\(\*\)::int AS count FROM jobs/i.test(flat)) {
        const type = params[0] as string | null;
        const count = [...jobs.values()].filter(
          (j) => j.status === "queued" && (type === null || j.job_type === type)
        ).length;
        return { rows: [{ count }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }
  };
  return db;
}

const ENQUEUE = {
  organizationId: "org_a",
  projectId: "proj_1",
  jobType: "context-compile" as const,
  runId: "run_1",
  payload: { taskId: "task_1" },
  idempotencyKey: "job_key_1"
};

describe("JobQueue — idempotency", () => {
  it("aynı anahtarla ikinci iş kuyruğa girmez", async () => {
    const db = createQueueDb();
    const queue = new JobQueue(db, TEST_SIGNING_KEY);

    const first = await queue.enqueue(ENQUEUE);
    const second = await queue.enqueue(ENQUEUE);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.jobId).toBe(first.jobId);
    expect(db.jobs.size).toBe(1);
  });
});

describe("JobQueue — claim", () => {
  it("SKIP LOCKED kullanır", async () => {
    const db = createQueueDb();
    const queue = new JobQueue(db, TEST_SIGNING_KEY);
    await queue.enqueue(ENQUEUE);
    await queue.claim(testCredential("worker_1"), ["context-compile"]);

    const claim = db.calls.find((c) => /UPDATE jobs SET status = 'running'/i.test(c.sql));
    expect(claim?.sql).toContain("FOR UPDATE SKIP LOCKED");
  });

  it("çökme kurtarma sorguda var", async () => {
    const db = createQueueDb();
    const queue = new JobQueue(db, TEST_SIGNING_KEY);
    await queue.enqueue(ENQUEUE);
    await queue.claim(testCredential("worker_1"), ["context-compile"]);

    const claim = db.calls.find((c) => /UPDATE jobs SET status = 'running'/i.test(c.sql));
    // Lease suresi dolmus is geri alinir; aksi halde sonsuza kadar
    // `running` kalirdi.
    expect(claim?.sql).toContain("lease_expires_at < NOW()");
  });

  it("aynı iş iki kez claim edilmez", async () => {
    const db = createQueueDb();
    const queue = new JobQueue(db, TEST_SIGNING_KEY);
    await queue.enqueue(ENQUEUE);

    const first = await queue.claim(testCredential("worker_1"), ["context-compile"]);
    const second = await queue.claim(testCredential("worker_2"), ["context-compile"]);

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("kuyruk boşsa null döner", async () => {
    expect(await new JobQueue(createQueueDb(), TEST_SIGNING_KEY).claim(testCredential("w"), ["index"])).toBeNull();
  });

  it("istenmeyen türdeki işi almaz", async () => {
    const db = createQueueDb();
    const queue = new JobQueue(db, TEST_SIGNING_KEY);
    await queue.enqueue(ENQUEUE);

    expect(await queue.claim(testCredential("worker_1"), ["index"])).toBeNull();
  });
});

describe("JobQueue — lease", () => {
  it("sahibi lease'i yenileyebilir", async () => {
    const db = createQueueDb();
    const queue = new JobQueue(db, TEST_SIGNING_KEY);
    await queue.enqueue(ENQUEUE);
    const job = await queue.claim(testCredential("worker_1"), ["context-compile"]);

    expect(await queue.renewLease(job!.id, testCredential("worker_1"))).toBe(true);
  });

  it("başkası lease'i yenileyemez (iş devralınmış olabilir)", async () => {
    const db = createQueueDb();
    const queue = new JobQueue(db, TEST_SIGNING_KEY);
    await queue.enqueue(ENQUEUE);
    const job = await queue.claim(testCredential("worker_1"), ["context-compile"]);

    // `false` donerse cagiran calismayi DURDURMALIDIR; aksi halde iki
    // worker ayni isi yapar.
    expect(await queue.renewLease(job!.id, testCredential("worker_2"))).toBe(false);
  });
});

describe("JobQueue — başarısızlık ve retry", () => {
  it("deneme hakkı kalmışsa kuyruğa döner", async () => {
    const db = createQueueDb();
    const queue = new JobQueue(db, TEST_SIGNING_KEY);
    await queue.enqueue({ ...ENQUEUE, maxAttempts: 3 });
    const job = await queue.claim(testCredential("worker_1"), ["context-compile"]);

    expect(await queue.fail(job!.id, "gecici hata")).toBe("retry");
  });

  it("deneme hakkı bittiyse failed olur (sonsuz döngü yok)", async () => {
    const db = createQueueDb();
    const queue = new JobQueue(db, TEST_SIGNING_KEY);
    await queue.enqueue({ ...ENQUEUE, maxAttempts: 1 });
    const job = await queue.claim(testCredential("worker_1"), ["context-compile"]);

    expect(await queue.fail(job!.id, "kalici hata")).toBe("failed");
  });

  it("başarılı iş tamamlanır", async () => {
    const db = createQueueDb();
    const queue = new JobQueue(db, TEST_SIGNING_KEY);
    await queue.enqueue(ENQUEUE);
    const job = await queue.claim(testCredential("worker_1"), ["context-compile"]);
    await queue.complete(job!.id, { manifestId: "m_1" });

    expect(db.jobs.get(job!.id)?.status).toBe("completed");
  });
});

describe("JobQueue — backlog metriği", () => {
  it("bekleyen iş sayısını döndürür", async () => {
    const db = createQueueDb();
    const queue = new JobQueue(db, TEST_SIGNING_KEY);
    await queue.enqueue(ENQUEUE);
    await queue.enqueue({ ...ENQUEUE, idempotencyKey: "k2" });

    expect(await queue.depth()).toBe(2);
    expect(await queue.depth("context-compile")).toBe(2);
    expect(await queue.depth("index")).toBe(0);
  });
});
