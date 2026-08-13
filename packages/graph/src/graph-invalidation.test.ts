/**
 * P05 / Y-P05-006 — Artımlı graf güncellemesi testleri.
 *
 * Kabul kriteri (P05 §Acceptance 4): tek dosya değişiminde dokunulan
 * node oranı toplamın %2'sinden az olmalı. Ölçüm testi bunu sayıyla
 * doğrular.
 */

import { describe, it, expect } from "vitest";
import { GraphInvalidator, type InvalidationDb } from "./graph-invalidation";

interface State {
  fileCount: number;
  completedBuild: any[];
  invalidations: { path: string; reason: string }[];
}

function createDb(state: Partial<State> = {}) {
  const full: State = {
    fileCount: 100,
    completedBuild: [
      { id: "gbr_1", node_count: 300, edge_count: 800, unresolved_imports: 5, total_imports: 100 }
    ],
    invalidations: [{ path: "src/a.ts", reason: "changed" }],
    ...state
  };

  const calls: { sql: string; params: unknown[] }[] = [];
  const db: InvalidationDb & { calls: typeof calls } = {
    calls,
    async query(sql: string, params: unknown[] = []) {
      const flat = sql.replace(/\s+/g, " ").trim();
      calls.push({ sql: flat, params });

      if (/COUNT\(\*\)::int AS count FROM files/i.test(flat)) {
        return { rows: [{ count: full.fileCount }], rowCount: 1 };
      }
      if (/FROM graph_build_runs/i.test(flat)) {
        return { rows: full.completedBuild, rowCount: full.completedBuild.length };
      }
      if (/FROM symbol_invalidations/i.test(flat)) {
        return { rows: full.invalidations, rowCount: full.invalidations.length };
      }
      return { rows: [], rowCount: 0 };
    }
  };
  return db;
}

const PARAMS = { organizationId: "org_a", snapshotId: "snap_1" };

describe("GraphInvalidator — tam build koşulları", () => {
  it("tamamlanmış build yoksa tam build yapar", async () => {
    const db = createDb({ completedBuild: [] });
    const plan = await new GraphInvalidator(db).plan(PARAMS);

    expect(plan.mode).toBe("full");
    expect(plan.reason).toContain("tamamlanmis graf build'i yok");
  });

  it("invalidation kaydı yoksa tam build yapar", async () => {
    const db = createDb({ invalidations: [] });
    const plan = await new GraphInvalidator(db).plan(PARAMS);

    expect(plan.mode).toBe("full");
    expect(plan.reason).toContain("invalidation kaydi yok");
  });

  it("P04 tam re-index yaptıysa graf de tam build yapar", async () => {
    const db = createDb({ invalidations: [{ path: "src/a.ts", reason: "full_reindex" }] });
    const plan = await new GraphInvalidator(db).plan(PARAMS);

    // Tum dosyalar yeniden ayristirildiysa artimli grafin anlami yok.
    expect(plan.mode).toBe("full");
  });

  it("etkilenen oran eşiği aşarsa tam build yapar", async () => {
    const db = createDb({
      fileCount: 10,
      invalidations: Array.from({ length: 5 }, (_, i) => ({ path: `src/f${i}.ts`, reason: "changed" }))
    });
    const plan = await new GraphInvalidator(db).plan(PARAMS);

    expect(plan.mode).toBe("full");
    expect(plan.reason).toContain("esik");
  });

  it("eşik çağıran tarafından daraltılabilir", async () => {
    const db = createDb({ fileCount: 100, invalidations: [{ path: "src/a.ts", reason: "changed" }] });
    const plan = await new GraphInvalidator(db).plan({ ...PARAMS, fullRebuildThreshold: 0.001 });

    expect(plan.mode).toBe("full");
  });
});

