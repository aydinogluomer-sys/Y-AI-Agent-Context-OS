-- Migration 0014
-- Ledger version: 1.1.3-agent-memory-foundation
--
-- ADR-003 ile apps/api/src/db.ts icindeki inline migrationVersions
-- dizisinden BIREBIR cikarilmistir. Icerik degistirilmemistir.
-- schema_migrations ledger'inda bu dosya yukaridaki version string'i
-- ile kayitlidir; mevcut veritabanlari etkilenmez.

-- +up
CREATE TABLE IF NOT EXISTS agent_memories (
  id VARCHAR(255) PRIMARY KEY,
  project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
  task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE CASCADE,
  agent_run_id VARCHAR(255),
  status VARCHAR(50) NOT NULL,
  what_agent_did JSONB NOT NULL DEFAULT '[]'::jsonb,
  why_agent_did_it JSONB NOT NULL DEFAULT '[]'::jsonb,
  what_changed JSONB NOT NULL DEFAULT '{}'::jsonb,
  what_failed JSONB NOT NULL DEFAULT '[]'::jsonb,
  what_remains JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_recommended_action TEXT,
  confidence_score NUMERIC,
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_memories_project ON agent_memories(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_memories_task ON agent_memories(task_id);

-- +down
-- Geri alma bu migration icin tanimlanmamistir (P01 goc turu birebir
-- kopyadir). Down script'leri, sema degistiren yeni migration'lar icin
-- P02'den itibaren zorunludur.
