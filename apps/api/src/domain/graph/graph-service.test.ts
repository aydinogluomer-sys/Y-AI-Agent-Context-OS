/**
 * P05 / Y-P05-009 — Graph servisi testleri.
 *
 * Odak: "graf yok" ile "bağımlılık yok" ayrımının korunması, tenant
 * sınırının scope'tan gelmesi ve rebuild'in HTTP isteği içinde
 * çalıştırılmaması (ADR-019).
 */

import { describe, it, expect } from "vitest";
import { GraphService, GraphServiceError, type Db } from "./graph-service";

interface State {
  snapshot: any[];
  build: any[];
  traversalRows: any[];
}

function createDb(overrides: Partial<State> = {}) {
  const state: State = {
    snapshot: [{ id: "snap_1", commit_sha: "c".repeat(40) }],
    build: [{ id: "gbr_1", node_count: 50, edge_count: 120, unresolved_imports: 2, total_imports: 40 }],
    traversalRows: [
      {
        node_identifier: "file:src/a.ts",
        via_seed: "file:src/b.ts",
        depth: 1,
        edge_source: "file:src/b.ts",
        edge_kind: "imports",
        edge_confidence: 0.9,
        fan_out_truncated: false,
        node_kind: "file",
        label: "src/a.ts",
        path: "src/a.ts"
      }
    ],
    ...overrides
  };

  const calls: { sql: string; params: unknown[] }[] = [];
  const db: Db & { calls: typeof calls } = {
    calls,
    async query(sql: string, params: unknown[] = []) {
      const flat = sql.replace(/\s+/g, " ").trim();
      calls.push({ sql: flat, params });

      if (/FROM repository_snapshots s/i.test(flat)) {
        return { rows: state.snapshot, rowCount: state.snapshot.length };
      }
      if (/FROM graph_build_runs/i.test(flat)) {
        return { rows: state.build, rowCount: state.build.length };
      }
      if (/WITH RECURSIVE frontier/i.test(flat)) {
        return { rows: state.traversalRows, rowCount: state.traversalRows.length };
      }
      return { rows: [], rowCount: 0 };
    }
  };
  return db;
}

const REQUEST = {
  organizationId: "org_a",
  projectId: "proj_1",
  seeds: ["file:src/b.ts"]
};

