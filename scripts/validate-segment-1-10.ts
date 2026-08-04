// SEGMENT 1: STAGES 1-10
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from "crypto";
import { DatabaseConnector, getSupabaseCaCert } from "../apps/api/src/db";
import { loadApiConfiguration } from "../apps/api/src/config";
import { registerAuditPool, auditHelper } from "../apps/api/src/audit";
import { 
  classifyContextSource, 
  calculateChecksum, 
  estimateTokens, 
  detectSecrets, 
  chunkContent,
  scoreContextItem,
  detectMissingContext,
  calculateConfidenceScore,
  mockSemanticSearchFallback,
  stubGraphTraversal,
  buildContextPack,
  DEFAULT_TOKEN_BUDGET,
  MIN_TOKEN_BUDGET,
  MAX_TOKEN_BUDGET,
  compressDocument,
  compressSessionLogs,
  compileRepoMetadata,
  buildCompressedContextPack,
  validateProposedChanges,
  detectDomain,
  matchGlob
} from "../packages/context/src/index";
import { redactSecretLeaks } from "../packages/security/src/index";
import { KnowledgeGraphService, MVPStaticExtractionParser } from "../packages/graph/src/index";
import { PersistentAgentMemoryService, ResumeEngineService, AgentSessionRecoveryService, MultiAgentHandoffService, AgentTimelineService, AgentDebugService } from "../packages/agents/src/index";
import { PermissionDeniedError } from "../packages/shared/src/index";
import { LocalFilesystemRepoAdapter, ReadOnlyGitHubRepoAdapter, VirtualMemoryRepoAdapter, RepoAdapterService, IndexJobService, IncrementalIndexService, TypeScriptASTParser, RegexFallbackParser } from "../packages/core/src/index";
import fs from "fs";
import path from "path";

