-- Migration 0036
-- Ledger version: 2.0.0-organizations
--
-- P02 / Y-P02-004 — Tenant kökü.
--
-- P00 Truth Audit bulgusu: 42 tablonun 42'sinde de organization_id/tenant_id
-- kolonu yoktu. Cross-tenant izolasyon şema seviyesinde mümkün değildi.
-- Bu migration o kökü kurar; sonraki migration'lar mevcut tablolara
-- organization_id ekler.

-- +up
CREATE TABLE IF NOT EXISTS organizations (
  id VARCHAR(255) PRIMARY KEY,
  slug VARCHAR(128) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

-- Göç sırasında sahipsiz kalan kayıtları bağlamak için varsayılan organizasyon.
-- P20 kabul sürecinde bu kaydın hâlâ veri taşıyıp taşımadığı denetlenir.
INSERT INTO organizations (id, slug, name, metadata_json)
VALUES (
  'org_default_migration',
  'default',
  'Default Organization (migration)',
  '{"created_by":"migration-0036","reason":"pre-tenant data adoption"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- +down
DROP INDEX IF EXISTS idx_organizations_slug;
DROP TABLE IF EXISTS organizations;
