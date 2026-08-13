-- Migration 0063
-- Ledger version: 2.4.0-pgvector-embeddings
--
-- P06 / Y-P06-001 — Gerçek embedding depolaması (ADR-008).
--
-- P00 Truth Audit: repo'da embedding/pgvector/cosine HİÇBİR YERDE yoktu.
-- `context_chunks.embedding_id VARCHAR` kolonu vardı ama HER ZAMAN NULL
-- yazılıyordu (`index.ts:3104-3106`, `3300`). "Semantic search" diye
-- sunulan şey keyword örtüşmesiydi:
--
--     score = computeLexicalOverlap(query, textToMatch);
--     score += (keywordHits / queryWords.length) * 0.4;
--
-- ve bu değer 30 ile çarpılıp `semantic_score` adıyla sunuluyordu.
--
-- NEDEN AYNI POSTGRES (ADR-008)
--   Ayrı bir vektör veritabanı (Pinecone, Weaviate) getirmek, tenant
--   izolasyonunu ve yedeklemeyi ikiye bölerdi. Aynı erişim kuralının iki
--   sistemde doğru uygulanmasını beklemek, birinin geride kalması
--   demektir — ve geride kalan taraf veri sızdırır. pgvector aynı
--   transaction, aynı yedek, aynı policy.
--
-- BOYUT NEDEN 1536
--   Yaygın modellerin ortak boyutu (OpenAI text-embedding-3-small,
--   ada-002). Farklı boyutlu bir model kullanılacaksa bu kolon
--   DEĞİŞMEZ: `embedding_model` kolonu hangi modelin ürettiğini tutar ve
--   boyut uyuşmazlığı ÇALIŞMA ZAMANINDA hata verir. Sessizce kırpmak ya
--   da doldurmak, anlamsız benzerlik skorları üretirdi.
--
-- EKSTENSİYON GEREKSİNİMİ
--   `vector` eklentisi kurulu değilse bu migration BAŞARISIZ OLUR ve
--   olmalıdır. `IF NOT EXISTS` ile sessizce atlamak, embedding kolonu
--   olmayan bir şemada semantic kanalın çalıştığı yanılsamasını üretirdi.

-- +up
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedding vector(1536);
-- `embedding_model` ve `embedded_at` 0054'te zaten tanimlandi.
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedding_dim INTEGER;
-- Embedding'in HANGI icerikten uretildigi. `chunks.content_hash`
-- degisirse embedding bayattir ve yeniden uretilmelidir.
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedded_content_hash VARCHAR(64);

-- ANN index. IVFFlat secildi cunku HNSW'ye gore build maliyeti dusuk ve
-- bu boyuttaki koleksiyonlarda recall farki kucuk. `lists` degeri
-- ~sqrt(satir sayisi) kuralindan; koleksiyon buyudukce REINDEX gerekir
-- (P06 runbook).
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_cosine
  ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Embedding worker'in "hangi chunk'lar bekliyor" sorgusu.
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_pending
  ON chunks(snapshot_id) WHERE embedding IS NULL;

-- +down
DROP INDEX IF EXISTS idx_chunks_embedding_pending;
DROP INDEX IF EXISTS idx_chunks_embedding_cosine;
ALTER TABLE chunks DROP COLUMN IF EXISTS embedded_content_hash;
ALTER TABLE chunks DROP COLUMN IF EXISTS embedding_dim;
ALTER TABLE chunks DROP COLUMN IF EXISTS embedding;
