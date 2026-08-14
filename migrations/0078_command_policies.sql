-- Migration 0078
-- Ledger version: 2.7.3-command-policies
--
-- P10 / Y-P10-004 — Komut politikasi (T-22: command injection).
--
-- NEDEN AYRI BIR POLITIKA
--   Change Firewall dosya yazimini kontrol eder. Ama bir agent dosya
--   yazmadan da zarar verebilir: `rm -rf`, `git push --force`,
--   `curl | sh`. Bu komutlar dosya sistemine yazmaz ama sonuclari dosya
--   yazmaktan agirdir.
--
-- ALLOWLIST, DENYLIST DEGIL
--   Yasakli komut listesi tutmak, bilinen kotuleri sayip geri kalani
--   serbest birakmaktir — ve yeni bir kotu her zaman vardir. Izin
--   verilen komutlari saymak, bilinmeyeni varsayilan olarak reddeder.
--
--   `denied_argument_patterns` allowlist'in YERINE degil, EK savunma
--   olarak vardir: izin verilen `git` komutu bile `push --force`
--   calistirmamalidir.

-- +up
CREATE TABLE IF NOT EXISTS command_policies (
  id VARCHAR(255) PRIMARY KEY,
  organization_id VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,

  allowed_commands TEXT[] NOT NULL DEFAULT '{}',
  denied_argument_patterns TEXT[] NOT NULL DEFAULT '{}',

  rationale TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_command_policies UNIQUE (organization_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_command_policies_project ON command_policies(project_id);

-- +down
DROP INDEX IF EXISTS idx_command_policies_project;
DROP TABLE IF EXISTS command_policies;
