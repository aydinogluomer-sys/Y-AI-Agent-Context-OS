-- Migration 0061
-- Ledger version: 2.3.3-graph-tombstones
--
-- P05 / Y-P05-006 — Artımlı sync'te silinen node'ların izi.
--
-- NEDEN SİLİNEN ŞEYİN KAYDI TUTULUYOR
--   Eski sync yıkıcıydı: her çalıştırmada `DELETE FROM graph_edges ...`
--   ile ilgili tüm satırlar siliniyor, sonra yeniden yazılıyordu. Bu iki
--   sorun üretiyordu:
--
--     a) Rebuild süresince graf TUTARSIZ. Aynı anda çalışan bir retrieval
--        yarım graf görüyordu ve bunu anlamasının yolu yoktu.
--     b) "Bu bağımlılık neden kayboldu?" sorusu yanıtsız kalıyordu.
--        Silme sessizdi.
--
--   Artımlı sync artık siliyor değil, TOMBSTONE bırakıyor: node kaldırıldı
--   ama neden kaldırıldığı ve hangi build'de kaldırıldığı kayıtlı.
--   P10 Change Firewall bunu "bu sembol silindi" kanıtı olarak kullanır.

-- +up
CREATE TABLE IF NOT EXISTS graph_tombstones (
  id VARCHAR(255) PRIMARY KEY,
  organization_id VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  snapshot_id VARCHAR(255) NOT NULL REFERENCES repository_snapshots(id) ON DELETE CASCADE,
  build_run_id VARCHAR(255) REFERENCES graph_build_runs(id) ON DELETE SET NULL,

  -- Node satiri artik yok; kimligi burada saklanir.
  node_identifier VARCHAR(1055) NOT NULL,
  node_kind VARCHAR(32),
  path TEXT,
  reason VARCHAR(32) NOT NULL,
  -- Kaldirilan node'un kac edge'i vardi: etkinin buyuklugu.
  removed_edge_count INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT ck_graph_tombstones_reason CHECK (
    reason IN ('file_deleted', 'symbol_removed', 'rebuilt', 'unresolved')
  ),
  CONSTRAINT uq_graph_tombstones UNIQUE (snapshot_id, node_identifier)
);

CREATE INDEX IF NOT EXISTS idx_graph_tombstones_snapshot ON graph_tombstones(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_graph_tombstones_build ON graph_tombstones(build_run_id);

-- +down
DROP INDEX IF EXISTS idx_graph_tombstones_build;
DROP INDEX IF EXISTS idx_graph_tombstones_snapshot;
DROP TABLE IF EXISTS graph_tombstones;
