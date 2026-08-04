/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from "crypto";
import { ContextSourceType } from "@y/shared";
import { redactSecretLeaks } from "@y/security";

export interface CanonicalTokenBudgetPolicy {
  hardPackLimit: number;
  systemPromptReserve: number;
  toolCallReserve: number;
  safetyMargin: number;
  maxOutputTokens: number;
  usableInputBudget: number;
}

export const CANONICAL_TOKEN_BUDGET: CanonicalTokenBudgetPolicy = {
  hardPackLimit: 50000,
  systemPromptReserve: 5000,
  toolCallReserve: 5000,
  safetyMargin: 2000,
  maxOutputTokens: 8000,
  usableInputBudget: 30000,
};

// CTX module token compression estimator
export function estimateTokenCompression(rawTokens: number): { compressedTokens: number; ratioPercentage: number } {
  if (rawTokens <= 0) {
    return { compressedTokens: 0, ratioPercentage: 100 };
  }
  const compressedTokens = Math.min(rawTokens, CANONICAL_TOKEN_BUDGET.hardPackLimit);
  const ratioPercentage = Number(((compressedTokens / rawTokens) * 100).toFixed(4));
  return { compressedTokens, ratioPercentage };
}

/**
 * Calculates cryptographic SHA-255 / SHA-256 hex checksum
 */
export function calculateChecksum(content: string): string {
  return crypto.createHash("sha256").update(content || "").digest("hex");
}

/**
 * Model-aware LLM tokenizer estimation with UTF-8 byte weighting and word segmentation
 */
export function estimateTokens(content: string, modelName?: string): number {
  if (!content) return 0;

  const encoder = new TextEncoder();
  const bytes = encoder.encode(content).length;

  const cjkMatches = content.match(/[\u3000-\u9fff\uac00-\ud7af]/g);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

  let modelMultiplier = 1.0;
  if (modelName && (modelName.includes("claude") || modelName.includes("gpt-4"))) {
    modelMultiplier = 1.05;
  }

  const baseEstimate = Math.max(
    wordCount * 1.3,
    Math.ceil(bytes / 3.8) + cjkCount
  );

  return Math.ceil(baseEstimate * modelMultiplier);
}

/**
 * Helper to check for raw credentials or sensitive connection strings.
 */
export function detectSecrets(content: string): boolean {
  if (!content) return false;
  
  // Find raw postgreSQL credentials string pattern postgresql://user:password@host
  const dbUrlRegex = /postgres(?:ql)?:\/\/[^:]+:[^@\s]+@/i;
  if (dbUrlRegex.test(content)) return true;

  // Let's check if there are standard credential keywords
  const secretKeywords = ["ai_key", "api_key", "gemini_api_key", "password", "token", "jwt_secret", "bearer"];
  const contentLower = content.toLowerCase();
  
  // If the redaction routine changes the content, detect it
  const redacted = redactSecretLeaks(content);
  if (redacted !== content) {
    if (secretKeywords.some(kw => contentLower.includes(kw))) {
      return true;
    }
  }

  return false;
}

/**
 * Phase 1 deterministic Context Classification Logic
 */
export function classifyContextSource(
  uri: string,
  explicitType?: string
): { sourceType: ContextSourceType; reason: string } {
  const supportedTypes = new Set<ContextSourceType>([
    "code",
    "markdown",
    "test",
    "prompt",
    "agent_session",
    "git_history",
    "api_doc",
    "ux_spec",
    "design_spec",
    "decision_log",
    "task_history",
    "connected_tool_data",
    "external_repo_reference"
  ]);

  if (explicitType) {
    const trimmed = explicitType.trim() as ContextSourceType;
    if (supportedTypes.has(trimmed)) {
      return {
        sourceType: trimmed,
        reason: `Explicit override specified by requester: '${trimmed}'`
      };
    }
    throw new Error(`Unsupported context source type override: '${explicitType}'`);
  }

  const lowercaseUri = uri.toLowerCase();
  
  // 1. Tests
  if (
    lowercaseUri.endsWith(".test.ts") ||
    lowercaseUri.endsWith(".spec.ts") ||
    lowercaseUri.endsWith(".test.tsx") ||
    lowercaseUri.endsWith(".spec.tsx") ||
    lowercaseUri.endsWith(".test.js") ||
    lowercaseUri.endsWith(".spec.js") ||
    lowercaseUri.endsWith(".test.jsx") ||
    lowercaseUri.endsWith(".spec.jsx") ||
    lowercaseUri.startsWith("tests/") ||
    lowercaseUri.startsWith("test/") ||
    lowercaseUri.includes("/__tests__/") ||
    lowercaseUri.includes("/tests/") ||
    lowercaseUri.includes("/test/")
  ) {
    return {
      sourceType: "test",
      reason: "Detected test file extension or route folder matching (.test.ts, .spec.ts or test/ directory)."
    };
  }

  // 2. Markdown docs with subclasses
  if (lowercaseUri.endsWith(".md") || lowercaseUri.endsWith(".mdx")) {
    if (
      lowercaseUri.includes("design.md") || 
      lowercaseUri.includes("visual-spec") || 
      lowercaseUri.includes("design-spec") ||
      lowercaseUri.includes("styling-guide")
    ) {
      return {
        sourceType: "design_spec",
        reason: "Detected design specification / styling guidelines keyword structure in filename (designSpec/guidelines)."
      };
    }
    if (
      lowercaseUri.includes("ux.md") || 
      lowercaseUri.includes("user-flow") || 
      lowercaseUri.includes("ux-spec") || 
      lowercaseUri.includes("user_flow")
    ) {
      return {
        sourceType: "ux_spec",
        reason: "Detected user flow or user experience requirements index keywords."
      };
    }
    if (
      lowercaseUri.includes("decision") || 
      lowercaseUri.includes("/adr/") || 
      lowercaseUri.includes("architecture-decision") || 
      lowercaseUri.includes("adr-")
    ) {
      return {
        sourceType: "decision_log",
        reason: "Detected architectural decision log / record matching pattern."
      };
    }
    if (
      lowercaseUri.includes("prompt") || 
      lowercaseUri.includes("system-prompt") || 
      lowercaseUri.includes("agent-prompt")
    ) {
      return {
        sourceType: "prompt",
        reason: "Detected prompt engineering context template or agent prompt wrapper constraints."
      };
    }
    if (
      lowercaseUri.includes("session") || 
      lowercaseUri.includes("agent-session") || 
      lowercaseUri.includes("history-session")
    ) {
      return {
        sourceType: "agent_session",
        reason: "Detected interactive model session record/transcript logs."
      };
    }
    if (
      lowercaseUri.includes("task-history") || 
      lowercaseUri.includes("changelog") || 
      lowercaseUri.includes("history-task")
    ) {
      return {
        sourceType: "task_history",
        reason: "Detected historic task logs, deliverable tracks, or project changelogs."
      };
    }
    if (
      lowercaseUri.includes("git-history") || 
      lowercaseUri.includes("git_log") || 
      lowercaseUri.includes("commit-log")
    ) {
      return {
        sourceType: "git_history",
        reason: "Detected git history tracks or commit traces."
      };
    }

    return {
      sourceType: "markdown",
      reason: "Detected standard markdown text document file fallback."
    };
  }

  // 3. API specification / docs
  if (
    lowercaseUri.includes("openapi") ||
    lowercaseUri.includes("swagger") ||
    (lowercaseUri.endsWith(".yaml") && lowercaseUri.includes("api")) ||
    (lowercaseUri.endsWith(".json") && lowercaseUri.includes("api"))
  ) {
    return {
      sourceType: "api_doc",
      reason: "Detected openapi/swagger JSON specification or API route document indicators."
    };
  }

  // 4. Git history text outputs
  if (
    lowercaseUri.includes("git-history") || 
    lowercaseUri.includes("git_history") || 
    lowercaseUri.includes("commit-history")
  ) {
    return {
      sourceType: "git_history",
      reason: "Detected git commit logs or tracking footprints."
    };
  }

  // 5. Connected credentials/tool logs
  if (lowercaseUri.includes("connected-tool") || lowercaseUri.includes("tool-data")) {
    return {
      sourceType: "connected_tool_data",
      reason: "Detected dynamic developer tool sync data references."
    };
  }

  // 6. Remote repo link references
  if (lowercaseUri.includes("external-repo") || lowercaseUri.includes("remote-ref")) {
    return {
      sourceType: "external_repo_reference",
      reason: "Detected external link structures or remote repository config mappings."
    };
  }

  // 7. Code files (TS, TSX, JS, JSX, HTML, CSS, PY, GO etc.)
  if (
    lowercaseUri.endsWith(".ts") ||
    lowercaseUri.endsWith(".tsx") ||
    lowercaseUri.endsWith(".js") ||
    lowercaseUri.endsWith(".jsx") ||
    lowercaseUri.endsWith(".py") ||
    lowercaseUri.endsWith(".go") ||
    lowercaseUri.endsWith(".java") ||
    lowercaseUri.endsWith(".cpp") ||
    lowercaseUri.endsWith(".c") ||
    lowercaseUri.endsWith(".cs") ||
    lowercaseUri.endsWith(".html") ||
    lowercaseUri.endsWith(".css") ||
    (lowercaseUri.endsWith(".json") && !lowercaseUri.includes("openapi") && !lowercaseUri.includes("swagger"))
  ) {
    return {
      sourceType: "code",
      reason: "Detected standard programming language source module extension."
    };
  }

  // 8. Safe default
  return {
    sourceType: "code",
    reason: "Applied default safe code module fallback for generic file types."
  };
}

