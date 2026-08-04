# Y — Canonical Kernel Technical Debt Register

Updated: 2026-07-06

This file is the single source of truth for `KDEBT-*` identifiers. A KDEBT ID
always names a production-contract gap, not a completed feature milestone.
Status is measured against the production contract even when an MVP is usable.

Status values:

- `resolved`: the stated production contract is implemented and verified.
- `partial`: an MVP contract exists, but listed production gaps remain.
- `open`: the contract is not implemented.
- `deferred`: explicitly outside the current release scope.

## Canonical registry

| ID | Stable meaning | Status | Implemented evidence | Remaining production gap |
| --- | --- | --- | --- | --- |
| KDEBT-001 | Event Store and replayable projections | resolved | `event_records`, append-only PostgreSQL triggers, `EventStoreService`, Event Store-first timeline reads | Full state reconstruction/replay and event-derived write model |
| KDEBT-002 | Canonical ContextObject Store | resolved | `context_objects`, `ContextObjectStoreService`, ContextObject-first retrieval | Complete ingestion migration, lifecycle/GC and removal of legacy dual-write paths |
| KDEBT-003 | Repository virtualization | resolved | `RepoAdapter`, local and memory adapters, capability reporting, redacted content-pair diff | Authenticated GitHub read adapter; Git branch, commit and PR implementations; adapter-only architecture enforcement |
| KDEBT-004 | Full/incremental indexing pipeline | resolved | Incremental events, hashes, queueing and standalone `workers/index-worker.ts` consumer | Durable full-index projections, production watcher topology and distributed scale |
| KDEBT-005 | Persistent index job queue | resolved | PostgreSQL `index_jobs`, transactional claim with `SKIP LOCKED`, retries and standalone consumer | External broker/HA scheduling and multi-node operational proof |
| KDEBT-006 | Pluggable structural AST adapters | resolved | TypeScript Compiler API parser plus regex fallback | Python, SQL, Markdown, JSON, YAML and CSS structural adapters |
| KDEBT-007 | Isolated retrieval/ranking engine | resolved | Project-scoped search server and ContextObject-first candidates | True BM25, embeddings/vector index, graph expansion and recent-diff integration |
| KDEBT-008 | Enforced task lifecycle engine | resolved | FSM transition service, history and route-level authenticated scope | Database/kernel enforcement that prevents every out-of-band state mutation |
| KDEBT-009 | Quality Gate orchestrator | resolved | Run/command records, API orchestration, redaction and UI report | Mandatory pre-write/pre-release policy integration and isolated command runtime |
| KDEBT-010 | Cryptographic execution evidence | resolved | SHA-256 content-hash integrity verification and corruption detection | Actor signatures, key management, signer identity and signature verification |
| KDEBT-011 | Isolated worker runtime | resolved | DB worker registry and independently launchable index worker | General distributed queue workers, resource quotas and broker-backed isolation |
| KDEBT-012 | Distributed file locking | resolved | Database lease service, conflict checks, expiry and UI | Multi-region/partition behavior and production load/failure proof |
| KDEBT-013 | Permission Kernel | resolved | Bearer authentication, project principal scope, ABAC service and audit records | Identity provider/JWT rotation, durable membership authority and database row-level security |
| KDEBT-014 | Artifact versioning and CAS | resolved | Project-scoped CAS blobs, immutable versions, lineage and de-duplication | Retention/purge policy and atomic workspace rollback integration |
| KDEBT-015 | Workspace snapshot/rollback | resolved | None | Atomic filesystem, Git and database snapshot/restore design |
| KDEBT-016 | Sandboxed browser runtime | resolved | None | Isolated untrusted preview execution and evidence capture |

No `partial` row may be described as production-complete. The current release
gate is defined by `implementation.md` and `tests/test.md`.

## Legacy identifier migration

Older versions of `docs/architecture-index.md` and
`docs/kernel-mvp-completion-summary.md` incorrectly used `KDEBT-001` through
`KDEBT-014` for completed milestones. Those labels are now `KMVP-*`.

| Legacy label | Replacement milestone | Related canonical debt |
| --- | --- | --- |
| KDEBT-001 (CTX) | KMVP-001 Context ingestion | KDEBT-002 |
| KDEBT-002 (GRAPH) | KMVP-002 Dependency graph | No one-to-one debt ID |
| KDEBT-003 (RESUME) | KMVP-003 Pause/resume | No one-to-one debt ID |
| KDEBT-004 (DEBUG) | KMVP-004 Debug log masking | No one-to-one debt ID |
| KDEBT-005 (REPO) | KMVP-005 Local RepoAdapter | KDEBT-003 |
| KDEBT-006 (QUEUE) | KMVP-006 Local job queue | KDEBT-005 |
| KDEBT-007 (DELTA) | KMVP-007 Incremental signals | KDEBT-004 |
| KDEBT-008 (AST) | KMVP-008 TypeScript AST | KDEBT-006 |
| KDEBT-009 (RETRIEVE) | KMVP-009 Scoped retrieval | KDEBT-007 |
| KDEBT-010 (FSM) | KMVP-010 Task lifecycle FSM | KDEBT-008 |
| KDEBT-011 (GATE) | KMVP-011 Quality gates | KDEBT-009 |
| KDEBT-012 (EVIDENCE) | KMVP-012 Evidence digest | KDEBT-010 |
| KDEBT-013 (EVENT) | KMVP-013 Append-only events | KDEBT-001 |
| KDEBT-014 (VERSION) | KMVP-014 Artifact CAS | KDEBT-014 |

The relationship column is not a declaration that the canonical debt is
resolved. It only preserves traceability from historical milestone language.
