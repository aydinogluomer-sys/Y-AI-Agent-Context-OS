-- Migration 0040
-- Ledger version: 2.0.4-service-identities
--
-- P02 / Y-P02-010 — Worker ve agent kimlikleri (T-15).
--
-- P00 bulgusu: `workers/index-worker.ts` tüm çağrılar için statik bir
-- INDEX_WORKER_TOKEN bearer'ı kullanıyordu. İmzasız bir worker job claim
-- edebiliyordu.

-- +up
CREATE TABLE IF NOT EXISTS service_identities (
  id VARCHAR(255) PRIMARY KEY,
  organization_id VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind VARCHAR(32) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  public_key TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMP WITH TIME ZONE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT ck_service_identity_kind CHECK (kind IN ('worker', 'agent', 'integration'))
);

CREATE INDEX IF NOT EXISTS idx_service_identities_org ON service_identities(organization_id);
CREATE INDEX IF NOT EXISTS idx_service_identities_active
  ON service_identities(organization_id, kind) WHERE revoked_at IS NULL;

-- +down
DROP INDEX IF EXISTS idx_service_identities_active;
DROP INDEX IF EXISTS idx_service_identities_org;
DROP TABLE IF EXISTS service_identities;
