/**
 * P04 / Y-P04-009 — Index worker testleri.
 *
 * Bu dosyanın varlık sebebi tek bir regresyondur: eski worker dosyaları
 * SAYIYOR, sonra job'ı `completed` işaretliyordu. Aşağıdaki "negatif"
 * bölümü, o davranışın geri gelmesi hâlinde kırmızıya döner.
 */

import { describe, it, expect } from "vitest";
import { IndexWorker, NoRealWorkError, assertRealWork, selectFilesToParse } from "./index-worker";
import type { IndexWorkerRunResult, WorkerDb } from "./index-worker";
import { AdapterError, createDefaultRegistry, type AdapterCapabilities, type RepositoryAdapter } from "@y/core";

const TS_FILE = `
export function topla(a: number, b: number): number {
  return a + b;
}

export class Hesap {
  yatir(miktar: number): void {}
}
`;

interface DbState {
  job: Record<string, unknown> | null;
  snapshot: Record<string, unknown> | null;
  files: Record<string, unknown>[];
  previousSnapshots: { id: string; commit_sha: string }[];
  parserVersions: { parser_id: string; version: string }[];
  previousFiles: string[];
}

function createDb(overrides: Partial<DbState> = {}) {
  const state: DbState = {
    job: {
      id: "job_1",
      project_id: "proj_1",
      organization_id: "org_a",
      snapshot_id: "snap_1",
      job_phase: "index",
      attempts: 1,
      max_attempts: 3
    },
    snapshot: {
      id: "snap_1",
      repository_id: "repo_1",
      organization_id: "org_a",
      commit_sha: "b".repeat(40),
      status: "ready"
    },
    files: [
      { id: "f_1", path: "src/a.ts", language: "typescript", is_binary: false, size_bytes: 120 }
    ],
    previousSnapshots: [],
    parserVersions: [],
    previousFiles: [],
    ...overrides
  };

  const queries: { sql: string; params: unknown[] }[] = [];
  const symbolInserts: unknown[][] = [];
  const chunkInserts: unknown[][] = [];
  const jobUpdates: unknown[][] = [];

  const db: WorkerDb & {
    queries: typeof queries;
    symbolInserts: typeof symbolInserts;
    chunkInserts: typeof chunkInserts;
    jobUpdates: typeof jobUpdates;
    state: DbState;
  } = {
    queries,
    symbolInserts,
    chunkInserts,
    jobUpdates,
    state,
    async query(sql: string, params: unknown[] = []) {
      const flat = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: flat, params });

      if (/^UPDATE index_jobs SET status = 'running'/i.test(flat)) {
        const job = state.job;
        state.job = null; // ayni job iki kez claim edilmez
        return { rows: job ? [job] : [], rowCount: job ? 1 : 0 };
      }
      if (/^UPDATE index_jobs/i.test(flat)) {
        jobUpdates.push(params);
        return { rows: [], rowCount: 1 };
      }
      if (/FROM repository_snapshots WHERE id/i.test(flat)) {
        return { rows: state.snapshot ? [state.snapshot] : [], rowCount: state.snapshot ? 1 : 0 };
      }
      if (/FROM repository_snapshots/i.test(flat)) {
        return { rows: state.previousSnapshots.slice(0, 1), rowCount: state.previousSnapshots.length ? 1 : 0 };
      }
      if (/FROM files WHERE snapshot_id = \$1 ORDER BY path/i.test(flat)) {
        return { rows: state.files, rowCount: state.files.length };
      }
      if (/SELECT path FROM files/i.test(flat)) {
        return { rows: state.previousFiles.map((path) => ({ path })), rowCount: state.previousFiles.length };
      }
      if (/FROM parser_versions/i.test(flat)) {
        return { rows: state.parserVersions, rowCount: state.parserVersions.length };
      }
      // carryOver'in kopyalayacagi eski satirlar.
      if (/^SELECT symbol_id FROM symbols/i.test(flat)) {
        return { rows: [{ symbol_id: "sym_old_1" }, { symbol_id: "sym_old_2" }], rowCount: 2 };
      }
      if (/^SELECT id FROM chunks/i.test(flat)) {
        return { rows: [{ id: "chunk_old_1" }], rowCount: 1 };
      }
      if (/INSERT INTO symbols/i.test(flat)) {
        symbolInserts.push(params);
        return { rows: [], rowCount: 1 };
      }
      if (/INSERT INTO chunks/i.test(flat)) {
        chunkInserts.push(params);
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  };
  return db;
}

