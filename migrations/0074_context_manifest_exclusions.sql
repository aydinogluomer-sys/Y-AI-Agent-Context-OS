-- Migration 0074
-- Ledger version: 2.6.2-context-manifest-exclusions
--
-- P09 / Y-P09-003 — DISLANANLAR ve SEBEPLERI (ADR-036).
--
-- P00 Truth Audit: butceye sigmayan ogeler SESSIZCE kayboluyordu.
-- Yalniz toplu bir risk metni uretiliyordu; hangi dosyanin neden
-- disarida kaldigi kayitli degildi.
--
-- NEDEN BU TABLO "items"TAN DAHA ONEMLI OLABILIR
--   Agent'in GORMEDIGI sey, yanlis yapmasinin sebebidir. Bir hata
--   incelemesinde ilk soru "neyi bilmiyordu?" olur. Bu tablo olmadan o
--   soru yanitlanamaz.
--
-- SEBEP KUMESI KAPALI
--   Serbest metin bir sebep DEGILDIR: uzerinde sorgu calistirilamaz ve
--   zamanla tutarsizlasir. Kume CHECK ile kilitlidir; yeni bir sebep
--   eklemek migration gerektirir ve bu BILINCLI bir karardir.

-- +up
CREATE TABLE IF NOT EXISTS context_manifest_exclusions (
  id VARCHAR(255) PRIMARY KEY,
  manifest_id VARCHAR(255) NOT NULL REFERENCES context_manifests(id) ON DELETE CASCADE,
  organization_id VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  path TEXT NOT NULL,
  symbol_name TEXT,
  reason VARCHAR(32) NOT NULL,
  -- Insan tarafindan okunabilir ayrinti: "1834 token gerekiyordu,
  -- kalan 200" gibi.
  detail TEXT NOT NULL,
  -- Aday havuzundaki sirasi. NULL ise havuza HIC girmedi (firewall).
  candidate_rank INTEGER,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT ck_manifest_exclusions_reason CHECK (
    reason IN (
      'policy_denied',
      'policy_approval_pending',
      'budget',
      'rank_cutoff',
      'duplicate',
      'contains_secret',
      'below_threshold',
      'unavailable'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_manifest_exclusions_manifest
  ON context_manifest_exclusions(manifest_id);
-- "Policy yuzunden ne kadar icerik disarida kaliyor?" metrigi.
CREATE INDEX IF NOT EXISTS idx_manifest_exclusions_reason
  ON context_manifest_exclusions(reason);

CREATE OR REPLACE FUNCTION block_manifest_exclusions_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'context_manifest_exclusions degismezdir: neyin neden disarida kaldigi kanittir.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_block_manifest_exclusions_update ON context_manifest_exclusions;
CREATE TRIGGER trigger_block_manifest_exclusions_update
BEFORE UPDATE ON context_manifest_exclusions
FOR EACH ROW
EXECUTE FUNCTION block_manifest_exclusions_mutation();

-- +down
DROP TRIGGER IF EXISTS trigger_block_manifest_exclusions_update ON context_manifest_exclusions;
DROP FUNCTION IF EXISTS block_manifest_exclusions_mutation();
DROP INDEX IF EXISTS idx_manifest_exclusions_reason;
DROP INDEX IF EXISTS idx_manifest_exclusions_manifest;
DROP TABLE IF EXISTS context_manifest_exclusions;