describe("GraphInvalidator — artımlı plan", () => {
  it("P04'ün invalidation listesini OKUR, yeniden hesaplamaz", async () => {
    const db = createDb();
    const plan = await new GraphInvalidator(db).plan(PARAMS);

    expect(plan.mode).toBe("incremental");
    expect(plan.affectedPaths).toEqual(["src/a.ts"]);

    // Ayni soruyu ikinci kez hesaplamak iki farkli cevap uretirdi;
    // sorgu symbol_invalidations'a gitmeli.
    expect(db.calls.some((c) => /FROM symbol_invalidations/i.test(c.sql))).toBe(true);
  });

  it("bağımlı dosyalar da kapsamdadır (P04 onları listeye koyar)", async () => {
    const db = createDb({
      invalidations: [
        { path: "src/a.ts", reason: "changed" },
        { path: "src/b.ts", reason: "dependent" }
      ]
    });
    const plan = await new GraphInvalidator(db).plan(PARAMS);

    expect([...plan.affectedPaths].sort()).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("silinen dosya kapsamdadır (kenarları sahipsiz kalmasın)", async () => {
    const db = createDb({
      invalidations: [{ path: "src/silinen.ts", reason: "deleted" }]
    });
    const plan = await new GraphInvalidator(db).plan(PARAMS);
    expect(plan.affectedPaths).toContain("src/silinen.ts");
  });

  it("sorgu organization_id ile sınırlıdır (T-02)", async () => {
    const db = createDb();
    await new GraphInvalidator(db).plan(PARAMS);

    const q = db.calls.find((c) => /FROM symbol_invalidations/i.test(c.sql));
    expect(q?.sql).toContain("organization_id = $2");
    expect(q?.params).toContain("org_a");
  });
});

describe("GraphInvalidator — kabul kriteri ölçümü", () => {
  it("10.000 dosyalık repo'da tek dosya değişimi < %2 dokunuş", async () => {
    const db = createDb({
      fileCount: 10_000,
      invalidations: [
        { path: "src/mod0/file0.ts", reason: "changed" },
        ...[1, 2, 3, 4, 5].map((i) => ({ path: `src/mod${i}/file${i}.ts`, reason: "dependent" }))
      ]
    });

    const plan = await new GraphInvalidator(db).plan(PARAMS);

    expect(plan.mode).toBe("incremental");
    expect(plan.affectedPaths.length).toBe(6);
    expect(plan.touchRatio).toBeLessThan(0.02);
  });

  it("tam build touchRatio'su 1'dir (karşılaştırma tabanı)", async () => {
    const db = createDb({ completedBuild: [] });
    const plan = await new GraphInvalidator(db).plan(PARAMS);
    expect(plan.touchRatio).toBe(1);
  });
});

describe("GraphInvalidator — son tamamlanmış build", () => {
  it("yalnız completed build'i döndürür", async () => {
    const db = createDb();
    await new GraphInvalidator(db).lastCompletedBuild("snap_1");

    const q = db.calls.find((c) => /FROM graph_build_runs/i.test(c.sql));
    // Yarim kalmis bir build eksik graf birakir; P06 onu kullanmamali.
    expect(q?.sql).toContain("status = 'completed'");
  });

  it("çözülemeyen import oranını hesaplar", async () => {
    const db = createDb();
    const build = await new GraphInvalidator(db).lastCompletedBuild("snap_1");
    expect(build?.unresolvedRatio).toBeCloseTo(0.05, 5);
  });

  it("hiç build yoksa null döner", async () => {
    const db = createDb({ completedBuild: [] });
    expect(await new GraphInvalidator(db).lastCompletedBuild("snap_1")).toBeNull();
  });

  it("total_imports sıfırsa oran sıfırdır (bölme hatası yok)", async () => {
    const db = createDb({
      completedBuild: [
        { id: "gbr_1", node_count: 3, edge_count: 2, unresolved_imports: 0, total_imports: 0 }
      ]
    });
    const build = await new GraphInvalidator(db).lastCompletedBuild("snap_1");
    expect(build?.unresolvedRatio).toBe(0);
  });
});
