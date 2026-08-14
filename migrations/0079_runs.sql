-- Migration 0079
-- Ledger version: 2.8.0-runs
--
-- P12 / Y-P12-001 — Gercek run tablosu (ADR-046, ADR-047, ADR-048).
--
-- P00 Truth Audit — PLANIN TEK EN KRITIK BULGUSU
--   Run tablosu YOKTU. Run yalnizca `event_records` icindeki
--   `payload_json.runId` alaniyla vardi. `GET .../runs/:runId/events`
--   TUM task olaylarini cekip JS'te filtreliyordu.
--
--   `POST .../runs` handler'i dort olay yazip `status: "completed"`
--   donuyordu; hicbir context derlenmiyor, hicbir model cagrilmiyor,
--   hicbir dosyaya dokunulmuyordu. Payload'daki `selectedItemsCount: 3`
--   ve `tokenBudget: 50000` LITERALDI.
--
-- ADR-046 — manifest ve boundary olmadan `ready` olunmaz
--   `manifest_id` ve `boundary_id` kolonlari FSM guard'larinin girdisi.
--
-- ADR-047 — terminal durumlar geri alinamaz
--   Trigger ile zorlanir: `completed`/`failed`/`cancelled` bir daha
--   degismez. Yeniden deneme YENI run uretir; bir run'in sonucu
--   degisebilseydi kanit zinciri (P14) anlamini yitirirdi.
--
-- IDEMPOTENCY
--   `(task_id, idempotency_key)` tekil. Ayni task icin `POST /runs` iki
--   kez cagrilirsa iki run OLUSMAZ. P00'da bu kavram yoktu.

-- +up
CREATE TABLE IF NOT EXISTS runs (
  id VARCHAR(255) PRIMARY KEY,
  organization_id VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(255) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id VARCHAR(255) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,

  state VARCHAR(32) NOT NULL DEFAULT 'created',
  adapter_id VARCHAR(32),

  -- FSM guard girdileri (ADR-046).
  manifest_id VARCHAR(255) REFERENCES context_manifests(id) ON DELETE SET NULL,
  boundary_id VARCHAR(255) REFERENCES change_boundaries(id) ON DELETE SET NULL,
  agent_session_id VARCHAR(255),

  idempotency_key VARCHAR(255) NOT NULL,
  requested_by VARCHAR(255) NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT ck_runs_state CHECK (
    state IN ('created','queued','preparing_context','awaiting_policy','ready','running',
              'awaiting_approval','verifying','completed','failed','cancelled','blocked','degraded')
  ),
  CONSTRAINT uq_runs_idempotency UNIQUE (task_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_runs_task ON runs(task_id);
CREATE INDEX IF NOT EXISTS idx_runs_state ON runs(state);
CREATE INDEX IF NOT EXISTS idx_runs_org ON runs(organization_id);
-- Operatorun sordugu soru: "onay bekleyen run var mi?"
CREATE INDEX IF NOT EXISTS idx_runs_awaiting
  ON runs(updated_at) WHERE state = 'awaiting_approval';

-- ADR-047: terminal durumdan cikis ENGELLENIR.
CREATE OR REPLACE FUNCTION block_terminal_run_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.state IN ('completed', 'failed', 'cancelled') AND NEW.state <> OLD.state THEN
    RAISE EXCEPTION 'Run % terminal durumda (%): durum degistirilemez (ADR-047). Yeniden deneme YENI run uretir.',
      OLD.id, OLD.state;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_block_terminal_run_transition ON runs;
CREATE TRIGGER trigger_block_terminal_run_transition
BEFORE UPDATE ON runs
FOR EACH ROW
EXECUTE FUNCTION block_terminal_run_transition();

-- +down
DROP TRIGGER IF EXISTS trigger_block_terminal_run_transition ON runs;
DROP FUNCTION IF EXISTS block_terminal_run_transition();
DROP INDEX IF EXISTS idx_runs_awaiting;
DROP INDEX IF EXISTS idx_runs_org;
DROP INDEX IF EXISTS idx_runs_state;
DROP INDEX IF EXISTS idx_runs_task;
DROP TABLE IF EXISTS runs;
