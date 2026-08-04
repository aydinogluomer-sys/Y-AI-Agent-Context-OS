# Y-OS Architecture & Design — Aggressive Implementation Plan

Source folder: `docs/architecture-and-design/`  
Generated from:

- `architecture-index.md` — 42-module architecture taxonomy, current MVP status map, directory/file index, DB table index, validation register, security/backlog boundaries.
- `y-architecture-schema.md` — target architecture diagrams, ER model, indexing/retrieval flow, agent execution sequence, boundary enforcement, quality gate flow, service boundaries, recommended MVP slice.
- `y-engineering-kernel-explanation.md` — kernel thesis, 29 contract domains, stable primitives, minimum implementation order.

This file intentionally uses the user-requested filename `implemention.md`.

---

## 1. Executive judgement

The architecture documents all say the same thing from different angles:

> Y must stop behaving like a collection of dashboards and become a coherent AI engineering operating system built around stable kernel contracts.

The aggressive implementation strategy is therefore:

1. **Contracts first**: define canonical shared schemas for Event, Context Object, Graph Node/Edge, Task, Context Pack, Evidence, Quality Gate, Permission, Lock, Artifact, Snapshot, Decision, Job, Approval, Provider, and Connection.
2. **Append-only truth second**: Event Store and Evidence Store must become the source of system history and proof.
3. **Context intelligence third**: Context Object Store, Indexing Pipeline, AST analysis, Knowledge Graph, Retrieval Ranking, and Context Pack Builder must form one pipeline.
4. **Agent execution fourth**: Task Engine, Scheduler, Worker Runtime, Scope Policy, RepoAdapter, File Locks, Approval, and Quality Gates must enforce safe execution.
5. **Provider and connect layer fifth**: Model Router, Capability Registry, Connect Provider SDK, and Secret/Permission Kernel must turn external tools into audited capabilities.
6. **Product projections last**: Mission Control, dashboards, reports, timelines, browser QA, and artifact screens must become projections of kernel state, not separate sources of truth.

Aggressive means:

- Every "Active MVP" claim must have a corresponding test, route, UI projection, or documented production blocker.
- Every "MVP Simulated/Mock" item must either become production-backed or be shown as a blocked/deferred item with a named gate.
- Every quality claim must attach evidence.
- Every write path must pass permission, scope, lock, and redaction checks.
- Every phase ends with tests; if tests are red, the next phase does not start.

---

## 2. Non-negotiable engineering rules

### 2.1 No false production claims

Local/mock mode is allowed for development and UI preview. It must never be presented as production validation.

Production release remains blocked until strict DB validation passes:

```cmd
npm.cmd run test:db
```

Required result:

- zero failed targets
- zero critical skipped DB checks
- TLS verification intact
- no mock substitution

### 2.2 No dashboard-only implementation

A UI panel is not considered implemented unless it is backed by at least one of:

- canonical API route
- shared type contract
- database/mock-table service path
- deterministic validation script
- evidence-producing test gate

### 2.3 No direct unsafe backend mutation

Forbidden until a phase explicitly designs and tests them:

- destructive CAS garbage collection daemon
- direct byte-compare API routes without scope/security review
- full directory snapshot/tarball restore system
- browser-executed worker sandbox
- direct ad-hoc DB migrations outside controlled migration scripts

### 2.4 Source-of-truth hierarchy

The final system must obey this order:

1. shared contract types
2. database/migration schema
3. service implementation
4. API route
5. UI projection
6. docs/report
7. quality/evidence records

No lower layer may invent state that the upper layers cannot prove.

---

## 3. Architecture findings extracted from the docs

### 3.1 `architecture-index.md` findings

The architecture index defines a 42-module map. Most modules are marked `Active MVP`, but several important production claims are still weak unless backed by gates:

- Mission Control exists but must become AI task-first, not only telemetry-first.
- Agent Timeline is marked `MVP Simulated/Mock`; it must be promoted to Event Store projection.
- Human-to-Agent Handoff is marked `MVP Simulated/Mock`; it needs a durable contract and validation.
- Static Analysis is marked `MVP Simulated/Mock`; regex fallback is allowed, but AST confidence must be visible.
- Worker stale recovery is marked `MVP Simulated/Mock`; it needs worker/job lease recovery tests.
- Permission policy tester is marked `MVP Simulated/Mock`; it must distinguish client-side simulation from server-side enforcement.
- Frozen kernel scope and forbidden migrations must be encoded in tests, not only docs.

Important table/index facts:

- Current database tables include `projects`, `tasks`, `task_status_history`, `evidence_records`, `event_records`, `audit_logs`, `file_locks`, `worker_registry`, `index_jobs`, `context_objects`, `context_object_refs`, `cas_blobs`, and `artifact_versions`.
- Evidence integrity is SHA-256 content digest only; actor signatures are not implemented and must not be claimed.
- Event records are append-only and protected by database triggers.
- Existing validators cover stages 27-35 and segments 1-26.

### 3.2 `y-architecture-schema.md` findings

The target architecture is not proof of implementation. It defines the desired topology:

- UI → Task Engine / Approval / Dashboards
- Task Engine → Context Pack / Queue / Event Store / Policy
- Context Pack → Retrieval / Graph / Vault / Decision / Quality Gate
- Workers → Indexing / Agent Runtime / Browser / Gates
- Agents → Model Router / RepoAdapter / Locks / Evidence
- Connect SDK → Vault / Secrets / Event
- Policy → Repo / Locks / Approval
- Evidence → Artifacts → Reports

The recommended MVP slice is:

```txt
GitHub Connect
→ Indexing Pipeline
→ AST + Graph
→ Context Object Store
→ Retrieval Ranking
→ Context Pack Generator
→ Scope Policy
→ Claude/Cursor handoff
→ Quality Gates
→ Final Report
```

