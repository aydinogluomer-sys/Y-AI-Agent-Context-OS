/**
 * P05 — Knowledge graph sözleşmeleri (ADR-022, ADR-023, ADR-024).
 *
 * `TraversalSpec` bu fazın gate'inde DONAR: P06 (retrieval) ve P10
 * (Change Firewall) buna bağımlıdır. Sonradan alan eklemek geriye dönük
 * uyumlu olsa da, alan ÇIKARMAK iki fazı birden kırar.
 *
 * Legacy `GraphNode` / `GraphNodeType` (packages/shared/src/index.ts)
 * bilerek dokunulmadan bırakıldı: `context_items` kaynaklı eski grafı
 * temsil ediyor ve arşiv satırları hâlâ o değer kümesini taşıyor.
 * Kanonik kümeler burada yaşar.
 */

/**
 * Node türleri.
 *
 * Legacy küme (`doc`, `task`, `session`, `connector`) İŞ nesnelerini
 * anlatıyordu; bu küme KOD yapısını anlatır. Fark önemli: graf artık
 * "hangi görev hangi dokümana bağlı" değil, "hangi sembol hangi sembole
 * bağlı" sorusunu yanıtlıyor.
 */
export const NODE_KINDS = [
  "repository",
  "file",
  "module",
  "symbol",
  "function",
  "class",
  "route",
  "test",
  "database_table",
  "migration",
  "documentation",
  "adr",
  "configuration"
] as const;

export type NodeKind = (typeof NODE_KINDS)[number];

/**
 * Edge türleri.
 *
 * `reverse_depends_on` BİLEREK YOK. Ters bağımlılık ayrı bir satır olarak
 * yazılırsa aynı gerçek iki yerde tutulur ve biri güncellenip diğeri
 * unutulduğunda graf kendi içinde çelişir. Ters yön sorgu yönüyle elde
 * edilir (`TraversalDirection.reverse`).
 */
export const EDGE_KINDS = [
  "imports",
  "exports",
  "calls",
  "references",
  "implements",
  "extends",
  "tests",
  "configures",
  "reads",
  "writes",
  "depends_on",
  "documents",
  "migrates"
] as const;

export type EdgeKind = (typeof EDGE_KINDS)[number];

/** Bir edge'in hangi kanıttan doğduğu. Confidence bunun fonksiyonudur. */
export type EdgeDerivation =
  | "import_specifier"
  | "export_declaration"
  | "test_convention"
  | "doc_reference"
  | "file_containment"
  | "symbol_containment"
  | "route_declaration"
  | "migration_reference";

export interface GraphNodeRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string | null;
  readonly snapshotId: string;
  readonly nodeKind: NodeKind;
  /** Snapshot içinde tekil: `file:src/a.ts`, `symbol:src/a.ts#topla`. */
  readonly nodeIdentifier: string;
  readonly label: string;
  readonly path: string | null;
  readonly symbolId: string | null;
  readonly fileId: string | null;
  /** ÖLÇÜLEN değer; sabit atanmaz (ADR-021). */
  readonly confidence: number;
  readonly metadata: Record<string, unknown>;
}

export interface GraphEdgeRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string | null;
  readonly snapshotId: string;
  readonly source: string;
  readonly target: string;
  readonly edgeKind: EdgeKind;
  readonly derivedFrom: EdgeDerivation;
  readonly confidence: number;
  readonly metadata: Record<string, unknown>;
}

export type TraversalDirection = "forward" | "reverse" | "both";
export type TraversalStrategy = "bfs" | "dfs";

/**
 * Traversal isteği.
 *
 * LİMİTLER İSTEĞE BAĞLI DEĞİL, ZORUNLU (T-06). Sınırsız bir traversal,
 * yoğun bağlı bir grafta tüm tabloyu belleğe çeker; bu bir DoS yüzeyidir.
 * Varsayılanlar `DEFAULT_TRAVERSAL_LIMITS`'te tanımlıdır ve çağıran
 * yalnızca DARALTMAK için değer verir.
 */
export interface TraversalSpec {
  readonly snapshotId: string;
  readonly organizationId: string;
  /** Başlangıç node kimlikleri (`node_identifier`). */
  readonly seeds: readonly string[];
  readonly direction: TraversalDirection;
  readonly strategy?: TraversalStrategy;
  readonly maxDepth?: number;
  readonly maxNodes?: number;
  /** Tek bir node'dan genişletilecek azami komşu sayısı. */
  readonly fanOutBudget?: number;
  /** Boş bırakılırsa tüm edge türleri. */
  readonly edgeKinds?: readonly EdgeKind[];
  /** Bu değerin altındaki edge'ler izlenmez. */
  readonly minConfidence?: number;
}

