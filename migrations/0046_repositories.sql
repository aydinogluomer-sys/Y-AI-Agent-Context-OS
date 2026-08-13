-- Migration 0046
-- Ledger version: 2.1.0-repositories
--
-- P03 / Y-P03-012 — Repository kaydı.
--
-- P00 bulgusu: `repo_sources(project_id, root_path)` tablosu KEYFİ bir
-- mutlak yol tutuyordu ve `RepoAdapterService` bunu doğrudan adapter'a
-- veriyordu (P0-9). Yeni model yol TUTMAZ; yol WorkspaceManager tarafından
-- kimliklerden hesaplanır (ADR-018).

-- +up
CREATE TABLE IF NOT EXISTS repositories (
  id VARCHAR(255) PRIMARY KEY,
  organization_id VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(255) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind VARCHAR(16) NOT NULL,
  -- Uzak repo URL'i. Local repository'ler icin NULL.
  remote_url TEXT,
  default_branch VARCHAR(255),
  display_name VARCHAR(255) NOT NULL,
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  disconnected_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT ck_repositories_kind CHECK (kind IN ('local', 'github', 'gitlab')),
  -- Uzak repository'lerde URL zorunlu; local'de olmamali.
  CONSTRAINT ck_repositories_remote_url CHECK (
    (kind = 'local' AND remote_url IS NULL) OR (kind <> 'local' AND remote_url IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_repositories_project ON repositories(project_id);
CREATE INDEX IF NOT EXISTS idx_repositories_org ON repositories(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_repositories_project_name
  ON repositories(project_id, display_name) WHERE disconnected_at IS NULL;

-- +down
DROP INDEX IF EXISTS uq_repositories_project_name;
DROP INDEX IF EXISTS idx_repositories_org;
DROP INDEX IF EXISTS idx_repositories_project;
DROP TABLE IF EXISTS repositories;
