/**
 * P05 / Y-P05-007 — Impact analizi testleri.
 *
 * P00 bulgusu: güven skorları sabit atanıyordu (`0.9`, `0.85`, `0.7`).
 * Bu testler skorun artık ÖLÇÜLDÜĞÜNÜ, yani girdi değişince skorun da
 * değiştiğini kanıtlar. Sabit bir skor bu testlerin çoğunu kıramaz —
 * kırabilenler bilerek eklendi.
 */

import { describe, it, expect } from "vitest";
import { analyzeImpact, computeImpactConfidence, type ImpactConfidenceBasis } from "./impact";
import type { TraversalResult } from "@y/shared";

function traversal(overrides: Partial<TraversalResult> = {}): TraversalResult {
  return {
    nodes: [
      { nodeIdentifier: "file:src/a.ts", nodeKind: "file", label: "a", path: "src/a.ts", depth: 0, viaSeed: "file:src/a.ts" },
      { nodeIdentifier: "file:src/b.ts", nodeKind: "file", label: "b", path: "src/b.ts", depth: 1, viaSeed: "file:src/a.ts" }
    ],
    edges: [
      { source: "file:src/b.ts", target: "file:src/a.ts", edgeKind: "imports", confidence: 0.9, depth: 1 }
    ],
    truncated: false,
    truncationReason: null,
    depthReached: 1,
    visitedCount: 2,
    ...overrides
  };
}

const BASE = {
  changedPaths: ["src/a.ts"],
  unresolvedImportRatio: 0
};

describe("analyzeImpact — etkilenenler", () => {
  it("seed'in kendisini etkilenen SAYMAZ", () => {
    const result = analyzeImpact({ ...BASE, traversal: traversal() });

    expect(result.affectedPaths).toEqual(["src/b.ts"]);
    expect(result.affectedNodes).not.toContain("file:src/a.ts");
  });

  it("test dosyalarını ayrı listeler", () => {
    const result = analyzeImpact({
      ...BASE,
      traversal: traversal({
        nodes: [
          { nodeIdentifier: "file:src/a.ts", nodeKind: "file", label: "a", path: "src/a.ts", depth: 0, viaSeed: "file:src/a.ts" },
          { nodeIdentifier: "file:src/a.test.ts", nodeKind: "test", label: "t", path: "src/a.test.ts", depth: 1, viaSeed: "file:src/a.ts" }
        ]
      })
    });

    expect(result.affectedTests).toEqual(["src/a.test.ts"]);
  });

  it("doküman ve ADR'leri ayrı listeler", () => {
    const result = analyzeImpact({
      ...BASE,
      traversal: traversal({
        nodes: [
          { nodeIdentifier: "file:src/a.ts", nodeKind: "file", label: "a", path: "src/a.ts", depth: 0, viaSeed: "file:src/a.ts" },
          { nodeIdentifier: "file:docs/x.md", nodeKind: "documentation", label: "x", path: "docs/x.md", depth: 1, viaSeed: "file:src/a.ts" },
          { nodeIdentifier: "file:docs/adr/adr-1.md", nodeKind: "adr", label: "adr", path: "docs/adr/adr-1.md", depth: 2, viaSeed: "file:src/a.ts" }
        ]
      })
    });

    expect([...result.affectedDocs].sort()).toEqual(["docs/adr/adr-1.md", "docs/x.md"]);
  });

  it("aynı yolu iki kez listelemez", () => {
    const result = analyzeImpact({
      ...BASE,
      traversal: traversal({
        nodes: [
          { nodeIdentifier: "file:src/a.ts", nodeKind: "file", label: "a", path: "src/a.ts", depth: 0, viaSeed: "file:src/a.ts" },
          { nodeIdentifier: "symbol:src/b.ts#f", nodeKind: "function", label: "f", path: "src/b.ts", depth: 1, viaSeed: "file:src/a.ts" },
          { nodeIdentifier: "symbol:src/b.ts#g", nodeKind: "function", label: "g", path: "src/b.ts", depth: 1, viaSeed: "file:src/a.ts" }
        ]
      })
    });

    expect(result.affectedPaths).toEqual(["src/b.ts"]);
  });
});

