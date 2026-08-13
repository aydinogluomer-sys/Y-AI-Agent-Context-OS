/**
 * P05 / Y-P05-004, Y-P05-005 — Traversal testleri.
 *
 * BU TESTLERİN NEYİ DOĞRULADIĞI — VE NEYİ DOĞRULAMADIĞI
 *   Traversal'ın kendisi bir recursive CTE'dir; gerçek gezinme
 *   Postgres'te olur. Buradaki testler üç şeyi doğrular:
 *     1. Sorgunun ŞEKLİ (yön, org predicate'i, döngü koruması, bütçe).
 *     2. Girdi doğrulaması (org'suz traversal hata verir).
 *     3. Sonuç yorumlanması (kesilme `truncated` ile bildiriliyor mu).
 *
 *   DOĞRULAMADIĞI: CTE'nin Postgres'te gerçekten beklenen node kümesini
 *   döndürdüğü. Bu, canlı şema gerektirir ve P19 entegrasyon paketine
 *   bırakılmıştır. Bu ayrım burada açıkça yazılıdır çünkü "traversal
 *   testleri geçiyor" cümlesi, yanlış okunursa gezinmenin doğrulandığı
 *   izlenimi verir.
 */

import { describe, it, expect } from "vitest";
import { GraphTraversal, TraversalError, buildTraversalSql, type TraversalDb } from "./traversal";
import { DEFAULT_TRAVERSAL_LIMITS, type TraversalSpec } from "@y/shared";

function createDb(rows: any[] = []) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const db: TraversalDb & { calls: typeof calls } = {
    calls,
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      return { rows, rowCount: rows.length };
    }
  };
  return db;
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    node_identifier: "file:src/a.ts",
    via_seed: "file:src/b.ts",
    depth: 1,
    edge_source: "file:src/b.ts",
    edge_kind: "imports",
    edge_confidence: 0.9,
    fan_out_truncated: false,
    node_kind: "file",
    label: "src/a.ts",
    path: "src/a.ts",
    ...overrides
  };
}

const SPEC: TraversalSpec = {
  snapshotId: "snap_1",
  organizationId: "org_a",
  seeds: ["file:src/b.ts"],
  direction: "forward"
};

describe("GraphTraversal — girdi doğrulaması", () => {
  it("organizationId olmadan çalışmaz (T-02)", async () => {
    const traversal = new GraphTraversal(createDb());
    await expect(traversal.traverse({ ...SPEC, organizationId: "" })).rejects.toBeInstanceOf(
      TraversalError
    );
  });

  it("seed olmadan çalışmaz", async () => {
    const traversal = new GraphTraversal(createDb());
    await expect(traversal.traverse({ ...SPEC, seeds: [] })).rejects.toThrow(/seed/i);
  });

  it("snapshot olmadan çalışmaz", async () => {
    const traversal = new GraphTraversal(createDb());
    await expect(traversal.traverse({ ...SPEC, snapshotId: "" })).rejects.toThrow(/snapshot/i);
  });
});

describe("GraphTraversal — bütçeler zorunludur (T-06)", () => {
  it("varsayılan limitler uygulanır", async () => {
    const db = createDb();
    await new GraphTraversal(db).traverse(SPEC);

    const params = db.calls[0].params;
    expect(params[3]).toBe(DEFAULT_TRAVERSAL_LIMITS.maxDepth);
    expect(params[6]).toBe(DEFAULT_TRAVERSAL_LIMITS.fanOutBudget);
    // maxNodes + 1: limite TAKILDIGIMIZI anlamak icin bir fazla satir.
    expect(params[7]).toBe(DEFAULT_TRAVERSAL_LIMITS.maxNodes + 1);
  });

  it("çağıran daha dar limit verebilir", async () => {
    const db = createDb();
    await new GraphTraversal(db).traverse({ ...SPEC, maxDepth: 2, maxNodes: 10, fanOutBudget: 3 });

    const params = db.calls[0].params;
    expect(params[3]).toBe(2);
    expect(params[6]).toBe(3);
    expect(params[7]).toBe(11);
  });

  it("saçma limitler kırpılır (sınırsız traversal yok)", async () => {
    const db = createDb();
    await new GraphTraversal(db).traverse({
      ...SPEC,
      maxDepth: 10_000,
      maxNodes: 10_000_000,
      fanOutBudget: -5
    });

    const params = db.calls[0].params;
    expect(params[3]).toBe(32);
    expect(params[7]).toBe(100_001);
    expect(params[6]).toBe(1);
  });

  it("NaN limit varsayılana değil alt sınıra düşer", async () => {
    const db = createDb();
    await new GraphTraversal(db).traverse({ ...SPEC, maxDepth: Number.NaN });
    expect(db.calls[0].params[3]).toBe(1);
  });
});

