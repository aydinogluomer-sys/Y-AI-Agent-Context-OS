-- Migration 0055
-- Ledger version: 2.2.2-parser-versions
--
-- P04 / Y-P04-011 — Parser sürüm kaydı.
--
-- Manifest determinizminin (P09) girdilerinden biri. Aynı commit, aynı
-- policy ve aynı compiler sürümüyle derlenen context'in aynı hash'i
-- üretmesi için parser sürümlerinin de sabit olması gerekir: tree-sitter
-- grammar'ı değişirse semboller değişir, semboller değişirse chunk'lar
-- değişir.

-- +up
CREATE TABLE IF NOT EXISTS parser_versions (
  id VARCHAR(255) PRIMARY KEY,
  snapshot_id VARCHAR(255) NOT NULL REFERENCES repository_snapshots(id) ON DELETE CASCADE,
  parser_id VARCHAR(64) NOT NULL,
  version VARCHAR(64) NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_parser_versions UNIQUE (snapshot_id, parser_id)
);

CREATE INDEX IF NOT EXISTS idx_parser_versions_snapshot ON parser_versions(snapshot_id);

-- +down
DROP INDEX IF EXISTS idx_parser_versions_snapshot;
DROP TABLE IF EXISTS parser_versions;
