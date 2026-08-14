-- Migration 0076
-- Ledger version: 2.7.1-mutation-decisions
--
-- P10 / Y-P10-002 — Her mutation girisiminin karari (ADR-039, ADR-041).
--
-- P00'daki `boundary_checks` tablosu YALNIZ YAZILIYOR, HIC OKUNMUYORDU.
-- Bir kayit ancak okunuyorsa kanittir; okunmayan kayit, disk uzerinde
-- yer kaplayan bir iyi niyet beyanidir.
--
-- BU TABLO NE ICIN OKUNUR
--   1. Onay akisi: `ASK_APPROVAL` kararlari `approval_requests`e baglanir.
--   2. Ihlal raporu: bir run kac kez sinir disina cikmaya calisti?
--   3. Sonradan inceleme: "agent bu dosyayi neden degistiremedi?"
--
-- hash_before / hash_after (ADR-041)
--   Her yazimda dosyanin onceki ve sonraki hash'i kaydedilir. Esszamanli
--   degisiklik bu ikisiyle tespit edilir (T-20). "Son yazan kazanir"
--   davranisi, iki agent ayni dosyada calistiginda birinin isini
--   sessizce silmek demektir.

-- +up
CREATE TABLE IF NOT EXISTS mutation_decisions (
  id VARCHAR(255) PRIMARY KEY,
  organization_id VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id VARCHAR(255),
  boundary_id VARCHAR(255) REFERENCES change_boundaries(id) ON DELETE SET NULL,

  path TEXT NOT NULL,
  operation VARCHAR(16) NOT NULL,
  decision VARCHAR(16) NOT NULL,
  band VARCHAR(16) NOT NULL,

  -- Kararin gerekcesi ve eslesen kural. Gerekce olmadan bir DENY,
  -- kullanicinin anlayamadigi bir duvar olur.
  reason TEXT NOT NULL,
  rule_matched VARCHAR(64) NOT NULL,

  hash_before VARCHAR(64),
  hash_after VARCHAR(64),

  decided_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT ck_mutation_decisions_operation CHECK (
    operation IN ('create', 'modify', 'delete', 'rename')
  ),
  CONSTRAINT ck_mutation_decisions_decision CHECK (
    decision IN ('ALLOW', 'DENY', 'ASK_APPROVAL')
  ),
  CONSTRAINT ck_mutation_decisions_band CHECK (
    band IN ('expected', 'allowed', 'approval', 'denied', 'outside')
  )
);

CREATE INDEX IF NOT EXISTS idx_mutation_decisions_run ON mutation_decisions(run_id, decided_at);
-- Ihlal raporu: bir run kac kez sinir disina cikmaya calisti?
CREATE INDEX IF NOT EXISTS idx_mutation_decisions_denied
  ON mutation_decisions(run_id) WHERE decision = 'DENY';
CREATE INDEX IF NOT EXISTS idx_mutation_decisions_pending
  ON mutation_decisions(run_id) WHERE decision = 'ASK_APPROVAL';

-- +down
DROP INDEX IF EXISTS idx_mutation_decisions_pending;
DROP INDEX IF EXISTS idx_mutation_decisions_denied;
DROP INDEX IF EXISTS idx_mutation_decisions_run;
DROP TABLE IF EXISTS mutation_decisions;
