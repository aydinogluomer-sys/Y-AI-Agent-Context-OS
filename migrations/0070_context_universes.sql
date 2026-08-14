-- Migration 0070
-- Ledger version: 2.5.2-context-universes
--
-- P07 / Y-P07-003, Y-P07-009 — Allowed Context Universe (ADR-030).
--
-- NEDEN IMMUTABLE
--   Universe, bir run'ın "hangi kurallarla üretildiği" kanıtıdır. Policy
--   sonradan değişirse — ki değişecektir — o run'ın kanıtı DEĞİŞMEMELİDİR.
--   Değişebilseydi, geçmiş bir context'in neden o hâlde olduğu sorusu
--   yanıtsız kalır ve manifest'in (P09) determinizm iddiası çökerdi.
--
--   Immutability bir konvansiyon değil, TRIGGER ile zorlanır. Uygulama
--   katmanında "burayı güncellemeyin" yorumu yazmak yeterli değildir:
--   bir gün biri yazacaktır.
--
-- `universe_hash` NEDEN VAR
--   Aynı girdi aynı hash'i üretir. İki run'ın aynı kurallarla çalışıp
--   çalışmadığı tek bir karşılaştırmayla anlaşılır. Hash'e kullanıcı
--   kimliği GİRMEZ: aynı roldeki iki kullanıcı aynı universe'ü görmeli,
--   aksi halde karşılaştırma anlamsızlaşırdı.

-- +up
CREATE TABLE IF NOT EXISTS context_universes (
  id VARCHAR(255) PRIMARY KEY,
  organization_id VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
  -- Run tablosu P12'de gelecek; FK o zaman baglanacak.
  run_id VARCHAR(255),
  task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE SET NULL,
  snapshot_id VARCHAR(255) REFERENCES repository_snapshots(id) ON DELETE SET NULL,

  policy_version VARCHAR(64) NOT NULL,
  universe_hash VARCHAR(64) NOT NULL,
  role VARCHAR(32) NOT NULL,

  allow_globs TEXT[] NOT NULL DEFAULT '{}',
  approval_globs TEXT[] NOT NULL DEFAULT '{}',
  deny_globs TEXT[] NOT NULL DEFAULT '{}',

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- ALLOW kumesi bos olamaz: bos universe ile calisan bir compile,
  -- bos context'i basarili gibi gosterirdi.
  CONSTRAINT ck_context_universes_allow CHECK (cardinality(allow_globs) > 0)
);

CREATE INDEX IF NOT EXISTS idx_context_universes_run ON context_universes(run_id);
CREATE INDEX IF NOT EXISTS idx_context_universes_task ON context_universes(task_id);
CREATE INDEX IF NOT EXISTS idx_context_universes_hash ON context_universes(universe_hash);

CREATE OR REPLACE FUNCTION block_context_universes_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'context_universes degismezdir (ADR-030): bir run''in hangi kurallarla uretildigi kanittir ve sonradan degistirilemez.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_block_context_universes_update ON context_universes;
CREATE TRIGGER trigger_block_context_universes_update
BEFORE UPDATE ON context_universes
FOR EACH ROW
EXECUTE FUNCTION block_context_universes_mutation();

DROP TRIGGER IF EXISTS trigger_block_context_universes_delete ON context_universes;
CREATE TRIGGER trigger_block_context_universes_delete
BEFORE DELETE ON context_universes
FOR EACH ROW
EXECUTE FUNCTION block_context_universes_mutation();

-- +down
DROP TRIGGER IF EXISTS trigger_block_context_universes_delete ON context_universes;
DROP TRIGGER IF EXISTS trigger_block_context_universes_update ON context_universes;
DROP FUNCTION IF EXISTS block_context_universes_mutation();
DROP INDEX IF EXISTS idx_context_universes_hash;
DROP INDEX IF EXISTS idx_context_universes_task;
DROP INDEX IF EXISTS idx_context_universes_run;
DROP TABLE IF EXISTS context_universes;