describe("GraphService — expand", () => {
  it("traversal sonucunu snapshot bilgisiyle döndürür", async () => {
    const result = await new GraphService(createDb()).expand(REQUEST);

    expect(result.snapshotId).toBe("snap_1");
    expect(result.commitSha).toBe("c".repeat(40));
    expect(result.nodes.length).toBe(1);
    expect(result.unresolvedImportRatio).toBeCloseTo(0.05, 5);
  });

  it("hazır snapshot yoksa NO_READY_SNAPSHOT", async () => {
    const service = new GraphService(createDb({ snapshot: [] }));
    await expect(service.expand(REQUEST)).rejects.toBeInstanceOf(GraphServiceError);
    await expect(service.expand(REQUEST)).rejects.toThrow(/hazir bir repository snapshot yok/i);
  });

  it("graf hiç üretilmemişse BOŞ SONUÇ dönmez, hata verir", async () => {
    // "Graf yok" ile "bagimlilik yok" ayni sey degil; bos sonuc donmek
    // ikincisi gibi okunurdu.
    const service = new GraphService(createDb({ build: [] }));
    await expect(service.expand(REQUEST)).rejects.toThrow(/tamamlanmis bir graf build'i yok/i);
  });

  it("snapshot sorgusu proje sahipliğini JOIN ile doğrular (T-01)", async () => {
    const db = createDb();
    await new GraphService(db).expand(REQUEST);

    const q = db.calls.find((c) => /FROM repository_snapshots s/i.test(c.sql));
    expect(q?.sql).toContain("JOIN repositories r ON r.id = s.repository_id");
    expect(q?.sql).toContain("r.project_id = $2");
    expect(q?.sql).toContain("s.organization_id = $1");
  });

  it("traversal'a giden organizationId çağrı parametresidir", async () => {
    const db = createDb();
    await new GraphService(db).expand(REQUEST);

    const traversal = db.calls.find((c) => /WITH RECURSIVE frontier/i.test(c.sql));
    expect(traversal?.params[1]).toBe("org_a");
  });

  it("geçersiz yön 400 sınıfı hata verir", async () => {
    const service = new GraphService(createDb());
    await expect(service.expand({ ...REQUEST, direction: "sideways" })).rejects.toThrow(
      /direction su degerlerden/i
    );
  });

  it("geçerli yönler kabul edilir", async () => {
    const service = new GraphService(createDb());
    for (const direction of ["forward", "reverse", "both"]) {
      await expect(service.expand({ ...REQUEST, direction })).resolves.toBeTruthy();
    }
  });

  it("bilinmeyen edge türü SESSİZCE yok sayılmaz", async () => {
    const service = new GraphService(createDb());
    await expect(service.expand({ ...REQUEST, edgeKinds: ["imports", "uydurma"] })).rejects.toThrow(
      /Bilinmeyen edge turu: uydurma/
    );
  });

  it("geçerli edge türleri traversal'a geçer", async () => {
    const db = createDb();
    await new GraphService(db).expand({ ...REQUEST, edgeKinds: ["imports", "tests"] });

    const traversal = db.calls.find((c) => /WITH RECURSIVE frontier/i.test(c.sql));
    expect(traversal?.params[4]).toEqual(["imports", "tests"]);
  });

  it("kesilme bilgisi çağırana taşınır", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      node_identifier: `file:${i}.ts`,
      via_seed: "file:src/b.ts",
      depth: 1,
      edge_source: "file:src/b.ts",
      edge_kind: "imports",
      edge_confidence: 0.9,
      fan_out_truncated: false,
      node_kind: "file",
      label: `${i}.ts`,
      path: `${i}.ts`
    }));

    const result = await new GraphService(createDb({ traversalRows: rows })).expand({
      ...REQUEST,
      limit: 2
    });

    expect(result.truncated).toBe(true);
    expect(result.truncationReason).toBe("max_nodes");
  });
});

describe("GraphService — rebuild (ADR-019)", () => {
  it("build'i ÇALIŞTIRMAZ, kuyruğa alır", async () => {
    const db = createDb();
    const result = await new GraphService(db).requestRebuild({
      organizationId: "org_a",
      projectId: "proj_1",
      jobId: "job_1"
    });

    expect(result.jobId).toBe("job_1");
    expect(result.snapshotId).toBe("snap_1");

    // Kuyruga kayit atilmali; graf uretimi HTTP istegi icinde OLMAMALI.
    const insert = db.calls.find((c) => /INSERT INTO index_jobs/i.test(c.sql));
    expect(insert?.sql).toContain("'graph'");
    expect(insert?.sql).toContain("'queued'");
    expect(db.calls.some((c) => /INSERT INTO graph_nodes/i.test(c.sql))).toBe(false);
  });

  it("hazır snapshot yoksa kuyruğa almaz", async () => {
    const service = new GraphService(createDb({ snapshot: [] }));
    await expect(
      service.requestRebuild({ organizationId: "org_a", projectId: "proj_1", jobId: "job_1" })
    ).rejects.toThrow(/Hazir snapshot yok/i);
  });
});

describe("GraphService — buildStatus", () => {
  it("son tamamlanmış build'i döndürür", async () => {
    const status = await new GraphService(createDb()).buildStatus("org_a", "proj_1");

    expect(status.snapshotId).toBe("snap_1");
    expect(status.lastBuild?.nodeCount).toBe(50);
    expect(status.lastBuild?.edgeCount).toBe(120);
  });

  it("snapshot yoksa null döner (hata değil)", async () => {
    const status = await new GraphService(createDb({ snapshot: [] })).buildStatus("org_a", "proj_1");
    expect(status.snapshotId).toBeNull();
    expect(status.lastBuild).toBeNull();
  });

  it("graf henüz üretilmemişse lastBuild null'dır", async () => {
    const status = await new GraphService(createDb({ build: [] })).buildStatus("org_a", "proj_1");
    expect(status.snapshotId).toBe("snap_1");
    expect(status.lastBuild).toBeNull();
  });
});
