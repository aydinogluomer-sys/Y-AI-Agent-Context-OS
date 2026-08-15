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
--
-- [P19/T3] DUZELTME: bu migration HIC CALISMAMISTI.
--
-- Eski hali `r.actor` ve `r.file_path` okuyordu; 0020'nin kurdugu
-- tabloda bu kolonlarin IKISI DE YOK. PostgreSQL kolon atiflarini
-- AYRISTIRMA aninda cozer, bu yuzden tablo BOS olsa bile sorgu patlar.
--
-- Yani 0051 hicbir ortamda basariyla uygulanmadi ve migration zinciri
-- 0051'de duruyordu. Ilk gercek fresh-migration kosusu (T3) bunu
-- yakaladi; oncesinde yalniz dosyalarin VARLIGI dogrulaniyordu.
--
-- Duzeltme gercek kolonlari kullanir:
--   r.actor      -> yok; sabit 'legacy:unknown' (uydurma bir aktor
--                   yazmak, audit aktorunu sahtelemek olurdu)
--   r.file_path  -> r.path_redacted
--
-- Duzenleme guvenli: basariyla uygulanmis bir kurulum YOK.
-- Veri kaybetmemek icin once tasi.
INSERT INTO audit_logs (
  id, organization_id, project_id, actor, actor_principal_id, category,
  feature_id, action, status, metadata, created_at
)
SELECT
  'audit_from_repo_' || r.id,
  'org_default_migration',
  r.project_id,
  'legacy:unknown',
  'legacy:unverified',
  'repository_access',
  'CORE',
  'READ_CONTEXT_ITEM',
  'authorized',
  jsonb_build_object('migrated_from', 'repo_access_logs', 'path', r.path_redacted),
  r.created_at
FROM repo_access_logs r
ON CONFLICT (id) DO NOTHING;

DROP TABLE IF EXISTS repo_access_logs;

-- +down
--
-- [P19/T3] DUZELTME: geri alma 0020'nin SEMASINI kurmali.
--
-- Eski hali farkli bir sema kuruyordu (actor, file_path). Geri alma,
-- tabloyu KURULDUGU haline dondurmezse sema sapmasi uretir ve bir
-- sonraki ileri migration baska bir tablo gorur.
CREATE TABLE IF NOT EXISTS repo_access_logs (
  id VARCHAR(100) PRIMARY KEY,
  project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id VARCHAR(100) REFERENCES tasks(id) ON DELETE SET NULL,
  adapter_kind VARCHAR(50) NOT NULL,
  operation VARCHAR(100) NOT NULL,
  path_redacted TEXT NOT NULL,
  result_status VARCHAR(50) NOT NULL,
  warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_repo_access_logs_project ON repo_access_logs(project_id);