describe("GraphTraversal — kesilme SESSİZ değildir", () => {
  it("maxNodes aşılırsa truncated true döner", async () => {
    const rows = Array.from({ length: 6 }, (_, i) => row({ node_identifier: `file:${i}.ts` }));
    const result = await new GraphTraversal(createDb(rows)).traverse({ ...SPEC, maxNodes: 5 });

    expect(result.truncated).toBe(true);
    expect(result.truncationReason).toBe("max_nodes");
    expect(result.nodes.length).toBe(5);
    // Gorulen satir sayisi ile dondurulen ayri raporlanir.
    expect(result.visitedCount).toBe(6);
  });

  it("fan-out bütçesi aşılırsa truncated true döner", async () => {
    const rows = [row(), row({ node_identifier: "file:c.ts", fan_out_truncated: true })];
    const result = await new GraphTraversal(createDb(rows)).traverse(SPEC);

    expect(result.truncated).toBe(true);
    expect(result.truncationReason).toBe("fan_out");
  });

  it("limite takılmayan sonuç truncated FALSE döner", async () => {
    const result = await new GraphTraversal(createDb([row()])).traverse({ ...SPEC, maxNodes: 100 });

    expect(result.truncated).toBe(false);
    expect(result.truncationReason).toBeNull();
  });

  it("graf tam da maxDepth'te bittiyse bu kesilme SAYILMAZ", async () => {
    // Derinlik sinirina degmek tek basina "daha fazlasi var" demek degil.
    const result = await new GraphTraversal(createDb([row({ depth: 2 })])).traverse({
      ...SPEC,
      maxDepth: 2,
      maxNodes: 100
    });

    expect(result.depthReached).toBe(2);
    expect(result.truncated).toBe(false);
  });
});

describe("GraphTraversal — sonuç yorumlanması", () => {
  it("node ve edge'leri ayırır", async () => {
    const rows = [
      row({ node_identifier: "file:src/b.ts", depth: 0, edge_source: null, edge_kind: null }),
      row()
    ];
    const result = await new GraphTraversal(createDb(rows)).traverse(SPEC);

    expect(result.nodes.length).toBe(2);
    // Seed satirinin kenari yoktur; edge listesine girmez.
    expect(result.edges.length).toBe(1);
    expect(result.edges[0]).toMatchObject({
      source: "file:src/b.ts",
      target: "file:src/a.ts",
      edgeKind: "imports"
    });
  });

  it("hangi seed'den ulaşıldığını taşır", async () => {
    const result = await new GraphTraversal(createDb([row()])).traverse(SPEC);
    expect(result.nodes[0].viaSeed).toBe("file:src/b.ts");
  });

  it("ulaşılan derinliği raporlar", async () => {
    const rows = [row({ depth: 1 }), row({ node_identifier: "file:c.ts", depth: 3 })];
    const result = await new GraphTraversal(createDb(rows)).traverse({ ...SPEC, maxDepth: 5 });
    expect(result.depthReached).toBe(3);
  });

  it("boş sonuç hata değildir", async () => {
    const result = await new GraphTraversal(createDb([])).traverse(SPEC);
    expect(result.nodes).toEqual([]);
    expect(result.truncated).toBe(false);
  });
});

