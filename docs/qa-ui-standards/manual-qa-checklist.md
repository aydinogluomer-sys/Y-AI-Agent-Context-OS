# Manual QA Checklist - Kernel MVP Stabilization

This document provides structured manual QA and stabilization guidance for the Y-OS Kernel MVP system. It covers the recorded Stage 1 to Stage 35 feature baseline (historical milestones KMVP-001 through KMVP-014). Canonical `KDEBT-*` meanings live only in `docs/kernel-debt-register.md`.

## 1. Core Modules QA Matrix

### CTX MVP (Context & Document Ingestion)
* **Manual QA Objective:** Verify that files and multi-line raw text blocks can be ingested into the context workspace with automatic segment/token limits.
* **UI Surface to Inspect:** Primary file detail viewer drawers, project files list tables, or status indicators mapped inside the workspace tabs.
* **API/Service Behavior:** Verify `/api/projects/:projectId/context-items` (or equivalent) handles creation payload.
* **Security Boundary to Verify:** Cross-project read boundary; attempt to query context items belonging to `project-A` from `project-B` header session and verify 403 / PermissionDenied error response.
* **Expected Result:** Payload parses correctly, splits into sequential chunk lines with estimated token metrics, and registers.
* **Failure Warning Signs:** Empty chunk lists, zero-byte chunk sizes, raw secrets visible in chunk list, or horizontal scroll overflow on the item details.

### GRAPH MVP (Knowledge Graph Integration)
* **Manual QA Objective:** Verify that ingestion events update the knowledge graph nodes and file relationship weights.
* **UI Surface to Inspect:** Ingestion status panels, file dependency lists, and connected item sections.
* **API/Service Behavior:** Confirm creation triggers node mapping (`GRAPH-012`) and links relationships without duplication.
* **Security Boundary to Verify:** Cross-project node isolation prevents querying nodes that span other projects.
* **Expected Result:** Creating files adds corresponding nodes and updates weight matrices without duplicating index relations on re-ran syncs.
* **Failure Warning Signs:** duplicate nodes, unresolved edge counts, AST traversal crashes on missing module files.

### RESUME MVP (Task Pause & Session Resume)
* **Manual QA Objective:** Verify that a running task can be paused, saving full context stubs, and resumed seamlessly.
* **UI Surface to Inspect:** Status indicator pills (Pending / Running / Paused), Pause Reason modals, and Resume Option panels.
* **API/Service Behavior:** Check pause status updates and ensure resume payloads bundle correct files, boundaries, and directories.
* **Security Boundary to Verify:** Verify that file-access details do not include paths listed in prohibited task boundaries.
* **Expected Result:** Status cycles from Running ➔ Paused ➔ Running with exact resume files documented cleanly.
* **Failure Warning Signs:** task resume button disabled on paused task, missing boundaries payload, or lost metadata.

### DEBUG MVP (Isolated Log Diagnostics)
* **Manual QA Objective:** Verify that debug messages are captured per task up to a capped buffer limit.
* **UI Surface to Inspect:** Live Task Console drawer, Log Explorer widgets, and Diagnostic Summaries tab.
* **API/Service Behavior:** Verify appended logs handle level filtering (`debug`, `info`, `warning`, `error`) and regex-based text search.
* **Security Boundary to Verify:** Check that absolute paths inside error traces and secrets inside execution logs are redacted on the fly.
* **Expected Result:** Log stream is capped at max 500 lines, showing a deterministic structured summary without fabricating files.
* **Failure Warning Signs:** CPU locks on large log searches, credentials displayed in output streams, or logs displaying absolute local directories.

### RepoAdapter Core MVP (Safety File System Access)
* **Manual QA Objective:** Verify file reads and writes execute block policies on traverse commands and internal folders.
* **UI Surface to Inspect:** File Explorer lists, directory navigation controls, and file editing templates.
* **API/Service Behavior:** Confirm file access limits are checked against traversal block parameters and file size caps.
* **Security Boundary to Verify:** Attempt to query `.env`, `secrets.json`, `.pem`, `.key`, or `node_modules` and confirm access are strictly blocked.
* **Expected Result:** Reads are sanitized, returning warning logs on credentials while rejecting path traverse parameters (`../`).
* **Failure Warning Signs:** Path traversal inputs reading files outside workspace root, binary file attempts causing API memory spikes.

