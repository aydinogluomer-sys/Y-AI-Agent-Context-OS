-- Migration 0030
-- Ledger version: 1.2.9-event-store-mvp
--
-- ADR-003 ile apps/api/src/db.ts icindeki inline migrationVersions
-- dizisinden BIREBIR cikarilmistir. Icerik degistirilmemistir.
-- schema_migrations ledger'inda bu dosya yukaridaki version string'i
-- ile kayitlidir; mevcut veritabanlari etkilenmez.

-- +up
CREATE TABLE IF NOT EXISTS event_records (
  id VARCHAR(100) PRIMARY KEY,
  project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id VARCHAR(100) REFERENCES tasks(id) ON DELETE SET NULL,
  feature_id VARCHAR(100),
  event_type VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'committed',
  source_table VARCHAR(100),
  source_id VARCHAR(100),
  actor_type VARCHAR(50) NOT NULL,
  actor_id VARCHAR(100),
  idempotency_key VARCHAR(255),
  audit_log_id VARCHAR(100),
  evidence_record_id VARCHAR(100) REFERENCES evidence_records(id) ON DELETE SET NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_hash VARCHAR(128) NOT NULL,
  hash_algorithm VARCHAR(50) NOT NULL DEFAULT 'sha256',
  payload_size_bytes INTEGER NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_records_project ON event_records(project_id);
CREATE INDEX IF NOT EXISTS idx_event_records_task ON event_records(task_id);
CREATE INDEX IF NOT EXISTS idx_event_records_feature ON event_records(feature_id);
CREATE INDEX IF NOT EXISTS idx_event_records_type ON event_records(event_type);
CREATE INDEX IF NOT EXISTS idx_event_records_source ON event_records(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_event_records_audit_log ON event_records(audit_log_id);
CREATE INDEX IF NOT EXISTS idx_event_records_evidence_record ON event_records(evidence_record_id);
CREATE INDEX IF NOT EXISTS idx_event_records_created_at ON event_records(created_at);
CREATE INDEX IF NOT EXISTS idx_event_records_project_created ON event_records(project_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_records_idem_key ON event_records(project_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION block_event_records_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Event Store is an append-only ledger. Mutation (UPDATE or DELETE) of event_records is strictly forbidden.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_block_event_records_update ON event_records;
CREATE TRIGGER trigger_block_event_records_update
BEFORE UPDATE ON event_records
FOR EACH ROW
EXECUTE FUNCTION block_event_records_mutation();

DROP TRIGGER IF EXISTS trigger_block_event_records_delete ON event_records;
CREATE TRIGGER trigger_block_event_records_delete
BEFORE DELETE ON event_records
FOR EACH ROW
EXECUTE FUNCTION block_event_records_mutation();

-- +down
-- Geri alma bu migration icin tanimlanmamistir (P01 goc turu birebir
-- kopyadir). Down script'leri, sema degistiren yeni migration'lar icin
-- P02'den itibaren zorunludur.
