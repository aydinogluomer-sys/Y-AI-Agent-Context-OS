/**
 * P05 / Y-P05-004, Y-P05-005 — Recursive CTE traversal (ADR-024).
 *
 * NEDEN POSTGRES, NEDEN AYRI BİR GRAPH DB DEĞİL
 *   Neo4j vb. bir graph store, traversal'ı hızlandırırdı ama üç şeyi
 *   ikiye bölerdi: tenant izolasyonu, yedekleme ve policy. Aynı erişim
 *   kuralının iki ayrı sistemde doğru uygulanmasını beklemek, er ya da geç
 *   birinin geride kalması demektir — ve geride kalan taraf veri sızdırır.
 *   Recursive CTE, bu ürünün graf boyutlarında (snapshot başına ~10^5
 *   kenar) yeterlidir ve tek store'da kalır.
 *
 * ESKİ HALİ
 *   `calculateImpactTrace` (packages/graph/src/index.ts:17-48) BFS'i
 *   UYGULAMA KATMANINDA yapıyordu: her seviye için ayrı sorgu, sonuçlar
 *   JS'te birleştiriliyordu. Derinlik 3'te bu N+1 sorgu demekti ve
 *   döngü tespiti yoktu.
 *
 * BÜTÇELER İSTEĞE BAĞLI DEĞİL (T-06)
 *   Yoğun bağlı bir graf'ta sınırsız traversal tüm tabloyu belleğe çeker.
 *   Her sorgu `maxDepth`, `maxNodes` ve `fanOutBudget` ile sınırlıdır.
 *   Sınıra takıldığında sonuç `truncated: true` döner — SESSİZCE EKSİK
 *   DÖNMEZ. Bu ayrım olmadan yarım bir impact analizi, tam bir analiz
 *   gibi görünür.
 *
 * TENANT İZOLASYONU
 *   `organization_id` predicate'i hem başlangıç hem özyineleme adımında
 *   uygulanır. Yalnız başlangıçta uygulamak yetmez: bir kenar başka
 *   tenant'ın node'una işaret ediyorsa özyineleme oraya geçerdi.
 */

import {
  DEFAULT_TRAVERSAL_LIMITS,
  type EdgeKind,
  type NodeKind,
  type TraversalResult,
  type TraversalSpec
} from "@y/shared";

export interface TraversalDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export class TraversalError extends Error {
  constructor(
    readonly code: "NO_SEEDS" | "INVALID_LIMIT" | "SNAPSHOT_REQUIRED" | "ORG_REQUIRED",
    message: string
  ) {
    super(message);
    this.name = "TraversalError";
  }
}

export class GraphTraversal {
  constructor(private readonly db: TraversalDb) {}

