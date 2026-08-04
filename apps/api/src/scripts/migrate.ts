/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dotenv from "dotenv";
import { DatabaseConnector } from "../db";
import { sysLogger } from "../logger";

dotenv.config({ override: true });

async function runCliMigrations() {
  let dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("FATAL: DATABASE_URL environment variable is not defined in the run scope!");
    process.exit(1);
  }

  sysLogger.info("Initializing Database CLI migration runner...");
  const db = new DatabaseConnector(dbUrl);
  
  try {
    await db.connect();
    const result = await db.runMigrations();
    console.log("\n=================================");
    console.log("Migration sequence completed successfully!");
    console.log(`Active schema version: ${db.getStatus().activeSchemaVersion}`);
    console.log(`Migrated: ${result.migrated}`);
    console.log(`Processed versions: ${JSON.stringify(result.processedVersions)}`);
    console.log("=================================\n");
    process.exit(0);
  } catch (err: any) {
    console.error("\n=================================");
    console.error("FATAL: CLI Migration sequence failed!");
    console.error(err.message);
    console.error("=================================\n");
    process.exit(1);
  }
}

runCliMigrations();
