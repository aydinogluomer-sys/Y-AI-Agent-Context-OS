-- Migration 0045
-- Ledger version: 2.0.9-migrate-legacy-memberships
--
-- P02 / Y-P02-004 — Eski `memberships` verisinin göçü.
--
-- P00 bulgusu: `memberships(id, project_id, user_email, role)` tablosu
-- vardı ama uygulama kodunda 0 okuma / 0 yazma ile TAMAMEN ÖLÜYDÜ.
-- Yine de içinde veri olabilir; sessizce kaybetmiyoruz.
--
-- Göç, e-posta ile eşleşen bir `users` kaydı bulunan satırları taşır.
-- Eşleşmeyenler `orphaned_memberships` tablosunda raporlanır ve migration
-- BAŞARISIZ OLMAZ — operatör bunları elle bağlar (runbook).
--
-- Not: `memberships` tablosu bu migration'da DROP EDİLMEZ. Silme, veri
-- göçü doğrulandıktan sonra ayrı ve onaylı bir adımdır (P19).

-- +up
CREATE TABLE IF NOT EXISTS orphaned_memberships (
  id VARCHAR(255) PRIMARY KEY,
  source_table VARCHAR(64) NOT NULL,
  project_id VARCHAR(255),
  user_email VARCHAR(320),
  role VARCHAR(64),
  reason TEXT NOT NULL,
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Eşleşenleri taşı. Rol adları eski serbest metinden yeni enum'a haritalanır.
INSERT INTO project_memberships (id, project_id, user_id, role)
SELECT
  'pm_' || m.id,
  m.project_id,
  u.id,
  CASE lower(coalesce(m.role, ''))
    WHEN 'admin'      THEN 'maintainer'
    WHEN 'maintainer' THEN 'maintainer'
    WHEN 'owner'      THEN 'maintainer'
    WHEN 'developer'  THEN 'developer'
    WHEN 'reviewer'   THEN 'reviewer'
    ELSE 'viewer'
  END
FROM memberships m
JOIN users u ON lower(u.email) = lower(m.user_email)
JOIN projects p ON p.id = m.project_id
ON CONFLICT (project_id, user_id) DO NOTHING;

-- Eşleşmeyenleri raporla.
INSERT INTO orphaned_memberships (id, source_table, project_id, user_email, role, reason)
SELECT
  'orphan_' || m.id,
  'memberships',
  m.project_id,
  m.user_email,
  m.role,
  CASE
    WHEN u.id IS NULL THEN 'user_email ile eslesen users kaydi yok'
    WHEN p.id IS NULL THEN 'project_id ile eslesen projects kaydi yok'
    ELSE 'bilinmeyen'
  END
FROM memberships m
LEFT JOIN users u ON lower(u.email) = lower(m.user_email)
LEFT JOIN projects p ON p.id = m.project_id
WHERE u.id IS NULL OR p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- +down
DELETE FROM project_memberships WHERE id LIKE 'pm_%';
DROP TABLE IF EXISTS orphaned_memberships;
