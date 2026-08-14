/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from "crypto";
import { ContextSourceType } from "@y/shared";
import { redactSecretLeaks } from "@y/security";

// P08 / ADR-031: sabit butce politikasi ve ona bagli sikistirma
// tahmincisi SILINDI. 50.000 uc ayri yerde hard-code'du ve dorduncu bir
// yerde 4.000 ile CELISIYORDU. Butce artik adapter limitinden hesaplanir
// ve policy tavaniyla sinirlanir: packages/context/src/budget/engine.ts

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
 * LEGACY doküman chunking'i (`context_items` → `context_chunks`).
 *
 * @deprecated Kanonik chunking `@y/core`'daki `chunkBySymbols`'dur:
 * chunk sınırı = symbol sınırı (ADR-020) ve sonuç `chunks` tablosuna
 * `symbol_id` FK'siyle yazılır. Bu fonksiyon yalnızca legacy context vault
 * yolunu (yüklenen dokümanlar) ayakta tutar ve P06 retrieval cutover'ında
 * kaldırılacaktır.
 *
 * P00 BULGUSU VE BURADA DÜZELTİLEN KISIM
 *   Eski hali sabit genişlikte KARAKTER dilimi alıyordu:
 *
 *       for (let i = 0; i < content.length; i += charsPerChunk)
 *         content.slice(i, i + charsPerChunk)
 *
 *   Bu, satırın — çoğu zaman kelimenin — tam ortasından kesiyordu. Bir
 *   fragment'ın ne olduğu söylenemez hale geliyor, retrieval yarım
 *   ifadeler döndürüyordu.
 *
 *   Yeni hali SATIR SINIRINDA keser. Sözleşme korunur: parçaların
 *   birleşimi kaynağın birebir aynısıdır (örtüşme yok, boşluk yok) —
 *   legacy doğrulama bunu zaten kontrol ediyordu ve kontrol geçerli kalır.
 *
 * NEDEN sembol tabanlı chunker buraya BAĞLANMADI
 *   Sembol tabanlı chunker bir parse sonucu ister; `context_items` ise
 *   repo dosyası değil, yüklenmiş dokümandır (PDF metni, wiki sayfası).
 *   Sembolü yoktur. Ayrıca o chunker taşan sembolleri örtüşmeyle böler;
 *   örtüşme, bu fonksiyonun birebir yeniden birleşme sözleşmesini bozardı.
 */
export function chunkContent(
  content: string,
  maxTokensPerChunk = 1000
): ChunkResult[] {
  if (!content) return [];

  const charsPerToken = 4;
  const charsPerChunk = maxTokensPerChunk * charsPerToken;

  const chunks: ChunkResult[] = [];
  const push = (text: string): void => {
    chunks.push({
      chunkIndex: chunks.length,
      content: text,
      tokenCount: Math.ceil(text.length / charsPerToken),
      checksum: crypto.createHash("sha256").update(text).digest("hex")
    });
  };

  // Satır sonlarını KORUYARAK böl; birleşim kaynağa birebir eşit kalmalı.
  const lines = content.split(/(?<=\n)/);
  let buffer = "";

  for (const line of lines) {
    // Tek başına bütçeden büyük satır: bölünmek zorunda. Minified bir
    // dosyanın tamamı tek satır olabilir ve sınırsız chunk üretilemez.
    if (line.length > charsPerChunk) {
      if (buffer.length > 0) {
        push(buffer);
        buffer = "";
      }
      for (let i = 0; i < line.length; i += charsPerChunk) {
        push(line.slice(i, i + charsPerChunk));
      }
      continue;
    }

    if (buffer.length + line.length > charsPerChunk && buffer.length > 0) {
      push(buffer);
      buffer = "";
    }
    buffer += line;
  }

  if (buffer.length > 0) push(buffer);

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

// P06 / Y-P06-012 — Sahte semantic arama fonksiyonu SILINDI.
//
// Eski hali (P00 Truth Audit'in en somut bulgusu) soyle isliyordu:
//
//     let score = computeLexicalOverlap(query, textToMatch);
//     score += (keywordHits / queryWords.length) * 0.4;
//     return { semantic_similarity: similarity, is_fallback_approx: true, ... };
//
// Fonksiyon `search-server.ts:98` ve `:290`'dan cagriliyor, sonucu 30 ile
// carpilip `semantic_score` adiyla sunuluyordu. Yaptigi is keyword
// ortusmesiydi: ne vektor vardi, ne gomme, ne kosinus.
//
// Adi bu yorumda BILEREK gecmiyor: `p06-no-fake-retrieval.test.ts` kaynak
// agacinda o ismi ariyor ve bir yorum satirinda gecmesi testi anlamsiz
// kilardi (P03'te ayni tuzaga bir kez dusuldu).
//
// `is_fallback_approx: true` bayragi ilginctir — durustluk niyeti KODDA
// duruyordu ama bayrak hicbir yerde okunmuyordu. Cikti tarafinda
// yaklasiklik gorunmuyordu. Bir uyarinin okunmadigi yerde durmasi,
// uyarinin hic olmamasindan farksizdir.
//
// KANONIK KARSILIGI
//   packages/context/src/retrieval/semantic.ts — pgvector uzerinde
//   gercek kosinus benzerligi. Embedding saglayicisi yoksa kanal DEVRE
//   DISI kalir ve retrieval `degraded` isaretlenir; keyword ortusmesi
//   "semantic" diye sunulmaz.

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
 * P08 / Y-P08-009 — Legacy context pack üreticileri SİLİNDİ.
 *
 * Kaldırılan iki fonksiyon (`buildContextPack` ve sıkıştırılmış varyantı)
 * bir "agent-ready context pack" üretip `context_packs` tablosuna KALICI
 * olarak yazıyordu. P00 Truth Audit'in tespiti: pack'in birçok alanı
 * ÜRETİLMİŞ DEĞİL, UYDURULMUŞTU.
 *
 *   - Bağımlılık listeleri sabit birer stub nesnesiydi; gerçek import
 *     grafiğine hiç bakılmıyordu.
 *   - "Son değişiklikler" alanı sabit bir yazar adı, sabit bir satır
 *     sayısı ve sabit bir kimlik taşıyordu. Git'e HİÇ bakılmıyordu.
 *   - `secret_scanned` alanı koşulsuz `true` yazılıyordu — tarama
 *     çalışmasa bile.
 *   - Chunk metni bulunamadığında yerine temsili bir cümle konuyordu.
 *
 * Bu alanların hiçbiri "eksik" olarak işaretlenmiyordu; okuyanın onları
 * gerçek verilerden ayırt etmesinin bir yolu yoktu. Ve bu veri
 * veritabanına yazıldığı için, sahte içerik kalıcı hale geliyordu.
 *
 * KANONİK KARŞILIĞI
 *   packages/context/src/compiler/compile.ts — saf fonksiyon (ADR-033),
 *   hesaplanamayan alan için `null` + `unavailableReason` (ADR-032),
 *   bütçe adapter limitinden hesaplanır (ADR-031).
 *
 * Uydurma değerlerin geri gelmediği `p08-no-fabricated-fields.test.ts`
 * ile denetlenir.
 */

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

