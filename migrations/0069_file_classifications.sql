-- Migration 0069
-- Ledger version: 2.5.1-file-classifications
--
-- P07 / Y-P07-002 — Dosya sınıflandırmaları.
--
-- Sınıflandırma bir TAHMİNDİR ve tahmin olduğu KAYITLIDIR: `confidence`
-- ve `basis` kolonları, kararın neye dayandığını taşır. Sebebi
-- yazılmayan bir DENY, kimsenin kaldırmaya cesaret edemediği bir kural
-- haline gelir.
--
-- DÜŞÜK GÜVEN DENY DEĞİL APPROVAL ÜRETİR
--   Asimetri bilinçlidir: yanlış bir DENY'in bedeli gecikmedir, yanlış
--   bir ALLOW'un bedeli sızıntıdır. Belirsizken izin vermeye değil,
--   insana sormaya düşülür. `suggested_effect` bu kuralı taşır.

-- +up
CREATE TABLE IF NOT EXISTS file_classifications (
  id VARCHAR(255) PRIMARY KEY,
  organization_id VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  snapshot_id VARCHAR(255) NOT NULL REFERENCES repository_snapshots(id) ON DELETE CASCADE,
  path TEXT NOT NULL,

  kind VARCHAR(24) NOT NULL,
  confidence REAL NOT NULL,
  -- Karar hangi kanita dayandi: "sir dosyasi adlandirma kalibi",
  -- "sir tarayicisi bulgu uretti (P04)", "altyapi dizini"...
  basis TEXT NOT NULL,
  suggested_effect VARCHAR(16) NOT NULL,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT ck_file_classifications_kind CHECK (
    kind IN ('source','test','doc','adr','config','migration','infra','secret','generated','minified','vendor')
  ),
  CONSTRAINT ck_file_classifications_effect CHECK (
    suggested_effect IN ('allow','approval','deny')
  ),
  CONSTRAINT ck_file_classifications_confidence CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT uq_file_classifications UNIQUE (snapshot_id, path)
);

CREATE INDEX IF NOT EXISTS idx_file_classifications_snapshot ON file_classifications(snapshot_id);
-- Universe hesabinin sordugu soru: "bu snapshot'ta DENY/APPROVAL olan
-- dosyalar hangileri?"
CREATE INDEX IF NOT EXISTS idx_file_classifications_restricted
  ON file_classifications(snapshot_id, suggested_effect)
  WHERE suggested_effect <> 'allow';

-- +down
DROP INDEX IF EXISTS idx_file_classifications_restricted;
DROP INDEX IF EXISTS idx_file_classifications_snapshot;
DROP TABLE IF EXISTS file_classifications;
