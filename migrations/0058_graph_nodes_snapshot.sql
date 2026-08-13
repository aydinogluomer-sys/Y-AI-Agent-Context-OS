-- Migration 0058
-- Ledger version: 2.3.0-graph-nodes-snapshot
--
-- P05 / Y-P05-002 — Graph node'ları bir snapshot'a ve tenant'a bağlanır.
--
-- P00 Truth Audit: `graph_nodes` gerçek ve kalıcı ama
--   1. `snapshot_id` YOK — graph'ın hangi commit'e ait olduğu belirsiz.
--      "Bu bağımlılık hâlâ geçerli mi?" sorusu yanıtlanamıyordu.
--   2. `organization_id` YOK — tenant izolasyonu yalnız `project_id`
--      üzerinden, o da NULL olabiliyor.
--   3. Node'lar `context_items` ve `tasks`'tan üretiliyordu; dosyalardan
--      veya sembollerden değil (ADR-022 bunu tersine çevirir).
--   4. Tekillik kısıtı yok: aynı sync iki kez çalışırsa kopya node.
--
-- MEVCUT SATIRLAR NE OLUYOR
--   Silinmiyor. `snapshot_id IS NULL` olan satırlar ARŞİVDİR: eski
--   `context_items` kaynaklı graf. Yeni okuyucular snapshot predicate'i
--   kullandığı için onları görmez. Tekillik kısıtı bu yüzden PARTIAL
--   index'tir — eski satırları geriye dönük ihlal etmez.

-- +up
ALTER TABLE graph_nodes ADD COLUMN IF NOT EXISTS snapshot_id VARCHAR(255)
  REFERENCES repository_snapshots(id) ON DELETE CASCADE;
ALTER TABLE graph_nodes ADD COLUMN IF NOT EXISTS organization_id VARCHAR(255)
  REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE graph_nodes ADD COLUMN IF NOT EXISTS symbol_id VARCHAR(255)
  REFERENCES symbols(symbol_id) ON DELETE CASCADE;
ALTER TABLE graph_nodes ADD COLUMN IF NOT EXISTS file_id VARCHAR(255)
  REFERENCES files(id) ON DELETE CASCADE;
-- Eski `type` kolonu legacy deger kumesini tasiyor (doc, task, session...).
-- Yeni kume ayri kolonda: eskiyi daraltmak arsiv satirlarini bozardi.
ALTER TABLE graph_nodes ADD COLUMN IF NOT EXISTS node_kind VARCHAR(32);
ALTER TABLE graph_nodes ADD COLUMN IF NOT EXISTS path TEXT;
-- Build sirasinda olculen degerler. Sabit 0.9 atamalari kaldirildi (P00).
ALTER TABLE graph_nodes ADD COLUMN IF NOT EXISTS confidence REAL;

-- Mevcut satirlarin org'unu projeden turet; boylece arsiv satirlari da
-- tenant sorgusuna girer.
UPDATE graph_nodes n
   SET organization_id = p.organization_id
  FROM projects p
 WHERE n.project_id = p.id AND n.organization_id IS NULL;

-- Ayni snapshot'ta ayni turden ayni tanimlayici iki kez olamaz.
-- PARTIAL: yalniz yeni (snapshot'li) satirlara uygulanir.
CREATE UNIQUE INDEX IF NOT EXISTS uq_graph_nodes_snapshot_identity
  ON graph_nodes(snapshot_id, node_kind, node_identifier)
  WHERE snapshot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_graph_nodes_snapshot ON graph_nodes(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_org ON graph_nodes(organization_id);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_symbol ON graph_nodes(symbol_id);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_kind_path ON graph_nodes(snapshot_id, node_kind, path);

-- +down
DROP INDEX IF EXISTS idx_graph_nodes_kind_path;
DROP INDEX IF EXISTS idx_graph_nodes_symbol;
DROP INDEX IF EXISTS idx_graph_nodes_org;
DROP INDEX IF EXISTS idx_graph_nodes_snapshot;
DROP INDEX IF EXISTS uq_graph_nodes_snapshot_identity;
ALTER TABLE graph_nodes DROP COLUMN IF EXISTS confidence;
ALTER TABLE graph_nodes DROP COLUMN IF EXISTS path;
ALTER TABLE graph_nodes DROP COLUMN IF EXISTS node_kind;
ALTER TABLE graph_nodes DROP COLUMN IF EXISTS file_id;
ALTER TABLE graph_nodes DROP COLUMN IF EXISTS symbol_id;
ALTER TABLE graph_nodes DROP COLUMN IF EXISTS organization_id;
ALTER TABLE graph_nodes DROP COLUMN IF EXISTS snapshot_id;
