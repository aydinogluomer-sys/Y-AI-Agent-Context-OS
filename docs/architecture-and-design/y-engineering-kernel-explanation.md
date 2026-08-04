# Y — Engineering Kernel Explanation

> Conceptual engineering explanation. For measured runtime status and open
> production gaps, use `implementation.md` and the canonical KDEBT register.

## Purpose

This document explains the engineering kernel required to make the Y project work as one coherent system.

Y already defines many high-level modules: Context OS, Knowledge Graph, Resume System, Governance, Capability Advisor, OSS Intelligence, Mission Control, Artifact System, Quality Gates, Debug Runtime, Model Router, Connect Layer, Security, Cost Governance, Prompt Library, Rollback, External Integrations, and UX surfaces.

The missing piece is not another feature group. The missing piece is the **kernel layer** that connects those modules through stable contracts.

The engineering thesis:

> Y must be built around stable primitives: Event, Context Object, Graph Node, Graph Edge, Task, Context Pack, Evidence, Quality Gate, Permission, Lock, Artifact, Snapshot, Decision, Job, Approval, Provider, and Connection.

If these primitives are defined early, every feature becomes a projection of the same platform state. If they are not defined, the product becomes disconnected dashboards, logs, agent histories, and unreliable AI outputs.

---

## 1. Event Store / Event Sourcing Kernel

### Section 1 — Connected existing features

- Resume System: `RESUME-001` to `RESUME-014`
- Agent Timeline: `RESUME-034` to `RESUME-038`
- Governance: `GOV-001`, `GOV-002`, `GOV-008`, `GOV-009`, `GOV-037`, `GOV-038`
- Artifact System: `ART-024` to `ART-028`
- Security / Audit: `SEC-012` to `SEC-017`
- Rollback: `SAFE-006` to `SAFE-012`
- Mission Control: `EXEC-001` to `EXEC-021`

### Section 1 — Why it is needed

All these modules answer the same question:

> What happened in the system?

Without a central Event Store:

- Resume keeps its own history.
- Timeline keeps a different history.
- Audit keeps another history.
- Final Report reconstructs another version.
- Rollback cannot reliably restore previous state.

### Section 1 — Kernel contract

```txt
EVENT_STORE
├── event_id
├── project_id
├── task_id
├── actor_type: human | agent | system | worker
├── actor_id
├── event_type
├── payload
├── source_refs
├── affected_files
├── created_at
├── correlation_id
└── causation_id
```

### Section 1 — Required event types

```txt
PROJECT_CREATED
REPO_CONNECTED
CONTEXT_INDEX_STARTED
CONTEXT_INDEX_COMPLETED
TASK_CREATED
TASK_STATUS_CHANGED
CONTEXT_PACK_GENERATED
AGENT_STARTED
AGENT_PAUSED
AGENT_RESUMED
FILE_LOCKED
FILE_MODIFIED
TEST_RUN_STARTED
TEST_RUN_PASSED
TEST_RUN_FAILED
DECISION_ACCEPTED
DECISION_OVERRIDDEN
ARTIFACT_GENERATED
SNAPSHOT_CREATED
ROLLBACK_CREATED
APPROVAL_REQUESTED
APPROVAL_GRANTED
APPROVAL_REJECTED
```

### Section 1 — Engineering result

- Resume becomes event replay.
- Agent Timeline becomes event projection.
- Audit becomes filtered security events.
- Final Report becomes event + evidence summary.
- Rollback uses event boundaries.
- Governance decisions become immutable events.

---

## 2. Context Vault Storage Layer

### Section 2 — Connected existing features

- Context Vault: `CTX-001` to `CTX-014`
- Context Retrieval: `CTX-015` to `CTX-023`
- Knowledge Graph: `GRAPH-001` to `GRAPH-009`
- Connect Layer: `CONN-029`, `CONN-039`, `CONN-040`, `CONN-041`, `CONN-042`
- OSS Intelligence: `OSS-018`, `OSS-019`, `OSS-021`

### Section 2 — Why it is needed

Y reads different kinds of project knowledge:

- code files
- markdown docs
- tests
- prompts
- agent sessions
- git history
- API docs
- UI/UX specs
- design specs
- decision logs
- connected tool data
- external repo references

These must be normalized into one object model. Otherwise retrieval becomes source-specific and inconsistent.

### Section 2 — Kernel contract

