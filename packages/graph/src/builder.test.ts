/**
 * P05 / Y-P05-003 — Graph builder testleri.
 *
 * Odak: grafın artık `context_items`'tan değil `symbols`/`files`'tan
 * üretildiği, sync'in yıkıcı olmadığı ve çözülemeyen import'ların
 * SAYILDIĞI (uyarıya dönüşmediği).
 */

import { describe, it, expect } from "vitest";
import {
  GraphBuilder,
  classifyFileNode,
  resolveImportTargets,
  testTargetOf,
  type GraphDb
} from "./builder";
import { computeEdgeConfidence, fileNodeId, symbolNodeId } from "@y/shared";

interface State {
  files: any[];
  symbols: any[];
  existingNodes: any[];
}

function createDb(state: Partial<State> = {}) {
  const full: State = {
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
      },
      {
        symbol_id: "sym_2",
        path: "src/b.ts",
        language: "typescript",
        symbol_type: "class",
        symbol_name: "Hesap",
        start_line: 1,
        end_line: 8,
        is_exported: true,
        imports: ["./a"],
        file_id: "f_b"
      }
    ],
    existingNodes: [],
    ...state
  };

  const queries: { sql: string; params: unknown[] }[] = [];
  const db: GraphDb & { queries: typeof queries; state: State } = {
    queries,
    state: full,
    async query(sql: string, params: unknown[] = []) {
      const flat = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: flat, params });

      if (/COUNT\(\*\)::int AS count FROM symbols/i.test(flat)) {
        return { rows: [{ count: full.symbols.length }], rowCount: 1 };
      }
      if (/FROM files WHERE snapshot_id/i.test(flat)) {
        const only = params[1] as string[] | null;
        const rows = only ? full.files.filter((f) => only.includes(f.path)) : full.files;
        return { rows, rowCount: rows.length };
      }
      if (/FROM symbols WHERE snapshot_id/i.test(flat)) {
        const only = params[1] as string[] | null;
        const rows = only ? full.symbols.filter((s) => only.includes(s.path)) : full.symbols;
        return { rows, rowCount: rows.length };
      }
      if (/SELECT node_identifier, node_kind, path FROM graph_nodes/i.test(flat)) {
        const keep = params[2] as string[];
        const rows = full.existingNodes.filter((n) => !keep.includes(n.node_identifier));
        return { rows, rowCount: rows.length };
      }
      return { rows: [], rowCount: 1 };
    }
  };
  return db;
}

const OPTIONS = {
  organizationId: "org_a",
  projectId: "proj_1",
  repositoryId: "repo_1",
  snapshotId: "snap_1"
};

describe("GraphBuilder — kaynak symbols/files (ADR-022)", () => {
  it("node'ları symbols ve files tablolarından üretir", async () => {
    const db = createDb();
    const result = await new GraphBuilder(db).build(OPTIONS);

    // repository + 2 dosya + 2 sembol.
    expect(result.nodeCount).toBe(5);

    // context_items'a HIC dokunulmamali.
    expect(db.queries.some((q) => /context_items/i.test(q.sql))).toBe(false);
  });

  it("dosya düğümlerini sembollerine bağlar", async () => {
    const db = createDb();
    await new GraphBuilder(db).build(OPTIONS);

    const inserts = db.queries.filter((q) => /INSERT INTO graph_edges/i.test(q.sql));
    const pairs = inserts.map((q) => `${q.params[4]} -> ${q.params[5]}`);

    expect(pairs).toContain(`${fileNodeId("src/a.ts")} -> ${symbolNodeId("src/a.ts", "topla")}`);
  });

  it("import kenarını GERÇEKTEN var olan dosyaya çözer", async () => {
    const db = createDb();
    await new GraphBuilder(db).build(OPTIONS);

    const importEdge = db.queries.find(
      (q) => /INSERT INTO graph_edges/i.test(q.sql) && q.params[6] === "imports"
    );

    expect(importEdge?.params[4]).toBe(fileNodeId("src/b.ts"));
    expect(importEdge?.params[5]).toBe(fileNodeId("src/a.ts"));
  });

  it("her node ve edge organization_id ve snapshot_id taşır (T-02)", async () => {
    const db = createDb();
    await new GraphBuilder(db).build(OPTIONS);

    for (const q of db.queries.filter((x) => /INSERT INTO graph_(nodes|edges)/i.test(x.sql))) {
      expect(q.params).toContain("org_a");
      expect(q.params).toContain("snap_1");
    }
  });
});