This implementation plan expands that slice into the current local repo reality:

- Local FS RepoAdapter first.
- GitHub/remote writes remain explicit capability-gated operations.
- Browser runtime becomes a product-quality gate, not a general sandbox executor.
- Provider-backed model execution is optional; deterministic fallback must stay honest.

### 3.3 `y-engineering-kernel-explanation.md` findings

The kernel explanation defines 29 contract domains and a minimum implementation order:

1. Event Store
2. Context Object Store
3. Indexing Pipeline
4. AST / Static Analysis Layer
5. Knowledge Graph Storage
6. Retrieval Ranking Engine
7. Context Pack Schema
8. Scope / Boundary Policy Engine
9. Task Engine

10. Quality Gate Orchestrator
11. Evidence Store
12. Scheduler / Queue
13. Multi-Agent Locking
14. Secret Vault / Permission Kernel
15. Capability / Provider Registry
16. Connect Provider SDK
17. Model Router Contract
18. Artifact Versioning
19. Rollback / Snapshot System
20. Drift Detection Engine

This plan keeps that order but adds practical cross-cutting gates:

- shared type gate
- migration/mock parity gate
- API route gate
- UI projection gate
- deterministic test gate
- production DB strict gate

---

## 4. Implementation strategy

### 4.1 Phase policy

Each main phase has:

- objective
- implementation scope
- sub-phases
- acceptance criteria
- test gate

No main phase is allowed to start until the previous main phase gate is green.

### 4.2 Testing policy

Default gate set:

```cmd
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:deterministic
```

Additional gates are added per phase.

DB-backed production gate:

```cmd
npm.cmd run test:db
```

This is required before release, but it may stay externally blocked while local deterministic phases continue.

### 4.3 Naming policy

Use canonical object names:

- `event_records`
- `context_objects`
- `context_object_refs`
- `graph_nodes`
- `graph_edges`
- `context_packs`
- `context_pack_items`
- `scope_policies`
- `quality_gate_runs`
- `evidence_records`
- `file_locks`
- `index_jobs`
- `worker_registry`
- `artifact_versions`
- `cas_blobs`
- `decisions`
- `approval_requests`
- `snapshots`
- `connections`
- `capability_registry`

If a table does not exist yet, the implementation must add a migration and mock parity, or explicitly keep the item as deferred.

---

## 5. Aggressive phase plan

## Phase 0 — Baseline architecture audit and guardrails

### Phase 0 — Objective

Freeze the architecture docs into an executable remediation backlog and prevent accidental false positives.

### Phase 0 — Sub-phases

0.1. Confirm all architecture-and-design markdown files are represented in this plan.  
0.2. Build a source-to-phase traceability table.  
0.3. Record all `Active MVP`, `MVP Simulated/Mock`, `Future`, and `Forbidden` items.  
0.4. Identify which current modules have tests and which only have UI/docs.  
0.5. Add/refresh a validation script that checks this plan remains present.  
0.6. Preserve the production DB blocker as separate from local deterministic gates.

### Phase 0 — Acceptance

- This `implemention.md` exists in `docs/architecture-and-design/`.
- It names every kernel primitive from the docs.
- It names every high-risk simulated/mock area.
- It defines gates for every main phase.

### Phase 0 — Gate

```cmd
npm.cmd run typecheck
npm.cmd run test:phase8
```

---

## Phase 1 — Canonical shared kernel contracts

### Phase 1 — Objective

Create or reconcile shared TypeScript contracts for the primitives that the docs identify as the true Y kernel.

### Phase 1 — Implementation scope

Primary files:

- `packages/shared/src/index.ts`
- `packages/core/src/index.ts`
- `packages/providers/src/index.ts`
- docs updates if contracts are intentionally deferred

### Phase 1 — Sub-phases

1.1. Define canonical `EventRecord` DTO.  
1.2. Define canonical `ContextObject` DTO.  
1.3. Define canonical `GraphNode` and `GraphEdge` DTOs.  
1.4. Define canonical `Task`, `TaskStatus`, and `TaskTransition` DTOs.  
1.5. Define canonical `ContextPack` and `ContextPackItem` DTOs.  
1.6. Define canonical `EvidenceRecord` DTO with SHA-256 digest semantics only.  
1.7. Define canonical `QualityGateRun` and `GateResult` DTOs.  
1.8. Define canonical `PermissionGrant`, `ScopePolicy`, and `ApprovalRequest` DTOs.  
1.9. Define canonical `FileLock`, `Job`, `Artifact`, `Snapshot`, `Decision`, `Connection`, and `Capability` DTOs.  
1.10. Add backwards-compatible mapping functions if older table/API shapes differ.

### Phase 1 — Acceptance

- Shared contracts compile.
- No UI component uses untyped `any` where a canonical DTO exists.
- Evidence contracts do not claim actor signatures.
- Event contracts include correlation and causation IDs.
- Context Pack contract includes token budget, missing context, forbidden changes, quality gates, confidence score, recommended agent/model, and generated timestamp.

### Phase 1 — Gate

```cmd
npm.cmd run typecheck
npm.cmd run test:deterministic
```

---

## Phase 2 — Event Store as append-only system spine

### Phase 2 — Objective

Make Event Store the canonical history layer for task lifecycle, worker, lock, quality, artifact, decision, and approval events.

### Phase 2 — Implementation scope

Primary files:

- `apps/api/src/EventStoreService.ts`
- `apps/api/src/db.ts`
- `apps/api/src/index.ts`
- migration scripts if missing fields are required
- `packages/agents/src/timeline.ts`

### Phase 2 — Sub-phases

