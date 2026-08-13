-- Migration 0031
-- Ledger version: 1.3.0-context-object-store-mvp
--
-- ADR-003 ile apps/api/src/db.ts icindeki inline migrationVersions
-- dizisinden BIREBIR cikarilmistir. Icerik degistirilmemistir.
-- schema_migrations ledger'inda bu dosya yukaridaki version string'i
-- ile kayitlidir; mevcut veritabanlari etkilenmez.

-- +up
CREATE TABLE IF NOT EXISTS context_objects (
  id VARCHAR(100) PRIMARY KEY,
  project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id VARCHAR(100) REFERENCES tasks(id) ON DELETE SET NULL,
  feature_id VARCHAR(100),
  object_type VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  source_table VARCHAR(100),
  source_id VARCHAR(100),
  content_hash VARCHAR(128) NOT NULL,
  hash_algorithm VARCHAR(50) NOT NULL DEFAULT 'sha256',
  payload_size_bytes INTEGER NOT NULL DEFAULT 0,
  payload_text TEXT,
  payload_json JSONB,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  stale_at TIMESTAMP WITH TIME ZONE,
  quarantined_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS context_object_refs (
  id VARCHAR(100) PRIMARY KEY,
  project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id VARCHAR(100) REFERENCES tasks(id) ON DELETE SET NULL,
  context_object_id VARCHAR(100) NOT NULL REFERENCES context_objects(id) ON DELETE CASCADE,
  ref_type VARCHAR(100) NOT NULL,
  ref_table VARCHAR(100),
  ref_id VARCHAR(100),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_context_objects_project ON context_objects(project_id);
CREATE INDEX IF NOT EXISTS idx_context_objects_task ON context_objects(task_id);
CREATE INDEX IF NOT EXISTS idx_context_objects_feature ON context_objects(feature_id);
CREATE INDEX IF NOT EXISTS idx_context_objects_type ON context_objects(object_type);
CREATE INDEX IF NOT EXISTS idx_context_objects_status ON context_objects(status);
CREATE INDEX IF NOT EXISTS idx_context_objects_hash ON context_objects(content_hash);
CREATE INDEX IF NOT EXISTS idx_context_objects_source ON context_objects(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_context_objects_created_at ON context_objects(created_at);

CREATE INDEX IF NOT EXISTS idx_context_object_refs_project ON context_object_refs(project_id);
CREATE INDEX IF NOT EXISTS idx_context_object_refs_task ON context_object_refs(task_id);
CREATE INDEX IF NOT EXISTS idx_context_object_refs_object ON context_object_refs(context_object_id);
CREATE INDEX IF NOT EXISTS idx_context_object_refs_type ON context_object_refs(ref_type);
CREATE INDEX IF NOT EXISTS idx_context_object_refs_ref ON context_object_refs(ref_table, ref_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_context_objects_dedupe ON context_objects(project_id, content_hash, object_type);

-- +down
-- Geri alma bu migration icin tanimlanmamistir (P01 goc turu birebir
-- kopyadir). Down script'leri, sema degistiren yeni migration'lar icin
-- P02'den itibaren zorunludur.
