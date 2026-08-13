/**
 * P04 / Y-P04-010 — Incremental index testleri.
 *
 * Kabul kriteri (P04 §Acceptance 5): 10.000 dosyalık bir repo'da tek dosya
 * değişikliği, tam re-index'in %1'inden azı kadar iş yapmalı. Bu dosyadaki
 * ölçüm testi bunu SAYIYLA doğrular — bir belge cümlesiyle değil.
 */

import { describe, it, expect } from "vitest";
import { IncrementalIndexPlanner, resolveImportCandidates, type PlanParams } from "./invalidation";
import { AdapterError, type AdapterCapabilities, type RepositoryAdapter } from "../repo/adapter";

interface FakeState {
  /** repository_snapshots satırları (en yeni önce). */
  snapshots: { id: string; commit_sha: string }[];
  /** Önceki snapshot'ın dosya yolları. */
  previousFiles: string[];
  /** Önceki snapshot'ın sembol import kayıtları. */
  symbolImports: { path: string; imports: string[] }[];
  parserVersions: { parser_id: string; version: string }[];
}

function createDb(state: Partial<FakeState> = {}) {
  const full: FakeState = {
    snapshots: [{ id: "snap_prev", commit_sha: "a".repeat(40) }],
    previousFiles: [],
    symbolImports: [],
    parserVersions: [{ parser_id: "typescript", version: "1.0.0" }],
    ...state
  };

  const queries: { sql: string; params: unknown[] }[] = [];

  const db = {
    queries,
    state: full,
    async query(sql: string, params: unknown[] = []) {
      queries.push({ sql: sql.replace(/\s+/g, " ").trim(), params });

      if (/FROM repository_snapshots/i.test(sql)) {
        return { rows: full.snapshots.slice(0, 1), rowCount: full.snapshots.length ? 1 : 0 };
      }
      if (/SELECT path FROM files/i.test(sql)) {
        return { rows: full.previousFiles.map((path) => ({ path })), rowCount: full.previousFiles.length };
      }
      if (/FROM parser_versions/i.test(sql)) {
        return { rows: full.parserVersions, rowCount: full.parserVersions.length };
      }
      if (/SELECT DISTINCT path, imports FROM symbols/i.test(sql)) {
        return { rows: full.symbolImports, rowCount: full.symbolImports.length };
      }
      if (/SELECT symbol_id FROM symbols/i.test(sql)) {
        return { rows: [{ symbol_id: "sym_old_1" }, { symbol_id: "sym_old_2" }], rowCount: 2 };
      }
      if (/SELECT id FROM chunks/i.test(sql)) {
        return { rows: [{ id: "chunk_old_1" }], rowCount: 1 };
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

function createAdapter(changed: string[], options: { hasHistory?: boolean; failDiff?: boolean } = {}): RepositoryAdapter {
  return {
    capabilities: { ...CAPS, hasHistory: options.hasHistory ?? true },
    async connect() {},
    async disconnect() {},
    async metadata() {
      return { kind: "local", defaultBranch: null, currentBranch: "main", currentCommit: "b".repeat(40), remoteUrl: null };
    },
    async currentCommit() {
      return "b".repeat(40);
    },
    async branch() {
      return "main";
    },
    async *listFiles() {},
    async readFile() {
      throw new AdapterError("NOT_FOUND", "kullanilmiyor");
    },
    async changedFiles() {
      if (options.failDiff) throw new AdapterError("REMOTE_ERROR", "git diff basarisiz");
      return changed;
    },
    async diff() {
      return "";
    },
    async fetch() {},
    async checkout() {}
  };
}

function params(overrides: Partial<PlanParams> = {}): PlanParams {
  return {
    organizationId: "org_a",
    repositoryId: "repo_1",
    toSnapshotId: "snap_new",
    toCommitSha: "b".repeat(40),
    currentPaths: ["src/a.ts", "src/b.ts", "src/c.ts"],
    parserVersions: { typescript: "1.0.0" },
    ...overrides
  };
}

describe("IncrementalIndexPlanner — tam re-index koşulları", () => {
  it("önceki snapshot yoksa tam re-index yapar", async () => {
    const db = createDb({ snapshots: [] });
    const plan = await new IncrementalIndexPlanner(db).plan(createAdapter([]), params());

    expect(plan.mode).toBe("full");
    expect(plan.reason).toContain("ilk index");
    expect(plan.filesToParse.length).toBe(3);
  });

  it("adapter git geçmişi taşımıyorsa tam re-index yapar", async () => {
    const db = createDb({ previousFiles: ["src/a.ts"] });
    const plan = await new IncrementalIndexPlanner(db).plan(
      createAdapter([], { hasHistory: false }),
      params()
    );

    expect(plan.mode).toBe("full");
    expect(plan.reason).toContain("gecmisi");
  });

  it("parser sürümü değiştiyse tam re-index yapar (bayat sembol riski)", async () => {
    const db = createDb({
      previousFiles: ["src/a.ts", "src/b.ts", "src/c.ts"],
      parserVersions: [{ parser_id: "typescript", version: "0.9.0" }]
    });

    const plan = await new IncrementalIndexPlanner(db).plan(createAdapter(["src/a.ts"]), params());

    expect(plan.mode).toBe("full");
    expect(plan.reason).toContain("0.9.0 -> 1.0.0");
  });

  it("yeni bir parser eklendiyse tam re-index yapar", async () => {
    const db = createDb({ previousFiles: ["src/a.ts", "src/b.ts", "src/c.ts"] });
    const plan = await new IncrementalIndexPlanner(db).plan(
      createAdapter(["src/a.ts"]),
      params({ parserVersions: { typescript: "1.0.0", python: "1.0.0" } })
    );

    expect(plan.mode).toBe("full");
    expect(plan.reason).toContain("python yeni eklendi");
  });

  it("diff alınamazsa GÜVENLİ tarafa düşer ve sebebi yazar", async () => {
    const db = createDb({ previousFiles: ["src/a.ts", "src/b.ts", "src/c.ts"] });
    const plan = await new IncrementalIndexPlanner(db).plan(
      createAdapter([], { failDiff: true }),
      params()
    );

    expect(plan.mode).toBe("full");
    // Hata SESSIZCE yutulmaz; sebep okunabilir olmali.
    expect(plan.reason).toContain("git diff basarisiz");
  });

  it("değişim oranı eşiği aşarsa tam re-index yapar", async () => {
    const db = createDb({ previousFiles: ["src/a.ts", "src/b.ts", "src/c.ts"] });
    const plan = await new IncrementalIndexPlanner(db).plan(
      createAdapter(["src/a.ts", "src/b.ts"]),
      params()
    );

    expect(plan.mode).toBe("full");
    expect(plan.reason).toContain("esik");
  });

  it("commit değişmemişse artımlı yola girmez", async () => {
    const db = createDb({ snapshots: [{ id: "snap_prev", commit_sha: "b".repeat(40) }] });
    const plan = await new IncrementalIndexPlanner(db).plan(createAdapter([]), params());

    expect(plan.mode).toBe("full");
    expect(plan.reason).toContain("commit degismemis");
  });
});

describe("IncrementalIndexPlanner — artımlı plan", () => {
  const CURRENT = ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts", "src/e.ts"];

  it("yalnız değişen dosyayı yeniden ayrıştırır", async () => {
    const db = createDb({ previousFiles: CURRENT });
    const plan = await new IncrementalIndexPlanner(db).plan(
      createAdapter(["src/a.ts"]),
      params({ currentPaths: CURRENT })
    );

    expect(plan.mode).toBe("incremental");
    expect(plan.filesToParse).toEqual(["src/a.ts"]);
    expect([...plan.filesToCarryOver].sort()).toEqual(["src/b.ts", "src/c.ts", "src/d.ts", "src/e.ts"]);
  });

  it("değişen dosyayı import edeni de yeniden ayrıştırır", async () => {
    const db = createDb({
      previousFiles: CURRENT,
      symbolImports: [
        { path: "src/b.ts", imports: ["./a"] },
        { path: "src/c.ts", imports: ["react"] }
      ]
    });

    const plan = await new IncrementalIndexPlanner(db).plan(
      createAdapter(["src/a.ts"]),
      params({ currentPaths: CURRENT })
    );

    expect([...plan.filesToParse].sort()).toEqual(["src/a.ts", "src/b.ts"]);
    const dependent = plan.invalidations.find((i) => i.path === "src/b.ts");
    expect(dependent?.reason).toBe("dependent");
    expect(dependent?.triggeredBy).toBe("src/a.ts");
    expect(dependent?.depth).toBe(1);
  });

  it("derinlik sınırı aşılmaz (zincir sonsuz büyümez)", async () => {
    const db = createDb({
      previousFiles: CURRENT,
      symbolImports: [
        { path: "src/b.ts", imports: ["./a"] },
        { path: "src/c.ts", imports: ["./b"] },
        { path: "src/d.ts", imports: ["./c"] }
      ]
    });

    const plan = await new IncrementalIndexPlanner(db, { maxDependencyDepth: 1 }).plan(
      createAdapter(["src/a.ts"]),
      params({ currentPaths: CURRENT })
    );

    expect([...plan.filesToParse].sort()).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("derinlik artırılınca zincir genişler", async () => {
    const db = createDb({
      previousFiles: CURRENT,
      symbolImports: [
        { path: "src/b.ts", imports: ["./a"] },
        { path: "src/c.ts", imports: ["./b"] }
      ]
    });

    const plan = await new IncrementalIndexPlanner(db, { maxDependencyDepth: 2 }).plan(
      createAdapter(["src/a.ts"]),
      params({ currentPaths: CURRENT })
    );

    expect([...plan.filesToParse].sort()).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
    expect(plan.invalidations.find((i) => i.path === "src/c.ts")?.depth).toBe(2);
  });

  it("yeni eklenen dosyayı added olarak işaretler", async () => {
    const previous = ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"];
    const db = createDb({ previousFiles: previous });

    const plan = await new IncrementalIndexPlanner(db).plan(
      createAdapter(["src/e.ts"]),
      params({ currentPaths: CURRENT })
    );

    expect(plan.filesToParse).toContain("src/e.ts");
    expect(plan.invalidations.find((i) => i.path === "src/e.ts")?.reason).toBe("added");
  });

  it("silinen dosyayı deleted olarak işaretler ve parse listesine koymaz", async () => {
    const previous = [...CURRENT, "src/silinen.ts"];
    const db = createDb({ previousFiles: previous });

    const plan = await new IncrementalIndexPlanner(db).plan(
      createAdapter(["src/silinen.ts"]),
      params({ currentPaths: CURRENT })
    );

    expect(plan.deletedPaths).toEqual(["src/silinen.ts"]);
    expect(plan.filesToParse).not.toContain("src/silinen.ts");
    expect(plan.invalidations.find((i) => i.path === "src/silinen.ts")?.reason).toBe("deleted");
  });

  it("diff'te görünmeyen ama önceki snapshot'ta da olmayan dosyayı ayrıştırır", async () => {
    // Kaynak satiri yok; kopyalanamaz. Sessizce atlanmasi bos sembol birakirdi.
    const db = createDb({ previousFiles: ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"] });

    const plan = await new IncrementalIndexPlanner(db).plan(
      createAdapter([]),
      params({ currentPaths: CURRENT })
    );

    expect(plan.filesToParse).toContain("src/e.ts");
    expect(plan.filesToCarryOver).not.toContain("src/e.ts");
  });
});

describe("IncrementalIndexPlanner — kabul kriteri ölçümü", () => {
  it("10.000 dosyalık repo'da tek dosya değişimi tam re-index'in %1'inden azı", async () => {
    const paths = Array.from({ length: 10_000 }, (_, i) => `src/mod${i}/file${i}.ts`);
    // Degisen dosyayi 5 dosya import ediyor olsun.
    const importers = [1, 2, 3, 4, 5].map((i) => ({
      path: `src/mod${i}/file${i}.ts`,
      imports: ["../mod0/file0"]
    }));

    const db = createDb({ previousFiles: paths, symbolImports: importers });

    const plan = await new IncrementalIndexPlanner(db).plan(
      createAdapter(["src/mod0/file0.ts"]),
      params({ currentPaths: paths })
    );

    expect(plan.mode).toBe("incremental");
    expect(plan.totalFiles).toBe(10_000);
    // 1 degisen + 5 bagimli = 6 dosya.
    expect(plan.filesToParse.length).toBe(6);
    expect(plan.workRatio).toBeLessThan(0.01);
    expect(plan.filesToCarryOver.length).toBe(9_994);
  });

  it("tam re-index workRatio'su 1'dir (karşılaştırma tabanı)", async () => {
    const db = createDb({ snapshots: [] });
    const plan = await new IncrementalIndexPlanner(db).plan(createAdapter([]), params());
    expect(plan.workRatio).toBe(1);
  });
});

describe("IncrementalIndexPlanner — carryOver", () => {
  const CURRENT = ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts", "src/e.ts"];

  it("kopyalamayı TEK küme tabanlı INSERT ile yapar (satır satır değil)", async () => {
    const db = createDb({ previousFiles: CURRENT });
    const planner = new IncrementalIndexPlanner(db);
    const plan = await planner.plan(createAdapter(["src/a.ts"]), params({ currentPaths: CURRENT }));

    const copied = await planner.carryOver(plan, {
      fromSnapshotId: "snap_prev",
      toSnapshotId: "snap_new",
      toCommitSha: "b".repeat(40),
      repositoryId: "repo_1"
    });

    expect(copied.symbols).toBe(2);
    expect(copied.chunks).toBe(1);

    const symbolInserts = db.queries.filter((q) => /INSERT INTO symbols/i.test(q.sql));
    expect(symbolInserts.length).toBe(1);
    expect(symbolInserts[0].sql).toContain("unnest");
  });

  it("kopyalanan satırlara kriptografik yeni kimlik verir (ADR-013)", async () => {
    const db = createDb({ previousFiles: CURRENT });
    const planner = new IncrementalIndexPlanner(db);
    const plan = await planner.plan(createAdapter(["src/a.ts"]), params({ currentPaths: CURRENT }));

    await planner.carryOver(plan, {
      fromSnapshotId: "snap_prev",
      toSnapshotId: "snap_new",
      toCommitSha: "b".repeat(40),
      repositoryId: "repo_1"
    });

    const insert = db.queries.find((q) => /INSERT INTO symbols/i.test(q.sql));
    const newIds = insert?.params[4] as string[];
    expect(newIds.length).toBe(2);
    for (const id of newIds) expect(id).toMatch(/^sym_[0-9a-f-]{36}$/i);
    // Eski kimlikler yeniden kullanilmaz.
    expect(newIds).not.toContain("sym_old_1");
    // SQL'de random()/gen_random_uuid() ile PK uretilmez.
    expect(insert?.sql).not.toMatch(/gen_random_uuid|random\(\)/i);
  });

  it("kopyalanan dosyaların parse durumunu da taşır", async () => {
    const db = createDb({ previousFiles: CURRENT });
    const planner = new IncrementalIndexPlanner(db);
    const plan = await planner.plan(createAdapter(["src/a.ts"]), params({ currentPaths: CURRENT }));

    await planner.carryOver(plan, {
      fromSnapshotId: "snap_prev",
      toSnapshotId: "snap_new",
      toCommitSha: "b".repeat(40),
      repositoryId: "repo_1"
    });

    expect(db.queries.some((q) => /UPDATE files nf/i.test(q.sql))).toBe(true);
  });

  it("tam re-index planında hiçbir şey kopyalamaz", async () => {
    const db = createDb({ snapshots: [] });
    const planner = new IncrementalIndexPlanner(db);
    const plan = await planner.plan(createAdapter([]), params());

    const copied = await planner.carryOver(plan, {
      toSnapshotId: "snap_new",
      toCommitSha: "b".repeat(40),
      repositoryId: "repo_1"
    });

    expect(copied).toEqual({ symbols: 0, chunks: 0 });
  });
});

describe("IncrementalIndexPlanner — kayıt", () => {
  it("invalidation izlerini yazar", async () => {
    const db = createDb({ previousFiles: ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts", "src/e.ts"] });
    const planner = new IncrementalIndexPlanner(db);
    const p = params({ currentPaths: ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts", "src/e.ts"] });
    const plan = await planner.plan(createAdapter(["src/a.ts"]), p);

    const written = await planner.record(plan, { ...p, fromSnapshotId: "snap_prev" });

    expect(written).toBe(1);
    const insert = db.queries.find((q) => /INSERT INTO symbol_invalidations/i.test(q.sql));
    expect(insert?.params).toContain("src/a.ts");
    expect(insert?.params).toContain("changed");
  });
});

describe("resolveImportCandidates", () => {
  it("göreceli import'u dosya yoluna çözer", () => {
    expect(resolveImportCandidates("src/b.ts", "./a")).toContain("src/a.ts");
  });

  it("üst dizin geçişini çözer", () => {
    expect(resolveImportCandidates("src/deep/b.ts", "../a")).toContain("src/a.ts");
  });

  it("index dosyasını aday olarak üretir", () => {
    expect(resolveImportCandidates("src/b.ts", "./util")).toContain("src/util/index.ts");
  });

  it("Python paket dosyasını aday olarak üretir", () => {
    expect(resolveImportCandidates("src/b.py", "./util")).toContain("src/util/__init__.py");
  });

  it("paket adlarını çözmez", () => {
    expect(resolveImportCandidates("src/b.ts", "react")).toEqual([]);
    expect(resolveImportCandidates("src/b.ts", "@y/shared")).toEqual([]);
  });

  it("repo kökünün dışına çıkan yolu reddeder", () => {
    expect(resolveImportCandidates("a.ts", "../../../etc/passwd")).toEqual([]);
  });
});
