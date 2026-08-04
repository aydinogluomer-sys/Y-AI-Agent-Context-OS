# Y — AI Agent Context Operating System

Y is a high-performance, security-hardened Context Operating System designed to orchestrate massive project codebases and metadata into compact, model-friendly **50K Token Context Packs** for advanced coding agents.

This repository contains the active MVP kernel and its stabilization work. The former Phase 31 freeze is a historical baseline, not an active code lock.

---

## Modular Monorepo Architecture

Y is organized as a high-integrity **pnpm monorerepo** with clear separation of concerns across applications, shared libraries, and target agent capabilities:

### Applications (`apps/`)

* **`apps/web`**: React context orchestration dashboard, visual traverser, and minimalist chat cockpit. Renders interactive SVG AST dependency maps, redaction comparisons, and audit ledger details.
* **`apps/api`**: Express control plane, safe config loader, migration execution layer, and security-aware routing.

### Packages (`packages/`)

* **`packages/shared`**: Canonical core TypeScript error types, scoping structures, and shared data interfaces.
* **`packages/security`**: Multi-pattern credential redaction engine and read-only default security policies.
* **`packages/core`**: Business logic helpers and platform feasibility assessment engines.
* **`packages/context`**: Context compressions ratios, segment rankers, and stubs.
* **`packages/graph`**: AST traversal, dependency tracking, and impact radius projection engines.
* **`packages/agents`**: Session checkpoints, chronological autochecks, and continuation stubs.
* **`packages/connectors`**: Extensible SaaS sync states and third-party credential stubs.
* **`packages/providers`**: AI model routing capabilities and Google SDK connector adapters.
* **`packages/ui`**: High-contrast visual tokens and UX consistency benchmarks.
* **`packages/node-domexception`**: Custom DOMException polyfills for Node environments.

### Core Entry (`src/` & Root)

* **`src/main.tsx`**: React client initialization bootstrapping theme settings and layouts.
* **`src/index.css`**: Design tokens, high-contrast accessible properties, and glassmorphism animation effects.
* **`src/types.ts`**: Core client workspace models, active project interfaces, and telemetry.
* **`server.ts`**: Express backend entry point managing database connections, API routes, and production SSR rendering logic.

---

## Under the Hood: 9 Y-OS Core Backend Engines/Services

Y-OS operations are driven by **9 dedicated core backend engines/services** implemented in [apps/api/src/](apps/api/src/) and [packages/core/src/](packages/core/src/):

### 1. Content-Addressable Storage (CAS) Engine

Managed by [ArtifactCASService.ts](apps/api/src/ArtifactCASService.ts):

* **Byte Deduplication**: Splits incoming files into chunks, registers uniqueness by SHA-256 hashes, and maps logical files to physical CAS blobs.
* **Integrity Auditing**: Computes hash values on read/write to prevent silent data corruption or tampering.

### 2. Context Compactor & Registry Engine

Managed by [ContextObjectStoreService.ts](apps/api/src/ContextObjectStoreService.ts):

* **Normalizer**: Standardizes files and folders into unified `ContextObject` entities.
* **Compaction Compiler**: Tracks AST dependencies and compacts target codes into a token-budgeted 50K pack, reporting compression ratios in real-time.

### 3. Forensic Audit & Evidence Ledger

Managed by [EventStoreService.ts](apps/api/src/EventStoreService.ts) and [EvidenceStoreService.ts](apps/api/src/EvidenceStoreService.ts):

* **Cryptographic Event Journaling**: Creates tamper-evident logs signed with SHA-256 signatures for every action.
* **Evidence Validation**: Tracks verified vs corrupted file counts, publishing indicators to the frontend health gauge widget.

### 4. Task Process File Locking Service

Managed by [FileLockingService.ts](apps/api/src/FileLockingService.ts):

* **Concurrent Lock Manager**: Prevents race conditions by granting time-bounded write leases to active tasks.
* **Conflict Resolution**: Rejects write operations to a file that has an active lock lease held by another task.

### 5. ABAC Policy Authorization Kernel

Managed by [PermissionKernelService.ts](apps/api/src/PermissionKernelService.ts):

* **Attribute-Based Access Control**: Enforces default-deny access matrices checking caller roles (Guest, Developer, Admin) against target files.
* **Path Traversal Interceptor**: Shields the filesystem from parent folder extraction sequences (`../`).

### 6. Static Quality Gates Validator

Managed by [QualityGateService.ts](packages/core/src/QualityGateService.ts):

