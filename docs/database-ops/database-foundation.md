# Y-OS Database Foundation (Phase 0 Hardening)

This document outlines the design, schema, migration sequence, and validation steps for the Y-OS database foundation.

---

## 1. How DATABASE_URL is Used

The application loads `DATABASE_URL` dynamically from environment configurations via `apps/api/src/config.ts`.
*   The raw string is inspected strictly for PostgreSQL connection format (`postgresql://...`).
*   The raw credentials are used to spin up a connection `Pool` via `pg` inside the `DatabaseConnector` class.
*   Security redaction rules (from the `@y/security` package) scrub the actual password from all application log files, terminal streams, and inspection payloads, displaying a secure redacted wrapper (`[REDACTED_API_KEY_PRESENT]`) instead.
*   **Fail-Loud Assertions**: If `DATABASE_URL` is missing, unconfigured, or fails to satisfy port connectivity probes (`SELECT 1`), Y-OS throws a fatal compiler/runtime error and halts immediately. Mocks or fake integrations are unauthorized.

---

## 2. Dynamic Migration Runner

The migration runner is implemented in `apps/api/src/db.ts` and managed via CLI inside `apps/api/src/scripts/migrate.ts`.
*   Migrations run sequentially, wrapped inside a single atomic transaction.
*   An idempotent tracking table, `schema_migrations`, is automatically created to log and trace all successfully run migrations.
*   If any SQL statement fails within a version, the entire transaction is rolled back (`ROLLBACK`) to leave database integrity intact.

---

## 3. Foundation Tables Created

The following idempotent schemas are established:

### `projects`
Stores high-level workspace project parameters.
- `id` (VARCHAR PRIMARY KEY)
- `name` (VARCHAR NOT NULL)
- `description` (TEXT)
- `team_id` (VARCHAR)
- `metadata_json` (JSONB KEY-VALUE STORE)
- `created_at`, `updated_at` (TIMESTAMPTZ)

### `memberships`
Specifies user-scoping boundaries across projects.
- `id` (VARCHAR PRIMARY KEY)
- `project_id` (VARCHAR FOREIGN KEY references projects)
- `user_email` (VARCHAR)
- `role` (VARCHAR matching user roles union: admin, developer, reviewer)

### `tasks`
Orchestrates agentic step planning.
- `id` (VARCHAR PRIMARY KEY)
- `project_id` (VARCHAR FOREIGN KEY references projects)
- `title` (VARCHAR)
- `description` (TEXT)
- `category` (VARCHAR status union)
- `risk_level`, `difficulty`, `status` (VARCHAR status unions)
- `owner_agent`, `human_owner` (VARCHAR)
- `acceptance_criteria` (ARRAY of TEXT)

### `context_items` & `context_chunks`
Stores raw chunk metadata for 50K token context compression algorithms.
- Supports indexing, checksums, content hashes, and token counts.

### `graph_nodes` & `graph_edges`
Backs AST code dependencies and file intelligence traversal paths.

### `audit_logs`
Central security pipeline tracking all user/agent actions.

### `artifacts`, `debug_logs`, `connections`
Mainpins historic files, execution logs, and connected API synchronization credentials.

---

## 4. Verification in Supabase

You can verify successful setup on Supabase by running these queries inside your SQL Editor:

```sql
-- 1. Check all tables within public schema
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 2. Verify tables can be queried without failures
SELECT count(*) FROM public.projects;
SELECT count(*) FROM public.tasks;
SELECT count(*) FROM public.audit_logs;
```

---

## 5. Audit Logging Architecture

*   Every database modification (`CREATE`, `UPDATE`, `STATUS_CHANGE`) to `projects` or `tasks` automatically triggers an asynchronous audit block execution in the `AuditLogHelper`.
*   These events write directly to the `audit_logs` PostgreSQL table, tracking the actor, feature region (`CORE`, `CTX`, `TASK`, `SEC`), status, exact actions, and extensive custom metadata.

---

## 6. No SQLite Fallback Assertion

In high-integrity deployments, silently falling back to a dummy SQLite file or transient in-memory array leads to data partitioning, silent state loss, and security bypasses.
*   **Disabled by default**: Under Phase 0, if Supabase refuses the password or is unreachable, **the app must crash loudly** on startup.
*   This forces team engineers to correct credential injection pipelines immediately before high-risk execution begins.
