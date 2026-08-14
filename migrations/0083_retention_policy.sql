-- Migration 0083
-- Ledger version: 3.0.0-retention-policy
--
-- P18 / Y-P18-011 — SAKLAMA (RETENTION) POLİTİKASI
--
-- Master plan §53 her tablo için lifecycle ve retention kararı istiyor.
-- P17 denetiminde bu karar HİÇ VERİLMEMİŞTİ: graph tombstone'ları
-- (ADR-023), olay kayıtları (ADR-048) ve span/log verisi sınırsız büyüyor.
--
-- ## Tasarım kararı: politika VERİDİR, kod değil
--
-- Saklama süreleri bir tabloda tutulur, koda gömülmez. Gerekçe: saklama
-- süresi bir **uyum (compliance) parametresidir** ve kuruluşa göre
-- değişir. Koda gömmek, her değişiklik için sürüm çıkmayı gerektirirdi.
--
-- ## Kanıt tabloları SİLİNMEZ
--
-- `evidence_chain`, `run_events` ve `cas_blobs` için varsayılan saklama
-- **süresizdir** (`NULL`). Bunlar ürünün ana iddiasının dayanağıdır:
-- silinen bir kanıt, doğrulanamayan bir geçmiş demektir.
--
-- Bir kuruluş yasal olarak silmek zorundaysa bunu AÇIKÇA yapılandırır —
-- ama varsayılan asla sessiz silme olamaz.

-- +up

CREATE TABLE IF NOT EXISTS retention_policies (
  table_name        VARCHAR(255) PRIMARY KEY,
  -- NULL = SÜRESİZ SAKLA. Sıfır değil: sıfır "hemen sil" demek olurdu ve
  -- yanlışlıkla yazılan bir sıfır tüm kanıtı silerdi.
  retain_days       INTEGER,
  -- Silme mi arşivleme mi. Kanıt tabloları için `archive` zorunlu.
  disposition       VARCHAR(32)  NOT NULL DEFAULT 'delete',
  -- Neden bu süre? Boş bırakılamaz: gerekçesiz bir saklama süresi,
  -- sonradan kimsenin değiştirmeye cesaret edemediği bir sayıya dönüşür.
  rationale         TEXT         NOT NULL,
  enabled           BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT retention_disposition_valid
    CHECK (disposition IN ('delete', 'archive')),
  -- Negatif ya da sıfır gün kabul edilmez.
  CONSTRAINT retention_days_positive
    CHECK (retain_days IS NULL OR retain_days > 0)
);

COMMENT ON TABLE retention_policies IS
  'P18/Y-P18-011. Saklama politikasi VERIDIR, koda gomulu degildir. '
  'retain_days NULL = suresiz sakla. enabled=FALSE varsayilan: politika '
  'tanimlamak ile UYGULAMAK ayri kararlardir.';

-- Politikalar VARSAYILAN OLARAK KAPALI (`enabled = FALSE`).
--
-- Tanımlamak ile uygulamak ayrı kararlardır: bir migration'ın veri
-- silmeye başlaması, operatörün haberi olmadan geri alınamaz bir işlem
-- yapmasıdır.
INSERT INTO retention_policies (table_name, retain_days, disposition, rationale, enabled)
VALUES
  -- --- KANIT: süresiz -------------------------------------------------
  ('evidence_chain', NULL, 'archive',
   'Kanit zinciri urunun ana iddiasinin dayanagi. Silinen kanit, '
   'dogrulanamayan bir gecmis demektir. Yasal zorunluluk varsa ACIKCA '
   'yapilandirilir.', FALSE),
  ('run_events', NULL, 'archive',
   'Her durum gecisi bir olaydir (ADR-048) ve zincir butunlugunun '
   'parcasidir. Bir olayin silinmesi sira boslugu birakir ve bu, '
   'disaridan bir saldiridan ayirt edilemez.', FALSE),
  ('cas_blobs', NULL, 'archive',
   'Manifest ve artifact icerigi. Hash ile atif yapilan bir blob '
   'silinirse kanit dogrulanamaz hale gelir.', FALSE),
  ('audit_logs', NULL, 'archive',
   'Denetim kaydi. Aktoru dogrulanmis her islem burada; silmek '
   'sorumlulugu ortadan kaldirir.', FALSE),

  -- --- YENİDEN ÜRETİLEBİLİR: sınırlı ----------------------------------
  ('graph_tombstones', 90, 'delete',
   'Tombstone, artimli senkronizasyonun yikici olmamasi icin tutulur '
   '(ADR-023). Bir tombstone''a atif yapan manifest 90 gunden eskiyse '
   'zaten arsivlenmis olur.', FALSE),
  ('jobs', 30, 'delete',
   'Tamamlanmis/basarisiz isler. Is kaydi kanit degildir; kanit '
   'run_events''tedir. 30 gun teshis icin yeterli.', FALSE),
  ('index_jobs', 30, 'delete',
   'Ayni gerekce. Index yeniden uretilebilir.', FALSE),
  ('incremental_index_events', 30, 'delete',
   'Teshis verisi; kaynak repository''den yeniden uretilebilir.', FALSE)
ON CONFLICT (table_name) DO NOTHING;

-- Süresi dolmuş kayıtları BULAN görünüm.
--
-- Görünüm yalnız RAPORLAR, silmez. Silme işlemi açık bir operatör
-- eylemidir: bir migration'ın veri silmesi, çalıştıran kişinin
-- beklemediği bir sonuçtur.
CREATE OR REPLACE VIEW retention_candidates AS
SELECT
  p.table_name,
  p.retain_days,
  p.disposition,
  p.enabled,
  CASE
    WHEN p.retain_days IS NULL THEN 'SURESIZ - silinmez'
    WHEN NOT p.enabled        THEN 'POLITIKA KAPALI - silinmez'
    ELSE 'aday'
  END AS status
FROM retention_policies p;

COMMENT ON VIEW retention_candidates IS
  'P18/Y-P18-011. Bu gorunum RAPORLAR, SILMEZ. Silme acik bir operator '
  'eylemidir; bir migration''in veri silmesi calistiran kisinin '
  'beklemedigi bir sonuctur.';

CREATE INDEX IF NOT EXISTS idx_retention_policies_enabled
  ON retention_policies (enabled)
  WHERE enabled = TRUE;

-- +down

-- Geri alma tabloyu DUSURUR ama hicbir VERIYI silmez: politikalar
-- veriyi silmiyordu zaten (enabled = FALSE varsayilan). Bu, geri
-- almanin guvenli oldugu ender durumlardan biri.
DROP VIEW IF EXISTS retention_candidates;
DROP INDEX IF EXISTS idx_retention_policies_enabled;
DROP TABLE IF EXISTS retention_policies;
