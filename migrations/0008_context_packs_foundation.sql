-- Migration 0008
-- Ledger version: 1.0.7-context-packs-foundation
--
-- ADR-003 ile apps/api/src/db.ts icindeki inline migrationVersions
-- dizisinden BIREBIR cikarilmistir. Icerik degistirilmemistir.
-- schema_migrations ledger'inda bu dosya yukaridaki version string'i
-- ile kayitlidir; mevcut veritabanlari etkilenmez.

-- +up
CREATE TABLE IF NOT EXISTS context_packs (
  id VARCHAR(255) PRIMARY KEY,
  project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
  task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  token_budget INTEGER NOT NULL DEFAULT 50000,
  estimated_token_count INTEGER NOT NULL DEFAULT 0,
  confidence_score NUMERIC NOT NULL DEFAULT 100.0,
  primary_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_docs JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_tests JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_connected_assets JSONB NOT NULL DEFAULT '[]'::jsonb,
  recent_diffs JSONB NOT NULL DEFAULT '[]'::jsonb,
  known_risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  pending_todos JSONB NOT NULL DEFAULT '[]'::jsonb,
  forbidden_changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  quality_gates JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_action TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_context_packs_project ON context_packs(project_id);
CREATE INDEX IF NOT EXISTS idx_context_packs_task ON context_packs(task_id);

-- +down
-- Geri alma bu migration icin tanimlanmamistir (P01 goc turu birebir
-- kopyadir). Down script'leri, sema degistiren yeni migration'lar icin
-- P02'den itibaren zorunludur.
