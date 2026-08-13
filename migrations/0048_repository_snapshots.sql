-- Migration 0048
-- Ledger version: 2.1.2-repository-snapshots
--
-- P03 / Y-P03-008 — Snapshot: index'in bağlandığı sabit nokta.
--
-- P00 bulgusu: graph ve context hiçbir commit'e bağlı değildi. "Model tam
-- olarak ne gördü?" sorusu ancak içeriğin hangi commit'ten geldiği
-- bilinirse yanıtlanabilir (P09 manifest determinizmi).

-- +up
CREATE TABLE IF NOT EXISTS repository_snapshots (
  id VARCHAR(255) PRIMARY KEY,
  organization_id VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  repository_id VARCHAR(255) NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  commit_sha VARCHAR(64) NOT NULL,
  branch VARCHAR(255),
  ingested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  file_count INTEGER NOT NULL DEFAULT 0,
  total_bytes BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  failure_reason TEXT,
  CONSTRAINT ck_snapshot_status CHECK (status IN ('pending', 'ingesting', 'ready', 'failed')),
  CONSTRAINT ck_snapshot_sha CHECK (commit_sha ~ '^[0-9a-f]{7,64}$'),
  CONSTRAINT uq_snapshot_repo_commit UNIQUE (repository_id, commit_sha)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_repository ON repository_snapshots(repository_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_ready
  ON repository_snapshots(repository_id, ingested_at DESC) WHERE status = 'ready';

-- +down
DROP INDEX IF EXISTS idx_snapshots_ready;
DROP INDEX IF EXISTS idx_snapshots_repository;
DROP TABLE IF EXISTS repository_snapshots;