### Local DB-backed Job Queue MVP (Task Scheduling)
* **Manual QA Objective:** Verify background index jobs are queued, claimed, prioritized, and locked by workers safely.
* **UI Surface to Inspect:** Job Queue table, background workers status widget, and active job counters.
* **API/Service Behavior:** Confirm claiming prioritizes high-priority items and locks records safely.
* **Security Boundary to Verify:** Verify database row operations block cross-project task alignments or job claims.
* **Expected Result:** Worker claims matching highest-priority job, flags it as processing, and increments concurrency counts.
* **Failure Warning Signs:** One worker claiming multiple jobs in violation of concurrency limit, stale jobs indefinitely locked.

### Incremental Indexing MVP (Delta-Scan Engine)
* **Manual QA Objective:** Verify that file edits generate incremental scan events and queue delta index tasks.
* **UI Surface to Inspect:** Indexing indicator banners, project sync states, and file edit forms.
* **API/Service Behavior:** Verify that duplicate indexing requests are debounced.
* **Security Boundary to Verify:** Verify that file scan pathways block directory traversals or scans outside the project scope.
* **Expected Result:** Emits file delta scanning jobs for updated paths, preventing duplicate scans.
* **Failure Warning Signs:** Excessive queue loops for the same modified file, or scanning paths inside restricted directories.

### AST Parser / Static Analysis MVP (Symbol Extraction)
* **Manual QA Objective:** Inspect AST-extracted symbols (imports, exports, JSX components, database tables) from uploaded code.
* **UI Surface to Inspect:** Symbol Inspector grid, dependency reference cards, and import tables.
* **API/Service Behavior:** Confirm broken syntax doesn't crash analyses but runs safe fallbacks gracefully.
* **Security Boundary to Verify:** Verify that AST files outside task scope or project boundary cannot be processed.
* **Expected Result:** Successfully identifies TypeScript exports, Express path endpoints, and query tables cleanly.
* **Failure Warning Signs:** API routes failing with 500 on syntax-broken files, or credentials leaking in extracted symbols.

### Retrieval Isolation / Search Server MVP (Search Grounding)
* **Manual QA Objective:** Verify that context retrieval remains isolated per project and task, with zero-leak search bounds.
* **UI Surface to Inspect:** Search input bars, grounding references drawer, and task search grids.
* **API/Service Behavior:** Verify that SQL-based relevance search ranks matches directly without cross-tenant leakage.
* **Security Boundary to Verify:** Attempt searching from a user token mapped to project A for keywords known in project B.
* **Expected Result:** Returns clean matches for active project references only, completely omitting results from project B.
* **Failure Warning Signs:** Multi-tenant leakage where keywords match cross-project data, or SQL syntax errors on search strings.

### Task Lifecycle FSM MVP (Task Transitions)
* **Manual QA Objective:** Verify that task status follows strict state transition maps.
* **UI Surface to Inspect:** Task Status Board, action dropdown menus (Start, Pause, Resume, Abort, Complete), and transition histories.
* **API/Service Behavior:** Confirm illegal transition requests are rejected.
* **Security Boundary to Verify:** Check that transition requests from outside project boundaries are denied.
* **Expected Result:** Statuses update cleanly, emission of audit logs, and automatic database transaction rolls back on history failures.
* **Failure Warning Signs:** Direct status edits bypassing state checking rules, or missing history logs for active transitions.

### Quality Gate Orchestrator MVP (Build/Test Verification)
* **Manual QA Objective:** Verify Quality Gate runs execute static analysis, test sweeps, and secret scans.
* **UI Surface to Inspect:** Quality Gate Dashboard reports, detailed log drawers, and action verification tabs.
* **API/Service Behavior:** Confirm build, lint, and credentials logging are checked and formatted correctly.
* **Security Boundary to Verify:** Ensure that absolute output paths are masked and credentials are redacted cleanly.
* **Expected Result:** Runs successfully aggregate build, lint, and scanning metrics, alerting on any issues.
* **Failure Warning Signs:** Credentials readable in the quality gate logs, or unformatted raw terminal traces.