* **Secret Exposure Protection**: Scans staged or loaded buffers for secrets, database passwords, or private key templates before compilation.
* **Debug-Tag Checker**: Rejects files containing developer test modifiers (e.g. `fdescribe`, `fit`) to keep production code clean.

### 7. FSM Task Lifecycle Transition Engine

Managed by [TaskLifecycleService.ts](apps/api/src/TaskLifecycleService.ts):

* **Lifecycle State Machine**: Runs tasks through a strict Finite State Machine flow (`Backlog` ➔ `Active` ➔ `Verified` ➔ `Closed`).
* **Console Logger**: Streams FSM transition logs dynamically to the cockpit console widget.

### 8. Background Worker Thread Coordinator

Managed by [WorkerRuntimeService.ts](apps/api/src/WorkerRuntimeService.ts):

* **Process Spawner**: Schedules index sync loops, git repo tracking, and AST compilation tasks as background workers.
* **Telemetry Monitors**: Measures system loads, compilation times, and indexing delays.

### 9. Database Connection & Migration Engine

Managed by [db.ts](apps/api/src/db.ts):

* **Supabase Pool Manager**: Controls connection pool scaling, query timeout parameters, and idle connection closures.
* **Idempotent Schema Migrations**: Runs schema checking operations, verifying table existence before running migrations.

---

## Core Repository Adapters & Workspace Handlers

The low-level file integrations and filesystem boundaries are managed by core services inside [packages/core/src/](packages/core/src/):

### 1. Repository Adapter (`repo-adapter.ts`)

* **Workspace Scoping**: Restricts all file lookups, tree listings, and content reads strictly to the task's allowed paths boundary.
* **Path Traversal Guard**: Prevents parent directory references (`../`) or absolute host directories traversal.
* **Lease Verification**: Integrates directly with the locking kernel to reject file edits unless a valid process lock lease is active.

### 2. Static AST Code Analysis (`static-analysis.ts`)

* **ESM Imports Resolver**: Compiles TypeScript nodes and parses ES modules import/export linkages to map dependencies.
* **Symbol Extraction**: Resolves custom variables, classes, and exported symbols.
* **Syntax Fault Recovery**: Falls back to regex pattern-matching heuristics if compilation fails due to broken syntax.

### 3. Incremental Indexing Engine (`incremental-index-service.ts`)

* **File Change Sync**: Performs delta analyses on git indices or folder modifications to trigger AST re-indexing.
* **Node weight adjustments**: Increments edge weights dynamically based on code imports freshness.

---

## Interactive Client Cockpit & Dashboard Panels

The premium web client interface coordinates live user inputs, simulation environments, and system indicators via custom UI panels under [apps/web/src/components/](apps/web/src/components/):

### 1. Landing Page Simulator (`LandingPage.tsx`)

* **Aesthetics**: Glassmorphic neon-cyan styling blocks (`.glass-panel`) utilizing Outfit and Inter typographies.
* **Interactive Sandbox**: Houses interactive sandbox forms simulating Compactor token sliders, regex secret scanners, and ABAC role matrix validators.

### 2. AI Agent Mission HUD (`AIMissionControlPanel.tsx`)

* **Work Progress Area**: Displays active step progress indicators and step ticks for execution states.
* **SVG Cost Chart**: Renders an animated area curve plotting tokens compaction weight and costs across simulated runs.

### 3. Artifact Center Registry (`ArtifactCenterPanel.tsx`)

* **File Registries**: Renders toggleable grids indexing Workspace Files, Content-Addressable Storage (CAS) Blobs, and a dedicated quarantined view for blocked assets.
* **Search Filters**: Features in-memory tag filters querying metadata records in real-time.

### 4. Evidence Store Health Indicator (`EvidenceStorePanel.tsx`)

* **Radial Gauge Widget**: Renders an animated SVG progress circle tracking the ratio of cryptographically verified files vs corrupted segments.
* **Glowing filters**: Highlights clean integrity statuses with cyan shadows and alerts validation errors with glowing red borders.

### 5. Permission Kernel Manager (`PermissionKernelPanel.tsx`)

* **Default-Deny Matrices**: Details active directories access scopes and default policy constraints.
* **Font matching**: Maps system tables to JetBrains Mono (`font-mono`) and headers to Inter (`font-sans`).

---

## PostgreSQL Database Schema & Tables

The core database schemas are initialized in PostgreSQL. Y-OS strictly prohibits transient SQLite fallbacks to prevent state fragmentation. The primary public schema tables are:

### 1. `projects`

Stores workplace target metadata boundaries.

