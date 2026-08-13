-- Migration 0051
-- Ledger version: 2.1.5-repo-access-audit
--
-- P03 — `repo_access_logs` tablosunun emekliye ayrılması.
--
-- P00 bulgusu: `repo_access_logs` YALNIZ YAZILIYOR, hiç okunmuyordu.
-- Üstelik onu yazan `logAccess()` (`repo-adapter-service.ts:104-120`)
-- `audit_logs`'ta olmayan kolonlara yazdığı için THROW ediyordu ve
-- `/repo/file` ile `/repo/files` gerçek Postgres'te 500 veriyordu.
--
-- Repository erişimi artık kanonik `audit_logs` üzerinden kaydedilir
-- (0043'te gerekli kolonlar eklendi). Ayrı bir tablo tutmak, iki farklı
-- audit gerçeği üretiyordu.

-- +up
-- Veri kaybetmemek icin once tasi.
INSERT INTO audit_logs (
  id, organization_id, project_id, actor, actor_principal_id, category,
  feature_id, action, status, metadata, created_at
)
SELECT
  'audit_from_repo_' || r.id,
  'org_default_migration',
  r.project_id,
  COALESCE(r.actor, 'legacy:unknown'),
  'legacy:unverified',
  'repository_access',
  'CORE',
  'READ_CONTEXT_ITEM',
  'authorized',
  jsonb_build_object('migrated_from', 'repo_access_logs', 'path', r.file_path),
  r.created_at
FROM repo_access_logs r
ON CONFLICT (id) DO NOTHING;

DROP TABLE IF EXISTS repo_access_logs;

-- +down
CREATE TABLE IF NOT EXISTS repo_access_logs (
  id VARCHAR(255) PRIMARY KEY,
  project_id VARCHAR(255),
  actor VARCHAR(255),
  file_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