### Evidence Store MVP (Integrity Verification)
* **Manual QA Objective:** Create, view, and run integrity scans on evidence records.
* **UI Surface to Inspect:** Evidence Ledger grid, Verification Status badges, and Scan History timeline.
* **API/Service Behavior:** Validate batch checks analyze all project records.
* **Security Boundary to Verify:** Attempt to update or delete evidence records and confirm that the delete and update routes are absent.
* **Expected Result:** Mismatched records are marked as corrupted and trigger audit logs, with no DB update method.
* **Failure Warning Signs:** Modifying payloads without triggering corruption detection, or presence of direct HTTP DELETE routes.

### Event Store MVP (Append-Only Event Ledger)
* **Manual QA Objective:** Verify event streams are appended safely and cannot be updated or deleted.
* **UI Surface to Inspect:** Audited Event Stream tables, event payload inspect modals, and chronological activity grids.
* **API/Service Behavior:** Confirm mutations and deletes trigger database-level trigger rejections.
* **Security Boundary to Verify:** Run manual SQLite / Postgres update commands via testing setups to confirm block rules.
* **Expected Result:** Appends events with automated idempotency deduplication, blocking updates/deletions.
* **Failure Warning Signs:** Successful POST updates to events, missing database trigger files, or duplicate keys causing runtime errors.

### ContextObject Store MVP (Workspace Cache)
* **Manual QA Objective:** Verify workspace metadata packages are cached, flagged as stale or quarantined, and deduplicated.
* **UI Surface to Inspect:** Context Vault table, token metric cards, stale/quarantine toggles, and item inspect drawers.
* **API/Service Behavior:** Confirm context items can be marked stale or quarantined.
* **Security Boundary to Verify:** Access check prevents cross-project viewing of cached items.
* **Expected Result:** Deduplicates matching payloads based on clean content hashes, mapping item references cleanly.
* **Failure Warning Signs:** Storage of unredacted credentials, missing stale indicators, or duplicate payload writes.

### Production Queue / Worker Runtime MVP (Local Workers)
* **Manual QA Objective:** Verify local workers register, emit heartbeats, claim index jobs, and manage concurrency limits.
* **UI Surface to Inspect:** Worker Administration panel, active threads indicator, and job performance gauges.
* **API/Service Behavior:** Confirm worker registrations and heartbeat intervals.
* **Security Boundary to Verify:** Verify that database worker queries prevent cross-project job claims and registrations.
* **Expected Result:** Active workers register, claim job list items, and stop processing when concurrency is exhausted.
* **Failure Warning Signs:** Job claimed status without matching active worker mappings, or concurrency exceeding user caps.

### File Locking MVP (Distributed Locks)
* **Manual QA Objective:** Verify concurrent write files block edits and release lock leases.
* **UI Surface to Inspect:** Active File Locks list, lock indicator overlays next to file tree paths, and unlock overrides.
* **API/Service Behavior:** Confirm lock creation, verification, and expiration.
* **Security Boundary to Verify:** Block path traversals and restrict specific system-sensitive files from locking queues.
* **Expected Result:** Read locks allow simultaneously, write locks block read attempts, and expired lock leases are swept safely.
* **Failure Warning Signs:** Stale lock leases preventing editing files, or concurrent writes allowed over locked paths.

### Permission Kernel / ABAC MVP (Access Control Engine)
* **Manual QA Objective:** Verify access controls evaluate subjects, resources, and project scopes.
* **UI Surface to Inspect:** Policy Rules board, active actor information headers, and access denied messages.
* **API/Service Behavior:** Confirm policies load and execute default-deny rule on arbitrary matched parameters.
* **Security Boundary to Verify:** Admin overrides require written logic/rationale and emit audit logs.
* **Expected Result:** Blocks requests without matching policy definitions and records evaluation transactions in ledger.
* **Failure Warning Signs:** Requests succeeding on un-configured policy rules, or raw tokens written to audit tables.