```txt
CONTEXT_OBJECT
├── object_id
├── project_id
├── source_type: file | doc | test | commit | decision | prompt | session | artifact | schema | design
├── source_uri
├── title
├── raw_content
├── normalized_content
├── content_hash
├── version_hash
├── language
├── metadata
├── authority_score
├── freshness_score
├── created_at
└── updated_at
```

### Section 2 — Engineering result

- Semantic search reads the same object model.
- Knowledge Graph creates nodes from these objects.
- Drift Detection compares normalized docs/code/decisions.
- Resume reads prior session/task context.
- Artifacts become queryable context.

---

## 3. Indexing Pipeline

### Section 3 — Connected existing features

- Semantic Search: `CTX-015`
- Keyword Search: `CTX-016`
- Graph Traversal: `CTX-017`
- File Relationship Ranking: `CTX-018`
- Knowledge Graph: `GRAPH-001` to `GRAPH-009`
- Repo Advisor: `OSS-018` to `OSS-022`
- External Integrations: `EXT-017` to `EXT-023`

### Section 3 — Why it is needed

Y cannot produce correct Context Packs unless source content is loaded, normalized, parsed, embedded, indexed, and connected.

### Section 3 — Required pipeline

```txt
Source Connector
↓
File Loader
↓
Content Normalizer
↓
Language Detector
↓
AST Parser
↓
Chunker
↓
Embedding Generator
↓
Keyword Indexer
↓
Graph Builder
↓
Context Object Store
↓
Search Index
↓
Retrieval API
```

### Section 3 — Kernel contract

```txt
INDEX_JOB
├── job_id
├── project_id
├── source_id
├── job_type: full | incremental | reindex | delete_sync
├── status: queued | running | failed | completed
├── changed_objects
├── errors
├── started_at
└── finished_at
```

### Section 3 — Engineering result

- GitHub Connect triggers indexing.
- AST layer emits structural edges.
- Graph layer creates dependency maps.
- Context Pack Generator has reliable input.
- Mission Control can show indexing progress.

---

## 4. AST / Static Analysis Layer

### Section 4 — Connected existing features

- Dependency Graph: `GRAPH-010` to `GRAPH-017`
- Reverse Dependency Discovery: `GRAPH-018` to `GRAPH-023`
- Impact Analysis: `GRAPH-024` to `GRAPH-033`
- Quality Gates: `QA-004`, `QA-005`, `QA-012`, `QA-022`

### Section 4 — Why it is needed

Regex-based analysis is not enough for import graphs, API calls, routes, database usage, test coverage, and impact analysis.

### Section 4 — Kernel contract

```txt
AST_ADAPTER
├── TypeScriptAdapter
├── JavaScriptAdapter
├── PythonAdapter
├── SQLAdapter
├── MarkdownAdapter
├── JSONAdapter
├── YAMLAdapter
└── CSSAdapter
```

### Section 4 — Required edge types

```txt
IMPORTS
EXPORTS
CALLS
RENDERS_COMPONENT
USES_HOOK
USES_ROUTE
USES_API
USES_TABLE
USES_ENV_VAR
TESTS_FILE
DOCUMENTS_FILE
CONFIGURES_TOOL
```

### Section 4 — Engineering result

- Related files are discovered by evidence, not guesses.
- Affected tests are selected from real relationships.
- Unauthorized changes can be blocked.
- API/docs/database drift can be detected.

---

## 5. Knowledge Graph Storage

### Section 5 — Connected existing features

- Knowledge Graph: `GRAPH-001` to `GRAPH-009`
- Dependency Graph: `GRAPH-010` to `GRAPH-017`
- Change Simulation: `GRAPH-034` to `GRAPH-038`
- Context Retrieval: `CTX-017`, `CTX-018`, `CTX-023`

### Section 5 — Why it is needed

Y needs relationship intelligence, not only document search.

### Section 5 — MVP recommendation

Start with Postgres node/edge tables. Neo4j can come later if traversal needs outgrow Postgres.

```txt
GRAPH_NODE
├── node_id
├── project_id
├── node_type
├── object_id
├── label
├── metadata
└── created_at

GRAPH_EDGE
├── edge_id
├── project_id
├── from_node_id
├── to_node_id
├── edge_type
├── weight
├── evidence
├── confidence
└── created_at
```

### Section 5 — Engineering result