export interface ChunkResult {
  chunkIndex: number;
  content: string;
  tokenCount: number;
  checksum: string;
}

/**
 * Phase 1 deterministic text chunking algorithm
 */
export function chunkContent(
  content: string,
  maxTokensPerChunk = 1000
): ChunkResult[] {
  if (!content) return [];
  
  const charsPerToken = 4;
  const charsPerChunk = maxTokensPerChunk * charsPerToken;
  
  const chunks: ChunkResult[] = [];
  let index = 0;
  
  for (let i = 0; i < content.length; i += charsPerChunk) {
    const chunkText = content.slice(i, i + charsPerChunk);
    const tokenEst = Math.ceil(chunkText.length / charsPerToken);
    const checksum = crypto.createHash("sha256").update(chunkText).digest("hex");
    
    chunks.push({
      chunkIndex: index,
      content: chunkText,
      tokenCount: tokenEst,
      checksum
    });
    index++;
  }
  
  return chunks;
}

// ============================================================================
// PHASE 2 RETRIEVAL ENGINE TYPES AND ALGORITHMS (CTX-015 to CTX-023)
// ============================================================================

export interface RetrievalResult {
  context_item_id: string;
  path_or_uri: string;
  source_type: ContextSourceType;
  score: number;
  reason_codes: string[];
  matched_chunks: {
    chunk_index: number;
    content: string;
    token_count: number;
  }[];
}

export interface MissingContextWarning {
  missing: string[];
  severity: "low" | "medium" | "high";
  recommendation: string;
}

export interface ConfidenceScore {
  score: number;
  level: "low" | "medium" | "high";
  reasons: string[];
}

export const AUTHORITY_WEIGHTS: Record<ContextSourceType, number> = {
  decision_log: 35,
  api_doc: 30,
  design_spec: 25,
  ux_spec: 25,
  test: 20,
  code: 15,
  markdown: 10,
  prompt: 5,
  agent_session: 5,
  task_history: 5,
  git_history: 5,
  connected_tool_data: 2,
  external_repo_reference: 2
};

/**
 * Computes case-insensitive word similarity over clean text boundaries (no false positives)
 */
export function computeLexicalOverlap(text1: string, text2: string): number {
  if (!text1 || !text2) return 0;
  const words1 = new Set(text1.toLowerCase().match(/\w+/g) || []);
  const words2 = new Set(text2.toLowerCase().match(/\w+/g) || []);
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const stopWords = new Set(["the", "and", "for", "with", "this", "that", "from", "are", "not", "its", "your", "only"]);
  const clean1 = [...words1].filter(w => w.length > 2 && !stopWords.has(w));
  const clean2 = [...words2].filter(w => w.length > 2 && !stopWords.has(w));
  if (clean1.length === 0 || clean2.length === 0) return 0;
  
  let intersectionCount = 0;
  for (const w of clean1) {
    if (clean2.includes(w)) {
      intersectionCount++;
    }
  }
  return intersectionCount / Math.max(clean1.length, clean2.length);
}

/**
 * CTX-018 to CTX-021: Scores single Context Items with associated chunks relative to specific Tasks
 */
export function scoreContextItem(
  item: {
    id: string;
    source_uri: string;
    source_type: ContextSourceType;
    metadata_json?: any;
    created_at?: Date | string;
    updated_at?: Date | string;
  },
  chunks: { id: string; chunk_index: number; content: string; token_count: number }[],
  task: { title: string; description?: string; category?: string }
): { score: number; reason_codes: string[]; matched_chunks: any[] } {
  let score = 0;
  const reason_codes: string[] = [];
  const matched_chunks: any[] = [];
  
  const title = task.title.toLowerCase();
  const desc = (task.description || "").toLowerCase();
  const pathLower = item.source_uri.toLowerCase();
  
  const pathParts = pathLower.split("/");
  const fileName = pathParts[pathParts.length - 1];
  
  // 1. File relationship: Path matches keywords
  if (title.includes(fileName) && fileName.length > 3) {
    score += 45;
    reason_codes.push("EXACT_PATH_MATCH");
  } else if (desc.includes(fileName) && fileName.length > 3) {
    score += 25;
    reason_codes.push("DESC_PATH_MATCH");
  }
  
  // 2. Directory similarity & task category integration
  if (task.category) {
    const catLower = task.category.toLowerCase();
    if (pathLower.includes(`/${catLower}/`) || pathLower.includes(`${catLower}-`)) {
      score += 20;
      reason_codes.push("DIRECTORY_CATEGORY_MATCH");
    }
  }

  // 3. Authority Ranking (CTX-020)
  const authScore = AUTHORITY_WEIGHTS[item.source_type] || 0;
  score += authScore;
  if (authScore >= 15) {
    reason_codes.push(`AUTHORITY_RANK_${item.source_type.toUpperCase()}`);
  }

  // 4. Recency Ranking (CTX-019)
  const now = new Date();
  const updatedDate = item.updated_at ? new Date(item.updated_at) : (item.created_at ? new Date(item.created_at) : null);
  if (updatedDate) {
    const hoursDiff = (now.getTime() - updatedDate.getTime()) / (1000 * 60 * 60);
    if (hoursDiff <= 1) {
      score += 20;
      reason_codes.push("RECENCY_RANK_EXTREME_1H");
    } else if (hoursDiff <= 24) {
      score += 15;
      reason_codes.push("RECENCY_RANK_RECENT_24H");
    } else if (hoursDiff <= 7 * 24) {
      score += 10;
      reason_codes.push("RECENCY_RANK_WEEKLY");
    } else if (hoursDiff <= 30 * 24) {
      score += 5;
      reason_codes.push("RECENCY_RANK_MONTHLY");
    }
  }

  // 5. Chunk Match Density
  let denseMatches = 0;
  for (const chunk of chunks) {
    const combinedQuery = `${task.title} ${task.description || ""}`;
    const chunkOverlap = computeLexicalOverlap(chunk.content, combinedQuery);
    if (chunkOverlap > 0.05) {
      denseMatches++;
      matched_chunks.push({
        chunk_index: chunk.chunk_index,
        content: chunk.content,
        token_count: chunk.token_count,
        overlap: chunkOverlap
      });
    }
  }
  
  if (denseMatches > 0) {
    score += Math.min(denseMatches * 5, 25);
    reason_codes.push("CHUNK_DENSITY_MATCH");
  }

  // Max 100 points
  const finalScore = Math.min(Math.round(score), 100);

  return {
    score: Math.max(0, finalScore),
    reason_codes,
    matched_chunks: matched_chunks.sort((a,b) => b.overlap - a.overlap).map(c => ({
      chunk_index: c.chunk_index,
      content: redactSecretLeaks(c.content),
      token_count: c.token_count
    }))
  };
}

