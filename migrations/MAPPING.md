# Migration Eşlemesi

> Üreten: `scripts/audit/regenerate-migration-mapping.ts`
> Doğrulayan: `packages/db/src/migrations.test.ts`

ADR-003 gereği migration'lar `apps/api/src/db.ts` içindeki inline
`migrationVersions` dizisinden dosyalara çıkarıldı. İlk 35 dosyanın
**SQL içeriği birebir korunmuştur** ve hash'leri
`packages/db/src/__fixtures__/migration-baseline.json` içinde dondurulmuştur.

`schema_migrations` tablosu eski `version` string'lerini tutmaya devam eder.
Runner, dosya adındaki sıra numarasını değil, dosyanın `-- Ledger version:`
başlığındaki değeri ledger anahtarı olarak kullanır. Bu sayede halihazırda
migrate edilmiş veritabanları yeniden çalıştırılmaz.

## Kurallar

- Yeni migration'ın numarası, mevcut en büyük numaranın bir fazlasıdır.
- Faz başına ayrılmış numara blokları için master plan Appendix K.1.
- **Yeni her migration için `-- +down` bölümü zorunludur.**
- Göç edilen ilk 35 dosya **değiştirilemez**; değiştirilirse parite testi kırılır.

## Eşleme

| # | Dosya | Ledger version | Köken | Down |
|---|---|---|---|---|
| 0001 | `0001_projects_foundation.sql` | `1.0.0-projects-foundation` | ADR-003 göçü | — |
| 0002 | `0002_memberships_foundation.sql` | `1.0.1-memberships-foundation` | ADR-003 göçü | — |
| 0003 | `0003_tasks_foundation.sql` | `1.0.2-tasks-foundation` | ADR-003 göçü | — |
| 0004 | `0004_context_vault_foundation.sql` | `1.0.3-context-vault-foundation` | ADR-003 göçü | — |
| 0005 | `0005_knowledge_graph_foundation.sql` | `1.0.4-knowledge-graph-foundation` | ADR-003 göçü | — |
| 0006 | `0006_audit_and_telemetry_foundation.sql` | `1.0.5-audit-and-telemetry-foundation` | ADR-003 göçü | — |
| 0007 | `0007_artifacts_debug_connections.sql` | `1.0.6-artifacts-debug-connections` | ADR-003 göçü | — |
| 0008 | `0008_context_packs_foundation.sql` | `1.0.7-context-packs-foundation` | ADR-003 göçü | — |
| 0009 | `0009_context_summaries_foundation.sql` | `1.0.8-context-summaries-foundation` | ADR-003 göçü | — |
| 0010 | `0010_context_boundaries.sql` | `1.0.9-context-boundaries` | ADR-003 göçü | — |
| 0011 | `0011_knowledge_graph_evolution.sql` | `1.1.0-knowledge-graph-evolution` | ADR-003 göçü | — |
| 0012 | `0012_impact_analysis_foundation.sql` | `1.1.1-impact-analysis-foundation` | ADR-003 göçü | — |
| 0013 | `0013_change_simulation_foundation.sql` | `1.1.2-change-simulation-foundation` | ADR-003 göçü | — |
| 0014 | `0014_agent_memory_foundation.sql` | `1.1.3-agent-memory-foundation` | ADR-003 göçü | — |
| 0015 | `0015_resume_engine_foundation.sql` | `1.1.4-resume-engine-foundation` | ADR-003 göçü | — |
| 0016 | `0016_resume_schedules_foundation.sql` | `1.1.5-resume-schedules-foundation` | ADR-003 göçü | — |
| 0017 | `0017_resume_schedules_uniqueness.sql` | `1.1.6-resume-schedules-uniqueness` | ADR-003 göçü | — |
| 0018 | `0018_agent_sessions_foundation.sql` | `1.1.7-agent-sessions-foundation` | ADR-003 göçü | — |
| 0019 | `0019_agent_handoffs_foundation.sql` | `1.1.8-agent-handoffs-foundation` | ADR-003 göçü | — |
| 0020 | `0020_repo_adapter_foundation.sql` | `1.1.9-repo-adapter-foundation` | ADR-003 göçü | — |
| 0021 | `0021_index_jobs_foundation.sql` | `1.2.0-index-jobs-foundation` | ADR-003 göçü | — |
| 0022 | `0022_index_jobs_realigned.sql` | `1.2.1-index-jobs-realigned` | ADR-003 göçü | — |
| 0023 | `0023_index_jobs_realigned_v2.sql` | `1.2.2-index-jobs-realigned-v2` | ADR-003 göçü | — |
| 0024 | `0024_incremental_index_pipeline.sql` | `1.2.3-incremental-index-pipeline` | ADR-003 göçü | — |
| 0025 | `0025_task_lifecycle_history.sql` | `1.2.4-task-lifecycle-history` | ADR-003 göçü | — |
| 0026 | `0026_task_lifecycle_indices.sql` | `1.2.5-task-lifecycle-indices` | ADR-003 göçü | — |
| 0027 | `0027_task_lifecycle_metadata_json.sql` | `1.2.6-task-lifecycle-metadata-json` | ADR-003 göçü | — |
| 0028 | `0028_quality_gate_orchestrator.sql` | `1.2.7-quality-gate-orchestrator` | ADR-003 göçü | — |
| 0029 | `0029_evidence_store_mvp.sql` | `1.2.8-evidence-store-mvp` | ADR-003 göçü | — |
| 0030 | `0030_event_store_mvp.sql` | `1.2.9-event-store-mvp` | ADR-003 göçü | — |
| 0031 | `0031_context_object_store_mvp.sql` | `1.3.0-context-object-store-mvp` | ADR-003 göçü | — |
| 0032 | `0032_production_queue_worker_runtime.sql` | `1.3.1-production-queue-worker-runtime` | ADR-003 göçü | — |
| 0033 | `0033_file_locking_mvp.sql` | `1.3.2-file-locking-mvp` | ADR-003 göçü | — |
| 0034 | `0034_permission_kernel_mvp.sql` | `1.3.3-permission-kernel-mvp` | ADR-003 göçü | — |
| 0035 | `0035_artifact_cas_mvp.sql` | `1.3.4-artifact-cas-mvp` | ADR-003 göçü | — |
| 0036 | `0036_organizations.sql` | `2.0.0-organizations` | yeni | var |
| 0037 | `0037_users.sql` | `2.0.1-users` | yeni | var |
| 0038 | `0038_org_memberships.sql` | `2.0.2-org-memberships` | yeni | var |
| 0039 | `0039_project_memberships.sql` | `2.0.3-project-memberships` | yeni | var |
| 0040 | `0040_service_identities.sql` | `2.0.4-service-identities` | yeni | var |
| 0041 | `0041_projects_organization_scope.sql` | `2.0.5-projects-organization-scope` | yeni | var |
| 0042 | `0042_tasks_scope_and_assignment.sql` | `2.0.6-tasks-scope-and-assignment` | yeni | var |
| 0043 | `0043_audit_logs_actor_and_scope.sql` | `2.0.7-audit-logs-actor-and-scope` | yeni | var |
| 0044 | `0044_permission_policies_scope.sql` | `2.0.8-permission-policies-scope` | yeni | var |
| 0045 | `0045_migrate_legacy_memberships.sql` | `2.0.9-migrate-legacy-memberships` | yeni | var |
| 0046 | `0046_repositories.sql` | `2.1.0-repositories` | yeni | var |
| 0047 | `0047_repository_connections.sql` | `2.1.1-repository-connections` | yeni | var |
| 0048 | `0048_repository_snapshots.sql` | `2.1.2-repository-snapshots` | yeni | var |
| 0049 | `0049_files.sql` | `2.1.3-files` | yeni | var |
| 0050 | `0050_index_jobs_snapshot.sql` | `2.1.4-index-jobs-snapshot` | yeni | var |
| 0051 | `0051_repo_access_audit.sql` | `2.1.5-repo-access-audit` | yeni | var |
| 0052 | `0052_migrate_repo_sources.sql` | `2.1.6-migrate-repo-sources` | yeni | var |

Toplam: **52** migration (35 göç + 17 yeni).
