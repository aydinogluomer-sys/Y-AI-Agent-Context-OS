/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  RetrievalQueryDTO, 
  RetrievalCandidateDTO, 
  RankingStrategy, 
  SearchServerKind,
  ContextSourceType 
} from "@y/shared";
import { 
  scoreContextItem, 
  computeLexicalOverlap, 
  mockSemanticSearchFallback 
} from "./index";

export class SearchServer {
  constructor(
    private pool: any,
    private kind: SearchServerKind
  ) {
    if ((this.kind === "local_sql") && !this.pool) {
      throw new Error(`Database connection pool is required for '${this.kind}' SearchServer.`);
    }
  }

  /**
   * Retrieves matching candidate documents based on the configured SearchServer mode.
   */
  public async queryCandidates(
    queryDTO: RetrievalQueryDTO,
    graphService?: any
  ): Promise<RetrievalCandidateDTO[]> {
    switch (this.kind) {
      case "local_sql":
        return this.queryLocalSql(queryDTO, graphService);
      case "local_memory_stub":
        return this.queryLocalMemoryStub(queryDTO);
      case "external_stub_only":
        return this.queryExternalStub(queryDTO);
      default:
        throw new Error(`Unsupported SearchServer kind: '${this.kind}'`);
    }
  }

  /**
   * Queries Postgres repository metadata & chunks to evaluate scores dynamically.
   */
  private async queryLocalSql(
    queryDTO: RetrievalQueryDTO,
    graphService?: any
  ): Promise<RetrievalCandidateDTO[]> {
    const { project_id, query, task_id, source_types, limit, include_graph_weights } = queryDTO;

    let canonicalCandidates: RetrievalCandidateDTO[] = [];
    try {
      const canonicalRes = await this.pool.query(
        `SELECT id, project_id, task_id, object_type, source_table, source_id,
                payload_text, payload_json, metadata_json, created_at, updated_at
         FROM context_objects
         WHERE project_id = $1 AND status = 'active';`,
        [project_id]
      );

      canonicalCandidates = (canonicalRes.rows || [])
        .filter((row: any) => {
          if (!source_types?.length) return true;
          const sourceType =
            row.metadata_json?.source_type ||
            row.payload_json?.source_type ||
            row.object_type;
          return source_types.includes(sourceType);
        })
        .map((row: any) => {
          const payloadJson =
            typeof row.payload_json === "string"
              ? JSON.parse(row.payload_json)
              : row.payload_json || {};
          const metadata =
            typeof row.metadata_json === "string"
              ? JSON.parse(row.metadata_json)
              : row.metadata_json || {};
          const content = [row.payload_text || "", JSON.stringify(payloadJson)]
            .filter(Boolean)
            .join("\n");
          const path =
            metadata.path ||
            metadata.source_uri ||
            payloadJson.path ||
            row.source_id ||
            row.id;
          const lexical = computeLexicalOverlap(content, query);
          const keywordScore =
            Math.round(lexical * 40) +
            (String(path).toLowerCase().includes(query.toLowerCase()) ? 15 : 0);
          const semanticResult = mockSemanticSearchFallback(query, [
            { source_uri: path, metadata_json: metadata },
          ]);
          const semanticScore = Math.round(
            (semanticResult[0]?.semantic_similarity || 0) * 30
          );

          return {
            id: row.id,
            project_id,
            source_type:
              metadata.source_type || payloadJson.source_type || row.object_type,
            source_id: row.source_id || row.id,
            path,
            title: metadata.title || String(path).split("/").pop() || null,
            excerpt: content.substring(0, 240) || null,
            token_estimate: Math.ceil(content.length / 4),
            base_score: 70,
            keyword_score: keywordScore,
            semantic_score: semanticScore,
            graph_score: 0,
            recency_score: 10,
            final_score: 80 + keywordScore + semanticScore,
            reason_codes: ["CANONICAL_CONTEXT_OBJECT"],
            warnings: [],
            metadata: {
              ...metadata,
              canonical_store: "context_objects",
              object_type: row.object_type,
            },
          } as RetrievalCandidateDTO;
        });
    } catch {
      canonicalCandidates = [];
    }

    // 1. Fetch from context_items
    let itemsSql = `
      SELECT id, project_id, source_type, source_uri, metadata_json, created_at, updated_at
      FROM context_items
      WHERE project_id = $1
    `;
    const params: any[] = [project_id];

    if (source_types && source_types.length > 0) {
      itemsSql += ` AND source_type = ANY($2)`;
      params.push(source_types);
    }

    const itemsRes = await this.pool.query(itemsSql, params);
    const items = itemsRes.rows;

    if (items.length === 0) {
      return canonicalCandidates.sort((a, b) => b.final_score - a.final_score);
    }

    // 2. Fetch all chunk records sequentially
    const itemIds = items.map(i => i.id);
    const chunksSql = `
      SELECT id, context_item_id, chunk_index, content, token_count
      FROM context_chunks
      WHERE context_item_id = ANY($1)
    `;
    const chunksRes = await this.pool.query(chunksSql, [itemIds]);
    const chunks = chunksRes.rows;

    const chunksByItemId: Record<string, any[]> = {};
    for (const chunk of chunks) {
      const itemId = chunk.context_item_id;
      if (!chunksByItemId[itemId]) {
        chunksByItemId[itemId] = [];
      }
      chunksByItemId[itemId].push({
        id: chunk.id,
        chunk_index: chunk.chunk_index,
        content: chunk.content,
        token_count: chunk.token_count
      });
    }

    // 3. Fetch task details for scoreContextItem input if task_id matches
    let taskRow = { title: query, description: "", category: "" };
    if (task_id) {
      const taskRes = await this.pool.query(
        "SELECT title, description, category FROM tasks WHERE id = $1 AND project_id = $2 LIMIT 1;",
        [task_id, project_id]
      );
      if (taskRes.rowCount > 0) {
        taskRow = taskRes.rows[0];
      }
    }

    // 4. Fetch Graph if graph weights requested and graphService exists
    let graphData: { nodes: any[]; edges: any[] } | null = null;
    if (include_graph_weights && graphService && task_id) {
      try {
        graphData = await graphService.getGraph(project_id);
      } catch (err: any) {
        console.warn(`[Y-OS:SEARCH] Failed to fetch Knowledge Graph for weighting: ${err.message}`);
      }
    }

    // 5. Evaluate rankings sequentially
    const candidates: RetrievalCandidateDTO[] = [];

    for (const item of items) {
      const itemChunks = chunksByItemId[item.id] || [];
      const combinedContent = itemChunks.map(c => c.content).join("\n");

      // A. Compute base score using original scoreContextItem engine
      const baseScoring = scoreContextItem(
        {
          id: item.id,
          source_uri: item.source_uri,
          source_type: item.source_type as ContextSourceType,
          metadata_json: item.metadata_json,
          created_at: item.created_at,
          updated_at: item.updated_at
        },
        itemChunks,
        taskRow
      );

      // B. Compute keyword similarity (lexical matching overlap scaling to max +40)
      const keywordOverlap = computeLexicalOverlap(combinedContent, query);
      let keyword_score = Math.round(keywordOverlap * 40);
      
      // Match directory / URI exact substring
      if (item.source_uri.toLowerCase().includes(query.toLowerCase())) {
        keyword_score += 15;
      }

      // C. Compute recency ranking score (exponential decay from +10 based on age)
      const updatedTime = item.updated_at ? new Date(item.updated_at) : (item.created_at ? new Date(item.created_at) : new Date());
      const ageHours = (Date.now() - updatedTime.getTime()) / (1000 * 60 * 60);
      const recency_score = Math.max(0, Math.min(10, Math.round(10 * Math.exp(-ageHours / 48)))); // 48h half-life

      // D. Compute graph score if graphData exist
      let graph_score = 0;
      const reason_codes = [...baseScoring.reason_codes];

      if (graphData && task_id) {
        const taskNode = graphData.nodes.find(n => n.taskId === task_id || n.id === task_id);
        const itemNode = graphData.nodes.find(n => n.contextItemId === item.id || n.id === item.id || n.nodeIdentifier === `${project_id}:${item.source_uri}`);

        if (taskNode && itemNode) {
          // Direct relationships check
          const directEdges = graphData.edges.filter(
            e => (e.source === taskNode.id && e.target === itemNode.id) || 
                 (e.target === taskNode.id && e.source === itemNode.id)
          );

          let directAdded = false;
          for (const edge of directEdges) {
            if (edge.relationship === "belongs_to") {
              graph_score += 25;
              reason_codes.push("GRAPH_PRIMARY_BELONGS_TO");
              directAdded = true;
            } else if (["references", "documents", "tests", "derived_from"].includes(edge.relationship)) {
              graph_score += 15;
              reason_codes.push(`GRAPH_RELATED_${edge.relationship.toUpperCase()}`);
              directAdded = true;
            }
          }

          // Transitive check (distance 2) if no direct weight added
          if (!directAdded) {
            const taskNeighbors = new Set(
              graphData.edges
                .filter(e => e.source === taskNode.id || e.target === taskNode.id)
                .map(e => e.source === taskNode.id ? e.target : e.source)
            );

            const isTransitive = graphData.edges.some(
              e => (e.source === itemNode.id && taskNeighbors.has(e.target)) ||
                   (e.target === itemNode.id && taskNeighbors.has(e.source))
            );

            if (isTransitive) {
              graph_score += 5;
              reason_codes.push("GRAPH_TRANSITIVE_NEIGHBOR");
            }
          }

          // Enforce strict ceiling (+40 limit per item)
          if (graph_score > 40) {
            graph_score = 40;
          }
        }
      }

      // E. Compute mock semantic search fallback using the existing items-wrapping function
      const semResult = mockSemanticSearchFallback(query, [item]);
      const semantic_score = Math.round((semResult[0]?.semantic_similarity || 0) * 30);

      // F. Final blending score (summed and tailored by priority depending on caller)
      const final_score = baseScoring.score + keyword_score + recency_score + graph_score + semantic_score;

      const matched_chunks = baseScoring.matched_chunks.map((chk: any) => ({
        ...chk,
        lexical_similarity: computeLexicalOverlap(chk.content, query)
      }));

      candidates.push({
        id: item.id,
        project_id,
        source_type: item.source_type,
        source_id: item.id,
        path: item.source_uri,
        title: item.source_uri.split("/").pop() || null,
        excerpt: matched_chunks[0]?.content || combinedContent.substring(0, 150) || null,
        token_estimate: itemChunks.reduce((acc, c) => acc + c.token_count, 0) || Math.ceil(combinedContent.length / 4),
        base_score: baseScoring.score,
        keyword_score,
        semantic_score,
        graph_score,
        recency_score,
        final_score,
        reason_codes,
        warnings:
          canonicalCandidates.length === 0
            ? [
                "Compatibility retrieval fallback: candidate sourced from legacy context_items/context_chunks.",
              ]
            : ["Legacy candidate retained alongside canonical ContextObject results."],
        metadata: {
          ...item.metadata_json,
          total_chunks: itemChunks.length,
          first_excerpt: combinedContent.substring(0, 80)
        }
      });
    }

    const canonicalPaths = new Set(
      canonicalCandidates.map((candidate) => candidate.path)
    );
    const uniqueLegacyCandidates = candidates.filter(
      (candidate) => !canonicalPaths.has(candidate.path)
    );

    return [...canonicalCandidates, ...uniqueLegacyCandidates]
      .sort((a, b) => b.final_score - a.final_score)
      .slice(0, limit || 50);
  }

