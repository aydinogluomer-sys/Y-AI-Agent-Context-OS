import assert from "node:assert/strict";
import { resolveDatabaseUrl } from "../apps/api/src/config";
import { mayContinueAfterDatabaseFailure } from "../apps/api/src/startup-policy";

assert.equal(
  resolveDatabaseUrl("production", {}),
  "",
  "Production must not receive a fabricated database URL."
);
assert.equal(
  resolveDatabaseUrl("development", {}),
  "postgresql://y_user:safe_pass@localhost:5432/y_vault"
);
assert.equal(
  resolveDatabaseUrl("production", { DATABASE_URL: "postgresql://real/db" }),
  "postgresql://real/db"
);

assert.equal(
  mayContinueAfterDatabaseFailure("production", {
    ALLOW_OFFLINE_API_BOOT: "true",
  }),
  false
);
assert.equal(mayContinueAfterDatabaseFailure("development", {}), false);
assert.equal(
  mayContinueAfterDatabaseFailure("development", {
    ALLOW_OFFLINE_API_BOOT: "true",
  }),
  true
);

console.log("Phase 3 startup policy: PASS");