2.1. Confirm `event_records` table shape supports project, task, actor, type, payload, source refs, affected files, correlation, causation, and timestamp.  
2.2. Add typed event append helper with idempotency key support.  
2.3. Block update/delete in mock DB exactly like production trigger behavior.  
2.4. Emit events from task status changes.  
2.5. Emit events from file lock acquire/release/expire.  
2.6. Emit events from quality gate start/pass/fail.  
2.7. Emit events from evidence creation/verification.  
2.8. Emit events from artifact version creation/supersede/quarantine.  
2.9. Emit events from permission override and denial.  
2.10. Convert Agent Timeline to a projection over canonical event records first, legacy fallback second.

### Phase 2 — Acceptance

- Event append is append-only in production and mock.
- Timeline reads canonical event records first.
- Legacy timeline paths produce explicit compatibility warnings.
- Event creation is covered by deterministic tests.

### Phase 2 — Gate

```cmd
npm.cmd run typecheck
npx tsx scripts/validate-stage-30.ts
npm.cmd run test:deterministic
```

---

## Phase 3 — Context Object Store canonicalization

### Phase 3 — Objective

Make `context_objects` the only canonical representation of indexed source knowledge.

### Phase 3 — Implementation scope

Primary files:

- `apps/api/src/ContextObjectStoreService.ts`
- `packages/context/src/search-server.ts`
- `packages/shared/src/index.ts`
- API context routes

### Phase 3 — Sub-phases

3.1. Confirm context object fields: object ID, project ID, source type, URI, title, raw content, normalized content, content hash, version hash, language, metadata, authority, freshness, timestamps.  
3.2. Ensure all ingestion routes produce canonical `context_objects`.  
3.3. Ensure `context_object_refs` stores references/links/relationships.  
3.4. Implement stale/quarantine state transitions.  
3.5. Normalize source types: file, doc, test, commit, decision, prompt, session, artifact, schema, design.  
3.6. Add content hash verification.  
3.7. Make retrieval/search read canonical Context Objects before any legacy item table.  
3.8. Add explainable source authority and freshness fields to retrieval output.

### Phase 3 — Acceptance

- Canonical context object reads outrank legacy records.
- Stale/quarantined context cannot silently enter a high-confidence pack.
- Hash mismatch becomes warning or block depending severity.
- Search results explain why each object was included.

### Phase 3 — Gate

```cmd
npm.cmd run typecheck
npx tsx scripts/validate-stage-31.ts
npm.cmd run test:deterministic
```

---

## Phase 4 — Indexing pipeline and job orchestration

### Phase 4 — Objective

Unify source loading, normalization, AST parsing, chunking, keyword indexing, graph building, and context object persistence under one job pipeline.

### Phase 4 — Implementation scope

Primary files:

- `packages/core/src/index-job-service.ts`
- `packages/core/src/incremental-index-service.ts`
- `workers/index-worker.ts`
- `apps/api/src/index.ts`
- `packages/core/src/repo-adapter.ts`

### Phase 4 — Sub-phases

4.1. Canonicalize `INDEX_JOB`: full, incremental, reindex, delete_sync.  
4.2. Ensure job statuses: queued, running, failed, completed, cancelled.  
4.3. Add changed object summaries and structured errors.  
4.4. Make Local FS listing the first-class MVP connector.  
4.5. Ensure blocked files (`.env`, `.pem`, `.key`, `node_modules`, `dist`) are excluded before indexing.  
4.6. Add debounce behavior for repeated file changes.  
4.7. Ensure worker claim/complete/fail APIs are authenticated and scoped.  
4.8. Add deterministic worker CLI smoke test with mock DB.  
4.9. Persist index progress events to Event Store.

### Phase 4 — Acceptance

- Index jobs can be created, claimed, completed, failed, retried, and listed.
- Worker runtime can run outside the main API process.
- Index job errors are typed and redacted.
- Indexing does not read forbidden paths.

### Phase 4 — Gate

```cmd
npm.cmd run typecheck
npx tsx scripts/validate-stage-32.ts
npm.cmd run test:phase7
npm.cmd run test:deterministic
```

---

## Phase 5 — AST / static analysis promotion

### Phase 5 — Objective

Move static analysis from `MVP Simulated/Mock` toward a measurable production-grade relationship extractor.

### Phase 5 — Implementation scope

Primary files:

- `packages/core/src/static-analysis.ts`
- `packages/graph/src/index.ts`
- `packages/core/src/incremental-index-service.ts`

### Phase 5 — Sub-phases

5.1. Define adapter interface for TypeScript, JavaScript, Python, SQL, Markdown, JSON, YAML, and CSS.  
5.2. Implement TypeScript/JavaScript AST extraction as the first production adapter.  
5.3. Keep regex fallback but attach lower confidence.  
5.4. Extract edge types: imports, exports, calls, renders component, uses hook, uses route, uses API, uses table, uses env var, tests file, documents file, configures tool.  
5.5. Persist analysis confidence on graph edges.  
5.6. Expose static analysis diagnostics in API and UI.  
5.7. Add tests for broken syntax fallback.

### Phase 5 — Acceptance

- TypeScript import/export/component/API edges are extracted deterministically.
- Regex fallback is visible and lower confidence.
- AST failures do not crash indexing jobs; they quarantine or warn.
- Impact analysis can consume extracted edges.

### Phase 5 — Gate

```cmd
npm.cmd run typecheck
npx tsx scripts/validate-stage-25.ts
npm.cmd run test:deterministic
```

If `validate-stage-25.ts` is not currently standalone-safe, add a phase-specific static-analysis validator before proceeding.

---

## Phase 6 — Knowledge Graph storage and traversal

### Phase 6 — Objective

Make graph nodes/edges durable, project-scoped, explainable, and usable by retrieval and impact analysis.

### Phase 6 — Implementation scope

Primary files:

- `packages/graph/src/index.ts`
- `apps/api/src/index.ts`
- `apps/web/src/hooks/useKnowledgeGraph.ts`
- `apps/web/src/components` graph panels

