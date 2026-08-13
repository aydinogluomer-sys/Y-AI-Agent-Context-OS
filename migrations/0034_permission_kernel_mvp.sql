-- Migration 0034
-- Ledger version: 1.3.3-permission-kernel-mvp
--
-- ADR-003 ile apps/api/src/db.ts icindeki inline migrationVersions
-- dizisinden BIREBIR cikarilmistir. Icerik degistirilmemistir.
-- schema_migrations ledger'inda bu dosya yukaridaki version string'i
-- ile kayitlidir; mevcut veritabanlari etkilenmez.

-- +up
CREATE TABLE IF NOT EXISTS permission_policies (
  id VARCHAR(100) PRIMARY KEY,
  effect VARCHAR(20) NOT NULL,
  subject_type VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  conditions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permission_evaluations (
  id VARCHAR(100) PRIMARY KEY,
  project_id VARCHAR(100) REFERENCES projects(id) ON DELETE CASCADE,
  subject_type VARCHAR(50) NOT NULL,
  subject_id VARCHAR(100),
  resource_type VARCHAR(50) NOT NULL,
  resource_id VARCHAR(100),
  action VARCHAR(50) NOT NULL,
  decision VARCHAR(20) NOT NULL,
  denied_reason TEXT,
  matched_rules_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  evaluated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permission_overrides (
  id VARCHAR(100) PRIMARY KEY,
  project_id VARCHAR(100) REFERENCES projects(id) ON DELETE CASCADE,
  subject_type VARCHAR(50) NOT NULL,
  subject_id VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL,
  rationale TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'used',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_perm_policies_query ON permission_policies(subject_type, resource_type, action);
CREATE INDEX IF NOT EXISTS idx_perm_policies_enabled ON permission_policies(enabled);

CREATE INDEX IF NOT EXISTS idx_perm_eval_project ON permission_evaluations(project_id);
CREATE INDEX IF NOT EXISTS idx_perm_eval_subj ON permission_evaluations(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_perm_eval_res ON permission_evaluations(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_perm_eval_action ON permission_evaluations(action);
CREATE INDEX IF NOT EXISTS idx_perm_eval_decision ON permission_evaluations(decision);
CREATE INDEX IF NOT EXISTS idx_perm_eval_evaluated_at ON permission_evaluations(evaluated_at);

CREATE INDEX IF NOT EXISTS idx_perm_overrides_project ON permission_overrides(project_id);
CREATE INDEX IF NOT EXISTS idx_perm_overrides_subj ON permission_overrides(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_perm_overrides_res ON permission_overrides(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_perm_overrides_action ON permission_overrides(action);
CREATE INDEX IF NOT EXISTS idx_perm_overrides_created_at ON permission_overrides(created_at);

DELETE FROM permission_policies WHERE id IN ('policy-admin-bypass', 'policy-system-bypass', 'policy-worker-jobs', 'policy-worker-job-update', 'policy-worker-locks', 'policy-task-locks', 'policy-task-rw');

INSERT INTO permission_policies (id, effect, subject_type, resource_type, action, conditions_json, description, enabled)
VALUES 
  ('policy-admin-bypass', 'allow', '*', '*', '*', '{"is_admin": true}', 'Administrative bypass override rule', true),
  ('policy-system-bypass', 'allow', 'system', '*', '*', '{}', 'System/internal action rule', true),
  ('policy-worker-jobs', 'allow', 'worker', 'index_job', 'claim', '{}', 'Worker claiming jobs rule', true),
  ('policy-worker-job-update', 'allow', 'worker', 'index_job', 'update', '{}', 'Worker updating claimed jobs rule', true),
  ('policy-worker-locks', 'allow', 'worker', 'file_lock', '*', '{}', 'Worker managing file locks rule', true),
  ('policy-task-locks', 'allow', 'task', 'file_lock', '*', '{}', 'Tasks managing file locks rule', true),
  ('policy-task-rw', 'allow', 'task', 'file', '*', '{}', 'Tasks reading and writing project files rule', true)
ON CONFLICT (id) DO NOTHING;

-- +down
-- Geri alma bu migration icin tanimlanmamistir (P01 goc turu birebir
-- kopyadir). Down script'leri, sema degistiren yeni migration'lar icin
-- P02'den itibaren zorunludur.
