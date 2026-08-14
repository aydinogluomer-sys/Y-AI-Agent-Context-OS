-- Migration 0073
-- Ledger version: 2.6.1-context-manifest-items
--
-- P09 / Y-P09-003 — Manifest'e giren her fragment icin provenance.
--
-- Master plan'in hedef ciktisi:
--
--   fragment:
--     repository: payment-service
--     commit_sha: abc123
--     file: src/payments/retry.ts
--     symbol: retryPayment
--     lines: 82-164
--     source_hash: 91fd...
--     chunk_hash: 38ab...
--
-- IKI HASH NEDEN AYRI
--   `source_hash` KAYNAGIN hash'i, `chunk_hash` MANIFEST'E GIRENIN.
--   Icerik redakte edildiyse ya da kirpildiysa ikisi FARKLIDIR ve bu
--   fark gorunur olmalidir: agent'a verilen metin kaynaktan farkliysa,
--   "model tam olarak ne gordu" sorusunun yaniti `chunk_hash`tir.

-- +up
CREATE TABLE IF NOT EXISTS context_manifest_items (
  id VARCHAR(255) PRIMARY KEY,
  manifest_id VARCHAR(255) NOT NULL REFERENCES context_manifests(id) ON DELETE CASCADE,
  organization_id VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  fragment_id VARCHAR(255) NOT NULL,
  chunk_id VARCHAR(255) REFERENCES chunks(id) ON DELETE SET NULL,
  repository_id VARCHAR(255) NOT NULL,
  commit_sha VARCHAR(64) NOT NULL,
  path TEXT NOT NULL,
  symbol_name TEXT,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,

  source_hash VARCHAR(64) NOT NULL,
  chunk_hash VARCHAR(64) NOT NULL,
  -- Icerik redakte edildi mi (sir, kirpma). `chunk_hash != source_hash`
  -- olmasinin sebebi burada aciklanir.
  redacted BOOLEAN NOT NULL DEFAULT FALSE,

  -- 14 sinyal ve "bu neden secildi" gerekcesi.
  reason_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  permission_decision VARCHAR(16) NOT NULL DEFAULT 'allow',
  policy_version VARCHAR(64) NOT NULL,
  token_count INTEGER NOT NULL,
  rank INTEGER NOT NULL,

  CONSTRAINT ck_manifest_items_lines CHECK (end_line >= start_line),
  CONSTRAINT ck_manifest_items_rank CHECK (rank > 0),
  -- Manifest'e giren her fragment ALLOW'dur; DENY/APPROVAL olan zaten
  -- aday havuzuna girmez (P07 ADR-027).
  CONSTRAINT ck_manifest_items_decision CHECK (permission_decision = 'allow'),
  CONSTRAINT uq_manifest_items UNIQUE (manifest_id, fragment_id)
);

CREATE INDEX IF NOT EXISTS idx_manifest_items_manifest
  ON context_manifest_items(manifest_id, rank);
CREATE INDEX IF NOT EXISTS idx_manifest_items_path ON context_manifest_items(path);
-- "Bu dosya hangi run'lara girdi?" sorusu.
CREATE INDEX IF NOT EXISTS idx_manifest_items_source_hash ON context_manifest_items(source_hash);

CREATE OR REPLACE FUNCTION block_manifest_items_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'context_manifest_items degismezdir: manifest icerigi kanittir.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_block_manifest_items_update ON context_manifest_items;
CREATE TRIGGER trigger_block_manifest_items_update
BEFORE UPDATE ON context_manifest_items
FOR EACH ROW
EXECUTE FUNCTION block_manifest_items_mutation();

-- +down
DROP TRIGGER IF EXISTS trigger_block_manifest_items_update ON context_manifest_items;
DROP FUNCTION IF EXISTS block_manifest_items_mutation();
DROP INDEX IF EXISTS idx_manifest_items_source_hash;
DROP INDEX IF EXISTS idx_manifest_items_path;
DROP INDEX IF EXISTS idx_manifest_items_manifest;
DROP TABLE IF EXISTS context_manifest_items;