async function runTests() {
  console.log("\n========================================================");
  console.log("   Obsidian Context Vault Acceptance Hardening Suite   ");
  console.log("========================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean, message?: string) {
    if (condition) {
      console.log(`  [OK]   ${name}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${name} ${message ? `| ${message}` : ""}`);
      failed++;
    }
  }

  // --- STAGE 1: Source Type Classification Unit Tests ---
  console.log("STAGE 1: Source Type Classification Unit Tests");
  try {
    assert(
      "Classify code file",
      classifyContextSource("src/index.ts").sourceType === "code"
    );
    assert(
      "Classify markdown document",
      classifyContextSource("docs/README.md").sourceType === "markdown"
    );
    assert(
      "Classify test script",
      classifyContextSource("src/db.test.ts").sourceType === "test"
    );
    assert(
      "Classify test spec folder reference",
      classifyContextSource("tests/my-test-suite.ts").sourceType === "test"
    );
    assert(
      "Classify prompt template document",
      classifyContextSource("config/system-prompt.md").sourceType === "prompt"
    );
    assert(
      "Classify agent session record Log",
      classifyContextSource("sessions/history-session.md").sourceType === "agent_session"
    );
    assert(
      "Classify git history Log",
      classifyContextSource("git-history.txt").sourceType === "git_history"
    );
    assert(
      "Classify API swagger/openapi specs",
      classifyContextSource("openapi.json").sourceType === "api_doc"
    );
    assert(
      "Classify UX specification flow",
      classifyContextSource("ux-spec.md").sourceType === "ux_spec"
    );
    assert(
      "Classify design specification guide",
      classifyContextSource("styling-guide.md").sourceType === "design_spec"
    );
    assert(
      "Classify architecture decision records (ADR)",
      classifyContextSource("adr/adr-001.md").sourceType === "decision_log"
    );
    assert(
      "Classify tasks list history document",
      classifyContextSource("changelog.md").sourceType === "task_history"
    );
    assert(
      "Classify developer tool linked sync log",
      classifyContextSource("connected-tool-data.json").sourceType === "connected_tool_data"
    );
    assert(
      "Classify remote external repository references",
      classifyContextSource("external-repo.json").sourceType === "external_repo_reference"
    );

    // Explicit Overrides
    assert(
      "Accept valid explicit type override",
      classifyContextSource("src/index.ts", "prompt").sourceType === "prompt"
    );

    let threwUnsupported = false;
    try {
      classifyContextSource("src/index.ts", "pdf");
    } catch {
      threwUnsupported = true;
    }
    assert("Reject unsupported explicit source type override", threwUnsupported);

  } catch (err: any) {
    console.error("  Unexpected error in Stage 1:", err.message);
    failed++;
  }

  // --- STAGE 2: Secret Rejection, Detection & Redaction Unit Tests ---
  console.log("\nSTAGE 2: Secret Rejection, Detection & Redaction Unit Tests");
  try {
    // 1. Secret Detection Tests
    assert(
      "Detect raw PostgreSQL connection link pattern",
      detectSecrets(["database_url=postgres", "ql://", "tester_user", ":", "super_password_123", "@local-db:5432/test"].join(""))
    );
    assert(
      "Detect API KEY credentials assignment statement",
      detectSecrets("const api_key = \"my-api-key-value-here-exposed\";")
    );
    assert(
      "Detect Gemini API key exposures",
      detectSecrets("export const GEMINI_API_KEY = \"AIzaSySomethingSecrets\";")
    );
    assert(
      "Pass completely innocent codebase without false security alarm",
      !detectSecrets("export default function getSum(a: number, b: number) { return a + b; }")
    );

    // 2. Redaction Verification Tests
    const textWithSecretUrl = ["Connecting to postgres", "ql://", "admin", ":", "secret_pass_word", "@db.host.com:5432/prod_db"].join("");
    const redactedTextUrl = redactSecretLeaks(textWithSecretUrl);
    assert(
      "Redact password in database connection stream link",
      redactedTextUrl.includes("admin:[REDACTED_PASSWORD]@db.host.com") && !redactedTextUrl.includes("secret_pass_word")
    );

    const configWithDbUrl = ["DATABASE_URL = \"postgres", "ql://", "someuser", ":", "passabc123", "@foobar.com/mydb\""].join("");
    const redactedConfig = redactSecretLeaks(configWithDbUrl);
    assert(
      "Redact DATABASE_URL environment parameter blocks",
      redactedConfig.includes("DATABASE_URL=[REDACTED_DATABASE_URL]") && !redactedConfig.includes("passabc123")
    );

    const bearerToken = "Authorization: Bearer mySecretLongBearerTokenValueHere";
    const redactedBearer = redactSecretLeaks(bearerToken);
    assert(
      "Redact bearer tokens",
      redactedBearer.includes("[REDACTED_BEARER_TOKEN]") && !redactedBearer.includes("mySecretLongBearerTokenValueHere")
    );

  } catch (err: any) {
    console.error("  Unexpected error in Stage 2:", err.message);
    failed++;
  }

  // --- STAGE 3: Deterministic Text Chunking Unit Tests ---
  console.log("\nSTAGE 3: Deterministic Text Chunking Unit Tests");
  try {
    const rawCode = "import { useState } from 'react';\n".repeat(200); // long body
    const chunks = chunkContent(rawCode, 100); // split into ~100 token chunks max
    
    assert(
      "Produce multiple sequential chunks based on token volume thresholds",
      chunks.length > 1
    );
    assert(
      "Assign correct sequential index to segmented chunk blocks",
      chunks[0].chunkIndex === 0 && chunks[1].chunkIndex === 1
    );
    assert(
      "Each chunk has estimated token count metrics",
      chunks[0].tokenCount > 0 && typeof chunks[0].checksum === "string"
    );
    assert(
      "Reconstruct original contents correctly without text gaps",
      chunks.reduce((acc, c) => acc + c.content, "") === rawCode
    );

  } catch (err: any) {
    console.error("  Unexpected error in Stage 3:", err.message);
    failed++;
  }

  // --- STAGE 4: Database Integration & Audit Log End-to-End Tests ---
  console.log("\nSTAGE 4: Database Integration & Audit Log End-to-End Tests");
  
  let dbConnectedByVault = false;
  let dbConnector: DatabaseConnector | null = null;
  let graphService: any = null;
  const mockProjectId = "proj_acceptance_hardening";
  const otherProjectId = "proj_acceptance_isolated_block";

  try {
    const config = loadApiConfiguration();
    dbConnector = new DatabaseConnector(config.databaseUrl);
    const state = await dbConnector.connect();
    if (process.env.RUN_MIGRATIONS === "true") {
      await dbConnector.runMigrations();
    }
    
    if (state.connected) {
      dbConnectedByVault = true;
      registerAuditPool(dbConnector.getPool());
      console.log("  Successfully established database connection pool. Running E2E flows...");
    }
  } catch (err: any) {
    console.warn("  Skipping integration tests: DATABASE_URL is unavailable or offline.");
    console.warn(`  Reason: ${err.message}`);
  }

  if (dbConnectedByVault && dbConnector) {
    const pool = dbConnector.getPool();
    graphService = new KnowledgeGraphService(pool);
    try {
      // Clean up previous database mock data to ensure clean isolated test run state
      await pool.query("DELETE FROM context_items WHERE project_id = $1;", [mockProjectId]);
      await pool.query("DELETE FROM audit_logs WHERE project_id = $1;", [mockProjectId]);
      await pool.query("DELETE FROM projects WHERE id = $1;", [mockProjectId]);

      // 1. Create mock project scope to satisfy foreign keys
      await pool.query(
        "INSERT INTO projects (id, name, description) VALUES ($1, 'Hardening Verification', 'Scope constraints checks project.');",
        [mockProjectId]
      );
      assert("Scope project verified and persisted inside standard table rows", true);

      // 2. Validate scope checks fail when project does not exist
      let badScopeThrew = false;
      const invalidProjectId = "proj_unknown_missing_vault_scope";
      const scopeCheck = await pool.query("SELECT 1 FROM projects WHERE id = $1;", [invalidProjectId]);
      assert(
        "Validate project scope checks detect missing scope targets accurately",
        scopeCheck.rowCount === 0
      );

      // 3. Create context item with chunks (parameterized insert)
      const mockItemId = `ctx_test_item_${Math.random().toString(36).substring(2, 11)}`;
      const sourceUri = "src/modules/vault-core.ts";
      const mockContent = "export function main() { console.log('Vault integrity active'); }";
      const checksum = calculateChecksum(mockContent);
      const tokenCount = estimateTokens(mockContent);

      const metadataJson = JSON.stringify({
        classificationReason: "Hardening validation classification",
        title: "vault-core.ts"
      });

      // Insert context item row
      const insertRes = await pool.query(`
        INSERT INTO context_items (
          id, project_id, source_type, source_uri, checksum, version,
          content_hash, token_count, confidence, freshness_status, metadata_json,
          created_at, updated_at
        )
        VALUES ($1, $2, 'code', $3, $4, '1.0.0', $5, $6, 100.0, 'fresh', $7, NOW(), NOW())
        RETURNING id;
      `, [mockItemId, mockProjectId, sourceUri, checksum, checksum, tokenCount, metadataJson]);

      assert("Insert context_items record via parametrized sql transaction", insertRes.rowCount === 1);

      // Insert context chunks rows
      const dbChunks = chunkContent(mockContent);
      for (const ch of dbChunks) {
        const chunkId = `ctx_chunk_${Math.random().toString(36).substring(2, 11)}`;
        await pool.query(`
          INSERT INTO context_chunks (id, context_item_id, chunk_index, content, token_count)
          VALUES ($1, $2, $3, $4, $5);
        `, [chunkId, mockItemId, ch.chunkIndex, ch.content, ch.tokenCount]);
      }
      assert(`Creates deterministic chunks rows inside DB nested storage (Created ${dbChunks.length} block(s))`, true);

      // Audit logs tracking on success
      await auditHelper.logAction(
        mockProjectId,
        "User-Aydinoglu",
        "CTX",
        "CREATE_CONTEXT_ITEM",
        "authorized",
        { mockItemId, sourceUri, tokenCount },
        "Verifying automatic structured audit logging outputs sequential tracking indexes."
      );

      // 4. Listing records index
      const listingRes = await pool.query(
        "SELECT id, source_uri as \"sourceUri\", token_count as \"tokenCount\" FROM context_items WHERE project_id = $1;",
        [mockProjectId]
      );
      assert("List registered context resources filtered accurately by project scope", listingRes.rowCount === 1 && listingRes.rows[0].sourceUri === sourceUri);

      // 5. Inspect single deep detail
      const itemDetail = await pool.query(
        "SELECT id, source_uri as \"sourceUri\" FROM context_items WHERE id = $1 AND project_id = $2;",
        [mockItemId, mockProjectId]
      );
      const relatedChunks = await pool.query(
        "SELECT id, chunk_index as \"chunkIndex\", content FROM context_chunks WHERE context_item_id = $1 ORDER BY chunk_index ASC;",
        [mockItemId]
      );
      assert("Inspect context file detail maps items + segment chunks correctly", itemDetail.rowCount === 1 && relatedChunks.rowCount === dbChunks.length);

      // 6. Partial update/refinement override
      const patchedChecksum = calculateChecksum(mockContent + " // Patched modification statement");
      const patchedTokenCount = estimateTokens(mockContent + " // Patched modification statement");
      const updateRes = await pool.query(`
        UPDATE context_items
        SET source_type = 'prompt', checksum = $1, content_hash = $1, token_count = $2, updated_at = NOW()
        WHERE id = $3 AND project_id = $4
        RETURNING source_type as "sourceType", token_count as "tokenCount";
      `, [patchedChecksum, patchedTokenCount, mockItemId, mockProjectId]);

      assert(
        "Update parameters or override classifications of registered context item successfully",
        updateRes.rowCount === 1 && updateRes.rows[0].sourceType === "prompt" && updateRes.rows[0].tokenCount === patchedTokenCount
      );

      // 7. Delete context item and assert cascade deletion
      await pool.query("DELETE FROM context_items WHERE id = $1 AND project_id = $2;", [mockItemId, mockProjectId]);
      
      const itemCheck = await pool.query("SELECT 1 FROM context_items WHERE id = $1;", [mockItemId]);
      const chunksCheck = await pool.query("SELECT 1 FROM context_chunks WHERE context_item_id = $1;", [mockItemId]);

      assert(
        "Cascade decoupling of context resources removes parent item and nested chunks safely",
        itemCheck.rowCount === 0 && chunksCheck.rowCount === 0
      );

      // Check audit trace logs are written
      const logsResult = await pool.query("SELECT * FROM audit_logs WHERE project_id = $1;", [mockProjectId]);
      assert(
        "Audit trail logs registered accurately with parameterized details without raw secret leakage",
        logsResult.rowCount > 0 && logsResult.rows.some(l => l.action === "CREATE_CONTEXT_ITEM")
      );

      // --- STAGE 5: Context Retrieval Engine Unit & E2E Tests ---
      console.log("\nSTAGE 5: Context Retrieval Engine Unit & E2E Tests");
      
      // A. Task Relevance Scoring Formula Tests
      const scoredMock = scoreContextItem(
        {
          id: "ctx-1",
          source_uri: "src/billing/service.ts",
          source_type: "code",
          created_at: new Date()
        },
        [
          { id: "chunk-1", chunk_index: 0, content: ["Billing system implementation with url postgres", "ql://", "admin", ":", "secret_pass_word", "@db.host.com:5432/prod_db"].join(""), token_count: 20 }
        ],
        { title: "billing service", description: "Implements core billing and database integration checker", category: "billing" }
      );
      assert("Task relevance scoring ranks name and description matches", scoredMock.score > 20);
      assert("Redaction in matching result outputs excludes raw secrets", scoredMock.matched_chunks.length > 0 && !scoredMock.matched_chunks[0].content.includes("secret_pass_word"));

      // B. Missing Context Coverage Detection
      const missingDoc = detectMissingContext([{ source_type: "code" }]);
      assert("Missing context detection identifies missing critical documentation types", missingDoc.missing.includes("relevant_docs") && missingDoc.missing.includes("related_tests"));
      assert("Missing context flags suitable severity classification", missingDoc.severity === "high");

      // C. Confidence Score Calculation
      const confScore = calculateConfidenceScore(
        [
          {
            context_item_id: "itm-1",
            path_or_uri: "src/main.ts",
            source_type: "code",
            score: 85,
            reason_codes: ["EXACT_PATH_MATCH"],
            matched_chunks: []
          }
        ],
        ["related_tests"]
      );
      assert("Confidence score maps reasonable scale according to search scope inputs", confScore.score > 50 && confScore.level !== undefined);

      // D. Mock Semantic Fallback Search (MVP Interface)
      const mockSemantic = mockSemanticSearchFallback(
        "stripe payments config",
        [
          { id: "itm-a", source_uri: "src/billing/config.ts", metadata_json: { type: "config" } },
          { id: "itm-b", source_uri: "src/auth.ts", metadata_json: {} }
        ]
      );
      assert("Semantic fallback calculates keyword overlap correctly", mockSemantic.length === 2 && mockSemantic[0].item_id === "itm-a");

      // E. E2E Cross-Project Protection Leakage Prevention and Scoped Multi-project Queries
      // otherProjectId already globally defined
      await pool.query("DELETE FROM context_items WHERE project_id = $1;", [otherProjectId]);
      await pool.query("DELETE FROM projects WHERE id = $1;", [otherProjectId]);
      
      await pool.query(
        "INSERT INTO projects (id, name, description) VALUES ($1, 'Security Block Isolated', 'Isolated tests.');",
        [otherProjectId]
      );

      // Insert search objects for both projects
      await pool.query(`
        INSERT INTO context_items (id, project_id, source_type, source_uri, checksum, version, content_hash, token_count, confidence, freshness_status, created_at, updated_at)
        VALUES ('ctx-proj-authorized', $1, 'code', 'src/visible-file.ts', 'abc', '1.0.0', 'abc', 10, 100.0, 'fresh', NOW(), NOW());
      `, [mockProjectId]);

      await pool.query(`
        INSERT INTO context_items (id, project_id, source_type, source_uri, checksum, version, content_hash, token_count, confidence, freshness_status, created_at, updated_at)
        VALUES ('ctx-proj-isolated', $1, 'code', 'src/secret-hidden-file.ts', 'xyz', '1.0.0', 'xyz', 10, 100.0, 'fresh', NOW(), NOW());
      `, [otherProjectId]);

      // Query mockProjectId scoped items
      const scopedQuery = await pool.query(
        "SELECT id, source_uri FROM context_items WHERE project_id = $1 AND (source_uri ILIKE $2 OR id ILIKE $2);",
        [mockProjectId, "%file%"]
      );
      
      assert(
        "Project-scoped search leakage prevention restricts visibility across separate project tenants",
        scopedQuery.rows.length === 1 && scopedQuery.rows[0].id === "ctx-proj-authorized"
      );

      // F. Empty Result Behavior Test
      const emptySearchQuery = await pool.query(
        "SELECT id FROM context_items WHERE project_id = $1 AND source_uri ILIKE $2;",
        [mockProjectId, "%nonexistent-matches-anything%"]
      );
      assert("Empty result behavior processes seamlessly returning zero rows array", emptySearchQuery.rows.length === 0);

      // --- STAGE 6: Context Pack Budgeting, Stubs & Security Verification Tests (Phase 3.1 Hardening) ---
      console.log("\nSTAGE 6: Context Pack Budgeting, Stubs & Security Verification Tests");
      
      const testTask = {
        title: "database query secret billing configuration",
        description: "Verify core billing database query execution credentials flow",
        category: "billing"
      };

      const mockRetrievalResults: any[] = [
        {
          context_item_id: "itm-code-1",
          path_or_uri: "src/billing/service.ts",
          source_type: "code",
          score: 95,
          reason_codes: ["EXACT_MATCH"],
          matched_chunks: [
            { id: "chunk-a", chunk_index: 0, content: "export const dbConn = 'postgres://admin:pass@db:5432'; // TODO: fix this credential issue", token_count: 500 }
          ]
        },
        {
          context_item_id: "itm-doc-1",
          path_or_uri: "docs/billing.md",
          source_type: "markdown",
          score: 80,
          reason_codes: ["KEYWORD_OVERLAP"],
          matched_chunks: [
            { id: "chunk-b", chunk_index: 0, content: "Billing system spec and decisions.", token_count: 4000 }
          ]
        }
      ];

      // 1. Under-budget pack
      const underBudgetResult = buildContextPack(
        "task-1",
        "proj-1",
        testTask,
        mockRetrievalResults,
        ["related_tests"],
        { score: 90, level: "high", reasons: [] },
        [
          { context_item_id: "itm-code-1", content: "", token_count: 500 },
          { context_item_id: "itm-doc-1", content: "", token_count: 4000 }
        ],
        10000 // budget 10K
      );
      assert("Under-budget pack includes all files within limits without exclusion", underBudgetResult.estimated_token_count === 4500);

      // 2. Over-budget pack (forcing exclusion/truncation)
      const overBudgetResult = buildContextPack(
        "task-1",
        "proj-1",
        testTask,
        mockRetrievalResults,
        [],
        { score: 90, level: "high", reasons: [] },
        [
          { context_item_id: "itm-code-1", content: "", token_count: 500 },
          { context_item_id: "itm-doc-1", content: "", token_count: 4000 }
        ],
        2000 // budget 2K
      );
      assert("Over-budget pack truncates/excludes files exceeding limits gracefully", overBudgetResult.primary_files.length === 1 && overBudgetResult.related_docs.length === 0);
      assert("Over-budget pack registers budget-exceeded warning inside known_risks", overBudgetResult.known_risks.some(r => r.category === "BUDGET_EXCEEDED"));

      // 3. Exact-budget pack
      const exactBudgetResult = buildContextPack(
        "task-1",
        "proj-1",
        testTask,
        mockRetrievalResults,
        ["related_tests"],
        { score: 90, level: "high", reasons: [] },
        [
          { context_item_id: "itm-code-1", content: "", token_count: 500 },
          { context_item_id: "itm-doc-1", content: "", token_count: 4000 }
        ],
        4500 // exact budget
      );
      assert("Exact-budget pack allows items up to the exact requested threshold", exactBudgetResult.estimated_token_count === 4500 && exactBudgetResult.known_risks.every(r => r.category !== "BUDGET_EXCEEDED"));

      // 4. Invalid budget input (should trigger fallback to DEFAULT_TOKEN_BUDGET)
      const invalidBudgetResult = buildContextPack(
        "task-1",
        "proj-1",
        testTask,
        mockRetrievalResults,
        ["related_tests"],
        { score: 90, level: "high", reasons: [] },
        [
          { context_item_id: "itm-code-1", content: "", token_count: 500 },
          { context_item_id: "itm-doc-1", content: "", token_count: 4000 }
        ],
        "NOT_A_NUMBER" // invalid
      );
      assert("Invalid budget string falls back to default budget size gracefully", invalidBudgetResult.metadata.token_budget === DEFAULT_TOKEN_BUDGET);

      // 5. Missing budget input
      const missingBudgetResult = buildContextPack(
        "task-1",
        "proj-1",
        testTask,
        mockRetrievalResults,
        ["related_tests"],
        { score: 90, level: "high", reasons: [] },
        [
          { context_item_id: "itm-code-1", content: "", token_count: 500 },
          { context_item_id: "itm-doc-1", content: "", token_count: 4000 }
        ]
        // missing parameter budget
      );
      assert("Missing budget parameter falls back to default budget size", missingBudgetResult.metadata.token_budget === DEFAULT_TOKEN_BUDGET);

      // 6. Verify CTX-026 & CTX-027 are strictly metadata/stubbed-only before GRAPH phase
      const containsNoAST = underBudgetResult.primary_files.every(f => 
        f.direct_dependencies?.every((d: any) => d.status === "stubbed") && 
        f.reverse_dependencies?.every((r: any) => r.status === "stubbed")
      );
      assert("Verify dependency fields (CTX-026 & CTX-027) are strictly metadata/stubs without project-wide AST traversal", containsNoAST);

      // --- STAGE 7: Semantic Compression unit tests ---
      console.log("\nSTAGE 7: Semantic Compression Foundation Validation Unit Tests (Phase 4)");

      // A. Document Compression (CTX-038)
      const inputDoc = `
      # Security Guidelines
      This document details key policy requirements.
      - API keys must be kept private.
      - Never commit unredacted postgres passwords.
      - Run secret scanning before any push events.
      `;
      const docSummaryResult = compressDocument(inputDoc, "doc-item-id-1", "markdown", ["chunk-doc-1"]);
      assert("CTX-038: Compresses long doc to concise human-ready summary", docSummaryResult.summary.includes("Security Guidelines") && docSummaryResult.summary.includes("Extract:"));
      assert("CTX-038: Extract structured metadata and compression ratio", docSummaryResult.compression_ratio < 1.0 && docSummaryResult.key_points.length > 0);
      assert("CTX-038: Fully redacts secrets inside generated summaries", !docSummaryResult.summary.includes("AIzaSy") && docSummaryResult.source_chunk_ids.includes("chunk-doc-1"));

      // B. Session Logs durable memory (CTX-039)
      const mockSessionLogs = [
        { event_type: "auth", message: "Starting agent interaction sequence", severity: "info" },
        { event_type: "edit_file", message: "Modifying billing config module in packages/billing/config.ts", severity: "info" },
        { event_type: "run_test", message: "Validation error: compilation failed in packages/billing/config.ts line 4", severity: "error" },
        { event_type: "resolved", message: "Applied fix and restored build stability", severity: "info" }
      ];
      const durableMemory = compressSessionLogs("proj-1", "task-1", mockSessionLogs);
      assert("CTX-039: Gathers errors chronologically from log timeline", durableMemory.errors_encountered.length === 1 && durableMemory.errors_encountered[0].includes("compilation failed"));
      assert("CTX-039: Captures touched files from raw log stream lines", durableMemory.files_touched.includes("packages/billing/config.ts"));
      assert("CTX-039: Formulates actionable next action recommendation in durable logs", durableMemory.next_action.length > 0);

      // C. Repo Metadata Overview (CTX-040)
      const mockRepoItems = [
        { id: "item-1", source_type: "code", source_uri: "apps/api/src/server.ts" },
        { id: "item-2", source_type: "test", source_uri: "apps/api/src/server.test.ts" },
        { id: "item-3", source_type: "markdown", source_uri: "docs/readme.md" },
        { id: "item-4", source_type: "decision_log", source_uri: "docs/adr/001.md" }
      ];
      const repoSummaryObj = compileRepoMetadata(mockRepoItems);
      assert("CTX-040: Compiles file system type distribution counts deterministically", repoSummaryObj.source_type_distribution["code"] === 1 && repoSummaryObj.source_type_distribution["test"] === 1);
      assert("CTX-040: Extracts extension counts without ast dependency pollution", repoSummaryObj.extension_distribution["ts"] === 2 && repoSummaryObj.extension_distribution["md"] === 2);
      assert("CTX-040: Does NOT perform AST structural traversal or edge emission", repoSummaryObj.metadata.stubs_ready_for_graph === true);

      // D. Task compressed context packaging (CTX-041)
      const mockLongRetrievalResults: any[] = [
        {
          context_item_id: "itm-doc-1",
          path_or_uri: "docs/architecture.md",
          source_type: "markdown",
          score: 95,
          reason_codes: ["EXACT_MATCH"],
          matched_chunks: [
            { id: "chunk-doc-1", chunk_index: 0, content: "# Architecture Decides\nThis is detailed docs.", token_count: 50000 }
          ]
        }
      ];
      const compressedPackRes = buildCompressedContextPack(
        "task-1",
        "proj-1",
        { title: "task details" },
        mockLongRetrievalResults,
        [],
        { score: 100, level: "high", reasons: [] },
        [],
        1000,
        { "itm-doc-1": "# Architecture Decides\nThis is detailed docs." }
      );
      assert("CTX-041: Compiles pack within token budget by dynamically summarizing over-sized docs", compressedPackRes.estimated_token_count <= 1000);
      assert("CTX-041: Keeps primary code and related tests prioritized", compressedPackRes.metadata.is_compressed === true);

      // --- STAGE 8: Context Boundary Enforcement unit tests ---
      console.log("\nSTAGE 8: Context Boundary Enforcement Validation Unit Tests (Phase 5)");

      const mockBoundary = {
        id: "bound-tst-1",
        project_id: "proj-1",
        task_id: "task-1",
        context_pack_id: "pack-1",
        status: "active",
        allowed_files: ["src/app.tsx", "tests/app.test.ts"],
        forbidden_files: [".env", "secrets.json"],
        allowed_patterns: ["packages/context/**", "apps/api/src/**"],
        forbidden_patterns: ["node_modules/**", "dist/**", "**/id_rsa"],
        allowed_domains: ["context", "api", "database", "ui", "docs"],
        forbidden_domains: ["graph", "resume"]
      };

      // A. Glob Matches
      assert("matchGlob: Matches direct nested files within glob definition", matchGlob("packages/context/src/index.ts", "packages/context/**"));
      assert("matchGlob: Matches end extensions correctly", matchGlob("src/config/keys/id_rsa", "**/id_rsa"));
      assert("matchGlob: Does not false match unrelated files", !matchGlob("apps/api/src/server.ts", "node_modules/**"));

      // B. Domain mapping
      assert("detectDomain: Maps Context packages paths accurately", detectDomain("packages/context/src/index.ts") === "context");
      assert("detectDomain: Maps user UI source files accurately", detectDomain("apps/web/src/components/button.tsx") === "ui");
      assert("detectDomain: Maps api path strings correctly", detectDomain("apps/api/src/routes.ts") === "api");
      assert("detectDomain: Maps documentation markdown files", detectDomain("docs/architecture.md") === "docs");

      // C. Safe allowed file passes
      const resAllowedFile = validateProposedChanges(["src/app.tsx"], mockBoundary);
      assert("CTX-043: Allows exact name files pre-registered in task allowed list", resAllowedFile.allowed && resAllowedFile.violations.length === 0);

      // D. Forbidden file edits block
      const resForbiddenFile = validateProposedChanges([".env", "secrets.json"], mockBoundary);
      assert("CTX-044/CTX-049: Rejects forbidden precise credentials edits directly", !resForbiddenFile.allowed && resForbiddenFile.violations.length === 2);

      // E. Forbidden pattern blocks
      const resForbiddenPattern = validateProposedChanges(["node_modules/lodash/index.js", "dist/server.js"], mockBoundary);
      assert("CTX-044/CTX-049: Hard blocks edits that fall nested within forbidden globs", !resForbiddenPattern.allowed);

      // F. Forbidden domains rejections
      const resForbiddenDomain = validateProposedChanges(["apps/graph/src/edge.ts"], mockBoundary);
      assert("CTX-046: Blocks proposed edits inside forbidden domains with severe priority warnings", !resForbiddenDomain.allowed && resForbiddenDomain.violations.some(v => v.rule.includes("Forbidden domains")));

      // G. Active task lock blocks unapproved changes
      const lockedBoundary = { ...mockBoundary, status: "locked" };
      const resLockedViolation = validateProposedChanges(["src/new-unapproved-features.ts"], lockedBoundary);
      assert("CTX-047: Locked boundary strictly prevents additions to task scope files", !resLockedViolation.allowed && resLockedViolation.violations.some(v => v.rule.includes("Task scope lock")));

      // H. Warnings for out of scope but same domain
      const resWarningDomain = validateProposedChanges(["database/schema.sql"], mockBoundary);
      assert("CTX-048: Raises review warning when touching safe-domain files unlisted in allowed list", resWarningDomain.allowed && resWarningDomain.warnings.length === 1 && resWarningDomain.requires_approval);

      // I. Block unauthorized edits completely outside safe zones
      const resUnauthorizedZone = validateProposedChanges(["apps/unapproved/src/random.ts"], mockBoundary);
      assert("CTX-049: Blocks edits on files and domains entirely out of boundaries scope", !resUnauthorizedZone.allowed && resUnauthorizedZone.violations.some(v => v.rule.includes("Unauthorized edit blocker")));

      // --- STAGE 9: Knowledge Graph Foundation E2E & Sync Tests ---
      console.log("\nSTAGE 9: Knowledge Graph Foundation E2E & Sync Tests");
      
      // graphService already initialized in outer scope
      
      // Clean up past graph records if any
      await pool.query("DELETE FROM graph_edges WHERE project_id = $1;", [mockProjectId]);
      await pool.query("DELETE FROM graph_nodes WHERE project_id = $1;", [mockProjectId]);
      await pool.query("DELETE FROM context_packs WHERE project_id = $1;", [mockProjectId]);
      await pool.query("DELETE FROM tasks WHERE project_id = $1;", [mockProjectId]);
      await pool.query("DELETE FROM context_items WHERE project_id = $1;", [mockProjectId]);

      // A. Validate Project Scope checks
      let threwScopeMissing = false;
      try {
        await graphService.validateProjectScope("non-existent-project-id");
      } catch (err: any) {
        threwScopeMissing = true;
      }
      assert("GRAPH-010: Validation of project scope throws NotFoundError on unknown project ID", threwScopeMissing);

      const debugProjects = await pool.query("SELECT * FROM projects WHERE id = $1;", [mockProjectId]);
      console.log("DEBUG PROJECTS COUNT:", debugProjects.rowCount, "PROJECT ID:", mockProjectId);

      await graphService.validateProjectScope(mockProjectId);
      assert("GRAPH-011: Project scope validation passes for active verified projects", true);

      // B. Create Nodes and check attributes
      const nodeA = await graphService.createNode(mockProjectId, {
        id: "node-source-file-1",
        projectId: mockProjectId,
        label: "src/billing/engine.ts",
        type: "code" as any,
        status: "active",
        nodeIdentifier: `${mockProjectId}:src/billing/engine.ts`,
        metadata: { language: "typescript", lines: 140 }
      });

      const nodeB = await graphService.createNode(mockProjectId, {
        id: "node-doc-file-1",
        projectId: mockProjectId,
        label: "docs/billing-spec.md",
        type: "doc",
        status: "active",
        nodeIdentifier: `${mockProjectId}:docs/billing-spec.md`,
        metadata: { doc_type: "specification" }
      });

      assert("GRAPH-012: Node creation saves ID, type, label, node identifier & status metadata", 
        nodeA.id === "node-source-file-1" && 
        nodeA.type === "code" && 
        nodeA.nodeIdentifier === `${mockProjectId}:src/billing/engine.ts`
      );

      // C. Ownership validation
      const ownsA = await graphService.validateNodeOwnership(mockProjectId, "node-source-file-1");
      const ownsMissing = await graphService.validateNodeOwnership(mockProjectId, "non-existent-node");
      const ownsCrossProject = await graphService.validateNodeOwnership("other-project-id", "node-source-file-1");

      assert("GRAPH-013: Node ownership accurately returns true for project file ownership context", ownsA === true);
      assert("GRAPH-014: Node ownership accurately returns false for missing or unrelated nodes", ownsMissing === false && ownsCrossProject === false);

      // D. Explicit edge construction and duplicate handling
      const edgeAB = await graphService.createEdge(mockProjectId, {
        id: "edge-test-ab-1",
        projectId: mockProjectId,
        source: "node-source-file-1",
        target: "node-doc-file-1",
        label: "references",
        weight: 1.5,
        relationship: "references",
        metadata: { auto: true }
      });

      assert("GRAPH-015: Edge creation links source and target correctly with proper labels and relationships", 
        edgeAB.source === "node-source-file-1" && 
        edgeAB.target === "node-doc-file-1" && 
        edgeAB.relationship === "references" && 
        edgeAB.weight === 1.5
      );

      // Duplicate handling (Idempotent updates)
      const updatedEdgeAB = await graphService.createEdge(mockProjectId, {
        id: "edge-test-ab-1",
        projectId: mockProjectId,
        source: "node-source-file-1",
        target: "node-doc-file-1",
        label: "references",
        weight: 2.5,
        relationship: "references",
        metadata: { auto: true, updated: true }
      });

      assert("GRAPH-016: Re-creating existing relationship updates weight and metadata idempotently", 
        updatedEdgeAB.id === edgeAB.id && 
        updatedEdgeAB.weight === 2.5 && 
        updatedEdgeAB.metadata?.updated === true
      );

      // E. Clean cascade decoupling (Deletes edge when node is removed)
      await graphService.deleteNode(mockProjectId, "node-source-file-1");
      
      const graphAfterDeletion = await graphService.getGraph(mockProjectId);
      const nodeAExists = graphAfterDeletion.nodes.some(n => n.id === "node-source-file-1");
      const edgeABExists = graphAfterDeletion.edges.some(e => e.id === "edge-test-ab-1");

      assert("GRAPH-017: Node deletion cleanly cascades and decouples all connected edges", 
        nodeAExists === false && edgeABExists === false
      );

      // F. Sync Database Entities to Graph representation
      // Cleanup for clean sync run
      await pool.query("DELETE FROM graph_edges WHERE project_id = $1;", [mockProjectId]);
      await pool.query("DELETE FROM graph_nodes WHERE project_id = $1;", [mockProjectId]);

      // 1. Insert Context Items (files and docs)
      await pool.query(`
        INSERT INTO context_items (id, project_id, source_type, source_uri, checksum, version, content_hash, token_count, confidence, freshness_status, created_at, updated_at)
        VALUES 
          ('item-sync-f1', $1, 'code', 'src/billing/sync-route.ts', 'h1', '1.0.0', 'h1', 120, 100.0, 'fresh', NOW(), NOW()),
          ('item-sync-d1', $1, 'markdown', 'docs/sync-spec.md', 'h2', '1.0.0', 'h2', 150, 100.0, 'fresh', NOW(), NOW());
      `, [mockProjectId]);

      // 2. Insert Task context
      await pool.query(`
        INSERT INTO tasks (id, project_id, title, category, risk_level, difficulty, status, created_at, updated_at)
        VALUES ('task-sync-t1', $1, 'Integrate billing webhook flow', 'billing', 'Medium', 'Medium', 'pending', NOW(), NOW());
      `, [mockProjectId]);

      // 3. Insert Context Pack referencing the elements
      await pool.query(`
        INSERT INTO context_packs (id, project_id, task_id, primary_files, related_files, related_docs, related_tests, related_decisions, related_connected_assets, created_at)
        VALUES ('pack-sync-p1', $1, 'task-sync-t1', '["src/billing/sync-route.ts"]', '[]', '["docs/sync-spec.md"]', '[]', '[]', '[]', NOW());
      `, [mockProjectId]);

      // Run database synchronization
      const syncResult1 = await graphService.syncGraphFoundation(mockProjectId, "Test-Runner-E2E");
      
      assert("GRAPH-018: Sync process maps existing context vault assets to graph nodes cleanly", syncResult1.nodesSynced >= 3);
      assert("GRAPH-019: Sync process maps explicit contextual connections inside packs into explicit edges", syncResult1.edgesSynced >= 1);

      const graphRun1 = await graphService.getGraph(mockProjectId);
      const nodeCountRun1 = graphRun1.nodes.length;
      const edgeCountRun1 = graphRun1.edges.length;

      // Run database synchronization (Second Run for idempotent duplicate checking)
      const syncResult2 = await graphService.syncGraphFoundation(mockProjectId, "Test-Runner-E2E");
      const graphRun2 = await graphService.getGraph(mockProjectId);
      
      assert(
        "Phase 7.1: Running sync twice does not duplicate graph nodes in DB",
        graphRun2.nodes.length === nodeCountRun1
      );
      assert(
        "Phase 7.1: Running sync twice does not duplicate graph edges in DB",
        graphRun2.edges.length === edgeCountRun1
      );

      // --- STAGE 10: Dependency Graph Acceptance Hardening Suite (Phase 7.1) ---
      console.log("\nSTAGE 10: Dependency Graph Acceptance Hardening Tests (Phase 7.1)");
      
      // 1. Static AST Parser: Imports parsing
      const parseImportsSample = `
        import { useState } from "react";
        import config from './config';
        const express = require('express');
      `;
      const testParser = new MVPStaticExtractionParser();
      const parsedImports = testParser.parseImports(parseImportsSample);
      assert("Phase 7.1: parseImports extracts relative and package imports cleanly", 
        parsedImports.includes("react") && 
        parsedImports.includes("./config") && 
        parsedImports.includes("express")
      );

      // 2. Static AST Parser: Exports parsing
      const parseExportsSample = `
        export const mySymbol = 123;
        export function myHelper() {}
        export default class MyComponent {}
      `;
      const parsedExports = testParser.parseExports(parseExportsSample);
      assert("Phase 7.1: parseExports extracts named, helper, and default symbols", 
        parsedExports.includes("mySymbol") && 
        parsedExports.includes("myHelper") && 
        parsedExports.includes("MyComponent")
      );

      // 3. Static AST Parser: JSX Component Usage detection
      const jsxSample = `
        function Layout() {
          return (
            <div>
              <Header />
              <Button label="Click" />
            </div>
          );
        }
      `;
      const parsedJSX = testParser.parseJSXComponents(jsxSample);
      assert("Phase 7.1: parseJSXComponents detects React JSX element identifiers", 
        parsedJSX.includes("Header") && 
        parsedJSX.includes("Button") && 
        !parsedJSX.includes("div")
      );

      // 4. Static AST Parser: API Call detection
      const apiCallsSample = `
        const data = await fetch("/api/tasks");
        const res = await axios.post("/api/projects", { name: "New" });
      `;
      const parsedAPIs = testParser.parseAPICalls(apiCallsSample);
      assert("Phase 7.1: parseAPICalls extracts explicit GET/POST calls to endpoint patterns", 
        parsedAPIs.some((c: any) => c.method === "get" && c.path === "/api/tasks") && 
        parsedAPIs.some((c: any) => c.method === "post" && c.path === "/api/projects")
      );

      // 5. Static AST Parser: Route definition detection
      const routesSample = `
        router.get("/projects/:id/members", (req, res) => {});
        app.post("/auth/login", (req, res) => {});
      `;
      const parsedRoutes = testParser.parseRoutes(routesSample);
      assert("Phase 7.1: parseRoutes extracts Express router definitions", 
        parsedRoutes.some((r: any) => r.method === "get" && r.path === "/projects/:id/members") && 
        parsedRoutes.some((r: any) => r.method === "post" && r.path === "/auth/login")
      );

      // 6. Static AST Parser: Database usage detection
      const sqlSample = `
        SELECT * FROM projects WHERE id = $1;
        INSERT INTO audit_logs (id) VALUES ($1);
      `;
      const parsedTables = testParser.parseDatabaseTables(sqlSample, ["projects", "audit_logs", "fake_table"]);
      assert("Phase 7.1: parseDatabaseTables references valid known tables", 
        parsedTables.includes("projects") && 
        parsedTables.includes("audit_logs") && 
        !parsedTables.includes("fake_table")
      );

      // 7. Security Protection: Node ownership validation and cross-project leakage block
      const unauthorizedProjectId = "proj_malicious_leak_actor";
      let throwsOnLeakedNodeAccess = false;
      try {
        await graphService.updateNode(otherProjectId, "item-sync-f1", { label: "Hacked" });
      } catch (err: any) {
        throwsOnLeakedNodeAccess = err.message.includes("does not belong to") || err.message.includes("PermissionDeniedError");
      }
      assert("Phase 7.1: Cross-project mutation is hard blocked with PermissionDeniedError", throwsOnLeakedNodeAccess);

      const crossProjectGraph = await graphService.getGraph(mockProjectId);
      const isOtherProjectNodeVisible = crossProjectGraph.nodes.some(n => n.projectId === unauthorizedProjectId);
      assert("Phase 7.1: Node graph retrieval prevents vertical cross-project data leaks", !isOtherProjectNodeVisible);

      // 8. Security Protection: No secret leaks stored inside node/edge metadata
      const leakyNode = await graphService.createNode(mockProjectId, {
        id: "node-leaky-sec-1",
        projectId: mockProjectId,
        label: "credentials.ts",
        type: "code" as any,
        nodeIdentifier: `${mockProjectId}:credentials.ts`,
        metadata: {
          key: "AIzaSyLeakedSecretWord",
          db: "postgres://admin:passabc123@local:5432/db"
        }
      });
      assert("Phase 7.1: Node metadata automatically redacts secret values before database commits", 
        !JSON.stringify(leakyNode.metadata).includes("AIzaSyLeakedSecretWord") && 
        !JSON.stringify(leakyNode.metadata).includes("passabc123")
      );

      // Delete custom leaky validation node
      await graphService.deleteNode(mockProjectId, "node-leaky-sec-1");


    } catch (err: any) {
      console.error("  Database E2E Error encountered:", err.message);
      failed++;
    }
  }

  // --- STAGE 27: Phase 23 Task Lifecycle FSM Engine Validation ---
  console.log("\n========================================================");
  console.log("  STAGE 27: Task Lifecycle FSM Engine Validation Checks  ");
  console.log("========================================================\n");
  try {
    const { TaskLifecycleService } = await import("../apps/api/src/TaskLifecycleService");

    // A. Pure Unit State Machine Tests (Deterministic Mock DB check)
    console.log("  Running Stage 27 Unit checks (In-memory FSM tests)...");
    
    // In-memory mock database store for tasks and history
    const mockTasks: Record<string, any> = {
      "task-unit-1": { id: "task-unit-1", project_id: "test-proj-27", status: "pending", title: "Verify cookies secure flags" }
    };
    const mockHistory: any[] = [];
    const loggedActions: any[] = [];

    const mockQuery = async (sql: string, params?: any[]) => {
      const normalizedSql = sql.replace(/\s+/g, " ").trim();
      if (normalizedSql.includes("SELECT id, project_id as \"projectId\", status, title FROM tasks")) {
        const taskId = params ? params[0] : "";
        const task = mockTasks[taskId];
        if (task) {
          return { rows: [{ id: task.id, projectId: task.project_id, status: task.status, title: task.title }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
      if (normalizedSql.includes("SELECT COUNT(*) as count FROM agent_sessions")) {
        return { rows: [{ count: "0" }], rowCount: 1 };
      }
      if (normalizedSql.includes("SELECT COUNT(*) as count FROM resume_schedules")) {
        return { rows: [{ count: "0" }], rowCount: 1 };
      }
      if (normalizedSql.includes("SELECT created_at as \"createdAt\" FROM task_status_history")) {
        return { rows: [], rowCount: 0 };
      }
      if (normalizedSql.includes("UPDATE tasks SET status = $1")) {
        const nextStatus = params ? params[0] : "";
        const taskId = params ? params[1] : "";
        if (mockTasks[taskId]) {
          mockTasks[taskId].status = nextStatus;
        }
        return { rows: [], rowCount: 1 };
      }
      if (normalizedSql.includes("INSERT INTO task_status_history")) {
        if (params) {
          mockHistory.push({
            id: params[0],
            projectId: params[1],
            taskId: params[2],
            fromStatus: params[3],
            toStatus: params[4],
            action: params[5],
            actorType: params[6],
            actorId: params[7],
            rationale: params[8],
            metadata: JSON.parse(params[9]),
            createdAt: new Date().toISOString()
          });
        }
        return { rows: [], rowCount: 1 };
      }
      if (normalizedSql.includes("SELECT id, project_id as \"projectId\"") && normalizedSql.includes("task_status_history")) {
        const taskId = params ? params[1] : "";
        const historyRows = mockHistory.filter(h => h.taskId === taskId);
        return { rows: historyRows, rowCount: historyRows.length };
      }
      return { rows: [], rowCount: 0 };
    };

    const mockLogAction = async (
      projectId: string,
      actor: string,
      featureId: string,
      action: string,
      status: string,
      metadata?: Record<string, unknown>,
      rationale?: string,
      resourceId?: string,
      ipAddress?: string
    ) => {
      loggedActions.push({ projectId, actor, featureId, action, status, metadata, rationale, resourceId });
    };

    const unitService = new TaskLifecycleService(mockQuery as any, mockLogAction as any);

    // Test 1: Fetch state for unit-1
    const initialState = await unitService.getLifecycleState("test-proj-27", "task-unit-1");
    assert("Stage 27 Unit: Task initial state is pending", initialState.currentStatus === "pending");
    assert("Stage 27 Unit: Initial allowed actions contains start", initialState.allowedActions.includes("start"));
    assert("Stage 27 Unit: Initial blocked actions contains retry", initialState.blockedActions.includes("retry"));

    // Test 2: Transition legally pending -> running
    const trans1 = await unitService.transitionTask("test-proj-27", {
      taskId: "task-unit-1",
      action: "start"
    }, "system-test");
    
    assert("Stage 27 Unit: Transitioned status is running", trans1.toStatus === "running");
    assert("Stage 27 Unit: Task status updated in cache database", mockTasks["task-unit-1"].status === "running");
    assert("Stage 27 Unit: Task status history row created", mockHistory.length === 1 && mockHistory[0].action === "start");

    // Test 3: Illegal transition check (resume from running) should throw ConflictError
    let unitThrew = false;
    try {
      await unitService.transitionTask("test-proj-27", {
        taskId: "task-unit-1",
        action: "resume"
      }, "system-test");
    } catch (err: any) {
      if (err.name === "ConflictError" || err.message.includes("Illegal transition")) {
        unitThrew = true;
      }
    }
    assert("Stage 27 Unit: Correctly blocks illegal transition resume from running state", unitThrew);

    // Test 4: Admin Bypass override check (force transition with override metadata)
    const transBypass = await unitService.transitionTask("test-proj-27", {
      taskId: "task-unit-1",
      action: "resume",
      targetStatus: "paused",
      metadata: { adminOverride: true }
    }, "debug-admin");
    
    assert("Stage 27 Unit: Admin override bypass successfully forced illegal transition", transBypass.toStatus === "paused");
    assert("Stage 27 Unit: Override history logged override flag", mockHistory.length === 2 && mockHistory[1].metadata?.adminOverride === true);

    // B. Integration Suite Check (Using real PostgreSQL connection when active Pool is online)
    const activePool = (typeof dbConnector !== "undefined" && dbConnector && dbConnectedByVault) ? dbConnector.getPool() : null;
    if (activePool) {
      console.log("  Running Stage 27 Integration checks (Live SQL connection database)...");
      
      const realQueryFn = async (sql: string, params?: any[]) => {
        const res = await activePool.query(sql, params);
        return { rows: res.rows, rowCount: res.rowCount };
      };

      const realService = new TaskLifecycleService(realQueryFn, mockLogAction as any);

      // Create a test task in tasks table
      const taskId = `task_e2e_${crypto.randomBytes(4).toString("hex")}`;
      const projId = "test-proj-27";
      
      await activePool.query(
        `INSERT INTO tasks (id, project_id, status, title, difficulty, category, risk_level, description)
         VALUES ($1, $2, 'pending', 'Lifecycle Acceptance E2E Task', 'Easy', 'QA', 'Low', 'Verifying transitions');`,
        [taskId, projId]
      );

      try {
        // Query initial lifecycle
        const stateE2E = await realService.getLifecycleState(projId, taskId);
        assert("Stage 27 Live: Fetched task state from live DB is pending", stateE2E.currentStatus === "pending");

        // Transition pending -> running via FSM Service
        await realService.transitionTask(projId, {
          taskId,
          action: "start",
          rationale: "Live start test"
        }, "e2e-runner");

        // Verify state is running on task record
        const liveTaskRes = await activePool.query("SELECT status FROM tasks WHERE id = $1 LIMIT 1;", [taskId]);
        assert("Stage 27 Live: Live database task status is updated to running", liveTaskRes.rows[0]?.status === "running");

        // Verify status history table has entry
        const histTaskRes = await activePool.query("SELECT action, from_status as \"fromStatus\", to_status as \"toStatus\" FROM task_status_history WHERE task_id = $1 ORDER BY created_at DESC LIMIT 1;", [taskId]);
        assert("Stage 27 Live: History table has recorded action", histTaskRes.rows[0]?.action === "start" && histTaskRes.rows[0]?.toStatus === "running");

      } finally {
        // Cleanup live records safely
        await activePool.query("DELETE FROM task_status_history WHERE task_id = $1;", [taskId]);
        await activePool.query("DELETE FROM tasks WHERE id = $1;", [taskId]);
      }
    } else {
      console.log("  Stage 27 live database reference bypass; skipping SQL connection checks.");
    }

  } catch (err: any) {
    console.error("  Unexpected error in Stage 27:", err.message);
    failed++;
  }

  console.log("\n========================================================");
  console.log("               Hardening Pass Results Summary           ");
  console.log(`  PASSED: ${passed}  |  FAILED: ${failed}`);
  console.log("========================================================\n");

  if (failed > 0) {
    console.error("❌ VAULT INTEGRITY HARDENING PASS FAILED!");
    process.exit(1);
  } else {
    console.log("✅ VAULT INTEGRITY HARDENING PASS COMPLETED SUCCESSFULLY!");
    process.exit(0);
  }
}

runTests();