describe("GraphTraversal — ters bağımlılık", () => {
  it("reverse yönü sorguda uygulanır", async () => {
    const db = createDb();
    await new GraphTraversal(db).reverseDependencies({
      snapshotId: "snap_1",
      organizationId: "org_a",
      seeds: ["file:src/a.ts"]
    });

    expect(db.calls[0].sql).toContain("e.target = frontier.node_identifier");
  });

  it("ayrı bir reverse_depends_on kenarı YAZILMAZ", () => {
    // Ters yon sorgu yonuyle elde edilir; ikinci bir satir tutulmaz.
    // Cift kayit zamanla celisir (ADR-023 gerekcesi).
    const forward = buildTraversalSql("forward");
    const reverse = buildTraversalSql("reverse");
    expect(forward).not.toContain("reverse_depends_on");
    expect(reverse).not.toContain("reverse_depends_on");
  });
});

describe("buildTraversalSql — sorgu şekli", () => {
  it("forward yönde source'tan target'a gider", () => {
    const sql = buildTraversalSql("forward");
    expect(sql).toContain("e.source = frontier.node_identifier");
    expect(sql).toContain("e.target");
  });

  it("both yönde her iki uçtan genişler", () => {
    const sql = buildTraversalSql("both");
    expect(sql).toContain("e.source = frontier.node_identifier OR e.target = frontier.node_identifier");
    expect(sql).toContain("CASE WHEN e.source = frontier.node_identifier");
  });

  it("org predicate'i HEM başlangıçta HEM özyinelemede var (T-02)", () => {
    const sql = buildTraversalSql("forward");
    // Yalniz baslangicta olmasi yetmez: bir kenar baska tenant'in
    // node'una isaret ediyorsa ozyineleme oraya gecerdi.
    expect(sql).toContain("n.organization_id = $2");
    expect(sql).toContain("e.organization_id = $2");
  });

  it("snapshot predicate'i her iki adımda var", () => {
    const sql = buildTraversalSql("forward");
    expect(sql).toContain("n.snapshot_id = $1");
    expect(sql).toContain("e.snapshot_id = $1");
  });

  it("döngü koruması içerir", () => {
    const sql = buildTraversalSql("forward");
    expect(sql).toContain("NOT (step.next_node = ANY(frontier.visited))");
  });

  it("derinlik sınırı özyinelemede uygulanır", () => {
    expect(buildTraversalSql("forward")).toContain("frontier.depth < $4");
  });

  it("fan-out bütçesi ROW_NUMBER ile uygulanır", () => {
    const sql = buildTraversalSql("forward");
    expect(sql).toContain("ROW_NUMBER()");
    expect(sql).toContain("step.rank <= $7");
  });

  it("edge türü ve minimum güven filtreleri var", () => {
    const sql = buildTraversalSql("forward");
    expect(sql).toContain("e.edge_kind = ANY($5::text[])");
    expect(sql).toContain("COALESCE(e.confidence, 0) >= $6");
  });

  it("UNION ALL kullanır (UNION farklı derinlikteki yolu kaybettirirdi)", () => {
    expect(buildTraversalSql("forward")).toContain("UNION ALL");
  });

  it("sonuç sınırı sorguda uygulanır", () => {
    expect(buildTraversalSql("forward")).toContain("LIMIT $8");
  });
});

describe("GraphTraversal — filtreler", () => {
  it("edge türü filtresi parametreye geçer", async () => {
    const db = createDb();
    await new GraphTraversal(db).traverse({ ...SPEC, edgeKinds: ["imports", "tests"] });
    expect(db.calls[0].params[4]).toEqual(["imports", "tests"]);
  });

  it("boş edge listesi 'filtre yok' anlamına gelir", async () => {
    const db = createDb();
    await new GraphTraversal(db).traverse({ ...SPEC, edgeKinds: [] });
    expect(db.calls[0].params[4]).toBeNull();
  });

  it("minimum güven parametreye geçer", async () => {
    const db = createDb();
    await new GraphTraversal(db).traverse({ ...SPEC, minConfidence: 0.75 });
    expect(db.calls[0].params[5]).toBe(0.75);
  });
});
