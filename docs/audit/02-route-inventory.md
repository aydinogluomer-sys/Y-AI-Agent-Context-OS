# 02 — Route Inventory

Complete inventory of all 15 navigation categories and 78 UI routes in Y-OS:

## 00 — Mission Control
- `/chat`: Chat Cockpit (`chat-cockpit`)
- `/dashboard`: AI Mission Control (`project-dashboard`)
- `/active-project`: Active Project Coordinates (`active-project`)
- `/system-health`: Global Engine Vitals (`system-health`)
- `/budget`: Token Budget Status (`token-budget-status`)
- `/cost-chart`: Cost & Compression Chart (`cost-compression-chart`)

## 01 — Projects & Workspace
- `/projects`: Projects Registry (`projects`)
- `/memberships`: Membership Authorization (`memberships`)
- `/scoped-paths`: Scoped Path Restrictions (`scoped-paths`)
- `/repo-adapter`: Repo Adapter Engine (`repo-adapter`)
- `/explorer`: File Explorer (`file-explorer`)
- `/allowed-paths`: Allowed Whitelist Paths (`allowed-paths`)
- `/boundaries`: Workspace Boundaries (`workspace-boundaries`)

## 02 — Context OS
- `/index-jobs`: Index Job Orchestrator (`index-job-orchestrator`)
- `/ctx-objects`: Context Objects Catalog (`context-objects`)
- `/ctx-items`: Context Items Buffer (`context-items`)
- `/ctx-chunks`: Context Chunks & Hashes (`context-chunks`)
- `/pack-builder`: 50K Context Pack Builder (`context-pack-builder`)
- `/ratios`: Compression Ratios (`compression-ratios`)
- `/ranking`: Segment Ranking (`segment-ranking`)
- `/registry`: Context Registry (`context-registry`)
- `/export`: Context Export Wizard (`context-export`)

## 03 — Graph Intelligence
- `/impact-analysis`: Impact Analysis Panel (`impact-analysis`)
- `/ast-map`: AST Map (`ast-map`)
- `/dependency-graph`: Dependency Graph (`dependency-graph`)
- `/symbols`: Symbol Index (`symbol-index`)
- `/resolver`: Import/Export Resolver (`import-export-resolver`)
- `/radius`: Impact Radius (`impact-radius`)
- `/incremental-idx`: Incremental Indexing (`incremental-index`)
- `/recovery`: Syntax Recovery (`syntax-recovery`)

## 04 — Artifact CAS
- `/artifacts`: Artifact Center CAS (`artifact-center`)
- `/ws-files`: Workspace Files (`workspace-files`)
- `/blobs`: CAS Blobs (`cas-blobs`)
- `/dedup`: Deduplicated Chunks (`dedup-chunks`)
- `/hash-verify`: Hash Verification (`hash-verification`)
- `/integrity-audit`: Integrity Audit (`integrity-audit`)
- `/quarantine`: Quarantine Records (`quarantine`)

## 05 — Task Lifecycle
- `/file-locks`: File Locks & Leases (`file-locks`)
- `/tasks`: Task Board (`task-board`)
- `/backlog`: Backlog Queue (`backlog`)
- `/active-tasks`: Active Tasks (`active-tasks`)
- `/verified`: Verified Tasks (`verified-tasks`)
- `/closed`: Closed Tasks (`closed-tasks`)
- `/fsm`: FSM State Transitions (`fsm-transitions`)

## 06 — Agent Network
- `/dispatcher`: Dispatcher Agent (`dispatcher-agent`)
- `/ctx-builder`: Context Builder Agent (`context-builder-agent`)
- `/developer`: Developer Agent (`developer-agent`)
- `/qa-agent`: QA Agent (`qa-agent`)
- `/director`: Director Agent (`director-agent`)
- `/checkpoints`: Session Checkpoints (`session-checkpoints`)
- `/handoff`: Continuation Handoff (`continuation-handoff`)
- `/autochecks`: Chronological Autochecks (`chronological-autochecks`)