- Retrieval can use graph proximity.
- Impact Analysis can follow edges.
- Context Confidence can be evidence-based.
- Change Simulation can calculate affected files.

---

## 6. Context Pack Schema

### Section 6 — Connected existing features

- Context Pack Generator: `CTX-024` to `CTX-037`
- Semantic Compression: `CTX-038` to `CTX-042`
- Governance: `GOV-013` to `GOV-025`
- Quality Gates: `QA-001` to `QA-026`
- Model Router: `MODEL-046` to `MODEL-063`
- Boundary Enforcement: `CTX-043` to `CTX-049`

### Section 6 — Why it is needed

Context Pack is the key Y artifact. It turns a large repo into task-ready AI context.

### Section 6 — Kernel contract

```json
{
  "context_pack_id": "ctxp_123",
  "project_id": "proj_123",
  "task_id": "task_123",
  "task_summary": "...",
  "intent": "refactor | debug | implement | review | document",
  "primary_files": [],
  "related_files": [],
  "direct_dependencies": [],
  "reverse_dependencies": [],
  "related_tests": [],
  "related_docs": [],
  "related_decisions": [],
  "recent_diffs": [],
  "known_risks": [],
  "forbidden_changes": [],
  "quality_gates": [],
  "missing_context": [],
  "confidence_score": 0.87,
  "token_budget": {
    "max_tokens": 50000,
    "estimated_tokens": 31800
  },
  "recommended_agent": "claude-code",
  "recommended_model": "claude-sonnet",
  "next_action": "...",
  "generated_at": "..."
}
```

### Section 6 — Engineering result

- Claude Code, Cursor, Codex, and Windsurf receive consistent task context.
- Resume can continue from the last valid pack.
- Quality Gates know what to run.
- Scope Policy can be generated from Context Pack.
- Final Report can explain why each file was included.

---

## 7. Retrieval Ranking Engine

### Section 7 — Connected existing features

- Retrieval: `CTX-015` to `CTX-023`
- Source Priority: `GOV-013` to `GOV-019`
- Hallucination Prevention: `GOV-020` to `GOV-025`
- Context Confidence: `CTX-023`

### Section 7 — Why it is needed

Semantic similarity alone is not reliable. Y must combine semantic, graph, dependency, recency, authority, and scope signals.

### Section 7 — Suggested formula

```txt
final_score =
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

### Section 7 — Explainability contract

```json
{
  "file": "src/auth/session.ts",
  "score": 0.91,
  "why_included": [
    "direct import from primary file",
    "changed in last 3 commits",
    "covered by affected test",
    "referenced in decision ADR-004"
  ]
}
```

### Section 7 — Engineering result

- Context Pack contents become explainable.
- Missing context can be detected.
- Hallucination risk decreases.
- Source priority becomes enforceable.

---

## 8. Scope / Boundary Policy Engine

### Section 8 — Connected existing features

- Boundary Enforcement: `CTX-043` to `CTX-049`
- Ownership Control: `EXEC-022` to `EXEC-027`
- Merge Blockers: `QA-022`, `QA-026`
- Human Approval: `UX-028`, `UX-033`

### Section 8 — Why it is needed

Y promises that agents will not touch unrelated files. This must be enforced at the write layer.

### Section 8 — Kernel contract

```txt
SCOPE_POLICY
├── task_id
├── allowed_paths
├── forbidden_paths
├── allowed_operations: read | write | delete | execute
├── approval_required_paths
├── max_files_changed
├── max_diff_size
└── violation_action: warn | block | require_approval
```

### Section 8 — Engineering result

- Agents can only write allowed files.
- Protected paths require approval.
- Out-of-scope changes become merge blockers.
- Large deletions trigger safety checks.

---

## 9. Multi-Agent Locking / Concurrency

### Section 9 — Connected existing features

- Multi-Agent Handoff: `RESUME-027` to `RESUME-033`
- Mission Control: `EXEC-001` to `EXEC-021`
- Ownership Control: `EXEC-022` to `EXEC-027`

### Section 9 — Why it is needed

Multiple agents can conflict on the same file or related files.

### Section 9 — Kernel contract

```txt
FILE_LOCK
├── lock_id
├── project_id
├── file_path
├── task_id
├── agent_id
├── lock_type: read | write | exclusive
├── expires_at
├── status: active | released | expired
└── created_at
```

### Section 9 — Conflict policy

```txt
IF same_file_write_by_two_agents:
  block second write
  create conflict event
  require human approval

