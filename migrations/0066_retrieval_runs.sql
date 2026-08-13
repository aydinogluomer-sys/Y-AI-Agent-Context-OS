-- Migration 0066
-- Ledger version: 2.4.3-retrieval-runs
--
-- P06 / Y-P06-010 — Retrieval çalıştırmaları ve 14 sinyalli adaylar
-- (ADR-026: sıralama açıklanabilirliği ZORUNLU).
--
-- P00 Truth Audit: sıralamanın büyük kısmı SABİTTİ.
--   `search-server.ts:116-120` her `context_objects` satırına
--   `base_score: 70`, `recency_score: 10`, `final_score: 80 + kw + sem`
--   veriyordu. Yani iki farklı dosya arasındaki fark, 100 puanlık skorun
--   yalnızca küçük bir kısmıydı; geri kalanı herkese eşit dağıtılmıştı.
--
-- NEDEN 14 AYRI KOLON, NEDEN TEK BİR JSONB DEĞİL
--   Açıklanabilirlik bir raporlama özelliği değil, bir VERİ MODELİ
--   kararıdır. Sinyaller ayrı kolonlarda durursa:
--     - "hangi sinyal bu sonucu getirdi" SQL ile sorgulanabilir,
--     - ağırlık değişiminin etkisi geçmiş çalıştırmalar üzerinde
--       yeniden hesaplanabilir,
--     - bir sinyalin hiç hesaplanmadığı (hep NULL) fark edilir.
--   JSONB'de bunların hiçbiri denetlenebilir olmaz; eksik bir alan
--   yokluğuyla değil, sessizliğiyle geçer.
--
-- `weights_hash` NEDEN VAR
--   Aynı sorgu farklı ağırlıklarla farklı sonuç verir. Manifest'in (P09)
--   "bu context şu girdilerle üretildi" diyebilmesi için ağırlık setinin
--   kimliği kaydedilmelidir. Ağırlıklar konfigürasyondadır ve
--   değiştirilebilir; hangi setin kullanıldığı ise değiştirilemez bir
--   kayıttır.

-- +up
CREATE TABLE IF NOT EXISTS retrieval_runs (
  id VARCHAR(255) PRIMARY KEY,
  organization_id VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
  task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE SET NULL,
  snapshot_id VARCHAR(255) NOT NULL REFERENCES repository_snapshots(id) ON DELETE CASCADE,

  query_text TEXT NOT NULL,
  -- Hangi kanallar KULLANILDI. Semantic kanal kapaliysa bu listede yoktur
  -- ve `degraded` TRUE olur — sessiz bir eksilme olmaz.
  channels TEXT[] NOT NULL DEFAULT '{}',
  degraded BOOLEAN NOT NULL DEFAULT FALSE,
  degraded_reason TEXT,

  weights_hash VARCHAR(64) NOT NULL,
  weights_json JSONB NOT NULL DEFAULT '{}'::jsonb,

  candidate_count INTEGER NOT NULL DEFAULT 0,
  returned_count INTEGER NOT NULL DEFAULT 0,
  -- Embedding'i olmayan chunk orani: semantic kanalin KAPSAMI.
  -- 1'den kucukse sonuc eksik olabilir ve compile bunu UYARIR.
  embedding_coverage REAL,

  duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retrieval_runs_task ON retrieval_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_retrieval_runs_snapshot ON retrieval_runs(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_retrieval_runs_org ON retrieval_runs(organization_id);

-- +down
DROP INDEX IF EXISTS idx_retrieval_runs_org;
DROP INDEX IF EXISTS idx_retrieval_runs_snapshot;
DROP INDEX IF EXISTS idx_retrieval_runs_task;
DROP TABLE IF EXISTS retrieval_runs;
