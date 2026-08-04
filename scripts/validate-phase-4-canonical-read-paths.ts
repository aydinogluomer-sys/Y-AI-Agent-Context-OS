import assert from "node:assert/strict";
import { AgentTimelineService } from "../packages/agents/src/timeline";
import { SearchServer } from "../packages/context/src/search-server";

const timelinePool = {
  async query(sql: string) {
    if (sql.includes("FROM projects")) {
      return { rowCount: 1, rows: [{ id: "project-a" }] };
    }
    if (sql.includes("FROM tasks WHERE id")) {
      return {
        rowCount: 1,
        rows: [{ id: "task-a", project_id: "project-a" }],
      };
    }
    if (sql.includes("FROM event_records")) {
      return {
        rowCount: 1,
        rows: [
          {
            id: "event-a",
            project_id: "project-a",
            task_id: "task-a",
            event_type: "TASK_STATUS_TRANSITIONED",
            status: "committed",
            source_id: "task-a",
            feature_id: "CORE",
            payload_json: { summary: "Task entered running state." },
            metadata_json: {},
            payload_hash: "abc",
            created_at: "2026-07-06T10:00:00.000Z",
          },
        ],
      };
    }
    throw new Error(`Unexpected timeline query: ${sql}`);
  },
};

const timeline = new AgentTimelineService(timelinePool);
const projected = await timeline.getTimeline("project-a", "task-a");
assert.equal(projected.length, 1);
assert.equal(projected[0].source_type, "event_store");
assert.equal(projected[0].source_completeness, "canonical_event_store");
assert.deepEqual(projected[0].warnings, []);

const retrievalPool = {
  async query(sql: string) {
    if (sql.includes("FROM context_objects")) {
      return {
        rowCount: 1,
        rows: [
          {
            id: "canonical-a",
            project_id: "project-a",
            object_type: "source_file",
            source_table: "context_items",
            source_id: "legacy-a",
            payload_text: "secure jwt authentication middleware",
            payload_json: {},
            metadata_json: {
              path: "src/auth.ts",
              source_type: "code",
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      };
    }
    if (sql.includes("FROM context_items")) {
      return {
        rowCount: 1,
        rows: [
          {
            id: "legacy-a",
            project_id: "project-a",
            source_type: "code",
            source_uri: "src/auth.ts",
            metadata_json: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      };
    }
    if (sql.includes("FROM context_chunks")) {
      return {
        rowCount: 1,
        rows: [
          {
            id: "chunk-a",
            context_item_id: "legacy-a",
            chunk_index: 0,
            content: "legacy jwt content",
            token_count: 5,
          },
        ],
      };
    }
    throw new Error(`Unexpected retrieval query: ${sql}`);
  },
};

const search = new SearchServer(retrievalPool, "local_sql");
const candidates = await search.queryCandidates({
  project_id: "project-a",
  query: "jwt authentication",
  limit: 10,
});
assert.equal(candidates.length, 1);
assert.equal(candidates[0].id, "canonical-a");
assert.ok(candidates[0].reason_codes.includes("CANONICAL_CONTEXT_OBJECT"));

console.log("Phase 4 canonical timeline/context reads: PASS");