IF related_file_write:
  warn
  run impact analysis

IF stale context pack:
  block execution
  regenerate context pack
```

### Section 9 — Engineering result

- Claude and Cursor cannot overwrite each other blindly.
- Handoffs carry locks and task state.
- Mission Control shows true ownership.
- Stale context execution is blocked.

---

## 10. Scheduler / Queue Engine

### Section 10 — Connected existing features

- Timed Resume: `RESUME-015` to `RESUME-021`
- Agent Queue: `EXEC-016` to `EXEC-021`
- Indexing Pipeline
- Artifact generation
- Browser verification
- Quality Gates

### Section 10 — Kernel contract

```txt
JOB
├── job_id
├── project_id
├── task_id
├── job_type
├── status: queued | running | paused | failed | completed | cancelled
├── priority
├── run_at
├── retry_count
├── max_retries
├── locked_by_worker
├── payload
├── error
└── timestamps
```

### Section 10 — Engine options

- MVP: Postgres queue + worker
- Growth: Inngest or Trigger.dev
- Complex orchestration: Temporal
- Redis-based Node stack: BullMQ + Redis

### Section 10 — Engineering result

- Resume works.
- Failed jobs retry.
- Indexing runs in background.
- Artifact generation does not block UI.
- Mission Control has real queue state.

---

## 11. Evidence Store

### Section 11 — Connected existing features

- Artifact System: `ART-016` to `ART-023`
- Debug Runtime: `DEBUG-012` to `DEBUG-040`
- Browser Verification: `ART-009` to `ART-015`
- Quality Gates: `QA-001` to `QA-026`

### Section 11 — Kernel contract

```txt
EVIDENCE
├── evidence_id
├── project_id
├── task_id
├── source_type: terminal | browser | test | network | screenshot | log | diff
├── content
├── file_uri
├── severity
├── linked_event_id
├── linked_artifact_id
├── created_at
└── retention_policy
```

### Section 11 — Engineering result

- Bug fixes are evidence-based.
- Final Reports cite real outputs.
- Quality Gates attach pass/fail evidence.
- Browser screenshots and terminal logs become reusable artifacts.

---

## 12. Quality Gate Orchestrator

### Section 12 — Connected existing features

- Static Gates: `QA-001` to `QA-006`
- Test Gates: `QA-007` to `QA-012`
- Product Gates: `QA-013` to `QA-018`
- Merge Blockers: `QA-019` to `QA-026`

### Section 12 — Kernel contracts

```txt
QUALITY_GATE
├── gate_id
├── task_type
├── required_checks
├── affected_files_pattern
├── required_evidence
├── blocking_level: warn | block
├── timeout
└── retry_policy

