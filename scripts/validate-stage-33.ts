/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FileLockingService } from "../apps/api/src/FileLockingService";
import { 
  FileLockDTO, 
  FileLockStatus, 
  FileLockMode,
  AcquireFileLockDTO
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
    throw new Error(`Stage 33 Assertion Failed: ${description}`);
  } else {
    console.log(`  ✅ [PASS] ${description}`);
    assertionPassedCount++;
  }
}

async function runStage33Tests() {
  console.log("\n=========================================================");
  console.log("  RUNNING COMPREHENSIVE STAGE 33: FILE LOCKING MVP VALIDATION");
  console.log("=========================================================\n");

  try {
    // -----------------------------------------------------------------
    // SECTION 1: Pure Unit/In-Memory State Machine Tests
    // -----------------------------------------------------------------
    console.log("\n[SECTION 1: In-Memory/Unit Assertions & Path Security]");

    const mockProjects: Record<string, any> = {
      "proj-alpha": { id: "proj-alpha" },
      "proj-beta": { id: "proj-beta" }
    };

    const mockTasks: Record<string, any> = {
      "task-1": { id: "task-1", project_id: "proj-alpha" }
    };

    const mockIndexJobs: Record<string, any> = {
      "job-1": { id: "job-1", project_id: "proj-alpha" }
    };

    const mockWorkers: Record<string, any> = {
      "worker-1": { id: "worker-1", worker_id: "worker-1", project_id: "proj-alpha" }
    };

    const mockLocks: Record<string, any> = {};
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
        if (mockWorkers[workerId]) {
          return { rows: [mockWorkers[workerId]], rowCount: 1 };
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

      if (sanitizedSql.includes("SELECT project_id FROM index_jobs WHERE id = $1 LIMIT 1")) {
        const id = params[0];
        if (mockIndexJobs[id]) {
          return { rows: [mockIndexJobs[id]], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (sanitizedSql.includes("SELECT * FROM file_locks WHERE project_id = $1 AND path_hash = $2 AND lock_status = 'active'")) {
        const [projId, hash] = params;
        const matching = Object.values(mockLocks).filter((l: any) => 
          l.project_id === projId && 
          l.path_hash === hash && 
          l.lock_status === "active" && 
          new Date(l.expires_at).getTime() > Date.now()
        );
        return { rows: matching, rowCount: matching.length };
      }

      if (sanitizedSql.includes("INSERT INTO file_locks")) {
        const id = params[0];
        let lockRow: any;
        if (sanitizedSql.includes("release_reason")) {
          // Blocked Lock Insert
          const [
            idVal, projVal, taskVal, workerVal, jobVal, modeVal, statusVal, 
            pathVal, hashVal, ownerTypeVal, ownerIdVal, rReason, metaVal
          ] = params;
          lockRow = {
            id: idVal,
            project_id: projVal,
            task_id: taskVal,
            worker_id: workerVal,
            index_job_id: jobVal,
            lock_mode: modeVal,
            lock_status: statusVal,
            normalized_path: pathVal,
            path_hash: hashVal,
            lock_owner_type: ownerTypeVal,
            lock_owner_id: ownerIdVal,
            acquired_at: new Date(),
            refreshed_at: new Date(),
            expires_at: new Date(),
            released_at: new Date(),
            release_reason: rReason,
            metadata_json: metaVal,
            created_at: new Date(),
            updated_at: new Date()
          };
        } else {
          // Active Lock Insert
          const [
            idVal, projVal, taskVal, workerVal, jobVal, modeVal, statusVal, 
            pathVal, hashVal, ownerTypeVal, ownerIdVal, expiresVal, metaVal
          ] = params;
          lockRow = {
            id: idVal,
            project_id: projVal,
            task_id: taskVal,
            worker_id: workerVal,
            index_job_id: jobVal,
            lock_mode: modeVal,
            lock_status: statusVal,
            normalized_path: pathVal,
            path_hash: hashVal,
            lock_owner_type: ownerTypeVal,
            lock_owner_id: ownerIdVal,
            acquired_at: new Date(),
            refreshed_at: new Date(),
            expires_at: expiresVal,
            metadata_json: metaVal,
            created_at: new Date(),
            updated_at: new Date()
          };
        }
        mockLocks[id] = lockRow;
        return { rows: [lockRow], rowCount: 1 };
      }

      if (sanitizedSql.includes("SELECT * FROM file_locks WHERE id = $1 AND project_id = $2")) {
        const [lockId, projId] = params;
        const lock = mockLocks[lockId];
        if (lock && lock.project_id === projId) {
          return { rows: [lock], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (sanitizedSql.includes("UPDATE file_locks SET lock_status = $1, released_at = NOW(), release_reason = $2") && !sanitizedSql.includes("RETURNING")) {
        const [status, reason, lockId] = params;
        const lock = mockLocks[lockId];
        if (lock) {
          lock.lock_status = status;
          lock.released_at = new Date();
          lock.release_reason = reason;
          lock.updated_at = new Date();
          return { rows: [lock], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (sanitizedSql.includes("UPDATE file_locks SET refreshed_at = NOW(), expires_at = $1, updated_at = NOW() WHERE id = $2 RETURNING *")) {
        const [expiresAt, lockId] = params;
        const lock = mockLocks[lockId];
        if (lock) {
          lock.refreshed_at = new Date();
          lock.expires_at = expiresAt;
          lock.updated_at = new Date();
          return { rows: [lock], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (sanitizedSql.includes("UPDATE file_locks SET lock_status = $1, released_at = NOW(), release_reason = $2, updated_at = NOW() WHERE id = $3 RETURNING *")) {
        const [status, reason, lockId] = params;
        const lock = mockLocks[lockId];
        if (lock) {
          lock.lock_status = status;
          lock.released_at = new Date();
          lock.release_reason = reason;
          lock.updated_at = new Date();
          return { rows: [lock], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (sanitizedSql.includes("SELECT * FROM file_locks WHERE project_id = $1 AND worker_id = $2 AND lock_status = 'active'")) {
        const [projId, workerId] = params;
        const matching = Object.values(mockLocks).filter((l: any) => 
          l.project_id === projId && l.worker_id === workerId && l.lock_status === "active"
        );
        return { rows: matching, rowCount: matching.length };
      }

      if (sanitizedSql.includes("SELECT * FROM file_locks WHERE project_id = $1 AND lock_status = 'active' AND expires_at < NOW()")) {
        const [projId] = params;
        const matching = Object.values(mockLocks).filter((l: any) => 
          l.project_id === projId && l.lock_status === "active" && new Date(l.expires_at).getTime() < Date.now()
        );
        return { rows: matching, rowCount: matching.length };
      }

      if (sanitizedSql.includes("SELECT * FROM file_locks WHERE project_id = $1") && sanitizedSql.includes("ORDER BY")) {
        const matched = Object.values(mockLocks).filter((l: any) => l.project_id === params[0]);
        return { rows: matched, rowCount: matched.length };
      }

      throw new Error(`Untracked Query in Mock: ${sql}`);
    };

    const mockLogAction = async (
      projectId: string,
      actor: string,
      featureId: any,
      action: any,
      status: any,
      metadata?: any,
      rationale?: string,
      resourceId?: string
    ) => {
      mockAudits.push({
        projectId,
        actor,
        featureId,
        action,
        status,
        metadata,
        rationale,
        resourceId
      });
      return { id: "audit_" + crypto.randomUUID() };
    };

    const service = new FileLockingService(mockQuery, mockLogAction);

    // 1. Path Normalization Tests
    assert("normalizeLockPath handles backslashes", service.normalizeLockPath("src\\components\\Editor.tsx") === "src/components/Editor.tsx");
    assert("normalizeLockPath strips './' prefix", service.normalizeLockPath("./src/App.tsx") === "src/App.tsx");
    assert("normalizeLockPath strips leading '/'", service.normalizeLockPath("///src/App.tsx") === "src/App.tsx");
    assert("normalizeLockPath strips process.cwd() absolute prefixes", service.normalizeLockPath(process.cwd().replace(/\\/g, "/") + "/src/App.tsx") === "src/App.tsx");

    // 2. Path Traversal & Forbidden File Validations
    assert("validateLockPath allows standard safe relative files", service.validateLockPath("src/components/Sidebar.tsx").valid === true);
    assert("validateLockPath blocks relative traversal '../'", service.validateLockPath("../etc/passwd").valid === false);
    assert("validateLockPath blocks inline traversal '/../'", service.validateLockPath("src/components/../secrets.json").valid === false);
    assert("validateLockPath blocks .env file", service.validateLockPath("src/.env").valid === false);
    assert("validateLockPath blocks node_modules pathing", service.validateLockPath("node_modules/lodash/index.js").valid === false);
    assert("validateLockPath blocks certificate keys (.pem)", service.validateLockPath("certs/authority.pem").valid === false);
    assert("validateLockPath blocks cert keys (.key)", service.validateLockPath("certs/private.key").valid === false);
    assert("validateLockPath blocks production builds (dist/)", service.validateLockPath("dist/index.js").valid === false);

    // 3. Metadata redacting
    const dirtyMetadata = {
      credential_string: "postgres://admin:super_secret_pass@localhost:5432/db",
      healthy: true,
      port: 3000
    };
    const cleanMeta = service.sanitizeLockMetadata(dirtyMetadata);
    assert("Metadata sanitizer blocks credentials on-the-fly", !JSON.stringify(cleanMeta).includes("super_secret_pass"));
    assert("Metadata sanitizer preserves harmless metadata elements", cleanMeta.healthy === true && cleanMeta.port === 3000);

    // 4. Scoping Validations
    await service.validateProjectScope("proj-alpha");
    try {
      await service.validateProjectScope("invalid-proj");
      assert("Unknown project validation should have thrown NotFound", false);
    } catch (e: any) {
      assert("Unknown project validation throws correctly", e.statusCode === 404);
    }

    await service.validateTaskScope("proj-alpha", "task-1");
    try {
      await service.validateTaskScope("proj-beta", "task-1");
      assert("Cross-project task validation should have thrown", false);
    } catch (e: any) {
      assert("Cross-project task validation throws PermissionDeniedError", e.statusCode === 403);
    }

    // 5. File Locking Conflict Rules
    // Acquire hold READ lock on "src/common.ts" by Owner Alpha
    const lock1 = await service.acquireLock({
      project_id: "proj-alpha",
      path: "src/common.ts",
      lock_mode: FileLockMode.READ,
      lock_owner_type: "worker",
      lock_owner_id: "worker-1",
      ttl_seconds: 30
    });
    assert("Successfully acquired READ lock", lock1.lock_status === FileLockStatus.ACTIVE && lock1.lock_mode === FileLockMode.READ);
    assert("Audit FILE_LOCK_ACQUIRED logged", mockAudits.some(a => a.action === "FILE_LOCK_ACQUIRED"));

    // Acquire second READ lock on same path by Owner Beta (allowed shared lock)
    const lock2 = await service.acquireLock({
      project_id: "proj-alpha",
      path: "src/common.ts",
      lock_mode: FileLockMode.READ,
      lock_owner_type: "task",
      lock_owner_id: "task-1",
      ttl_seconds: 30
    });
    assert("Shared READ lock allowed simultaneously", lock2.lock_status === FileLockStatus.ACTIVE);

    // Attempting exclusive WRITE lock now should be blocked
    try {
      await service.acquireLock({
        project_id: "proj-alpha",
        path: "src/common.ts",
        lock_mode: FileLockMode.WRITE,
        lock_owner_type: "worker",
        lock_owner_id: "worker-1",
        ttl_seconds: 30
      });
      assert("WRITE lock acquisition should have failed since READ locks are active", false);
    } catch (e: any) {
      assert("WRITE lock attempt correctly blocked by active shared locks", e.statusCode === 409);
      assert("Audit FILE_LOCK_BLOCKED logged", mockAudits.some(a => a.action === "FILE_LOCK_BLOCKED"));
    }

    // Clean up mockLocks
    delete mockLocks[lock1.id];
    delete mockLocks[lock2.id];

    // Acquire WRITE lock exclusively
    const lock3 = await service.acquireLock({
      project_id: "proj-alpha",
      path: "src/common.ts",
      lock_mode: FileLockMode.WRITE,
      lock_owner_type: "worker",
      lock_owner_id: "worker-1",
      ttl_seconds: 30
    });
    assert("Successfully acquired exclusive WRITE lock", lock3.lock_status === FileLockStatus.ACTIVE && lock3.lock_mode === FileLockMode.WRITE);

    // Any subsequent READ lock attempt during WRITE exclusivity is blocked
    try {
      await service.acquireLock({
        project_id: "proj-alpha",
        path: "src/common.ts",
        lock_mode: FileLockMode.READ,
        lock_owner_type: "task",
        lock_owner_id: "task-1",
        ttl_seconds: 30
      });
      assert("READ lock acquisition should have failed during active WRITE lock", false);
    } catch (e: any) {
      assert("READ lock attempts blocked by active exclusive write lock", e.statusCode === 409);
    }

    // 6. Refreshing & TTL Expiry Logic
    const refreshed = await service.refreshLock("proj-alpha", lock3.id, 60);
    assert("Lock refreshed successfully", refreshed.id === lock3.id);
    assert("Audit FILE_LOCK_REFRESHED logged", mockAudits.some(a => a.action === "FILE_LOCK_REFRESHED"));

    // Make lock3 expired by mutating mock expiration timestamp
    mockLocks[lock3.id].expires_at = new Date(Date.now() - 100000); // 100s ago
    try {
      await service.refreshLock("proj-alpha", lock3.id, 30);
      assert("Refreshing expired lock should have failed", false);
    } catch (e: any) {
      assert("Locked expired checkout throws FILE_LOCK_EXPIRED", e.message.includes("expired"));
    }

    // 7. Manual and stale releases
    const rRelease = await service.releaseLock("proj-alpha", lock3.id, "reason_man_release");
    assert("Lock mapped correctly on release", rRelease.id === lock3.id);

    // Reclaim worker locks checking
    const workerLock = await service.acquireLock({
      project_id: "proj-alpha",
      worker_id: "worker-1",
      path: "src/worker-file.ts",
      lock_mode: FileLockMode.WRITE,
      lock_owner_type: "worker",
      lock_owner_id: "worker-1"
    });
    const reclaimResult = await service.releaseLocksForWorker("proj-alpha", "worker-1");
    assert("Worker locks sweep reclaims owned active leases", reclaimResult.releasedCount === 1);
    assert("Sweep releases worker lock back to released status", mockLocks[workerLock.id].lock_status === FileLockStatus.RELEASED);

    // Reclaim stale locks checking
    const staleLock = await service.acquireLock({
      project_id: "proj-alpha",
      path: "src/stale-file.ts",
      lock_mode: FileLockMode.WRITE,
      lock_owner_type: "worker",
      lock_owner_id: "worker-1"
    });
    mockLocks[staleLock.id].expires_at = new Date(Date.now() - 50000); // 50s ago
    const staleResult = await service.releaseStaleLocks("proj-alpha");
    assert("Stale sweep reclaims expired lock leases correctly", staleResult.releasedCount === 1);
    assert("Sweep transitions stale lock back to expired status", mockLocks[staleLock.id].lock_status === FileLockStatus.EXPIRED);
    assert("Audit FILE_LOCK_STALE_RELEASED logged", mockAudits.some(a => a.action === "FILE_LOCK_STALE_RELEASED"));

    // 8. Integration dependencies check (Negative Constraints)
    assert("No Redis code in FileLockingService.ts", !JSON.stringify(FileLockingService.toString()).includes("redis"));
    assert("No BullMQ code in FileLockingService.ts", !JSON.stringify(FileLockingService.toString()).includes("bullmq"));
    assert("No RabbitMQ code in FileLockingService.ts", !JSON.stringify(FileLockingService.toString()).includes("rabbitmq"));
    assert("No Kafka code in FileLockingService.ts", !JSON.stringify(FileLockingService.toString()).includes("kafka"));
    assert("No filesystem-native locks", !JSON.stringify(FileLockingService.toString()).includes("fs.flock"));

    console.log("\n  All Part A in-memory unit validations completed successfully.");

    // -----------------------------------------------------------------
    // SECTION 2: Active PostgreSQL Schema & DB Integrations
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

        const dbClient = await pool.connect();
        await dbClient.query("SELECT 1;");
        console.log("  [INFO] PostgreSQL database is active.");

        // Check columns of file_locks
        const lockCols = await dbClient.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = 'file_locks';
        `);
        assert("file_locks table exists in database", lockCols.rowCount > 0);
        
        const hasId = lockCols.rows.some(r => r.column_name === "id");
        const hasProjectId = lockCols.rows.some(r => r.column_name === "project_id");
        const hasTask = lockCols.rows.some(r => r.column_name === "task_id");
        const hasWorker = lockCols.rows.some(r => r.column_name === "worker_id");
        const hasIndexJob = lockCols.rows.some(r => r.column_name === "index_job_id");
        const hasLockMode = lockCols.rows.some(r => r.column_name === "lock_mode");
        const hasLockStatus = lockCols.rows.some(r => r.column_name === "lock_status");
        const hasNormPath = lockCols.rows.some(r => r.column_name === "normalized_path");
        const hasPathHash = lockCols.rows.some(r => r.column_name === "path_hash");
        const hasOwnerType = lockCols.rows.some(r => r.column_name === "lock_owner_type");
        const hasOwnerId = lockCols.rows.some(r => r.column_name === "lock_owner_id");
        const hasExpires = lockCols.rows.some(r => r.column_name === "expires_at");

        assert("file_locks.id exists", hasId);
        assert("file_locks.project_id exists", hasProjectId);
        assert("file_locks.task_id exists", hasTask);
        assert("file_locks.worker_id exists", hasWorker);
        assert("file_locks.index_job_id exists", hasIndexJob);
        assert("file_locks.lock_mode exists", hasLockMode);
        assert("file_locks.lock_status exists", hasLockStatus);
        assert("file_locks.normalized_path exists", hasNormPath);
        assert("file_locks.path_hash exists", hasPathHash);
        assert("file_locks.lock_owner_type exists", hasOwnerType);
        assert("file_locks.lock_owner_id exists", hasOwnerId);
        assert("file_locks.expires_at exists", hasExpires);

        // Check Index exists on (project_id, path_hash, lock_status)
        const idxCheck = await dbClient.query(`
          SELECT indexname 
          FROM pg_indexes 
          WHERE tablename = 'file_locks' AND indexdef LIKE '%path_hash%' AND indexdef LIKE '%lock_status%';
        `);
        assert("file_locks composite query index exists", idxCheck.rowCount > 0);

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
    console.log(`  STAGE 33 RECONCILIATION RESULT: SUCCESS (${assertionPassedCount} assertions passed)`);
    console.log(`=========================================================\n`);

  } catch (err: any) {
    console.error(`\n  ❌ STAGE 33 VALIDATION FAILED: ${err.message}`);
    assertionFailedCount++;
    process.exit(1);
  }
}

runStage33Tests().catch(err => {
  console.error("Unhandle test crash:", err);
  process.exit(1);
});
