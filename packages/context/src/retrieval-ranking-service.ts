/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  RetrievalQueryDTO, 
  RetrievalCandidateDTO, 
  RetrievalRankingResultDTO,
  RankingStrategy, 
  SearchServerKind,
  NotFoundError,
  PermissionDeniedError,
  ContextBoundaryViolationError,
  SecretLeakedError,
  ContextSourceType
} from "@y/shared";
import { SearchServer } from "./search-server";
import { 
  detectSecrets, 
  detectMissingContext, 
  calculateConfidenceScore 
} from "./index";
import { redactSecretLeaks } from "@y/security";

export class RetrievalRankingService {
  constructor(
    private pool: any,
    private searchServer: SearchServer,
    private graphService?: any
  ) {
    if (!this.pool) {
      throw new Error("A database connection pool is required for RetrievalRankingService.");
    }
  }

  /**
   * Internal DB query helper
   */
  private async query(sql: string, params: unknown[] = []): Promise<any> {
    return this.pool.query(sql, params);
  }

  /**
   * Emits scoped audit logs sequentially to preserve security accountability.
   */
  private async emitAuditLog(
    projectId: string | null,
    actor: string,
    action: string,
    status: string,
    metadata: Record<string, any> = {},
    rationale = "",
    resourceId = "",
    ipAddress = "127.0.0.1"
  ): Promise<void> {
    const logId = `audit_log_${Math.random().toString(36).substring(2, 11)}`;
    try {
      await this.query(
        `INSERT INTO audit_logs (id, project_id, actor, feature_id, action, status, metadata, rationale, resource_id, ip_address, created_at)
         VALUES ($1, $2, $3, 'CTX', $4, $5, $6, $7, $8, $9, NOW());`,
        [
          logId,
          projectId || null,
          actor,
          action,
          status,
          JSON.stringify(metadata),
          rationale || null,
          resourceId || null,
          ipAddress
        ]
      );
    } catch (err: any) {
      console.error(`RetrievalRankingService Audit Log emission failed: ${err.message}`);
    }
  }

  /**
   * CTX-19: Validate project scope exists and is active under current tenant
   */
  public async validateProjectScope(
    project_id: string,
    actor: string,
    ipAddress: string
  ): Promise<any> {
    const projCheck = await this.query("SELECT id, name FROM projects WHERE id = $1 LIMIT 1;", [project_id]);
    if (projCheck.rowCount === 0) {
      await this.emitAuditLog(
        null,
        actor,
        "RETRIEVAL_CROSS_PROJECT_ACCESS_BLOCKED",
        "denied_untrusted",
        { project_id },
        `Project scope validation failed: Project ${project_id} not found.`,
        "",
        ipAddress
      );
      throw new NotFoundError(`Project scope validation failed: Project ${project_id} not found.`);
    }
    return projCheck.rows[0];
  }

  /**
   * CTX-20: Ensure task references belong securely to the scoped project boundaries
   */
  public async validateTaskScope(
    task_id: string,
    project_id: string,
    actor: string,
    ipAddress: string
  ): Promise<any> {
    const taskCheck = await this.query("SELECT id, project_id, title FROM tasks WHERE id = $1 LIMIT 1;", [task_id]);
    if (taskCheck.rowCount === 0) {
      throw new NotFoundError(`Task scope validation failed: Task ${task_id} not found.`);
    }
    const task = taskCheck.rows[0];
    if (task.project_id !== project_id) {
      await this.emitAuditLog(
        project_id,
        actor,
        "RETRIEVAL_CROSS_PROJECT_ACCESS_BLOCKED",
        "denied_untrusted",
        { task_id, project_id },
        `Cross-project boundary violation: Task ${task_id} belongs to project ${task.project_id}, not requested project ${project_id}.`,
        task_id,
        ipAddress
      );
      throw new PermissionDeniedError("Forbidden task scope crossing. Context retrieval requests must map to the active task's project parameters.");
    }
    return task;
  }

