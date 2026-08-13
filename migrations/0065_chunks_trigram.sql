-- Migration 0065
-- Ledger version: 2.4.2-chunks-trigram
--
-- P06 / Y-P06-006 — Yol ve sembol adi icin trigram eslesmesi.
--
-- NEDEN AYRI BIR INDEX
--   Full-text arama TAM TOKEN eslesir. Kod aramasinda kullanici cogu
--   zaman parcali yazar: `authServ` yazip `authService`i kastetmek,
--   `src/auth` yazip `src/auth/login.ts`i kastetmek gibi. FTS bunlari
--   bulmaz; trigram bulur.
--
--   Bu, "semantic" bir yetenek DEGILDIR ve oyle sunulmamalidir: yalnizca
--   karakter uclusu ortusmesidir. P00'da tam bu karistirma yapiliyordu —
--   keyword ortusmesi `semantic_score` adiyla sunuluyordu.

-- +up
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_chunks_path_trgm
  ON chunks USING GIN (path gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_chunks_symbol_name_trgm
  ON chunks USING GIN (symbol_name gin_trgm_ops);
-- Sembol arama (Y-P06-006) `symbols` tablosuna da vurur.
CREATE INDEX IF NOT EXISTS idx_symbols_name_trgm
  ON symbols USING GIN (symbol_name gin_trgm_ops);

-- +down
DROP INDEX IF EXISTS idx_symbols_name_trgm;
DROP INDEX IF EXISTS idx_chunks_symbol_name_trgm;
DROP INDEX IF EXISTS idx_chunks_path_trgm;