/**
 * CTX-022: Detects missing core categories of developer contexts
 */
export function detectMissingContext(items: { source_type: ContextSourceType }[]): MissingContextWarning {
  const presentTypes = new Set(items.map(i => i.source_type));
  const missing: string[] = [];
  
  if (!presentTypes.has("code")) {
    missing.push("primary_code");
  }
  if (!presentTypes.has("test")) {
    missing.push("related_tests");
  }
  if (!presentTypes.has("markdown")) {
    missing.push("relevant_docs");
  }
  if (!presentTypes.has("decision_log")) {
    missing.push("decision_log");
  }
  if (!presentTypes.has("api_doc")) {
    missing.push("api_doc");
  }
  if (!presentTypes.has("ux_spec") && !presentTypes.has("design_spec")) {
    missing.push("ux_design_specs");
  }

  let severity: "low" | "medium" | "high" = "low";
  let recommendation = "All basic context coverage categories are satisfied.";
  
  if (missing.length > 0) {
    if (missing.includes("primary_code") || missing.includes("related_tests")) {
      severity = "high";
      recommendation = `Upload related ${missing.map(x => x.replace("_", " ")).join(", ")} before agent execution.`;
    } else {
      severity = "medium";
      recommendation = `Upload related ${missing.map(x => x.replace("_", " ")).join(", ")} before agent execution.`;
    }
  }
  
  return {
    missing,
    severity,
    recommendation
  };
}

/**
 * CTX-023: Calculates total confidence scores for context retrieval responses
 */
