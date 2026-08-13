-- Migration 0023
-- Ledger version: 1.2.2-index-jobs-realigned-v2
--
-- ADR-003 ile apps/api/src/db.ts icindeki inline migrationVersions
-- dizisinden BIREBIR cikarilmistir. Icerik degistirilmemistir.
-- schema_migrations ledger'inda bu dosya yukaridaki version string'i
-- ile kayitlidir; mevcut veritabanlari etkilenmez.

-- +up
DROP TABLE IF EXISTS index_jobs CASCADE;
CREATE TABLE index_jobs (
  id VARCHAR(100) PRIMARY KEY,
  project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id VARCHAR(100) REFERENCES tasks(id) ON DELETE CASCADE,
  job_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  priority VARCHAR(50) NOT NULL DEFAULT 'medium',
  adapter_kind VARCHAR(50) NOT NULL DEFAULT 'local',
  root_path_redacted TEXT,
  requested_paths TEXT[],
  file_path TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  locked_at TIMESTAMP WITH TIME ZONE,
  locked_by VARCHAR(255),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  failed_at TIMESTAMP WITH TIME ZONE,
  error_redacted TEXT,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_index_jobs_project_v2 ON index_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_index_jobs_task_v2 ON index_jobs(task_id);
CREATE INDEX IF NOT EXISTS idx_index_jobs_status_v2 ON index_jobs(status);
CREATE INDEX IF NOT EXISTS idx_index_jobs_job_type_v2 ON index_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_index_jobs_priority_v2 ON index_jobs(priority);
CREATE INDEX IF NOT EXISTS idx_index_jobs_created_at_v2 ON index_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_index_jobs_locked_at_v2 ON index_jobs(locked_at);

-- +down
-- Geri alma bu migration icin tanimlanmamistir (P01 goc turu birebir
-- kopyadir). Down script'leri, sema degistiren yeni migration'lar icin
-- P02'den itibaren zorunludur.
