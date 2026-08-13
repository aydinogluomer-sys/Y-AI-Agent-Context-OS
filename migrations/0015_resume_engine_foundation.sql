-- Migration 0015
-- Ledger version: 1.1.4-resume-engine-foundation
--
-- ADR-003 ile apps/api/src/db.ts icindeki inline migrationVersions
-- dizisinden BIREBIR cikarilmistir. Icerik degistirilmemistir.
-- schema_migrations ledger'inda bu dosya yukaridaki version string'i
-- ile kayitlidir; mevcut veritabanlari etkilenmez.

-- +up
CREATE TABLE IF NOT EXISTS resume_states (
  id VARCHAR(255) PRIMARY KEY,
  project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
  task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE CASCADE,
  agent_memory_id VARCHAR(255) REFERENCES agent_memories(id) ON DELETE SET NULL,
  context_pack_id VARCHAR(255),
  change_simulation_id VARCHAR(255) REFERENCES change_simulations(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL,
  paused_reason TEXT,
  task_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  repo_diff_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_phase TEXT,
  failed_step JSONB,
  next_action TEXT,
  affected_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  validation_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  resume_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence_score NUMERIC,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_resume_states_project ON resume_states(project_id);
CREATE INDEX IF NOT EXISTS idx_resume_states_task ON resume_states(task_id);

-- +down
-- Geri alma bu migration icin tanimlanmamistir (P01 goc turu birebir
-- kopyadir). Down script'leri, sema degistiren yeni migration'lar icin
-- P02'den itibaren zorunludur.
