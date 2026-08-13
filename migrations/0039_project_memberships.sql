-- Migration 0039
-- Ledger version: 2.0.3-project-memberships
--
-- P02 / Y-P02-004 — Proje üyeliği.
--
-- P00 bulgusu P0-4: `apps/api/src/auth.ts:419` ZATEN bu tabloyu
-- (`project_memberships(project_id, user_id)`) sorguluyordu — ama tablo yoktu.
-- Hata `catch {}` ile yutuluyor ve fonksiyon kalıcı olarak `false` dönüyordu.
-- Üstelik fonksiyon hiç çağrılmıyordu.

-- +up
CREATE TABLE IF NOT EXISTS project_memberships (
  id VARCHAR(255) PRIMARY KEY,
  project_id VARCHAR(255) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(32) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_project_membership UNIQUE (project_id, user_id),
  CONSTRAINT ck_project_role CHECK (role IN ('maintainer', 'developer', 'reviewer', 'viewer'))
);

CREATE INDEX IF NOT EXISTS idx_project_memberships_user ON project_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_project_memberships_project ON project_memberships(project_id);

-- +down
DROP INDEX IF EXISTS idx_project_memberships_project;
DROP INDEX IF EXISTS idx_project_memberships_user;
DROP TABLE IF EXISTS project_memberships;
