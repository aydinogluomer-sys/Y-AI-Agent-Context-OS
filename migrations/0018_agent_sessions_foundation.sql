-- Migration 0018
-- Ledger version: 1.1.7-agent-sessions-foundation
--
-- ADR-003 ile apps/api/src/db.ts icindeki inline migrationVersions
-- dizisinden BIREBIR cikarilmistir. Icerik degistirilmemistir.
-- schema_migrations ledger'inda bu dosya yukaridaki version string'i
-- ile kayitlidir; mevcut veritabanlari etkilenmez.

-- +up
CREATE TABLE IF NOT EXISTS agent_sessions (
  id VARCHAR(100) PRIMARY KEY,
  project_id VARCHAR(100) NOT NULL,
  task_id VARCHAR(100) NOT NULL,
  agent_memory_id VARCHAR(100),
  resume_state_id VARCHAR(100),
  provider VARCHAR(50) NOT NULL,
  external_session_id VARCHAR(255) NOT NULL,
  session_label VARCHAR(255),
  status VARCHAR(50) NOT NULL,
  last_known_step VARCHAR(255),
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  recovery_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_project ON agent_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_task ON agent_sessions(task_id);
CREATE UNIQUE INDEX IF NOT EXISTS agent_sessions_one_active_per_task_provider
ON agent_sessions(task_id, provider)
WHERE status IN ('active', 'paused', 'recoverable');

-- +down
-- Geri alma bu migration icin tanimlanmamistir (P01 goc turu birebir
-- kopyadir). Down script'leri, sema degistiren yeni migration'lar icin
-- P02'den itibaren zorunludur.
