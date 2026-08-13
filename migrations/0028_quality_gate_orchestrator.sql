-- Migration 0028
-- Ledger version: 1.2.7-quality-gate-orchestrator
--
-- ADR-003 ile apps/api/src/db.ts icindeki inline migrationVersions
-- dizisinden BIREBIR cikarilmistir. Icerik degistirilmemistir.
-- schema_migrations ledger'inda bu dosya yukaridaki version string'i
-- ile kayitlidir; mevcut veritabanlari etkilenmez.

-- +up
CREATE TABLE IF NOT EXISTS quality_gate_runs (
  id VARCHAR(100) PRIMARY KEY,
  project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id VARCHAR(100) REFERENCES tasks(id) ON DELETE SET NULL,
  feature_id VARCHAR(100),
  status VARCHAR(50) NOT NULL,
  run_by VARCHAR(100),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  summary_output TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quality_gate_command_results (
  id VARCHAR(100) PRIMARY KEY,
  run_id VARCHAR(100) NOT NULL REFERENCES quality_gate_runs(id) ON DELETE CASCADE,
  project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id VARCHAR(100) REFERENCES tasks(id) ON DELETE SET NULL,
  command_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  exit_code INTEGER,
  output_summary TEXT,
  raw_output_redacted TEXT,
  duration_ms INTEGER,
  executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quality_gate_runs_project ON quality_gate_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_quality_gate_runs_task ON quality_gate_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_quality_gate_runs_feature ON quality_gate_runs(feature_id);
CREATE INDEX IF NOT EXISTS idx_quality_gate_runs_status ON quality_gate_runs(status);
CREATE INDEX IF NOT EXISTS idx_quality_gate_runs_created_at ON quality_gate_runs(created_at);

CREATE INDEX IF NOT EXISTS idx_quality_gate_cmd_results_run ON quality_gate_command_results(run_id);
CREATE INDEX IF NOT EXISTS idx_quality_gate_cmd_results_project ON quality_gate_command_results(project_id);
CREATE INDEX IF NOT EXISTS idx_quality_gate_cmd_results_task ON quality_gate_command_results(task_id);
CREATE INDEX IF NOT EXISTS idx_quality_gate_cmd_results_cmd ON quality_gate_command_results(command_type);
CREATE INDEX IF NOT EXISTS idx_quality_gate_cmd_results_status ON quality_gate_command_results(status);
CREATE INDEX IF NOT EXISTS idx_quality_gate_cmd_results_executed_at ON quality_gate_command_results(executed_at);

-- +down
-- Geri alma bu migration icin tanimlanmamistir (P01 goc turu birebir
-- kopyadir). Down script'leri, sema degistiren yeni migration'lar icin
-- P02'den itibaren zorunludur.
