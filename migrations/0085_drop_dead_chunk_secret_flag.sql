-- Migration 0085
-- Ledger version: 3.2.0-drop-dead-chunk-secret-flag
--
-- P21/7 — `chunks.contains_secret` DUSURULUYOR: uretimde NE YAZILIYOR
-- NE OKUNUYOR.
--
-- Kolon 2.2.1-chunks ile geldi ama:
--
--   * hicbir uretim kodu `INSERT INTO chunks` icinde ona deger yazmiyor
--   * hicbir sorgu `c.contains_secret` okumuyor
--
-- Tek doğruluk kaynagi `files.contains_secret`: secret-scanner DOSYA
-- duzeyinde tarar, snapshot-service oraya yazar (classify.ts) ve uc
-- retrieval kanalinin ucu de `f.contains_secret` okur.
--
-- ## Neden birakmak degil DUSURMEK
--
-- Hep NULL kalan bir guvenlik bayragi, olmayan bir bayraktan DAHA
-- TEHLIKELIDIR:
--
--   SELECT ... FROM chunks WHERE contains_secret = FALSE
--
-- Bu sorgu her satiri dondurur ama okuyana "sirli olanlari eledim" gibi
-- gorunur. Yani semanin icine gomulmus bir YANLIS YESIL.
--
-- P21/3'te tam bu yuzden bir test yanlis yesil cikmisti: fixture bayragi
-- CHUNK'a yaziyordu, sorgu DOSYA'dan okuyordu, dolayisiyla filtre hic
-- tetiklenmiyordu.
--
-- ## Geri alinabilir
--
-- `-- +down` kolonu geri ekler. Veri geri gelmez ama zaten hicbir zaman
-- veri yoktu.

-- +up
ALTER TABLE chunks DROP COLUMN IF EXISTS contains_secret;

-- +down
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS contains_secret BOOLEAN NOT NULL DEFAULT FALSE;