  /**
   * CTX-11: Scores candidates using BM25-based keyword patterns
   */
  public scoreKeywordBM25(combinedContent: string, query: string, path: string): number {
    const wordOverlap = this.calculateKeywordOverlap(combinedContent, query);
    let keyword_score = Math.round(wordOverlap * 40);
    
    // Match directory / URI exact substring
    if (path.toLowerCase().includes(query.toLowerCase())) {
      keyword_score += 15;
    }
    return keyword_score;
  }

  private calculateKeywordOverlap(content: string, query: string): number {
    if (!content || !query) return 0;
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (queryWords.length === 0) return 0;
    const contentLower = content.toLowerCase();
    let matches = 0;
    for (const word of queryWords) {
      if (contentLower.includes(word)) {
        matches++;
      }
    }
    return matches / queryWords.length;
  }

  /**
   * CTX-12: Evaluates graph-proximity weights bounding depth and ensuring cycle protection
   */
  public scoreGraphWeight(
    graphData: any,
    task_id: string,
    project_id: string,
    itemId: string,
    itemPath: string,
    reason_codes: string[]
  ): number {
    if (!graphData || !task_id) return 0;

    const taskNode = graphData.nodes.find((n: any) => n.taskId === task_id || n.id === task_id);
    const itemNode = graphData.nodes.find((n: any) => n.contextItemId === itemId || n.id === itemId || n.nodeIdentifier === `${project_id}:${itemPath}`);

    if (!taskNode || !itemNode) return 0;

    let graph_score = 0;

    // Direct relationships check (Path length = 1)
    const directEdges = graphData.edges.filter(
      (e: any) => (e.source === taskNode.id && e.target === itemNode.id) || 
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

    // Transitive neighboring check (Path length = 2, with cycle protection)
    if (!directAdded) {
      const taskNeighbors = new Set(
        graphData.edges
          .filter((e: any) => e.source === taskNode.id || e.target === taskNode.id)
          .map((e: any) => e.source === taskNode.id ? e.target : e.source)
      );

      // Prevent self-loop / path back to start
      taskNeighbors.delete(itemNode.id);
      taskNeighbors.delete(taskNode.id);

      const isTransitive = graphData.edges.some(
        (e: any) => (e.source === itemNode.id && taskNeighbors.has(e.target)) ||
                    (e.target === itemNode.id && taskNeighbors.has(e.source))
      );

      if (isTransitive) {
        graph_score += 5;
        reason_codes.push("GRAPH_TRANSITIVE_NEIGHBOR");
      }
    }

    // Strict boundary of +40 ceiling per item
    return Math.min(40, graph_score);
  }

  /**
   * CTX-13: Exponential decay based on update parameters
   */
  public scoreRecency(updatedAt?: string | Date, createdAt?: string | Date): number {
    const updatedTime = updatedAt ? new Date(updatedAt) : (createdAt ? new Date(createdAt) : new Date());
    const ageHours = (Date.now() - updatedTime.getTime()) / (1000 * 60 * 60);
    // 48h half-life exponential decay scaled to max +10 points
    return Math.max(0, Math.min(10, Math.round(10 * Math.exp(-ageHours / 48))));
  }

  /**
   * CTX-14: Custom source-type authority multiplier (API/docs vs normal files)
   */
  public scoreSourceAuthority(sourceType: ContextSourceType): number {
    if (sourceType === "api_doc" || sourceType === "decision_log" || sourceType === "design_spec") {
      return 15; // Higher authority score
    }
    if (sourceType === "markdown" || sourceType === "ux_spec") {
      return 10;
    }
    return 5;
  }

  /**
   * CTX-15: Stable blending of individual weight vectors
   */
  public mergeScores(
    baseScore: number,
    keywordScore: number,
    semanticScore: number,
    graphScore: number,
    recencyScore: number,
    sourceAuthorityScore: number,
    strategy: RankingStrategy
  ): number {
    let final_score = baseScore;

    if (strategy === "keyword_bm25_mvp") {
      // Boost lexical keywords heavily
      final_score = Math.round(baseScore * 0.4 + keywordScore * 0.4 + recencyScore * 0.1 + sourceAuthorityScore * 0.1);
    } else if (strategy === "graph_weighted_mvp") {
      // Boost Knowledge Graph proximity weights
      final_score = Math.round(baseScore * 0.3 + keywordScore * 0.2 + graphScore * 0.3 + recencyScore * 0.1 + sourceAuthorityScore * 0.1);
    } else if (strategy === "hybrid_local_mvp") {
      // Blend keyword, semantic, and recency equally
      final_score = Math.round(baseScore * 0.3 + keywordScore * 0.3 + semanticScore * 0.2 + recencyScore * 0.1 + sourceAuthorityScore * 0.1);
    }

    // Clamp score tightly from 0 to 100 max boundary
    return Math.max(0, Math.min(100, final_score));
  }

  /**
   * CTX-16: Token budget greedy selector
   */
  public selectWithinBudget(
    sortedCandidates: RetrievalCandidateDTO[],
    budget_tokens?: number
  ): { selected: RetrievalCandidateDTO[]; accumulatedTokens: number } {
    const limitBudget = budget_tokens || 4000;
    let accumulatedTokens = 0;
    const selected: RetrievalCandidateDTO[] = [];

    for (const cand of sortedCandidates) {
      const tokensNeeded = cand.token_estimate || 0;
      if (accumulatedTokens + tokensNeeded <= limitBudget) {
        selected.push(cand);
        accumulatedTokens += tokensNeeded;
      }
    }

    return { selected, accumulatedTokens };
  }

  /**
   * CTX-17: Returns list of structural reason explanation codes
   */
  public explainRanking(
    baseScoring: any,
    keywordScore: number,
    graphScore: number,
    recencyScore: number,
    semanticScore: number
  ): string[] {
    const reason_codes = [...(baseScoring.reason_codes || [])];
    if (keywordScore > 15) reason_codes.push("BM25_LEXICAL_STRONG");
    if (graphScore > 0) reason_codes.push("GRAPH_WEIGHT_BOOST");
    if (recencyScore > 5) reason_codes.push("RECENCY_FRESHNESS_HIGH");
    if (semanticScore > 10) reason_codes.push("SEMANTIC_FALLBACK_MATCH");
    return reason_codes;
  }

  /**
   * CTX-18: Filters and redacts sensitive data (DATABASE_URL, credentials, absolute paths, secrets)
   */
  public redactCandidateMetadata(candidate: RetrievalCandidateDTO): RetrievalCandidateDTO {
    const cleanPath = (candidate.path || "")
      .replace(/\/app\/applet\//g, "")
      .replace(/\/home\/[^/]+\//g, "");

    const cleanMetadata = { ...candidate.metadata };

    // Scrub secret patterns inside metadata
    if (cleanMetadata) {
      for (const key of Object.keys(cleanMetadata)) {
        if (typeof cleanMetadata[key] === "string") {
          cleanMetadata[key] = redactSecretLeaks(cleanMetadata[key] as string);
        }
      }
      delete cleanMetadata.database_url;
      delete cleanMetadata.password;
      delete cleanMetadata.api_key;
      delete cleanMetadata.token;
      delete cleanMetadata.certificate;
    }

    // Exclude raw file contents or raw credentials from responses
    const cleanExcerpt = candidate.excerpt ? redactSecretLeaks(candidate.excerpt) : null;

    return {
      ...candidate,
      path: cleanPath,
      excerpt: cleanExcerpt,
      metadata: cleanMetadata
    };
  }

  /**
   * Performs the complete high-level list ranker logic
   */
  public rankCandidates(
    rawCandidates: RetrievalCandidateDTO[],
    queryDTO: RetrievalQueryDTO,
    graphData: any,
    taskRow: any
  ): RetrievalCandidateDTO[] {
    const { include_graph_weights, query, task_id } = queryDTO;
    
    // Select strategy
    let ranking_strategy: RankingStrategy = "hybrid_local_mvp";
    if (include_graph_weights && graphData) {
      ranking_strategy = "graph_weighted_mvp";
    } else if (queryDTO.source_types?.includes("code")) {
      ranking_strategy = "keyword_bm25_mvp";
    }

    const compiled = rawCandidates.map(c => {
      // Keyword
      const combinedContent = c.excerpt || ""; 
      const keywordScore = this.scoreKeywordBM25(combinedContent, query, c.path);

      // Graph
      const reason_codes = [...(c.reason_codes || [])];
      const graphScore = this.scoreGraphWeight(graphData, task_id || "", queryDTO.project_id, c.id, c.path, reason_codes);

      // Recency
      const recencyScore = this.scoreRecency(c.metadata?.updated_at, c.metadata?.created_at);

      // Source Authority
      const sourceAuthorityScore = this.scoreSourceAuthority(c.source_type as any);

      // Blended score
      const final_score = this.mergeScores(
        c.base_score || 30,
        keywordScore,
        c.semantic_score || 0,
        graphScore,
        recencyScore,
        sourceAuthorityScore,
        ranking_strategy
      );

      const updatedReasons = this.explainRanking(
        { reason_codes },
        keywordScore,
        graphScore,
        recencyScore,
        c.semantic_score || 0
      );

      const adjusted = {
        ...c,
        final_score,
        keyword_score: keywordScore,
        graph_score: graphScore,
        recency_score: recencyScore,
        reason_codes: updatedReasons
      };

      return this.redactCandidateMetadata(adjusted);
    });

    return compiled.sort((a, b) => b.final_score - a.final_score);
  }

  /**
   * Queries matching candidates, applies search server strategies, calculates custom ranking scores,
   * performs token budget checks, and outputs audit traces sequentially.
   */
  public async queryAndRankDirect(
    queryDTO: RetrievalQueryDTO,
    actor = "system",
    ipAddress = "127.0.0.1"
  ): Promise<RetrievalRankingResultDTO> {
    const { project_id, query, task_id, budget_tokens } = queryDTO;

    // A. Audit RETRIEVAL_RANKING_REQUESTED
    await this.emitAuditLog(
      project_id,
      actor,
      "RETRIEVAL_RANKING_REQUESTED",
      "authorized",
      { task_id: task_id || null, query_length: query.length, budget_tokens },
      `Retrieval ranking requested for project ${project_id} and task ${task_id || "none"}.`,
      task_id || "",
      ipAddress
    );

    try {
      // 1. Database Scoping Validation
      await this.validateProjectScope(project_id, actor, ipAddress);

      // 2. Cross-Project Task Bounds Verification
      let taskRow = { title: query, description: "", category: "" };
      if (task_id) {
        const task = await this.validateTaskScope(task_id, project_id, actor, ipAddress);
        taskRow = {
          title: task.title,
          description: "",
          category: ""
        };
      }

      // 3. Secret Leak Scanner check
      if (detectSecrets(query)) {
        await this.emitAuditLog(
          project_id,
          actor,
          "RETRIEVAL_SECRET_REDACTED",
          "denied_untrusted",
          { query_preview: "[REDACTED]" },
          "Context retrieval blocked. A security leak was detected in the search query content.",
          task_id || "",
          ipAddress
        );
        throw new SecretLeakedError("Potential API key or database credential leak prevented in the search query parameters.");
      }

      // 4. Query Raw Candidates from the SearchServer Layer
      const rawCandidates = await this.searchServer.queryCandidates(queryDTO, this.graphService);

      // 5. Fetch Graph for Weighting
      let graphData: any = null;
      if (queryDTO.include_graph_weights && this.graphService) {
        try {
          graphData = await this.graphService.getGraph(project_id);
        } catch (e) {
          // ignore
        }
      }

      // 6. Complete Score Ranking and Redaction
      const sortedCandidates = this.rankCandidates(rawCandidates, queryDTO, graphData, taskRow);

      // 7. Candidates Selected Log
      await this.emitAuditLog(
        project_id,
        actor,
        "RETRIEVAL_CANDIDATES_SELECTED",
        "authorized",
        { count: sortedCandidates.length },
        `Identified and scored ${sortedCandidates.length} context retrieval candidates sequentially.`,
        task_id || "",
        ipAddress
      );

      // 8. Greedy Budget Selector
      const { selected, accumulatedTokens } = this.selectWithinBudget(sortedCandidates, budget_tokens);

      // 9. Budget Applied Log
      await this.emitAuditLog(
        project_id,
        actor,
        "RETRIEVAL_BUDGET_APPLIED",
        "authorized",
        { budget_tokens: budget_tokens || 4000, selected_count: selected.length, tokens_used: accumulatedTokens },
        `Selected ${selected.length} items within budget footprint.`,
        task_id || "",
        ipAddress
      );

      // 10. Calculate overall confidence metrics and missing warnings
      const missingWarning = detectMissingContext(sortedCandidates.map(c => ({ source_type: c.source_type as ContextSourceType })));
      const missingContext = missingWarning.missing;
      const confidence = calculateConfidenceScore(
        sortedCandidates.map(c => ({
          context_item_id: c.id,
          path_or_uri: c.path,
          source_type: c.source_type as ContextSourceType,
          score: c.final_score,
          reason_codes: c.reason_codes,
          matched_chunks: c.excerpt ? [{ chunk_index: 0, content: c.excerpt, token_count: c.token_estimate || 0 }] : []
        })),
        missingContext
      );

      let ranking_strategy: RankingStrategy = "hybrid_local_mvp";
      if (queryDTO.include_graph_weights && graphData) {
        ranking_strategy = "graph_weighted_mvp";
      } else if (queryDTO.source_types?.includes("code")) {
        ranking_strategy = "keyword_bm25_mvp";
      }

      // Register successfully completed trace
      await this.emitAuditLog(
        project_id,
        actor,
        "RETRIEVAL_RANKING_COMPLETED",
        "authorized",
        { 
          confidence_score: confidence.score,
          tokens_used: accumulatedTokens,
          ranking_strategy
        },
        `Completed context retrieval ranking successfully (Strategy: ${ranking_strategy}).`,
        task_id || "",
        ipAddress
      );

      if (missingContext.length > 0) {
        await this.emitAuditLog(
          project_id,
          actor,
          "MISSING_CONTEXT_DETECTED",
          "authorized",
          { missing: missingContext, severity: missingWarning.severity },
          `Context gaps identified during ranking: ${missingContext.join(", ")}`,
          task_id || "",
          ipAddress
        );
      }

      if (confidence.score < 40) {
        await this.emitAuditLog(
          project_id,
          actor,
          "LOW_CONFIDENCE_RETRIEVAL",
          "redacted_and_completed",
          { score: confidence.score, reasons: confidence.reasons.join(", ") },
          `Low confidence ranking result yielded: ${confidence.score}`,
          task_id || "",
          ipAddress
        );
      }

      const warningsList: string[] = [];
      if (missingContext.length > 0) {
        warningsList.push(`Potential context coverage gap of: ${missingContext.join(", ")}`);
      }
      if (confidence.score < 40) {
        warningsList.push(`Low retrieval ranking confidence score: ${confidence.score}`);
      }

      return {
        project_id,
        task_id: task_id || null,
        query,
        candidates: sortedCandidates,
        selected,
        total_candidates: sortedCandidates.length,
        ranking_strategy,
        budget_tokens: budget_tokens || 4000,
        estimated_tokens: accumulatedTokens,
        warnings: warningsList,
        generated_at: new Date().toISOString()
      };
    } catch (err: any) {
      if (err.code === "UNAUTHORIZED" || err.code === "PERMISSION_DENIED" || err.message?.includes("Forbidden task scope crossing")) {
        await this.emitAuditLog(
          project_id,
          actor,
          "RETRIEVAL_CROSS_PROJECT_ACCESS_BLOCKED",
          "denied_untrusted",
          { task_id, project_id, error: err.message },
          `Retrieval blocked: cross-project access disallowed.`,
          task_id || "",
          ipAddress
        );
      }
      await this.emitAuditLog(
        project_id || null,
        actor,
        "RETRIEVAL_RANKING_FAILED",
        "denied_untrusted",
        { error: err.message, stack: err.stack },
        `Retrieval ranking failed: ${err.message}`,
        task_id || "",
        ipAddress
      );
      throw err;
    }
  }
}