  async traverse(spec: TraversalSpec): Promise<TraversalResult> {
    assertSpec(spec);

    const maxDepth = clamp(spec.maxDepth ?? DEFAULT_TRAVERSAL_LIMITS.maxDepth, 1, 32);
    const maxNodes = clamp(spec.maxNodes ?? DEFAULT_TRAVERSAL_LIMITS.maxNodes, 1, 100_000);
    const fanOut = clamp(spec.fanOutBudget ?? DEFAULT_TRAVERSAL_LIMITS.fanOutBudget, 1, 10_000);
    const minConfidence = spec.minConfidence ?? 0;
    const edgeKinds = spec.edgeKinds && spec.edgeKinds.length > 0 ? [...spec.edgeKinds] : null;

    // Bir fazla satir isteriz: gelirse limite TAKILDIGIMIZI biliriz.
    // `rows.length === maxNodes` tek basina "tam da sigdi" ile
    // "kesildi"yi ayirt edemez.
    const probeLimit = maxNodes + 1;

    const sql = buildTraversalSql(spec.direction);
    const result = await this.db.query(sql, [
      spec.snapshotId,
      spec.organizationId,
      [...spec.seeds],
      maxDepth,
      edgeKinds,
      minConfidence,
      fanOut,
      probeLimit
    ]);

    const rows = result.rows;
    const truncatedByNodes = rows.length > maxNodes;
    const kept = truncatedByNodes ? rows.slice(0, maxNodes) : rows;

    const nodes = kept.map((row) => ({
      nodeIdentifier: row.node_identifier as string,
      nodeKind: (row.node_kind ?? "file") as NodeKind,
      label: (row.label ?? row.node_identifier) as string,
      path: (row.path ?? null) as string | null,
      depth: Number(row.depth),
      viaSeed: row.via_seed as string
    }));

    const edges = kept
      .filter((row) => row.edge_source !== null && row.edge_source !== undefined)
      .map((row) => ({
        source: row.edge_source as string,
        target: row.node_identifier as string,
        edgeKind: (row.edge_kind ?? "depends_on") as EdgeKind,
        confidence: row.edge_confidence === null ? 0 : Number(row.edge_confidence),
        depth: Number(row.depth)
      }));

    const depthReached = nodes.reduce((max, n) => Math.max(max, n.depth), 0);
    const truncatedByFanOut = kept.some((row) => Boolean(row.fan_out_truncated));

    const truncationReason: TraversalResult["truncationReason"] = truncatedByNodes
      ? "max_nodes"
      : truncatedByFanOut
        ? "fan_out"
        : depthReached >= maxDepth && kept.length > 0
          ? "max_depth"
          : null;

    return {
      nodes,
      edges,
      // `max_depth`'e degmek TEK BASINA kesilme demek degildir: graf tam da
      // o derinlikte bitmis olabilir. Bu yuzden derinlik sinirini
      // "kesildi" saymiyoruz; yalniz sebep alaninda gorunur.
      truncated: truncatedByNodes || truncatedByFanOut,
      truncationReason: truncatedByNodes || truncatedByFanOut ? truncationReason : null,
      depthReached,
      visitedCount: rows.length
    };
  }

  /**
   * Ters bağımlılıklar: "bu dosyayı kim import ediyor?"
   *
   * Ayrı bir `reverse_depends_on` kenarı YAZILMAZ; aynı gerçeğin iki
   * kaydı zamanla çelişir. Yön, sorguda değiştirilir ve bunun bedeli
   * `idx_graph_edges_reverse` indeksidir (migration 0059).
   */
  async reverseDependencies(
    spec: Omit<TraversalSpec, "direction">
  ): Promise<TraversalResult> {
    return this.traverse({ ...spec, direction: "reverse" });
  }
}

