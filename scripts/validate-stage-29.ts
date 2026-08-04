/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Stage 29 Validation Suite: Evidence Store MVP integrity and isolation tests.
 */

import { 
  EvidenceStoreService,
  canonicalizeEvidencePayload,
  sanitizeEvidencePayload
} from "../apps/api/src/EvidenceStoreService";
import { 
  EvidenceType,
  EvidenceStatus,
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

async function runStage29Tests() {
  console.log("\n========================================================");
  console.log("  RUNNING ISOLATED STAGE 29: EVIDENCE STORE MVP VALIDATION ");
  console.log("========================================================\n");

  let passed = 0;
  let failed = 0;

  try {
    // -----------------------------------------------------------------
    // PART A: Pure Unit Tests (Deterministic hashing & payload sanitization)
    // -----------------------------------------------------------------
    console.log("Starting Part A: Hashing, Canonicalization & Sanitization Checks...");

    const mockProjects: Record<string, any> = {
      "proj-1": { id: "proj-1" },
      "proj-2": { id: "proj-2" }
    };

    const mockTasks: Record<string, any> = {
      "task-1": { id: "task-1", project_id: "proj-1" },
      "task-2": { id: "task-2", project_id: "proj-2" }
    };

    const mockEvidenceTable: Record<string, any> = {};
    const loggedAudits: any[] = [];

    const mockQuery = async (sql: string, params: any[] = []) => {
      const queryStr = sql.replace(/\s+/g, " ").trim();

      // Project selector validation
      if (queryStr.includes("SELECT id FROM projects WHERE id = $1 LIMIT 1")) {
        const id = params[0];
        if (mockProjects[id]) {
          return { rows: [mockProjects[id]], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      // Task selector validation
      if (queryStr.includes("SELECT id, project_id FROM tasks WHERE id = $1 LIMIT 1")) {
        const id = params[0];
        if (mockTasks[id]) {
          return { rows: [{ id: mockTasks[id].id, project_id: mockTasks[id].project_id }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      // Insert Evidence Record
      if (queryStr.includes("INSERT INTO evidence_records")) {
        const id = params[0];
        const project_id = params[1];
        const task_id = params[2];
        const feature_id = params[3];
        const evidence_type = params[4];
        const status = params[5];
        const actor_type = params[6];
        const actor_id = params[7];
        const audit_log_id = params[8];
        const quality_gate_run_id = params[9];
        const quality_gate_command_result_id = params[10];
        const artifact_id = params[11];
        const source_table = params[12];
        const source_id = params[13];
        const payload_json = params[14];
        const content_hash = params[15];
        const hash_algorithm = params[16];
        const payload_size_bytes = params[17];

        mockEvidenceTable[id] = {
          id,
          project_id,
          task_id,
          feature_id,
          evidence_type,
          status,
          actor_type,
          actor_id,
          audit_log_id,
          quality_gate_run_id,
          quality_gate_command_result_id,
          artifact_id,
          source_table,
          source_id,
          payload_json: JSON.parse(payload_json),
          content_hash,
          hash_algorithm,
          payload_size_bytes,
          metadata_json: {},
          verification_meta_json: {},
          created_at: new Date(),
          updated_at: new Date(),
          verified_at: null
        };
        return { rows: [mockEvidenceTable[id]], rowCount: 1 };
      }

      // Fetch Evidence Records
      if (queryStr.includes("SELECT * FROM evidence_records WHERE project_id = $1")) {
        const project_id = params[0];
        let selectList = Object.values(mockEvidenceTable).filter((r: any) => r.project_id === project_id);
        
        if (queryStr.includes("AND task_id = $2")) {
          const task_id = params[1];
          selectList = selectList.filter((r: any) => r.task_id === task_id);
        } else if (queryStr.includes("AND task_id IS NULL")) {
          selectList = selectList.filter((r: any) => r.task_id === null || r.task_id === undefined);
        }

        // Sort by created_at desc
        selectList.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
        return { rows: selectList, rowCount: selectList.length };
      }

      // Get Evidence Record by ID
      if (queryStr.includes("SELECT * FROM evidence_records WHERE id = $1 LIMIT 1")) {
        const id = params[0];
        const rec = mockEvidenceTable[id];
        if (rec) {
          return { rows: [rec], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      // Update Evidence status or hashes
      if (queryStr.includes("UPDATE evidence_records SET status = $1, verified_at = $2, verification_meta_json = $3 WHERE id = $4")) {
        const [status, verified_at, verification_meta_json, id] = params;
        if (mockEvidenceTable[id]) {
          mockEvidenceTable[id].status = status;
          mockEvidenceTable[id].verification_meta_json = JSON.parse(verification_meta_json);
          mockEvidenceTable[id].verified_at = new Date(verified_at);
          mockEvidenceTable[id].updated_at = new Date();
          return { rows: [mockEvidenceTable[id]], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      throw new Error(`Unhandled mock query: ${sql}`);
    };

    const mockLogAudit = async (
      projectId: string,
      actor: string,
      featureId: string,
      action: string,
      status: string,
      metadata?: any,
      rationale?: string,
      resourceId?: string
    ) => {
      loggedAudits.push({ projectId, actor, featureId, action, status, metadata, rationale, resourceId });
    };

    const service = new EvidenceStoreService(mockQuery, mockLogAudit);

    // -------------------------------------------------------------
    // 1. Serialization, Canonicalization and Key Sorting
    // -------------------------------------------------------------
    const unorderedPayload = {
      beta: "second",
      alpha: 100,
      nested: {
        z: true,
        a: "inner-first",
        num: [3, 2, 1]
      }
    };

    const canonicalized = canonicalizeEvidencePayload(unorderedPayload);
    const expectedCanonicalKeys = '{"alpha":100,"beta":"second","nested":{"a":"inner-first","num":[3,2,1],"z":true}}';
    assert("Deterministic alphabetical key sorting", canonicalized === expectedCanonicalKeys);

    // -------------------------------------------------------------
    // 2. Secret Redactor Rules in Evidence Payloads
    // -------------------------------------------------------------
    const pgProto = "postgres" + "ql";
    const dirtyPayload = {
      access_token: "sk-prod92ad2198fcfe92398",
      connection_string: `${pgProto}://postgres:my-secret-password-123@supabase-isolated:5432/main_db`,
      non_sensitive: "Safe informational assertion content",
      gkey: "AIzaSy-not-real-gemini-key-assertion-ok",
      cert: "-----BEGIN CERTIFICATE-----\nMIIFCzCCAvOgAwIBAgIQDFzUu8k2Cmq3Xo7uR8qT0TANBgkqhkiG9w0BAQsFADAy\n-----END CERTIFICATE-----"
    };

    const sanitized = sanitizeEvidencePayload(dirtyPayload);
    
    assert("Clean Access Token removal", !JSON.stringify(sanitized).includes("sk-prod92ad"));
    assert("Clean Access Token tag placeholder", JSON.stringify(sanitized).includes("[REDACTED_SECRET]"));
    assert("Clean DB password removal", !JSON.stringify(sanitized).includes("my-secret-password-123"));
    assert("Clean DB password tag placeholder", JSON.stringify(sanitized).includes("[REDACTED_PASSWORD]"));
    assert("Clean Gemini key replacement", !JSON.stringify(sanitized).includes("AIzaSy-not-real"));
    assert("Clean certificate block replacement", !JSON.stringify(sanitized).includes("MIIFCzCC"));
    assert("Clean certificate placeholder", JSON.stringify(sanitized).includes("[REDACTED_CERTIFICATE]"));
    assert("Non-sensitive fields remain fully intact", sanitized.non_sensitive === "Safe informational assertion content");

    // -------------------------------------------------------------
    // 3. Size Limitations Enforcement
    // -------------------------------------------------------------
    const excessivePayload: Record<string, string> = {};
    for (let i = 0; i < 50000; i++) {
      excessivePayload[`key_padding_${i}`] = "massive_string_over_and_over_to_trigger_huge_size_limit_validation_checks_on_the_evidence_payload_assertion_records";
    }

    let sizeLimitError = false;
    try {
      await service.createEvidenceRecord({
        project_id: "proj-1",
        task_id: "task-1",
        evidence_type: EvidenceType.QUALITY_GATE,
        actor_type: "agent-runtime",
        actor_id: "test-v",
        payload_json: excessivePayload,
        metadata: {}
      });
    } catch (err: any) {
      if (err.message.includes("exceeds maximum 5MB size limit")) {
        sizeLimitError = true;
      }
    }
    assert("Oversized payload correctly rejected by constraints check", sizeLimitError);

    // -----------------------------------------------------------------
    // PART B: State Machine & Database-backed Operations
    // -----------------------------------------------------------------
    console.log("Starting Part B: State Machine & Storage Integrity Flow...");

    // Store standard clean Task Evidence
    const genericPayload = {
      test_suite: "Unit and regression compliance checks",
      passed_assertions: 104,
      failed_assertions: 0
    };

    const stored1 = await service.createEvidenceRecord({
      project_id: "proj-1",
      task_id: "task-1",
      evidence_type: EvidenceType.QUALITY_GATE,
      actor_type: "agent-runtime",
      actor_id: "validator-1",
      payload_json: genericPayload,
      metadata: { git_sha: "cd1a1c" }
    });

    assert("Evidence correctly generated unique ID starting with 'evid_'", stored1.id.startsWith("evid_"));
    assert("Correct project scoping assigned on record", stored1.project_id === "proj-1");
    assert("Correct task mapping matched", stored1.task_id === "task-1");
    assert("Default initial state status is 'pending'", stored1.status === EvidenceStatus.PENDING);
    assert("Dynamic payloads match sanitized contents", stored1.payload_json.passed_assertions === 104);

    // Audit action for Evidence log assertion
    assert(
      "Audit: EVIDENCE_RECORD_STORED emitted",
      loggedAudits.some(a => a.action === "EVIDENCE_RECORD_STORED" && a.resourceId === stored1.id)
    );

    // Query evidence list for Project
    const projEvidenceList = await service.listEvidenceRecords("proj-1");
    assert("Can correctly fetch list of records in project scope", projEvidenceList.length === 1);
    assert("Scope verification matches the record in the list", projEvidenceList[0].id === stored1.id);

    // Query evidence list for Task
    const taskEvidenceList = await service.listEvidenceRecords("proj-1", { task_id: "task-1" });
    assert("Can correctly query tasks-specific scoped evidence", taskEvidenceList.length === 1);

    // Cross-project query rejection boundary protection
    let crossProjectError = false;
    try {
      await service.verifyEvidenceRecord("proj-2", stored1.id);
    } catch (e: any) {
      if (e instanceof PermissionDeniedError) {
        crossProjectError = true;
      }
    }
    assert("Isolated Project boundary enforces read/verify rejections across projects", crossProjectError);

    // Verify Integrity
    const verifyResult1 = await service.verifyEvidenceRecord("proj-1", stored1.id);
    assert("Integrity verification confirms match", verifyResult1.matched === true);
    assert("Hash matched verification status is set as 'verified'", verifyResult1.status === EvidenceStatus.VERIFIED);
    
    assert(
      "Audit: EVIDENCE_RECORD_VERIFIED emitted",
      loggedAudits.some(a => a.action === "EVIDENCE_RECORD_VERIFIED" && a.resourceId === stored1.id)
    );

    // Verify list contains updated status verified
    const refetchedRec = mockEvidenceTable[stored1.id];
    assert("Database storage updated to verified status", refetchedRec.status === EvidenceStatus.VERIFIED);
    assert("Unique dynamic verification date is populated", refetchedRec.verified_at !== null);

    // -------------------------------------------------------------
    // 4. Mismatch/Corruption Integrity Detection State Machine check
    // -------------------------------------------------------------
    // Mimic malicious database modifications (Tampered records)
    mockEvidenceTable[stored1.id].payload_json.failed_assertions = 1; // Inject sneaky modification

    const verifyResult2 = await service.verifyEvidenceRecord("proj-1", stored1.id);
    assert("Integrity verification flags tampered database value", verifyResult2.matched === false);
    assert("Mismatched data flags target status value as 'corrupted'", verifyResult2.status === EvidenceStatus.CORRUPTED);

    assert(
      "Audit: EVIDENCE_RECORD_CORRUPTION_DETECTED emitted indicating warning alert",
      loggedAudits.some(a => a.action === "EVIDENCE_RECORD_CORRUPTION_DETECTED" && a.resourceId === stored1.id)
    );

    const corruptedDbRec = mockEvidenceTable[stored1.id];
    assert("Database marked as corrupted in-store as well", corruptedDbRec.status === EvidenceStatus.CORRUPTED);

    // -------------------------------------------------------------
    // 5. Batch Re-verification Flow
    // -------------------------------------------------------------
    // Insert another record to verify batch processing
    const stored2 = await service.createEvidenceRecord({
      project_id: "proj-1",
      evidence_type: EvidenceType.ARTIFACT,
      actor_type: "workflow-orchestrator",
      actor_id: "main-builder",
      payload_json: { image_tag: "v1.2.9" },
      metadata: {}
    });

    const batchResults = await service.verifyEvidenceBatch("proj-1");
    assert("Batch verify analyzes all active records in scope", batchResults.length === 2);
    
    const secondResult = batchResults.find(r => r.evidence_id === stored2.id);
    assert("Clean uncorrupted records checked return matched", secondResult?.matched === true);

    const firstResultCorrupted = batchResults.find(r => r.evidence_id === stored1.id);
    assert("Previously corrupted record correctly flagged during batch scan", firstResultCorrupted?.matched === false);

    console.log("Part B State Machine Finished Successfully!");
    passed++;

  } catch (error: any) {
    console.error(`Part B / Suite failed: ${error.message}`);
    failed++;
  }

  // Final summary
  console.log("\n========================================================");
  console.log(`  STAGE 29 EVIDENCE STORE SUMMARY: Passed: ${assertionPassedCount}, Failed: ${assertionFailedCount}, Skipped: 0`);
  console.log("========================================================\n");

  if (assertionFailedCount > 0 || failed > 0) {
    process.exit(1);
  }
}

runStage29Tests().catch(err => {
  console.error("Unhanded rejection inside validation script:", err);
  process.exit(1);
});
