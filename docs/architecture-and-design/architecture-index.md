# Y-OS Kernel Architecture Index

This index documents the Y-OS repository structure, its core modules, routing directories, database tables, and security mechanisms. Phase 31 is retained as a historical baseline.

---

## 1. Active Baseline Summary

The Y-OS Kernel is in active stabilization after **KMVP-014 (Artifact
Versioning & Content Addressable Storage MVP)**. `KDEBT-*` identifiers are
reserved for the canonical production-gap registry in
`docs/kernel-debt-register.md`.

* **Status:** Active stabilization and contract reconciliation.
* **Code Modification Policy:** Defect, security, test, documentation, and prioritized roadmap changes are permitted.
* **Scope Guardrail:** Destructive CAS cleanup, snapshot-restore frameworks, and sandboxed browser execution remain deferred until they have explicit designs and acceptance tests.

---

## 2. Historical MVP Milestones (KMVP)

These IDs describe delivered MVP milestones, not closed production debt:

| Track ID | Closed Core Module | Domain & Verified Deliverables |
| :--- | :--- | :--- |
| **KMVP-001** | CTX MVP | Multi-line text ingestion with automatic line/token budget parsing. |
| **KMVP-002** | GRAPH MVP | Incremental knowledge graph sync and weighted dependency mapping. |
| **KMVP-003** | RESUME MVP | Task pausing, checkpoint diff generation, and safe automated resume payloads. |
| **KMVP-004** | DEBUG MVP | Task diagnostic logs up to 500 lines with trace path redaction. |
| **KMVP-005** | RepoAdapter Core MVP | Safe relative file operations with explicit traversal protection (`../`). |
| **KMVP-006** | DB Local Job Queue MVP | Priority-based task orchestration and worker locks. |
| **KMVP-007** | Incremental Indexing MVP | Delta-scan signals with debounce behavior. |
| **KMVP-008** | AST Parser / Static Analysis | TypeScript AST symbol extraction with regex fallback. |
| **KMVP-009** | Retrieval Isolation MVP | Project-scoped retrieval without cross-project data return. |
| **KMVP-010** | Task Lifecycle FSM MVP | State transition service and history records. |
| **KMVP-011** | Quality Gate Orchestrator | Recorded check commands, redaction and run status. |
| **KMVP-012** | Evidence Store MVP | SHA-256 content-digest integrity and corruption indicators; no actor signatures. |
| **KMVP-013** | Event Store MVP | DB-trigger-protected append-only event records. |
| **KMVP-014** | Artifact Versioning / CAS | Project-scoped CAS with version lineage and de-duplication. |

See the migration table in the canonical debt register for old-ID traceability.

---

## 3. Y-OS System Taxonomy (42-Module Architecture Map)

