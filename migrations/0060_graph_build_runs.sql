-- Migration 0060
-- Ledger version: 2.3.2-graph-build-runs
--
-- P05 / Y-P05-003, Y-P05-008 — Graph build çalıştırmalarının kaydı.
--
-- NEDEN BU TABLO VAR
--   1. P06 retrieval'ın bilmesi gereken bir şey var: bu snapshot'ın
--      graf'ı TAM MI? Yarıda kalmış bir build, eksik edge'lerle
--      "başarılı" görünen bir graf bırakır ve retrieval sessizce yanlış
--      context üretir. `status` bu soruyu yanıtlar.
--   2. `unresolved_imports` ÖLÇÜLEN bir metriktir. Eski kod çözülemeyen
--      import'ları `console.warn` ile geçiyordu (packages/graph L1094);
--      uyarı kimse tarafından okunmuyordu. Sayı burada durur ve eşiği
--      aşarsa index sağlığı `degraded` olur.
--   3. Artımlı build'in gerçekten artımlı olduğu buradan ölçülür:
--      `touched_node_count` / `node_count`.

-- +up
CREATE TABLE IF NOT EXISTS graph_build_runs (
  id VARCHAR(255) PRIMARY KEY,
  organization_id VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
  snapshot_id VARCHAR(255) NOT NULL REFERENCES repository_snapshots(id) ON DELETE CASCADE,

  status VARCHAR(16) NOT NULL,
  mode VARCHAR(16) NOT NULL,

  node_count INTEGER NOT NULL DEFAULT 0,
  edge_count INTEGER NOT NULL DEFAULT 0,
  -- Artimli build'de dokunulan node sayisi. Tam build'de node_count'a esit.
  touched_node_count INTEGER NOT NULL DEFAULT 0,
  tombstone_count INTEGER NOT NULL DEFAULT 0,
  -- Cozulemeyen import sayisi ve toplam import sayisi: oran hesaplanabilsin.
  unresolved_imports INTEGER NOT NULL DEFAULT 0,
  total_imports INTEGER NOT NULL DEFAULT 0,

  duration_ms INTEGER,
  error TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT ck_graph_build_runs_status CHECK (status IN ('running', 'completed', 'failed')),
  CONSTRAINT ck_graph_build_runs_mode CHECK (mode IN ('full', 'incremental')),
  CONSTRAINT ck_graph_build_runs_counts CHECK (
    node_count >= 0 AND edge_count >= 0 AND unresolved_imports >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_graph_build_runs_snapshot ON graph_build_runs(snapshot_id);
-- P06'nin sordugu soru: "bu snapshot'in SON BASARILI build'i hangisi?"
CREATE INDEX IF NOT EXISTS idx_graph_build_runs_completed
  ON graph_build_runs(snapshot_id, finished_at DESC) WHERE status = 'completed';

-- +down
DROP INDEX IF EXISTS idx_graph_build_runs_completed;
DROP INDEX IF EXISTS idx_graph_build_runs_snapshot;
DROP TABLE IF EXISTS graph_build_runs;
