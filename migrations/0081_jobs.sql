-- Migration 0081
-- Ledger version: 2.8.2-jobs
--
-- P12 / Y-P12-003 — Genel is kuyrugu (ADR-004).
--
-- P00 Truth Audit: genel bir kuyruk YOKTU. `index_jobs` icin
-- `FOR UPDATE SKIP LOCKED` oruntusu vardi ve DOGRUYDU — ama yalniz
-- index isleri icin. Diger her sey (context compile, run execute,
-- quality gate) senkron HTTP icinde ya da hic calismiyordu.
--
-- NEDEN POSTGRES, NEDEN REDIS/SQS DEGIL (ADR-004)
--   Is kuyrugunu ayri bir sisteme koymak, is durumu ile veri durumunu
--   iki ayri transaction sinirina boler. "Is tamamlandi" yazildi ama
--   sonuc yazilamadi (ya da tersi) durumu ortaya cikar; cozumu dagitik
--   transaction ya da uzlasma mantigidir — ikisi de bu olcekte
--   gereksiz karmasiklik.
--
-- COKME KURTARMA
--   `lease_expires_at` gecmiste kalan bir is, baska bir worker
--   tarafindan geri alinir. Lease suresi dolmus bir is sonsuza kadar
--   `running` KALMAZ. Bu, worker cokmesinin sessizce is kaybina
--   donusmesini engeller.

-- +up
CREATE TABLE IF NOT EXISTS jobs (
  id VARCHAR(255) PRIMARY KEY,
  organization_id VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
  run_id VARCHAR(255) REFERENCES runs(id) ON DELETE CASCADE,

  job_type VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'queued',
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json JSONB,

  -- Ayni anahtarla ikinci bir is kuyruga GIRMEZ: bir HTTP isteginin
  -- iki kez gelmesi iki compile baslatmamali.
  idempotency_key VARCHAR(255) NOT NULL,

  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  priority INTEGER NOT NULL DEFAULT 0,

  locked_by VARCHAR(255),
  locked_at TIMESTAMP WITH TIME ZONE,
  lease_expires_at TIMESTAMP WITH TIME ZONE,

  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT ck_jobs_type CHECK (
    job_type IN ('context-compile','run-execute','quality-gate','index','embed','graph')
  ),
  CONSTRAINT ck_jobs_status CHECK (
    status IN ('queued','running','completed','failed','cancelled')
  ),
  CONSTRAINT ck_jobs_attempts CHECK (attempt >= 0 AND max_attempts > 0),
  CONSTRAINT uq_jobs_idempotency UNIQUE (idempotency_key)
);

-- Claim sorgusunun kullandigi index: tur + durum + oncelik + yas.
CREATE INDEX IF NOT EXISTS idx_jobs_claim
  ON jobs(job_type, priority DESC, created_at) WHERE status = 'queued';
-- Cokme kurtarma sorgusu.
CREATE INDEX IF NOT EXISTS idx_jobs_stale
  ON jobs(lease_expires_at) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_jobs_run ON jobs(run_id);

-- +down
DROP INDEX IF EXISTS idx_jobs_run;
DROP INDEX IF EXISTS idx_jobs_stale;
DROP INDEX IF EXISTS idx_jobs_claim;
DROP TABLE IF EXISTS jobs;
