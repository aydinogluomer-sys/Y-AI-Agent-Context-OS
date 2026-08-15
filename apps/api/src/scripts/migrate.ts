/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dotenv from "dotenv";
import { DatabaseConnector } from "../db";
import { sysLogger } from "../logger";

/*
 * P21/6 — `override: true` KALDIRILDI.
 *
 * `override: true`, `.env` dosyasini ACIK ortam degiskenlerinin
 * USTUNE yaziyordu. Yani:
 *
 *   DATABASE_URL=... npm run db:migrate
 *
 * komutu SESSIZCE yok sayiliyor ve migration `.env`de yazan
 * veritabanina uygulaniyordu. P21'de tam bu yasandi: migration
 * yanlis veritabanina gitti ve sebebi bulunana kadar hatali tani
 * konuldu.
 *
 * CI'da `.env` yok, bu yuzden orada zarar vermiyordu — ama CI'a bir
 * `.env` dusmesi halinde `env:` bloklari sessizce ezilirdi.
 *
 * Dogru oncelik: ACIK ortam degiskeni dosyayi YENER. Bu dotenv'in
 * varsayilanidir; ozel bir sey yapmamak yeterliydi.
 */
dotenv.config();

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
