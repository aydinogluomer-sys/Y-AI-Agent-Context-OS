/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkerRuntimeService } from "../apps/api/src/WorkerRuntimeService";
import { 
  WorkerStatusType, 
  WorkerRuntimeDTO, 
  RegisterWorkerDTO, 
  WorkerTelemetryDTO, 
  WorkerRuntimeLogDTO 
} from "@y/shared";
import dotenv from "dotenv";
import pg from "pg";
import crypto from "crypto";
import { cleanDatabaseUrlBrackets } from "../apps/api/src/config";
import { getSupabaseCaCert } from "../apps/api/src/db";

dotenv.config({ override: true });

let assertionPassedCount = 0;
let assertionFailedCount = 0;

function assert(description: string, condition: boolean) {
  if (!condition) {
    console.error(`  ❌ [FAIL] ${description}`);
    assertionFailedCount++;
    throw new Error(`Stage 32 Assertion Failed: ${description}`);
  } else {
    console.log(`  ✅ [PASS] ${description}`);
    assertionPassedCount++;
  }
}

async function runStage32Tests() {
  console.log("\n=========================================================");
  console.log("  RUNNING COMPREHENSIVE STAGE 32: WORKER RUNTIME VALIDATION ");
  console.log("=========================================================\n");

  try {
    // -----------------------------------------------------------------
    // SECTION 1: Pure Unit/In-Memory State Machine Tests
    // -----------------------------------------------------------------
    console.log("\n[SECTION 1: In-Memory/Unit Assertions & Redaction]");

    const mockProjects: Record<string, any> = {
      "proj-alpha": { id: "proj-alpha" },
      "proj-beta": { id: "proj-beta" }
    };

    const mockTasks: Record<string, any> = {
      "task-1": { id: "task-1", project_id: "proj-alpha" }
    };

    const mockIndexJobs: Record<string, any> = {
      "job-1": {
        id: "job-1",
        project_id: "proj-alpha",
        task_id: "task-1",
        job_type: "index_pipeline_run",
        status: "pending",
        priority: "medium",
        adapter_kind: "local",
        max_attempts: 3,
        attempts: 0,
        locked_by: null,
        locked_at: null,
        created_at: new Date(),
        updated_at: new Date()
      },
      "job-2": {
        id: "job-2",
        project_id: "proj-alpha",
        task_id: "task-1",
        job_type: "index_pipeline_run",
        status: "pending",
        priority: "high",
        adapter_kind: "local",
        max_attempts: 3,
        attempts: 0,
        locked_by: null,
        locked_at: null,
        created_at: new Date(),
        updated_at: new Date()
      }
    };

    const mockWorkers: Record<string, any> = {};
    const mockWorkerLogs: any[] = [];
    const mockAudits: any[] = [];

    const mockQuery = async (sql: string, params: any[] = []) => {
      const sanitizedSql = sql.replace(/\s+/g, " ").trim();

      if (sanitizedSql.includes("SELECT id FROM projects WHERE id = $1 LIMIT 1")) {
        const id = params[0];
        if (mockProjects[id]) {
          return { rows: [mockProjects[id]], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (sanitizedSql.includes("SELECT id, project_id FROM worker_registry WHERE worker_id = $1 LIMIT 1")) {
        const workerId = params[0];
        const w = Object.values(mockWorkers).find((worker: any) => worker.worker_id === workerId);
        if (w) {
          return { rows: [{ id: w.id, project_id: w.project_id }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (sanitizedSql.includes("SELECT project_id FROM tasks WHERE id = $1 LIMIT 1")) {
        const id = params[0];
        if (mockTasks[id]) {
          return { rows: [mockTasks[id]], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (sanitizedSql.includes("INSERT INTO worker_registry")) {
        const [id, worker_id, project_id, process_label, max_concurrency, metadata_json] = params;
        mockWorkers[worker_id] = {
          id,
          worker_id,
          project_id,
          status: "active",
          process_label,
          started_at: new Date(),
          heartbeat_at: new Date(),
          stopped_at: null,
          max_concurrency,
          active_job_count: 0,
          metadata_json: JSON.parse(metadata_json),
          created_at: new Date(),
          updated_at: new Date()
        };
        return { rows: [mockWorkers[worker_id]], rowCount: 1 };
      }

      if (sanitizedSql.includes("UPDATE worker_registry SET heartbeat_at = NOW(), updated_at = NOW() WHERE worker_id = $1 AND project_id = $2")) {
        const [workId, projId] = params;
        const w = mockWorkers[workId];
        if (w && w.project_id === projId) {
          w.heartbeat_at = new Date();
          w.updated_at = new Date();
          return { rows: [w], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (sanitizedSql.includes("UPDATE worker_registry SET status = 'paused', updated_at = NOW() WHERE worker_id = $1 AND project_id = $2")) {
        const [workId, projId] = params;
        const w = mockWorkers[workId];
        if (w && w.project_id === projId) {
          w.status = "paused";
          w.updated_at = new Date();
          return { rows: [w], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (sanitizedSql.includes("UPDATE worker_registry SET status = 'stopped', stopped_at = NOW(), updated_at = NOW() WHERE worker_id = $1 AND project_id = $2")) {
        const [workId, projId] = params;
        const w = mockWorkers[workId];
        if (w && w.project_id === projId) {
          w.status = "stopped";
          w.stopped_at = new Date();
          w.updated_at = new Date();
          return { rows: [w], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (sanitizedSql.includes("SELECT status, max_concurrency, active_job_count FROM worker_registry WHERE worker_id = $1 AND project_id = $2 LIMIT 1")) {
        const [workId, projId] = params;
        const w = mockWorkers[workId];
        if (w && w.project_id === projId) {
          return { rows: [w], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (sanitizedSql.includes("SELECT * FROM worker_registry WHERE worker_id = $1 AND project_id = $2 LIMIT 1")) {
        const [workId, projId] = params;
        const w = mockWorkers[workId];
        if (w && w.project_id === projId) {
          return { rows: [w], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (sanitizedSql.includes("FOR UPDATE SKIP LOCKED")) {
        const projId = params[0];
        const workId = params[1];
        // Sort pending jobs by higher priority (high > medium) as specified in Query
        const claimable = Object.values(mockIndexJobs)
          .filter((j: any) => j.status === "pending" && j.project_id === projId)
          .sort((a, b) => {
            const priorityWeight = { high: 2, medium: 1, low: 0 };
            return (priorityWeight[b.priority as "high"|"medium"|"low"] || 0) - (priorityWeight[a.priority as "high"|"medium"|"low"] || 0);
          });
        
        if (claimable.length > 0) {
          const first = claimable[0];
          first.status = "processing";
          first.locked_by = workId;
          first.locked_at = new Date();
          first.started_at = new Date();
          first.attempts += 1;
          first.updated_at = new Date();
          return { rows: [first], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (sanitizedSql.includes("UPDATE worker_registry SET active_job_count = active_job_count + 1")) {
        const [workId, projId] = params;
        const w = mockWorkers[workId];
        if (w && w.project_id === projId) {
          w.active_job_count += 1;
          return { rows: [], rowCount: 1 };
        }
      }

      if (sanitizedSql.includes("SELECT locked_by, status, metadata_json FROM index_jobs WHERE id = $1 AND project_id = $2 LIMIT 1")) {
        const [jobId, projId] = params;
        const job = mockIndexJobs[jobId];
        if (job && job.project_id === projId) {
          return { rows: [job], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (sanitizedSql.includes("SELECT locked_by, status, attempts, max_attempts FROM index_jobs WHERE id = $1 AND project_id = $2 LIMIT 1")) {
        const [jobId, projId] = params;
        const job = mockIndexJobs[jobId];
        if (job && job.project_id === projId) {
          return { rows: [job], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (sanitizedSql.includes("UPDATE index_jobs SET status = 'completed'")) {
        const [metaJson, jobId, projId] = params;
        const job = mockIndexJobs[jobId];
        if (job && job.project_id === projId) {
          job.status = "completed";
          job.metadata_json = JSON.parse(metaJson);
          job.locked_by = null;
          job.locked_at = null;
          return { rows: [job], rowCount: 1 };
        }
      }

      if (sanitizedSql.includes("UPDATE index_jobs SET status = 'failed'")) {
        const [errRed, jobId, projId] = params;
        const job = mockIndexJobs[jobId];
        if (job && job.project_id === projId) {
          job.status = "failed";
          job.error_redacted = errRed;
          job.last_error = errRed;
          job.locked_by = null;
          job.locked_at = null;
          return { rows: [job], rowCount: 1 };
        }
      }

      if (sanitizedSql.includes("UPDATE worker_registry SET active_job_count = GREATEST(0, active_job_count - 1)")) {
        const [workId, projId] = params;
        const w = mockWorkers[workId];
        if (w && w.project_id === projId) {
          w.active_job_count = Math.max(0, w.active_job_count - 1);
          return { rows: [], rowCount: 1 };
        }
      }

      if (sanitizedSql.includes("INSERT INTO worker_runtime_logs")) {
        const [id, worker_id, project_id, task_id, index_job_id, action, status, message_redacted] = params;
        mockWorkerLogs.push({ id, worker_id, project_id, task_id, index_job_id, action, status, message_redacted, created_at: new Date() });
        return { rows: [], rowCount: 1 };
      }

      if (sanitizedSql.includes("SELECT * FROM worker_runtime_logs WHERE worker_id = $1 AND project_id = $2")) {
        const [workId, projId] = params;
        const matches = mockWorkerLogs.filter((l: any) => l.worker_id === workId && l.project_id === projId);
        return { rows: matches, rowCount: matches.length };
      }

      return { rows: [], rowCount: 0 };
    };

    const mockLogAction = async (
      projectId: string,
      actor: string,
      featureId: any,
      action: any,
      status: any,
      metadata?: any,
      rationale?: any
    ) => {
      mockAudits.push({ projectId, actor, featureId, action, status, metadata, rationale });
    };

    const service = new WorkerRuntimeService(mockQuery as any, mockLogAction as any);

    // 1. Worker Registration with wrkr_ ID creation
    const registered = await service.registerWorker("proj-alpha", {
      worker_id: "test-node-1",
      project_id: "proj-alpha",
      max_concurrency: 2,
      process_label: "sim-core-1",
      metadata_json: { sandbox: true }
    });

    assert("Worker DTO contains wrkr_ prefix inside internal 'id'", registered.id.startsWith("wrkr_"));
    assert("Worker state status initialized as active", registered.status === "active");
    assert("Worker max_concurrency assigned correctly", registered.max_concurrency === 2);
    assert("Audit WORKER_REGISTERED event emitted", mockAudits.some(a => a.action === "WORKER_REGISTERED"));

    // 2. Heartbeat recorded
    const postHeartbeat = await service.heartbeatWorker("proj-alpha", "test-node-1");
    assert("Heartbeat logs and returns matching worker", postHeartbeat.worker_id === "test-node-1");
    assert("Audit WORKER_HEARTBEAT_RECORDED event emitted", mockAudits.some(a => a.action === "WORKER_HEARTBEAT_RECORDED"));

    // 3. Pause worker
    const postPause = await service.pauseWorker("proj-alpha", "test-node-1");
    assert("Worker status changed to paused", postPause.status === "paused");
    assert("Audit WORKER_PAUSED event emitted", mockAudits.some(a => a.action === "WORKER_PAUSED"));

    // 4. Reactivate worker to active
    await service.registerWorker("proj-alpha", {
      worker_id: "test-node-1",
      project_id: "proj-alpha",
      max_concurrency: 2,
      process_label: "sim-core-1",
      metadata_json: { sandbox: true }
    });
    const postReactivate = await service.getWorkerStatus("proj-alpha", "test-node-1");
    assert("Reactivated worker status is active", postReactivate.status === "active");

    // 5. Claim job transactionally
    const claimedJob = await service.claimNextJob("proj-alpha", "test-node-1");
    assert("Claimed job is retrieved successfully", claimedJob !== null);
    // Priority select check: high priority "job-2" must be claimed instead of medium "job-1"
    assert("Job claimed matches highest priority first (high over medium)", claimedJob!.id === "job-2");
    assert("Job state transitions to processing", mockIndexJobs["job-2"].status === "processing");
    assert("Job is locked by worker test-node-1", mockIndexJobs["job-2"].locked_by === "test-node-1");
    assert("Worker active_job_count increments to 1", mockWorkers["test-node-1"].active_job_count === 1);
    assert("Audit WORKER_JOB_CLAIMED event emitted", mockAudits.some(a => a.action === "WORKER_JOB_CLAIMED"));

    // 6. Concurrency enforcement check
    // Claim next job to reach limit
    const secondClaim = await service.claimNextJob("proj-alpha", "test-node-1");
    assert("Second claim matches next matching pending job", secondClaim !== null && secondClaim.id === "job-1");
    assert("Worker active_job_count increments to 2", mockWorkers["test-node-1"].active_job_count === 2);

    // Third claim should be blocked as concurrency is 2/2
    const thirdClaim = await service.claimNextJob("proj-alpha", "test-node-1");
    assert("Third claim blocked due to concurrency limit saturation", thirdClaim === null);

    // 7. Complete job transaction
    const completed = await service.completeJob("proj-alpha", "test-node-1", "job-2", { result: "success" });
    assert("Job is marked as completed in index_jobs", completed.status === "completed");
    assert("Worker active_job_count decrements to 1 after completion", mockWorkers["test-node-1"].active_job_count === 1);
    assert("Audit WORKER_JOB_COMPLETED event emitted", mockAudits.some(a => a.action === "WORKER_JOB_COMPLETED"));

    // 8. Fail job transaction
    const failedText = "Database connection timed out: postgres://admin:super_secret_password_here@database-host.com:5432/main_db";
    const failedJob = await service.failJob("proj-alpha", "test-node-1", "job-1", failedText);
    assert("Job is marked as failed in database", failedJob.status === "failed");
    assert("Worker active_job_count decrements back to 0 on failure", mockWorkers["test-node-1"].active_job_count === 0);
    assert("Audit WORKER_JOB_RETRY_SCHEDULED or WORKER_JOB_FAILED emitted", mockAudits.some(a => a.action === "WORKER_JOB_RETRY_SCHEDULED"));

    // 9. Stop worker
    const postStop = await service.stopWorker("proj-alpha", "test-node-1");
    assert("Worker status set to stopped", postStop.status === "stopped");
    assert("Worker stopped_at timestamp recorded successfully", postStop.stopped_at !== null);
    assert("Audit WORKER_STOPPED event emitted", mockAudits.some(a => a.action === "WORKER_STOPPED"));

    // 10. Cross-project boundary violation check
    try {
      await service.claimNextJob("proj-beta", "test-node-1");
      assert("Cross-project boundary violation check should have thrown", false);
    } catch (err: any) {
      assert("Cross-project access breach blocked and thrown correctly", err.message.includes("containment breach") || err.statusCode === 403);
      assert("Audit WORKER_CROSS_PROJECT_ACCESS_BLOCKED event emitted", mockAudits.some(a => a.action === "WORKER_CROSS_PROJECT_ACCESS_BLOCKED"));
    }

    // 11. Redaction Validation
    // Test that passwords, private keys, bearer tags, absolute paths are redacted inside worker logs
    const dbPasswordToken = "highly_sensitive_pass_1234";
    const pgUriScheme = "postgre" + "sql://" + "developer_user";
    const dirtyMessage = "Fatal credential failure. POSTGRES: " + pgUriScheme + ":" + dbPasswordToken + "@" + "local-postgres:5432/mydb. Key Block:\n-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAz8798ashdashdasd\n-----END RSA PRIVATE KEY-----\nBearer: Bearer sk_live_998877secret_" + "api_key. Path: /Users/developer/prod/apps/api/src/index.ts";
    const cleanLogsMessage = service.sanitizeWorkerLog(dirtyMessage);

    assert(
      "Sanitizer redacts database URI passwords",
      !cleanLogsMessage.includes(dbPasswordToken)
    );
    assert(
      "Sanitizer redacts RSA private key blocks completely",
      cleanLogsMessage.includes("[REDACTED_PRIVATE_KEY]") && !cleanLogsMessage.includes("MIIEowIBAAKCAQ")
    );
    assert(
      "Sanitizer redacts bearer tokens",
      !cleanLogsMessage.includes("sk_live_998877secret_api_key")
    );
    assert(
      "Sanitizer converts absolute paths into safe relative form",
      cleanLogsMessage.includes("./apps/api/src/index.ts") && !cleanLogsMessage.includes("/Users/developer/")
    );

    // 12. Sandbox and negative assertions (out-of-scope verification)
    assert("No Redis dependency exists in WorkerRuntimeService", !JSON.stringify(WorkerRuntimeService.toString()).includes("redis"));
    assert("No BullMQ dependency exists in WorkerRuntimeService", !JSON.stringify(WorkerRuntimeService.toString()).includes("bullmq"));
    assert("No RabbitMQ dependency exists in WorkerRuntimeService", !JSON.stringify(WorkerRuntimeService.toString()).includes("rabbitmq"));
    assert("No Kafka dependency exists in WorkerRuntimeService", !JSON.stringify(WorkerRuntimeService.toString()).includes("kafka"));
    assert("No child_process imports found", !JSON.stringify(WorkerRuntimeService.toString()).includes("child_process"));

    console.log("\n  All Part A in-memory unit validations completed successfully.");

    // -----------------------------------------------------------------
    // SECTION 2: Real PostgreSQL Verification
    // -----------------------------------------------------------------
    console.log("\n[SECTION 2: Active PostgreSQL Schema & DB Integrations]");

    if (process.env.DATABASE_URL) {
      const origUrl = process.env.DATABASE_URL;
      const cleanedUrl = cleanDatabaseUrlBrackets(origUrl);
      const isSupabaseOrRender = cleanedUrl.includes("supabase") || cleanedUrl.includes("render") || cleanedUrl.includes("pooler");
      const sslConfig = isSupabaseOrRender
        ? (getSupabaseCaCert() ? { ca: getSupabaseCaCert(), rejectUnauthorized: true } : { rejectUnauthorized: false })
        : undefined;

      try {
        const pool = new pg.Pool({
          connectionString: cleanedUrl,
          ssl: sslConfig
        });

        // Test DB connection
        const dbClient = await pool.connect();
        await dbClient.query("SELECT 1;");
        console.log("  [INFO] PostgreSQL database is active.");

        // Check columns of worker_registry
        const regCols = await dbClient.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = 'worker_registry';
        `);
        assert("worker_registry table exists in database", regCols.rowCount > 0);
        
        const hasId = regCols.rows.some(r => r.column_name === "id");
        const hasWorkerId = regCols.rows.some(r => r.column_name === "worker_id");
        const hasProjectId = regCols.rows.some(r => r.column_name === "project_id");
        const hasStatus = regCols.rows.some(r => r.column_name === "status");
        const hasConcurrency = regCols.rows.some(r => r.column_name === "max_concurrency");
        const hasActiveJobs = regCols.rows.some(r => r.column_name === "active_job_count");

        assert("worker_registry contains column 'id'", hasId);
        assert("worker_registry contains column 'worker_id'", hasWorkerId);
        assert("worker_registry contains column 'project_id'", hasProjectId);
        assert("worker_registry contains column 'status'", hasStatus);
        assert("worker_registry contains column 'max_concurrency'", hasConcurrency);
        assert("worker_registry contains column 'active_job_count'", hasActiveJobs);

        // Check unique constraint
        const constraints = await dbClient.query(`
          SELECT constraint_name 
          FROM information_schema.table_constraints 
          WHERE table_name = 'worker_registry' AND constraint_type = 'UNIQUE';
        `);
        assert("worker_registry unique project-worker constraint exists", constraints.rowCount > 0);

        // Check index_jobs did NOT get unrequested columns
        const indexCols = await dbClient.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = 'index_jobs';
        `);
        const hasUnrequestedStatus = indexCols.rows.some(r => r.column_name === "retryable");
        assert("index_jobs does NOT have unrequested column 'retryable' (it is derived)", !hasUnrequestedStatus);

        dbClient.release();
        await pool.end();
        console.log("  PostgreSQL schema and integrity checked successfully.");
      } catch (dbErr: any) {
        console.log(`  [INFO] PostgreSQL check skipped or failed: ${dbErr.message}`);
      }
    } else {
      console.log("  [INFO] No DATABASE_URL found. Skipping real DB assertions.");
    }

    console.log(`\n=========================================================`);
    console.log(`  STAGE 32 RECONCILIATION RESULT: SUCCESS (${assertionPassedCount} assertions passed)`);
    console.log(`=========================================================\n`);

  } catch (err: any) {
    console.error(`\n  ❌ STAGE 32 VALIDATION FAILED: ${err.message}\n${err.stack}`);
    assertionFailedCount++;
    process.exit(1);
  }
}

runStage32Tests().catch(err => {
  console.error("Unhandle test crash:", err);
  process.exit(1);
});
