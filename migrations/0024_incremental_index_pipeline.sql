-- Migration 0024
-- Ledger version: 1.2.3-incremental-index-pipeline
--
-- ADR-003 ile apps/api/src/db.ts icindeki inline migrationVersions
-- dizisinden BIREBIR cikarilmistir. Icerik degistirilmemistir.
-- schema_migrations ledger'inda bu dosya yukaridaki version string'i
-- ile kayitlidir; mevcut veritabanlari etkilenmez.

-- +up
CREATE TABLE IF NOT EXISTS incremental_index_events (
  id VARCHAR(100) PRIMARY KEY,
  project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id VARCHAR(100) REFERENCES tasks(id) ON DELETE SET NULL,
  adapter_kind VARCHAR(50) NOT NULL,
  path_redacted TEXT NOT NULL,
  normalized_path_redacted TEXT NOT NULL,
  file_hash_before VARCHAR(100),
  file_hash_after VARCHAR(100),
  change_kind VARCHAR(50) NOT NULL,
  index_job_id VARCHAR(100) REFERENCES index_jobs(id) ON DELETE SET NULL,
  warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_incremental_index_events_project ON incremental_index_events(project_id);
CREATE INDEX IF NOT EXISTS idx_incremental_index_events_task ON incremental_index_events(task_id);
CREATE INDEX IF NOT EXISTS idx_incremental_index_events_change_kind ON incremental_index_events(change_kind);
CREATE INDEX IF NOT EXISTS idx_incremental_index_events_index_job ON incremental_index_events(index_job_id);
CREATE INDEX IF NOT EXISTS idx_incremental_index_events_detected_at ON incremental_index_events(detected_at);

-- +down
-- Geri alma bu migration icin tanimlanmamistir (P01 goc turu birebir
-- kopyadir). Down script'leri, sema degistiren yeni migration'lar icin
-- P02'den itibaren zorunludur.
