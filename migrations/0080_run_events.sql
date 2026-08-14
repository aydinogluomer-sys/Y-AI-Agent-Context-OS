-- Migration 0080
-- Ledger version: 2.8.1-run-events
--
-- P12 / Y-P12-002 — Durum gecis zinciri (ADR-048).
--
-- ADR-048 — HER DURUM GECISI BIR EVENT'TIR
--   `runs.state` kolonu TURETILMIS bir gorunumdur; kaynak gercek olan
--   bu zincirdir. Ikisi celisirse zincir dogrudur.
--
--   Sebep: audit ve zaman cizelgesi tutarliligi. Bir durum kolonu
--   "su an nerede" sorusunu yanitlar; zincir "nasil buraya geldi"
--   sorusunu yanitlar. Ikincisi olmadan bir hatanin nerede basladigi
--   bulunamaz.
--
-- P00'da `GET .../runs/:runId/events` TUM task olaylarini cekip JS'te
-- filtreliyordu. Bir task'in binlerce olayi varsa bu, her istekte
-- hepsini bellege getirmek demekti.

-- +up
CREATE TABLE IF NOT EXISTS run_events (
  id VARCHAR(255) PRIMARY KEY,
  run_id VARCHAR(255) NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,

  from_state VARCHAR(32),
  to_state VARCHAR(32) NOT NULL,
  reason TEXT NOT NULL,
  actor VARCHAR(255) NOT NULL,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT ck_run_events_sequence CHECK (sequence > 0),
  CONSTRAINT uq_run_events_sequence UNIQUE (run_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_run_events_run ON run_events(run_id, sequence);

-- Zincir APPEND-ONLY: bir gecis kaydi sonradan degistirilemez.
CREATE OR REPLACE FUNCTION block_run_events_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'run_events append-only bir zincirdir (ADR-048): gecis kayitlari degistirilemez.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_block_run_events_update ON run_events;
CREATE TRIGGER trigger_block_run_events_update
BEFORE UPDATE ON run_events
FOR EACH ROW
EXECUTE FUNCTION block_run_events_mutation();

DROP TRIGGER IF EXISTS trigger_block_run_events_delete ON run_events;
CREATE TRIGGER trigger_block_run_events_delete
BEFORE DELETE ON run_events
FOR EACH ROW
EXECUTE FUNCTION block_run_events_mutation();

-- +down
DROP TRIGGER IF EXISTS trigger_block_run_events_delete ON run_events;
DROP TRIGGER IF EXISTS trigger_block_run_events_update ON run_events;
DROP FUNCTION IF EXISTS block_run_events_mutation();
DROP INDEX IF EXISTS idx_run_events_run;
DROP TABLE IF EXISTS run_events;
