/**
 * P05 / Y-P05-008 — Graph worker testleri.
 *
 * P00 bulgusu: graf senkronizasyonu YALNIZ elle tetikleniyordu ve grafın
 * bayat olduğunu söyleyen bir sinyal yoktu. Bu testler, graf build'in bir
 * job olduğunu ve kanıtsız tamamlanamadığını kilitler.
 */

import { describe, it, expect } from "vitest";
import {
  GraphWorker,
  EmptyGraphError,
  assertGraphNotEmpty,
  enqueueGraphJob,
  type WorkerDb
} from "./graph-worker";

interface State {
  job: Record<string, unknown> | null;
  snapshot: Record<string, unknown> | null;
  files: any[];
  symbols: any[];
  completedBuild: any[];
  invalidations: { path: string; reason: string }[];
}

function createDb(overrides: Partial<State> = {}) {
  const state: State = {
    job: {
      id: "job_g1",
      project_id: "proj_1",
      organization_id: "org_a",
      snapshot_id: "snap_1",
      attempts: 1,
      max_attempts: 3
    },
    snapshot: {
      id: "snap_1",
      repository_id: "repo_1",
      organization_id: "org_a",
      status: "ready",
      file_count: 2
    },
    files: [
      { id: "f_a", path: "src/a.ts", language: "typescript", parse_confidence: 1, parse_status: "parsed" },
      { id: "f_b", path: "src/b.ts", language: "typescript", parse_confidence: 1, parse_status: "parsed" }
    ],
    symbols: [
      {
        symbol_id: "sym_1",
        path: "src/a.ts",
        language: "typescript",
        symbol_type: "function",
        symbol_name: "topla",
        start_line: 1,
        end_line: 3,
        is_exported: true,
        imports: [],
        file_id: "f_a"
      }
    ],
    completedBuild: [],
    invalidations: [],
    ...overrides
  };

  const queries: { sql: string; params: unknown[] }[] = [];
  const jobUpdates: unknown[][] = [];

  const db: WorkerDb & { queries: typeof queries; jobUpdates: typeof jobUpdates; state: State } = {
    queries,
    jobUpdates,
    state,
    async query(sql: string, params: unknown[] = []) {
      const flat = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: flat, params });

      if (/^UPDATE index_jobs SET status = 'running'/i.test(flat)) {
        const job = state.job;
        state.job = null;
        return { rows: job ? [job] : [], rowCount: job ? 1 : 0 };
      }
      if (/^UPDATE index_jobs/i.test(flat)) {
        jobUpdates.push(params);
        return { rows: [], rowCount: 1 };
      }
      if (/FROM repository_snapshots s WHERE s.id/i.test(flat)) {
        return { rows: state.snapshot ? [state.snapshot] : [], rowCount: state.snapshot ? 1 : 0 };
      }
      if (/COUNT\(\*\)::int AS count FROM files/i.test(flat)) {
        return { rows: [{ count: state.files.length }], rowCount: 1 };
      }
      if (/FROM graph_build_runs/i.test(flat)) {
        return { rows: state.completedBuild, rowCount: state.completedBuild.length };
      }
      if (/FROM symbol_invalidations/i.test(flat)) {
        return { rows: state.invalidations, rowCount: state.invalidations.length };
      }
      if (/COUNT\(\*\)::int AS count FROM symbols/i.test(flat)) {
        return { rows: [{ count: state.symbols.length }], rowCount: 1 };
      }
      if (/FROM files WHERE snapshot_id/i.test(flat)) {
        const only = params[1] as string[] | null;
        const rows = only ? state.files.filter((f) => only.includes(f.path)) : state.files;
        return { rows, rowCount: rows.length };
      }
      if (/FROM symbols WHERE snapshot_id/i.test(flat)) {
        const only = params[1] as string[] | null;
        const rows = only ? state.symbols.filter((s) => only.includes(s.path)) : state.symbols;
        return { rows, rowCount: rows.length };
      }
      if (/SELECT node_identifier, node_kind, path FROM graph_nodes/i.test(flat)) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 1 };
    }
  };
  return db;
}

function worker(db: WorkerDb) {
  return new GraphWorker({ db, workerId: "graph_worker_test" });
}

describe("GraphWorker — graf build bir JOB'dır", () => {
  it("kuyruktan job alır ve graf üretir", async () => {
    const db = createDb();
    const result = await worker(db).runOnce();

    expect(result.claimed).toBe(true);
    expect(result.status).toBe("completed");
    expect(result.nodeCount).toBeGreaterThan(0);
  });

  it("yalnız graph fazındaki job'ları alır", async () => {
    const db = createDb();
    await worker(db).runOnce();

    const claim = db.queries.find((q) => /UPDATE index_jobs SET status = 'running'/i.test(q.sql));
    expect(claim?.sql).toContain("job_phase = 'graph'");
    expect(claim?.sql).toContain("FOR UPDATE SKIP LOCKED");
  });

  it("kuyruk boşsa idle döner", async () => {
    const db = createDb({ job: null });
    const result = await worker(db).runOnce();

    expect(result.claimed).toBe(false);
    expect(result.status).toBe("idle");
  });

  it("job'a KANIT yazar (node/edge sayıları, mod, oranlar)", async () => {
    const db = createDb();
    await worker(db).runOnce();

    const completion = db.jobUpdates.find((p) => String(p[1]).includes("nodeCount"));
    const evidence = JSON.parse(String(completion?.[1]));

    expect(evidence.nodeCount).toBeGreaterThan(0);
    expect(evidence.graphMode).toBe("full");
    expect(typeof evidence.unresolvedRatio).toBe("number");
    expect(typeof evidence.degraded).toBe("boolean");
  });

  it("graph_build_runs kaydı açar ve kapatır", async () => {
    const db = createDb();
    await worker(db).runOnce();

    expect(db.queries.some((q) => /INSERT INTO graph_build_runs/i.test(q.sql))).toBe(true);
    expect(
      db.queries.some((q) => /UPDATE graph_build_runs SET status = 'completed'/i.test(q.sql))
    ).toBe(true);
  });
});

