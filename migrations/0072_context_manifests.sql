-- Migration 0072
-- Ledger version: 2.6.0-context-manifests
--
-- P09 / Y-P09-003 — Context manifest (ADR-034).
--
-- P00 Truth Audit: `context_packs` tablosu vardi ve gercek reason
-- code'lar tasiyordu. Ama:
--   - HASH YOKTU. Fragment duzeyinde `content_hash`/`source_hash` yoktu;
--     `context_items.checksum` vardi ama pack'ten referans verilmiyordu.
--   - DISLAMA KAYDI YOKTU. Butceye sigmayan ogeler sessizce kayboluyor,
--     yalniz toplu bir risk metni uretiliyordu.
--   - Pack IMMUTABLE degildi ve policy surumune bagli degildi.
--
-- "Agent hangi kaynagi neden gordu, neyi neden gormedi" sorusu
-- yanitlanamiyordu. Bu, urunun PROOF sutununun temelidir.
--
-- NEDEN IMMUTABLE
--   Manifest bir KANITTIR. Kanitin sonradan degistirilebilmesi, kanit
--   olmamasindan tehlikelidir: degistirilmis bir kayit hala gecerli
--   gorunur. Trigger ile zorlanir.

-- +up
CREATE TABLE IF NOT EXISTS context_manifests (
  id VARCHAR(255) PRIMARY KEY,
  organization_id VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
  task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE SET NULL,
  -- Run tablosu P12'de; FK o zaman baglanacak.
  run_id VARCHAR(255),
  snapshot_id VARCHAR(255) NOT NULL REFERENCES repository_snapshots(id) ON DELETE CASCADE,

  manifest_version INTEGER NOT NULL DEFAULT 1,
  manifest_hash VARCHAR(64) NOT NULL,
  -- Determinizm girdileri: bu alanlarin hepsi ayni ise cikti da aynidir.
  deterministic_inputs_hash VARCHAR(64) NOT NULL,
  commit_sha VARCHAR(64) NOT NULL,
  compiler_version VARCHAR(32) NOT NULL,
  policy_version VARCHAR(64) NOT NULL,
  universe_hash VARCHAR(64) NOT NULL,
  weights_hash VARCHAR(64) NOT NULL,
  tokenizer_id VARCHAR(64) NOT NULL,
  -- Butce yaklasik bir sayiya mi dayaniyor. Okuyan bunu BILMELI.
  tokenizer_approximate BOOLEAN NOT NULL DEFAULT FALSE,
  parser_versions JSONB NOT NULL DEFAULT '{}'::jsonb,

  budget_limit INTEGER NOT NULL,
  budget_used INTEGER NOT NULL,
  -- Hesaplanamayan alanlar: `null` + sebep (ADR-032).
  unavailable_fields JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT ck_context_manifests_budget CHECK (budget_used <= budget_limit)
);

CREATE INDEX IF NOT EXISTS idx_context_manifests_run ON context_manifests(run_id);
CREATE INDEX IF NOT EXISTS idx_context_manifests_task ON context_manifests(task_id);
CREATE INDEX IF NOT EXISTS idx_context_manifests_hash ON context_manifests(manifest_hash);
-- Ayni girdilerle uretilmis bir manifest zaten var mi (determinizm dogrulamasi).
CREATE INDEX IF NOT EXISTS idx_context_manifests_inputs
  ON context_manifests(deterministic_inputs_hash);

CREATE OR REPLACE FUNCTION block_context_manifests_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'context_manifests degismezdir (ADR-034): manifest bir kanittir ve sonradan degistirilemez.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_block_context_manifests_update ON context_manifests;
CREATE TRIGGER trigger_block_context_manifests_update
BEFORE UPDATE ON context_manifests
FOR EACH ROW
EXECUTE FUNCTION block_context_manifests_mutation();

DROP TRIGGER IF EXISTS trigger_block_context_manifests_delete ON context_manifests;
CREATE TRIGGER trigger_block_context_manifests_delete
BEFORE DELETE ON context_manifests
FOR EACH ROW
EXECUTE FUNCTION block_context_manifests_mutation();

-- +down
DROP TRIGGER IF EXISTS trigger_block_context_manifests_delete ON context_manifests;
DROP TRIGGER IF EXISTS trigger_block_context_manifests_update ON context_manifests;
DROP FUNCTION IF EXISTS block_context_manifests_mutation();
DROP INDEX IF EXISTS idx_context_manifests_inputs;
DROP INDEX IF EXISTS idx_context_manifests_hash;
DROP INDEX IF EXISTS idx_context_manifests_task;
DROP INDEX IF EXISTS idx_context_manifests_run;
DROP TABLE IF EXISTS context_manifests;
