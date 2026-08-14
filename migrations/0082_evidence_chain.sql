-- Migration 0082
-- Ledger version: 2.9.0-evidence-chain
--
-- P14 — Kanit hash zinciri.
--
-- P00 Truth Audit: `evidence_records` tablosu ve `EvidenceStoreService`
-- GERCEKTI — ama ZINCIR yoktu. Her kayit kendi basina duruyordu; bir
-- kaydin silinmesi ya da araya kayit eklenmesi tespit edilemezdi.
--
-- Ayrica UI iki yerde UYDURMA hash gosteriyordu:
--   - `App.tsx`: `"sha256-" + Math.random().toString(16)...`
--   - `AIMissionControlPanel.tsx`: hard-code bir SHA-256
-- Ikisi de P13'te kaldirildi.
--
-- ZINCIR NASIL CALISIR
--   entryHash(n) = sha256(canonical(kayit(n)) || entryHash(n-1))
--
--   Bir kayit degistirilirse kendi hash'i degisir; sonraki kaydin
--   `previous_hash` alani artik uyusmaz ve zincir O NOKTADAN ITIBAREN
--   kirilir. Araya kayit eklemek de ayni sonucu verir.
--
-- NE GARANTI ETMEZ (ve bunu soylemek onemli)
--   Veritabanina TAM yazma yetkisi olan biri zinciri bastan
--   hesaplayabilir. Buna karsi koruma DIS BIR CAPA gerektirir (imzali
--   periyodik snapshot, harici zaman damgasi). Zincirin gercekten
--   sagladigi sey: KISMI degisikligin tespit edilmesi. Bir kaydi
--   sessizce duzeltmek ya da silmek artik mumkun degil.

-- +up
CREATE TABLE IF NOT EXISTS evidence_chain (
  id VARCHAR(255) PRIMARY KEY,
  organization_id VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id VARCHAR(255) REFERENCES runs(id) ON DELETE SET NULL,

  sequence BIGINT NOT NULL,
  kind VARCHAR(48) NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,

  previous_hash VARCHAR(64) NOT NULL,
  entry_hash VARCHAR(64) NOT NULL,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT ck_evidence_chain_sequence CHECK (sequence > 0),
  -- Ayni org icinde sira TEKILDIR: iki kayit ayni sirayi alamaz.
  CONSTRAINT uq_evidence_chain_sequence UNIQUE (organization_id, sequence),
  -- Ayni hash iki kez olamaz; olursa kopya kayit demektir.
  CONSTRAINT uq_evidence_chain_hash UNIQUE (entry_hash)
);

CREATE INDEX IF NOT EXISTS idx_evidence_chain_run ON evidence_chain(run_id, sequence);
-- Zincirin ucunu bulma sorgusu.
CREATE INDEX IF NOT EXISTS idx_evidence_chain_head
  ON evidence_chain(organization_id, sequence DESC);

-- Zincir APPEND-ONLY. Bir kanit kaydi sonradan degistirilemez ve
-- silinemez; aksi halde zincirin varlik sebebi ortadan kalkar.
CREATE OR REPLACE FUNCTION block_evidence_chain_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'evidence_chain append-only bir kanit zinciridir: kayitlar degistirilemez ya da silinemez.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_block_evidence_chain_update ON evidence_chain;
CREATE TRIGGER trigger_block_evidence_chain_update
BEFORE UPDATE ON evidence_chain
FOR EACH ROW
EXECUTE FUNCTION block_evidence_chain_mutation();

DROP TRIGGER IF EXISTS trigger_block_evidence_chain_delete ON evidence_chain;
CREATE TRIGGER trigger_block_evidence_chain_delete
BEFORE DELETE ON evidence_chain
FOR EACH ROW
EXECUTE FUNCTION block_evidence_chain_mutation();

-- +down
DROP TRIGGER IF EXISTS trigger_block_evidence_chain_delete ON evidence_chain;
DROP TRIGGER IF EXISTS trigger_block_evidence_chain_update ON evidence_chain;
DROP FUNCTION IF EXISTS block_evidence_chain_mutation();
DROP INDEX IF EXISTS idx_evidence_chain_head;
DROP INDEX IF EXISTS idx_evidence_chain_run;
DROP TABLE IF EXISTS evidence_chain;
