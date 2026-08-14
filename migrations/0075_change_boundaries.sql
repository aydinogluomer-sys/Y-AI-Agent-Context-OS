-- Migration 0075
-- Ledger version: 2.7.0-change-boundaries
--
-- P10 / Y-P10-001 — Task-derived change boundary (ADR-038).
--
-- P00 Truth Audit: bu kavram YOKTU.
--   - `task_boundaries` + `boundary_checks` tablolari vardi ama
--     `boundary_checks` YALNIZ YAZILIYOR, HIC OKUNMUYORDU (1 insert,
--     0 select) ve ilgili route'lar `/tasks/*` altinda oldugu icin
--     P02'de 410 ile olmustu.
--   - Mutation interception yoktu.
--
-- Urun tezinin CHANGE sutunu tamamen eksikti: agent (gercek bir runtime
-- olsaydi) herhangi bir dosyayi degistirebilirdi.
--
-- NEDEN IMMUTABLE
--   Boundary, bir run'in hangi sinirla calistiginin KANITIDIR. Sonradan
--   genisletilebilseydi, bir ihlal "aslinda sinir icindeydi" diye
--   yeniden yazilabilirdi.
--
-- KULLANICI BOUNDARY'YI GENISLETEMEZ (ADR-038)
--   Yalniz onay verebilir. Kullanicinin genisletebildigi bir sinir,
--   sinir degildir.

-- +up
CREATE TABLE IF NOT EXISTS change_boundaries (
  id VARCHAR(255) PRIMARY KEY,
  organization_id VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
  task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE SET NULL,
  -- Run tablosu P12'de; FK o zaman baglanacak.
  run_id VARCHAR(255),
  manifest_id VARCHAR(255) REFERENCES context_manifests(id) ON DELETE SET NULL,

  expected_globs TEXT[] NOT NULL DEFAULT '{}',
  allowed_globs TEXT[] NOT NULL DEFAULT '{}',
  approval_globs TEXT[] NOT NULL DEFAULT '{}',
  denied_globs TEXT[] NOT NULL DEFAULT '{}',

  -- Her glob'un HANGI KANITTAN turedigi. Sinirin neden o sinir oldugu
  -- sorusu yanitlanabilir olmali.
  derived_from JSONB NOT NULL DEFAULT '[]'::jsonb,
  boundary_hash VARCHAR(64) NOT NULL,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Bos bir expected kumesi, agent'in hicbir yere yazamayacagi anlamina
  -- gelir; bu mesru olabilir ama BILINCLI olmalidir. Boundary turetme
  -- kodu bos manifest'te zaten hata veriyor.
  CONSTRAINT ck_change_boundaries_expected CHECK (cardinality(expected_globs) > 0)
);

CREATE INDEX IF NOT EXISTS idx_change_boundaries_run ON change_boundaries(run_id);
CREATE INDEX IF NOT EXISTS idx_change_boundaries_task ON change_boundaries(task_id);
CREATE INDEX IF NOT EXISTS idx_change_boundaries_hash ON change_boundaries(boundary_hash);

CREATE OR REPLACE FUNCTION block_change_boundaries_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'change_boundaries degismezdir (ADR-038): sinir sonradan genisletilemez.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_block_change_boundaries_update ON change_boundaries;
CREATE TRIGGER trigger_block_change_boundaries_update
BEFORE UPDATE ON change_boundaries
FOR EACH ROW
EXECUTE FUNCTION block_change_boundaries_mutation();

-- +down
DROP TRIGGER IF EXISTS trigger_block_change_boundaries_update ON change_boundaries;
DROP FUNCTION IF EXISTS block_change_boundaries_mutation();
DROP INDEX IF EXISTS idx_change_boundaries_hash;
DROP INDEX IF EXISTS idx_change_boundaries_task;
DROP INDEX IF EXISTS idx_change_boundaries_run;
DROP TABLE IF EXISTS change_boundaries;
