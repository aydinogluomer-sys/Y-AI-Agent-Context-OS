-- Migration 0037
-- Ledger version: 2.0.1-users
--
-- P02 / Y-P02-004 — OIDC `sub` -> iç kullanıcı eşlemesi.
--
-- P00 bulgusu P0-4: authorization tamamen token claim'iydi. `users` tablosu
-- yoktu; `memberships` tablosu `user_email` tutuyordu ve HİÇ okunmuyordu
-- (0 read, 0 write).

-- +up
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY,
  oidc_issuer VARCHAR(512) NOT NULL,
  oidc_sub VARCHAR(255) NOT NULL,
  email VARCHAR(320),
  display_name VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  disabled_at TIMESTAMP WITH TIME ZONE,
  -- Aynı sub farklı issuer'larda farklı kişidir; benzersizlik ikisi birlikte.
  CONSTRAINT uq_users_issuer_sub UNIQUE (oidc_issuer, oidc_sub)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- +down
DROP INDEX IF EXISTS idx_users_email;
DROP TABLE IF EXISTS users;