### Phase 6 — Sub-phases

6.1. Reconcile graph node schema with docs.  
6.2. Reconcile graph edge schema with docs: edge type, weight, evidence, confidence.  
6.3. Add project isolation to every graph route.  
6.4. Add reverse dependency route.  
6.5. Add impact radius route.  
6.6. Add orphan/circular relationship validation.  
6.7. Add graph sync from index pipeline output.  
6.8. Render explainable graph preview in UI.

### Phase 6 — Acceptance

- Graph traversal never crosses project boundary.
- Edges include evidence/confidence.
- Impact route returns affected paths and why.
- UI can show graph status without fake counts.

### Phase 6 — Gate

```cmd
npm.cmd run typecheck
npm.cmd run test:phase4
npm.cmd run test:deterministic
```

---

## Phase 7 — Retrieval Ranking Engine

### Phase 7 — Objective

Make context retrieval explainable and multi-signal instead of keyword-only or semantic-only.

### Phase 7 — Implementation scope

Primary files:

- `packages/context/src/retrieval-ranking-service.ts`
- `packages/context/src/search-server.ts`
- `apps/api/src/index.ts`

### Phase 7 — Sub-phases

7.1. Implement final score formula:

```txt
0.30 semantic_similarity
+ 0.20 graph_proximity
+ 0.15 direct_dependency_score
+ 0.10 reverse_dependency_score
+ 0.10 recency_score
+ 0.10 authority_score
+ 0.05 user_pinned_score
- 0.20 stale_context_penalty
- 0.30 forbidden_scope_penalty
```

7.2. If real embeddings are unavailable, use deterministic lexical/scoring fallback with explicit source label.  
7.3. Add `why_included` array to every candidate.  
7.4. Penalize stale/quarantined objects.  
7.5. Hard-block forbidden-scope objects.  
7.6. Add route-level tests for project isolation and candidate explanations.

### Phase 7 — Acceptance

- Retrieval output includes score and explanation.
- Forbidden scope cannot appear in a context pack.
- Stale context lowers confidence.
- Candidate ordering is deterministic in local test mode.

### Phase 7 — Gate

```cmd
npm.cmd run typecheck
npx tsx packages/context/test/retrieval-isolation.test.ts
npm.cmd run test:deterministic
```

---

## Phase 8 — Context Pack Builder

### Phase 8 — Objective

Make Context Pack the central AI handoff artifact.

### Phase 8 — Implementation scope

Primary files:

- new/updated context pack service in `packages/context` or `packages/core`
- `apps/api/src/index.ts`
- `apps/web/src/components/AIMissionControlPanel.tsx`
- `apps/web/src/lib/api/context.ts`

### Phase 8 — Sub-phases

8.1. Implement canonical `ContextPack` schema from docs.  
8.2. Include primary files, related files, dependencies, reverse dependencies, tests, docs, decisions, recent diffs, risks, forbidden changes, quality gates, missing context, confidence score, token budget, recommended agent/model, and generated timestamp.  
8.3. Enforce max 50K token pack target.  
8.4. Add compression levels L0-L3.  
8.5. Add pack export JSON route.  
8.6. Add pack preview UI.  
8.7. Emit `CONTEXT_PACK_GENERATED` event.  
8.8. Attach context pack ID to task lifecycle state.

### Phase 8 — Acceptance

- Context pack can be generated for a task.
- It names why every file is included.
- It blocks forbidden scope.
- It has a confidence score and token budget.
- It is visible in the AI Mission Control surface.

### Phase 8 — Gate

```cmd
npm.cmd run typecheck
npm.cmd run test:deterministic
npm.cmd run test:ai-cockpit
```

---

## Phase 9 — Scope / Boundary Policy Engine

### Phase 9 — Objective

Turn "agents should not touch unrelated files" into enforced write-layer policy.

### Phase 9 — Implementation scope

Primary files:

- `packages/core/src/repo-adapter.ts`
- `packages/core/src/repo-adapter-service.ts`
- `apps/api/src/PermissionKernelService.ts`
- `apps/api/src/FileLockingService.ts`
- `apps/api/src/index.ts`

### Phase 9 — Sub-phases

9.1. Implement canonical `SCOPE_POLICY`.  
9.2. Generate policy from Context Pack.  
9.3. Enforce allowed paths, forbidden paths, allowed operations, approval-required paths, max files changed, max diff size, violation action.  
9.4. Wrap all RepoAdapter write paths in scope checks.  
9.5. Add approval requirement for high-risk paths.  
9.6. Emit violation events.  
9.7. Add UI display for scope policy and blocked writes.

### Phase 9 — Acceptance

- Unauthorized writes are blocked before file mutation.
- Forbidden paths cannot be read or written.
- Large diff/deletion attempts require approval.
- Scope violations create events and evidence.

### Phase 9 — Gate

```cmd
npm.cmd run typecheck
npx tsx scripts/validate-stage-22.ts
npm.cmd run test:deterministic
```

If Stage 22 is not individually available, extend `test:phase7` or add `validate-scope-policy.ts`.

---

## Phase 10 — Task Engine lifecycle

### Phase 10 — Objective

Promote task execution to the lifecycle described in the architecture docs.

### Phase 10 — Target lifecycle

```txt
CREATED
→ ANALYZING
→ CONTEXT_PACK_READY
→ PLANNED
→ AWAITING_APPROVAL
→ RUNNING
→ VERIFYING
→ FAILED / COMPLETED
→ DOCUMENTED
```

### Phase 10 — Implementation scope

- `apps/api/src/TaskLifecycleService.ts`
- task routes in `apps/api/src/index.ts`
- `apps/web/src/hooks/useTaskLifecycle.ts`
- task board UI

### Phase 10 — Sub-phases

