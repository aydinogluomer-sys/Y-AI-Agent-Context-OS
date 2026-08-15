import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createIntegrationDb, type IntegrationDb } from "../integration/setup";
import { seedTenant, seedGraphNode, seedGraphEdge } from "../integration/seed";
import { GraphTraversal } from "@y/graph/traversal";

/**
 * P19 / T4 — T-02 CROSS-TENANT İZOLASYONU.
 *
 * ## Neden bu test canlı veritabanı gerektirir
 *
 * `traversal.test.ts` sorgunun **şeklini** doğruluyor: `organization_id`
 * predikatının hem anchor hem recursive terimde geçtiğini metin olarak
 * arıyor. Bu iyi bir kontrol ama **yetersiz**: predikatın yazılmış olması,
 * özyineleme sırasında gerçekten uygulandığını kanıtlamaz.
 *
 * Klasik izolasyon kaçağı tam burada olur: predikat yalnız anchor'da
 * çalışır, başlangıç düğümü doğru tenant'tadır, ama özyineleme bir kenar
 * üzerinden **başka tenant'ın düğümüne** geçer. Sorgu metni doğru görünür,
 * sonuç sızdırır.
 *
 * Bu test iki tenant arasında **gerçek bir köprü kenarı** kurar ve
 * traversal'ın oradan geçmediğini sonuçla gösterir.
 */

const ORG_A = "org_a";
const ORG_B = "org_b";
const SNAPSHOT_A = "snap_a";
const SNAPSHOT_B = "snap_b";

async function seedTwoTenants(db: IntegrationDb): Promise<void> {
  // Iki tenant AYNI snapshot kimligini paylasamaz (FK repository'ye
  // baglı ve repository tenant'a ait). Bu yuzden her tenant kendi
  // snapshot'ini alir; kopru kenar YINE DE kurulabilir cunku kenar
  // yalniz metin kimlik tasiyor.
  const a = await seedTenant(db, ORG_A, SNAPSHOT_A);
  const b = await seedTenant(db, ORG_B, SNAPSHOT_B);

  // A tenant'i: a1 -> a2 -> a3
  for (const id of ["a1", "a2", "a3"]) await seedGraphNode(db, a, id);
  await seedGraphEdge(db, SNAPSHOT_A, ORG_A, "e_a1_a2", "a1", "a2");
  await seedGraphEdge(db, SNAPSHOT_A, ORG_A, "e_a2_a3", "a2", "a3");

  // B tenant'i: b1 -> b2
  for (const id of ["b1", "b2"]) await seedGraphNode(db, b, id);
  await seedGraphEdge(db, SNAPSHOT_B, ORG_B, "e_b1_b2", "b1", "b2");

  /*
   * KOPRU KENARLAR - saldiri yuzeyi.
   *
   * Iki ayri kacak yolu deneniyor:
   *
   *  1. `e_bridge_org`  A'nin SNAPSHOT'inda ama B'nin ORG'unda.
   *     Org predikati ozyinelemede calismazsa a2 -> b2 gecisi olur.
   *
   *  2. `e_bridge_snap` A'nin ORG'unda ama B'nin SNAPSHOT'inda.
   *     Snapshot predikati ozyinelemede calismazsa yine gecis olur.
   *
   * Ikisi de gercek bir hatali sync ya da kotu niyetli yazimla olusabilir.
   */
  await seedGraphEdge(db, SNAPSHOT_A, ORG_B, "e_bridge_org", "a2", "b2");
  await seedGraphEdge(db, SNAPSHOT_B, ORG_A, "e_bridge_snap", "a2", "b1");
}

