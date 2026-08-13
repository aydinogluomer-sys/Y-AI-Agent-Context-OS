-- Migration 0062
-- Ledger version: 2.3.4-impact-snapshot-binding
--
-- P05 / Y-P05-007 — Impact raporları ve change simulation'lar hangi grafa
-- dayandıklarını taşır.
--
-- P00 Truth Audit: `impact_reports` ve `change_simulations` gerçek ve
-- kalıcı; ama `confidence_score` SABİT atanıyordu (`0.9`, `0.85`,
-- `0.9/0.7`) ve hangi graf durumundan üretildikleri kayıtlı değildi.
--
-- Bu ikisi birlikte şu soruyu yanıtsız bırakıyordu:
--   "Bu impact raporu bugün de geçerli mi?"
-- Graf değiştiyse rapor bayattır ama bunu anlamanın yolu yoktu.
--
-- `snapshot_id` + `graph_build_run_id` bu bağı kurar: rapor, üretildiği
-- grafın kimliğini taşır. P10 Change Firewall bayat bir rapora
-- dayanarak karar veremez.
--
-- `confidence_basis` ise skorun NEDEN o değer olduğunu tutar (graf
-- derinliği, çözülemeyen import oranı, kanıt sayısı). Sabit bir sayı
-- yerine ölçümün girdileri kaydedilir; ADR-021'in graf tarafındaki
-- karşılığıdır.

-- +up
ALTER TABLE impact_reports ADD COLUMN IF NOT EXISTS snapshot_id VARCHAR(255)
  REFERENCES repository_snapshots(id) ON DELETE SET NULL;
ALTER TABLE impact_reports ADD COLUMN IF NOT EXISTS graph_build_run_id VARCHAR(255)
  REFERENCES graph_build_runs(id) ON DELETE SET NULL;
ALTER TABLE impact_reports ADD COLUMN IF NOT EXISTS organization_id VARCHAR(255)
  REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE impact_reports ADD COLUMN IF NOT EXISTS confidence_basis JSONB NOT NULL DEFAULT '{}'::jsonb;
-- Traversal butcesi asildiysa rapor EKSIKTIR; bunu gizlemek yanlis
-- guven verir.
ALTER TABLE impact_reports ADD COLUMN IF NOT EXISTS truncated BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE change_simulations ADD COLUMN IF NOT EXISTS snapshot_id VARCHAR(255)
  REFERENCES repository_snapshots(id) ON DELETE SET NULL;
ALTER TABLE change_simulations ADD COLUMN IF NOT EXISTS graph_build_run_id VARCHAR(255)
  REFERENCES graph_build_runs(id) ON DELETE SET NULL;
ALTER TABLE change_simulations ADD COLUMN IF NOT EXISTS organization_id VARCHAR(255)
  REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE change_simulations ADD COLUMN IF NOT EXISTS confidence_basis JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE change_simulations ADD COLUMN IF NOT EXISTS truncated BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE impact_reports r
   SET organization_id = p.organization_id
  FROM projects p
 WHERE r.project_id = p.id AND r.organization_id IS NULL;

UPDATE change_simulations s
   SET organization_id = p.organization_id
  FROM projects p
 WHERE s.project_id = p.id AND s.organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_impact_reports_snapshot ON impact_reports(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_change_simulations_snapshot ON change_simulations(snapshot_id);

-- +down
DROP INDEX IF EXISTS idx_change_simulations_snapshot;
DROP INDEX IF EXISTS idx_impact_reports_snapshot;
ALTER TABLE change_simulations DROP COLUMN IF EXISTS truncated;
ALTER TABLE change_simulations DROP COLUMN IF EXISTS confidence_basis;
ALTER TABLE change_simulations DROP COLUMN IF EXISTS organization_id;
ALTER TABLE change_simulations DROP COLUMN IF EXISTS graph_build_run_id;
ALTER TABLE change_simulations DROP COLUMN IF EXISTS snapshot_id;
ALTER TABLE impact_reports DROP COLUMN IF EXISTS truncated;
ALTER TABLE impact_reports DROP COLUMN IF EXISTS confidence_basis;
ALTER TABLE impact_reports DROP COLUMN IF EXISTS organization_id;
ALTER TABLE impact_reports DROP COLUMN IF EXISTS graph_build_run_id;
ALTER TABLE impact_reports DROP COLUMN IF EXISTS snapshot_id;
