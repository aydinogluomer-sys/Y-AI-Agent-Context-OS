-- Migration 0038
-- Ledger version: 2.0.2-org-memberships
--
-- P02 / Y-P02-004 — Organizasyon üyeliği.
-- Rol TOKEN CLAIM'inden değil, BURADAN çözülür (ADR-017).

-- +up
CREATE TABLE IF NOT EXISTS org_memberships (
  id VARCHAR(255) PRIMARY KEY,
  organization_id VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(32) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_org_membership UNIQUE (organization_id, user_id),
  CONSTRAINT ck_org_role CHECK (role IN ('owner', 'admin', 'member', 'viewer'))
);

CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON org_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_org ON org_memberships(organization_id);

-- +down
DROP INDEX IF EXISTS idx_org_memberships_org;
DROP INDEX IF EXISTS idx_org_memberships_user;
DROP TABLE IF EXISTS org_memberships;
