import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

process.env.NODE_ENV = "test";
process.env.VITE_USER_NODE_ENV = "test";
process.env.ENABLE_MOCK_DB = "true";

const { MockDatabaseConnector } = await import("../apps/api/src/db");
const { computeEvidenceHash } = await import("../apps/api/src/EvidenceStoreService");

const connector = new MockDatabaseConnector();
connector.queryInMemory(
  `INSERT INTO event_records (
    id, project_id, event_type, payload_json, payload_hash, created_at
  ) VALUES ($1, $2, $3, $4, $5, $6);`,
  [
    "event-phase-5",
    "project-1",
    "TEST_EVENT",
    JSON.stringify({ immutable: true }),
    "digest",
    new Date().toISOString(),
  ],
);

assert.throws(
  () =>
    connector.queryInMemory(
      "UPDATE event_records SET payload_json = $1 WHERE id = $2;",
      [JSON.stringify({ immutable: false }), "event-phase-5"],
    ),
  /append-only ledger/,
);

assert.throws(
  () =>
    connector.queryInMemory(
      "DELETE FROM event_records WHERE id = $1;",
      ["event-phase-5"],
    ),
  /append-only ledger/,
);

const sourceRefs = {
  id: "evidence-phase-5",
  project_id: "project-1",
  task_id: null,
  feature_id: "CORE",
  evidence_type: "test_result",
  actor_type: "system",
  actor_id: null,
  audit_log_id: null,
  quality_gate_run_id: null,
  quality_gate_command_result_id: null,
  artifact_id: null,
  source_table: "event_records",
  source_id: "event-phase-5",
};

const originalDigest = computeEvidenceHash({ passed: true }, sourceRefs);
assert.equal(originalDigest, computeEvidenceHash({ passed: true }, sourceRefs));
assert.notEqual(originalDigest, computeEvidenceHash({ passed: false }, sourceRefs));

const evidenceSource = await readFile(
  new URL("../apps/api/src/EvidenceStoreService.ts", import.meta.url),
  "utf8",
);
assert.doesNotMatch(
  evidenceSource,
  /Evidence file signature verified successfully/,
);
assert.match(evidenceSource, /no actor signature was evaluated/);

console.log("Phase 5 evidence integrity and mock immutability: PASS");