  /**
   * Evaluates targets based on static mock/dictionary fallback index.
   */
  private async queryLocalMemoryStub(
    queryDTO: RetrievalQueryDTO
  ): Promise<RetrievalCandidateDTO[]> {
    const { project_id, query } = queryDTO;
    
    // Fallback static context items to query when DB is missing/offline
    const staticItems = [
      {
        id: "item_core_index",
        source_type: "code",
        source_uri: "src/index.ts",
        content: "export function main() { console.log('Y-OS Core initialized'); }"
      },
      {
        id: "item_auth_service",
        source_type: "code",
        source_uri: "src/services/auth.ts",
        content: "export function authenticateJWT() { // enforce SameSite secure cookies }"
      },
      {
        id: "item_system_spec",
        source_type: "markdown",
        source_uri: "docs/architecture.md",
        content: "# Architectural Specifications\nEnforce strict client-side sandboxes and server-isolated database transactions."
      }
    ];

    const results: RetrievalCandidateDTO[] = staticItems.map(item => {
      const kwOverlap = computeLexicalOverlap(item.content, query);
      const isPathMatch = item.source_uri.toLowerCase().includes(query.toLowerCase());

      const keyword_score = Math.round(kwOverlap * 40) + (isPathMatch ? 20 : 0);
      const base_score = item.source_type === "code" ? 30 : 50;
      const final_score = base_score + keyword_score;

      return {
        id: item.id,
        project_id,
        source_type: item.source_type,
        source_id: item.id,
        path: item.source_uri,
        title: item.source_uri.split("/").pop() || null,
        excerpt: item.content,
        token_estimate: Math.ceil(item.content.length / 4),
        base_score,
        keyword_score,
        semantic_score: 0,
        graph_score: 0,
        recency_score: 5,
        final_score,
        reason_codes: ["STATIC_FALLBACK_STUB"],
        warnings: ["Running under in-memory standalone static mode."],
        metadata: { in_memory: true }
      };
    });

    return results.sort((a, b) => b.final_score - a.final_score);
  }

  /**
   * Safe disabled/not-implemented behavior for external search server mode.
   * Does not make network calls, requires no API keys, and never fabricates candidates.
   */
  private async queryExternalStub(
    queryDTO: RetrievalQueryDTO
  ): Promise<RetrievalCandidateDTO[]> {
    // Explicitly disabled/not implemented to satisfy security guidelines and prevent fake query simulation
    return [];
  }
}
