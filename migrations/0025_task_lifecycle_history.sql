-- Migration 0025
-- Ledger version: 1.2.4-task-lifecycle-history
--
-- ADR-003 ile apps/api/src/db.ts icindeki inline migrationVersions
-- dizisinden BIREBIR cikarilmistir. Icerik degistirilmemistir.
-- schema_migrations ledger'inda bu dosya yukaridaki version string'i
-- ile kayitlidir; mevcut veritabanlari etkilenmez.

-- +up
CREATE TABLE IF NOT EXISTS task_status_history (
  id VARCHAR(100) PRIMARY KEY,
  project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id VARCHAR(100) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_status VARCHAR(50),
  to_status VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  actor_type VARCHAR(50) NOT NULL,
  actor_id VARCHAR(100),
  rationale TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_status_history_project ON task_status_history(project_id);
CREATE INDEX IF NOT EXISTS idx_task_status_history_task ON task_status_history(task_id);
CREATE INDEX IF NOT EXISTS idx_task_status_history_created_at ON task_status_history(created_at);

-- +down
-- Geri alma bu migration icin tanimlanmamistir (P01 goc turu birebir
-- kopyadir). Down script'leri, sema degistiren yeni migration'lar icin
-- P02'den itibaren zorunludur.
