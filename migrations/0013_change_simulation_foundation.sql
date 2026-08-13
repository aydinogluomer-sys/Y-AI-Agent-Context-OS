-- Migration 0013
-- Ledger version: 1.1.2-change-simulation-foundation
--
-- ADR-003 ile apps/api/src/db.ts icindeki inline migrationVersions
-- dizisinden BIREBIR cikarilmistir. Icerik degistirilmemistir.
-- schema_migrations ledger'inda bu dosya yukaridaki version string'i
-- ile kayitlidir; mevcut veritabanlari etkilenmez.

-- +up
CREATE TABLE IF NOT EXISTS change_simulations (
  id VARCHAR(255) PRIMARY KEY,
  project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
  task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE SET NULL,
  changed_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  change_intent TEXT,
  spread JSONB NOT NULL DEFAULT '{}'::jsonb,
  missed_relationships JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_follow_up_edits JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_follow_up_tests JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_docs_design_updates JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence_score NUMERIC NOT NULL,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_change_simulations_project ON change_simulations(project_id);

-- +down
-- Geri alma bu migration icin tanimlanmamistir (P01 goc turu birebir
-- kopyadir). Down script'leri, sema degistiren yeni migration'lar icin
-- P02'den itibaren zorunludur.
