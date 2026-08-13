-- Migration 0035
-- Ledger version: 1.3.4-artifact-cas-mvp
--
-- ADR-003 ile apps/api/src/db.ts icindeki inline migrationVersions
-- dizisinden BIREBIR cikarilmistir. Icerik degistirilmemistir.
-- schema_migrations ledger'inda bu dosya yukaridaki version string'i
-- ile kayitlidir; mevcut veritabanlari etkilenmez.

-- +up
CREATE TABLE IF NOT EXISTS cas_blobs (
  id VARCHAR(100) PRIMARY KEY,
  project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cas_hash VARCHAR(128) NOT NULL,
  hash_algorithm VARCHAR(50) NOT NULL DEFAULT 'sha256',
  content_kind VARCHAR(50) NOT NULL,
  mime_type VARCHAR(100),
  size_bytes INTEGER NOT NULL DEFAULT 0,
  payload_text TEXT,
  payload_json JSONB,
  storage_status VARCHAR(50) NOT NULL DEFAULT 'active',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_project_cas_hash UNIQUE (project_id, cas_hash)
);

CREATE TABLE IF NOT EXISTS artifact_versions (
  id VARCHAR(100) PRIMARY KEY,
  project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id VARCHAR(100) REFERENCES tasks(id) ON DELETE SET NULL,
  feature_id VARCHAR(100),
  artifact_type VARCHAR(50) NOT NULL,
  artifact_status VARCHAR(50) NOT NULL DEFAULT 'active',
  logical_path TEXT NOT NULL,
  normalized_logical_path TEXT NOT NULL,
  path_hash VARCHAR(128) NOT NULL,
  version_number INTEGER NOT NULL,
  cas_blob_id VARCHAR(100) NOT NULL REFERENCES cas_blobs(id) ON DELETE RESTRICT,
  cas_hash VARCHAR(128) NOT NULL,
  parent_version_id VARCHAR(100) REFERENCES artifact_versions(id) ON DELETE SET NULL,
  created_by_type VARCHAR(50) NOT NULL,
  created_by_id VARCHAR(100),
  size_bytes INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  description TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_project_path_hash_version UNIQUE (project_id, path_hash, version_number)
);

CREATE INDEX IF NOT EXISTS idx_cas_blobs_project ON cas_blobs(project_id);
CREATE INDEX IF NOT EXISTS idx_cas_blobs_project_hash ON cas_blobs(project_id, cas_hash);
CREATE INDEX IF NOT EXISTS idx_cas_blobs_content_kind ON cas_blobs(content_kind);
CREATE INDEX IF NOT EXISTS idx_cas_blobs_storage_status ON cas_blobs(storage_status);
CREATE INDEX IF NOT EXISTS idx_cas_blobs_created ON cas_blobs(created_at);

CREATE INDEX IF NOT EXISTS idx_artifact_versions_project ON artifact_versions(project_id);
CREATE INDEX IF NOT EXISTS idx_artifact_versions_task ON artifact_versions(task_id);
CREATE INDEX IF NOT EXISTS idx_artifact_versions_feature ON artifact_versions(feature_id);
CREATE INDEX IF NOT EXISTS idx_artifact_versions_type ON artifact_versions(artifact_type);
CREATE INDEX IF NOT EXISTS idx_artifact_versions_status ON artifact_versions(artifact_status);
CREATE INDEX IF NOT EXISTS idx_artifact_versions_path ON artifact_versions(normalized_logical_path);
CREATE INDEX IF NOT EXISTS idx_artifact_versions_path_hash ON artifact_versions(path_hash);
CREATE INDEX IF NOT EXISTS idx_artifact_versions_proj_path_hash ON artifact_versions(project_id, path_hash);
CREATE INDEX IF NOT EXISTS idx_artifact_versions_proj_path_hash_v ON artifact_versions(project_id, path_hash, version_number);
CREATE INDEX IF NOT EXISTS idx_artifact_versions_blob_id ON artifact_versions(cas_blob_id);
CREATE INDEX IF NOT EXISTS idx_artifact_versions_cas_hash ON artifact_versions(cas_hash);
CREATE INDEX IF NOT EXISTS idx_artifact_versions_parent_id ON artifact_versions(parent_version_id);
CREATE INDEX IF NOT EXISTS idx_artifact_versions_created ON artifact_versions(created_at);

DELETE FROM permission_policies WHERE id IN ('policy-task-artifacts-rw', 'policy-worker-artifacts-rw', 'policy-task-artifact-version-rw', 'policy-worker-artifact-version-rw');

INSERT INTO permission_policies (id, effect, subject_type, resource_type, action, conditions_json, description, enabled)
VALUES
  ('policy-task-artifacts-rw', 'allow', 'task', 'artifact', '*', '{}', 'Tasks managing artifacts', true),
  ('policy-worker-artifacts-rw', 'allow', 'worker', 'artifact', '*', '{}', 'Workers managing artifacts', true),
  ('policy-task-artifact-version-rw', 'allow', 'task', 'artifact_version', '*', '{}', 'Tasks managing artifact versions', true),
  ('policy-worker-artifact-version-rw', 'allow', 'worker', 'artifact_version', '*', '{}', 'Workers managing artifact versions', true)
ON CONFLICT (id) DO NOTHING;

-- +down
-- Geri alma bu migration icin tanimlanmamistir (P01 goc turu birebir
-- kopyadir). Down script'leri, sema degistiren yeni migration'lar icin
-- P02'den itibaren zorunludur.