* `id` (VARCHAR PRIMARY KEY): Unique project identifier.
* `name` (VARCHAR NOT NULL): Display name.
* `description` (TEXT): Description summary.
* `team_id` (VARCHAR): Workspace boundaries.
* `metadata_json` (JSONB): Dynamic configuration mappings.
* `created_at`, `updated_at` (TIMESTAMPTZ): Temporal stamps.

### 2. `memberships`

Specifies user-scoping boundaries across projects.

* `id` (VARCHAR PRIMARY KEY): Unique membership ID.
* `project_id` (VARCHAR REFERENCES projects): Target scoping project.
* `user_email` (VARCHAR): User email.
* `role` (VARCHAR): Role classifications (`admin`, `developer`, `reviewer`).

### 3. `tasks`

Orchestrates agentic step planning.

* `id` (VARCHAR PRIMARY KEY): Task identifier.
* `project_id` (VARCHAR REFERENCES projects): Scoping project constraint.
* `title` (VARCHAR): Task header.
* `description` (TEXT): Requirement summaries.
* `status` (VARCHAR): FSM status values (`backlog`, `active`, `verified`, `closed`).
* `risk_level`, `difficulty` (VARCHAR): Security metric classifications.
* `owner_agent`, `human_owner` (VARCHAR): Responsible entity IDs.
* `acceptance_criteria` (TEXT[]): List of acceptance rules.

### 4. `context_items` & `context_chunks`

Metadata and content checksums backing the 50K Compactor.

* Tracks raw content buffers, SHA-256 `content_hash` identifiers, file paths, and exact token counts.

### 5. `graph_nodes` & `graph_edges`

Stores parsed code hierarchies, vertices, and weighted dependency imports backing AST traversal.

### 6. `audit_logs`

Persists security-critical journals (actor, feature, action status, payload context) in a read-only PostgreSQL registry.

---

## Development Database Reset Utility

To support rapid sandbox configuration cycles, Y-OS includes a destructive database reset CLI tool:

### Environment Guards

To protect production environments from accidental data loss, the CLI execution halts loudly unless:

* `NODE_ENV` is **NOT** set to `"production"`.
* `ALLOW_DESTRUCTIVE_DB_RESET` is explicitly declared as `"true"` in environment variables.

### Reset Usage

Run the following command in the workspace root to reset all tables and schema migrations:

```bash
pnpm db:reset:dev --confirm I_UNDERSTAND_THIS_DELETES_DEVELOPMENT_DATA
```

---

## Multi-Agent Network & Interaction Topology

Y-OS coordinates task analysis, code modifications, quality validations, and deployments using **five specialized AI agents** operating in a sequential work loop:

### Core Agent Roles

* **Dispatcher Agent (Mission Control)**: Orchestrates incoming tasks, breaking complex requirements into granular task blocks. Operates solely on metadata to guarantee file content isolation.
* **Context Builder Agent (Context Optimizer)**: Standardizes codebase buffers into token-bounded 50K Context Packs based on weighted AST graph dependencies. Restricted to read-only access.
* **Developer Agent (Coder / Remediator)**: Executes code modifications using the secure `RepoAdapter`. Operations are bounded strictly to `allowed_paths`, blocking all path traversals.
* **QA Agent (Quality Gate & Verification)**: Runs unit tests, linter checks, typecheck compiles, and credentials scans in an isolated sandbox, emitting cryptographically signed logs.
* **Director Agent (Governance & Handoff)**: Evaluates evidence logs, signs off releases, and packages memory handoffs for next continuation cycles. Requires explicit human review overlays for high-risk operations.

### Sequence Work Loop Workflow

1. **Task Ingress**: User submits a task prompt to the Dispatcher.
2. **Context Assembly**: Context Builder resolves dependencies and delivers a 50K Context Pack to the Developer.
3. **Refactoring & Execution**: Developer implements code changes within allowed boundaries.
4. **Verification Loop**: QA Agent validates compiles/tests/scans and records output logs.
5. **Governance Sign-off**: Director signs the forensic event transaction ledger and delivers release assets.

---

## Platform Security Policies & Redaction Engine

The core authorization thresholds and secret redactors are implemented under the `@y/security` package in [packages/security/src/index.ts](packages/security/src/index.ts):

### 1. Regex Redaction Patterns

The parser uses strict regex filters to redact potential credentials from any telemetry log or prompt:

* `/([A-Za-z0-9+/]{40,})/gi`: Base64 buffers and long hashes.
* `/(AI_KEY|API_KEY|SECRET|PASSWORD|TOKEN|PASSCODE|CREDENTIAL|JWT_SECRET|GEMINI_API_KEY)/gi`: Secret keywords.
* `postgres(?:ql)?:\/\/([^:]+):([^@\s\/]+)@`: PostgreSQL user/password connections.
* `Bearer\s+([A-Za-z0-9\-._~+/]+=*)`: Bearer authorization tokens.