### Artifact Versioning / CAS MVP (Artifact Registry)
* **Manual QA Objective:** Upload, version, and view CAS archives under secure logical paths.
* **UI Surface to Inspect:** Artifact Catalog grid, version lineage timeline, and artifact detail inspect models.
* **API/Service Behavior:** Confirm that uploads are chunked into deduplicated content-addressable storage.
* **Security Boundary to Verify:** Ensure that oversize payloads or bearing credentials are hard rejected.
* **Expected Result:** Deduplicates uploads with matching cryptographic hashes and tracks version supersedes.
* **Failure Warning Signs:** Duplicate CAS bytes stored in table rows, or missing version inheritance paths.

---

## 2. Dynamic QA Checklists

### Smoke Test Checklist
- [ ] Connect and log in to the dashboard UI.
- [ ] Create a new project workspace and confirm database row insertion.
- [ ] Ingest a test text file as a Context Item and verify segment splits.
- [ ] Transition a test task from `pending` to `running`, verify logs.
- [ ] Upload an artifact, verify v1 is written to CAS.
- [ ] Edit the same artifact path, verify version number ticks to v2.
- [ ] Run a manual Quality Gate scan, inspect summary details.
- [ ] View chronological Audit Logs stream, verify events align.

### Security Regression Checklist
- [ ] Confirm no cloud-provider integration libraries are active in API handlers.
- [ ] Verify database URLs or API keys are not exposed in client bundles.
- [ ] Attempt cross-project access by modifying URL IDs on task and context details.
- [ ] Try directory traversals `../../` on Repository file read routes and confirm rejections.
- [ ] Try database updates on `audit_logs` or `event_records` via API and verify hard freezes.
- [ ] Verify certificates are and credentials are systematically redacted inside debug log buffers.

### UI Navigation Checklist
- [ ] Verify dashboard menus cycle between tabs smoothly (Tasks, Context, Artifacts, Operations).
- [ ] Verify active project selection resets page states and loads correct child values.
- [ ] Inspect modals and check that they can be closed with Escape keys or overlay clicks.
- [ ] Ensure long listings are wrapped in scannable headers with loading indicators.
- [ ] Confirm typography hierarchy (e.g. Space Grotesk display paired with Fira Code indexes) maps uniformly.

### Data Isolation Checklist
- [ ] Seed two separate testing projects (`proj_A`, `proj_B`).
- [ ] Verify `proj_A` context items are completely invisible to `proj_B` workspace panels.
- [ ] Confirm task lists only render active task cards matching current selection.
- [ ] Verify search queries on `proj_A` do not match strings inside `proj_B` assets.
- [ ] Verify artifact version lineages do not intertwine between projects.

### Redaction Checklist
- [ ] Review raw postgres configurations inside workspace source code.
- [ ] Search debug logs for keyword `password` or `apiKey` and inspect redactor patterns.
- [ ] Confirm absolute machine pathways like `/home/usr/...` are translated to `./relative` format.
- [ ] Confirm JSON schemas parse and replace key arrays like `auth_token` with `[REDACTED]`.

### Deferred-Scope Boundary Checklist
- [ ] Confirm **ArtifactQualityGateDashboard.tsx** component is completely absent.
- [ ] Confirm **purge-expired** endpoints or buttons cannot be found or activated in codebase.
- [ ] Confirm **comparison/diff** modal overlays are stripped from artifact tables.
- [ ] Confirm **Snapshot/Rollback** or **Browser Sandbox Runtime** dependencies do not exist.
- [ ] Confirm schema files and database migrations list no changes created post Phase 31 baseline.

---

## 3. Artifact CAS Blob Deduplication Manual QA Plan

This manual QA plan focuses entirely on verifying the core **Content Addressable Storage (CAS) Deduplication** mechanism using the existing high-integrity database records and standard API/UI operations. No background mutations, deletions, or external storage integrations are triggered.