export interface TraversalNode {
  readonly nodeIdentifier: string;
  readonly nodeKind: NodeKind;
  readonly label: string;
  readonly path: string | null;
  readonly depth: number;
  /** Bu node'a hangi seed'den ulaşıldı. */
  readonly viaSeed: string;
}

export interface TraversalEdge {
  readonly source: string;
  readonly target: string;
  readonly edgeKind: EdgeKind;
  readonly confidence: number;
  readonly depth: number;
}

export interface TraversalResult {
  readonly nodes: readonly TraversalNode[];
  readonly edges: readonly TraversalEdge[];
  /**
   * Sonuç bir limite takıldı mı.
   *
   * `false` olduğunda "graf bu kadar" demektir; `true` olduğunda
   * "daha fazlası var ama getirilmedi". Bu ayrım olmadan eksik bir
   * traversal, tam bir traversal gibi görünür ve ona dayanan impact
   * analizi yanlış güven verir.
   */
  readonly truncated: boolean;
  readonly truncationReason: "max_nodes" | "max_depth" | "fan_out" | null;
  readonly depthReached: number;
  readonly visitedCount: number;
}

export interface TraversalLimits {
  readonly maxDepth: number;
  readonly maxNodes: number;
  readonly fanOutBudget: number;
}

/**
 * Varsayılan bütçeler.
 *
 * Bu sayılar keyfi değil, sorgu maliyeti üzerinden seçildi: derinlik 5,
 * node başına 100 komşu ve toplam 2.000 node, tek bir recursive CTE'nin
 * en kötü durumda ~200.000 kenar taramasına karşılık gelir ve
 * `statement_timeout` altında kalır. Daha derin analizler (P10) bilinçli
 * olarak daha yüksek bütçe ister.
 */
export const DEFAULT_TRAVERSAL_LIMITS: TraversalLimits = {
  maxDepth: 5,
  maxNodes: 2_000,
  fanOutBudget: 100
};

/** Node kimliği kurma — tek yer, böylece builder ve traversal ayrışmaz. */
export function fileNodeId(path: string): string {
  return `file:${path}`;
}

export function symbolNodeId(path: string, symbolName: string): string {
  return `symbol:${path}#${symbolName}`;
}

export function repositoryNodeId(repositoryId: string): string {
  return `repository:${repositoryId}`;
}

/**
 * Edge güveninin ÖLÇÜLMESİ.
 *
 * P00'da bu değerler sabitti (`0.9`, `0.85`, `0.7`) ve neye dayandıkları
 * yazılı değildi. Burada güven, kanıtın türünden ve çözümlemenin
 * belirsizliğinden hesaplanır:
 *
 *   - Doğrudan yapısal kanıt (dosya içinde sembol) tam güven verir:
 *     ölçüm değil, tanım gereği doğrudur.
 *   - Import specifier'ı tek bir dosyaya çözüldüyse güven yüksektir;
 *     birden çok adaya çözüldüyse belirsizlik vardır ve güven düşer.
 *   - Konvansiyona dayalı çıkarım (test dosyası adlandırması) en zayıf
 *     kanıttır: doğru olabilir ama kanıtlanmış değildir.
 */
export function computeEdgeConfidence(basis: {
  derivedFrom: EdgeDerivation;
  /** Import kaç aday yola çözüldü (1 = kesin). */
  candidateCount?: number;
  /** Kaynak dosyanın parse confidence'ı. */
  parseConfidence?: number;
}): number {
  const BASE: Record<EdgeDerivation, number> = {
    file_containment: 1.0,
    symbol_containment: 1.0,
    export_declaration: 0.95,
    import_specifier: 0.9,
    route_declaration: 0.85,
    migration_reference: 0.8,
    doc_reference: 0.7,
    test_convention: 0.6
  };

  let score = BASE[basis.derivedFrom];

  // Belirsiz cozumleme guveni dusurur: 1 aday -> ceza yok, 4 aday -> /4.
  const candidates = basis.candidateCount ?? 1;
  if (candidates > 1) score /= candidates;

  // Kaynak dosya kotu ayristirildiysa ondan cikan edge de o kadar guvenilir.
  if (basis.parseConfidence !== undefined) {
    score *= Math.max(0, Math.min(1, basis.parseConfidence));
  }

  return Math.max(0, Math.min(1, score));
}

export function isNodeKind(value: string): value is NodeKind {
  return (NODE_KINDS as readonly string[]).includes(value);
}

export function isEdgeKind(value: string): value is EdgeKind {
  return (EDGE_KINDS as readonly string[]).includes(value);
}