### 2. evaluateAuthorizationScope Rules

Verifies authorization scopes based on caller roles and human sign-off approvals:

| Requested Action | Required Context | Verdict |
| :--- | :--- | :--- |
| `read` | None (Default read-only) | **AUTHORIZED** |
| `write` | Verified Human Approval (`isApprovedByHuman = true`) | **AUTHORIZED** |
| `write` | Missing Human Approval | **BLOCKED** |
| `admin_override` | Admin Role + Human Approval | **AUTHORIZED** |
| `admin_override` | Developer/Reviewer Role or Missing Human Approval | **BLOCKED** |

---

## Domain Shared Errors & Exceptions

Standardized base exceptions are shared across frontend and backend modules under `@y/shared` in [packages/shared/src/index.ts](packages/shared/src/index.ts):

* **`UnauthorizedError`** (`UNAUTHORIZED` / HTTP 401): Missing or invalid Bearer tokens.
* **`PermissionDeniedError`** (`PERMISSION_DENIED` / HTTP 403): User role mismatch on scoped projects.
* **`ContextBoundaryViolationError`** (`CONTEXT_BOUNDARY_VIOLATION` / HTTP 400): Traversal path or out-of-scope context queries.
* **`SecretLeakedError`** (`SECRET_LEAK_PREVENTED` / HTTP 400): Exposed passwords or tokens blocked by the redactor.

---

## Agent Skills & Core Engine Features

All target agent engine behaviors are documented in detail within the customization skills inside the workspace customizations root [`.agents/skills/`](.agents/skills/):

### 1. Context Compactor (`y-os-context-packing`)

* **Token Budget Limit**: Enforces a strict **50K Token budget** per transaction.
* **Object Normalization**: Normalized into `ContextObject` entities with SHA-256 `content_hash` matching.
* **Relevance Ranking**: Ranks components using a similarity score based on import dependency weight and recency.

### 2. Graph Traversal (`y-os-graph-traversal`)

* **AST Mapping**: Identifies ES Module imports and exports to construct dependency linkage vectors.
* **Isolation Boundary**: REST restricts neighbor searches to the caller's active project ID boundary.
* **Syntax Recovery**: Applies regex symbol recovery fallbacks if file compiling fails.

### 3. Security Policy (`y-os-security-policy`)

* **Default-Deny Policy**: Any resource access query is blocked by default unless explicitly allowed.
* **Path Traversal Shield**: Intercepts directory traversal attempts (`../`) at the `RepoAdapter` layer.
* **Credential Redactor**: Scan-checks all inputs, prompts, and log streams for raw secrets (e.g. database credentials, Stripe tokens) and applies a secure redact mask.

---

## Remediation & Stabilization History

The stabilization and remediation phase details are preserved in the active [implementation.md](implementation.md) log file:

* **Phase 1: Authenticated HTTP Boundary**: Added constant-time token validation and endpoint locking.
* **Phase 2: Honest Test Orchestration**: Split deterministic offline tests from strict database integration suites.
* **Phase 3: Database Readiness Promise**: Bound Express startup to PostgreSQL connection and migration success.
* **Phase 4: Robust Migration Execution**: Refactored migration files to check table existence and run idempotent schema mappings.
* **Phase 5: Transparent Vault Integration**: Implemented fail-loud logic for missing/invalid external connections.
* **Phase 6: Compilation Integrity**: Replaced raw string manipulations with TypeScript AST parsers.
* **Phase 7: Secret Exposure Scanning**: Added automated regex checking scripts in the build pipeline.
* **Phase 8: Cockpit UX Overhaul**: Consolidated all tabs into a minimalist, chat-centric workspace.

---

## Documentation Index

The following document assets are located in the [docs/](docs/) directory:

### Architecture and Design

* **[Architecture Index](docs/architecture-and-design/architecture-index.md)**: Global indexing of monorepo packages, core models, and data types.
* **[Context and Execution Plan](docs/architecture-and-design/context-ve-execution-uygulama-plani.md)**: Implementation timelines for AST code compilation tasks.
* **[Implementation Details](docs/architecture-and-design/implemention.md)**: Design summaries of client views and cockpit layout tokens.
* **[Architecture Schema](docs/architecture-and-design/y-architecture-schema.md)**: ASCII/Mermaid layouts detailing request flows from Client ➔ Express API ➔ Postgres.
* **[Kernel Explanation](docs/architecture-and-design/y-engineering-kernel-explanation.md)**: Detailed analysis of compactor, redactor, and security boundaries.

