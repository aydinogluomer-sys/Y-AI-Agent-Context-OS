-- Migration 0044
-- Ledger version: 2.0.8-permission-policies-scope
--
-- P02 / Y-P02-007 + Y-P02-006 — Şema drift'i D-3 ve `system` bypass'ının kaldırılması.
--
-- P00 bulguları:
--   * `apps/api/src/index.ts:4377` `permission_policies` tablosunu
--     `WHERE project_id = $1 OR is_system = true` ile sorguluyordu — İKİ KOLON DA YOKTU.
--     `GET /projects/:id/permission-policies` gerçek Postgres'te HER ZAMAN 500
--     veriyordu ve UI bu endpoint'i çağırıyordu.
--   * P0-6: seed policy `policy-system-bypass` = allow / system / * / * .
--     Servislerdeki `enforce()` çağrılarının çoğu subject'i `system` olarak
--     hard-code ettiği için bu politika onları HER ZAMAN allow yapıyordu.

-- +up
ALTER TABLE permission_policies ADD COLUMN IF NOT EXISTS organization_id VARCHAR(255);
ALTER TABLE permission_policies ADD COLUMN IF NOT EXISTS project_id VARCHAR(255);
ALTER TABLE permission_policies ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;

-- Mevcut seed politikaları sistem politikası olarak işaretlenir.
UPDATE permission_policies SET is_system = TRUE WHERE project_id IS NULL;

UPDATE permission_policies
   SET organization_id = 'org_default_migration'
 WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_permission_policies_project ON permission_policies(project_id);
CREATE INDEX IF NOT EXISTS idx_permission_policies_org ON permission_policies(organization_id);
CREATE INDEX IF NOT EXISTS idx_permission_policies_system ON permission_policies(is_system) WHERE is_system = TRUE;

-- P0-6: blanket `system` bypass politikası KALDIRILIR.
-- Bu satır dururken hiçbir enforcement noktası anlamlı değildi.
DELETE FROM permission_policies WHERE id = 'policy-system-bypass';

-- +down
-- Bypass politikasi bilerek geri getirilmez (guvenlik gerilemesi).
DROP INDEX IF EXISTS idx_permission_policies_system;
DROP INDEX IF EXISTS idx_permission_policies_org;
DROP INDEX IF EXISTS idx_permission_policies_project;
ALTER TABLE permission_policies DROP COLUMN IF EXISTS is_system;
ALTER TABLE permission_policies DROP COLUMN IF EXISTS project_id;
ALTER TABLE permission_policies DROP COLUMN IF EXISTS organization_id;
