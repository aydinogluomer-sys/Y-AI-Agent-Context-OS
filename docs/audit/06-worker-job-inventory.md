> ⚠️ **SUPERSEDED** — Bu belgedeki durum iddialari (PASS / verified / implemented / complete)
> 2026-08-13 Truth Audit ile gecersizdir. Guncel olculmus gercek icin bkz.
> [`docs/audit/2026-08-13-truth-audit/`](audit/2026-08-13-truth-audit/) ve
> [master plan](Y_FINAL_PRODUCTION_IMPLEMENTATION_MASTER_PLAN.md).
> Bu banner P20'de (Y-P20-010) celiskiler kapatildiginda kaldirilacaktir.

# 06 — Worker Job Inventory

- **Index Worker**: `workers/index-worker.ts` handles AST scanning, symbol indexing, dependency graph construction.
- **Task FSM Worker**: Manages transition loops (`CREATED` -> `IN_PROGRESS` -> `VERIFIED` -> `ARCHIVED`).
- **CAS GC & Deduplication Worker**: Periodically verifies SHA-256 blob integrity and purges unreferenced orphaned blobs.
- **Context Compactor Worker**: Assembles 50K context packs with semantic ranking and token budgeting.
