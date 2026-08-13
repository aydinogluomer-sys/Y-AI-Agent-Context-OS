-- Migration 0059
-- Ledger version: 2.3.1-graph-edges-snapshot
--
-- P05 / Y-P05-002, Y-P05-005 — Graph edge'leri snapshot'a bağlanır ve
-- TERS yönlü traversal indekslenir.
--
-- P00 Truth Audit'in edge tarafındaki bulguları:
--   1. `snapshot_id` ve `organization_id` yok.
--   2. Edge'ler `context_chunks` yeniden birleştirilip BAŞTAN parse
--      edilerek üretiliyordu — P04'ün ürettiği semboller kullanılmıyordu.
--   3. Confidence sabit atanıyordu (`0.9`, `0.85`, `0.7`).
--   4. Tekillik kısıtı yok; her sync kopya edge üretebiliyordu. Çözüm
--      olarak sync ÖNCESİ `DELETE FROM graph_edges` yapılıyordu — yani
--      graf, rebuild boyunca tutarsız kalıyordu (ADR-023 bunu kaldırır).
--
-- TERS BAĞIMLILIK NEDEN AYRI EDGE DEĞİL
--   `reverse_depends_on` diye ikinci bir satır yazmak, aynı gerçeği iki
--   yerde tutmaktır: biri güncellenip diğeri unutulduğunda graf kendi
--   içinde çelişir. Ters yön SORGU YÖNÜYLE elde edilir; bunun bedeli
--   `(target_id, edge_kind)` indeksidir ve bu migration onu ekler.

-- +up
ALTER TABLE graph_edges ADD COLUMN IF NOT EXISTS snapshot_id VARCHAR(255)
  REFERENCES repository_snapshots(id) ON DELETE CASCADE;
ALTER TABLE graph_edges ADD COLUMN IF NOT EXISTS organization_id VARCHAR(255)
  REFERENCES organizations(id) ON DELETE CASCADE;
-- Eski `label`/`relationship` kolonlari legacy deger kumesini tasiyor.
ALTER TABLE graph_edges ADD COLUMN IF NOT EXISTS edge_kind VARCHAR(32);
-- OLCULEN guven: cozumleme yontemine ve belirsizlige gore hesaplanir.
ALTER TABLE graph_edges ADD COLUMN IF NOT EXISTS confidence REAL;
-- Edge'in hangi kanittan dogdugu: "import specifier", "test konvansiyonu"...
ALTER TABLE graph_edges ADD COLUMN IF NOT EXISTS derived_from VARCHAR(48);

UPDATE graph_edges e
   SET organization_id = p.organization_id
  FROM projects p
 WHERE e.project_id = p.id AND e.organization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_graph_edges_snapshot_identity
  ON graph_edges(snapshot_id, source, target, edge_kind)
  WHERE snapshot_id IS NOT NULL;

-- Ileri yon traversal.
CREATE INDEX IF NOT EXISTS idx_graph_edges_forward
  ON graph_edges(snapshot_id, source, edge_kind);
-- Ters yon traversal (Y-P05-005). Bu indeks olmadan reverse sorgu
-- tam tablo taramasina dusuyordu.
CREATE INDEX IF NOT EXISTS idx_graph_edges_reverse
  ON graph_edges(snapshot_id, target, edge_kind);
CREATE INDEX IF NOT EXISTS idx_graph_edges_org ON graph_edges(organization_id);

-- +down
DROP INDEX IF EXISTS idx_graph_edges_org;
DROP INDEX IF EXISTS idx_graph_edges_reverse;
DROP INDEX IF EXISTS idx_graph_edges_forward;
DROP INDEX IF EXISTS uq_graph_edges_snapshot_identity;
ALTER TABLE graph_edges DROP COLUMN IF EXISTS derived_from;
ALTER TABLE graph_edges DROP COLUMN IF EXISTS confidence;
ALTER TABLE graph_edges DROP COLUMN IF EXISTS edge_kind;
ALTER TABLE graph_edges DROP COLUMN IF EXISTS organization_id;
ALTER TABLE graph_edges DROP COLUMN IF EXISTS snapshot_id;
