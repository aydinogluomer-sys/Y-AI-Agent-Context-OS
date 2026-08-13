-- Migration 0009
-- Ledger version: 1.0.8-context-summaries-foundation
--
-- ADR-003 ile apps/api/src/db.ts icindeki inline migrationVersions
-- dizisinden BIREBIR cikarilmistir. Icerik degistirilmemistir.
-- schema_migrations ledger'inda bu dosya yukaridaki version string'i
-- ile kayitlidir; mevcut veritabanlari etkilenmez.

-- +up
CREATE TABLE IF NOT EXISTS context_summaries (
  id VARCHAR(255) PRIMARY KEY,
  project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
  context_item_id VARCHAR(255) REFERENCES context_items(id) ON DELETE CASCADE,
  task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE SET NULL,
  summary_type VARCHAR(50) NOT NULL,
  summary TEXT NOT NULL,
  key_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_chunk_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  original_token_count INTEGER NOT NULL DEFAULT 0,
  compressed_token_count INTEGER NOT NULL DEFAULT 0,
  compression_ratio NUMERIC NOT NULL DEFAULT 1.0,
  confidence NUMERIC NOT NULL DEFAULT 100.0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_context_summaries_project ON context_summaries(project_id);
CREATE INDEX IF NOT EXISTS idx_context_summaries_item ON context_summaries(context_item_id);

CREATE TABLE IF NOT EXISTS durable_memories (
  id VARCHAR(255) PRIMARY KEY,
  project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
  task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE CASCADE,
  event_summary TEXT NOT NULL,
  files_touched JSONB NOT NULL DEFAULT '[]'::jsonb,
  errors_encountered JSONB NOT NULL DEFAULT '[]'::jsonb,
  decisions_made JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_action TEXT NOT NULL,
  unresolved_blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_durable_memories_project ON durable_memories(project_id);
CREATE INDEX IF NOT EXISTS idx_durable_memories_task ON durable_memories(task_id);

-- +down
-- Geri alma bu migration icin tanimlanmamistir (P01 goc turu birebir
-- kopyadir). Down script'leri, sema degistiren yeni migration'lar icin
-- P02'den itibaren zorunludur.
