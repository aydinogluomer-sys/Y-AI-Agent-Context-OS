-- Migration 0054
-- Ledger version: 2.2.1-chunks
--
-- P04 / Y-P04-008 — Symbol-aware chunk'lar (ADR-020).
--
-- `context_chunks` tablosunun yerini alır. Eski tablo:
--   - sabit genişlikte karakter dilimlerini tutuyordu (fonksiyon ortasından
--     kesilmiş içerik),
--   - `embedding_id VARCHAR` kolonu taşıyordu ama HER ZAMAN NULL yazılıyordu,
--   - hiçbir sembole bağlı değildi.
--
-- Manifest'in (P09) "bu fonksiyon dahil edildi" diyebilmesi için chunk'ın
-- bir sembole karşılık gelmesi gerekir.

-- +up
CREATE TABLE IF NOT EXISTS chunks (
  id VARCHAR(255) PRIMARY KEY,
  organization_id VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  snapshot_id VARCHAR(255) NOT NULL REFERENCES repository_snapshots(id) ON DELETE CASCADE,
  file_id VARCHAR(255) REFERENCES files(id) ON DELETE CASCADE,
  -- Chunk bir sembole karsilik geliyorsa baglanir.
  symbol_id VARCHAR(255) REFERENCES symbols(symbol_id) ON DELETE SET NULL,

  path TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  start_byte INTEGER NOT NULL,
  end_byte INTEGER NOT NULL,

  symbol_name TEXT,
  symbol_type VARCHAR(32),
  -- Sembol butceden buyuk oldugu icin bolunduyse kacinci parca.
  part_index INTEGER NOT NULL DEFAULT 0,
  part_count INTEGER NOT NULL DEFAULT 1,

  -- P08 gercek tokenizer'i baglayana kadar tahmin.
  estimated_tokens INTEGER NOT NULL,
  -- P06 pgvector'u ekledikten sonra doldurulur. VARCHAR degil:
  -- eski embedding_id kolonu hep NULL kaliyordu cunku hicbir sey yazmiyordu.
  embedded_at TIMESTAMP WITH TIME ZONE,
  embedding_model VARCHAR(64),

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT ck_chunks_lines CHECK (end_line >= start_line),
  CONSTRAINT ck_chunks_parts CHECK (part_index < part_count),
  CONSTRAINT uq_chunks_position UNIQUE (snapshot_id, path, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_chunks_snapshot ON chunks(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_id);
CREATE INDEX IF NOT EXISTS idx_chunks_symbol ON chunks(symbol_id);
CREATE INDEX IF NOT EXISTS idx_chunks_hash ON chunks(content_hash);
-- Henuz embed edilmemis chunk'lari bulmak icin (P06 embedding worker).
CREATE INDEX IF NOT EXISTS idx_chunks_pending_embedding
  ON chunks(snapshot_id) WHERE embedded_at IS NULL;

-- +down
DROP INDEX IF EXISTS idx_chunks_pending_embedding;
DROP INDEX IF EXISTS idx_chunks_hash;
DROP INDEX IF EXISTS idx_chunks_symbol;
DROP INDEX IF EXISTS idx_chunks_file;
DROP INDEX IF EXISTS idx_chunks_snapshot;
DROP TABLE IF EXISTS chunks;