### Security and Boundaries

* **[Kernel Awareness Note](docs/security-boundaries/kernel-awareness-note.md)**: Guidelines on protecting sensitive environment keys and credentials.
* **[Kernel Debt Register](docs/security-boundaries/kernel-debt-register.md)**: Outstanding technical debt tracking, authentication gaps, and performance items.
* **[Permission Kernel Audit](docs/security-boundaries/permission-kernel-audit.md)**: Comprehensive audit logs comparing role authorizations (Admin vs Developer vs Guest).

### QA and UI Standards

* **[Backlog Prioritization](docs/qa-ui-standards/backlog-prioritization.md)**: Task board lifecycle maps and FSM transition schemas.
* **[Manual QA Checklist](docs/qa-ui-standards/manual-qa-checklist.md)**: Comprehensive browser testing checklist for all user cockpit buttons.
* **[Quality Gates and Debug Tags](docs/qa-ui-standards/quality-gates-debug-tags.md)**: CI criteria prohibiting developer debug tags (e.g. `fit`, `fdescribe`) in pull requests.
* **[UI Accessibility Notes](docs/qa-ui-standards/ui-accessibility-notes.md)**: Enforced color palette contrast markers, font sizes, and layout guides.

---

## Master Unified Verification & Stage-by-Stage Tests

The test plan is initialized inside [tests/test.md](tests/test.md). The codebase is validated segment-by-segment using specialized modular TSX validation scripts:

* **Stage 27 Validation (`validate-stage-27.ts`)**: Tests the FSM Task Lifecycle state transitions and rollback logic.
* **Stage 28 Validation (`validate-stage-28.ts`)**: Verifies Quality Gate validations, typechecks, and debug tags blockades.
* **Stage 29 Validation (`validate-stage-29.ts`)**: Asserts the integrity of recorded execution results inside the Evidence Store.
* **Stage 30 Validation (`validate-stage-30.ts`)**: Tests cryptographic SHA-256 event journaling within the Event Store.
* **Stage 31 Validation (`validate-stage-31.ts`)**: Evaluates cache item freshness ranks and AST compacting limits.
* **Stage 32 Validation (`validate-stage-32.ts`)**: Checks process limits, load metrics, and background worker threads orchestration.
* **Stage 33 Validation (`validate-stage-33.ts`)**: Validates pessimistic concurrent lock releases and file lease timeouts.
* **Stage 34 Validation (`validate-stage-34.ts`)**: Asserts ABAC access rules, directory whitelisting, and traversal blockades.
* **Stage 35 Validation (`validate-stage-35.ts`)**: Validates Content-Addressable Storage (CAS) block deduplications.

---

## Commands and Validation

### 1. Installation

To fetch workspace coordinates and populate all dependencies across modules:

```bash
pnpm install
```

### 2. Launch Development Servers

Runs the integrated Express + Vite full-stack environment binding port `3000`:

```bash
pnpm dev
```

### 3. Build & Bundler Assembly

Compiles the static client and creates an SSR server bundle at `dist/server/server.js`:

```bash
pnpm build
```

### 4. Static Lint & Type Checks

Verifies type definitions across all workspace structures:

```bash
pnpm lint
```

### 5. CLI Database Utilities

Manage PostgreSQL connections and view current schemas:

```bash
# Executing Phase 0 foundational tables schema migrations
pnpm db:migrate

# Assessing active database connection and public table metrics
pnpm db:status
```

### 6. Testing & Quality Verification

Run the automated test suite to verify the active Stage 35 release gates:

```bash
# Run both offline deterministic and database-backed integration suites
pnpm test:all

# Run offline deterministic test suite only
pnpm test:deterministic

# Run verifications against local/production PostgreSQL
pnpm test:db

# Run real-time credentials exposure and secret scans
pnpm secret-scan

# Verify absence of temporary developer debug tags
pnpm qa:debug-tags

# Run manual checklist programmatic assertions for ABAC permission boundaries
pnpm scripts/verify-permission-manual-checklist.ts

# Run individual modular stage validation tests:
pnpm scripts/validate-stage-27.ts
pnpm scripts/validate-stage-28.ts
pnpm scripts/validate-stage-29.ts
pnpm scripts/validate-stage-30.ts
pnpm scripts/validate-stage-31.ts
pnpm scripts/validate-stage-32.ts
pnpm scripts/validate-stage-33.ts
pnpm scripts/validate-stage-34.ts
pnpm scripts/validate-stage-35.ts
```