const CAPS: AdapterCapabilities = {
  kind: "local",
  writable: false,
  hasHistory: true,
  canFetch: false,
  readCost: "local"
};

function createAdapter(
  contents: Record<string, string>,
  options: { changed?: string[]; failRead?: string[] } = {}
): RepositoryAdapter & { connected: boolean; disconnected: boolean } {
  const adapter = {
    connected: false,
    disconnected: false,
    capabilities: CAPS,
    async connect() {
      adapter.connected = true;
    },
    async disconnect() {
      adapter.disconnected = true;
    },
    async metadata() {
      return {
        kind: "local" as const,
        defaultBranch: null,
        currentBranch: "main",
        currentCommit: "b".repeat(40),
        remoteUrl: null
      };
    },
    async currentCommit() {
      return "b".repeat(40);
    },
    async branch() {
      return "main";
    },
    async *listFiles() {},
    async readFile(p: string) {
      if (options.failRead?.includes(p)) throw new AdapterError("TOO_LARGE", "cok buyuk", p);
      const content = contents[p];
      if (content === undefined) throw new AdapterError("NOT_FOUND", "yok", p);
      return { path: p, content, contentHash: "h".repeat(64), sizeBytes: content.length, redacted: false };
    },
    async changedFiles() {
      return options.changed ?? [];
    },
    async diff() {
      return "";
    },
    async fetch() {},
    async checkout() {}
  };
  return adapter;
}

function createWorker(db: WorkerDb, adapter: RepositoryAdapter) {
  return new IndexWorker({
    db,
    workerId: "worker_test",
    async openAdapter() {
      return adapter;
    }
  });
}

describe("IndexWorker — gerçek iş yapar", { timeout: 60_000 }, () => {
  it("job'ı claim eder ve sembolleri VERİTABANINA yazar", async () => {
    const db = createDb();
    const adapter = createAdapter({ "src/a.ts": TS_FILE });

    const result = await createWorker(db, adapter).runOnce();

    expect(result.claimed).toBe(true);
    expect(result.status).toBe("completed");
    // Eski worker'in yapmadigi sey.
    expect(db.symbolInserts.length).toBeGreaterThan(0);
    expect(result.symbolsWritten).toBe(db.symbolInserts.length);
    expect(result.chunksWritten).toBeGreaterThan(0);
  });

  it("kuyruk boşsa idle döner ve hiçbir şey yazmaz", async () => {
    const db = createDb({ job: null });
    const result = await createWorker(db, createAdapter({})).runOnce();

    expect(result.claimed).toBe(false);
    expect(result.status).toBe("idle");
    expect(db.symbolInserts.length).toBe(0);
  });

  it("kuyruktan alırken SKIP LOCKED kullanır (iki worker aynı job'ı almaz)", async () => {
    const db = createDb();
    await createWorker(db, createAdapter({ "src/a.ts": TS_FILE })).runOnce();

    const claim = db.queries.find((q) => /UPDATE index_jobs SET status = 'running'/i.test(q.sql));
    expect(claim?.sql).toContain("FOR UPDATE SKIP LOCKED");
  });

  it("tamamlanan job'a KANIT yazar (yalnız sayı değil)", async () => {
    const db = createDb();
    await createWorker(db, createAdapter({ "src/a.ts": TS_FILE })).runOnce();

    const completion = db.jobUpdates.find((p) => String(p[1]).includes("symbolsWritten"));
    expect(completion).toBeDefined();
    const evidence = JSON.parse(String(completion?.[1]));
    expect(evidence.symbolsWritten).toBeGreaterThan(0);
    expect(evidence.chunksWritten).toBeGreaterThan(0);
    expect(evidence.mode).toBe("full");
    expect(typeof evidence.planReason).toBe("string");
  });

  it("adapter'ı açar ve iş bitince kapatır", async () => {
    const db = createDb();
    const adapter = createAdapter({ "src/a.ts": TS_FILE });
    await createWorker(db, adapter).runOnce();

    expect(adapter.connected).toBe(true);
    expect(adapter.disconnected).toBe(true);
  });
});

