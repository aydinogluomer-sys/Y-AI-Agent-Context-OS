# Y — Engineering Architecture Schema

> Target architecture reference, not proof that every listed module exists.
> Current implementation status is tracked in `implementation.md` and
> `docs/kernel-debt-register.md`.

## 1. High-level architecture

```mermaid
flowchart TD
    U[User / Human Operator] --> UI[Y Web App / Mission Control]

    UI --> TASK[Task Engine]
    UI --> APPROVAL[Human Approval Engine]
    UI --> DASH[Dashboards / Reports]

    TASK --> CP[Context Pack Generator]
    TASK --> QUEUE[Scheduler / Queue Engine]
    TASK --> EVENT[Event Store]
    TASK --> POLICY[Scope / Boundary Policy Engine]

    CP --> RETRIEVAL[Retrieval Ranking Engine]
    CP --> GRAPH[Knowledge Graph]
    CP --> VAULT[Context Object Store]
    CP --> GOV[Decision State Machine]
    CP --> QG[Quality Gate Orchestrator]

    RETRIEVAL --> VECTOR[Embedding / Semantic Index]
    RETRIEVAL --> GRAPH
    RETRIEVAL --> VAULT

    QUEUE --> WORKERS[Workers]
    WORKERS --> INDEX[Indexing Pipeline]
    WORKERS --> AGENTS[Agent Runtime]
    WORKERS --> BROWSER[Browser Runtime Adapter]
    WORKERS --> QG

    INDEX --> AST[AST / Static Analysis Layer]
    INDEX --> VAULT
    INDEX --> GRAPH
    INDEX --> VECTOR

    AGENTS --> MODEL[Model Router]
    AGENTS --> REPO[Repository Adapter]
    AGENTS --> LOCK[Multi-Agent Locking]
    AGENTS --> EVIDENCE[Evidence Store]

    MODEL --> PROVIDERS[Model Providers]
    REPO --> GIT[GitHub / GitLab / Local FS]
    BROWSER --> EVIDENCE
    QG --> EVIDENCE
    EVIDENCE --> ART[Artifact Versioning]
    ART --> DASH

    CONNECT[Connect Provider SDK] --> VAULT
    CONNECT --> SECRETS[Secret Vault / Permission Kernel]
    CONNECT --> EVENT

    POLICY --> REPO
    POLICY --> LOCK
    POLICY --> APPROVAL

    GOV --> EVENT
    QG --> EVENT
    ART --> EVENT
    LOCK --> EVENT
    APPROVAL --> EVENT

    SNAP[Rollback / Snapshot System] --> EVENT
    SNAP --> REPO
    SNAP --> CP
    SNAP --> ART
```

---

## 2. Core kernel objects

```mermaid
erDiagram
    PROJECT ||--o{ TASK : owns
    PROJECT ||--o{ CONTEXT_OBJECT : contains
    PROJECT ||--o{ GRAPH_NODE : has
    PROJECT ||--o{ EVENT : records
    PROJECT ||--o{ ARTIFACT : produces
    PROJECT ||--o{ CONNECTION : uses
    PROJECT ||--o{ PERMISSION_GRANT : controls

    TASK ||--o{ EVENT : emits
    TASK ||--o{ CONTEXT_PACK : generates
    TASK ||--o{ EVIDENCE : collects
    TASK ||--o{ GATE_RESULT : validates
    TASK ||--o{ APPROVAL_REQUEST : waits_for
    TASK ||--o{ FILE_LOCK : locks
    TASK ||--o{ SNAPSHOT : snapshots
    TASK ||--o{ ARTIFACT : outputs

    CONTEXT_OBJECT ||--o{ CHUNK : chunked_into
    CONTEXT_OBJECT ||--o{ GRAPH_NODE : represented_by

    GRAPH_NODE ||--o{ GRAPH_EDGE : from
    GRAPH_NODE ||--o{ GRAPH_EDGE : to

    CONTEXT_PACK ||--o{ CONTEXT_PACK_ITEM : includes
    CONTEXT_PACK ||--o{ QUALITY_GATE : requires
    CONTEXT_PACK ||--o{ DECISION : references

    EVIDENCE ||--o{ ARTIFACT : supports
    QUALITY_GATE ||--o{ GATE_RESULT : produces
    DECISION ||--o{ EVENT : changes_state
```

---

## 3. Indexing and retrieval architecture

