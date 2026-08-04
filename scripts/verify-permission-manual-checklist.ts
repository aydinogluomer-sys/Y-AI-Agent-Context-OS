/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config({ override: true });

// 1. Set environment variables before dynamically importing index.ts
process.env.Y_API_AUTH_TOKEN = "configured-operator-secure-token-value-here";
process.env.Y_API_AUTH_ACTOR = "ci-operator";
process.env.Y_API_AUTH_ROLE = "admin";
process.env.Y_API_AUTH_PROJECTS = "project-a,project-b,proj_92c";

const PORT = 3333;
const HOST = "127.0.0.1";

async function runChecklistVerification() {
  console.log("\n=========================================================");
  console.log("  RUNNING PERMISSION KERNEL QA CHECKLIST VERIFICATION");
  console.log("=========================================================\n");

  // Dynamically import express and our router after env variables are set
  const express = (await import("express")).default;
  const { apiRouter, apiReady, db } = await import("../apps/api/src/index");

  // Wait for the API database connection and initialization sequence to finish
  console.log("Waiting for database initialization (apiReady)...");
  await apiReady;
  console.log("Database initialized successfully!");

  // Insert proj_92c into projects table
  const pool = db.getPool();
  await pool.query(
    "INSERT INTO projects (id, name, description, team_id, metadata_json) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING;",
    ["proj_92c", "Y AI Agent Context OS", "Aggregating massive project contexts for LLMs.", "team_alpha", "{}"]
  );

  // Spin up local test express instance
  const app = express();
  app.use(express.json());
  app.use("/api", apiRouter);

  let server: any;
  await new Promise<void>((resolve, reject) => {
    server = app.listen(PORT, HOST, () => {
      console.log(`Test server running at http://${HOST}:${PORT}/api`);
      resolve();
    });
    server.once("error", reject);
  });

  let failed = 0;
  const assertTest = (description: string, condition: boolean) => {
    if (condition) {
      console.log(`  ✅ [PASS] ${description}`);
    } else {
      console.error(`  ❌ [FAIL] ${description}`);
      failed++;
    }
  };

  const testTaskId = `task_checklist_${crypto.randomUUID().substring(0, 8)}`;

  try {
    const baseUrl = `http://${HOST}:${PORT}/api`;

    // -----------------------------------------------------------------
    // TEST 1: Verify Default Deny
    // -----------------------------------------------------------------
    console.log("\n--- TEST 1: Default Deny Check ---");
    const resNoAuth = await fetch(`${baseUrl}/projects/proj_92c/context-items`);
    assertTest(
      "Query without auth headers is blocked (401)",
      resNoAuth.status === 401
    );

    const resInvalidAuth = await fetch(`${baseUrl}/projects/proj_92c/context-items`, {
      headers: { Authorization: "Bearer invalid-token-value" }
    });
    assertTest(
      "Query with invalid token is blocked (401)",
      resInvalidAuth.status === 401
    );

    // -----------------------------------------------------------------
    // TEST 2: Verify Project Leak Protection
    // -----------------------------------------------------------------
    console.log("\n--- TEST 2: Project Leak Protection ---");
    
    // Configured token has access to project-a, project-b, proj_92c.
    // If we request for `/api/projects/project-c/tasks`, since `project-c` is NOT in the projectIds list, it should return 403!
    const resCrossProject = await fetch(`${baseUrl}/projects/project-c/tasks`, {
      headers: { Authorization: `Bearer ${process.env.Y_API_AUTH_TOKEN}` }
    });
    const crossProjBody = await resCrossProject.json();
    console.log("  [DIAGNOSTIC] GET /projects/project-c/tasks status:", resCrossProject.status);
    console.log("  [DIAGNOSTIC] GET /projects/project-c/tasks body:", JSON.stringify(crossProjBody));
    
    assertTest(
      "GET /projects/project-c/tasks with token not assigned to project-c is blocked (403)",
      resCrossProject.status === 403
    );
    assertTest(
      "Error code is PROJECT_ACCESS_DENIED",
      crossProjBody.error?.code === "PROJECT_ACCESS_DENIED"
    );

    // -----------------------------------------------------------------
    // TEST 3: Verify Traversal Rejections
    // -----------------------------------------------------------------
    console.log("\n--- TEST 3: Traversal Rejections ---");
    const resTraversal = await fetch(`${baseUrl}/projects/proj_92c/repo/file?path=../../.env`, {
      headers: { Authorization: `Bearer ${process.env.Y_API_AUTH_TOKEN}` }
    });
    const traversalBody = await resTraversal.json();
    console.log("  [DIAGNOSTIC] GET /repo/file status:", resTraversal.status);
    console.log("  [DIAGNOSTIC] GET /repo/file body:", JSON.stringify(traversalBody));

    assertTest(
      "GET /repo/file with traversal path is rejected (403 or 400)",
      resTraversal.status === 403 || resTraversal.status === 400
    );
    assertTest(
      "Error code is PERMISSION_DENIED",
      traversalBody.error?.code === "PERMISSION_DENIED" ||
      traversalBody.errors?.some((e: string) => e.toLowerCase().includes("traversal"))
    );

    // -----------------------------------------------------------------
    // TEST 4: Verify Override Audit Trails
    // -----------------------------------------------------------------
    console.log("\n--- TEST 4: Override Audit Trails & Metadata Redaction ---");
    
    // First, let's create a task under proj_92c if it doesn't exist
    await fetch(`${baseUrl}/projects/proj_92c/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.Y_API_AUTH_TOKEN}`
      },
      body: JSON.stringify({
        id: testTaskId,
        title: "Bypass transition check",
        status: "pending"
      })
    });

    // Execute administrative state change override
    const rationaleText = "Force status transition to resume via admin bypass";
    const resOverride = await fetch(`${baseUrl}/projects/proj_92c/tasks/${testTaskId}/transition`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.Y_API_AUTH_TOKEN}`
      },
      body: JSON.stringify({
        action: "resume", // Illegal from pending status
        targetStatus: "paused",
        rationale: rationaleText,
        metadata: {
          adminOverride: true,
          DATABASE_URL: "postgresql://postgres:fake_password@localhost:5432/main",
          secretKey: "CI_CHECK_SECRET_KEY_12345"
        }
      })
    });
    
    console.log("  [DIAGNOSTIC] POST /transition status:", resOverride.status);
    const overrideBody = await resOverride.json();
    console.log("  [DIAGNOSTIC] POST /transition body:", JSON.stringify(overrideBody));

    assertTest(
      "Admin override successfully bypasses illegal transition",
      resOverride.status === 200
    );

    // Query audit_logs directly from database pool to inspect metadata (which is not selected by API endpoint)
    const dbLogsRes = await pool.query(
      `SELECT metadata::text FROM audit_logs 
       WHERE project_id = $1 
         AND (action = $2 OR action = $3) 
         AND rationale = $4 
       LIMIT 1;`,
      ["proj_92c", "TASK_TRANSITION_ADMIN_OVERRIDE_USED", "TASK_TRANSITION_REQUESTED", rationaleText]
    );

    assertTest("Override audit trail exists in database", dbLogsRes.rowCount > 0);
    if (dbLogsRes.rowCount > 0) {
      const rawMetadata = dbLogsRes.rows[0].metadata;
      const meta = typeof rawMetadata === "string" 
        ? JSON.parse(rawMetadata) 
        : rawMetadata;

      console.log("  [DIAGNOSTIC] Audit log metadata:", JSON.stringify(meta));

      const dbUrlVal = meta.metadata?.DATABASE_URL || meta.metadata?.database_url;
      const secKeyVal = meta.metadata?.secretKey || meta.metadata?.secretkey;

      assertTest(
        "Sensitive metadata (DATABASE_URL) is redacted in audit log",
        dbUrlVal === "[REDACTED_SECURE]" || 
        dbUrlVal === "[REDACTED_LEAK_PREVENTION]"
      );
      assertTest(
        "Sensitive metadata (secretKey) is redacted in audit log",
        secKeyVal === "[REDACTED_SECURE]" ||
        secKeyVal === "[REDACTED_SECRET]"
      );
    }

  } catch (err: any) {
    console.error("Verification aborted with exception:", err);
    failed++;
  } finally {
    server.close();
    
    // Cleanup databases tables
    console.log("Cleaning up test database rows...");
    try {
      await pool.query("DELETE FROM task_status_history WHERE task_id = $1;", [testTaskId]);
      await pool.query("DELETE FROM tasks WHERE id = $1;", [testTaskId]);
      await pool.query("DELETE FROM projects WHERE id = $1;", ["proj_92c"]);
      console.log("Cleanup finished.");
    } catch (cleanupErr: any) {
      console.error("Cleanup error:", cleanupErr.message);
    }

    console.log("\n=========================================================");
    console.log(`VERIFICATION SUMMARY: ${failed} Failed`);
    console.log("=========================================================\n");
    process.exit(failed > 0 ? 1 : 0);
  }
}

runChecklistVerification();