describe("IndexWorker — negatif: kanıtsız tamamlanamaz", { timeout: 60_000 }, () => {
  it("hiçbir dosya işlenemediyse job completed OLMAZ", async () => {
    const db = createDb();
    // Dosya var ama okunamiyor: eski worker bunu "0 dosya islendi, basarili"
    // sayardi.
    const adapter = createAdapter({}, { failRead: ["src/a.ts"] });

    const result = await createWorker(db, adapter).runOnce();

    expect(result.status).not.toBe("completed");
    expect(result.error).toContain("hicbiri islenemedi");
  });

  it("sembol de chunk da yazılmadıysa NoRealWorkError fırlatır", () => {
    const result = emptyResult({ filesParsed: 3, symbolsWritten: 0, chunksWritten: 0 });
    expect(() => assertRealWork(result, 3)).toThrow(NoRealWorkError);
  });

  it("hata mesajı P00 bulgusuna atıf yapar (regresyonun adı konur)", () => {
    const result = emptyResult({ filesParsed: 3, symbolsWritten: 0, chunksWritten: 0 });
    expect(() => assertRealWork(result, 3)).toThrow(/kalici yazim kaniti/i);
  });

  it("sembol yok ama chunk varsa geçerlidir (düz metin dosyası)", () => {
    const result = emptyResult({ filesParsed: 1, symbolsWritten: 0, chunksWritten: 4 });
    expect(() => assertRealWork(result, 1)).not.toThrow();
  });

  it("ayrıştırılacak dosya yoksa kural uygulanmaz", () => {
    const result = emptyResult({});
    expect(() => assertRealWork(result, 0)).not.toThrow();
  });

  it("snapshot'a bağlı olmayan job reddedilir", async () => {
    const db = createDb({
      job: {
        id: "job_x",
        project_id: "proj_1",
        organization_id: "org_a",
        snapshot_id: null,
        job_phase: "index",
        attempts: 1,
        max_attempts: 3
      }
    });

    const result = await createWorker(db, createAdapter({})).runOnce();
    expect(result.status).not.toBe("completed");
    expect(result.error).toContain("snapshot");
  });

  it("failed snapshot index'lenmez", async () => {
    const db = createDb({
      snapshot: {
        id: "snap_1",
        repository_id: "repo_1",
        organization_id: "org_a",
        commit_sha: "b".repeat(40),
        status: "failed"
      }
    });

    const result = await createWorker(db, createAdapter({ "src/a.ts": TS_FILE })).runOnce();
    expect(result.status).not.toBe("completed");
    expect(result.error).toContain("failed durumda");
  });
});

describe("IndexWorker — hata ve retry", { timeout: 60_000 }, () => {
  it("deneme hakkı kalmışsa job kuyruğa geri döner", async () => {
    const db = createDb({ snapshot: null });
    const result = await createWorker(db, createAdapter({})).runOnce();

    expect(result.status).toBe("retry");
    const update = db.jobUpdates.find((p) => p[1] === "queued");
    expect(update).toBeDefined();
  });

  it("deneme hakkı bittiyse job failed olur (sonsuz döngü yok)", async () => {
    const db = createDb({
      snapshot: null,
      job: {
        id: "job_1",
        project_id: "proj_1",
        organization_id: "org_a",
        snapshot_id: "snap_1",
        job_phase: "index",
        attempts: 3,
        max_attempts: 3
      }
    });

    const result = await createWorker(db, createAdapter({})).runOnce();

    expect(result.status).toBe("failed");
    expect(db.jobUpdates.some((p) => p[1] === "failed")).toBe(true);
  });

  it("hata sebebini job'a yazar (sessizce kaybolmaz)", async () => {
    const db = createDb({ snapshot: null });
    await createWorker(db, createAdapter({})).runOnce();

    const update = db.jobUpdates.find((p) => String(p[2] ?? "").includes("Snapshot bulunamadi"));
    expect(update).toBeDefined();
  });

  it("hata olsa da adapter kapatılır", async () => {
    const db = createDb({ files: [] });
    const adapter = createAdapter({});
    // loadFiles bos donunce is biter; yine de disconnect cagrilmali.
    await createWorker(db, adapter).runOnce();
    expect(adapter.disconnected).toBe(true);
  });
});

