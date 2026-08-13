-- Migration 0004
-- Ledger version: 1.0.3-context-vault-foundation
--
-- ADR-003 ile apps/api/src/db.ts icindeki inline migrationVersions
-- dizisinden BIREBIR cikarilmistir. Icerik degistirilmemistir.
-- schema_migrations ledger'inda bu dosya yukaridaki version string'i
-- ile kayitlidir; mevcut veritabanlari etkilenmez.

-- +up
CREATE TABLE IF NOT EXISTS context_items (
  id VARCHAR(255) PRIMARY KEY,
  project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
  source_type VARCHAR(50) NOT NULL,
  source_uri TEXT NOT NULL,
  checksum VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL,
  content_hash VARCHAR(255) NOT NULL,
  token_count INTEGER NOT NULL,
  confidence NUMERIC NOT NULL,
  freshness_status VARCHAR(50) NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_context_items_project ON context_items(project_id);

CREATE TABLE IF NOT EXISTS context_chunks (
  id VARCHAR(255) PRIMARY KEY,
  context_item_id VARCHAR(255) REFERENCES context_items(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL,
  embedding_id VARCHAR(255)
);
CREATE INDEX IF NOT EXISTS idx_context_chunks_item ON context_chunks(context_item_id);

-- +down
-- Geri alma bu migration icin tanimlanmamistir (P01 goc turu birebir
-- kopyadir). Down script'leri, sema degistiren yeni migration'lar icin
-- P02'den itibaren zorunludur.