Below is the canonical taxonomy map of the Y-OS kernel and application layers, annotated with their current implementation status to prevent false positives (as per the [Kernel Awareness Guardrail](file:///c:/Users/Trade%20Bilisim/Y-%E2%80%94-AI-Agent-Context-OS/docs/kernel-awareness-note.md)).

### 1. Mission Control `[Active MVP]`

* **1.1 System Overview**: High-level status cards in the client dashboard.
* **1.2 Active Missions**: Current execution projects list.
* **1.3 Current Objective**: Real-time active task goals.
* **1.4 Risk Radar**: Displays active lock contentions and failed quality checks.
* **1.5 Agent Activity**: Thread execution monitoring metrics.
* **1.6 Kernel Health**: Database connections and worker process status.
* **1.7 Recent Decisions**: Audit log registry of bypasses and overrides.

### 2. Projects `[Active MVP]`

* **2.1 All Projects**: Workspace project listing panel.
* **2.2 Project Detail**: Single project metadata and database attributes.
* **2.3 Project Workspace**: Folder views and active file adapters.
* **2.4 Project Files**: File index retrieved via `RepoAdapter`.
* **2.5 Project Tasks**: Lifecycle tasks tied to the active project.
* **2.6 Project Agents**: Active agent assignments on the project.
* **2.7 Project Timeline**: Chronological event logs of project modifications.
* **2.8 Project Settings**: ABAC permissions and path scope settings.

### 3. Missions `[Active MVP]`

* **3.1 Mission Brief**: Direct instructions and task context.
* **3.2 Mission Goals**: Verified deliverables list.
* **3.3 Mission Scope**: Whitelisted file paths directory.
* **3.4 Mission Constraints**: Traversal rules and size limitations.
* **3.5 Mission Progress**: Transition history from `task_status_history`.
* **3.6 Mission Outcomes**: Final artifacts generated.

### 4. Task Board `[Active MVP]`

* **4.1 Backlog**: Tasks waiting to be claimed.
* **4.2 Active Tasks**: Tasks currently running in the task queue.
* **4.3 Paused Tasks**: Paused tasks with checkpoint states.
* **4.4 Blocked Tasks**: Tasks blocked by locks or errors.
* **4.5 Completed Tasks**: Finished tasks with verified reports.
* **4.6 Failed Tasks**: Aborted tasks with failure evidence.
* **4.7 Task Priorities**: Weight-based queue ranking.

### 5. Task Detail `[Active MVP]`

* **5.1 Task Summary**: Description and status logs.
* **5.2 Task Requirements**: Expected acceptance criteria check-items.
* **5.3 Task Context**: Token-budgeted Context Packs.
* **5.4 Task Files**: Target source files list.
* **5.5 Task Subtasks**: Segment lists of target files.
* **5.6 Task History**: Complete audit logs of changes.
* **5.7 Task Evidence**: Test results and lint logs stored in the DB.
* **5.8 Task Artifacts**: Versioned CAS files.

### 6. Task Lifecycle FSM `[Active MVP]`

* **6.1 Pending**: Initial task creation state.
* **6.2 Running**: Active agent workspace lease.
* **6.3 Paused**: State saving checkpoints in `agent_memories`.
* **6.4 Blocked**: Critical gate failure or file lock contention.
* **6.5 Completed**: All quality gates pass and final report is created.
* **6.6 Failed**: Terminated by error or consecutive failed gates.
* **6.7 Cancelled**: Manually stopped by a developer.
* **6.8 Admin Override**: Authorized bypasses documented in audit logs.
* **6.9 Transition History**: Chronological transition audits.

### 7. Agent Hub `[Active MVP]`

* **7.1 All Agents**: Registry of models, configurations, and tools.
* **7.2 Active Agents**: Running task runner sessions.
* **7.3 Idle Agents**: Available models waiting for job queue.
* **7.4 Failed Agents**: Terminated sessions due to timeouts or errors.
* **7.5 Agent Capabilities**: Tools and model scopes register.
* **7.6 Agent Assignment**: Locks task target to a specific agent key.

### 8. Agent Roles `[Active MVP]`

* **8.1 Orchestrator Agent**: Control plane agent routing task jobs.
* **8.2 Intake Agent**: Context ingestion and loader coordinator.
* **8.3 Context Agent**: Token budget selector and compressor.
* **8.4 Research Agent**: AST code-graph traverser.
* **8.5 Planning Agent**: Implementation planner generator.
* **8.6 Implementation Agent**: Code modification writer.
* **8.7 QA Agent**: Verification script and test runner.
* **8.8 Security Agent**: Secret scrub and scope policy verifier.
* **8.9 Evidence Agent**: Cryptographic hash integrity recorder.
* **8.10 Artifact Agent**: CAS blob builder and loader.
* **8.11 Review Agent**: Handles human review requests.
* **8.12 Documentation Agent**: Updates reports and logs.
* **8.13 Resume Agent**: Continuity restorer on recovery triggers.

### 9. Agent Sessions `[Active MVP]`

* **9.1 Session List**: Table of current sessions.
* **9.2 Session Detail**: Model, token usage, and status.
* **9.3 Session State**: In-memory execution snapshots.
* **9.4 Session Logs**: Redacted agent stdout trace.
* **9.5 Session Recovery**: Resuming from `resume_states` snapshot.
* **9.6 Session Archive**: Inactive sessions stored in Postgres.

### 10. Agent Timeline `[MVP Simulated/Mock]`

* **10.1 Chronological Timeline**: Unified view aggregating checkpoints, event logs, and status transitions.
* **10.2 Major Decisions**: Timeline pins representing manual overrides or commits.
* **10.3 Failed Attempts**: Quality gate errors and validation crashes.
* **10.4 Recovery Attempts**: Timeline logs of resume events.
* **10.5 Agent Handoffs**: Transitions from one model key to another.
* **10.6 Timeline Filters**: User controls to filter timeline DTO metrics.
* **10.7 Timeline Rebuild**: Database projection from the event ledger.

### 11. Agent Memory `[Active MVP]`

* **11.1 Persistent Memories**: Historical learnings saved between tasks.
* **11.2 Task Memories**: In-progress variable states.
* **11.3 Project Memories**: General patterns registered on the target repo.
* **11.4 Agent Notes**: Informal summaries written during execution.
* **11.5 Memory Expiration**: Time-to-live settings for context chunks.
* **11.6 Memory Retrieval**: Semantic grounding query system.

### 12. Handoff System `[Active MVP]`

* **12.1 Handoff Packages**: Serialized JSON payloads with workspace memory.
* **12.2 Agent-to-Agent Handoff**: Transfers state between models.
* **12.3 Human-to-Agent Handoff**: `[MVP Simulated/Mock]` Human instruction processing.
* **12.4 Resume Payload**: Git diff snapshots and checkpoint states.
* **12.5 Handoff Validation**: Structural checks on package inputs.
* **12.6 Handoff Timeline**: Logs tracing model custody changes.

### 13. Context Vault `[Active MVP]`

* **13.1 Context Objects**: Normalized data models for all workspace files.
* **13.2 Source Files**: Original text files raw contents.
* **13.3 Summaries**: Extracted summaries for large source documents.
* **13.4 Context Packs**: Bounded **50K Token** context packages.
* **13.5 Custom References**: Pin files and custom links added by the user.
* **13.6 Derived Context**: Generated AST graphs and relation weight metrics.
* **13.7 Graph Context**: Neighborhood file lists based on reverse dependencies.
* **13.8 Retrieval Candidates**: Pre-ranked items list before compression.

### 14. Context Object Store `[Active MVP]`

* **14.1 Object Registry**: Mapping table of raw context files in Postgres.
* **14.2 Object Detail**: Schema, hash values, authority and freshness metrics.
* **14.3 Object References**: Extracted hyperlink pointers.
* **14.4 Active Objects**: Currently indexed, up-to-date files.
* **14.5 Stale Objects**: Deprecated records flagged for reindexing.
* **14.6 Quarantined Objects**: Files flagged due to syntax errors or security blocks.
* **14.7 Content Hashes**: SHA-256 integrity keys.
* **14.8 Payload Preview**: File content text previews in client drawer.

### 15. Context Pack Builder `[Active MVP]`

* **15.1 Pack Assembly**: Merging files, AST symbols, and policies.
* **15.2 Token Budget**: Token limit check verifying the 50K boundary.
* **15.3 Source Selection**: Filters out irrelevant imports.
* **15.4 Compression**: Condenses large logs or summaries.
* **15.5 Relevance Ranking**: Ranks items using similarity metrics.
* **15.6 Pack Preview**: Tree view of what enters the LLM prompt.
* **15.7 Pack Export**: Export as JSON for API consumption.

### 16. Retrieval Engine `[Active MVP]`

* **16.1 Search Server**: Bounded search service running inside `apps/api`.
* **16.2 Keyword Search**: Full-text query on file contents.
* **16.3 Semantic-Like Ranking**: PostgreSQL similarity scoring.
* **16.4 Candidate Scoring**: Combines authority, recency, and user pins.
* **16.5 Scope Isolation**: Enforces project boundary (cross-project block).
* **16.6 Query Debugging**: Details showing why a file matched.

### 17. Knowledge Graph `[Active MVP]`

* **17.1 Graph Overview**: Node-link dataset index.
* **17.2 Nodes**: Files, components, or databases represented as vertex entries.
* **17.3 Edges**: Weight relationships showing reference strength.
* **17.4 Reverse Dependencies**: Finding files that import the target module.
* **17.5 Impact Radius**: Simulation mapping affected paths.
* **17.6 Graph Sync**: Syncs DB nodes on file change events.
* **17.7 Graph Verification**: Validating no orphan or circular relationships exist.

### 18. Code Graph `[Active MVP]`

* **18.1 File Nodes**: Source paths catalog.
* **18.2 Import Edges**: ES Module imports registry.
* **18.3 Export Edges**: ES Module exports registry.
* **18.4 Component Links**: UI components hierarchies.
* **18.5 API Route Links**: Express route to controller bindings.
* **18.6 Database Table Links**: Controllers to table triggers references.

### 19. Repository Explorer `[Active MVP]`

* **19.1 Repo Tree**: Interactive frontend file explorer.
* **19.2 Safe File Reader**: Blocked paths validator.
* **19.3 File Metadata**: File sizes and permissions.
* **19.4 Forbidden Paths**: Traversal blocks list (`.env`, `.pem`, etc.).
* **19.5 Repo Boundaries**: Project folder root constraints.
* **19.6 File Preview**: Syntax-highlighted code viewer.

### 20. RepoAdapter Core `[Active MVP]`

* **20.1 Path Normalization**: Resolves local/system directory separators.
* **20.2 Traversal Protection**: Intercepts `../` parameters.
* **20.3 Safe Read**: Enforces whitelist read check.
* **20.4 Safe Write**: Blocks modification outside workspace.
* **20.5 Safe List**: Directory listing exclusion filters.
* **20.6 Secret Redaction**: Scrubs credentials from file writes.
* **20.7 Size Guards**: Max file size limits check.

### 21. Static Analysis `[MVP Simulated/Mock]`

* **21.1 AST Parser**: Structural symbol parser using regex fallbacks.
* **21.2 Imports**: Extracted dependencies register.
* **21.3 Exports**: Public interface declarations.
* **21.4 JSX Components**: Renders linkages mapping.
* **21.5 Express Routes**: API bindings endpoints.
* **21.6 Database References**: SQL statements references mapping.
* **21.7 Syntax Fallbacks**: Fallback on broken syntax files.

### 22. Incremental Indexing `[Active MVP]`

* **22.1 Delta Scanner**: Watched filesystem changes recorder.
* **22.2 File Change Events**: Queue indexing jobs on modification.
* **22.3 Debounce Rules**: Debounces rapid change triggers.
* **22.4 Index Job Creation**: Inserts work item into DB queue.
* **22.5 Incremental Sync**: Only syncs changed files context.
* **22.6 Index Status**: Visual indicator of indexing progress.

### 23. Local DB Job Queue `[Active MVP]`

* **23.1 Index Jobs**: DB-stored queue tasks.
* **23.2 Pending Jobs**: Unclaimed jobs waiting for heartbeat worker.
* **23.3 Processing Jobs**: Locked jobs currently in execution.
* **23.4 Completed Jobs**: Finished jobs historical logs.
* **23.5 Failed Jobs**: Tasks terminated due to retry overflow.
* **23.6 Retry Attempts**: Incremental retry loops counters.
* **23.7 Queue Telemetry**: Average wait time and worker throughput stats.

### 24. Worker Runtime `[Active MVP]`

* **24.1 Worker Registry**: Registered worker processes in database.
* **24.2 Worker Detail**: Metadata, platform OS, and thread count.
* **24.3 Heartbeats**: Live heartbeats verifying active worker status.
* **24.4 Active Job Count**: Concurrency allocation.
* **24.5 Worker Pause**: Stops workers from claiming new tasks.
* **24.6 Worker Stop**: Gracefully shutdowns worker processes.
* **24.7 Worker Logs**: Standalone worker stdout traces.
* **24.8 Stale Worker Recovery**: `[MVP Simulated/Mock]` Automatically releases locks from timed-out workers.

### 25. File Locking `[Active MVP]`

* **25.1 File Locks Registry**: Table of currently leased files.
* **25.2 Read Locks**: Concurrent read allocations.
* **25.3 Write Locks**: Exclusive write leases.
* **25.4 Active Locks**: Active leases before expiration.
* **25.5 Released Locks**: Archive of historical locks.
* **25.6 Expired Locks**: Auto-expired locks due to task timeouts.
* **25.7 Blocked Attempts**: Logged write collisions.
* **25.8 Stale Lock Release**: Cleans up locks from crashed tasks.

### 26. Permission Kernel / ABAC `[Active MVP]`

* **26.1 Permission Matrix**: Grid view displaying Subject/Resource bindings.
* **26.2 Policy List**: PostgreSQL-based ABAC rule rows.
* **26.3 Policy Tester**: `[MVP Simulated/Mock]` Client-side policy checker drawer.
* **26.4 Evaluation Ledger**: Audited logs of all bypasses and denials.
* **26.5 Default Deny**: Denies access if no policy exists.
* **26.6 Deny Overrides Allow**: Absolute deny overriding rule.
* **26.7 Admin Override**: Special Developer/Owner role overrides.
* **26.8 Permission Audit**: Diagnostic checks verifying permissions integrity.

### 27. Security Model `[Active MVP]`

* **27.1 Subject Model**: Principal (User, System, Agent) definitions.
* **27.2 Resource Model**: Files, database rows, or settings records.
* **27.3 Action Model**: Read, Write, Delete, Audit, and Bypass triggers.
* **27.4 Sensitivity Classes**: Tags marking credential lists or private paths.
* **27.5 Project Boundary**: Isolation rules between project environments.
* **27.6 Task Boundary**: File whitelist for active tasks.
* **27.7 Worker Boundary**: Isolation parameters for running queue jobs.
* **27.8 Resource Boundary**: Custom whitelists for third-party adapters.

### 28. Secret Redaction `[Active MVP]`

* **28.1 Database URL Redaction**: Masks `postgres://` details.
* **28.2 Bearer Token Redaction**: Masks API Bearer headers.
* **28.3 API Key Redaction**: Masks `sk-proj-...` and Gemini keys.
* **28.4 Certificate Redaction**: Masks certificate keys.
* **28.5 Private Key Redaction**: Masks RSA SSH keys.
* **28.6 Absolute Path Redaction**: Converts local system directories to relative format.
* **28.7 Redaction Audit**: Log files tracking scrub volumes.

### 29. Quality Gate Orchestrator `[Active MVP]`

* **29.1 Quality Gate Runs**: Table of validation executions.
* **29.2 Run Detail**: Commands executed and exit statuses.
* **29.3 Manual Command Ingestion**: Ingests custom scripts commands.
* **29.4 Command Results**: Verifies exit codes to proceed or fail.
* **29.5 Redacted Logs**: Redacts absolute paths from quality gate outputs.
* **29.6 Aggregate Status**: Green exit status check.
* **29.7 Gate History**: Log tracing historical gate runs.

### 30. Quality Commands `[Active MVP]`

* **30.1 Lint**: Executes `npm run lint`.
* **30.2 Typecheck**: Executes `npm run typecheck`.
* **30.3 Build**: Executes `npm run build`.
* **30.4 Test**: Executes unit tests and integrations.
* **30.5 Secret Scan**: Runs real-time regex scanner.
* **30.6 Debug Tag Scan**: Flags forbidden staging logs.
* **30.7 DB Status**: Verifies database connection parameters.
* **30.8 Validation Scripts**: Executes stage/segment validators.

### 31. Evidence Store `[Active MVP]`

* **31.1 Evidence Records**: Postgres table containing verification assertions.
* **31.2 Evidence Detail**: Status, linked task, and metadata tags.
* **31.3 Evidence Types**: Logs, test results, and browser screenshots.
* **31.4 Evidence Status**: Verified vs. Tampered markers.
* **31.5 Hash Verification**: Validates SHA-256 hashes of payloads.
* **31.6 Corruption Detection**: Alerts on manual record mutations.
* **31.7 Evidence Explorer**: Interactive evidence ledger panel.

### 32. Event Store `[Active MVP]`

* **32.1 Event Journal**: Append-only Postgres events table.
* **32.2 Event Detail**: UUID keys, causation/correlation IDs, and payloads.
* **32.3 Event Types**: System-wide lifecycle transaction events.
* **32.4 Append-Only Ledger**: Protected via Postgres immutability triggers.
* **32.5 Idempotency Keys**: Prevents duplicate transaction recordings.
* **32.6 Mutation Blockers**: Reject trigger operations.
* **32.7 Event Audit**: Exposes audit logs detailing event sequences.

### 33. Artifact Center `[Active MVP]`

* **33.1 Artifact Registry**: PostgreSQL-backed versions database.
* **33.2 Artifact Detail**: Creator, generation dates, and content hashes.
* **33.3 Artifact Types**: Walks, plans, and reports index.
* **33.4 Artifact Status**: Active vs. Superseded version indicators.
* **33.5 Artifact Metadata**: Scoping variables and dependency lists.
* **33.6 Artifact Versions**: Lineage tracking lists.
* **33.7 Version History**: Walks the parent version links.
* **33.8 Artifact Preview**: Markdown reader drawer.

### 34. Artifact Versioning / CAS `[Active MVP]`

* **34.1 CAS Blobs**: Content Addressable Storage binary values table.
* **34.2 Artifact Versions**: Versions catalog.
* **34.3 Content Hashes**: SHA-256 identifier keys.
* **34.4 Deduplication**: Prevents duplicate uploads of unchanged files.
* **34.5 Version Numbers**: Sequential integer keys.
* **34.6 Parent Version Links**: Parent artifact pointer.
* **34.7 Superseded Versions**: Flags old artifacts as superseded.
* **34.8 CAS Stats**: Space savings telemetry from de-duplication.

### 35. Reports `[Active MVP]`

* **35.1 Project Report**: Overall project health.
* **35.2 Task Report**: Individual task outcomes.
* **35.3 Agent Report**: Resource usage and token logs.
* **35.4 Quality Report**: Gates summary and test runs.
* **35.5 Evidence Report**: Ledger health and integrity checklist.
* **35.6 Event Report**: Audit timeline.
* **35.7 Artifact Report**: CAS version changes overview.
* **35.8 Worker Report**: Concurrency allocations statistics.
* **35.9 Permission Report**: Bypass logs.

### 36. Debug / Diagnostics `[Active MVP]`

* **36.1 Debug Console**: Live stdout console inside the dashboard.
* **36.2 Error Logs**: Aggregated stack traces.
* **36.3 Warning Logs**: Lint alerts and deprecations.
* **36.4 Security Logs**: ABAC bypass attempts and redaction occurrences.
* **36.5 Diagnostic Search**: Regex search across task console logs.
* **36.6 Redaction Sandbox**: Checks redaction outputs safely.
* **36.7 Failure Analysis**: Pinpoints failing quality gate components.
* **36.8 Recovery Notes**: Notes saved during runtime crashes.

### 37. Observability `[Active MVP]`

* **37.1 System Health**: API and DB check metrics.
* **37.2 Worker Health**: Heartbeat registry table.
* **37.3 Queue Health**: Backlog stats.
* **37.4 Lock Contention**: Logged lock collisions metrics.
* **37.5 Quality Trends**: Historical gate failures count.
* **37.6 Permission Denials**: ABAC block incidents chart.
* **37.7 Audit Volume**: Scored records output.
* **37.8 Storage Metrics**: CAS blob space utilization graphs.

### 38. Documentation `[Active MVP]`

* **38.1 Architecture Index**: Taxonomy and file registers at [architecture-index.md](file:///c:/Users/Trade%20Bilisim/Y-%E2%80%94-AI-Agent-Context-OS/docs/architecture-and-design/architecture-index.md).
* **38.2 Agent Specification**: Standard rules and identities at [agent.md](file:///c:/Users/Trade%20Bilisim/Y-%E2%80%94-AI-Agent-Context-OS/docs/agent-rules-topology/agent.md).
* **38.3 Agent Execution Loop**: States, FSM transitions and visuals at [loop.md](file:///c:/Users/Trade%20Bilisim/Y-%E2%80%94-AI-Agent-Context-OS/docs/agent-rules-topology/loop.md).
* **38.4 Agent Loop Run Log**: Historical executions tracking and logs at [loop-run-log.md](file:///c:/Users/Trade%20Bilisim/Y-%E2%80%94-AI-Agent-Context-OS/docs/agent-rules-topology/loop-run-log.md).
* **38.5 Kernel Debt Register**: Production debt and schema migration register at [kernel-debt-register.md](file:///c:/Users/Trade%20Bilisim/Y-%E2%80%94-AI-Agent-Context-OS/docs/security-boundaries/kernel-debt-register.md).
* **38.6 Database Foundation Guide**: DB configuration specifications and audits at [database-foundation.md](file:///c:/Users/Trade%20Bilisim/Y-%E2%80%94-AI-Agent-Context-OS/docs/database-ops/database-foundation.md).
* **38.7 Permission Kernel Audit**: Endpoint coverage checks and ABAC testing notes at [permission-kernel-audit.md](file:///c:/Users/Trade%20Bilisim/Y-%E2%80%94-AI-Agent-Context-OS/docs/security-boundaries/permission-kernel-audit.md).
* **38.8 Manual QA Checklist**: Multi-module diagnostic step-by-step verification flows at [manual-qa-checklist.md](file:///c:/Users/Trade%20Bilisim/Y-%E2%80%94-AI-Agent-Context-OS/docs/qa-ui-standards/manual-qa-checklist.md).
* **38.9 Backlog Prioritization**: Categorized visual features list and constraints at [backlog-prioritization.md](file:///c:/Users/Trade%20Bilisim/Y-%E2%80%94-AI-Agent-Context-OS/docs/qa-ui-standards/backlog-prioritization.md).
* **38.10 UI Accessibility Notes**: Visual contrast rules and styles guidelines at [ui-accessibility-notes.md](file:///c:/Users/Trade%20Bilisim/Y-%E2%80%94-AI-Agent-Context-OS/docs/qa-ui-standards/ui-accessibility-notes.md).
* **38.11 Engineering Kernel Explanation**: Primitives and Event Sourcing designs at [y-engineering-kernel-explanation.md](file:///c:/Users/Trade%20Bilisim/Y-%E2%80%94-AI-Agent-Context-OS/docs/architecture-and-design/y-engineering-kernel-explanation.md).
* **38.12 Y-OS Database Constraints**: Immutability trigger checks and triggers guidelines at [y-architecture-schema.md](file:///c:/Users/Trade%20Bilisim/Y-%E2%80%94-AI-Agent-Context-OS/docs/architecture-and-design/y-architecture-schema.md).
* **38.13 Kernel Awareness Note**: MVP vs. production-kernel boundaries at [kernel-awareness-note.md](file:///c:/Users/Trade%20Bilisim/Y-%E2%80%94-AI-Agent-Context-OS/docs/security-boundaries/kernel-awareness-note.md).
* **38.14 Multi-Agent Network Topology**: Agent roles, interaction sequences, and failure boundaries at [agent-network-topology.md](file:///c:/Users/Trade%20Bilisim/Y-%E2%80%94-AI-Agent-Context-OS/docs/agent-rules-topology/agent-network-topology.md).

### 39. Stabilization / Release Readiness `[Active MVP]`

* **39.1 Manual QA Dry Runs**: Executing manual checks from checklist.
* **39.2 Deployment Readiness**: Verification gates validation.
* **39.3 Security Regression Review**: Secrets and traversal checks review.
* **39.4 Validation Command Index**: Runs tsx validators.
* **39.5 Source-of-Truth Audit**: Check file consistency.
* **39.6 Release Sign-Off**: Verification logs sign-off checklist.
* **39.7 Freeze Status**: Current baseline status.

### 40. Backlog `[Active MVP]`

* **40.1 Immediate Documentation / QA**: Priority docs edits.
* **40.2 Stabilization Backlog**: UI styling changes.
* **40.3 Future Product Phase**: `[Future Stage]` Deferred plans.
* **40.4 Forbidden Until Roadmap Update**: Purges and migrations blocker.
* **40.5 UI Polish**: Typography and spacing adjustments.
* **40.6 Product Enhancements**: Custom tagging.
* **40.7 Post-MVP Maturity Items**: High-grade orchestrations.

### 41. Settings `[Active MVP]`

* **41.1 Project Settings**: Database credentials configuration.
* **41.2 Agent Settings**: Active model keys registration.
* **41.3 Context Settings**: Target token limits configurations.
* **41.4 Worker Settings**: Concurrency allocations thresholds.
* **41.5 Permission Settings**: ABAC permissions editor.
* **41.6 Quality Gate Settings**: Script command list variables.
* **41.7 Security Settings**: Redaction whitelist configuration.
* **41.8 UI Settings**: Color themes and density preferences.

### 42. System Boundaries `[Active MVP]`

* **42.1 Frozen Kernel Scope**: Immutable kernel boundaries.
* **42.2 Closed KDEBT Items**: Completed remediation files.
* **42.3 Out-of-Scope KDEBT Items**: Unimplemented core features.
* **42.4 Forbidden Runtime Changes**: Strict checks blocking modifications.
* **42.5 Forbidden Migrations**: Block direct database schema updates.
* **42.6 Forbidden Endpoints**: Blocks unauthenticated routes.
* **42.7 No-Action Hold**: Halts risky tasks on block status.

---

## 4. Core Directory & File Indexes

### Core Backend Services (`apps/api/src/`)

* **`PermissionKernelService.ts`**: Core ABAC checking engine enforcing subject / action / resource boundaries.
* **`ArtifactCASService.ts`**: Manages CAS blob storage, de-duplication checks, and logical file path version tracking.
* **`ContextObjectStoreService.ts`**: Context object workspace cacher, stale marker, and quarantined reference system.
* **`EventStoreService.ts`**: High-integrity appending service for recording transactions in event tables.
* **`EvidenceStoreService.ts`**: Validates evidence state blocks and detects potential tampering or corruption.
* **`FileLockingService.ts`**: Distributed lock leases manager handling read/write lock isolation policies.
* **`QualityGateService.ts`**: Standardized wrapper executing builds, tests, linter routines, and credentials scanning.
* **`TaskLifecycleService.ts`**: Enforces strict state machines over project tasks.
* **`WorkerRuntimeService.ts`**: Manages local worker lifecycle registration, concurrency, and job assignments.
* **`db.ts`** / **`index.ts`** / **`config.ts`**: Database pool clients, Express API routers, and central configurations.

### Core Frontend Panels (`apps/web/src/components/`)

* **`ArtifactCenterPanel.tsx`**: Interface for CAS artifacts catalog, logical paths index, and version lineage walk.
* **`FileLockingPanel.tsx`**: Renders active distributed leases, expiration status, and path boundaries.
* **`PermissionKernelPanel.tsx`**: Policy rules table, mock evaluator, and authorization bypass checks.
* **`WorkerRuntimeDashboard.tsx`**: Displays registered workers, active heartbeats, concurrency counters, and processing queues.
* **`App.tsx`**: Core client frame state manager orchestrating tabs, workspace projects, and current selections.

### Shared Structs (`packages/shared/src/`)

* **`index.ts`**: Defines typing models, enum schemas, transition states, and audit actions across API and Frontend builds.

---

## 5. Database Schema Index

Below is the verified record tables structure present inside the active Postgres database:

1. **`schema_migrations`**: Database schema migration history state.
2. **`projects`**: Workspace projects container rows.
3. **`tasks`**: Project tasks and their lifecycle state machines.
4. **`task_status_history`**: Historic status logs representing Task status transitions.
5. **`evidence_records`**: SHA-256 content-digest assertions used to detect payload changes; actor signatures are not implemented.
6. **`event_records`**: Append-only transaction ledger protected by PostgreSQL triggers.
7. **`audit_logs`**: Trace log record repository documenting security and bypass decisions.
8. **`file_locks`**: Distributed read/write lease details pointing to resource paths.
9. **`worker_registry`**: Worker statuses, concurrency limits, and active threads.
10. **`index_jobs`**: Job scheduling, queues, prioritizing weight values, and attempts.
11. **`context_objects`** / **`context_object_refs`**: Context item metadata registry and link identifiers.
12. **`cas_blobs`** / **`artifact_versions`**: Content addressable storage binary mappings and logical path lineages.

---

## 6. Express API Router Classification

* **Authentication & Ingress Boundaries:** Express standard Middlewares checks (`requireProjectScope`) verifying identity access bounds.
* **Project & Task Controllers:** CRUD operations over workspace tasks and project attributes.
* **Context Vault & Indexing Routes:** Ingestion handlers, chunk queries, search grounding endpoints, and worker queue bindings.
* **Locks & Workers Interfaces:** Heartbeats, lease acquisitions, sweeps, and execution heartbeats.
* **Gateways & Forensics Audits:** Audit logs retrieve feeds, quality gate runs, and cryptographic evidence lists.
* **Artifacts CAS Catalog:** Safe metadata streams and content retrieval paths.

---

## 7. Validation Scripts Register

Validation test files placed under `/scripts/` coordinate stage and segment verification:

* **Stage Validators (`scripts/validate-stage-*.ts`):**
  * `validate-stage-27.ts`: Task FSM Transitions validation.
  * `validate-stage-28.ts`: Quality Gate build validation.
  * `validate-stage-29.ts`: Cryptographic Evidence Verification validation.
  * `validate-stage-30.ts`: Append-Only Event Store validation.
  * `validate-stage-31.ts`: ContextObject Store validation.
  * `validate-stage-32.ts`: Worker Queue and Heartbeat validation.
  * `validate-stage-33.ts`: Distributed lease locking validation.
  * `validate-stage-34.ts`: Active ABAC Policies kernel validation.
  * `validate-stage-35.ts`: Content Addressable Artifact mapping validation.
* **Segment Validators (`scripts/validate-segment-*.ts`):**
  * `validate-segment-1-10.ts`: Validates stages 1-10 (Core context vault parsing & semantic sync).
  * `validate-segment-11-14.ts`: Validates stages 11-14 (Static analysis AST & static graphs).
  * `validate-segment-15-18.ts`: Validates stages 15-18 (Agent memories, resume engines, and timelines).
  * `validate-segment-19-21.ts`: Validates stages 19-21 (Handoff structures & debug diagnostics).
  * `validate-segment-20-26.ts`: Validates stages 20-26 (Repository adapters, SSL certificates, AST static analyses).

---

## 8. Security & Redaction Systems

Y-OS utilizes rigorous defensive utilities processing variables, directories, and files:

* **Secret Redaction Filters:** Systematic scanners analyzing strings to mask passwords, RSA blocks, API connection secrets, and Gemini keys `[REDACTED]`.
* **Path Conversion Sanitization:** Converts machine absolute directories into safe relative formats context.
* **Directory Blacklist Blocking:** Repository adapter hard blocks reading or editing system-sensitive files (`.env`, `.pem`, `.key`, `node_modules`, `dist`).
* **Trigger-Enforced Immutability:** Append-only database triggers block any administrative edits or direct DELETE commands over transactions.

---

## 9. Backlog Segregation & Boundaries

To preserve Kernel integrity, future backlog expansions must strictly segment into safe UI polishes versus forbidden backend mutations:

### Non-Invasive UI Backlog (Safe to Customize)

* **Search Metadata Filter Input:** Live search bar on logical CAS artifacts by metadata tagging.
* **Worker & Locks CSV Exporter:** Expose queue statistics into download format.
* **Visual Branch Lineage Canvas:** SVG or HTML layout illustrating v1 ➔ v2 artifact chain updates.
* **Workspace Theme Kit:** Color palette configurations.

### Forbidden Backend Backlog (Do Not Implement)

* **Automated Expire Cleanup Daemons:** Direct backend routines performing CAS blob garbage collection.
* **Compare API routes comparing bytes:** API controllers comparing text or binary bytes side-by-side.
* **Incremental Directory Snapshots:** Creating full package tarball states mimicking virtual machines.
* **Client Sandbox Executions:** Running worker code in browser-generated runtime frames.
* **Direct DB Migrations Post-31 Baseline:** DB schema modifications or new columns generation.
