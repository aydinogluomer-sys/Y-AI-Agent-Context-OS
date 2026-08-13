-- Migration 0047
-- Ledger version: 2.1.1-repository-connections
--
-- P03 / Y-P03-012 — Kimlik bilgisi referansları.
--
-- KRİTİK: bu tablo kimlik bilgisinin KENDİSİNİ TUTMAZ, secret manager
-- referansını tutar. P00 bulgusu P0-2, düz metin parolayı diske yazan bir
-- endpoint'ti; aynı hatayı şemada tekrarlamıyoruz (ADR-073).

-- +up
CREATE TABLE IF NOT EXISTS repository_connections (
  id VARCHAR(255) PRIMARY KEY,
  repository_id VARCHAR(255) NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  -- Secret manager'daki gizli anahtarin REFERANSI (or. "vault://y/gh/abc").
  -- Token/parola degeri BURAYA YAZILMAZ.
  credential_ref TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_verified_at TIMESTAMP WITH TIME ZONE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  -- Referans bir sirra BENZEMEMELI. Uzun base64/hex dizileri reddedilir:
  -- birinin yanlislikla token yapistirmasini sema seviyesinde yakalar.
  CONSTRAINT ck_credential_ref_is_reference CHECK (
    credential_ref ~ '^[a-z][a-z0-9+.-]*://' AND length(credential_ref) < 512
  )
);

CREATE INDEX IF NOT EXISTS idx_repository_connections_repo ON repository_connections(repository_id);

-- +down
DROP INDEX IF EXISTS idx_repository_connections_repo;
DROP TABLE IF EXISTS repository_connections;
