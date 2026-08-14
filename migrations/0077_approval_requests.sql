-- Migration 0077
-- Ledger version: 2.7.2-approval-requests
--
-- P10 / Y-P10-005 — Onay istekleri (ADR-040).
--
-- ADR-040 — ONAY RUN'I BLOKLAR, GECMISI DEGISTIRMEZ
--   `ASK_APPROVAL` karari verildiginde run `awaiting_approval` durumuna
--   gecer. Onay gelirse mutation uygulanir ve HER IKI OLAY da kaydedilir:
--   once "onay istendi", sonra "onay verildi ve uygulandi".
--
--   Onay, gecmisteki DENY kararini SILMEZ. Bir kayit "aslinda izin
--   verildi" diye yeniden yazilabilseydi, onay akisinin kendisi kanit
--   olmaktan cikardi.
--
-- KIM ONAYLADI, NE ZAMAN, NEDEN
--   Ucu birden zorunlu. Gerekcesi olmayan bir onay, sonradan
--   incelendiginde "neden izin verildi?" sorusunu yanitsiz birakir.

-- +up
CREATE TABLE IF NOT EXISTS approval_requests (
  id VARCHAR(255) PRIMARY KEY,
  organization_id VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id VARCHAR(255),
  mutation_decision_id VARCHAR(255) NOT NULL REFERENCES mutation_decisions(id) ON DELETE CASCADE,

  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  -- Isteyen AGENT'tir; kimlik P02 principal'inden gelir.
  requested_by VARCHAR(255) NOT NULL,

  resolved_at TIMESTAMP WITH TIME ZONE,
  -- Onaylayan INSAN olmalidir. Bir agent'in kendi istegini onaylamasi
  -- onay kavramini anlamsiz kilar; bu kural uygulama katmaninda
  -- zorlanir ve burada belgelenir.
  resolved_by VARCHAR(255),
  decision VARCHAR(16),
  rationale TEXT,

  CONSTRAINT ck_approval_requests_decision CHECK (
    decision IS NULL OR decision IN ('approved', 'rejected')
  ),
  -- Cozulmus bir istek, KIM ve NEDEN bilgisini tasimak zorundadir.
  CONSTRAINT ck_approval_requests_resolution CHECK (
    (resolved_at IS NULL AND resolved_by IS NULL AND decision IS NULL AND rationale IS NULL)
    OR
    (resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND decision IS NOT NULL
     AND rationale IS NOT NULL AND length(trim(rationale)) > 0)
  ),
  CONSTRAINT uq_approval_requests UNIQUE (mutation_decision_id)
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_run ON approval_requests(run_id);
-- Operatorun sordugu soru: "bekleyen onay var mi?"
CREATE INDEX IF NOT EXISTS idx_approval_requests_pending
  ON approval_requests(requested_at) WHERE resolved_at IS NULL;

-- +down
DROP INDEX IF EXISTS idx_approval_requests_pending;
DROP INDEX IF EXISTS idx_approval_requests_run;
DROP TABLE IF EXISTS approval_requests;