describe("IndexWorker — artımlı çalıştırma", { timeout: 60_000 }, () => {
  it("değişmeyen dosyaları ayrıştırmaz, kopyalar", async () => {
    const files = Array.from({ length: 10 }, (_, i) => ({
      id: `f_${i}`,
      path: `src/f${i}.ts`,
      language: "typescript",
      is_binary: false,
      size_bytes: 100
    }));

    // Onceki snapshot'in parser surumleri BUGUNKULERLE ayni olmali; aksi
    // halde planner (dogru olarak) tam re-index'e duser. Surumleri sabit
    // yazmak testi kirilgan yapardi, registry'den okunur.
    const registry = createDefaultRegistry();
    await registry.initialize();
    const parserVersions = Object.entries(registry.versions()).map(([parser_id, version]) => ({
      parser_id,
      version
    }));

    const db = createDb({
      files,
      previousSnapshots: [{ id: "snap_prev", commit_sha: "a".repeat(40) }],
      previousFiles: files.map((f) => f.path as string),
      parserVersions
    });

    const contents: Record<string, string> = {};
    for (const f of files) contents[f.path as string] = TS_FILE;

    const adapter = createAdapter(contents, { changed: ["src/f0.ts"] });
    const worker = new IndexWorker({
      db,
      registry,
      workerId: "worker_test",
      async openAdapter() {
        return adapter;
      }
    });

    const result = await worker.runOnce();

    expect(result.status).toBe("completed");
    expect(result.mode).toBe("incremental");
    // 10 dosyanin 1'i degisti: yalnizca o ayristirilir.
    expect(result.filesParsed).toBe(1);
    expect(result.filesCarriedOver).toBe(9);
    expect(result.workRatio).toBeLessThanOrEqual(0.1);
    // Kopyalama gercekten oldu mu: carryOver sorgulari calisti mi?
    expect(db.queries.some((q) => /INSERT INTO symbols .* unnest/is.test(q.sql))).toBe(true);
  });

  it("parser sürümü değiştiyse artımlı yola girmez", async () => {
    const files = [{ id: "f_0", path: "src/f0.ts", language: "typescript", is_binary: false, size_bytes: 100 }];
    const db = createDb({
      files,
      previousSnapshots: [{ id: "snap_prev", commit_sha: "a".repeat(40) }],
      previousFiles: ["src/f0.ts"],
      parserVersions: [{ parser_id: "typescript", version: "0.0.1-eski" }]
    });

    const adapter = createAdapter({ "src/f0.ts": TS_FILE }, { changed: [] });
    const result = await createWorker(db, adapter).runOnce();

    expect(result.mode).toBe("full");
    expect(result.planReason).toContain("parser surumu degisti");
  });
});

describe("selectFilesToParse", () => {
  const files = [
    { fileId: "f1", path: "a.ts", language: null, isBinary: false, sizeBytes: 1 },
    { fileId: "f2", path: "b.ts", language: null, isBinary: false, sizeBytes: 1 }
  ];

  it("tam re-index'te hepsini seçer", () => {
    const plan = {
      mode: "full" as const,
      reason: "",
      filesToParse: [],
      filesToCarryOver: [],
      deletedPaths: [],
      invalidations: [],
      totalFiles: 2,
      workRatio: 1
    };
    expect(selectFilesToParse(files, plan).length).toBe(2);
  });

  it("artımlıda yalnız plandakileri seçer", () => {
    const plan = {
      mode: "incremental" as const,
      reason: "",
      filesToParse: ["b.ts"],
      filesToCarryOver: ["a.ts"],
      deletedPaths: [],
      invalidations: [],
      totalFiles: 2,
      workRatio: 0.5
    };
    expect(selectFilesToParse(files, plan).map((f) => f.path)).toEqual(["b.ts"]);
  });
});

function emptyResult(overrides: Partial<IndexWorkerRunResult>): IndexWorkerRunResult {
  return {
    claimed: true,
    jobId: "job_1",
    status: "completed",
    mode: "full",
    planReason: "test",
    filesParsed: 0,
    filesCarriedOver: 0,
    symbolsWritten: 0,
    symbolsCarriedOver: 0,
    chunksWritten: 0,
    chunksCarriedOver: 0,
    workRatio: 1,
    failures: [],
    error: null,
    ...overrides
  };
}
