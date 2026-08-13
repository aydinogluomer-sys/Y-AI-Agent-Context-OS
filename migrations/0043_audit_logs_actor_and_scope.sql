-- Migration 0043
-- Ledger version: 2.0.7-audit-logs-actor-and-scope
--
-- P02 / Y-P02-008 — Şema drift'i D-4 ve audit actor spoofing (T-19).
--
-- P00 bulguları:
--   * `packages/core/src/repo-adapter-service.ts:104-120` `audit_logs`
--     tablosuna `category`, `actor_role`, `is_approved_by_human` kolonlarını
--     yazıyordu — üçü de YOKTU. `logAccess` try/catch'siz await edildiği için
--     `/repo/file` ve `/repo/files` gerçek Postgres'te 500 veriyordu
--     (yalnız mock DB ile çalışıyordu).
--   * `audit_logs.project_id` FK taşımıyordu.
--   * Aktörler hard-code'du: "User-Aydinoglu", "developer", "anonymous-actor".
--     `getAuditActor` import edilmiş ve hiç çağrılmamıştı.

-- +up
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS organization_id VARCHAR(255);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_principal_id VARCHAR(255);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_role VARCHAR(64);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS category VARCHAR(64);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS is_approved_by_human BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE audit_logs a
   SET organization_id = p.organization_id
  FROM projects p
 WHERE a.project_id = p.id
   AND a.organization_id IS NULL;

UPDATE audit_logs SET organization_id = 'org_default_migration' WHERE organization_id IS NULL;

-- Geçmiş kayıtlarda doğrulanmış principal yok; bunu GİZLEMİYORUZ.
-- Açık bir sentinel değer kullanılır ki P20 denetimi bunları ayırt edebilsin.
UPDATE audit_logs
   SET actor_principal_id = 'legacy:unverified'
 WHERE actor_principal_id IS NULL;

ALTER TABLE audit_logs ALTER COLUMN actor_principal_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_organization ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_principal ON audit_logs(actor_principal_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON audit_logs(category);

-- +down
DROP INDEX IF EXISTS idx_audit_logs_category;
DROP INDEX IF EXISTS idx_audit_logs_actor_principal;
DROP INDEX IF EXISTS idx_audit_logs_organization;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS is_approved_by_human;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS category;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS actor_role;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS actor_principal_id;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS organization_id;
