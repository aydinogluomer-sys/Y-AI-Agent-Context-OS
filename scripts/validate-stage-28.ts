/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { QualityGateService, sanitizeCommandOutput } from "../apps/api/src/QualityGateService";
import { 
  QualityGateRunStatus, 
  QualityGateCommandType,
  ConflictError,
  NotFoundError,
  PermissionDeniedError
} from "@y/shared";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config({ override: true });

let assertionPassedCount = 0;
let assertionFailedCount = 0;

function assert(description: string, condition: boolean) {
  if (!condition) {
    console.error(`  ❌ [FAIL] ${description}`);
    assertionFailedCount++;
    throw new Error(`Test Failed: ${description}`);
  } else {
    console.log(`  ✅ [PASS] ${description}`);
    assertionPassedCount++;
  }
}

async function runStage28Tests() {
  console.log("\n========================================================");
  console.log("  RUNNING ISOLATED STAGE 28: QUALITY GATES MVP VALIDATION ");
  console.log("========================================================\n");

  let passed = 0;
  let failed = 0;

  try {
    // -----------------------------------------------------------------
    // PART A: Pure Unit Tests (Deterministic In-Memory Mock DB)
    // -----------------------------------------------------------------
    console.log("Starting Part A: Pure Unit State Machine & Redaction Checks...");

    // In-memory data store for Unit tests
    const mockProjects: Record<string, any> = {
      "proj-1": { id: "proj-1" },
      "proj-2": { id: "proj-2" }
    };
    
    const mockTasks: Record<string, any> = {
      "task-1": { id: "task-1", project_id: "proj-1" },
      "task-2": { id: "task-2", project_id: "proj-2" }
    };

    const mockRuns: Record<string, any> = {};
    const mockResults: Record<string, any[]> = {};
    const loggedAudits: any[] = [];

    const mockQuery = async (sql: string, params: any[] = []) => {
      const queryStr = sql.replace(/\s+/g, " ").trim();

      // Project check
      if (queryStr.includes("SELECT id FROM projects WHERE id = $1 LIMIT 1")) {
        const id = params[0];
        if (mockProjects[id]) {
          return { rows: [mockProjects[id]], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      // Task check
      if (queryStr.includes("SELECT id, project_id FROM tasks WHERE id = $1 LIMIT 1")) {
        const id = params[0];
        if (mockTasks[id]) {
          return { rows: [{ id: mockTasks[id].id, project_id: mockTasks[id].project_id }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      // Insert Run
      if (queryStr.includes("INSERT INTO quality_gate_runs")) {
        const [id, project_id, task_id, feature_id, status, run_by, metadata_json] = params;
        mockRuns[id] = {
          id,
          project_id,
          task_id,
          feature_id,
          status,
          run_by,
          metadata_json: JSON.parse(metadata_json),
          started_at: null,
          completed_at: null,
          summary_output: null,
          created_at: new Date(),
          updated_at: new Date()
        };
        return { rows: [], rowCount: 1 };
      }

      // Get Run
      if (queryStr.includes("SELECT * FROM quality_gate_runs WHERE id = $1 AND project_id = $2 LIMIT 1")) {
        const [id, project_id] = params;
        const run = mockRuns[id];
        if (run && run.project_id === project_id) {
          return { rows: [run], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      // List Runs
      if (queryStr.includes("SELECT * FROM quality_gate_runs WHERE project_id = $1")) {
        const project_id = params[0];
        let runsList = Object.values(mockRuns).filter((r: any) => r.project_id === project_id);
        if (queryStr.includes("AND task_id = $2")) {
          const task_id = params[1];
          runsList = runsList.filter((r: any) => r.task_id === task_id);
        }
        return { rows: runsList, rowCount: runsList.length };
      }

      // Start Run
      if (queryStr.includes("UPDATE quality_gate_runs SET status = $1, started_at = NOW(), updated_at = NOW() WHERE id = $2")) {
        const [status, id] = params;
        if (mockRuns[id]) {
          mockRuns[id].status = status;
          mockRuns[id].started_at = new Date();
          mockRuns[id].updated_at = new Date();
        }
        return { rows: [], rowCount: 1 };
      }

      // Insert Command Result
      if (queryStr.includes("INSERT INTO quality_gate_command_results")) {
        const [id, run_id, project_id, task_id, command_type, status, exit_code, output_summary, raw_output_redacted, duration_ms, metadata_json] = params;
        if (!mockResults[run_id]) {
          mockResults[run_id] = [];
        }
        mockResults[run_id].push({
          id,
          run_id,
          project_id,
          task_id,
          command_type,
          status,
          exit_code,
          output_summary,
          raw_output_redacted,
          duration_ms,
          executed_at: new Date(),
          metadata_json: JSON.parse(metadata_json)
        });
        return { rows: [], rowCount: 1 };
      }

      // Select Command Results
      if (queryStr.includes("SELECT * FROM quality_gate_command_results WHERE run_id = $1 AND project_id = $2")) {
        const [run_id, project_id] = params;
        const list = mockResults[run_id] || [];
        return { rows: list.filter(r => r.project_id === project_id), rowCount: list.length };
      }

      // Finalize Run
      if (queryStr.includes("UPDATE quality_gate_runs SET status = $1, completed_at = NOW(), summary_output = $2, updated_at = NOW() WHERE id = $3")) {
        const [status, summary, id] = params;
        if (mockRuns[id]) {
          mockRuns[id].status = status;
          mockRuns[id].summary_output = summary;
          mockRuns[id].completed_at = new Date();
          mockRuns[id].updated_at = new Date();
        }
        return { rows: [], rowCount: 1 };
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
      resourceId?: string
    ) => {
      loggedAudits.push({ projectId, actor, featureId, action, status, metadata, rationale, resourceId });
    };

    const service = new QualityGateService(mockQuery as any, mockLogAction as any);

    // Test 1: create quality gate run
    const run1 = await service.createRun({
      project_id: "proj-1",
      task_id: "task-1",
      feature_id: "KDEBT-009",
      run_by: "tester-j",
      metadata: { debug_mode: true }
    });
    assert("Run successfully created", !!run1.id);
    assert("Run status is pending initially", run1.status === QualityGateRunStatus.PENDING);
    assert("Run taskId mapped", run1.task_id === "task-1");
    assert("Run featureId mapped", run1.feature_id === "KDEBT-009");
    assert("Audited: run created event", loggedAudits.some(a => a.action === "QUALITY_GATE_RUN_CREATED" && a.resourceId === run1.id));

    // Test 2: Task scope validation
    let taskScopeBlocked = false;
    try {
      // task-2 belongs to proj-2, not proj-1!
      await service.createRun({
        project_id: "proj-1",
        task_id: "task-2",
        run_by: "hacker"
      });
    } catch (e: any) {
      if (e instanceof PermissionDeniedError) {
        taskScopeBlocked = true;
      }
    }
    assert("Task boundary enforcement blocks cross-project tasks", taskScopeBlocked);

    // Test 3: List runs by project/task
    const listProj = await service.listRuns("proj-1");
    assert("Can list runs by project", listProj.length === 1 && listProj[0].id === run1.id);

    const listTask = await service.listRuns("proj-1", "task-1");
    assert("Can list runs by task filter", listTask.length === 1);

    // Test 4: Start run
    const startedRun = await service.startRun("proj-1", run1.id, "task-1");
    assert("Status updated to running", startedRun.status === QualityGateRunStatus.RUNNING);
    assert("Audit: run started emitted", loggedAudits.some(a => a.action === "QUALITY_GATE_RUN_STARTED" && a.resourceId === run1.id));

    // Test 5: Ingest commands results checking redaction
    // Ingest lint result (success)
    const lintResult = await service.ingestCommandResult("proj-1", run1.id, {
      command_type: QualityGateCommandType.LINT,
      status: "passed",
      exit_code: 0,
      stdout: "Lint passed successfully. Absolute path /workspace/my-app/src/App.tsx",
      stderr: "",
      output_summary: "All 15 source files formatted",
      duration_ms: 250
    }, "task-1");
    assert("Lint result recorded", lintResult.status === "passed" && lintResult.exit_code === 0);
    assert("Output sanitization works on absolute local paths", lintResult.raw_output_redacted!.includes("./src/App.tsx"));

    // Ingest typecheck, build, test, secret_scan, debug_tags, db_status
    // Ingest Build result containing secret database credentials
    const buildResult = await service.ingestCommandResult("proj-1", run1.id, {
      command_type: QualityGateCommandType.BUILD,
      status: "passed",
      exit_code: 0,
      stdout: "Database migration completed using url postgres://user:" + "superSecretPassword" + "@db.supabase.com:5432/main",
      stderr: "",
      output_summary: "App bundled to dist/",
      duration_ms: 1200
    }, "task-1");
    console.log("DEBUG BUILD REDACTED:", buildResult.raw_output_redacted);
    assert("Build logs redact postgres configuration passwords", buildResult.raw_output_redacted!.includes("[REDACTED_PASSWORD]"));

    // Ingest test result containing secret api key / database urls
    const testResult = await service.ingestCommandResult("proj-1", run1.id, {
      command_type: QualityGateCommandType.TEST,
      status: "passed",
      exit_code: 0,
      stdout: "Executing tests with GEMINI_" + "API_KEY='123456789fafbcad000000' and database_url='postgres" + "ql://u:p" + "@host/db'",
      stderr: "",
      output_summary: "Tests completed successfully. 48 specs passed",
      duration_ms: 800
    }, "task-1");
    console.log("DEBUG TEST REDACTED:", testResult.raw_output_redacted);
    assert("Test logs redact GEMINI_API_KEY", testResult.raw_output_redacted!.includes("[REDACTED_API_KEY]") || testResult.raw_output_redacted!.includes("[REDACTED_SECRET]"));
    assert("Test logs redact database_url", testResult.raw_output_redacted!.includes("[REDACTED_DATABASE_URL]"));

    // Ingest secret_scan with warning
    const secretScan = await service.ingestCommandResult("proj-1", run1.id, {
      command_type: QualityGateCommandType.SECRET_SCAN,
      status: "warning",
      exit_code: 0,
      stdout: "Scanning for certificates... Warning: Found weak RSA key placeholder in developer.pem",
      stderr: "",
      output_summary: "Redacted scanner checks executed",
      duration_ms: 140
    }, "task-1");
    assert("Secret scan with warning status recorded", secretScan.status === "warning");

    // Ingest debug_tags and db_status
    await service.ingestCommandResult("proj-1", run1.id, {
      command_type: QualityGateCommandType.DEBUG_TAGS,
      status: "passed",
      exit_code: 0,
      stdout: "No QA-DEBUG tags found.",
      output_summary: "Check okay",
    }, "task-1");

    await service.ingestCommandResult("proj-1", run1.id, {
      command_type: QualityGateCommandType.DB_STATUS,
      status: "passed",
      exit_code: 0,
      stdout: "Schema match verified.",
      output_summary: "Check okay",
    }, "task-1");

    // Test 6: Aggregate warning status when all pass, but warning exists on secret_scan
    const warningCompletedRun = await service.completeRun("proj-1", run1.id, "task-1");
    assert("Combined status warning is aggregated correctly", warningCompletedRun.status === QualityGateRunStatus.WARNING);
    assert("Summary output compiles metrics", warningCompletedRun.summary_output!.includes("Warnings: 1"));

    // Test 7: Create a new run, ingest failure, and aggregate passed vs failed
    const run2 = await service.createRun({
      project_id: "proj-1",
      task_id: "task-1",
      feature_id: "KDEBT-009",
      run_by: "tester-j"
    });
    await service.startRun("proj-1", run2.id, "task-1");

    // Ingest unit tests that failed
    await service.ingestCommandResult("proj-1", run2.id, {
      command_type: QualityGateCommandType.TEST,
      status: "failed",
      exit_code: 1,
      stdout: "AssertionError: Expected 2 to equal 3",
      stderr: "Test runner exit code 1",
      output_summary: "Unit tests failed"
    }, "task-1");

    const failedCompletedRun = await service.completeRun("proj-1", run2.id, "task-1");
    assert("Final status is failed due to command test failure", failedCompletedRun.status === QualityGateRunStatus.FAILED);
    assert("Audit: QUALITY_GATE_RUN_FAILED emitted", loggedAudits.some(a => a.action === "QUALITY_GATE_RUN_FAILED" && a.resourceId === run2.id));

    // Test 8: Cancel run
    const run3 = await service.createRun({
      project_id: "proj-1",
      task_id: "task-1"
    });
    const cancelledRun = await service.cancelRun("proj-1", run3.id, "task-1");
    assert("Run cancelled status recorded", cancelledRun.status === QualityGateRunStatus.CANCELLED);
    assert("Audit: run cancelled emitted", loggedAudits.some(a => a.action === "QUALITY_GATE_RUN_CANCELLED" && a.resourceId === run3.id));

    // Test 9: Output truncation and certificate redaction checks
    // Certificate redaction
    const certRaw = `Connecting to cloud...\n-----BEGIN CERTIFICATE-----\nMIIFCzCCAvOgAwIBAgIQDFzUu8k2Cmq3Xo7uR8qT0TANBgkqhkiG9w0BAQsFADAy\n-----END CERTIFICATE-----\nSuccess!`;
    const certSanitized = sanitizeCommandOutput(certRaw);
    assert("Certificates are redacted cleanly", certSanitized.includes("[REDACTED_CERTIFICATE]"));
    assert("Certificates are fully replaced", !certSanitized.includes("MIIFCzCC"));

    // Output length truncation to keep last 100 lines
    let massiveOutput = "";
    for (let i = 1; i <= 250; i++) {
       massiveOutput += `Line ${i}: executing action...\n`;
    }
    const truncatedOutput = sanitizeCommandOutput(massiveOutput);
    const lines = truncatedOutput.split("\n");
    assert("Truncated output contains at most 101 lines (100 log lines + empty ending split)", lines.length <= 101);
    assert("Truncated output keeps the very end of the output stream", lines[lines.length - 2].includes("Line 250"));

    console.log("Part A Finished Successfully!");
    passed++;

  } catch (error: any) {
    console.error(`Part A failed: ${error.message}`);
    failed++;
  }

  // Final summary
  console.log("\n========================================================");
  console.log(`  STAGE 28 ACCREDITATION SUMMARY: Passed: ${assertionPassedCount}, Failed: ${assertionFailedCount}, Skipped: 0`);
  console.log("========================================================\n");

  if (assertionFailedCount > 0 || failed > 0) {
    process.exit(1);
  }
}

runStage28Tests().catch(err => {
  console.error("Unhanded rejection inside validation script:", err);
  process.exit(1);
});