10.1. Add missing lifecycle states if absent.  
10.2. Define allowed transitions.  
10.3. Require Context Pack before execution.  
10.4. Require approval before risky execution.  
10.5. Require Quality Gate state before completion.  
10.6. Persist transition history.  
10.7. Emit Event Store records for every transition.  
10.8. Render lifecycle state in UI.

### Phase 10 — Acceptance

- Illegal transitions fail loudly.
- Admin overrides are audited.
- Task completion cannot bypass gates.
- Resume restarts from known lifecycle state.

### Phase 10 — Gate

```cmd
npm.cmd run typecheck
npx tsx scripts/validate-stage-27.ts
npm.cmd run test:deterministic
```

---

## Phase 11 — Quality Gate Orchestrator and Evidence Store convergence

### Phase 11 — Objective

Make every claim evidence-backed and every quality gate a first-class blocking record.

### Phase 11 — Implementation scope

- `apps/api/src/QualityGateService.ts`
- `apps/api/src/EvidenceStoreService.ts`
- `apps/web/src/components/QualityGateReportPanel.tsx`
- `apps/web/src/components/EvidenceStorePanel.tsx`

### Phase 11 — Sub-phases

11.1. Ensure `QUALITY_GATE` and `GATE_RESULT` contracts.  
11.2. Ensure status values: passed, failed, skipped.  
11.3. Mark critical skips as non-green.  
11.4. Attach evidence IDs to every gate result.  
11.5. Store terminal/test/build/browser evidence.  
11.6. Hash evidence content with SHA-256.  
11.7. Detect tampered evidence.  
11.8. Add aggregate gate status route.  
11.9. Render blocking failures in Mission Control.

### Phase 11 — Acceptance

- Agent cannot claim completion without gate results.
- Critical skip blocks completion.
- Evidence hashes verify.
- UI shows quality status and evidence references.

### Phase 11 — Gate

```cmd
npm.cmd run typecheck
npx tsx scripts/validate-stage-28.ts
npx tsx scripts/validate-stage-29.ts
npm.cmd run test:deterministic
```

---

## Phase 12 — Scheduler / Queue and Worker Runtime hardening

### Phase 12 — Objective

Make all background work durable, observable, recoverable, and bounded.

### Phase 12 — Implementation scope

- `apps/api/src/WorkerRuntimeService.ts`
- `packages/core/src/index-job-service.ts`
- `workers/index-worker.ts`
- worker routes and UI

### Phase 12 — Sub-phases

12.1. Canonicalize `JOB` contract.  
12.2. Add job types: indexing, agent, gate, artifact, browser, resume.  
12.3. Add priority, run_at, retry count, max retries, worker lock, payload, error, timestamps.  
12.4. Implement stale worker recovery as production behavior, not mock-only.  
12.5. Add pause/stop/claim/complete/fail semantics.  
12.6. Add queue telemetry: wait time, throughput, failures.  
12.7. Emit queue and worker events.  
12.8. Show worker health and stuck jobs in UI.

### Phase 12 — Acceptance

- Jobs retry deterministically.
- Stale locks can be released safely.
- Worker heartbeat status is accurate.
- UI can identify stuck/failed jobs.

### Phase 12 — Gate

```cmd
npm.cmd run typecheck
npx tsx scripts/validate-stage-32.ts
npm.cmd run test:phase7
npm.cmd run test:deterministic
```

---

## Phase 13 — Multi-agent locking and concurrency

### Phase 13 — Objective

Prevent agents from overwriting each other or running with stale context.

### Phase 13 — Implementation scope

- `apps/api/src/FileLockingService.ts`
- RepoAdapter service
- task execution paths
- file lock UI

### Phase 13 — Sub-phases

13.1. Canonicalize `FILE_LOCK`.  
13.2. Support read, write, exclusive locks.  
13.3. Block same-file write collision.  
13.4. Warn on related-file write collision via graph analysis.  
13.5. Block execution when context pack is stale.  
13.6. Add stale lock release with audit.  
13.7. Emit conflict events.  
13.8. Render lock contention in Mission Control risk radar.

### Phase 13 — Acceptance

- Second write to locked file is blocked.
- Stale locks expire/release safely.
- Related-file collisions trigger impact warning.
- Lock actions create audit/event records.

### Phase 13 — Gate

```cmd
npm.cmd run typecheck
npx tsx scripts/validate-stage-33.ts
npm.cmd run test:deterministic
```

---

## Phase 14 — Secret Vault and Permission Kernel

### Phase 14 — Objective

Make permission, secrets, and boundary policy one consistent enforcement layer.

### Phase 14 — Implementation scope

- `apps/api/src/PermissionKernelService.ts`
- `apps/api/src/auth.ts`
- `packages/security/src/index.ts`
- permission routes/UI

### Phase 14 — Sub-phases

14.1. Canonicalize `PERMISSION_GRANT`.  
14.2. Add subject types: user, agent, tool, connect.  
14.3. Add resource types: file, repo, secret, model, connect, task.  
14.4. Add actions: read, write, execute, delete, audit, bypass.  
14.5. Enforce default deny.  
14.6. Enforce deny-overrides-allow.  
14.7. Require approval for configured sensitive resources.  
14.8. Audit admin override.  
14.9. Maintain secret redaction across logs, config inspect, evidence, and quality output.

### Phase 14 — Acceptance

- Anonymous API access is denied except allowed public endpoints.
- Agent/tool permissions are scoped.
- Secrets never appear in logs/tests.
- Permission evaluations are recorded.

### Phase 14 — Gate

```cmd
npm.cmd run typecheck
npm.cmd run test:phase1
npx tsx scripts/validate-stage-34.ts
npm.cmd run secret-scan
```

---

## Phase 15 — Capability Registry, Provider Registry, and Model Router

### Phase 15 — Objective

Make tool/model/connect recommendations depend on actual configured capabilities.

