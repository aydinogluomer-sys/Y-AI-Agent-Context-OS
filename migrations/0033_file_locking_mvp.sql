-- Migration 0033
-- Ledger version: 1.3.2-file-locking-mvp
--
-- ADR-003 ile apps/api/src/db.ts icindeki inline migrationVersions
-- dizisinden BIREBIR cikarilmistir. Icerik degistirilmemistir.
-- schema_migrations ledger'inda bu dosya yukaridaki version string'i
-- ile kayitlidir; mevcut veritabanlari etkilenmez.

-- +up
CREATE TABLE IF NOT EXISTS file_locks (
  id VARCHAR(100) PRIMARY KEY,
  project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id VARCHAR(100) REFERENCES tasks(id) ON DELETE SET NULL,
  worker_id VARCHAR(255),
  index_job_id VARCHAR(100) REFERENCES index_jobs(id) ON DELETE SET NULL,
  lock_mode VARCHAR(16) NOT NULL,
  lock_status VARCHAR(16) NOT NULL,
  normalized_path TEXT NOT NULL,
  path_hash VARCHAR(128) NOT NULL,
  lock_owner_type VARCHAR(50) NOT NULL,
  lock_owner_id VARCHAR(100) NOT NULL,
  acquired_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  refreshed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  released_at TIMESTAMP WITH TIME ZONE,
  release_reason TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_file_locks_project ON file_locks(project_id);
CREATE INDEX IF NOT EXISTS idx_file_locks_task ON file_locks(task_id);
CREATE INDEX IF NOT EXISTS idx_file_locks_worker ON file_locks(worker_id);
CREATE INDEX IF NOT EXISTS idx_file_locks_index_job ON file_locks(index_job_id);
CREATE INDEX IF NOT EXISTS idx_file_locks_status ON file_locks(lock_status);
CREATE INDEX IF NOT EXISTS idx_file_locks_mode ON file_locks(lock_mode);
CREATE INDEX IF NOT EXISTS idx_file_locks_hash ON file_locks(path_hash);
CREATE INDEX IF NOT EXISTS idx_file_locks_expires ON file_locks(expires_at);
CREATE INDEX IF NOT EXISTS idx_file_locks_proj_hash_status ON file_locks(project_id, path_hash, lock_status);
CREATE INDEX IF NOT EXISTS idx_file_locks_proj_path ON file_locks(project_id, normalized_path);

-- +down
-- Geri alma bu migration icin tanimlanmamistir (P01 goc turu birebir
-- kopyadir). Down script'leri, sema degistiren yeni migration'lar icin
-- P02'den itibaren zorunludur.
