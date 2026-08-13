-- Migration 0052
-- Ledger version: 2.1.6-migrate-repo-sources
--
-- P03 / Y-P03-012 — `repo_sources` verisinin göçü ve emekliye ayrılması.
--
-- P00 bulgusu P0-9: bu tablo KEYFİ bir mutlak `root_path` tutuyordu ve
-- API bunu kullanıcıdan alıyordu. Yeni modelde yol saklanmaz; kimliklerden
-- hesaplanır (ADR-018).
--
-- Göç, her `repo_sources` satırı için bir `repositories` kaydı üretir.
-- Eski `root_path` KOPYALANMAZ — bilinçli. Operatör repository'yi yeniden
-- bağlamalıdır; sessizce güvensiz yolu taşımak hatayı sürdürürdü.
-- Taşınamayan bilgi `orphaned_memberships` benzeri bir rapora yazılır.

-- +up
CREATE TABLE IF NOT EXISTS orphaned_repo_sources (
  id VARCHAR(255) PRIMARY KEY,
  project_id VARCHAR(255),
  legacy_root_path TEXT,
  reason TEXT NOT NULL,
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

INSERT INTO repositories (
  id, organization_id, project_id, kind, remote_url, default_branch,
  display_name, created_by
)
SELECT
  'repo_from_' || rs.id,
  p.organization_id,
  rs.project_id,
  'local',
  NULL,
  NULL,
  'migrated-' || rs.id,
  'migration-0052'
FROM repo_sources rs
JOIN projects p ON p.id = rs.project_id
ON CONFLICT (id) DO NOTHING;

-- Eski root_path'i, operatorun yeniden baglamasi gerektigi notuyla rapora yaz.
INSERT INTO orphaned_repo_sources (id, project_id, legacy_root_path, reason)
SELECT
  'orphan_repo_' || rs.id,
  rs.project_id,
  rs.root_path,
  'P0-9: keyfi root_path tasinmadi. Repository WorkspaceManager altina yeniden baglanmali.'
FROM repo_sources rs
ON CONFLICT (id) DO NOTHING;

DROP TABLE IF EXISTS repo_sources;

-- +down
CREATE TABLE IF NOT EXISTS repo_sources (
  id VARCHAR(255) PRIMARY KEY,
  project_id VARCHAR(255),
  root_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
DELETE FROM repositories WHERE created_by = 'migration-0052';
DROP TABLE IF EXISTS orphaned_repo_sources;