function assertSpec(spec: TraversalSpec): void {
  if (!spec.snapshotId) {
    throw new TraversalError("SNAPSHOT_REQUIRED", "Traversal bir snapshot'a bagli olmali.");
  }
  if (!spec.organizationId) {
    // Org predicate'i olmayan bir traversal, tenant sinirini yok sayar.
    // Bu bir varsayilan degil, HATA olmali (T-02).
    throw new TraversalError("ORG_REQUIRED", "Traversal organizationId olmadan calistirilamaz.");
  }
  if (spec.seeds.length === 0) {
    throw new TraversalError("NO_SEEDS", "En az bir seed node gerekli.");
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

/**
 * Recursive CTE.
 *
 * Döngü tespiti `visited` dizisiyle yapılır: bir node'a ikinci kez
 * ulaşılmaz. Dizi tabanlı kontrol, `UNION` yerine `UNION ALL` kullanmayı
 * ve yine de sonsuz döngüye girmemeyi sağlar — `UNION` farklı derinlikten
 * gelen aynı node'u eleyip yolu kaybettirirdi.
 *
 * Fan-out bütçesi her genişletme adımında `ROW_NUMBER()` ile uygulanır;
 * bütçeyi aşan komşular alınmaz ve satır `fan_out_truncated` ile
 * işaretlenir.
 */
export function buildTraversalSql(direction: TraversalSpec["direction"]): string {
  const joinCondition =
    direction === "forward"
      ? "e.source = frontier.node_identifier"
      : direction === "reverse"
        ? "e.target = frontier.node_identifier"
        : "(e.source = frontier.node_identifier OR e.target = frontier.node_identifier)";

  const nextNode =
    direction === "forward"
      ? "e.target"
      : direction === "reverse"
        ? "e.source"
        : "CASE WHEN e.source = frontier.node_identifier THEN e.target ELSE e.source END";

  /*
   * [P19/T5] TUM KIMLIK SUTUNLARI `text`'e CAST EDILIR.
   *
   * `graph_nodes.node_identifier` VARCHAR(1055), `graph_edges.source` ve
   * `.target` ise VARCHAR(255). PostgreSQL bir recursive CTE'de anchor ve
   * recursive terimlerin sutun tiplerini BIREBIR eslestirmek zorunda:
   *
   *   recursive query "frontier" column 1 has type character varying(1055)
   *   in non-recursive term but type character varying overall
   *
   * Yani bu sorgu HICBIR ZAMAN calismamisti. Birim testi yalniz SQL
   * METNINI kontrol ettigi icin (org predicate'i var mi, LIMIT var mi)
   * hatayi goremedi — ilk gercek Postgres kosusu (T5) yakaladi.
   *
   * `::text` cast'i uzunluk kisitini kaldirir ve iki tarafi ayni tipe
   * getirir. Sutun uzunluklarini esitlemek de bir secenekti; cast
   * tercih edildi cunku sema degisikligi gerektirmez ve gelecekte bir
   * sutun uzunlugu degistiginde sorgu yine calisir.
   */
  return `
WITH RECURSIVE frontier AS (
  SELECT
    n.node_identifier::text AS node_identifier,
    n.node_identifier::text AS via_seed,
    0                 AS depth,
    NULL::text        AS edge_source,
    NULL::text        AS edge_kind,
    NULL::real        AS edge_confidence,
    ARRAY[n.node_identifier::text] AS visited,
    FALSE             AS fan_out_truncated
  FROM graph_nodes n
  WHERE n.snapshot_id = $1
    AND n.organization_id = $2
    AND n.node_identifier = ANY($3::text[])

  UNION ALL

  SELECT
    step.next_node::text,
    frontier.via_seed,
    frontier.depth + 1,
    step.edge_source,
    step.edge_kind,
    step.edge_confidence,
    frontier.visited || step.next_node::text,
    step.rank > $7
  FROM frontier
  CROSS JOIN LATERAL (
    SELECT
      (${nextNode})::text             AS next_node,
      frontier.node_identifier::text  AS edge_source,
      e.edge_kind                     AS edge_kind,
      e.confidence                    AS edge_confidence,
      ROW_NUMBER() OVER (ORDER BY e.confidence DESC NULLS LAST, e.id) AS rank
    FROM graph_edges e
    WHERE e.snapshot_id = $1
      -- Ozyinelemede de org predicate'i: bir kenar baska tenant'in
      -- node'una isaret ediyorsa oraya GECILMEZ (T-02).
      AND e.organization_id = $2
      AND ${joinCondition}
      AND ($5::text[] IS NULL OR e.edge_kind = ANY($5::text[]))
      AND COALESCE(e.confidence, 0) >= $6
  ) AS step
  WHERE frontier.depth < $4
    -- Dongu tespiti: ziyaret edilmis node'a geri donulmez.
    AND NOT (step.next_node = ANY(frontier.visited))
    AND step.rank <= $7
)
SELECT
  f.node_identifier,
  f.via_seed,
  f.depth,
  f.edge_source,
  f.edge_kind,
  f.edge_confidence,
  f.fan_out_truncated,
  n.node_kind,
  n.label,
  n.path
FROM frontier f
LEFT JOIN graph_nodes n
  ON n.snapshot_id = $1 AND n.organization_id = $2
 AND n.node_identifier::text = f.node_identifier
ORDER BY f.depth, f.node_identifier
LIMIT $8;`.trim();
}
