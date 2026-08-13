-- Migration 0029
-- Ledger version: 1.2.8-evidence-store-mvp
--
-- ADR-003 ile apps/api/src/db.ts icindeki inline migrationVersions
-- dizisinden BIREBIR cikarilmistir. Icerik degistirilmemistir.
-- schema_migrations ledger'inda bu dosya yukaridaki version string'i
-- ile kayitlidir; mevcut veritabanlari etkilenmez.

-- +up
CREATE TABLE IF NOT EXISTS evidence_records (
  id VARCHAR(100) PRIMARY KEY,
  project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id VARCHAR(100) REFERENCES tasks(id) ON DELETE SET NULL,
  feature_id VARCHAR(100),
  evidence_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  actor_type VARCHAR(50) NOT NULL,
  actor_id VARCHAR(100),
  audit_log_id VARCHAR(100),
  quality_gate_run_id VARCHAR(100) REFERENCES quality_gate_runs(id) ON DELETE SET NULL,
  quality_gate_command_result_id VARCHAR(100) REFERENCES quality_gate_command_results(id) ON DELETE SET NULL,
  artifact_id VARCHAR(100),
  source_table VARCHAR(100),
  source_id VARCHAR(100),
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_hash VARCHAR(128) NOT NULL,
  hash_algorithm VARCHAR(50) NOT NULL DEFAULT 'sha256',
  payload_size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMP WITH TIME ZONE,
  verification_meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_evidence_records_project ON evidence_records(project_id);
CREATE INDEX IF NOT EXISTS idx_evidence_records_task ON evidence_records(task_id);
CREATE INDEX IF NOT EXISTS idx_evidence_records_feature ON evidence_records(feature_id);
CREATE INDEX IF NOT EXISTS idx_evidence_records_type ON evidence_records(evidence_type);
CREATE INDEX IF NOT EXISTS idx_evidence_records_status ON evidence_records(status);
CREATE INDEX IF NOT EXISTS idx_evidence_records_audit_log ON evidence_records(audit_log_id);
CREATE INDEX IF NOT EXISTS idx_evidence_records_quality_gate ON evidence_records(quality_gate_run_id);
CREATE INDEX IF NOT EXISTS idx_evidence_records_artifact ON evidence_records(artifact_id);
CREATE INDEX IF NOT EXISTS idx_evidence_records_source ON evidence_records(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_evidence_records_created_at ON evidence_records(created_at);

-- +down
-- Geri alma bu migration icin tanimlanmamistir (P01 goc turu birebir
-- kopyadir). Down script'leri, sema degistiren yeni migration'lar icin
-- P02'den itibaren zorunludur.