describe("GraphBuilder — yıkıcı olmayan sync (ADR-023)", () => {
  it("tüm edge tablosunu SİLMEZ; yalnız yeniden yazılacak kaynakları siler", async () => {
    const db = createDb();
    await new GraphBuilder(db).build(OPTIONS);

    const deletes = db.queries.filter((q) => /^DELETE FROM graph_edges/i.test(q.sql));
    for (const del of deletes) {
      // Eski kod `DELETE FROM graph_edges ... WHERE relationship IN (...)`
      // yapiyordu: kapsam TUM iliskilerdi. Simdi her silme bir kimlik
      // listesiyle sinirli.
      expect(del.sql).toMatch(/source = ANY|target = ANY|node_identifier = ANY/);
    }
  });

  it("node yazımı UPSERT'tir (aynı build iki kez çalışırsa kopya olmaz)", async () => {
    const db = createDb();
    await new GraphBuilder(db).build(OPTIONS);

    const insert = db.queries.find((q) => /INSERT INTO graph_nodes/i.test(q.sql));
    expect(insert?.sql).toContain("ON CONFLICT");
    expect(insert?.sql).toContain("DO UPDATE SET");
  });

  it("kaybolan node için tombstone bırakır, sessizce silmez", async () => {
    const db = createDb({
      existingNodes: [
        { node_identifier: "file:src/silinen.ts", node_kind: "file", path: "src/silinen.ts" }
      ]
    });

    const result = await new GraphBuilder(db).build(OPTIONS);

    expect(result.tombstoneCount).toBe(1);
    const tombstone = db.queries.find((q) => /INSERT INTO graph_tombstones/i.test(q.sql));
    expect(tombstone?.params).toContain("file:src/silinen.ts");
  });
});

describe("GraphBuilder — çözülemeyen import'lar ÖLÇÜLÜR", () => {
  it("çözülemeyen göreceli import'u sayar", async () => {
    const db = createDb({
      symbols: [
        {
          symbol_id: "sym_1",
          path: "src/a.ts",
          language: "typescript",
          symbol_type: "function",
          symbol_name: "f",
          start_line: 1,
          end_line: 2,
          is_exported: false,
          imports: ["./yok-boyle-bir-dosya"],
          file_id: "f_a"
        }
      ]
    });

    const result = await new GraphBuilder(db).build(OPTIONS);

    // Eski kod bunu console.warn ile geciyordu; artik sayi.
    expect(result.unresolvedImports).toBe(1);
    expect(result.totalImports).toBe(1);
    expect(result.unresolvedRatio).toBe(1);
  });

  it("paket import'unu çözülemeyen SAYMAZ", async () => {
    const db = createDb({
      symbols: [
        {
          symbol_id: "sym_1",
          path: "src/a.ts",
          language: "typescript",
          symbol_type: "function",
          symbol_name: "f",
          start_line: 1,
          end_line: 2,
          is_exported: false,
          imports: ["react", "@y/shared"],
          file_id: "f_a"
        }
      ]
    });

    const result = await new GraphBuilder(db).build(OPTIONS);
    // `react` repo dosyasi degil; kayip degil, KAPSAM DISI.
    expect(result.unresolvedImports).toBe(0);
  });

  it("oranı graph_build_runs kaydına yazar", async () => {
    const db = createDb();
    await new GraphBuilder(db).build(OPTIONS);

    const complete = db.queries.find((q) => /UPDATE graph_build_runs SET status = 'completed'/i.test(q.sql));
    expect(complete).toBeDefined();
    expect(complete?.sql).toContain("unresolved_imports");
  });
});

