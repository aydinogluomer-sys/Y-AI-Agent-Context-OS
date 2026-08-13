-- Migration 0067
-- Ledger version: 2.4.4-retrieval-candidates
--
-- P06 / Y-P06-009, Y-P06-010 — 14 sinyalin veritabanı seviyesinde
-- saklanması (ADR-026).
--
-- Master plan §8'in 14 sinyali, her biri AYRI KOLON:
--   1. semantic_similarity        8. architecture_relationship
--   2. lexical_similarity         9. git_recency
--   3. symbol_match              10. change_frequency
--   4. dependency_distance       11. authority
--   5. reverse_dependency        12. task_intent
--   6. test_relationship         13. historical_relevance
--   7. document_relationship     14. policy_alignment
--
-- `final_score` TÜRETİLMİŞ bir değerdir: sinyaller × ağırlıklar.
-- Denetlenebilirlik testi tam olarak bunu doğrular — skor, kolonlardan
-- yeniden hesaplanabilmelidir. Hesaplanamıyorsa skor bir yerlerde elle
-- düzeltilmiş demektir ve açıklanabilirlik iddiası boştur.
--
-- İZİN VE POLİTİKA NEDEN SİNYAL DEĞİL
--   Master plan bu ikisini de sinyal listesinde sayıyor ama uygulamada
--   FİLTRE olarak uygulanırlar (P06 Security Changes): erişilemeyecek
--   bir fragment düşük skorla listenin sonuna atılmaz, HİÇ ADAY OLMAZ.
--   Düşük skorla geçiştirmek, yeterince az aday olduğunda o fragment'ın
--   yine de seçilmesi demektir. Bu kolon (`policy_alignment`) yalnızca
--   politika TERCİHLERİNİ (ör. "test dosyalarını öne al") taşır, erişim
--   kararını değil.

-- +up
CREATE TABLE IF NOT EXISTS retrieval_candidates (
  id VARCHAR(255) PRIMARY KEY,
  retrieval_run_id VARCHAR(255) NOT NULL REFERENCES retrieval_runs(id) ON DELETE CASCADE,
  organization_id VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  chunk_id VARCHAR(255) REFERENCES chunks(id) ON DELETE CASCADE,

  path TEXT NOT NULL,
  symbol_name TEXT,
  -- Adayi hangi kanal(lar) uretti: lexical, semantic, symbol, graph.
  source_channels TEXT[] NOT NULL DEFAULT '{}',

  -- 14 sinyal. NULL = HESAPLANMADI (0 ile ayni sey degil).
  semantic_similarity REAL,
  lexical_similarity REAL,
  symbol_match REAL,
  dependency_distance REAL,
  reverse_dependency REAL,
  test_relationship REAL,
  document_relationship REAL,
  architecture_relationship REAL,
  git_recency REAL,
  change_frequency REAL,
  authority REAL,
  task_intent REAL,
  historical_relevance REAL,
  policy_alignment REAL,

  -- Turetilmis deger.
  final_score REAL NOT NULL,
  rank INTEGER NOT NULL,
  selected BOOLEAN NOT NULL DEFAULT FALSE,
  -- Insan tarafindan okunabilir gerekce (`included_because`).
  explanation JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT ck_retrieval_candidates_rank CHECK (rank > 0),
  CONSTRAINT uq_retrieval_candidates UNIQUE (retrieval_run_id, chunk_id)
);

CREATE INDEX IF NOT EXISTS idx_retrieval_candidates_run
  ON retrieval_candidates(retrieval_run_id, rank);
CREATE INDEX IF NOT EXISTS idx_retrieval_candidates_selected
  ON retrieval_candidates(retrieval_run_id) WHERE selected = TRUE;

-- +down
DROP INDEX IF EXISTS idx_retrieval_candidates_selected;
DROP INDEX IF EXISTS idx_retrieval_candidates_run;
DROP TABLE IF EXISTS retrieval_candidates;
