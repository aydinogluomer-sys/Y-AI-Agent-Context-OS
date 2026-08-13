-- Migration 0041
-- Ledger version: 2.0.5-projects-organization-scope
--
-- P02 / Y-P02-004 — Şema drift'i D-1'in kapatılması.
--
-- P00 bulgusu: `apps/api/src/index.ts:189-191` `projects.organization_id`
-- okuyordu ama kolon YOKTU. `org_id` claim'i taşıyan her JWT principal için
-- `GET /api/projects` gerçek Postgres'te 500 (42703 undefined_column) veriyordu.

-- +up
ALTER TABLE projects ADD COLUMN IF NOT EXISTS organization_id VARCHAR(255);

-- Mevcut projeler varsayılan organizasyona bağlanır (0036'da oluşturuldu).
UPDATE projects
   SET organization_id = 'org_default_migration'
 WHERE organization_id IS NULL;

ALTER TABLE projects ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE projects
  ADD CONSTRAINT fk_projects_organization
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_projects_organization ON projects(organization_id);

-- +down
DROP INDEX IF EXISTS idx_projects_organization;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS fk_projects_organization;
ALTER TABLE projects DROP COLUMN IF EXISTS organization_id;