### Phase 15 — Implementation scope

- `packages/providers/src/index.ts`
- new capability registry service/package if needed
- `server.ts`
- AI Mission Control model council UI

### Phase 15 — Sub-phases

15.1. Canonicalize `CAPABILITY_REGISTRY`.  
15.2. Track capability type: model, MCP, connect, skill, tool, workflow.  
15.3. Track required permissions, supported task types, cost profile, risk profile, setup status, health status.  
15.4. Standardize `ModelProvider` interface.  
15.5. Add model routing based on task, context, cost, privacy, max context, tool support, and health.  
15.6. Preserve deterministic fallback when provider is unconfigured.  
15.7. Render provider health and reason for model choice in UI.  
15.8. Add tests for fallback vs configured provider metadata without calling external APIs.

### Phase 15 — Acceptance

- Missing provider does not crash task simulation.
- Fallback is labeled.
- Model council recommendations are explainable.
- Capability advisor does not recommend unavailable tools as if configured.

### Phase 15 — Gate

```cmd
npm.cmd run typecheck
npm.cmd run test:phase7
npm.cmd run test:ai-cockpit
```

---

## Phase 16 — Connect Provider SDK

### Phase 16 — Objective

Create a consistent contract for GitHub, Figma, Supabase, Notion, model providers, and local connectors.

### Phase 16 — Implementation scope

- `packages/connectors/src/index.ts`
- `packages/providers/src/index.ts`
- connection routes
- settings/connect UI

### Phase 16 — Sub-phases

16.1. Define `ConnectProvider` interface: ID, auth type, scopes, healthCheck, sync, revoke.  
16.2. Define `Connection` record shape.  
16.3. Implement local connector as baseline.  
16.4. Implement health check route.  
16.5. Ensure sync writes Context Objects.  
16.6. Ensure connect events enter Event Store.  
16.7. Ensure secret/permission layer controls access.  
16.8. Add connection health UI.

### Phase 16 — Acceptance

- Connection health is measurable.
- Connect data enters Context Vault consistently.
- Revoked connection cannot sync.
- Secrets are redacted.

### Phase 16 — Gate

```cmd
npm.cmd run typecheck
npm.cmd run test:deterministic
npm.cmd run secret-scan
```

---

## Phase 17 — Artifact Versioning / CAS and Reports

### Phase 17 — Objective

Make reports, screenshots, plans, context packs, gate outputs, and generated files durable artifacts with version lineage.

### Phase 17 — Implementation scope

- `apps/api/src/ArtifactCASService.ts`
- artifact routes/UI
- report generation paths

### Phase 17 — Sub-phases

17.1. Canonicalize `ARTIFACT`.  
17.2. Ensure artifact has project, task, type, version, content URI/hash, evidence IDs, generated_by, supersedes.  
17.3. Ensure CAS blob de-duplication.  
17.4. Implement artifact version lineage.  
17.5. Link final reports to evidence and gate results.  
17.6. Add artifact preview UI.  
17.7. Keep destructive cleanup deferred.  
17.8. Add report generation for task, project, agent, quality, evidence, event, artifact, worker, permission.

### Phase 17 — Acceptance

- Artifact versions can be listed and traced.
- CAS de-duplication works.
- Artifact reports cite evidence.
- No destructive cleanup runs.

### Phase 17 — Gate

```cmd
npm.cmd run typecheck
npx tsx scripts/validate-stage-35.ts
npm.cmd run test:deterministic
```

---

## Phase 18 — Decision State Machine and Drift Detection

### Phase 18 — Objective

Turn architecture decisions, docs, code, API routes, schema, and UI specs into enforceable consistency checks.

### Phase 18 — Implementation scope

- new decision/drift services
- docs/indexing routes
- quality gate integration
- Mission Control decision/risk UI

### Phase 18 — Sub-phases

18.1. Canonicalize `DECISION`.  
18.2. Add decision statuses: proposed, accepted, deprecated, overridden.  
18.3. Add rule expression and rationale.  
18.4. Add source refs and supersedes.  
18.5. Implement `DRIFT_RULE`.  
18.6. Add API-doc drift detection.  
18.7. Add architecture-doc/code drift detection.  
18.8. Add UI/design spec drift detection.  
18.9. Feed drift failures into quality gates.  
18.10. Render decision enforcement and unsupported claims in AI Mission Control.

### Phase 18 — Acceptance

- Accepted decisions can block conflicting changes.
- Overrides require approval and audit.
- Docs/code drift can fail a gate.
- Context Pack carries relevant decisions.

### Phase 18 — Gate

```cmd
npm.cmd run typecheck
npm.cmd run test:deterministic
npm.cmd run qa:debug-tags
```

---

## Phase 19 — Approval Engine

### Phase 19 — Objective

Pause risky actions and require explicit approval before protected writes, debug instrumentation, deletion, large diffs, rollback, or provider/connect access.

### Phase 19 — Implementation scope

- approval service/routes
- permission/scope integration
- task lifecycle integration
- UI approval drawer

### Phase 19 — Sub-phases

19.1. Canonicalize `APPROVAL_REQUEST`.  
19.2. Include requested action, risk, diff preview, context pack ID, evidence IDs, requester, approver, status, expiry.  
19.3. Add approval-required paths from Scope Policy.  
19.4. Add approval-required high-risk model/connect operations.  
19.5. Add approval timeline event.  
19.6. Add approval UI in Mission Control.  
19.7. Add expiry/cancel behavior.

### Phase 19 — Acceptance

- Risky action cannot proceed without approval.
- Approval/rejection creates event and audit record.
- Expired approval blocks action.
- UI shows pending approvals clearly.

### Phase 19 — Gate

```cmd
npm.cmd run typecheck
npm.cmd run test:deterministic
```

---

## Phase 20 — Rollback / Snapshot System

