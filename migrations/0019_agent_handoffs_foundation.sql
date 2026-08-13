-- Migration 0019
-- Ledger version: 1.1.8-agent-handoffs-foundation
--
-- ADR-003 ile apps/api/src/db.ts icindeki inline migrationVersions
-- dizisinden BIREBIR cikarilmistir. Icerik degistirilmemistir.
-- schema_migrations ledger'inda bu dosya yukaridaki version string'i
-- ile kayitlidir; mevcut veritabanlari etkilenmez.

-- +up
CREATE TABLE IF NOT EXISTS agent_handoffs (
  id VARCHAR(100) PRIMARY KEY,
  project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id VARCHAR(100) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  source_provider VARCHAR(50) NOT NULL,
  target_provider VARCHAR(50) NOT NULL,
  source_agent_session_id VARCHAR(100) REFERENCES agent_sessions(id) ON DELETE SET NULL,
  target_agent_session_id VARCHAR(100) REFERENCES agent_sessions(id) ON DELETE SET NULL,
  resume_state_id VARCHAR(100) REFERENCES resume_states(id) ON DELETE SET NULL,
  agent_memory_id VARCHAR(100) REFERENCES agent_memories(id) ON DELETE SET NULL,
  context_pack_id VARCHAR(100),
  status VARCHAR(50) NOT NULL,
  handoff_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  missing_context_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  preserved_context_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_handoffs_project ON agent_handoffs(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_handoffs_task ON agent_handoffs(task_id);

-- +down
-- Geri alma bu migration icin tanimlanmamistir (P01 goc turu birebir
-- kopyadir). Down script'leri, sema degistiren yeni migration'lar icin
-- P02'den itibaren zorunludur.