describe("GraphBuilder — hata yolları", () => {
  it("sembol index'i olmayan snapshot'ta HATA verir (boş graf üretmez)", async () => {
    const db = createDb({ symbols: [] });
    await expect(new GraphBuilder(db).build(OPTIONS)).rejects.toThrow(/sembol index'i yok/i);
  });

  it("hata durumunda build run failed işaretlenir", async () => {
    const db = createDb({ symbols: [] });
    await expect(new GraphBuilder(db).build(OPTIONS)).rejects.toBeTruthy();

    const failed = db.queries.find((q) => /UPDATE graph_build_runs SET status = 'failed'/i.test(q.sql));
    expect(failed).toBeDefined();
  });
});

describe("GraphBuilder — artımlı mod", () => {
  it("yalnız verilen yolların node'larını üretir", async () => {
    const db = createDb();
    const result = await new GraphBuilder(db).build({ ...OPTIONS, onlyPaths: ["src/a.ts"] });

    expect(result.mode).toBe("incremental");
    // repository + src/a.ts + topla
    expect(result.nodeCount).toBe(3);
  });

  it("artımlı modda sembol index'i kontrolü yapılmaz", async () => {
    // Kapsamdaki dosyada sembol olmayabilir; bu hata degildir.
    const db = createDb({ symbols: [] });
    const result = await new GraphBuilder(db).build({ ...OPTIONS, onlyPaths: ["src/a.ts"] });
    expect(result.mode).toBe("incremental");
  });
});

describe("deriveGraph — saf türetme", () => {
  const builder = new GraphBuilder(createDb());

  it("kendine kenar üretmez", () => {
    const { edges } = builder.deriveGraph(
      [{ fileId: "f", path: "src/a.ts", language: "ts", parseConfidence: 1, parseStatus: "parsed" }],
      [],
      OPTIONS
    );
    for (const edge of edges) expect(edge.source).not.toBe(edge.target);
  });

  it("aynı çift birden çok kanıttan gelirse en güçlü kanıt kazanır", () => {
    const files = [
      { fileId: "f1", path: "src/a.ts", language: "ts", parseConfidence: 1, parseStatus: "parsed" },
      { fileId: "f2", path: "src/a.test.ts", language: "ts", parseConfidence: 1, parseStatus: "parsed" }
    ];
    const symbols = [
      {
        symbolId: "s1",
        path: "src/a.test.ts",
        language: "ts",
        symbolType: "function",
        symbolName: "t",
        startLine: 1,
        endLine: 2,
        isExported: false,
        imports: ["./a"],
        fileId: "f2"
      }
    ];

    const { edges } = builder.deriveGraph(files, symbols, OPTIONS);
    const between = edges.filter(
      (e) => e.source === fileNodeId("src/a.test.ts") && e.target === fileNodeId("src/a.ts")
    );

    // imports (import_specifier, 0.9) ve tests (test_convention, 0.6)
    // FARKLI edge turleri: ikisi de kalir.
    expect(between.length).toBe(2);
    const kinds = between.map((e) => e.edgeKind).sort();
    expect(kinds).toEqual(["imports", "tests"]);
  });

  it("düşük parse confidence edge güvenini düşürür", () => {
    const files = [
      { fileId: "f1", path: "src/a.ts", language: "ts", parseConfidence: 1, parseStatus: "parsed" },
      { fileId: "f2", path: "src/b.ts", language: "ts", parseConfidence: 0.4, parseStatus: "parsed" }
    ];
    const symbols = [
      {
        symbolId: "s1",
        path: "src/b.ts",
        language: "ts",
        symbolType: "function",
        symbolName: "f",
        startLine: 1,
        endLine: 2,
        isExported: false,
        imports: ["./a"],
        fileId: "f2"
      }
    ];

    const { edges } = builder.deriveGraph(files, symbols, OPTIONS);
    const importEdge = edges.find((e) => e.edgeKind === "imports");

    // Sabit 0.9 degil: 0.9 * 0.4.
    expect(importEdge?.confidence).toBeCloseTo(0.36, 5);
  });
});

describe("computeEdgeConfidence — ölçülen güven", () => {
  it("yapısal kanıt tam güven verir", () => {
    expect(computeEdgeConfidence({ derivedFrom: "file_containment" })).toBe(1);
  });

  it("konvansiyon en zayıf kanıttır", () => {
    const convention = computeEdgeConfidence({ derivedFrom: "test_convention" });
    const structural = computeEdgeConfidence({ derivedFrom: "import_specifier" });
    expect(convention).toBeLessThan(structural);
  });

  it("belirsiz çözümleme güveni düşürür", () => {
    const certain = computeEdgeConfidence({ derivedFrom: "import_specifier", candidateCount: 1 });
    const ambiguous = computeEdgeConfidence({ derivedFrom: "import_specifier", candidateCount: 3 });
    expect(ambiguous).toBeLessThan(certain);
  });

  it("sonuç her zaman 0..1 aralığında", () => {
    const extreme = computeEdgeConfidence({
      derivedFrom: "test_convention",
      candidateCount: 100,
      parseConfidence: 0
    });
    expect(extreme).toBeGreaterThanOrEqual(0);
    expect(extreme).toBeLessThanOrEqual(1);
  });
});

describe("classifyFileNode", () => {
  it("migration dosyasını tanır", () => {
    expect(classifyFileNode("migrations/0001_x.sql")).toBe("migration");
  });

  it("test dosyasını tanır", () => {
    expect(classifyFileNode("src/a.test.ts")).toBe("test");
    expect(classifyFileNode("tests/unit/x.ts")).toBe("test");
  });

  it("ADR'yi dokümandan ayırır", () => {
    expect(classifyFileNode("docs/adr/adr-001-x.md")).toBe("adr");
    expect(classifyFileNode("docs/rehber.md")).toBe("documentation");
  });

  it("yapılandırma dosyasını tanır", () => {
    expect(classifyFileNode("tsconfig.json")).toBe("configuration");
    expect(classifyFileNode("ci/pipeline.yaml")).toBe("configuration");
  });

  it("diğerlerine file der", () => {
    expect(classifyFileNode("src/a.ts")).toBe("file");
  });
});

describe("resolveImportTargets", () => {
  const paths = new Set(["src/a.ts", "src/util/index.ts", "src/b.ts"]);

  it("var olan dosyayı çözer", () => {
    expect(resolveImportTargets("src/b.ts", "./a", paths)).toEqual(["src/a.ts"]);
  });

  it("index dosyasını çözer", () => {
    expect(resolveImportTargets("src/b.ts", "./util", paths)).toEqual(["src/util/index.ts"]);
  });

  it("VAR OLMAYAN dosyayı çözmez (aday üretip bırakmaz)", () => {
    expect(resolveImportTargets("src/b.ts", "./yok", paths)).toEqual([]);
  });

  it("paket adını çözmez", () => {
    expect(resolveImportTargets("src/b.ts", "react", paths)).toEqual([]);
  });

  it("repo kökünün dışına çıkmaz", () => {
    expect(resolveImportTargets("a.ts", "../../gizli", paths)).toEqual([]);
  });
});

describe("testTargetOf", () => {
  const paths = new Set(["src/a.ts", "src/a.test.ts", "src/b.tsx", "src/b.test.tsx"]);

  it("test dosyasının kaynağını bulur", () => {
    expect(testTargetOf("src/a.test.ts", paths)).toBe("src/a.ts");
  });

  it("tsx için de çalışır", () => {
    expect(testTargetOf("src/b.test.tsx", paths)).toBe("src/b.tsx");
  });

  it("test olmayan dosyada null döner", () => {
    expect(testTargetOf("src/a.ts", paths)).toBeNull();
  });

  it("karşılığı olmayan test dosyasında null döner", () => {
    expect(testTargetOf("src/yok.test.ts", paths)).toBeNull();
  });
});
