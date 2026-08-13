-- Migration 0042
-- Ledger version: 2.0.6-tasks-scope-and-assignment
--
-- P02 / Y-P02-004 — Şema drift'i D-2'nin kapatılması.
--
-- P00 bulgusu: `apps/api/src/index.ts:237` `tasks.assigned_to` alanını
-- güncelleme allow-list'inde tutuyordu ama kolon YOKTU.
-- `PATCH /projects/:pid/tasks/:tid {assigned_to}` -> 500.

-- +up
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS organization_id VARCHAR(255);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(255);

UPDATE tasks t
   SET organization_id = p.organization_id
  FROM projects p
 WHERE t.project_id = p.id
   AND t.organization_id IS NULL;

-- Projesi silinmiş yetim task varsa varsayılana bağla (FK yoksa NULL kalırdı).
UPDATE tasks SET organization_id = 'org_default_migration' WHERE organization_id IS NULL;

ALTER TABLE tasks ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE tasks
  ADD CONSTRAINT fk_tasks_organization
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_tasks_organization ON tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);

-- +down
DROP INDEX IF EXISTS idx_tasks_assigned_to;
DROP INDEX IF EXISTS idx_tasks_organization;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS fk_tasks_organization;
ALTER TABLE tasks DROP COLUMN IF EXISTS assigned_to;
ALTER TABLE tasks DROP COLUMN IF EXISTS organization_id;
