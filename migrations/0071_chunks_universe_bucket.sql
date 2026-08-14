-- Migration 0071
-- Ledger version: 2.5.3-chunks-universe-bucket
--
-- P07 / Y-P07-004 — Predicate hizlandirma icin denormalize sinif.
--
-- NEDEN DENORMALIZASYON
--   Universe predicate'i her retrieval sorgusunda calisir ve her satirda
--   bir regex eslesmesi yapar. 100.000 chunk'lik bir snapshot'ta bu,
--   sorgu suresinin buyuk kismini yer.
--
--   `universe_bucket`, dosya siniflandirmasinin chunk satirina TASINMIS
--   halidir: `secret`, `infra`, `vendor`, `source`... Predicate once bu
--   kolona bakar (indeksli, ucuz) ve satirlarin cogunu regex'e hic
--   goturmez.
--
-- DENORMALIZASYON RISKI VE NASIL YONETILDIGI
--   Denormalize bir kolon, kaynaginin gerisinde kalabilir. Burada kaynak
--   `file_classifications` ve o tablo SNAPSHOT BASINA yazilir; snapshot
--   degismezdir (yeni commit = yeni snapshot). Yani bayatlama penceresi
--   yoktur: siniflandirma yazildiginda chunk'lar da o snapshot'a aittir.
--
--   Bu kolon bir GUVENLIK SINIRI DEGILDIR — yalnizca hizlandirmadir.
--   Kesin karar her zaman glob predicate'inindir. Bayat bir bucket
--   yanlis sonuc uretemez, yalnizca sorguyu yavaslatir.

-- +up
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS universe_bucket VARCHAR(24);

CREATE INDEX IF NOT EXISTS idx_chunks_universe_bucket
  ON chunks(snapshot_id, universe_bucket);

-- Sir iceren chunk'larin hizli elenmesi (T-07). `files.contains_secret`
-- uzerinden JOIN yapmak yerine dogrudan chunk'ta isaret.
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS contains_secret BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_chunks_contains_secret
  ON chunks(snapshot_id) WHERE contains_secret = TRUE;

-- Mevcut satirlar icin dosya bayragini tasi.
UPDATE chunks c
   SET contains_secret = f.contains_secret
  FROM files f
 WHERE c.file_id = f.id AND f.contains_secret = TRUE;

-- +down
DROP INDEX IF EXISTS idx_chunks_contains_secret;
ALTER TABLE chunks DROP COLUMN IF EXISTS contains_secret;
DROP INDEX IF EXISTS idx_chunks_universe_bucket;
ALTER TABLE chunks DROP COLUMN IF EXISTS universe_bucket;
