-- Migration 0064
-- Ledger version: 2.4.1-chunks-fulltext
--
-- P06 / Y-P06-001, Y-P06-004 — Gercek lexical arama (ADR-025).
--
-- P00 Truth Audit: "BM25" diye adlandirilan sey BM25 degildi
-- (`retrieval-ranking-service.ts:137-160`):
--
--     score = matches / queryWords.length * 40 + (path iceriyorsa 15)
--
-- IDF yok, term frequency yok, dokuman uzunlugu normalizasyonu yok.
-- Yani nadir bir terim ile "the" ayni agirlikta sayiliyordu.
--
-- NEDEN POSTGRES FTS, NEDEN EL YAZIMI BM25 DEGIL
--   El yazimi bir BM25, IDF tablosunu ve dokuman uzunluk istatistiklerini
--   kendimizin tutmasini gerektirir; bu, Postgres'in zaten yaptigi isin
--   yeniden icadidir ve her indeks guncellemesinde tutarlilik sorunu
--   uretir. Harici bir arama motoru (OpenSearch) ise ikinci bir store ve
--   ikinci bir tenant izolasyon yuzeyi demektir.
--
-- FARK DOKUMANTE EDILIR
--   `ts_rank_cd` BM25 DEGILDIR: term frequency doygunlugu (k1) ve uzunluk
--   normalizasyonu (b) parametreleri yoktur; bunun yerine kapsama
--   (cover density) olcer. Pratikte kod aramasinda benzer siralama
--   uretir ama AYNI DEGILDIR. Bu fark P16 benchmark'inda olculur;
--   burada iddia edilmez.
--
-- DIL SECIMI: `simple`
--   `english` konfigurasyonu stemming yapar ve stop-word atar. Kod
--   aramasinda bu ZARARLIDIR: `getUser` -> `getus` gibi koklere inmek
--   tanimlayici eslesmesini bozar, `in`/`for`/`is` gibi kelimeler ise
--   gercek anahtar kelimelerdir. `simple` yalnizca kucuk harfe cevirir.

-- +up
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(symbol_name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(path, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(content, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_chunks_tsv ON chunks USING GIN (tsv);

-- +down
DROP INDEX IF EXISTS idx_chunks_tsv;
ALTER TABLE chunks DROP COLUMN IF EXISTS tsv;
