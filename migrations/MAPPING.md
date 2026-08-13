# Migration Eşlemesi

> Üreten: `scripts/audit/extract-migrations.ts` (Y-P01-004)

ADR-003 gereği migration'lar `apps/api/src/db.ts` içindeki inline
`migrationVersions` dizisinden dosyalara çıkarıldı. **SQL içeriği birebir
korunmuştur.**

`schema_migrations` tablosu eski `version` string'lerini tutmaya devam
eder; runner dosya adındaki sıra numarasını değil, aşağıdaki eşlemedeki
`version` değerini ledger anahtarı olarak kullanır. Bu sayede halihazırda
migrate edilmiş veritabanları yeniden çalıştırılmaz.

Yeni migration'lar `0036`'dan başlar.
Faz başına ayrılmış numara blokları için master plan Appendix K.1'e bakınız.

| # | Dosya | Ledger version |
|---|---|---|
| 0001 | `0001_projects_foundation.sql` | `1.0.0-projects-foundation` |
| 0002 | `0002_memberships_foundation.sql` | `1.0.1-memberships-foundation` |
| 0003 | `0003_tasks_foundation.sql` | `1.0.2-tasks-foundation` |
| 0004 | `0004_context_vault_foundation.sql` | `1.0.3-context-vault-foundation` |
| 0005 | `0005_knowledge_graph_foundation.sql` | `1.0.4-knowledge-graph-foundation` |
| 0006 | `0006_audit_and_telemetry_foundation.sql` | `1.0.5-audit-and-telemetry-foundation` |
| 0007 | `0007_artifacts_debug_connections.sql` | `1.0.6-artifacts-debug-connections` |
| 0008 | `0008_context_packs_foundation.sql` | `1.0.7-context-packs-foundation` |
| 0009 | `0009_context_summaries_foundation.sql` | `1.0.8-context-summaries-foundation` |
| 0010 | `0010_context_boundaries.sql` | `1.0.9-context-boundaries` |
| 0011 | `0011_knowledge_graph_evolution.sql` | `1.1.0-knowledge-graph-evolution` |
| 0012 | `0012_impact_analysis_foundation.sql` | `1.1.1-impact-analysis-foundation` |
| 0013 | `0013_change_simulation_foundation.sql` | `1.1.2-change-simulation-foundation` |
| 0014 | `0014_agent_memory_foundation.sql` | `1.1.3-agent-memory-foundation` |
| 0015 | `0015_resume_engine_foundation.sql` | `1.1.4-resume-engine-foundation` |
| 0016 | `0016_resume_schedules_foundation.sql` | `1.1.5-resume-schedules-foundation` |
| 0017 | `0017_resume_schedules_uniqueness.sql` | `1.1.6-resume-schedules-uniqueness` |
| 0018 | `0018_agent_sessions_foundation.sql` | `1.1.7-agent-sessions-foundation` |
| 0019 | `0019_agent_handoffs_foundation.sql` | `1.1.8-agent-handoffs-foundation` |
| 0020 | `0020_repo_adapter_foundation.sql` | `1.1.9-repo-adapter-foundation` |
| 0021 | `0021_index_jobs_foundation.sql` | `1.2.0-index-jobs-foundation` |
| 0022 | `0022_index_jobs_realigned.sql` | `1.2.1-index-jobs-realigned` |
| 0023 | `0023_index_jobs_realigned_v2.sql` | `1.2.2-index-jobs-realigned-v2` |
| 0024 | `0024_incremental_index_pipeline.sql` | `1.2.3-incremental-index-pipeline` |
| 0025 | `0025_task_lifecycle_history.sql` | `1.2.4-task-lifecycle-history` |
| 0026 | `0026_task_lifecycle_indices.sql` | `1.2.5-task-lifecycle-indices` |
| 0027 | `0027_task_lifecycle_metadata_json.sql` | `1.2.6-task-lifecycle-metadata-json` |
| 0028 | `0028_quality_gate_orchestrator.sql` | `1.2.7-quality-gate-orchestrator` |
| 0029 | `0029_evidence_store_mvp.sql` | `1.2.8-evidence-store-mvp` |
| 0030 | `0030_event_store_mvp.sql` | `1.2.9-event-store-mvp` |
| 0031 | `0031_context_object_store_mvp.sql` | `1.3.0-context-object-store-mvp` |
| 0032 | `0032_production_queue_worker_runtime.sql` | `1.3.1-production-queue-worker-runtime` |
| 0033 | `0033_file_locking_mvp.sql` | `1.3.2-file-locking-mvp` |
| 0034 | `0034_permission_kernel_mvp.sql` | `1.3.3-permission-kernel-mvp` |
| 0035 | `0035_artifact_cas_mvp.sql` | `1.3.4-artifact-cas-mvp` |

Toplam: **35** migration.