describe("GraphWorker — negatif: boş graf tamamlanamaz", () => {
  it("dosyası olan snapshot için sıfır node üretilirse hata", () => {
    const build = {
      buildRunId: "gbr_1",
      mode: "full" as const,
      nodeCount: 0,
      edgeCount: 0,
      touchedNodeCount: 0,
      tombstoneCount: 0,
      unresolvedImports: 0,
      totalImports: 0,
      unresolvedRatio: 0,
      durationMs: 5
    };

    expect(() => assertGraphNotEmpty(build, "full", 12)).toThrow(EmptyGraphError);
    expect(() => assertGraphNotEmpty(build, "full", 12)).toThrow(/bagimlilik yok/i);
  });

  it("boş repo'da kural uygulanmaz", () => {
    const build = {
      buildRunId: "gbr_1",
      mode: "full" as const,
      nodeCount: 0,
      edgeCount: 0,
      touchedNodeCount: 0,
      tombstoneCount: 0,
      unresolvedImports: 0,
      totalImports: 0,
      unresolvedRatio: 0,
      durationMs: 5
    };
    expect(() => assertGraphNotEmpty(build, "full", 0)).not.toThrow();
  });

  it("artımlı modda kural uygulanmaz (kapsam boş olabilir)", () => {
    const build = {
      buildRunId: "gbr_1",
      mode: "incremental" as const,
      nodeCount: 0,
      edgeCount: 0,
      touchedNodeCount: 0,
      tombstoneCount: 0,
      unresolvedImports: 0,
      totalImports: 0,
      unresolvedRatio: 0,
      durationMs: 5
    };
    expect(() => assertGraphNotEmpty(build, "incremental", 12)).not.toThrow();
  });

  it("sembol index'i olmayan snapshot'ta job completed OLMAZ", async () => {
    const db = createDb({ symbols: [] });
    const result = await worker(db).runOnce();

    expect(result.status).not.toBe("completed");
    expect(result.error).toContain("sembol index'i yok");
  });

  it("snapshot'a bağlı olmayan job reddedilir", async () => {
    const db = createDb({
      job: {
        id: "job_g2",
        project_id: "proj_1",
        organization_id: "org_a",
        snapshot_id: null,
        attempts: 1,
        max_attempts: 3
      }
    });

    const result = await worker(db).runOnce();
    expect(result.status).not.toBe("completed");
    expect(result.error).toContain("snapshot");
  });

  it("ready olmayan snapshot için graf üretilmez", async () => {
    const db = createDb({
      snapshot: {
        id: "snap_1",
        repository_id: "repo_1",
        organization_id: "org_a",
        status: "ingesting",
        file_count: 2
      }
    });

    const result = await worker(db).runOnce();
    expect(result.status).not.toBe("completed");
    expect(result.error).toContain("ingesting");
  });
});

describe("GraphWorker — retry", () => {
  it("deneme hakkı kalmışsa kuyruğa döner", async () => {
    const db = createDb({ snapshot: null });
    const result = await worker(db).runOnce();

    expect(result.status).toBe("retry");
    expect(db.jobUpdates.some((p) => p[1] === "queued")).toBe(true);
  });

  it("deneme hakkı bittiyse failed olur", async () => {
    const db = createDb({
      snapshot: null,
      job: {
        id: "job_g1",
        project_id: "proj_1",
        organization_id: "org_a",
        snapshot_id: "snap_1",
        attempts: 3,
        max_attempts: 3
      }
    });

    const result = await worker(db).runOnce();
    expect(result.status).toBe("failed");
  });
});

describe("GraphWorker — sağlık", () => {
  it("çözülemeyen import oranı eşiği aşarsa degraded", () => {
    const w = new GraphWorker({
      db: createDb(),
      workerId: "w",
      unresolvedRatioThreshold: 0.3
    });

    const base = {
      claimed: true,
      jobId: "j",
      status: "completed" as const,
      mode: "full" as const,
      planReason: null,
      nodeCount: 10,
      edgeCount: 10,
      tombstoneCount: 0,
      touchRatio: 1,
      durationMs: 1,
      error: null
    };

    expect(w.isDegraded({ ...base, unresolvedRatio: 0.5 })).toBe(true);
    expect(w.isDegraded({ ...base, unresolvedRatio: 0.1 })).toBe(false);
  });
});

describe("enqueueGraphJob — otomatik tetikleme", () => {
  it("graph fazında queued job yaratır", async () => {
    const db = createDb();
    await enqueueGraphJob(db, {
      jobId: "job_new",
      organizationId: "org_a",
      projectId: "proj_1",
      snapshotId: "snap_1"
    });

    const insert = db.queries.find((q) => /INSERT INTO index_jobs/i.test(q.sql));
    expect(insert?.sql).toContain("'graph'");
    expect(insert?.sql).toContain("'queued'");
    expect(insert?.params).toContain("snap_1");
  });
});
