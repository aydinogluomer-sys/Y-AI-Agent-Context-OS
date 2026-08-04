/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SearchServer } from "../src/search-server";
import { RetrievalRankingService } from "../src/retrieval-ranking-service";
import { 
  RetrievalQueryDTO, 
  SecretLeakedError, 
  NotFoundError, 
  PermissionDeniedError 
} from "@y/shared";

async function runTests() {
  console.log("\n========================================================");
  console.log("       Phase 22 Search Server & Retrieval Isolation     ");
  console.log("                Acceptance Test Suite                   ");
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

  // Case-insensitive regex SQL parsing mock pool
  const mockPool: any = {
    queriesExecuted: [] as string[],
    auditActionsLogged: [] as string[],
    query: async (sql: string, params: any[] = []): Promise<any> => {
      mockPool.queriesExecuted.push(sql);

      if (sql.includes("INSERT INTO audit_logs")) {
        if (params && params[3]) {
          mockPool.auditActionsLogged.push(params[3]);
        }
      }

      if (/FROM\s+projects/i.test(sql)) {
        if (params[0] === "proj_not_exist") {
          return { rowCount: 0, rows: [] };
        }
        return { rowCount: 1, rows: [{ id: params[0], name: "Test Project" }] };
      }

      if (/FROM\s+tasks/i.test(sql)) {
        if (params[0] === "task_cross_project") {
          return { rowCount: 1, rows: [{ id: "task_cross_project", project_id: "other_project_999", title: "Cross task" }] };
        }
        if (params[0] === "task_valid") {
          return { rowCount: 1, rows: [{ id: "task_valid", project_id: "proj_valid_123", title: "Implement security validation credentials flow", category: "Security" }] };
        }
        return { rowCount: 0, rows: [] };
      }

      if (/FROM\s+context_items/i.test(sql)) {
        return {
          rowCount: 2,
          rows: [
            { id: "item_auth", project_id: params[0], source_type: "code", source_uri: "src/auth.ts", created_at: new Date(Date.now() - 3600000), updated_at: new Date(Date.now() - 1800000) },
            { id: "item_spec", project_id: params[0], source_type: "markdown", source_uri: "docs/architecture.md", created_at: new Date(Date.now() - 86400000), updated_at: new Date(Date.now() - 43200000) }
          ]
        };
      }

      if (/FROM\s+context_chunks/i.test(sql)) {
        return {
          rowCount: 2,
          rows: [
            { id: "chunk_auth_0", context_item_id: "item_auth", chunk_index: 0, content: "Implement validation credentials auth method.", token_count: 85 },
            { id: "chunk_spec_0", context_item_id: "item_spec", chunk_index: 0, content: "High integrity architecture specification. Decouples search paths.", token_count: 140 }
          ]
        };
      }

      return { rowCount: 1, rows: [] };
    }
  };

  // Mock Knowledge Graph Service to test graph proximity weighting
  const mockGraphService: any = {
    getGraph: async (projectId: string) => {
      return {
        nodes: [
          { id: "task_valid", taskId: "task_valid", label: "Implement security validation credentials flow" },
          { id: "item_auth", contextItemId: "item_auth", label: "src/auth.ts" },
          { id: "item_spec", contextItemId: "item_spec", label: "docs/architecture.md" }
        ],
        edges: [
          { source: "task_valid", target: "item_auth", relationship: "belongs_to", weight: 1.0 },
          { source: "task_valid", target: "item_spec", relationship: "references", weight: 0.8 }
        ]
      };
    }
  };

  // --- UNIT TEST BLOCK 1: SearchServer Backends ---
  console.log("\n--- STAGE 1: SearchServer Backend Modes Verification ---");
  try {
    const memoryServer = new SearchServer(null, "local_memory_stub");
    const memCandidates = await memoryServer.queryCandidates({
      project_id: "proj_valid_123",
      query: "auth"
    });
    
    assert("Local Memory Stub returns sorted candidate lists", memCandidates.length > 0);
    assert("Local Memory Stub scores item with matching paths higher", memCandidates[0].path.includes("auth.ts"));

    const externalServer = new SearchServer(null, "external_stub_only");
    const extCandidates = await externalServer.queryCandidates({
      project_id: "proj_valid_123",
      query: "context"
    });
    assert("External Stub Server disables remote candidate fabrication and returns empty array", extCandidates.length === 0);

    const sqlServer = new SearchServer(mockPool, "local_sql");
    const sqlCandidates = await sqlServer.queryCandidates({
      project_id: "proj_valid_123",
      query: "validation"
    });
    assert("Local SQL Server fetches from mock table database correctly", sqlCandidates.length > 0);
    assert("Candidates are ranked descending by relevance ranking score", sqlCandidates[0].final_score >= sqlCandidates[1].final_score);
  } catch (err: any) {
    console.error("Failed Stage 1:", err.message);
    if (err.stack) console.error(err.stack);
    failed++;
  }

  // --- UNIT TEST BLOCK 2: RetrievalRankingService Scoping and Guardrails ---
  console.log("\n--- STAGE 2: RetrievalRankingService Security Guardrails ---");
  
  const server = new SearchServer(mockPool, "local_sql");
  const rankingService = new RetrievalRankingService(mockPool, server, mockGraphService);

  // A. Invalid Project Check
  try {
    await rankingService.queryAndRankDirect({
      project_id: "proj_not_exist",
      query: "schema query"
    });
    assert("Block search on non-existent project", false, "Allowed non-existent project traversal.");
  } catch (err: any) {
    assert("Invalid project throws NotFoundError", err instanceof NotFoundError);
  }

  // B. Cross-Project Task Boundary Violation Check
  try {
    await rankingService.queryAndRankDirect({
      project_id: "proj_valid_123",
      task_id: "task_cross_project",
      query: "cross boundaries"
    });
    assert("Block task requests executing with other project parameters", false, "Allowed cross-project access.");
  } catch (err: any) {
    assert("Cross project task scope throws PermissionDeniedError", err instanceof PermissionDeniedError);
  }

  // C. Secret Leak Block Diagnostics
  try {
    await rankingService.queryAndRankDirect({
      project_id: "proj_valid_123",
      query: "postgres" + "ql://" + "postgres" + ":" + "mysecretpassword123" + "@api-database.internal:5432/y-os-production"
    });
    assert("Intercept api secret leaks inside search query parameter flows", false, "Leaked credentials query authorized.");
  } catch (err: any) {
    assert("Raw database credentials in query throw SecretLeakedError", err instanceof SecretLeakedError);
  }

  // --- UNIT TEST BLOCK 3: Dynamic Strategy-Based Ranking Blends & Budgets ---
  console.log("\n--- STAGE 3: Strategy-Based Rankings and Token Budgets ---");
  try {
    // A. Verify Hybrid Local strategy compilation
    const hybridRes = await rankingService.queryAndRankDirect({
      project_id: "proj_valid_123",
      task_id: "task_valid",
      query: "validation"
    });
    assert("Hybrid Local strategy resolves successfully", hybridRes.candidates.length > 0);
    assert("Hybrid Local sets strategy label to hybrid_local_mvp", hybridRes.ranking_strategy === "hybrid_local_mvp");

    // B. Verify Graph Weighting score boost (primary +25, related +15)
    const graphRes = await rankingService.queryAndRankDirect({
      project_id: "proj_valid_123",
      task_id: "task_valid",
      query: "validation",
      include_graph_weights: true
    });
    
    assert("Graph proximity strategy sets strategy label to graph_weighted_mvp", graphRes.ranking_strategy === "graph_weighted_mvp");
    
    // Auth item has relationship: "belongs_to" -> primary, Expect GRAPH_PRIMARY_BELONGS_TO tag
    const authCand = graphRes.candidates.find(c => c.id === "item_auth");
    assert("Primary dependency candidate gets belongs_to graph weight boost", authCand?.reason_codes.includes("GRAPH_PRIMARY_BELONGS_TO") === true);

    // Spec item has relationship: "references" -> related, Expect GRAPH_RELATED_REFERENCES tag
    const specCand = graphRes.candidates.find(c => c.id === "item_spec");
    assert("Related dependency candidate references gets graph weight boost", specCand?.reason_codes.includes("GRAPH_RELATED_REFERENCES") === true);

    // C. Verify Token Budget compiles and limits results
    const budgetedRes = await rankingService.queryAndRankDirect({
      project_id: "proj_valid_123",
      task_id: "task_valid",
      query: "validation",
      budget_tokens: 100 // Item chunks token total (85 + 140 = 225) exceeds budget. Only item_auth fits!
    });
    assert("Budget filter compiles context selections strictly within token budget limits", budgetedRes.selected.length === 1);
    assert("Only item fitting the budget limit gets compiled in selected list", budgetedRes.selected[0].id === "item_auth");
  } catch (err: any) {
    console.error("Failed Stage 3:", err.message);
    if (err.stack) console.error(err.stack);
    failed++;
  }

  // --- UNIT TEST BLOCK 4: Audit Event Insertion Verification ---
  console.log("\n--- STAGE 4: Audit Event Insertion & Redaction Verification ---");
  try {
    mockPool.auditActionsLogged = [];
    
    // Trigger successful flow that should emit multiple standard audit events
    await rankingService.queryAndRankDirect({
      project_id: "proj_valid_123",
      task_id: "task_valid",
      query: "validation"
    });

    assert("Audits emitted RETRIEVAL_RANKING_REQUESTED on initiate", mockPool.auditActionsLogged.includes("RETRIEVAL_RANKING_REQUESTED"));
    assert("Audits emitted RETRIEVAL_CANDIDATES_SELECTED on candidate selection", mockPool.auditActionsLogged.includes("RETRIEVAL_CANDIDATES_SELECTED"));
    assert("Audits emitted RETRIEVAL_BUDGET_APPLIED on budget resolution", mockPool.auditActionsLogged.includes("RETRIEVAL_BUDGET_APPLIED"));
    assert("Audits emitted RETRIEVAL_RANKING_COMPLETED on complete ranking", mockPool.auditActionsLogged.includes("RETRIEVAL_RANKING_COMPLETED"));

    // Reset and trigger secret block audit
    mockPool.auditActionsLogged = [];
    try {
      await rankingService.queryAndRankDirect({
        project_id: "proj_valid_123",
        query: "postgres" + "ql://" + "postgres" + ":" + "mypassword" + "@api-database.internal:5432/y-os-production"
      });
    } catch (e) {
      // expected block
    }
    assert("Audits emitted RETRIEVAL_SECRET_REDACTED on secret detection", mockPool.auditActionsLogged.includes("RETRIEVAL_SECRET_REDACTED"));

    // Reset and trigger access cross-project block audit
    mockPool.auditActionsLogged = [];
    try {
      await rankingService.queryAndRankDirect({
        project_id: "proj_valid_123",
        task_id: "task_cross_project",
        query: "cross boundaries"
      });
    } catch (e) {
      // expected block
    }
    assert("Audits emitted RETRIEVAL_CROSS_PROJECT_ACCESS_BLOCKED on scope crossing", mockPool.auditActionsLogged.includes("RETRIEVAL_CROSS_PROJECT_ACCESS_BLOCKED"));

  } catch (err: any) {
    console.error("Failed Stage 4:", err.message);
    if (err.stack) console.error(err.stack);
    failed++;
  }

  console.log("\n========================================================");
  console.log("               Hardening Pass Results Summary           ");
  console.log(`  PASSED: ${passed}  |  FAILED: ${failed}`);
  console.log("========================================================\n");

  if (failed > 0) {
    console.error("❌ VAULT RETRIEVAL ISOLATION HARDENING TESTS FAILED!");
    process.exit(1);
  } else {
    console.log("✅ VAULT RETRIEVAL ISOLATION HARDENING TESTS SUCCEEDED!");
  }
}

// Invoke tests standalone
runTests();
