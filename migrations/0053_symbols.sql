-- Migration 0053
-- Ledger version: 2.2.0-symbols
--
-- P04 / Y-P04-007 — Symbol index.
--
-- P00 Truth Audit: `symbols` tablosu YOKTU.
-- `POST /projects/:id/static-analysis/analyze-file` sonucu yalnızca HTTP
-- yanıtında dönüyordu; handler'da tek bir INSERT bile yoktu. Tek kalıcı
-- iz, graph sync sırasında `graph_nodes.metadata`'ya sızan `exports`
-- alanıydı.
--
-- Master plan §6'nın zorunlu 14 alanı bu tabloda karşılanır.

-- +up
CREATE TABLE IF NOT EXISTS symbols (
  -- 14 zorunlu alan
  symbol_id VARCHAR(255) PRIMARY KEY,
  repository_id VARCHAR(255) NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  commit_sha VARCHAR(64) NOT NULL,
  path TEXT NOT NULL,
  language VARCHAR(32),
  symbol_type VARCHAR(32) NOT NULL,
  symbol_name TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  start_byte INTEGER NOT NULL,
  end_byte INTEGER NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  parent_symbol TEXT,
  exports TEXT[] NOT NULL DEFAULT '{}',
  imports TEXT[] NOT NULL DEFAULT '{}',

  -- Tenant ve snapshot bagi
  organization_id VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  snapshot_id VARCHAR(255) NOT NULL REFERENCES repository_snapshots(id) ON DELETE CASCADE,
  file_id VARCHAR(255) REFERENCES files(id) ON DELETE CASCADE,
  is_exported BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT ck_symbols_lines CHECK (end_line >= start_line),
  CONSTRAINT ck_symbols_bytes CHECK (end_byte > start_byte),
  -- Ayni snapshot'ta ayni bayt araliginda iki sembol olamaz.
  CONSTRAINT uq_symbols_position UNIQUE (snapshot_id, path, start_byte)
);

CREATE INDEX IF NOT EXISTS idx_symbols_snapshot ON symbols(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_symbols_path ON symbols(snapshot_id, path);
-- Symbol retrieval (P06) bu index'e dayanir.
CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(symbol_name);
CREATE INDEX IF NOT EXISTS idx_symbols_exported
  ON symbols(snapshot_id, symbol_name) WHERE is_exported = TRUE;
CREATE INDEX IF NOT EXISTS idx_symbols_org ON symbols(organization_id);

-- +down
DROP INDEX IF EXISTS idx_symbols_org;
DROP INDEX IF EXISTS idx_symbols_exported;
DROP INDEX IF EXISTS idx_symbols_name;
DROP INDEX IF EXISTS idx_symbols_path;
DROP INDEX IF EXISTS idx_symbols_snapshot;
DROP TABLE IF EXISTS symbols;