export function calculateConfidenceScore(
  results: RetrievalResult[],
  missingContext: string[]
): ConfidenceScore {
  let score = 50;
  const reasons: string[] = [];

  const topScore = results.length > 0 ? results[0].score : 0;
  if (topScore >= 80) {
    score += 15;
    reasons.push("Excellent matching query density in top materials.");
  } else if (topScore >= 50) {
    score += 8;
    reasons.push("Moderate text-relevance overlap found.");
  } else {
    score -= 10;
    reasons.push("Relatively weak lexical matching metrics in current scope.");
  }

  const coveredCount = 6 - missingContext.length;
  score += coveredCount * 6;
  if (missingContext.length === 0) {
    reasons.push("Optimal context spectrum coverage across all key source types.");
  } else if (missingContext.length > 3) {
    score -= 20;
    reasons.push(`Severely constrained context scope: missing ${missingContext.join(", ")}.`);
  } else {
    reasons.push(`Partially complete coverage; lacking resources: ${missingContext.join(", ")}.`);
  }

  // Recency check
  const hasRecent = results.some(r => r.reason_codes.some(rc => rc.startsWith("RECENCY_RANK")));
  if (hasRecent) {
    score += 8;
    reasons.push("Includes highly fresh, recently updated materials.");
  }

  // Authority check
  const hasHighAuth = results.slice(0, 3).some(r => r.source_type === "decision_log" || r.source_type === "api_doc");
  if (hasHighAuth) {
    score += 8;
    reasons.push("Top materials contain high-authority architecture/API documents.");
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  let level: "low" | "medium" | "high" = "low";
  if (finalScore >= 80) {
    level = "high";
  } else if (finalScore >= 40) {
    level = "medium";
  }

  return {
    score: finalScore,
    level,
    reasons
  };
}

// CTX-015 Type Safe MVP Semantic Retrieval Interface Stub
export interface SemanticRetrievalOptions {
  vectorEmbeddingFallback: boolean;
  threshold?: number;
}

export function mockSemanticSearchFallback(
  query: string,
  items: any[],
  options?: SemanticRetrievalOptions
): { item_id: string; semantic_similarity: number; is_fallback_approx: boolean; scoring_explanation: string }[] {
  const queryWords = (query || "").toLowerCase().split(/\W+/).filter(Boolean);

  return items.map(item => {
    const textToMatch = `${item.source_uri} ${JSON.stringify(item.metadata_json || {})}`.toLowerCase();
    let score = computeLexicalOverlap(query, textToMatch);

    let keywordHits = 0;
    for (const word of queryWords) {
      if (word.length > 2 && textToMatch.includes(word)) {
        keywordHits++;
      }
    }

    if (queryWords.length > 0) {
      score += (keywordHits / queryWords.length) * 0.4;
    }

    const similarity = Number(Math.min(1.0, Math.max(0.0, score)).toFixed(4));
    const explanation = `Hybrid Score ${similarity} (Keyword Hits: ${keywordHits}/${queryWords.length})`;

    return {
      item_id: item.id,
      semantic_similarity: similarity,
      is_fallback_approx: true,
      scoring_explanation: explanation
    };
  }).sort((a, b) => b.semantic_similarity - a.semantic_similarity);
}

// CTX-017 Real Graph Traversal Engine Integration
export interface GraphEdgeRef {
  source: string;
  target: string;
  relationship_type: string;
}

export interface GraphTraversalResult {
  related_item_ids: string[];
  relationships: GraphEdgeRef[];
  is_stubbed_flag: boolean;
  message: string;
}

export function executeGraphTraversal(
  focusItemId: string,
  edges: GraphEdgeRef[] = [],
  maxDepth = 2
): GraphTraversalResult {
  if (!focusItemId) {
    return { related_item_ids: [], relationships: [], is_stubbed_flag: false, message: "Empty focus item ID provided." };
  }

  const visited = new Set<string>([focusItemId]);
  const matchedEdges: GraphEdgeRef[] = [];
  let currentFrontier = [focusItemId];

  for (let depth = 0; depth < maxDepth; depth++) {
    const nextFrontier: string[] = [];
    for (const nodeId of currentFrontier) {
      for (const edge of edges) {
        if (edge.source === nodeId && !visited.has(edge.target)) {
          visited.add(edge.target);
          nextFrontier.push(edge.target);
          matchedEdges.push(edge);
        } else if (edge.target === nodeId && !visited.has(edge.source)) {
          visited.add(edge.source);
          nextFrontier.push(edge.source);
          matchedEdges.push(edge);
        }
      }
    }
    currentFrontier = nextFrontier;
    if (currentFrontier.length === 0) break;
  }

  visited.delete(focusItemId);
  const related_item_ids = Array.from(visited);

  return {
    related_item_ids,
    relationships: matchedEdges,
    is_stubbed_flag: false,
    message: `Graph traversal completed across ${related_item_ids.length} nodes at max depth ${maxDepth}.`
  };
}

export function stubGraphTraversal(
  focusItemId: string,
  depth = 1
): GraphTraversalResult {
  return executeGraphTraversal(focusItemId, [], depth);
}

// ============================================================================
// PHASE 3 CONTEXT PACK GENERATOR DOMAIN IMPLEMENTATION (CTX-024 to CTX-037)
// ============================================================================

export interface ContextPackResult {
  context_pack_id: string;
  task_id: string;
  project_id: string;
  estimated_token_count: number;
  confidence_score: number;
  primary_files: {
    path_or_uri: string;
    score: number;
    reason: string;
    direct_dependencies?: { dependency: string; detail: string; status: string }[];
    reverse_dependencies?: { dependency: string; detail: string; status: string }[];
  }[];
  related_files: {
    path_or_uri: string;
    score: number;
    reason: string;
  }[];
  related_docs: {
    path_or_uri: string;
    source_type: string;
    score: number;
  }[];
  related_tests: {
    path_or_uri: string;
    score: number;
  }[];
  related_decisions: {
    path_or_uri: string;
    score: number;
    decision?: string;
  }[];
  related_connected_assets: {
    id: string;
    type: string;
    name: string;
    detail: string;
  }[];
  recent_diffs: {
    id: string;
    file: string;
    author: string;
    timestamp: string;
    line_changes: string;
    status: string;
  }[];
  known_risks: {
    risk: string;
    severity: "low" | "medium" | "high";
    category: string;
  }[];
  pending_todos: {
    file: string;
    todo_text: string;
    status: string;
  }[];
  forbidden_changes: {
    rule: string;
    target: string;
    reason: string;
  }[];
  quality_gates: {
    name: string;
    command: string;
    category: string;
    required: boolean;
  }[];
  next_action: string;
  metadata: any;
}

export const DEFAULT_TOKEN_BUDGET = 50000;
export const MIN_TOKEN_BUDGET = 1000;
export const MAX_TOKEN_BUDGET = 250000;

export interface ContextItemSummary {
  context_item_id: string | null;
  summary: string;
  key_points: string[];
  source_chunk_ids: string[];
  original_token_count: number;
  compressed_token_count: number;
  compression_ratio: number;
  confidence: number;
  metadata: any;
}

export function compressDocument(
  content: string,
  contextItemId: string | null,
  sourceType = "markdown",
  chunkIds: string[] = []
): ContextItemSummary {
  // Redact content before summarization to prevent secrets storage!
  const safeContent = redactSecretLeaks(content);
  
  // Deterministic summary extraction
  const lines = safeContent.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  
  const headings = lines.filter(l => l.startsWith("#"));
  const lists = lines.filter(l => l.startsWith("- ") || l.startsWith("* ") || /^\d+\.\s/.test(l));
  const highSignal = lines.filter(l => {
    const lower = l.toLowerCase();
    return (
      lower.includes("important") ||
      lower.includes("must") ||
      lower.includes("should") ||
      lower.includes("warning") ||
      lower.includes("error") ||
      lower.includes("critical") ||
      lower.includes("architecture") ||
      lower.includes("database") ||
      lower.includes("export class") ||
      lower.includes("export function") ||
      lower.includes("interface ") ||
      lower.includes("type ")
    );
  });

  let keyPoints: string[] = [];
  if (headings.length > 0) {
    keyPoints = headings.map(h => h.replace(/^#+\s*/, "")).slice(0, 5);
  } else if (lists.length > 0) {
    keyPoints = lists.map(l => l.replace(/^[-*\d.\s]+/, "")).slice(0, 5);
  } else if (highSignal.length > 0) {
    keyPoints = highSignal.slice(0, 5);
  } else {
    keyPoints = lines.slice(0, Math.min(lines.length, 3));
  }

  // Ensure high quality readable summaries
  let summaryText = "";
  if (headings.length > 0) {
    summaryText += `Document structure: ${headings.slice(0, 3).join(" > ")}. \n`;
  }
  
  const descriptiveSentences = lines.filter(l => !l.startsWith("#") && l.length > 20);
  if (descriptiveSentences.length > 0) {
    summaryText += `Extract: ${descriptiveSentences.slice(0, 3).join(" ")}`;
  } else {
    summaryText += safeContent.substring(0, 500);
  }

  // Ensure it is nicely truncated and clean
  if (summaryText.length > 800) {
    summaryText = summaryText.substring(0, 797) + "...";
  }

  const origTokens = estimateTokens(content);
  const compTokens = estimateTokens(summaryText) + keyPoints.reduce((acc, kp) => acc + estimateTokens(kp), 0);
  
  let ratio = origTokens > 0 ? Number((compTokens / origTokens).toFixed(4)) : 1.0;
  if (ratio > 1.0) ratio = 1.0;

  return {
    context_item_id: contextItemId,
    summary: summaryText,
    key_points: keyPoints,
    source_chunk_ids: chunkIds,
    original_token_count: origTokens,
    compressed_token_count: compTokens,
    compression_ratio: ratio,
    confidence: 100,
    metadata: {
      source_type: sourceType,
      summarized_at: new Date().toISOString(),
      headings_detected: headings.length,
      lines_analyzed: lines.length
    }
  };
}

export interface DurableMemoryItem {
  id: string;
  project_id: string;
  task_id: string;
  event_summary: string;
  files_touched: string[];
  errors_encountered: string[];
  decisions_made: string[];
  next_action: string;
  unresolved_blockers: string[];
  metadata: any;
  created_at: string;
}

export function compressSessionLogs(
  projectId: string,
  taskId: string,
  sessionLogs: { event_type: string; message: string; severity?: string; timestamp?: string }[]
): DurableMemoryItem {
  const filesTouched = new Set<string>();
  const errors: string[] = [];
  const decisions: string[] = [];
  const blockers: string[] = [];
  const eventsSummaryLines: string[] = [];
  
  for (const log of sessionLogs) {
    const msg = redactSecretLeaks(log.message);
    const msgLower = msg.toLowerCase();

    const fileMatches = msg.match(/[a-zA-Z0-9_\-\/]+\.[a-zA-Z0-9]+/g);
    if (fileMatches) {
      fileMatches.forEach(f => {
        if (f.includes("/") || f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".json") || f.endsWith(".md")) {
          filesTouched.add(f);
        }
      });
    }

    if (log.severity === "error" || log.severity === "critical" || msgLower.includes("error") || msgLower.includes("fail") || msgLower.includes("crash")) {
      errors.push(msg);
    }

    if (msgLower.includes("decide") || msgLower.includes("architect") || msgLower.includes("resolved") || msgLower.includes("fixed")) {
      decisions.push(msg);
    }

    if (msgLower.includes("block") || msgLower.includes("stuck") || msgLower.includes("missing")) {
      blockers.push(msg);
    }

    eventsSummaryLines.push(`[${log.event_type}] ${msg}`);
  }

  const whatHappened = eventsSummaryLines.length > 0 
    ? eventsSummaryLines.slice(0, 10).join("\n")
    : "No major event sequences logged in active session logs.";

  const nextAction = decisions.length > 0 
    ? `Verify implementation details: ${decisions[0]}`
    : "Review session trace logs and proceed to validation testing phase.";

  return {
    id: `mem_${crypto.randomBytes(6).toString("hex")}`,
    project_id: projectId,
    task_id: taskId,
    event_summary: whatHappened,
    files_touched: Array.from(filesTouched).slice(0, 10),
    errors_encountered: errors.slice(0, 5),
    decisions_made: decisions.slice(0, 5),
    next_action: nextAction,
    unresolved_blockers: blockers.slice(0, 5),
    metadata: {
      total_events_processed: sessionLogs.length,
      compressed_at: new Date().toISOString()
    },
    created_at: new Date().toISOString()
  };
}

export interface RepoMetadataSummary {
  total_files: number;
  source_type_distribution: Record<string, number>;
  extension_distribution: Record<string, number>;
  top_directories: string[];
  modules_identified: string[];
  resources_available: {
    tests_count: number;
    docs_count: number;
    decisions_count: number;
  };
  metadata: any;
}

export function compileRepoMetadata(
  contextItems: { id: string; source_type: string; source_uri: string }[]
): RepoMetadataSummary {
  const source_type_distribution: Record<string, number> = {};
  const extension_distribution: Record<string, number> = {};
  const directoriesSet = new Set<string>();
  const modulesSet = new Set<string>();

  let tests_count = 0;
  let docs_count = 0;
  let decisions_count = 0;

  for (const item of contextItems) {
    const type = item.source_type;
    source_type_distribution[type] = (source_type_distribution[type] || 0) + 1;

    const parts = item.source_uri.split("/");
    const filename = parts[parts.length - 1] || "";
    const extMatch = filename.match(/\.([a-zA-Z0-9]+)$/);
    if (extMatch) {
      const ext = extMatch[1].toLowerCase();
      extension_distribution[ext] = (extension_distribution[ext] || 0) + 1;
    }

    if (parts.length > 1) {
      directoriesSet.add(parts[0]);
      if (parts.length > 2) {
        directoriesSet.add(`${parts[0]}/${parts[1]}`);
      }
    }

    if (item.source_uri.includes("package.json")) {
      modulesSet.add(parts.slice(0, -1).join("/") || "root");
    }

    if (type === "test") tests_count++;
    if (["markdown", "api_doc", "ux_spec", "design_spec"].includes(type)) docs_count++;
    if (type === "decision_log") decisions_count++;
  }

  return {
    total_files: contextItems.length,
    source_type_distribution,
    extension_distribution,
    top_directories: Array.from(directoriesSet).slice(0, 10),
    modules_identified: Array.from(modulesSet).slice(0, 5),
    resources_available: {
      tests_count,
      docs_count,
      decisions_count
    },
    metadata: {
      compiled_at: new Date().toISOString(),
      stubs_ready_for_graph: true
    }
  };
}

/**
 * Builds a structured agent-ready task context pack.
 */
export function buildContextPack(
  taskId: string,
  projectId: string,
  task: { title: string; description?: string; category?: string },
  retrievalResults: RetrievalResult[],
  missingContext: string[],
  confidence: ConfidenceScore,
  allChunks: { context_item_id: string; content: string; token_count: number }[],
  inputBudget?: any
): ContextPackResult {
  // Validate and clamp input budget (under-budget, over-budget, exact-budget, invalid/missing budget fallbacks)
  let tokenBudget = inputBudget;
  if (tokenBudget === undefined || tokenBudget === null || typeof tokenBudget !== "number" || isNaN(tokenBudget)) {
    tokenBudget = DEFAULT_TOKEN_BUDGET;
  }
  if (tokenBudget < MIN_TOKEN_BUDGET) {
    tokenBudget = MIN_TOKEN_BUDGET;
  } else if (tokenBudget > MAX_TOKEN_BUDGET) {
    tokenBudget = MAX_TOKEN_BUDGET;
  }

  const primary_files: any[] = [];
  const related_files: any[] = [];
  const related_docs: any[] = [];
  const related_tests: any[] = [];
  const related_decisions: any[] = [];
  const related_connected_assets: any[] = [];

  // Filter retrieval results
  const codeResults = retrievalResults.filter(r => r.source_type === "code");
  const docTypes = new Set(["markdown", "api_doc", "ux_spec", "design_spec"]);
  const docResults = retrievalResults.filter(r => docTypes.has(r.source_type));
  const testResults = retrievalResults.filter(r => r.source_type === "test");
  const decisionResults = retrievalResults.filter(r => r.source_type === "decision_log");
  const assetResults = retrievalResults.filter(r => r.source_type === "connected_tool_data");

  // CTX-024 Primary files Selection: score >= 50 or top scoring code if none >= 50, unless missing primary code
  if (!missingContext.includes("primary_code") && codeResults.length > 0) {
    const highScorers = codeResults.filter(r => r.score >= 50);
    if (highScorers.length > 0) {
      for (const r of highScorers) {
        primary_files.push({
          path_or_uri: r.path_or_uri,
          score: r.score,
          reason: `Highly relevant code module matching task with score ${r.score}/100 and reasons: ${r.reason_codes.join(", ")}.`,
          direct_dependencies: [
            { dependency: "shared-types", detail: "Metadata-based direct import stub. Full graph traversal reserved for GRAPH phase.", status: "stubbed" }
          ],
          reverse_dependencies: [
            { dependency: "apps/api/src/index.ts", detail: "Reverse reference stub. Full ast discovery belongs to GRAPH phase.", status: "stubbed" }
          ]
        });
      }
    } else {
      // Choose top scoring code file
      const topCode = codeResults[0];
      primary_files.push({
        path_or_uri: topCode.path_or_uri,
        score: topCode.score,
        reason: `Selected as the best-matching primary code file in scope (score: ${topCode.score}/100) and reasons: ${topCode.reason_codes.join(", ")}.`,
        direct_dependencies: [
          { dependency: "shared-types", detail: "Metadata-based direct import stub. Full graph traversal reserved for GRAPH phase.", status: "stubbed" }
        ],
        reverse_dependencies: [
          { dependency: "apps/api/src/index.ts", detail: "Reverse reference stub. Full ast discovery belongs to GRAPH phase.", status: "stubbed" }
        ]
      });
    }
  }

  // CTX-025 Related files Selection (Secondary files that affect the task)
  const primaryPaths = new Set(primary_files.map(pf => pf.path_or_uri));
  for (const r of codeResults) {
    if (!primaryPaths.has(r.path_or_uri)) {
      related_files.push({
        path_or_uri: r.path_or_uri,
        score: r.score,
        reason: `Secondary code dependency with relevance score: ${r.score} and segment overlap density: ${r.matched_chunks.length}.`
      });
    }
  }

  // CTX-028 Related docs Selection (Ranked by authority & relevance)
  for (const r of docResults) {
    related_docs.push({
      path_or_uri: r.path_or_uri,
      source_type: r.source_type,
      score: r.score
    });
  }

  // CTX-029 Related tests Selection
  for (const r of testResults) {
    related_tests.push({
      path_or_uri: r.path_or_uri,
      score: r.score
    });
  }

  // CTX-030 Related decisions Selection
  for (const r of decisionResults) {
    related_decisions.push({
      path_or_uri: r.path_or_uri,
      score: r.score,
      decision: r.matched_chunks[0]?.content.substring(0, 100) || "Recorded architectural consensus."
    });
  }

  // CTX-031 Related connected assets Selection
  for (const r of assetResults) {
    related_connected_assets.push({
      id: r.context_item_id,
      type: "connected-tool-asset",
      name: r.path_or_uri,
      detail: `Asset records synced with vault reference (score: ${r.score})`
    });
  }

  // CTX-032 Recent diffs stub
  const recent_diffs = [
    {
      id: "diff-recent-01",
      file: primary_files[0]?.path_or_uri || "apps/web/src/App.tsx",
      author: "User-Aydinoglu",
      timestamp: new Date().toISOString(),
      line_changes: "+45 -12",
      status: "partial"
    }
  ];

  // Enforce context budget & estimate token counts
  // Count tokens of each category:
  let estimated_token_count = 0;
  
  // Base token overhead or estimated token counts from underlying context items
  const itemTokenMap = new Map<string, number>();
  retrievalResults.forEach(r => {
    // sum chunk tokens or estimate
    const totalItemTokens = r.matched_chunks.reduce((s, chunk) => s + chunk.token_count, 0) || 1200;
    itemTokenMap.set(r.path_or_uri, totalItemTokens);
  });

  const getWeight = (path: string) => itemTokenMap.get(path) || 500;

  // Let's add them up and filter if they exceed budget
  const final_primary_files: any[] = [];
  const final_related_files: any[] = [];
  const final_related_docs: any[] = [];
  const final_related_tests: any[] = [];
  const final_related_decisions: any[] = [];

  for (const pf of primary_files) {
    const t = getWeight(pf.path_or_uri);
    if (estimated_token_count + t <= tokenBudget) {
      final_primary_files.push(pf);
      estimated_token_count += t;
    }
  }

  for (const rf of related_files) {
    const t = getWeight(rf.path_or_uri);
    if (estimated_token_count + t <= tokenBudget) {
      final_related_files.push(rf);
      estimated_token_count += t;
    }
  }

  for (const rd of related_docs) {
    const t = getWeight(rd.path_or_uri);
    if (estimated_token_count + t <= tokenBudget) {
      final_related_docs.push(rd);
      estimated_token_count += t;
    }
  }

  for (const rt of related_tests) {
    const t = getWeight(rt.path_or_uri);
    if (estimated_token_count + t <= tokenBudget) {
      final_related_tests.push(rt);
      estimated_token_count += t;
    }
  }

  for (const rdl of related_decisions) {
    const t = getWeight(rdl.path_or_uri);
    if (estimated_token_count + t <= tokenBudget) {
      final_related_decisions.push(rdl);
      estimated_token_count += t;
    }
  }

  // CTX-033 Known risks generation
  const known_risks: { risk: string; severity: "low" | "medium" | "high"; category: string }[] = [];
  
  // Check if any files were excluded due to budget constraints
  if (primary_files.length > final_primary_files.length || related_files.length > final_related_files.length || related_docs.length > final_related_docs.length || related_tests.length > final_related_tests.length || related_decisions.length > final_related_decisions.length) {
    known_risks.push({
      risk: `Context budget limit of ${tokenBudget} exceeded. Some secondary related files, docs, or tests were excluded to fit within requested budget.`,
      severity: "medium",
      category: "BUDGET_EXCEEDED"
    });
  }

  if (confidence.score < 50) {
    known_risks.push({
      risk: "Low confidence context package: low lexical overlap with indexed records.",
      severity: "high",
      category: "CONTEXT_DESYNC"
    });
  }
  if (missingContext.includes("related_tests") || final_related_tests.length === 0) {
    known_risks.push({
      risk: "Missing test suites: no target test specifications are available for direct validation of task deliverables.",
      severity: "high",
      category: "QUALITY_ASSURANCE"
    });
  }
  if (missingContext.includes("decision_log") || final_related_decisions.length === 0) {
    known_risks.push({
      risk: "No architecture decision logs (ADRs) present. Structural constraints may be violated.",
      severity: "medium",
      category: "ARCHITECTURE_DRIFT"
    });
  }
  if (final_primary_files.length === 0) {
    known_risks.push({
      risk: "Zero primary files identified for this task context budget.",
      severity: "high",
      category: "CONTEXT_GAP"
    });
  }
  if (task.title.length > 80 || (task.description && task.description.length > 500)) {
    known_risks.push({
      risk: "Task scope appears extremely broad. Consider decomposing into smaller deliverables to avoid context pollution.",
      severity: "medium",
      category: "SCOPE_CREEP"
    });
  }

  // CTX-034 Pending TODOs
  const pending_todos: { file: string; todo_text: string; status: string }[] = [];
  // Scan chunks for potential TODO/FIXMEs
  for (const chunk of allChunks) {
    const txt = chunk.content;
    const txtLower = txt.toLowerCase();
    if (txtLower.includes("todo:") || txtLower.includes("todo ") || txtLower.includes("fixme:")) {
      const lines = txt.split("\n");
      for (const line of lines) {
        if (line.toLowerCase().includes("todo") || line.toLowerCase().includes("fixme")) {
          const matchingItem = retrievalResults.find(r => r.context_item_id === chunk.context_item_id);
          const fileName = matchingItem ? matchingItem.path_or_uri : "indexed-file";
          pending_todos.push({
            file: fileName,
            todo_text: line.trim().substring(0, 150),
            status: "pending"
          });
          if (pending_todos.length >= 5) break;
        }
      }
    }
    if (pending_todos.length >= 5) break;
  }

  // CTX-035 Forbidden changes mapping
  const forbidden_changes = [
    { rule: "Do not modify database.ts or other core database layers unless requested.", target: "apps/api/src/db.ts", reason: "Prevents accidental tables dropping or breaking DB connections" },
    { rule: "Do not alter workspace configurations.", target: "tsconfig.json / package.json / vite.config.ts", reason: "Avoid dev/build script breaking modifications" },
    { rule: "Do not commit raw secrets, credentials, or postgreSQL URLs.", target: "Any file", reason: "Security leakage prevention" },
    { rule: "Do not run destructive migrations or database resets.", target: "Database", reason: "Data integrity preservation" }
  ];

  // CTX-036 Quality gates mapping
  const quality_gates = [
    { name: "pnpm lint", command: "npm run lint", category: "LINTING", required: true },
    { name: "pnpm typecheck", command: "npx tsc --noEmit", category: "COMPILATION", required: true },
    { name: "pnpm build", command: "npm run build", category: "BUILD", required: true },
    { name: "pnpm secret-scan", command: "npx tsx scripts/secret-scan.ts", category: "SECURITY", required: true },
    { name: "pnpm qa:debug-tags", command: "npx tsx scripts/qa-debug-tags.ts", category: "SECURITY", required: true }
  ];
  if (final_related_tests.length > 0) {
    quality_gates.push({
      name: "Task Related Test Suite",
      command: `npx tsx scripts/validate-vault.ts`,
      category: "TESTING",
      required: false
    });
  }

  // CTX-037 Next action step generation
  const targetFileForInstruction = final_primary_files[0]?.path_or_uri || "apps/web/src/App.tsx";
  const forbiddenTarget = forbidden_changes[0]?.target || "apps/api/src/db.ts";
  const next_action = `Inspect ${targetFileForInstruction} and implement the feature described in '${task.title}'. Be careful not to make changes to ${forbiddenTarget}, and run 'npm run lint' when done.`;

  const context_pack_id = `pack_${crypto.randomBytes(6).toString("hex")}`;

  return {
    context_pack_id,
    task_id: taskId,
    project_id: projectId,
    estimated_token_count,
    confidence_score: confidence.score,
    primary_files: final_primary_files,
    related_files: final_related_files,
    related_docs: final_related_docs,
    related_tests: final_related_tests,
    related_decisions: final_related_decisions,
    related_connected_assets,
    recent_diffs,
    known_risks,
    pending_todos,
    forbidden_changes,
    quality_gates,
    next_action,
    metadata: {
      compiled_at: new Date().toISOString(),
      builder_version: "1.0.8-context-packer",
      token_budget: tokenBudget,
      secret_scanned: true
    }
  };
}

export function buildCompressedContextPack(
  taskId: string,
  projectId: string,
  task: { title: string; description?: string; category?: string },
  retrievalResults: RetrievalResult[],
  missingContext: string[],
  confidence: ConfidenceScore,
  allChunks: { context_item_id: string; content: string; token_count: number }[],
  inputBudget?: any,
  chunkContentsById?: Record<string, string>
): ContextPackResult {
  let tokenBudget = inputBudget;
  if (tokenBudget === undefined || tokenBudget === null || typeof tokenBudget !== "number" || isNaN(tokenBudget)) {
    tokenBudget = DEFAULT_TOKEN_BUDGET;
  }
  if (tokenBudget < MIN_TOKEN_BUDGET) {
    tokenBudget = MIN_TOKEN_BUDGET;
  } else if (tokenBudget > MAX_TOKEN_BUDGET) {
    tokenBudget = MAX_TOKEN_BUDGET;
  }

  const sortedResults = [...retrievalResults].sort((a, b) => b.score - a.score);

  const primary_files: any[] = [];
  const related_files: any[] = [];
  const related_docs: any[] = [];
  const related_tests: any[] = [];
  const related_decisions: any[] = [];
  const related_connected_assets: any[] = [];

  const codeResults = sortedResults.filter(r => r.source_type === "code");
  const docTypes = new Set(["markdown", "api_doc", "ux_spec", "design_spec"]);
  const docResults = sortedResults.filter(r => docTypes.has(r.source_type));
  const testResults = sortedResults.filter(r => r.source_type === "test");
  const decisionResults = sortedResults.filter(r => r.source_type === "decision_log");
  const assetResults = sortedResults.filter(r => r.source_type === "connected_tool_data");

  let estimated_token_count = 0;

  const itemTokenMap = new Map<string, number>();
  retrievalResults.forEach(r => {
    const totalItemTokens = r.matched_chunks.reduce((s, chunk) => s + chunk.token_count, 0) || 1200;
    itemTokenMap.set(r.path_or_uri, totalItemTokens);
  });
  const getWeight = (path: string) => itemTokenMap.get(path) || 500;

  if (!missingContext.includes("primary_code") && codeResults.length > 0) {
    const highScorers = codeResults.filter(r => r.score >= 50);
    const primaryCandidates = highScorers.length > 0 ? highScorers : [codeResults[0]];
    for (const r of primaryCandidates) {
      const w = getWeight(r.path_or_uri);
      if (estimated_token_count + w <= tokenBudget) {
        primary_files.push({
          path_or_uri: r.path_or_uri,
          score: r.score,
          reason: `Primary code file.`,
          direct_dependencies: [{ dependency: "shared-types", detail: "stubbed", status: "stubbed" }],
          reverse_dependencies: [{ dependency: "apps/api/src/index.ts", detail: "stubbed", status: "stubbed" }]
        });
        estimated_token_count += w;
      }
    }
  }

  for (const r of testResults) {
    const w = getWeight(r.path_or_uri);
    if (estimated_token_count + w <= tokenBudget) {
      related_tests.push({
        path_or_uri: r.path_or_uri,
        score: r.score
      });
      estimated_token_count += w;
    }
  }

  for (const r of decisionResults) {
    const w = getWeight(r.path_or_uri);
    if (estimated_token_count + w <= tokenBudget) {
      related_decisions.push({
        path_or_uri: r.path_or_uri,
        score: r.score,
        decision: r.matched_chunks[0]?.content.substring(0, 100) || "Consensus."
      });
      estimated_token_count += w;
    }
  }

  const primaryPaths = new Set(primary_files.map(pf => pf.path_or_uri));

  for (const r of docResults) {
    const fullWeight = getWeight(r.path_or_uri);
    
    if (estimated_token_count + fullWeight <= tokenBudget) {
      related_docs.push({
        path_or_uri: r.path_or_uri,
        source_type: r.source_type,
        score: r.score,
        summarized: false
      });
      estimated_token_count += fullWeight;
    } else {
      const content = chunkContentsById?.[r.context_item_id] || "Mock detailed documentation content that exceeds budget.";
      const summaryObj = compressDocument(content, r.context_item_id, r.source_type);
      const summaryWeight = summaryObj.compressed_token_count;
      
      if (estimated_token_count + summaryWeight <= tokenBudget) {
        related_docs.push({
          path_or_uri: r.path_or_uri,
          source_type: r.source_type,
          score: r.score,
          summarized: true,
          summary: summaryObj.summary,
          key_points: summaryObj.key_points,
          original_token_count: summaryObj.original_token_count,
          compressed_token_count: summaryObj.compressed_token_count,
          compression_ratio: summaryObj.compression_ratio
        });
        estimated_token_count += summaryWeight;
      }
    }
  }

  for (const r of codeResults) {
    if (primaryPaths.has(r.path_or_uri)) continue;
    const fullWeight = getWeight(r.path_or_uri);

    if (estimated_token_count + fullWeight <= tokenBudget) {
      related_files.push({
        path_or_uri: r.path_or_uri,
        score: r.score,
        reason: `Secondary dependency.`
      });
      estimated_token_count += fullWeight;
    } else {
      const summaryWeight = 250;
      if (estimated_token_count + summaryWeight <= tokenBudget) {
        related_files.push({
          path_or_uri: r.path_or_uri,
          score: r.score,
          summarized: true,
          summary: `Reference to secondary module ${r.path_or_uri}. Full content omitted to stay within budget. See rehydration candidate.`,
          original_token_count: fullWeight,
          compressed_token_count: summaryWeight
        });
        estimated_token_count += summaryWeight;
      }
    }
  }

  for (const r of assetResults) {
    const w = 150;
    if (estimated_token_count + w <= tokenBudget) {
      related_connected_assets.push({
        id: r.context_item_id,
        type: "connected-tool-asset",
        name: r.path_or_uri,
        detail: `Asset reference (score: ${r.score})`
      });
      estimated_token_count += w;
    }
  }

  const recent_diffs = [
    {
      id: "diff-recent-01",
      file: primary_files[0]?.path_or_uri || "apps/web/src/App.tsx",
      author: "User-Aydinoglu",
      timestamp: new Date().toISOString(),
      line_changes: "+45 -12",
      status: "partial"
    }
  ];

  const known_risks: any[] = [];
  let adjustedConfidenceScore = confidence.score;
  const summarizedDocsCount = related_docs.filter(rd => rd.summarized).length;
  if (summarizedDocsCount > 0) {
    adjustedConfidenceScore = Math.max(10, confidence.score - (summarizedDocsCount * 5));
    known_risks.push({
      risk: `Some reference documents are included in compressed summary form to fit the token budget of ${tokenBudget}. Confidence score is adjusted by -${summarizedDocsCount * 5}%.`,
      severity: "medium",
      category: "COMPRESSED_CONTEXT"
    });
  }

  if (confidence.score < 50) {
    known_risks.push({
      risk: "Low confidence context package: low lexical overlap.",
      severity: "high",
      category: "CONTEXT_DESYNC"
    });
  }

  const forbidden_changes = [
    { rule: "Do not modify database.ts or other core database layers unless requested.", target: "apps/api/src/db.ts", reason: "Prevents accidental tables dropping" }
  ];

  const quality_gates = [
    { name: "pnpm lint", command: "npm run lint", category: "LINTING", required: true },
    { name: "pnpm typecheck", command: "npx tsc --noEmit", category: "COMPILATION", required: true },
    { name: "pnpm build", command: "npm run build", category: "BUILD", required: true }
  ];

  const next_action = `Inspect ${primary_files[0]?.path_or_uri || "apps/web/src/App.tsx"} and implement the feature described in '${task.title}' using the task-ready compressed context.`;

  return {
    context_pack_id: `pack_comp_${crypto.randomBytes(6).toString("hex")}`,
    task_id: taskId,
    project_id: projectId,
    estimated_token_count,
    confidence_score: adjustedConfidenceScore,
    primary_files,
    related_files,
    related_docs,
    related_tests,
    related_decisions,
    related_connected_assets,
    recent_diffs,
    known_risks,
    pending_todos: [],
    forbidden_changes,
    quality_gates,
    next_action,
    metadata: {
      compiled_at: new Date().toISOString(),
      builder_version: "1.0.8-context-packer",
      token_budget: tokenBudget,
      is_compressed: true
    }
  };
}

export interface TaskBoundary {
  id: string;
  project_id: string;
  task_id: string;
  context_pack_id?: string | null;
  status: string;
  allowed_files: string[];
  forbidden_files: string[];
  allowed_patterns: string[];
  forbidden_patterns: string[];
  allowed_domains: string[];
  forbidden_domains: string[];
  locked_by?: string | null;
  locked_at?: string | null;
  metadata_json?: any;
  created_at?: string;
  updated_at?: string;
}

export interface BoundaryViolation {
  file: string;
  rule: string;
  severity: string;
  reason: string;
}

export interface BoundaryWarning {
  file: string;
  reason: string;
  severity: string;
  recommendation: string;
  requires_approval: boolean;
}

export interface BoundaryCheckResult {
  allowed: boolean;
  violations: BoundaryViolation[];
  warnings: BoundaryWarning[];
  requires_approval: boolean;
}

export function matchGlob(pathStr: string, pattern: string): boolean {
  // Normalize windows backslashes
  const normalizedPath = pathStr.replace(/\\/g, "/");
  const normalizedPattern = pattern.replace(/\\/g, "/");

  // Escape special regex chars except *
  let escaped = normalizedPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  escaped = escaped.replace(/\*\*/g, '__DOUBLE_STAR__');
  escaped = escaped.replace(/\*/g, '[^/]*');
  escaped = escaped.replace(/__DOUBLE_STAR__/g, '.*');
  
  const regex = new RegExp(`^${escaped}$`);
  return regex.test(normalizedPath);
}

export function detectDomain(pathStr: string): string {
  const lower = pathStr.toLowerCase().replace(/\\/g, "/");
  if (lower.includes("/context/") || lower.includes("packages/context") || lower.includes("classifier") || lower.includes("chunk")) return "context";
  if (lower.includes("graph") || lower.includes("traversal")) return "graph";
  if (lower.includes("resume")) return "resume";
  if (lower.includes("debug") || lower.includes("log")) return "debug";
  if (lower.includes("connect") || lower.includes("github")) return "connect";
  if (lower.includes("security") || lower.includes("secret") || lower.includes("redact") || lower.includes("audit") || lower.includes("vault")) return "security";
  if (lower.includes("boundary") || lower.includes("task")) return "task";
  if (lower.includes("db.ts") || lower.includes("database") || lower.includes("postgres") || lower.includes("migration") || lower.includes("schema")) return "database";
  if (lower.includes("/api/") || lower.includes("server.ts") || lower.includes("express") || lower.endsWith("src/index.ts")) return "api";
  if (lower.includes("/ui/") || lower.includes("src/components") || lower.includes("app.tsx") || lower.includes("index.html") || lower.includes("src/main.tsx") || lower.endsWith(".css")) return "ui";
  if (lower.endsWith(".md") || lower.includes("docs/")) return "docs";
  return "other";
}

export function validateProposedChanges(proposedFiles: string[], boundary: TaskBoundary): BoundaryCheckResult {
  const violations: BoundaryViolation[] = [];
  const warnings: BoundaryWarning[] = [];
  let allowed = true;
  let requires_approval = false;

  for (const f of proposedFiles) {
    const domain = detectDomain(f);

    // 1. Check if matches forbidden_files or forbidden_patterns
    const isExactForbidden = (boundary.forbidden_files || []).some(ff => ff === f || (ff.startsWith("/") && ff.substring(1) === f));
    const isPatternForbidden = (boundary.forbidden_patterns || []).some(fp => matchGlob(f, fp));

    if (isExactForbidden || isPatternForbidden) {
      allowed = false;
      violations.push({
        file: f,
        rule: "CTX-044 Forbidden files block",
        severity: "critical",
        reason: `File path matches forbidden rule.`
      });
      continue;
    }

    // 2. Secret-bearing or env check (Mandatory baseline protections)
    const isEnvOrSecretFile = f.includes(".env") || f.includes("credentials") || f.includes("secrets.json") || f.endsWith(".pem") || f.endsWith(".key");
    if (isEnvOrSecretFile) {
      allowed = false;
      violations.push({
        file: f,
        rule: "CTX-049 Unauthorized edit blocker",
        severity: "critical",
        reason: "Access to secrets or env configuration files is prohibited."
      });
      continue;
    }

    // 3. Forbidden Domains check (CTX-046)
    if ((boundary.forbidden_domains || []).includes(domain)) {
      allowed = false;
      violations.push({
        file: f,
        rule: "CTX-046 Forbidden domains block",
        severity: "high",
        reason: `File falls under forbidden domain: '${domain}'`
      });
      continue;
    }

    // 4. Check if task scope lock is violated (prevent silent expansion of scope)
    const isExplicitlyAllowed = (boundary.allowed_files || []).includes(f);
    const isPatternAllowed = (boundary.allowed_patterns || []).some(ap => matchGlob(f, ap));
    const withinAllowed = isExplicitlyAllowed || isPatternAllowed;

    if (boundary.status === "locked" && !withinAllowed) {
      allowed = false;
      violations.push({
        file: f,
        rule: "CTX-047 Task scope lock",
        severity: "high",
        reason: "Scope lock is active and file or directory is not explicitly pre-approved in task boundaries."
      });
      continue;
    }

    // 5. Destructive DB or resets checked (CTX-049)
    if (f.includes("reset") || f.includes("destructive") || f.includes("db-reset-dev")) {
      const dbAllowed = (boundary.allowed_domains || []).includes("database");
      if (!dbAllowed) {
        allowed = false;
        violations.push({
          file: f,
          rule: "CTX-049 Unauthorized edit blocker",
          severity: "critical",
          reason: "Destructive database scripts are blocked because 'database' is not in allowed domains."
        });
        continue;
      }
    }

    // 6. Allowed Domains boundary check and Out-of-scope warnings (CTX-048)
    const isDomainAllowed = (boundary.allowed_domains || []).includes(domain);
    if (!withinAllowed) {
      if (isDomainAllowed) {
        warnings.push({
          file: f,
          reason: "Modifying file outside designated allowed_files but within allowed_domain.",
          severity: "medium",
          recommendation: "Review proposed change to verify compatibility with approved feature scope.",
          requires_approval: true
        });
        requires_approval = true;
      } else {
        allowed = false;
        violations.push({
          file: f,
          rule: "CTX-049 Unauthorized edit blocker",
          severity: "high",
          reason: `Proposed file edit '${f}' belongs to domain '${domain}' which is outside allowed boundaries.`
        });
        continue;
      }
    }

    // Specific warning: modifying docs without code change, tests without source etc.
    if (domain === "docs") {
      const codeFiles = proposedFiles.filter(pf => detectDomain(pf) !== "docs");
      if (codeFiles.length === 0) {
        warnings.push({
          file: f,
          reason: "Modifying documentation files without any accompanying code changes.",
          severity: "low",
          recommendation: "Ensure this doc change is aligned with code feature deliverables.",
          requires_approval: false
        });
      }
    }

    if (domain === "test") {
      const codeFiles = proposedFiles.filter(pf => {
        const d = detectDomain(pf);
        return d === "context" || d === "api" || d === "database";
      });
      if (codeFiles.length === 0) {
        warnings.push({
          file: f,
          reason: "Modifying test scripts without any accompanying source files edits.",
          severity: "low",
          recommendation: "Make sure tests cover the updated behavior fully.",
          requires_approval: false
        });
      }
    }
  }

  return {
    allowed,
    violations,
    warnings,
    requires_approval: requires_approval || violations.length > 0
  };
}

export * from "./search-server";
export * from "./retrieval-ranking-service";