## 07 — Security Kernel
- `/security`: Permission Kernel (`permission-kernel`)
- `/abac-matrix`: ABAC Matrix (`abac-matrix`)
- `/policies`: Role Policies (`role-policies`)
- `/human-approval`: Human Approval Gate (`human-approval-gate`)
- `/traversal-guard`: Path Traversal Guard (`path-traversal-guard`)
- `/redactor`: Secret Redactor (`secret-redactor`)
- `/default-deny`: Default Deny Rules (`default-deny-rules`)
- `/read-only`: Read Only Rules (`read-only-policies`)

## 08 — Evidence & Audit
- `/evidence`: Evidence Store Panel (`evidence-store`)
- `/events`: Agent Event Journal (`event-journal`)
- `/event-store`: Event Store (`event-store`)
- `/health-gauge`: Evidence Health Gauge (`evidence-health-gauge`)
- `/corruption`: Corruption Reports (`corruption-reports`)
- `/ledger`: Cryptographic Ledger (`cryptographic-ledger`)
- `/signed-logs`: Signed Logs (`signed-logs`)

## 09 — Worker Runtime
- `/workers`: Worker Runtime HUD (`worker-runtime`)
- `/index-sync`: Index Sync Jobs (`index-sync`)
- `/git-tracking`: Git Tracking (`git-tracking`)
- `/ast-jobs`: AST Compilation Jobs (`ast-compilation-jobs`)
- `/load`: Load Metrics (`load-metrics`)
- `/telemetry`: Runtime Telemetry (`runtime-telemetry`)

## 10 — Database & Migrations
- `/db-status`: DB Status (`db-status`)
- `/db-pool`: Supabase Pool Manager (`supabase-pool-manager`)
- `/migrations`: Migration Ledger (`migrations`)
- `/schema`: Schema Browser (`schema-browser`)
- `/dev-reset`: Dev Reset Utility (`dev-reset-utility`)
- `/tables`: Public Tables (`public-tables`)

## 11 — Providers & Connectors
- `/model-routing`: Model Routing (`model-routing`)
- `/google-sdk`: Google SDK Adapter (`google-sdk-adapter`)
- `/saas-sync`: SaaS Sync States (`saas-sync-states`)
- `/credentials`: Credential Stubs (`credential-stubs`)
- `/connectors`: Connect Center (`connect-center`)

## 12 — QA & Validation
- `/quality-gates`: Quality Gate Report (`quality-gate-report`)
- `/test-runner`: Test Runner (`test-runner`)
- `/test-det`: Deterministic Tests (`deterministic-tests`)
- `/test-db`: DB Integration Tests (`db-integration-tests`)
- `/secret-scan`: Secret Scan (`secret-scan`)
- `/debug-gate`: Debug Tag Gate (`debug-tag-gate`)
- `/manual-qa`: Manual QA Checklist (`manual-qa-checklist`)
- `/stage-27` .. `/stage-35`: Stage 27 - 35 Validations

## 13 — System Documentation
- `/docs/arch-idx`: Architecture Index (`architecture-index`)
- `/docs/arch-schema`: Architecture Schema (`architecture-schema`)
- `/docs/kernel-explain`: Kernel Explanation (`kernel-explanation`)
- `/docs/execution-plan`: Context Execution Plan (`context-execution-plan`)
- `/docs/accessibility`: UI Accessibility Notes (`ui-accessibility-notes`)
- `/docs/quality-gates`: Quality Gates Rules (`quality-gates`)
- `/docs/manual-qa`: Manual QA Guide (`manual-qa`)
- `/docs/impl-log`: Implementation Log (`implementation-log`)

## 14 — Governance & Kernel Debt
- `/gov/awareness`: Kernel Awareness Note (`kernel-awareness-note`)
- `/gov/debt`: Kernel Debt Register (`kernel-debt-register`)
- `/gov/audit`: Permission Kernel Audit (`permission-kernel-audit`)
- `/gov/human-review`: Human Review Requirements (`human-review-requirements`)
- `/gov/signoff`: Release Sign-off (`release-sign-off`)