describe("computeImpactConfidence — SABİT DEĞİL, ölçülen", () => {
  function basis(overrides: Partial<ImpactConfidenceBasis> = {}): ImpactConfidenceBasis {
    return {
      maxDepth: 1,
      weakestEdgeConfidence: 1,
      meanEdgeConfidence: 1,
      unresolvedImportRatio: 0,
      truncated: false,
      seedsResolved: 1,
      seedsRequested: 1,
      ...overrides
    };
  }

  it("kusursuz girdide tam güven", () => {
    expect(computeImpactConfidence(basis())).toBe(1);
  });

  it("derinlik arttıkça güven DÜŞER", () => {
    const near = computeImpactConfidence(basis({ maxDepth: 1 }));
    const far = computeImpactConfidence(basis({ maxDepth: 4 }));
    expect(far).toBeLessThan(near);
  });

  it("en zayıf kenar zinciri belirler", () => {
    const strong = computeImpactConfidence(basis({ weakestEdgeConfidence: 0.95 }));
    const weak = computeImpactConfidence(basis({ weakestEdgeConfidence: 0.6 }));
    expect(weak).toBeLessThan(strong);
  });

  it("çözülemeyen import oranı güveni düşürür", () => {
    const complete = computeImpactConfidence(basis({ unresolvedImportRatio: 0 }));
    const incomplete = computeImpactConfidence(basis({ unresolvedImportRatio: 0.5 }));
    expect(incomplete).toBeLessThan(complete);
  });

  it("kesilmiş traversal güveni SERT düşürür", () => {
    const full = computeImpactConfidence(basis({ truncated: false }));
    const cut = computeImpactConfidence(basis({ truncated: true }));
    expect(cut).toBeLessThanOrEqual(full * 0.5);
  });

  it("bulunamayan seed güveni düşürür", () => {
    const all = computeImpactConfidence(basis({ seedsRequested: 4, seedsResolved: 4 }));
    const partial = computeImpactConfidence(basis({ seedsRequested: 4, seedsResolved: 1 }));
    expect(partial).toBeLessThan(all);
  });

  it("sonuç her zaman 0..1 aralığında", () => {
    const worst = computeImpactConfidence(
      basis({
        maxDepth: 20,
        weakestEdgeConfidence: 0.1,
        unresolvedImportRatio: 1,
        truncated: true,
        seedsRequested: 10,
        seedsResolved: 1
      })
    );
    expect(worst).toBeGreaterThanOrEqual(0);
    expect(worst).toBeLessThanOrEqual(1);
  });

  it("hiçbir girdi kombinasyonu 0.9/0.85/0.7 sabitine kilitlenmiyor", () => {
    // Eski kod bu uc degeri donduruyordu. Farkli girdiler farkli skorlar
    // uretmiyorsa "olculen" iddiasi bostur.
    const scores = new Set(
      [1, 2, 3].flatMap((depth) =>
        [1, 0.8, 0.6].map((edge) =>
          computeImpactConfidence(basis({ maxDepth: depth, weakestEdgeConfidence: edge }))
        )
      )
    );
    expect(scores.size).toBeGreaterThan(5);
  });
});

describe("analyzeImpact — caveat'lar", () => {
  it("kesilme caveat üretir", () => {
    const result = analyzeImpact({
      ...BASE,
      traversal: traversal({ truncated: true, truncationReason: "max_nodes" })
    });

    expect(result.truncated).toBe(true);
    expect(result.caveats.some((c) => /EKSIK/i.test(c))).toBe(true);
  });

  it("bulunamayan seed caveat üretir", () => {
    const result = analyzeImpact({
      ...BASE,
      changedPaths: ["src/a.ts", "src/yeni.ts", "src/yeni2.ts"],
      traversal: traversal()
    });

    expect(result.caveats.some((c) => /graf'ta bulunamadi/i.test(c))).toBe(true);
  });

  it("yüksek çözülemeyen import oranı caveat üretir", () => {
    const result = analyzeImpact({ ...BASE, traversal: traversal(), unresolvedImportRatio: 0.4 });
    expect(result.caveats.some((c) => /cozulemedi/i.test(c))).toBe(true);
  });

  it("zayıf kenar caveat üretir", () => {
    const result = analyzeImpact({
      ...BASE,
      traversal: traversal({
        edges: [
          { source: "file:src/b.ts", target: "file:src/a.ts", edgeKind: "tests", confidence: 0.6, depth: 1 }
        ]
      })
    });

    expect(result.caveats.some((c) => /tahmin edilmis/i.test(c))).toBe(true);
  });

  it("kusursuz analizde caveat yok", () => {
    expect(analyzeImpact({ ...BASE, traversal: traversal() }).caveats).toEqual([]);
  });
});

describe("analyzeImpact — gerekçe taşınır", () => {
  it("confidenceBasis skorun tüm girdilerini taşır", () => {
    const result = analyzeImpact({ ...BASE, traversal: traversal(), unresolvedImportRatio: 0.1 });

    expect(result.confidenceBasis).toMatchObject({
      maxDepth: 1,
      weakestEdgeConfidence: 0.9,
      unresolvedImportRatio: 0.1,
      truncated: false,
      seedsRequested: 1
    });
  });

  it("kenarsız traversal'da güven varsayılan 1'den başlar", () => {
    const result = analyzeImpact({ ...BASE, traversal: traversal({ edges: [] }) });
    expect(result.confidenceBasis.weakestEdgeConfidence).toBe(1);
  });

  it("aynı girdi aynı skoru verir (determinizm)", () => {
    const a = analyzeImpact({ ...BASE, traversal: traversal() });
    const b = analyzeImpact({ ...BASE, traversal: traversal() });
    expect(a.confidence).toBe(b.confidence);
  });
});
