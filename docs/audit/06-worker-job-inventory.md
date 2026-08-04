# 06 — Worker Job Inventory

- **Index Worker**: `workers/index-worker.ts` handles AST scanning, symbol indexing, dependency graph construction.
- **Task FSM Worker**: Manages transition loops (`CREATED` -> `IN_PROGRESS` -> `VERIFIED` -> `ARCHIVED`).
- **CAS GC & Deduplication Worker**: Periodically verifies SHA-256 blob integrity and purges unreferenced orphaned blobs.
- **Context Compactor Worker**: Assembles 50K context packs with semantic ranking and token budgeting.