GATE_RESULT
├── gate_id
├── task_id
├── status: passed | failed | skipped
├── evidence_ids
├── failure_reason
├── created_at
└── blocks_merge
```

### Section 12 — Engineering result

- Agent cannot claim completion without validation.
- Merge blockers are automatic.
- Affected-test-only mode is possible.
- Final Report knows which gates passed.

---

## 13. Drift Detection Engine

### Section 13 — Connected existing features

- Context Drift: `GOV-026` to `GOV-031`
- Documentation Sync: `GOV-032` to `GOV-036`
- Quality Gate: `QA-024`
- Decision Enforcement: `GOV-008` to `GOV-012`

### Section 13 — Kernel contract

```txt
DRIFT_RULE
├── rule_id
├── source_node_type
├── target_node_type
├── relation_type
├── detection_strategy
├── severity
└── auto_fix_allowed
```

### Section 13 — Example rule

```txt
IF API route changed
AND docs/api.md not updated
THEN GOV-033 fails
AND QA-024 Missing docs update blocks merge
```

### Section 13 — Engineering result

- README/code drift is detected.
- API docs are checked against real route graph.
- Design specs can be checked against UI components.
- Decision conflicts become blocking signals.

---

## 14. Embedding / Semantic Compression Layer

### Section 14 — Connected existing features

- Semantic Compression: `CTX-038` to `CTX-042`
- Cost Governance: `COST-001` to `COST-015`
- Retrieval: `CTX-015`
- Context Pack: `CTX-024` to `CTX-037`

### Section 14 — Kernel contract

```txt
CHUNK
├── chunk_id
├── object_id
├── chunk_type: raw | summary | symbol | decision | diff | evidence
├── content
├── token_count
├── embedding
├── summary_level: L0 | L1 | L2 | L3
├── parent_chunk_id
└── freshness
```

### Section 14 — Compression levels

```txt
L0: raw file
L1: section/function summary
L2: file summary
L3: task-relevant compressed brief
```

### Section 14 — Engineering result

- Large repositories fit token budgets.
- Context Pack can rehydrate raw content when needed.
- Cost estimates become reliable.
- Session logs become durable memory.

---

## 15. Model Router Contract

### Section 15 — Connected existing features

- Task Categorizer: `MODEL-001` to `MODEL-010`
- Provider Registry: `MODEL-011` to `MODEL-045`
- Model Selection Flow: `MODEL-046` to `MODEL-052`
- Multi-Output Comparison: `MODEL-053` to `MODEL-063`
- Model Memory: `MODEL-064` to `MODEL-069`

### Section 15 — Kernel interface

```ts
interface ModelProvider {
  id: string
  capabilities: Capability[]
  maxContextTokens: number
  supportsTools: boolean
  supportsVision: boolean
  estimateCost(inputTokens: number, outputTokens: number): CostEstimate
  run(input: ModelRunInput): Promise<ModelRunResult>
}
```

### Section 15 — Engineering result

- Model choice depends on task, context, cost, and privacy.
- Run-all has budget warnings.
- Model comparison is standardized.
- Model memory can learn which model worked best.

---

## 16. Connect Provider SDK

### Section 16 — Connected existing features

- Connect Layer: `CONN-001` to `CONN-054`
- Connect Advisor: `CONN-008` to `CONN-019`
- External Integrations: `EXT-001` to `EXT-029`

### Section 16 — Kernel interface

```ts
interface ConnectProvider {
  id: string
  authType: 'oauth' | 'api_key' | 'local'
  scopes: Scope[]
  healthCheck(): Promise<HealthResult>
  sync(projectId: string): Promise<SyncResult>
  revoke(connectionId: string): Promise<void>
}
```

### Section 16 — Engineering result

- GitHub, Figma, Supabase, Notion, and AI providers use the same provider shape.
- Connection health is measurable.
- Permission logs are standardized.
- Connect data enters the Context Vault consistently.

---

## 17. Secret Vault / Permission Kernel

### Section 17 — Connected existing features

- Secret Management: `SEC-001` to `SEC-005`
- Permission System: `SEC-006` to `SEC-011`
- Audit Log: `SEC-012` to `SEC-017`
- Data Isolation: `SEC-018` to `SEC-022`

### Section 17 — Kernel contract

```txt
PERMISSION_GRANT
├── subject_type: user | agent | tool | connect
├── subject_id
├── resource_type: file | repo | secret | model | connect | task
├── resource_id
├── actions: read | write | execute | delete
├── requires_approval
├── expires_at
└── created_by
```

### Section 17 — Engineering result

- Agent access becomes enforceable.
- Secret redaction becomes systematic.
- Connect access is audited.
- Approval-required actions are blocked until approved.

---

## 18. Rollback / Snapshot System

### Section 18 — Connected existing features

- Rollback System: `SAFE-006` to `SAFE-010`
- Change Safety: `SAFE-011` to `SAFE-015`
- Artifact System: `ART-003`, `ART-005`, `ART-024`

### Section 18 — Kernel contract

```txt
SNAPSHOT
├── snapshot_id
├── project_id
├── task_id
├── git_commit_sha
├── context_pack_id
├── decision_state_hash
├── graph_version
├── artifact_ids
├── created_before_event_id
└── created_at
```

### Section 18 — Engineering result

- Rollback restores more than code.
- Context Pack state can be restored.
- Decision state can be restored.
- Verification can run after rollback.

---

## 19. Task Engine

### Section 19 — Connected existing features

- Task Engine: `TASK-001` to `TASK-008`
- Auto Todo Generation: `TASK-009` to `TASK-013`
- Project Readiness: `TASK-014` to `TASK-022`
- Workflow Recommendation: `TASK-023` to `TASK-028`

### Section 19 — Kernel lifecycle

```txt
CREATED
↓
ANALYZING
↓
CONTEXT_PACK_READY
↓
PLANNED
↓
AWAITING_APPROVAL
↓
RUNNING
↓
VERIFYING
↓
FAILED / COMPLETED
↓
DOCUMENTED
```

### Section 19 — Engineering result

- Every execution has lifecycle state.
- Context Pack is generated before execution.
- Approval blocks risky steps.
- Quality Gates verify completion.
- Resume restarts from a known state.

---

## 20. Debug Instrumentation Lifecycle

### Section 20 — Connected existing features

- Debug Runtime: `DEBUG-028` to `DEBUG-040`
- Quality Gates: `QA-023`
- Human Approval: `UX-029`

### Section 20 — Kernel lifecycle

```txt
DEBUG_POINT_PROPOSED
DEBUG_POINT_APPROVED
DEBUG_INSTRUMENTATION_INSERTED
EVIDENCE_COLLECTED
PATCH_APPLIED
VERIFICATION_PASSED
DEBUG_INSTRUMENTATION_REMOVED
```

### Section 20 — Required gate

```txt
IF file contains [Y_TEMP_DEBUG:*]
THEN QA-023 Temporary console logs fails
```

### Section 20 — Engineering result

- Temporary logs cannot remain in production.
- Debugging is evidence-based.
- Root cause is documented.
- Cleanup is enforceable.

---

## 21. Cache Architecture

### Section 21 — Connected existing features

- Retrieval: `CTX-015`, `CTX-017`, `CTX-023`
- Cost Governance: `COST-003`, `COST-005`
- Mission Control: `EXEC-015`
- Quality Gates

### Section 21 — Required cache layers

```txt
L1: in-memory request cache
L2: Redis project cache
L3: persisted index cache
L4: materialized graph traversal cache
```

### Section 21 — Cache candidates

```txt
repo_file_tree
dependency_graph
recent_context_pack
embedding_result
graph_neighbors
affected_tests
quality_gate_result
```

### Section 21 — Engineering result

- Context Pack generation is fast.
- Retrieval cost is reduced.
- Large repos become usable.
- Repeated QA and graph traversal are cheaper.

---

## 22. Resource Limits / Quota Kernel

### Section 22 — Connected existing features

- Token Budgeting: `COST-001` to `COST-005`
- Model Cost Control: `COST-006` to `COST-010`
- Team Billing Logic: `COST-011` to `COST-015`

### Section 22 — Kernel contract

```txt
PROJECT_LIMITS
├── max_repos
├── max_files
├── max_indexed_tokens
├── max_context_pack_tokens
├── max_monthly_model_cost
├── max_parallel_agents
├── max_connects
└── max_artifact_storage
```

### Section 22 — Engineering result

- Tasks cannot exceed budget silently.
- Run-all model execution is controlled.
- Context Pack compression is budget-driven.
- Billing can be computed from usage.

---

## 23. Capability / Provider Registry

### Section 23 — Connected existing features

- Capability Advisor: `CAP-001` to `CAP-007`
- Claude Skills Recommendation: `CAP-008` to `CAP-015`
- Slash Commands: `CAP-016` to `CAP-022`
- MCP Recommendation: `CAP-023` to `CAP-030`
- Tool Fit Analysis: `CAP-031` to `CAP-037`

### Section 23 — Kernel contract

```txt
CAPABILITY_REGISTRY
├── capability_id
├── type: model | mcp | connect | skill | tool | workflow
├── required_permissions
├── supported_task_types
├── cost_profile
├── risk_profile
├── setup_status
└── health_status
```

### Section 23 — Engineering result

- Tool recommendations are based on real capabilities.
- Missing MCP/connect warnings are reliable.
- Model Router and Connect Advisor share one registry.
- Project readiness can be computed.

---

## 24. Human Approval Engine

### Section 24 — Connected existing features

- Human Approval Layer: `UX-025` to `UX-033`
- Permission System: `SEC-011`
- Rollback: `SAFE-006` to `SAFE-010`
- Decision Override: `GOV-010`

### Section 24 — Kernel contract

```txt
APPROVAL_REQUEST
├── approval_id
├── project_id
├── task_id
├── requested_action
├── risk_level
├── diff_preview
├── context_pack_id
├── evidence_ids
├── requested_by
├── approved_by
├── status
└── expires_at
```

### Section 24 — Engineering result

- Risky actions pause workflows.
- Merge approval depends on QA results.
- Decision overrides are explicit.
- Debug instrumentation requires approval.

---

## 25. Artifact Versioning

### Section 25 — Connected existing features

- Artifact System: `ART-001` to `ART-008`
- Final Report Generator: `ART-024` to `ART-029`
- Browser Verification
- Quality Gates

### Section 25 — Kernel contract

```txt
ARTIFACT
├── artifact_id
├── project_id
├── task_id
├── artifact_type
├── version
├── content_uri
├── content_hash
├── evidence_ids
├── generated_by
├── created_at
└── supersedes_artifact_id
```

### Section 25 — Engineering result

- Artifacts are versioned.
- Diff/test/screenshot reports are linked to tasks.
- Final Report aggregates artifacts.
- Rollback can reference artifact state.

---

## 26. Repository Adapter Layer

### Section 26 — Connected existing features

- Git Integration: `SAFE-001` to `SAFE-005`
- External Integrations: `EXT-017` to `EXT-023`
- Context Indexing
- Boundary Enforcement
- Rollback

### Section 26 — Kernel interface

```ts
interface RepoAdapter {
  listFiles(): Promise<FileTree>
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  getDiff(): Promise<Diff>
  createBranch(name: string): Promise<void>
  commit(message: string): Promise<void>
  openPR(summary: string): Promise<PR>
}
```

### Section 26 — Engineering result

- GitHub, GitLab, Bitbucket, and local repos can share one workflow.
- Writes can be wrapped by scope enforcement.
- Diffs and PRs become standardized.
- Rollback can use repository state.

---

## 27. Browser Runtime Adapter

### Section 27 — Connected existing features

- Browser Verification: `ART-009` to `ART-015`
- Debug Runtime: `DEBUG-001` to `DEBUG-027`
- Product Gates: `QA-013` to `QA-018`

### Section 27 — Kernel contract

```txt
BROWSER_SESSION
├── session_id
├── project_id
├── task_id
├── route
├── console_events
├── network_events
├── screenshots
├── interaction_steps
└── status
```

### Section 27 — Engineering result

- Route/form/button checks become repeatable.
- Console and network errors become evidence.
- Screenshots become artifacts.
- Visual regression can be automated.

---

## 28. Database / Backend Introspection Layer

### Section 28 — Connected existing features

- Database Usage Graph: `GRAPH-015`
- Affected Database Rules: `GRAPH-030`
- Supabase Connect: `CONN-034`
- Firebase Connect: `CONN-035`
- Security and Data Isolation

### Section 28 — Kernel contract

```txt
DB_OBJECT
├── table
├── column
├── policy
├── function
├── trigger
├── view
├── migration
└── edge_to_code_usage
```

### Section 28 — Engineering result

- RLS/policy changes can trigger security gates.
- Code can be linked to tables and server functions.
- API/database drift becomes detectable.
- Backend schema can enter Context Pack.

---

## 29. Decision State Machine

### Section 29 — Connected existing features

- Decision Memory: `GOV-001` to `GOV-007`
- Decision Enforcement: `GOV-008` to `GOV-012`
- Context Source Priority: `GOV-013` to `GOV-019`
- Drift Detection
- Quality Gates

### Section 29 — Kernel contract

```txt
DECISION
├── decision_id
├── project_id
├── type
├── status: proposed | accepted | deprecated | overridden
├── rule_expression
├── rationale
├── source_refs
├── supersedes
└── created_at
```

### Section 29 — Engineering result

- Architecture rules are enforceable.
- Contradictions become detectable.
- Overrides require approval.
- Context Pack carries relevant decisions.

---

## Minimum implementation order

```txt
01. Event Store
02. Context Object Store
03. Indexing Pipeline
04. AST / Static Analysis Layer
05. Knowledge Graph Storage
06. Retrieval Ranking Engine
07. Context Pack Schema
08. Scope / Boundary Policy Engine
09. Task Engine
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
```

## Final judgement

The engineering priority is not adding new modules. The priority is defining the contracts that allow existing modules to operate as a coherent system.

The core contracts are:

- Event
- Context Object
- Graph Node
- Graph Edge
- Task
- Context Pack
- Evidence
- Quality Gate
- Permission
- Lock
- Artifact
- Snapshot
- Decision
- Job
- Approval
- Provider
- Connection

These contracts are the real Y kernel.
