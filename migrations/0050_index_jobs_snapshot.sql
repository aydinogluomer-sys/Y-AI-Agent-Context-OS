-- Migration 0050
-- Ledger version: 2.1.4-index-jobs-snapshot
--
-- P03 / Y-P03-012 — Index job'ları artık bir snapshot'a bağlanır.
--
-- Öncesinde job'lar yalnız `project_id` taşıyordu; hangi commit'in
-- index'lendiği kayıtlı değildi. Bu, "bu context hangi koddan geldi?"
-- sorusunu yanıtlanamaz kılıyordu.

-- +up
ALTER TABLE index_jobs ADD COLUMN IF NOT EXISTS snapshot_id VARCHAR(255);
ALTER TABLE index_jobs ADD COLUMN IF NOT EXISTS job_phase VARCHAR(24) NOT NULL DEFAULT 'index';
ALTER TABLE index_jobs ADD COLUMN IF NOT EXISTS organization_id VARCHAR(255);

UPDATE index_jobs j
   SET organization_id = p.organization_id
  FROM projects p
 WHERE j.project_id = p.id AND j.organization_id IS NULL;

UPDATE index_jobs SET organization_id = 'org_default_migration' WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_index_jobs_snapshot ON index_jobs(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_index_jobs_org ON index_jobs(organization_id);

-- +down
DROP INDEX IF EXISTS idx_index_jobs_org;
DROP INDEX IF EXISTS idx_index_jobs_snapshot;
ALTER TABLE index_jobs DROP COLUMN IF EXISTS organization_id;
ALTER TABLE index_jobs DROP COLUMN IF EXISTS job_phase;
ALTER TABLE index_jobs DROP COLUMN IF EXISTS snapshot_id;
