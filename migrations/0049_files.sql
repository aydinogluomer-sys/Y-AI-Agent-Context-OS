-- Migration 0049
-- Ledger version: 2.1.3-files
--
-- P03 / Y-P03-008 — Snapshot içindeki dosyalar.
--
-- P00 bulgusu: dosya envanteri hiç kalıcı değildi. `listFiles` her çağrıda
-- diski tarayıp <1MB tüm dosyaları SENKRON hash'liyordu. Incremental
-- index (P04) ve Context Firewall sınıflandırması (P07) bu tabloya dayanır.

-- +up
CREATE TABLE IF NOT EXISTS files (
  id VARCHAR(255) PRIMARY KEY,
  organization_id VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  snapshot_id VARCHAR(255) NOT NULL REFERENCES repository_snapshots(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  language VARCHAR(32),
  size_bytes BIGINT NOT NULL,
  is_binary BOOLEAN NOT NULL DEFAULT FALSE,
  is_generated BOOLEAN NOT NULL DEFAULT FALSE,
  is_minified BOOLEAN NOT NULL DEFAULT FALSE,
  -- Sir tarayicisi bu dosyada bulgu urettiyse isaretlenir; Context Firewall
  -- (P07) bunu DENY girdisi olarak kullanir.
  contains_secret BOOLEAN NOT NULL DEFAULT FALSE,
  -- P04 dolduracak.
  parse_status VARCHAR(24) NOT NULL DEFAULT 'pending',
  parse_confidence REAL,
  symbol_count INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT ck_files_parse_status CHECK (
    parse_status IN ('pending', 'parsed', 'error', 'skipped_size', 'skipped_binary', 'skipped_language')
  ),
  CONSTRAINT uq_files_snapshot_path UNIQUE (snapshot_id, path)
);

CREATE INDEX IF NOT EXISTS idx_files_snapshot ON files(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_files_content_hash ON files(content_hash);
CREATE INDEX IF NOT EXISTS idx_files_language ON files(snapshot_id, language);
-- Context Firewall'in DENY predicate'i icin.
CREATE INDEX IF NOT EXISTS idx_files_secret ON files(snapshot_id) WHERE contains_secret = TRUE;

-- +down
DROP INDEX IF EXISTS idx_files_secret;
DROP INDEX IF EXISTS idx_files_language;
DROP INDEX IF EXISTS idx_files_content_hash;
DROP INDEX IF EXISTS idx_files_snapshot;
DROP TABLE IF EXISTS files;
