-- Migration 0068
-- Ledger version: 2.5.0-policy-rules
--
-- P07 / Y-P07-001 — Glob tabanlı ALLOW/APPROVAL/DENY kuralları.
--
-- P00 Truth Audit: erişim kontrolü DAĞINIKTI.
--   - `LocalFilesystemRepoAdapter.validatePath` dosya bazında bir
--     denylist uyguluyordu — repository katmanında, retrieval'da değil.
--   - `PermissionKernelService.validateResourceBoundary` YALNIZ BEŞ
--     sabit dosya adına bakıyordu: `.env`, `secrets.json`,
--     `credentials.json`, `*.pem`, `*.key`. Bir `terraform/prod.tfvars`
--     ya da `k8s/secrets.yaml` bu listede yoktu.
--   - Retrieval HİÇBİR policy kontrolü yapmıyordu.
--
--   Sonuç: bir chunk bir kez index'lendiyse retrieval onu aday görebiliyordu.
--
-- ETKİ SIRALAMASI
--   `deny > approval > allow`. Aynı etki içinde EN ÖZGÜL kural kazanır.
--   `priority` yalnızca aynı özgüllükteki kuralları ayırmak için vardır;
--   etki sıralamasını EZEMEZ. Bir `priority` değeriyle DENY'i atlamak
--   mümkün olsaydı, kural yazma yetkisi olan herkes firewall'ı
--   kapatabilirdi.

-- +up
CREATE TABLE IF NOT EXISTS policy_rules (
  id VARCHAR(255) PRIMARY KEY,
  organization_id VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
  policy_version VARCHAR(64) NOT NULL,

  effect VARCHAR(16) NOT NULL,
  resource_glob TEXT NOT NULL,
  -- Kuralin hangi kaynak turune uygulandigi (file, symbol, chunk).
  resource_kind VARCHAR(24) NOT NULL DEFAULT 'file',
  priority INTEGER NOT NULL DEFAULT 0,

  -- Kuralin NEDEN var oldugu. Bos birakilamaz: sebebi yazilmayan bir
  -- DENY, aylar sonra kimsenin kaldirmaya cesaret edemedigi bir kural
  -- haline gelir.
  rationale TEXT NOT NULL,
  created_by VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT ck_policy_rules_effect CHECK (effect IN ('allow', 'approval', 'deny')),
  CONSTRAINT ck_policy_rules_glob CHECK (length(trim(resource_glob)) > 0),
  -- Desteklenmeyen glob sozdizimi VERITABANINDA da reddedilir; uygulama
  -- katmani tek savunma hatti olmamali.
  CONSTRAINT ck_policy_rules_glob_syntax CHECK (resource_glob !~ '[{}()|!+@]'),
  CONSTRAINT uq_policy_rules UNIQUE (organization_id, project_id, policy_version, effect, resource_glob)
);

CREATE INDEX IF NOT EXISTS idx_policy_rules_lookup
  ON policy_rules(organization_id, project_id, policy_version);
CREATE INDEX IF NOT EXISTS idx_policy_rules_effect ON policy_rules(effect);

-- +down
DROP INDEX IF EXISTS idx_policy_rules_effect;
DROP INDEX IF EXISTS idx_policy_rules_lookup;
DROP TABLE IF EXISTS policy_rules;