### QA Objective
Verify that uploading multiple copies of identical files—either across different logical paths or different versions within the same project—results in exactly one underlying `cas_blobs` record (reusing the same cryptographic content hash), while correctly registering distinct pointers in the version tracking logs.

### Preconditions
1. Active PostgreSQL database connectivity with a verified state (`pnpm db:status`).
2. Target project (e.g., `proj_qa_dedup`) initialized via the UI or seed suite.
3. Access to an API client (e.g., Postman / standard curl command) or the logical workspace file-upload UI panel.
4. Two test files prepared:
   - **File A (`source_1.txt`):** Structured text payload with content hash `SHA256_A` (e.g., "Standard Y-OS artifact payloads are deduplicated.").
   - **File B (`source_2.txt`):** Completely identical payload text matching File A (reusing content hash `SHA256_A`).
   - **File C (`source_3.txt`):** A differing text file with content hash `SHA256_C` (e.g., "Different payloads result in unique CAS blocks.").

### Manual Steps (Using Existing UI / API Only)

1. **Upload Initial Artifact Version (File A):**
   - Perform an upload of `source_1.txt` to logical path `config/settings.json` in project `proj_qa_dedup`.
   - Record the returned UUID for the first artifact version.
   
2. **Upload Identical Content to a Separate Path (File B):**
   - Ingest identical text `source_2.txt` to a completely separate logical path `deploy/config_mirror.json` within the same project.
   - Record the returned logical version pointer identifier.

3. **Incorporate Identical Content as a New Version on a Pre-existing Path:**
   - Upload the exact identical text `source_2.txt` back to the original logical path `config/settings.json` so it flags version number increment (v2).
   
4. **Upload Differing Content (File C) to Force New CAS Blob Entry:**
   - Upload `source_3.txt` to the path `config/settings.json` flagging version number increment (v3).

5. **Verify Persistence State in Database:**
   - Query the `cas_blobs` and `artifact_versions` tables (via administrative status checks or read-only SQL queries):
     ```sql
     -- Check CAS blobs mapped inside the target workspace
     SELECT id, content_hash, size_bytes FROM cas_blobs;
     
     -- Check logical version routes
     SELECT id, logical_path, version_number, cas_blob_id FROM artifact_versions WHERE project_id = 'proj_qa_dedup';
     ```

### Expected Results
- **Deduplication Check 1:** Both `config/settings.json` (v1) and `deploy/config_mirror.json` (v1) point to the exact same `cas_blob_id`.
- **Deduplication Check 2:** `config/settings.json` (v2) also points to the same `cas_blob_id`. No duplicate storage rows exist in `cas_blobs` for hash `SHA256_A`.
- **Unique Storage Check:** `config/settings.json` (v3) registers a completely new and distinct `cas_blob_id` corresponding to `SHA256_C`.
- **Audit Logs Emission:** The `audit_logs` table records `ARTIFACT_CAS_DEDUP_REUSED` on step 2 and step 3, showing correct telemetry mapping.

### Security Boundaries
- **Logical Sandbox Scoping:** Attempt uploading identical File A to a completely different project ID (e.g., `proj_sec_isolation`). Verify that deduplication is strictly **project-scoped**. Project B MUST create its own independent `cas_blobs` record to prevent vertical metadata leaks, even if cryptographic hashes match.
- **Audit Logging Security:** Check that no raw apiKeys, bearer tokens, or database connection strings are recorded inside the metadata audit structures during CAS assignments.

### Failure Warning Signs
- Multi-project identical CAS uploads reuse the same `cas_blob_id` across different project namespaces (this is a critical cross-project scope boundary collapse).
- Multiple identical uploads within the same project generate separate duplicate rows in the `cas_blobs` database table, causing storage bloat (indicates deduplication failure).
- Payload sizes exceeding 512KB do not fail dynamically or crash the api router with 500.

### Safety Boundaries
- Do not run manual CAS purge scripts or use deletion commands. The database CAS table should strictly remain append-only during the manual verification process.
- Do not utilize Snapshot execution layers or Rollback commands to revert versions during this lifecycle validation.
