/**
 * P05 / Y-P05-003 — Symbol kaynaklı graph builder (ADR-022, ADR-023).
 *
 * ESKİ HALİ NE YAPIYORDU (P00 Truth Audit)
 *   `syncGraphFoundation` (packages/graph/src/index.ts:607+) node'ları
 *   `context_items` ve `tasks` tablolarından üretiyordu (L698-752).
 *   Edge'ler için `context_chunks` satırları YENİDEN BİRLEŞTİRİLİP
 *   baştan parse ediliyordu (L964-977).
 *
 *   Üç sorun:
 *     1. Yanlış kaynak. Graf, index'lenmiş context öğeleriyle sınırlıydı;
 *        repo'da olup context'e alınmamış her dosya graf'ta yoktu.
 *     2. Tekrarlanan iş. P04 zaten ayrıştırıp `symbols` tablosuna yazıyor;
 *        chunk'ları yeniden parse etmek aynı işi ikinci kez, daha kötü
 *        bir parser'la yapmaktı.
 *     3. Yıkıcı sync. Her çalıştırma önce
 *        `DELETE FROM graph_edges ... WHERE relationship IN (...)`
 *        yapıyordu (L663-668). Rebuild boyunca graf tutarsızdı ve
 *        eşzamanlı retrieval yarım graf görüyordu.
 *
 * YENİ HALİ
 *   Kaynak `symbols` + `files`. Yazım UPSERT; silme TOMBSTONE. Graf hiçbir
 *   anda "yarım" olmaz — eski satırlar yenisi yazılana kadar durur.
 *
 * ÇÖZÜLEMEYEN IMPORT'LAR
 *   Eski kod bunları `console.warn` ile geçiyordu (L1094) ve uyarıyı kimse
 *   okumuyordu. Burada SAYILIR ve `graph_build_runs`'a yazılır: oran
 *   yükselirse index sağlığı `degraded` olur. Ölçülmeyen bir kayıp,
 *   olmayan bir kayıp gibi görünür.
 */

import { newId } from "@y/shared";
import {
  computeEdgeConfidence,
  fileNodeId,
  symbolNodeId,
  repositoryNodeId,
  type EdgeDerivation,
  type EdgeKind,
  type NodeKind
} from "@y/shared";

export interface GraphDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export interface BuildOptions {
  readonly organizationId: string;
  readonly projectId: string | null;
  readonly repositoryId: string;
  readonly snapshotId: string;
  /** Verilirse yalnız bu dosyaların alt grafı yeniden inşa edilir. */
  readonly onlyPaths?: readonly string[];
}

export interface BuildResult {
  readonly buildRunId: string;
  readonly mode: "full" | "incremental";
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly touchedNodeCount: number;
  readonly tombstoneCount: number;
  readonly unresolvedImports: number;
  readonly totalImports: number;
  readonly unresolvedRatio: number;
  readonly durationMs: number;
}

/** `symbols` tablosundan okunan satır. */
interface SymbolRow {
  readonly symbolId: string;
  readonly path: string;
  readonly language: string | null;
  readonly symbolType: string;
  readonly symbolName: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly isExported: boolean;
  readonly imports: string[];
  readonly fileId: string | null;
}

interface FileRow {
  readonly fileId: string;
  readonly path: string;
  readonly language: string | null;
  readonly parseConfidence: number | null;
  readonly parseStatus: string;
}

interface PendingNode {
  readonly nodeIdentifier: string;
  readonly nodeKind: NodeKind;
  readonly label: string;
  readonly path: string | null;
  readonly symbolId: string | null;
  readonly fileId: string | null;
  readonly confidence: number;
  readonly metadata: Record<string, unknown>;
}

interface PendingEdge {
  readonly source: string;
  readonly target: string;
  readonly edgeKind: EdgeKind;
  readonly derivedFrom: EdgeDerivation;
  readonly confidence: number;
  readonly metadata: Record<string, unknown>;
}