### Phase 20 — Objective

Design and implement rollback only after event/context/artifact foundations exist.

### Phase 20 — Implementation scope

- snapshot service
- repository adapter diff support
- artifact/context/decision references
- rollback UI

### Phase 20 — Sub-phases

20.1. Canonicalize `SNAPSHOT`.  
20.2. Store git commit SHA if available.  
20.3. Store context pack ID.  
20.4. Store decision state hash.  
20.5. Store graph version.  
20.6. Store artifact IDs.  
20.7. Store created-before event ID.  
20.8. Add snapshot create route.  
20.9. Add rollback preview route.  
20.10. Require approval before applying rollback.  
20.11. Run quality gates after rollback.

### Phase 20 — Acceptance

- Snapshot creation is non-destructive.
- Rollback preview is available before application.
- Rollback application is approval-gated.
- Quality gates run after rollback.

### Phase 20 — Gate

```cmd
npm.cmd run typecheck
npm.cmd run test:deterministic
```

---

## Phase 21 — Browser Runtime Adapter and product gates

### Phase 21 — Objective

Make browser verification repeatable evidence, not a manual screenshot ritual.

### Phase 21 — Implementation scope

- browser runtime adapter contract
- quality gate integration
- evidence/artifact links
- UI visual QA reports

### Phase 21 — Sub-phases

21.1. Canonicalize `BROWSER_SESSION`.  
21.2. Track route, console events, network events, screenshots, interaction steps, status.  
21.3. Add browser gate result type.  
21.4. Capture desktop/tablet/mobile evidence for UI changes.  
21.5. Attach screenshots to Evidence Store and Artifact Center.  
21.6. Fail product gate on console errors, network errors, overflow, clipped primary content, broken primary interaction, missing accessible name, or missing reduced-motion handling.  
21.7. Keep browser worker sandbox execution deferred unless explicitly designed.

### Phase 21 — Acceptance

- Browser QA produces evidence records.
- Product gates can block completion.
- Screenshots are artifacts.
- Visual QA report is linked to task.

### Phase 21 — Gate

```cmd
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:ai-cockpit
```

Then browser matrix inspection:

- 1366 × 900
- 768 × 1024
- 375 × 812

---

## Phase 22 — Mission Control and 42-module UI projection reconciliation

### Phase 22 — Objective

Make the UI map the 42-module taxonomy without lying about production status.

### Phase 22 — Implementation scope

- `apps/web/src/App.tsx`
- `apps/web/src/app/navigation.ts`
- `apps/web/src/app/AppShell.tsx`
- `apps/web/src/components/*Panel.tsx`
- `apps/web/src/modules/command/ProjectDashboard.tsx`

### Phase 22 — Sub-phases

22.1. Mission Control becomes task-first AI cockpit.  
22.2. Projects, Missions, Task Board, Task Detail, Agent Hub, Agent Roles, Agent Sessions, Agent Timeline become projections over canonical task/event/context data.  
22.3. Context Vault, Context Object Store, Context Pack Builder, Retrieval Engine, Knowledge Graph, Code Graph, Repository Explorer become one context intelligence cluster.  
22.4. Worker Runtime, File Locking, Permission Kernel, Security Model, Secret Redaction become trust/runtime cluster.  
22.5. Quality Gate, Evidence Store, Event Store, Artifact Center, Reports become evidence/reporting cluster.  
22.6. Observability, Documentation, Stabilization, Backlog, Settings, System Boundaries become release governance cluster.  
22.7. Every visible tab must have a real component.  
22.8. Every simulated/mock item must show a status badge.

### Phase 22 — Acceptance

- No placeholder tab appears in navigation.
- Every module status is either production-backed, MVP-backed, simulated/mock, deferred, or blocked.
- Users can start an AI task from the first screen.
- Production DB blocker is visible but does not block local preview.

### Phase 22 — Gate

```cmd
npm.cmd run typecheck
npm.cmd run test:phase6
npm.cmd run test:ai-cockpit
npm.cmd run build
```

---

## Phase 23 — Observability, reports, and release readiness

### Phase 23 — Objective

Make system readiness measurable across API, DB, workers, queues, locks, quality gates, permissions, audit volume, and CAS storage.

### Phase 23 — Implementation scope

- health routes
- report routes
- observability UI
- release checklist docs/tests

### Phase 23 — Sub-phases

23.1. System health route includes API, DB, worker, queue, lock, quality, permission, CAS, event/evidence.  
23.2. Worker health includes stale heartbeat status.  
23.3. Queue health includes backlog and average wait time.  
23.4. Lock contention metrics aggregate collisions.  
23.5. Quality trends show failures/skips.  
23.6. Permission denials are chartable.  
23.7. Audit volume is visible.  
23.8. Storage metrics include CAS de-duplication stats.  
23.9. Release sign-off report links deterministic gates, DB gate, browser gate, and evidence artifacts.

### Phase 23 — Acceptance

- Release readiness is a computed report, not manual prose.
- Critical skipped gates block release status.
- Production DB status is explicit.
- Report cites evidence IDs.

### Phase 23 — Gate

```cmd
npm.cmd run typecheck
npm.cmd run test:deterministic
npm.cmd run secret-scan
npm.cmd run qa:debug-tags
npm.cmd run build
```

---

## Phase 24 — Production DB strict validation and release gate

### Phase 24 — Objective

Close the final external blocker only when the configured PostgreSQL/Supabase host is reachable and strict DB tests pass.

### Phase 24 — Current known blocker

The configured Supabase host has previously failed DNS resolution:

```txt
db.vnnfcwpywdxepdwwuqoo.supabase.co
```

Failure class:

```txt
getaddrinfo ENOTFOUND
```

### Phase 24 — Sub-phases

