-- Migration 0003
-- Ledger version: 1.0.2-tasks-foundation
--
-- ADR-003 ile apps/api/src/db.ts icindeki inline migrationVersions
-- dizisinden BIREBIR cikarilmistir. Icerik degistirilmemistir.
-- schema_migrations ledger'inda bu dosya yukaridaki version string'i
-- ile kayitlidir; mevcut veritabanlari etkilenmez.

-- +up
CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(255) PRIMARY KEY,
  project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL,
  risk_level VARCHAR(50) NOT NULL,
  difficulty VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  owner_agent VARCHAR(255),
  human_owner VARCHAR(255),
  acceptance_criteria TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);

-- +down
-- Geri alma bu migration icin tanimlanmamistir (P01 goc turu birebir
-- kopyadir). Down script'leri, sema degistiren yeni migration'lar icin
-- P02'den itibaren zorunludur.
