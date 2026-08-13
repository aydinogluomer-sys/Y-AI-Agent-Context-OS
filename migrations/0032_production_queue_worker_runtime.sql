-- Migration 0032
-- Ledger version: 1.3.1-production-queue-worker-runtime
--
-- ADR-003 ile apps/api/src/db.ts icindeki inline migrationVersions
-- dizisinden BIREBIR cikarilmistir. Icerik degistirilmemistir.
-- schema_migrations ledger'inda bu dosya yukaridaki version string'i
-- ile kayitlidir; mevcut veritabanlari etkilenmez.

-- +up
CREATE TABLE IF NOT EXISTS worker_registry (
  id VARCHAR(100) PRIMARY KEY,
  worker_id VARCHAR(255) NOT NULL,
  project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  process_label VARCHAR(255),
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  heartbeat_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  stopped_at TIMESTAMP WITH TIME ZONE,
  max_concurrency INTEGER NOT NULL DEFAULT 2,
  active_job_count INTEGER NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_project_worker UNIQUE (project_id, worker_id)
);

CREATE TABLE IF NOT EXISTS worker_runtime_logs (
  id VARCHAR(100) PRIMARY KEY,
  worker_id VARCHAR(255) NOT NULL,
  project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id VARCHAR(100) REFERENCES tasks(id) ON DELETE SET NULL,
  index_job_id VARCHAR(100) REFERENCES index_jobs(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL,
  message_redacted TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worker_registry_project ON worker_registry(project_id);
CREATE INDEX IF NOT EXISTS idx_worker_registry_worker_id ON worker_registry(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_registry_status ON worker_registry(status);
CREATE INDEX IF NOT EXISTS idx_worker_registry_heartbeat ON worker_registry(heartbeat_at);

CREATE INDEX IF NOT EXISTS idx_worker_logs_project ON worker_runtime_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_worker_logs_worker ON worker_runtime_logs(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_logs_job ON worker_runtime_logs(index_job_id);
CREATE INDEX IF NOT EXISTS idx_worker_logs_action ON worker_runtime_logs(action);
CREATE INDEX IF NOT EXISTS idx_worker_logs_created_at ON worker_runtime_logs(created_at);

-- +down
-- Geri alma bu migration icin tanimlanmamistir (P01 goc turu birebir
-- kopyadir). Down script'leri, sema degistiren yeni migration'lar icin
-- P02'den itibaren zorunludur.