```mermaid
flowchart LR
    SRC[Source Connector] --> LOAD[File Loader]
    LOAD --> NORM[Content Normalizer]
    NORM --> LANG[Language Detector]
    LANG --> AST[AST Parser]
    AST --> EDGES[Structural Edge Extractor]
    NORM --> CHUNK[Chunker]
    CHUNK --> EMBED[Embedding Generator]
    CHUNK --> KW[Keyword Indexer]

    EDGES --> GRAPH[Knowledge Graph]
    EMBED --> VECTOR[Vector Index]
    KW --> SEARCH[Keyword Index]
    NORM --> VAULT[Context Object Store]

    SEARCH --> RET[Retrieval Engine]
    VECTOR --> RET
    GRAPH --> RET
    VAULT --> RET

    RET --> RANK[Ranking + Explainability]
    RANK --> CP[Context Pack]
```

---

## 4. Agent execution architecture

```mermaid
sequenceDiagram
    participant User
    participant Task as Task Engine
    participant CP as Context Pack Generator
    participant Approval as Approval Engine
    participant Queue as Queue
    participant Agent as Agent Runtime
    participant Repo as Repository Adapter
    participant Gate as Quality Gates
    participant Evidence as Evidence Store
    participant Event as Event Store

    User->>Task: Create task
    Task->>Event: TASK_CREATED
    Task->>CP: Generate context pack
    CP->>Event: CONTEXT_PACK_GENERATED
    Task->>Approval: Request approval if risky
    Approval->>Event: APPROVAL_GRANTED
    Task->>Queue: Enqueue execution
    Queue->>Agent: Start agent job
    Agent->>Event: AGENT_STARTED
    Agent->>Repo: Read/write allowed files
    Repo->>Event: FILE_MODIFIED
    Agent->>Evidence: Store model output / logs
    Agent->>Gate: Run required gates
    Gate->>Evidence: Store test/build/browser evidence
    Gate->>Event: TEST_RUN_PASSED or TEST_RUN_FAILED
    Task->>Event: TASK_COMPLETED or TASK_FAILED
```

---

## 5. Boundary enforcement architecture

```mermaid
flowchart TD
    CP[Context Pack] --> POLICY[Scope Policy]
    POLICY --> ALLOW[Allowed Paths]
    POLICY --> FORBID[Forbidden Paths]
    POLICY --> OPS[Allowed Operations]

    AGENT[Agent Runtime] --> WRITE[Write Attempt]
    WRITE --> CHECK{Policy Check}

    CHECK -->|Allowed| LOCK[Acquire File Lock]
    CHECK -->|Requires Approval| APPROVAL[Approval Request]
    CHECK -->|Forbidden| BLOCK[Block + Emit Violation Event]

    LOCK --> REPO[Repository Adapter]
    APPROVAL -->|Approved| LOCK
    APPROVAL -->|Rejected| BLOCK
```

---

## 6. Quality gate architecture

```mermaid
flowchart TD
    TASK[Task Type + Affected Files] --> SELECT[Gate Selector]
    CP[Context Pack] --> SELECT
    SELECT --> STATIC[Static Gates]
    SELECT --> TEST[Test Gates]
    SELECT --> PRODUCT[Product Gates]
    SELECT --> DRIFT[Drift Gates]

    STATIC --> RESULT[Gate Results]
    TEST --> RESULT
    PRODUCT --> RESULT
    DRIFT --> RESULT

    RESULT --> EVIDENCE[Evidence Store]
    RESULT --> EVENT[Event Store]
    RESULT --> MERGE{Blocks Merge?}

    MERGE -->|Yes| BLOCK[Block Completion]
    MERGE -->|No| PASS[Allow Completion]
```

---

## 7. Storage/service boundaries

```txt
apps/web
├── Mission Control UI
├── Project Dashboard
├── Context Graph UI
├── Task Board
├── Artifact Center
├── Debug Console
└── Approval UI

packages/kernel
├── event-store
├── task-engine
├── context-pack
├── policy-engine
├── permission-engine
├── quality-gates
├── evidence
├── artifacts
├── snapshots
└── decisions

packages/indexing
├── source-loaders
├── content-normalizer
├── ast-adapters
├── chunker
├── embedding
├── keyword-index
└── graph-builder

packages/graph
├── node-store
├── edge-store
├── traversal
├── impact-analysis
└── drift-detection

packages/providers
├── repo-adapters
├── connect-providers
├── model-providers
├── browser-runtime
└── mcp-providers

workers
├── index-worker
├── agent-worker
├── gate-worker
├── artifact-worker
├── browser-worker
└── resume-worker
```

---

## 8. Recommended MVP architecture boundary

The MVP should not implement all Y modules.

The first production-grade engineering slice should be:

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

This slice proves the most important claim:

> Y gives AI agents the right project context and prevents unsafe, unrelated changes.