describe("T-02 — traversal başka tenant'a GEÇMEZ", () => {
  let db: IntegrationDb;
  let traversal: GraphTraversal;

  beforeAll(async () => {
    db = await createIntegrationDb("tenant-isolation.spec.ts");
    await db.migrate();
    await seedTwoTenants(db);
    traversal = new GraphTraversal({
      query: (sql: string, params?: unknown[]) => db.query(sql, params)
    });
  });

  afterAll(async () => {
    await db?.close();
  });

  it("POZİTİF KONTROL: kendi tenant'ı içinde GERÇEKTEN gezer", async () => {
    // Bu kontrol olmadan asagidaki testler, traversal hic calismasa da
    // gecerdi: bos sonuc "sizinti yok" gibi gorunur.
    const result = await traversal.traverse({
      snapshotId: SNAPSHOT_A,
      organizationId: ORG_A,
      seeds: ["a1"],
      direction: "forward",
      maxDepth: 3
    });

    const ids = result.nodes.map((n) => n.nodeIdentifier).sort();
    expect(ids).toEqual(["a1", "a2", "a3"]);
  });

  it("KÖPRÜ KENARDAN başka tenant'ın düğümüne GEÇMEZ", async () => {
    // `e_bridge` a2 -> b2 isaret ediyor ama ORG_B'ye ait. A tenant'i
    // icin gorunmez olmali.
    const result = await traversal.traverse({
      snapshotId: SNAPSHOT_A,
      organizationId: ORG_A,
      seeds: ["a1"],
      direction: "forward",
      maxDepth: 5
    });

    const ids = result.nodes.map((n) => n.nodeIdentifier);
    expect(ids).not.toContain("b2");
    expect(ids).not.toContain("b1");
  });

  it("B tenant'ı A'nın düğümlerini görmez", async () => {
    const result = await traversal.traverse({
      // B kendi snapshot'inda sorgular; A'nin snapshot'ini kullanmak
      // testin olcmek istedigi seyi degistirirdi.
      snapshotId: SNAPSHOT_B,
      organizationId: ORG_B,
      seeds: ["b1"],
      direction: "forward",
      maxDepth: 5
    });

    const ids = result.nodes.map((n) => n.nodeIdentifier).sort();
    expect(ids).toEqual(["b1", "b2"]);
  });

  it("başka tenant'ın düğümü SEED olarak verilse bile sonuç boş", async () => {
    // Saldirgan dogru org ile kimliklenip BASKA org'un dugum kimligini
    // seed olarak gonderirse: anchor predikati onu bulamaz.
    const result = await traversal.traverse({
      snapshotId: SNAPSHOT_A,
      organizationId: ORG_A,
      seeds: ["b1", "b2"],
      direction: "forward",
      maxDepth: 5
    });

    expect(result.nodes).toEqual([]);
  });

  it("ters yönde de sızıntı yok", async () => {
    // Ileri yonde kapali olup ters yonde acik kalmak, kolay kacirilan
    // bir asimetridir.
    const result = await traversal.traverse({
      snapshotId: SNAPSHOT_A,
      organizationId: ORG_A,
      seeds: ["a3"],
      direction: "reverse",
      maxDepth: 5
    });

    const ids = result.nodes.map((n) => n.nodeIdentifier);
    expect(ids).toContain("a1");
    expect(ids).not.toContain("b1");
    expect(ids).not.toContain("b2");
  });

  it("çift yönde de sızıntı yok", async () => {
    const result = await traversal.traverse({
      snapshotId: SNAPSHOT_A,
      organizationId: ORG_A,
      seeds: ["a2"],
      direction: "both",
      maxDepth: 5
    });

    const ids = result.nodes.map((n) => n.nodeIdentifier);
    expect(ids.sort()).toEqual(["a1", "a2", "a3"]);
  });
});

describe("T-02 — döngü ve derinlik sınırları GERÇEK veride", () => {
  let db: IntegrationDb;
  let traversal: GraphTraversal;
  const SNAP = "snap_cycle";

  beforeAll(async () => {
    db = await createIntegrationDb("tenant-cycles.spec.ts");
    await db.migrate();

    const t = await seedTenant(db, ORG_A, SNAP);
    for (const id of ["c1", "c2", "c3"]) await seedGraphNode(db, t, id);

    // Dongu: c1 -> c2 -> c3 -> c1
    await seedGraphEdge(db, SNAP, ORG_A, "e_c1", "c1", "c2");
    await seedGraphEdge(db, SNAP, ORG_A, "e_c2", "c2", "c3");
    await seedGraphEdge(db, SNAP, ORG_A, "e_c3", "c3", "c1");

    traversal = new GraphTraversal({
      query: (sql: string, params?: unknown[]) => db.query(sql, params)
    });
  });

  afterAll(async () => {
    await db?.close();
  });

  it("döngü SONSUZ DÖNGÜYE girmez", async () => {
    // `visited` dizisi olmadan bu sorgu asla bitmezdi. Sorgu seklini
    // okumak bunu KANITLAMAZ; yalniz calistirmak kanitlar.
    const result = await traversal.traverse({
      snapshotId: SNAP,
      organizationId: ORG_A,
      seeds: ["c1"],
      direction: "forward",
      maxDepth: 10
    });

    const ids = result.nodes.map((n) => n.nodeIdentifier).sort();
    expect(ids).toEqual(["c1", "c2", "c3"]);
  });

  it("derinlik sınırı GERÇEKTEN uygulanır", async () => {
    const result = await traversal.traverse({
      snapshotId: SNAP,
      organizationId: ORG_A,
      seeds: ["c1"],
      direction: "forward",
      maxDepth: 1
    });

    const ids = result.nodes.map((n) => n.nodeIdentifier).sort();
    expect(ids).toEqual(["c1", "c2"]);
  });
});
