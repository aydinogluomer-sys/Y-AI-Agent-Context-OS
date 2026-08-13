-- Migration 0010
-- Ledger version: 1.0.9-context-boundaries
--
-- ADR-003 ile apps/api/src/db.ts icindeki inline migrationVersions
-- dizisinden BIREBIR cikarilmistir. Icerik degistirilmemistir.
-- schema_migrations ledger'inda bu dosya yukaridaki version string'i
-- ile kayitlidir; mevcut veritabanlari etkilenmez.

-- +up
CREATE TABLE IF NOT EXISTS task_boundaries (
  id VARCHAR(255) PRIMARY KEY,
  project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
  task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE CASCADE,
  context_pack_id VARCHAR(255) REFERENCES context_packs(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  allowed_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  forbidden_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_patterns JSONB NOT NULL DEFAULT '[]'::jsonb,
  forbidden_patterns JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_domains JSONB NOT NULL DEFAULT '[]'::jsonb,
  forbidden_domains JSONB NOT NULL DEFAULT '[]'::jsonb,
  locked_by VARCHAR(255),
  locked_at TIMESTAMP WITH TIME ZONE,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_boundaries_project ON task_boundaries(project_id);
CREATE INDEX IF NOT EXISTS idx_task_boundaries_task ON task_boundaries(task_id);

CREATE TABLE IF NOT EXISTS boundary_checks (
  id VARCHAR(255) PRIMARY KEY,
  project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
  task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE CASCADE,
  boundary_id VARCHAR(255) REFERENCES task_boundaries(id) ON DELETE CASCADE,
  proposed_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  result VARCHAR(50) NOT NULL,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  violations JSONB NOT NULL DEFAULT '[]'::jsonb,
  requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_boundary_checks_project ON boundary_checks(project_id);
CREATE INDEX IF NOT EXISTS idx_boundary_checks_task ON boundary_checks(task_id);
CREATE INDEX IF NOT EXISTS idx_boundary_checks_boundary ON boundary_checks(boundary_id);

-- +down
-- Geri alma bu migration icin tanimlanmamistir (P01 goc turu birebir
-- kopyadir). Down script'leri, sema degistiren yeni migration'lar icin
-- P02'den itibaren zorunludur.
