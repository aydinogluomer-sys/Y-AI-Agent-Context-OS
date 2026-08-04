# Development Database Reset Utility

The development database reset utility provides a localized CLI tool to reset the database schema and data inside development/staging environments.

> **CRITICAL WARNING**:
> - Never run this script/utility in a production context.
> - This operations drops all application tables, schemas, migrations, metadata, and references with dynamic cascade overrides.
> - No public administrative APIs are exposed on the HTTP router for this utility to prevent remote destructive execution.

## Environmental Pre-requisites
To execute a database reset, the current execution scope MUST meet these two criteria:
1. `NODE_ENV` must NOT be `"production"`.
2. `ALLOW_DESTRUCTIVE_DB_RESET` must be explicitly declared as `"true"`.

If either environment constraint is absent or mismatched, the runner will refuse execution and terminate loudly.

## Usage
Run the following script command in your workspace workspace root:
```bash
pnpm db:reset:dev --confirm I_UNDERSTAND_THIS_DELETES_DEVELOPMENT_DATA
```

## Audit Trace
- Before dropped, an entrance event is logged inside the database `audit_logs` table (if present) for audit indexing.
- Upon completion, a local redacted file is written to `.y/reports/dev-reset-last.json` to store the footprint record securely on the filesystem:
```json
{
  "timestamp": "2026-05-22...",
  "actor": "system-cli",
  "action": "DESTRUCTIVE_RESET",
  "status": "success",
  "environment": "development",
  "tablesDropped": [...]
}
```

## Verifying Schema Post-Reset
1. Run `pnpm db:status` to verify that tables are successfully empty.
2. Run `pnpm db:migrate` to recreate the schema definitions cleanly from scratch.
3. Check status again using `pnpm db:status` to confirm the projects foundation is properly initialized.