/** Sembol türünden node türüne eşleme. */
const SYMBOL_TYPE_TO_NODE_KIND: Record<string, NodeKind> = {
  function: "function",
  method: "function",
  class: "class",
  interface: "symbol",
  type: "symbol",
  variable: "symbol",
  module: "module",
  route: "route",
  test: "test",
  schema: "database_table",
  migration: "migration",
  markdown_section: "documentation",
  adr: "adr",
  configuration: "configuration",
  export: "symbol",
  import: "symbol"
};

export class GraphBuilder {
  constructor(private readonly db: GraphDb) {}

  /**
   * Snapshot için graf üretir.
   *
   * `onlyPaths` verilirse artımlı moddadır: yalnız o dosyaların node ve
   * edge'leri yeniden yazılır, gerisine dokunulmaz.
   */
  async build(options: BuildOptions): Promise<BuildResult> {
    const startedAt = Date.now();
    const mode = options.onlyPaths ? "incremental" : "full";
    const buildRunId = newId("gbr");

    await this.startRun(buildRunId, options, mode);

    try {
      // Symbol index'i olmayan bir snapshot icin graf uretmek, sessizce
      // BOS bir graf uretmek demektir. Bos graf, "bagimlilik yok" gibi
      // okunur ve Change Firewall'i yaniltir.
      await this.assertSymbolIndexExists(options.snapshotId, mode);

      const files = await this.loadFiles(options);
      const symbols = await this.loadSymbols(options);

      const { nodes, edges, unresolvedImports, totalImports } = this.deriveGraph(
        files,
        symbols,
        options
      );

      const tombstones = await this.tombstoneRemovedNodes(options, nodes, buildRunId);
      await this.replaceEdgesFor(options, nodes);
      await this.upsertNodes(options, nodes);
      await this.insertEdges(options, edges);

      const result: BuildResult = {
        buildRunId,
        mode,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        touchedNodeCount: nodes.length,
        tombstoneCount: tombstones,
        unresolvedImports,
        totalImports,
        unresolvedRatio: totalImports > 0 ? unresolvedImports / totalImports : 0,
        durationMs: Date.now() - startedAt
      };

      await this.completeRun(buildRunId, result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.failRun(buildRunId, message, Date.now() - startedAt);
      throw error;
    }
  }

  /**
   * Node ve edge'lerin türetilmesi.
   *
   * Saf fonksiyon: DB'ye dokunmaz. Böylece "hangi girdi hangi grafı
   * üretir" sorusu testte doğrudan yanıtlanabilir.
   */
  deriveGraph(
    files: readonly FileRow[],
    symbols: readonly SymbolRow[],
    options: BuildOptions
  ): {
    nodes: PendingNode[];
    edges: PendingEdge[];
    unresolvedImports: number;
    totalImports: number;
  } {
    const nodes = new Map<string, PendingNode>();
    const edges = new Map<string, PendingEdge>();
    const pathSet = new Set(files.map((f) => f.path));
    const confidenceByPath = new Map(files.map((f) => [f.path, f.parseConfidence ?? 1]));

    const repoNode = repositoryNodeId(options.repositoryId);
    nodes.set(repoNode, {
      nodeIdentifier: repoNode,
      nodeKind: "repository",
      label: options.repositoryId,
      path: null,
      symbolId: null,
      fileId: null,
      confidence: 1,
      metadata: { snapshotId: options.snapshotId }
    });

    for (const file of files) {
      const id = fileNodeId(file.path);
      nodes.set(id, {
        nodeIdentifier: id,
        nodeKind: classifyFileNode(file.path),
        label: file.path,
        path: file.path,
        symbolId: null,
        fileId: file.fileId,
        confidence: file.parseConfidence ?? 1,
        metadata: { language: file.language, parseStatus: file.parseStatus }
      });

      addEdge(edges, {
        source: repoNode,
        target: id,
        edgeKind: "depends_on",
        derivedFrom: "file_containment",
        confidence: computeEdgeConfidence({ derivedFrom: "file_containment" }),
        metadata: {}
      });
    }

    let unresolvedImports = 0;
    let totalImports = 0;
    const seenImportPairs = new Set<string>();

    for (const symbol of symbols) {
      const symbolNode = symbolNodeId(symbol.path, symbol.symbolName);
      const parseConfidence = confidenceByPath.get(symbol.path) ?? 1;

      nodes.set(symbolNode, {
        nodeIdentifier: symbolNode,
        nodeKind: SYMBOL_TYPE_TO_NODE_KIND[symbol.symbolType] ?? "symbol",
        label: symbol.symbolName,
        path: symbol.path,
        symbolId: symbol.symbolId,
        fileId: symbol.fileId,
        confidence: parseConfidence,
        metadata: {
          symbolType: symbol.symbolType,
          language: symbol.language,
          startLine: symbol.startLine,
          endLine: symbol.endLine
        }
      });

      // Dosya -> sembol iceri alma.
      addEdge(edges, {
        source: fileNodeId(symbol.path),
        target: symbolNode,
        edgeKind: "depends_on",
        derivedFrom: "symbol_containment",
        confidence: computeEdgeConfidence({ derivedFrom: "symbol_containment" }),
        metadata: {}
      });

      if (symbol.isExported) {
        addEdge(edges, {
          source: symbolNode,
          target: fileNodeId(symbol.path),
          edgeKind: "exports",
          derivedFrom: "export_declaration",
          confidence: computeEdgeConfidence({
            derivedFrom: "export_declaration",
            parseConfidence
          }),
          metadata: {}
        });
      }

      // Import kenarlari DOSYA duzeyinde kurulur: bir sembolun import
      // listesi aslinda dosyanin import listesidir (P04 boyle yaziyor).
      // Ayni ciftin tekrar tekrar islenmesini engelliyoruz.
      for (const specifier of symbol.imports) {
        const pairKey = `${symbol.path} ${specifier}`;
        if (seenImportPairs.has(pairKey)) continue;
        seenImportPairs.add(pairKey);

        totalImports++;
        const candidates = resolveImportTargets(symbol.path, specifier, pathSet);

        if (candidates.length === 0) {
          // Paket importlari (react, @y/shared) repo dosyasina karsilik
          // gelmez; bunlar "cozulemeyen" degil "haric" sayilir.
          if (specifier.startsWith(".")) unresolvedImports++;
          continue;
        }

        for (const target of candidates) {
          addEdge(edges, {
            source: fileNodeId(symbol.path),
            target: fileNodeId(target),
            edgeKind: "imports",
            derivedFrom: "import_specifier",
            confidence: computeEdgeConfidence({
              derivedFrom: "import_specifier",
              candidateCount: candidates.length,
              parseConfidence
            }),
            metadata: { specifier }
          });
        }
      }
    }

    // Test iliskisi: konvansiyon. En zayif kanit, en dusuk guven.
    for (const file of files) {
      const tested = testTargetOf(file.path, pathSet);
      if (!tested) continue;
      addEdge(edges, {
        source: fileNodeId(file.path),
        target: fileNodeId(tested),
        edgeKind: "tests",
        derivedFrom: "test_convention",
        confidence: computeEdgeConfidence({ derivedFrom: "test_convention" }),
        metadata: {}
      });
    }

    return {
      nodes: [...nodes.values()],
      edges: [...edges.values()],
      unresolvedImports,
      totalImports
    };
  }

  // --- DB erişimi ---------------------------------------------------------

  private async assertSymbolIndexExists(snapshotId: string, mode: string): Promise<void> {
    if (mode === "incremental") return;
    const result = await this.db.query(
      `SELECT COUNT(*)::int AS count FROM symbols WHERE snapshot_id = $1;`,
      [snapshotId]
    );
    if (Number(result.rows[0]?.count ?? 0) === 0) {
      throw new Error(
        `Snapshot ${snapshotId} icin sembol index'i yok. Graf uretilemez: ` +
          `bos bir graf "bagimlilik yok" gibi okunur ve Change Firewall'i yanlis yonlendirir. ` +
          `Once index job calistirilmali (P04).`
      );
    }
  }

  private async loadFiles(options: BuildOptions): Promise<FileRow[]> {
    const result = await this.db.query(
      `SELECT id, path, language, parse_confidence, parse_status
         FROM files
        WHERE snapshot_id = $1
          AND ($2::text[] IS NULL OR path = ANY($2::text[]))
        ORDER BY path;`,
      [options.snapshotId, options.onlyPaths ? [...options.onlyPaths] : null]
    );
    return result.rows.map((row) => ({
      fileId: row.id,
      path: row.path,
      language: row.language ?? null,
      parseConfidence: row.parse_confidence === null ? null : Number(row.parse_confidence),
      parseStatus: row.parse_status
    }));
  }

  private async loadSymbols(options: BuildOptions): Promise<SymbolRow[]> {
    const result = await this.db.query(
      `SELECT symbol_id, path, language, symbol_type, symbol_name,
              start_line, end_line, is_exported, imports, file_id
         FROM symbols
        WHERE snapshot_id = $1
          AND ($2::text[] IS NULL OR path = ANY($2::text[]))
        ORDER BY path, start_byte;`,
      [options.snapshotId, options.onlyPaths ? [...options.onlyPaths] : null]
    );
    return result.rows.map((row) => ({
      symbolId: row.symbol_id,
      path: row.path,
      language: row.language ?? null,
      symbolType: row.symbol_type,
      symbolName: row.symbol_name,
      startLine: Number(row.start_line),
      endLine: Number(row.end_line),
      isExported: Boolean(row.is_exported),
      imports: Array.isArray(row.imports) ? row.imports : [],
      fileId: row.file_id ?? null
    }));
  }

  /**
   * Artık üretilmeyen node'lar için tombstone.
   *
   * Tam build'de: bu snapshot'ta olup yeni kümede olmayan her node.
   * Artımlı build'de: yalnız dokunulan yolların node'ları arasında
   * kaybolanlar — kapsam dışı node'lara dokunulmaz.
   */
  private async tombstoneRemovedNodes(
    options: BuildOptions,
    nodes: readonly PendingNode[],
    buildRunId: string
  ): Promise<number> {
    const keep = nodes.map((n) => n.nodeIdentifier);

    const stale = await this.db.query(
      `SELECT node_identifier, node_kind, path
         FROM graph_nodes
        WHERE snapshot_id = $1
          AND organization_id = $2
          AND NOT (node_identifier = ANY($3::text[]))
          AND ($4::text[] IS NULL OR path = ANY($4::text[]));`,
      [
        options.snapshotId,
        options.organizationId,
        keep,
        options.onlyPaths ? [...options.onlyPaths] : null
      ]
    );

    if (stale.rows.length === 0) return 0;

    for (const row of stale.rows) {
      await this.db.query(
        `INSERT INTO graph_tombstones
           (id, organization_id, snapshot_id, build_run_id, node_identifier, node_kind, path, reason, removed_edge_count)
         SELECT $1, $2, $3, $4, $5, $6, $7, $8,
                (SELECT COUNT(*)::int FROM graph_edges
                  WHERE snapshot_id = $3 AND (source = $5 OR target = $5))
         ON CONFLICT (snapshot_id, node_identifier) DO NOTHING;`,
        [
          newId("gt"),
          options.organizationId,
          options.snapshotId,
          buildRunId,
          row.node_identifier,
          row.node_kind,
          row.path,
          options.onlyPaths ? "symbol_removed" : "rebuilt"
        ]
      );
    }

    const identifiers = stale.rows.map((r) => r.node_identifier);
    await this.db.query(
      `DELETE FROM graph_edges
        WHERE snapshot_id = $1 AND (source = ANY($2::text[]) OR target = ANY($2::text[]));`,
      [options.snapshotId, identifiers]
    );
    await this.db.query(
      `DELETE FROM graph_nodes WHERE snapshot_id = $1 AND node_identifier = ANY($2::text[]);`,
      [options.snapshotId, identifiers]
    );

    return stale.rows.length;
  }

  /**
   * Kapsamdaki node'lardan ÇIKAN edge'leri değiştirir.
   *
   * Eski kod tüm edge'leri siliyordu; burada silinen küme yalnız yeniden
   * yazılacak olanlarla sınırlı. Kapsam dışındaki bağlar rebuild boyunca
   * ayakta kalır — retrieval yarım graf görmez (ADR-023).
   */
  private async replaceEdgesFor(options: BuildOptions, nodes: readonly PendingNode[]): Promise<void> {
    const sources = nodes.map((n) => n.nodeIdentifier);
    if (sources.length === 0) return;

    await this.db.query(
      `DELETE FROM graph_edges
        WHERE snapshot_id = $1 AND organization_id = $2 AND source = ANY($3::text[]);`,
      [options.snapshotId, options.organizationId, sources]
    );
  }

  private async upsertNodes(options: BuildOptions, nodes: readonly PendingNode[]): Promise<void> {
    for (const node of nodes) {
      await this.db.query(
        `INSERT INTO graph_nodes
           (id, project_id, organization_id, snapshot_id, node_kind, node_identifier,
            label, type, status, path, symbol_id, file_id, confidence, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,$10,$11,$12,$13::jsonb)
         ON CONFLICT (snapshot_id, node_kind, node_identifier) WHERE snapshot_id IS NOT NULL
         DO UPDATE SET label = EXCLUDED.label,
                       path = EXCLUDED.path,
                       symbol_id = EXCLUDED.symbol_id,
                       file_id = EXCLUDED.file_id,
                       confidence = EXCLUDED.confidence,
                       metadata = EXCLUDED.metadata,
                       updated_at = NOW();`,
        [
          newId("gn"),
          options.projectId,
          options.organizationId,
          options.snapshotId,
          node.nodeKind,
          node.nodeIdentifier,
          node.label,
          // Legacy `type` kolonu NOT NULL; kanonik degeri oraya da yaziyoruz
          // ki eski okuyucular kirilmasin.
          node.nodeKind,
          node.path,
          node.symbolId,
          node.fileId,
          node.confidence,
          JSON.stringify(node.metadata)
        ]
      );
    }
  }

  private async insertEdges(options: BuildOptions, edges: readonly PendingEdge[]): Promise<void> {
    for (const edge of edges) {
      await this.db.query(
        `INSERT INTO graph_edges
           (id, project_id, organization_id, snapshot_id, source, target, label,
            relationship, edge_kind, confidence, derived_from, weight, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
         ON CONFLICT (snapshot_id, source, target, edge_kind) WHERE snapshot_id IS NOT NULL
         DO UPDATE SET confidence = EXCLUDED.confidence,
                       derived_from = EXCLUDED.derived_from,
                       metadata = EXCLUDED.metadata;`,
        [
          newId("ge"),
          options.projectId,
          options.organizationId,
          options.snapshotId,
          edge.source,
          edge.target,
          edge.edgeKind,
          edge.edgeKind,
          edge.edgeKind,
          edge.confidence,
          edge.derivedFrom,
          edge.confidence,
          JSON.stringify(edge.metadata)
        ]
      );
    }
  }

  private async startRun(id: string, options: BuildOptions, mode: string): Promise<void> {
    await this.db.query(
      `INSERT INTO graph_build_runs (id, organization_id, project_id, snapshot_id, status, mode)
       VALUES ($1,$2,$3,$4,'running',$5);`,
      [id, options.organizationId, options.projectId, options.snapshotId, mode]
    );
  }

  private async completeRun(id: string, result: BuildResult): Promise<void> {
    await this.db.query(
      `UPDATE graph_build_runs
          SET status = 'completed', node_count = $2, edge_count = $3, touched_node_count = $4,
              tombstone_count = $5, unresolved_imports = $6, total_imports = $7,
              duration_ms = $8, finished_at = NOW()
        WHERE id = $1;`,
      [
        id,
        result.nodeCount,
        result.edgeCount,
        result.touchedNodeCount,
        result.tombstoneCount,
        result.unresolvedImports,
        result.totalImports,
        result.durationMs
      ]
    );
  }

  private async failRun(id: string, error: string, durationMs: number): Promise<void> {
    await this.db.query(
      `UPDATE graph_build_runs
          SET status = 'failed', error = $2, duration_ms = $3, finished_at = NOW()
        WHERE id = $1;`,
      [id, error.slice(0, 2000), durationMs]
    );
  }
}

// --- Saf yardımcılar -------------------------------------------------------

function addEdge(into: Map<string, PendingEdge>, edge: PendingEdge): void {
  // Kendine kenar graf'i kirletir ve traversal'da gereksiz dongu uretir.
  if (edge.source === edge.target) return;
  const key = `${edge.source} ${edge.target} ${edge.edgeKind}`;
  const existing = into.get(key);
  // Ayni cift birden cok kanittan gelirse EN GUCLU kanit kazanir.
  if (existing && existing.confidence >= edge.confidence) return;
  into.set(key, edge);
}

/** Dosya yolundan node türü. Uzantı ve konum ipuçlarıyla. */
export function classifyFileNode(path: string): NodeKind {
  const lower = path.toLowerCase();
  if (/(^|\/)migrations\//.test(lower) || /\.sql$/.test(lower)) return "migration";
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(lower) || /(^|\/)tests?\//.test(lower)) return "test";
  if (/(^|\/)docs?\/adr[s]?\//.test(lower) || /\/adr-\d+/.test(lower)) return "adr";
  if (/\.mdx?$/.test(lower)) return "documentation";
  if (/\.(json|ya?ml|toml|ini|env)$/.test(lower)) return "configuration";
  return "file";
}

/**
 * Import specifier'ını snapshot içindeki gerçek dosyalara çözer.
 *
 * P04'teki `resolveImportCandidates` ADAYLARI üretir; burada aday listesi
 * gerçekten VAR OLAN dosyalarla kesiştirilir. Fark önemli: orada amaç
 * "hangi dosyalar etkilenmiş olabilir", burada amaç "hangi dosya
 * gerçekten import edilmiş".
 */
export function resolveImportTargets(
  fromPath: string,
  specifier: string,
  existingPaths: ReadonlySet<string>
): string[] {
  if (!specifier.startsWith(".")) return [];

  const fromDir = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
  const joined = normalize(fromDir === "" ? specifier : `${fromDir}/${specifier}`);
  if (joined === null) return [];

  const base = joined.replace(/\/+$/, "");
  const suffixes = [
    "",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".py",
    ".go",
    ".rs",
    "/index.ts",
    "/index.tsx",
    "/index.js",
    "/__init__.py"
  ];

  const found: string[] = [];
  for (const suffix of suffixes) {
    const candidate = `${base}${suffix}`;
    if (existingPaths.has(candidate) && !found.includes(candidate)) found.push(candidate);
  }
  return found;
}

/**
 * Test dosyasının hangi kaynağı test ettiğini KONVANSİYONDAN tahmin eder.
 * Kanıt değil tahmin olduğu için güveni en düşük seviyededir.
 */
export function testTargetOf(path: string, existingPaths: ReadonlySet<string>): string | null {
  const match = path.match(/^(.*)\.(test|spec)\.([cm]?[jt]sx?)$/);
  if (!match) return null;

  const [, stem, , ext] = match;
  const candidates = [`${stem}.${ext}`, `${stem}.ts`, `${stem}.tsx`, `${stem}.js`];
  for (const candidate of candidates) {
    if (candidate !== path && existingPaths.has(candidate)) return candidate;
  }
  return null;
}

function normalize(input: string): string | null {
  const stack: string[] = [];
  for (const part of input.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (stack.length === 0) return null;
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join("/");
}