24.1. Confirm `DATABASE_URL` points to a reachable host.  
24.2. Confirm TLS verification remains enabled.  
24.3. Confirm production does not fall back to mock DB.  
24.4. Run migrations/status checks.  
24.5. Run strict DB validation suite.  
24.6. Record evidence and release status.

### Phase 24 — Acceptance

- `npm.cmd run test:db` passes.
- No critical DB checks are skipped.
- No TLS bypass is used.
- No mock DB is used as release substitute.

### Phase 24 — Gate

```cmd
npm.cmd run test:db
```

---

## 6. Cross-phase traceability matrix

| Source requirement | Primary phase(s) | Proof |
| --- | --- | --- |
| Event Store central history | 2 | Stage 30 + deterministic suite |
| Context Object Store | 3 | Stage 31 + canonical read tests |
| Indexing pipeline | 4 | Worker/index job tests |
| AST / static analysis | 5 | Static analysis validator |
| Knowledge Graph | 6 | Graph sync/impact tests |
| Retrieval ranking | 7 | Retrieval isolation/explainability tests |
| Context Pack | 8 | Context pack generation tests |
| Scope policy | 9 | RepoAdapter/scope tests |
| Task lifecycle | 10 | Stage 27 |
| Quality gates | 11 | Stage 28 |
| Evidence Store | 11 | Stage 29 |
| Scheduler / queue | 12 | Stage 32 |
| File locks | 13 | Stage 33 |
| Permission kernel | 14 | Phase 1 + Stage 34 |
| Provider/model router | 15 | Phase 7 + AI cockpit tests |
| Connect SDK | 16 | Connector health tests |
| Artifact/CAS | 17 | Stage 35 |
| Decision/drift | 18 | Drift validator |
| Approval engine | 19 | Approval validator |
| Snapshot/rollback | 20 | Snapshot validator |
| Browser runtime | 21 | Browser evidence + build |
| 42-module UI projection | 22 | Phase 6 + AI cockpit + build |
| Release readiness | 23 | deterministic/build/secret/debug gates |
| Production DB release | 24 | `test:db` |

---

## 7. New validators to add

The docs imply these validators should exist if not already present:

```txt
scripts/validate-kernel-contracts.ts
scripts/validate-context-pack-builder.ts
scripts/validate-scope-policy.ts
scripts/validate-static-analysis.ts
scripts/validate-retrieval-ranking.ts
scripts/validate-graph-integrity.ts
scripts/validate-approval-engine.ts
scripts/validate-drift-detection.ts
scripts/validate-snapshot-rollback.ts
scripts/validate-browser-runtime.ts
scripts/validate-release-readiness.ts
scripts/validate-architecture-design-plan.ts
```

Recommended package scripts:

```json
{
  "test:kernel-contracts": "tsx scripts/validate-kernel-contracts.ts",
  "test:context-pack": "tsx scripts/validate-context-pack-builder.ts",
  "test:scope-policy": "tsx scripts/validate-scope-policy.ts",
  "test:static-analysis": "tsx scripts/validate-static-analysis.ts",
  "test:retrieval-ranking": "tsx scripts/validate-retrieval-ranking.ts",
  "test:graph-integrity": "tsx scripts/validate-graph-integrity.ts",
  "test:approval": "tsx scripts/validate-approval-engine.ts",
  "test:drift": "tsx scripts/validate-drift-detection.ts",
  "test:snapshot": "tsx scripts/validate-snapshot-rollback.ts",
  "test:browser-runtime": "tsx scripts/validate-browser-runtime.ts",
  "test:release-readiness": "tsx scripts/validate-release-readiness.ts",
  "test:architecture-design": "tsx scripts/validate-architecture-design-plan.ts"
}
```

---

## 8. Current high-risk gaps to attack first

### Gap A — Simulated Agent Timeline

Docs mark Agent Timeline as `MVP Simulated/Mock`.

Attack:

- Make it Event Store projection.
- Remove fake/static timeline counts.
- Add filters backed by event type, status, task, actor, time.

### Gap B — Static Analysis confidence

Docs mark Static Analysis as `MVP Simulated/Mock`.

Attack:

- Add confidence to every edge.
- Promote TS/JS AST extraction.
- Keep regex fallback visible.

### Gap C — Human approval engine

The schema requires Approval Engine, but implementation status is not proven.

Attack:

- Add `approval_requests`.
- Integrate with scope policy and task lifecycle.
- Add UI drawer.

### Gap D — Context Pack not yet central enough

Context Pack is the key AI artifact, but dashboards can still function without it.

Attack:

- Require context pack before agent execution.
- Show pack in Mission Control.
- Link pack to quality gates and final report.

### Gap E — Production DB release gate external blocker

Strict DB suite is still blocked by DNS.

Attack:

- Keep local work moving.
- Never mark release ready.
- Fix host/config, then run strict DB suite.

---

## 9. Definition of Done for the whole architecture plan

The architecture-and-design implementation is complete only when:

- All canonical contracts are in shared code.
- Every kernel primitive has at least one service/API route or explicit deferred status.
- Event Store is the source of timeline/audit/release history.
- Context Object Store is the source of retrieval and graph inputs.
- Context Pack is generated before AI execution.
- Scope Policy wraps all write paths.
- Quality Gate completion requires evidence.
- File locks block conflicting writes.
- Permission Kernel enforces default deny.
- Capability/Provider/Connect registries reflect real setup health.
- Artifact/Report outputs cite evidence.
- Drift detection can block contradictory docs/code changes.
- Browser runtime can produce product QA evidence.
- UI shows status truthfully across the 42-module taxonomy.
- Deterministic tests pass.
- Production DB strict tests pass.

Final release command set:

```cmd
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:deterministic
npm.cmd run secret-scan
npm.cmd run qa:debug-tags
npm.cmd run test:db
```

No release if any command fails or if any critical assertion is skipped.
