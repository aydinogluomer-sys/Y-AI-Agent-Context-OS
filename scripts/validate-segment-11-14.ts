// SEGMENT 2: STAGES 11-14
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
      // --- STAGE 11: Reverse Dependency & Impact Discovery Hardening Tests (Phase 8) ---
      console.log("\nSTAGE 11: Reverse Dependency & Impact Discovery Hardening Tests (Phase 8)");

      // 1. Create target and dependent nodes for Used-By component, test, page, etc.
      const targetBtn = await graphService.createNode(mockProjectId, {
        id: "node-btn-target",
        projectId: mockProjectId,
        label: "src/components/Button.tsx",
        type: "code" as any,
        nodeIdentifier: `${mockProjectId}:src/components/Button.tsx`,
        metadata: { exports: ["Button"] }
      });

      const parentForm = await graphService.createNode(mockProjectId, {
        id: "node-form-parent",
        projectId: mockProjectId,
        label: "src/components/Form.tsx",
        type: "code" as any,
        nodeIdentifier: `${mockProjectId}:src/components/Form.tsx`
      });

      const pageHome = await graphService.createNode(mockProjectId, {
        id: "node-page-home",
        projectId: mockProjectId,
        label: "src/pages/Home.tsx",
        type: "code" as any,
        nodeIdentifier: `${mockProjectId}:src/pages/Home.tsx`
      });

      const btnTest = await graphService.createNode(mockProjectId, {
        id: "node-btn-test",
        projectId: mockProjectId,
        label: "tests/Button.test.ts",
        type: "test",
        nodeIdentifier: `${mockProjectId}:tests/Button.test.ts`
      });

      const designDoc = await graphService.createNode(mockProjectId, {
        id: "node-design-doc",
        projectId: mockProjectId,
        label: "docs/design.md",
        type: "doc",
        nodeIdentifier: `${mockProjectId}:docs/design.md`
      });

      // Construct relationships
      await graphService.createEdge(mockProjectId, {
        id: "edge-form-uses-btn",
        projectId: mockProjectId,
        source: "node-form-parent",
        target: "node-btn-target",
        label: "connected_to",
        relationship: "uses_component"
      });

      await graphService.createEdge(mockProjectId, {
        id: "edge-page-imports-btn",
        projectId: mockProjectId,
        source: "node-page-home",
        target: "node-btn-target",
        label: "imported_by",
        relationship: "imports"
      });

      await graphService.createEdge(mockProjectId, {
        id: "edge-test-tests-btn",
        projectId: mockProjectId,
        source: "node-btn-test",
        target: "node-btn-target",
        label: "tests",
        relationship: "tests"
      });

      await graphService.createEdge(mockProjectId, {
        id: "edge-doc-documents-btn",
        projectId: mockProjectId,
        source: "node-design-doc",
        target: "node-btn-target",
        label: "documents",
        relationship: "documents"
      });

      // Run reverse lookup check
      const revResult = await graphService.getReverseDependencies(mockProjectId, { path: "src/components/Button.tsx" });
      assert("GRAPH-018: Used-by relationship lookup resolves target and lists dependents", 
        revResult.target?.id === "node-btn-target" && 
        revResult.used_by.length >= 4
      );

      assert("GRAPH-019: Detect parent components using uses_component relationship", 
        revResult.used_by.some(u => u.relationship_type === "used_by_component" && u.node.id === "node-form-parent")
      );

      const hasHomeImport = revResult.used_by.some(u => u.relationship_type === "imported_by" && u.node.id === "node-page-home");
      assert("GRAPH-018: Supported imported_by relationship detection", hasHomeImport);

      const hasBtnTest = revResult.used_by.some(u => u.relationship_type === "tested_by" && u.node.id === "node-btn-test");
      assert("GRAPH-022: Detect reverse test dependency tested_by from target file", hasBtnTest);

      const hasDesignDoc = revResult.used_by.some(u => u.relationship_type === "documented_by" && u.node.id === "node-design-doc");
      assert("GRAPH-023: Detect reverse documentation relationship documented_by from target file", hasDesignDoc);

      // 2. Consumer Hooks detection (GRAPH-020)
      const hookTarget = await graphService.createNode(mockProjectId, {
        id: "node-hook-target",
        projectId: mockProjectId,
        label: "src/hooks/useMetrics.ts",
        type: "code" as any,
        nodeIdentifier: `${mockProjectId}:src/hooks/useMetrics.ts`
      });

      // Form component imports useMetrics
      await graphService.createEdge(mockProjectId, {
        id: "edge-form-imports-hook",
        projectId: mockProjectId,
        source: "node-form-parent",
        target: "node-hook-target",
        label: "imported_by",
        relationship: "imports"
      });

      const hookRevResult = await graphService.getReverseDependencies(mockProjectId, { path: "src/hooks/useMetrics.ts" });
      assert("GRAPH-020: Detect consumer hook usage starting with use* starting prefix", 
        hookRevResult.used_by.some(u => u.node.id === "node-form-parent")
      );

      // 3. Page detection (GRAPH-021)
      const impactForBtn = await graphService.generateImpactPreview(mockProjectId, { changed_files: ["src/components/Button.tsx"] });
      assert("GRAPH-021: Detect dependent page candidates from routing file paths", 
        impactForBtn.affected_pages.includes("src/pages/Home.tsx")
      );

      // 4. Multiple changed files impact preview 
      const impactMulti = await graphService.generateImpactPreview(mockProjectId, { 
        changed_files: ["src/components/Button.tsx", "src/hooks/useMetrics.ts"] 
      });
      assert("Phase 8: Impact preview aggregate lists affected elements for multiple changed files", 
        impactMulti.affected_files.includes("src/components/Form.tsx") && 
        impactMulti.affected_files.includes("src/pages/Home.tsx")
      );

      // 5. Test & Doc Warnings reporting when absent
      const orphanNode = await graphService.createNode(mockProjectId, {
        id: "node-orphan-code",
        projectId: mockProjectId,
        label: "src/billing/untested.ts",
        type: "code" as any,
        nodeIdentifier: `${mockProjectId}:src/billing/untested.ts`
      });

      const orphanRevResult = await graphService.getReverseDependencies(mockProjectId, { path: "src/billing/untested.ts" });
      const hasMissingTestWarn = orphanRevResult.warnings.some(w => w.includes("No associated tests"));
      const hasMissingDocWarn = orphanRevResult.warnings.some(w => w.includes("No linked documentation"));
      assert("Phase 8: Warn when missing verifying tests for active code file target", hasMissingTestWarn);
      assert("Phase 8: Warn when missing documenting specs for active code file target", hasMissingDocWarn);

      // Cleanup STAGE 11 created nodes
      const stage11Nodes = [
        "node-btn-target", "node-form-parent", "node-page-home", 
        "node-btn-test", "node-design-doc", "node-hook-target", "node-orphan-code"
      ];
      for (const nid of stage11Nodes) {
        await graphService.deleteNode(mockProjectId, nid);
      }

      // --- STAGE 12: Change Impact Analysis Engine Validation (Phase 9) ---
      console.log("\nSTAGE 12: Change Impact Analysis Engine Validation (Phase 9)");

      // Create boundary and dependency nodes
      await pool.query("DELETE FROM task_boundaries WHERE project_id = $1;", [mockProjectId]);
      await pool.query("DELETE FROM impact_reports WHERE project_id = $1;", [mockProjectId]);

      const mockTaskId = "task_verify_9";
      await pool.query(`
        INSERT INTO tasks (id, project_id, title, category, risk_level, difficulty, status) 
        VALUES ($1, $2, $3, $4, $5, $6, $7);
      `, [mockTaskId, mockProjectId, "Mock Task 9", "context", "medium", "simple", "active"]);

      await pool.query(`
        INSERT INTO task_boundaries (id, project_id, task_id, status, forbidden_files, forbidden_domains, allowed_files)
        VALUES ($1, $2, $3, $4, $5, $6, $7);
      `, [
        "boundary_verify_9", 
        mockProjectId, 
        mockTaskId, 
        "active", 
        JSON.stringify(["src/forbidden.ts"]), 
        JSON.stringify(["security"]), 
        JSON.stringify(["src/allowed.ts"])
      ]);

      // Create nodes and edges to trace
      await graphService.createNode(mockProjectId, {
        id: "node-verify-code",
        projectId: mockProjectId,
        label: "src/allowed.ts",
        type: "code" as any,
        nodeIdentifier: `${mockProjectId}:src/allowed.ts`
      });

      await graphService.createNode(mockProjectId, {
        id: "node-verify-dependent",
        projectId: mockProjectId,
        label: "src/dependent.ts",
        type: "code" as any,
        nodeIdentifier: `${mockProjectId}:src/dependent.ts`
      });

      await graphService.createEdge(mockProjectId, {
        id: "edge-verify-dep",
        projectId: mockProjectId,
        source: "node-verify-dependent",
        target: "node-verify-code",
        label: "connected_to",
        relationship: "uses_component"
      });

      // 1. Core Impact Analysis Generation with trace & categories
      const reportNormal = await graphService.generateImpactAnalysis(mockProjectId, {
        changed_files: ["src/allowed.ts"],
        include_indirect: false,
        task_id: mockTaskId
      });

      assert("Phase 9: generateImpactAnalysis is registered with correct schema",
        reportNormal.id !== undefined &&
        reportNormal.project_id === mockProjectId &&
        reportNormal.overall_risk === "medium" &&
        reportNormal.affected_files.includes("src/dependent.ts")
      );

      // 2. Secret Scan & Boundary Violations Risk detection
      const reportRisk = await graphService.generateImpactAnalysis(mockProjectId, {
        changed_files: [".env", "src/forbidden.ts"],
        include_indirect: false,
        task_id: mockTaskId
      });

      assert("Phase 9: Secret signature and forbidden boundary violations trigger critical/high risk level",
        reportRisk.overall_risk === "critical" &&
        reportRisk.risk_by_file.some(f => f.file === ".env" && f.risk === "critical") &&
        reportRisk.risk_by_file.some(f => f.file === "src/forbidden.ts" && f.risk === "critical")
      );

      // 3. PostgreSQL retrieval support for reports feed
      const allReports = await graphService.getImpactReports(mockProjectId);
      assert("Phase 9: getImpactReports lists saved reports correctly",
        allReports.length >= 2
      );

      const retrievedReport = await graphService.getImpactReport(mockProjectId, reportNormal.id);
      assert("Phase 9: getImpactReport retrieves specific report with full field hydration",
        retrievedReport !== null &&
        retrievedReport.id === reportNormal.id &&
        retrievedReport.project_id === mockProjectId
      );

      // Clean up STAGE 12 tables
      await pool.query("DELETE FROM impact_reports WHERE project_id = $1;", [mockProjectId]);
      await pool.query("DELETE FROM task_boundaries WHERE project_id = $1;", [mockProjectId]);
      await pool.query("DELETE FROM tasks WHERE project_id = $1;", [mockProjectId]);
      await graphService.deleteNode(mockProjectId, "node-verify-code");
      await graphService.deleteNode(mockProjectId, "node-verify-dependent");

      // --- STAGE 13: Project-Wide Change Simulation Validation (Phase 10) ---
      console.log("\nSTAGE 13: Project-Wide Change Simulation Validation (Phase 10)");

      // Refit base mocks for simulation testing
      const simNodeCode = await graphService.createNode(mockProjectId, {
        id: "node-sim-index",
        projectId: mockProjectId,
        label: "src/index.ts",
        type: "code" as any,
        status: "active",
        nodeIdentifier: "src/index.ts",
        metadata: { exports: ["foo"] }
      });

      const simNodeDep = await graphService.createNode(mockProjectId, {
        id: "node-sim-component",
        projectId: mockProjectId,
        label: "src/component.tsx",
        type: "ui" as any,
        status: "active",
        nodeIdentifier: "src/component.tsx",
        metadata: { imports: ["src/index.ts"] }
      });

      // Assert graph relation (imports/imported_by)
      await graphService.createEdge(mockProjectId, {
        id: "edge-sim-index-imported",
        projectId: mockProjectId,
        source: "node-sim-component",
        target: "node-sim-index",
        label: "imported_by",
        relationship: "imports"
      });

      // Provision boundary constraints
      await pool.query(
        `INSERT INTO task_boundaries (id, project_id, forbidden_files, allowed_files, status, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW());`,
        ["sim-boundary", mockProjectId, JSON.stringify(["src/forbidden.ts"]), JSON.stringify(["src/index.ts", "src/component.tsx"]), "active"]
      );

      // 1. Run standard Change Simulation prediction
      const simNormal = await graphService.generateChangeSimulation(mockProjectId, {
        changed_files: ["src/index.ts"],
        change_intent: "Upgrade index exporting components with standard interfaces.",
        include_indirect: false
      }, "User-Aydinoglu");

      assert("Phase 10: generateChangeSimulation maps correct simulation ID and project bindings",
        simNormal.simulation_id !== undefined &&
        simNormal.project_id === mockProjectId &&
        simNormal.change_intent === "Upgrade index exporting components with standard interfaces."
      );

      assert("Phase 10: spread discovery outputs direct dependent files correctly",
        simNormal.spread.direct.includes("src/component.tsx") &&
        simNormal.spread.blocked.length === 0
      );

      assert("Phase 10: catch missed relationships identifies possible missing tests",
        simNormal.missed_relationships.some((m: any) => m.type === "POSSIBLE_MISSING_TEST_RELATIONSHIP" && m.file === "src/index.ts")
      );

      assert("Phase 10: follow-up edits are cleanly propagated with appropriate risks and confidences",
        simNormal.required_follow_up_edits.some((e: any) => e.target_file === "src/component.tsx" && e.confidence === 0.9)
      );

      assert("Phase 10: follow-up tests suggest quality assertions block",
        simNormal.required_follow_up_tests.test_commands.length > 0 &&
        simNormal.required_follow_up_tests.missing_test_warnings.length > 0
      );

      assert("Phase 10: documents and designs trace recommended spec updates",
        simNormal.required_docs_design_updates.missing_docs_warnings.length > 0
      );

      // 2. Run Boundary Restricted Simulation prediction
      const simForbidden = await graphService.generateChangeSimulation(mockProjectId, {
        changed_files: ["src/forbidden.ts"],
        include_indirect: false
      });

      assert("Phase 10: forbidden path simulation triggers boundary blocked violations with critical risks",
        simForbidden.risk_summary.overall_risk === "critical" &&
        simForbidden.spread.blocked.includes("src/forbidden.ts") &&
        simForbidden.warnings.length > 0
      );

      // 3. PostgreSQL persistence, listing, and retrieving
      const simList = await graphService.getChangeSimulations(mockProjectId);
      assert("Phase 10: getChangeSimulations loads stored simulations sequentially in historic view",
        simList.length >= 2 &&
        simList[0].simulation_id !== undefined
      );

      const simSingle = await graphService.getChangeSimulation(mockProjectId, simNormal.simulation_id);
      assert("Phase 10: getChangeSimulation hydrates full mock fields cleanly",
        simSingle !== null &&
        simSingle.id === simNormal.simulation_id &&
        simSingle.project_id === mockProjectId &&
        simSingle.spread.direct.includes("src/component.tsx")
      );

      // --- STAGE 14: Change Simulation Audit Hardening Validation (Phase 10.1) ---
      console.log("\nSTAGE 14: Change Simulation Audit Hardening Validation (Phase 10.1)");

      // 1. Low/Medium Risk simulation check
      const simLowMedium = await graphService.generateChangeSimulation(mockProjectId, {
        changed_files: ["src/component.tsx"],
        change_intent: "Standard component presentation update."
      }, "User-Aydinoglu");

      const auditLowCheck = await pool.query(
        "SELECT * FROM audit_logs WHERE project_id = $1 AND (action = $2 OR action = $3);",
        [mockProjectId, "CHANGE_SIMULATION_HIGH_RISK_DETECTED", "CHANGE_SIMULATION_CRITICAL_RISK_DETECTED"]
      );
      const lowRowsParsed = auditLowCheck.rows.filter(r => {
        const parsed = typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata;
        return parsed && parsed.simulation_id === simLowMedium.simulation_id;
      });
      assert("Phase 10.1: low/medium simulations do not create high/critical audit events",
        lowRowsParsed.length === 0
      );

      // 2. High Risk simulation check (API route / DB file)
      const simHigh = await graphService.generateChangeSimulation(mockProjectId, {
        changed_files: ["apps/api/src/db.ts"],
        change_intent: "Add telemetry connection logging tables to index."
      }, "User-Aydinoglu");

      const auditHighCheck = await pool.query(
        "SELECT * FROM audit_logs WHERE project_id = $1 AND action = $2;",
        [mockProjectId, "CHANGE_SIMULATION_HIGH_RISK_DETECTED"]
      );
      const highRow = auditHighCheck.rows.find(r => {
        const parsed = typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata;
        return parsed && parsed.simulation_id === simHigh.simulation_id;
      });
      
      assert("Phase 10.1: high-risk simulation creates CHANGE_SIMULATION_HIGH_RISK_DETECTED audit event",
        highRow !== undefined
      );

      const highLogMeta = highRow ? (typeof highRow.metadata === "string" ? JSON.parse(highRow.metadata) : highRow.metadata) : {};
      assert("Phase 10.1: audit metadata includes simulation_id",
        highLogMeta.simulation_id === simHigh.simulation_id
      );

      assert("Phase 10.1: audit metadata includes affected_file_paths",
        Array.isArray(highLogMeta.affected_file_paths) &&
        highLogMeta.affected_file_paths.some((p: string) => p.includes("apps/api/src/db.ts"))
      );

      // 3. Critical Risk simulation check (Env / Credentials / Forbidden files)
      const simCritical = await graphService.generateChangeSimulation(mockProjectId, {
        changed_files: ["src/credentials.json", ".env.production"],
        change_intent: "Update global key parameters."
      }, "User-Aydinoglu");

      const auditCriticalCheck = await pool.query(
        "SELECT * FROM audit_logs WHERE project_id = $1 AND action = $2;",
        [mockProjectId, "CHANGE_SIMULATION_CRITICAL_RISK_DETECTED"]
      );
      const critRow = auditCriticalCheck.rows.find(r => {
        const parsed = typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata;
        return parsed && parsed.simulation_id === simCritical.simulation_id;
      });

      assert("Phase 10.1: critical-risk simulation creates CHANGE_SIMULATION_CRITICAL_RISK_DETECTED audit event",
        critRow !== undefined
      );

      const critLogMeta = critRow ? (typeof critRow.metadata === "string" ? JSON.parse(critRow.metadata) : critRow.metadata) : {};
      const allFilesStr = JSON.stringify(critLogMeta.changed_files || []) + JSON.stringify(critLogMeta.affected_file_paths || []);
      const containsSecrets = allFilesStr.includes(".env") || allFilesStr.includes("credentials") || allFilesStr.includes("production");
      assert("Phase 10.1: audit metadata redacts secrets",
        !containsSecrets &&
        allFilesStr.includes("[REDACTED_SECRET_PATH]")
      );

      // 4. Cross-project leakage is blocked
      const leakedSim = await graphService.getChangeSimulation(otherProjectId, simNormal.simulation_id);
      assert("Phase 10.1: cross-project leakage is blocked", leakedSim === null);


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
