-- Migration 0056
-- Ledger version: 2.2.3-symbol-invalidations
--
-- P04 / Y-P04-010 — Incremental index izleri.
--
-- Bir snapshot'tan digerine gecerken HANGI dosyalarin neden yeniden
-- ayristirildigi kayit altina alinir. Bu tablo iki soruyu yanitlar:
--
--   1. "Bu sembol neden bayat degil?" — artimli index'in dogruluk
--      iddiasinin kaniti. Kayit yoksa iddia da yoktur.
--   2. "Artimli index gercekten is tasarrufu sagladi mi?" — P04 kabul
--      kriteri (tam re-index'in %1'inden azi) bu satirlardan olculur;
--      elle yazilan bir metrikten degil.
--
-- `reason` sutunu ozellikle onemlidir: bir dosya "degisti" diye mi yoksa
-- "degisen bir dosyayi import ediyor" diye mi yeniden ayristirildi?
-- Ikisini ayirmadan invalidation mantigindaki bir hata gorunmez kalir.

-- +up
CREATE TABLE IF NOT EXISTS symbol_invalidations (
  id VARCHAR(255) PRIMARY KEY,
  organization_id VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  repository_id VARCHAR(255) NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,

  -- Karsilastirmanin iki ucu. `from_snapshot_id` NULL ise ilk index'tir.
  from_snapshot_id VARCHAR(255) REFERENCES repository_snapshots(id) ON DELETE SET NULL,
  to_snapshot_id VARCHAR(255) NOT NULL REFERENCES repository_snapshots(id) ON DELETE CASCADE,

  path TEXT NOT NULL,
  reason VARCHAR(32) NOT NULL,
  -- Bagimli dosyalarda: hangi degisen dosya yuzunden geldi.
  triggered_by TEXT,
  -- Import zincirinde kacinci halka (0 = dogrudan degisen dosya).
  depth INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT ck_symbol_invalidations_reason CHECK (
    reason IN ('changed', 'added', 'deleted', 'dependent', 'full_reindex')
  ),
  CONSTRAINT ck_symbol_invalidations_depth CHECK (depth >= 0),
  CONSTRAINT uq_symbol_invalidations UNIQUE (to_snapshot_id, path)
);

CREATE INDEX IF NOT EXISTS idx_symbol_invalidations_to ON symbol_invalidations(to_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_symbol_invalidations_repo ON symbol_invalidations(repository_id);

-- +down
DROP INDEX IF EXISTS idx_symbol_invalidations_repo;
DROP INDEX IF EXISTS idx_symbol_invalidations_to;
DROP TABLE IF EXISTS symbol_invalidations;
