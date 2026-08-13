-- Migration 0011
-- Ledger version: 1.1.0-knowledge-graph-evolution
--
-- ADR-003 ile apps/api/src/db.ts icindeki inline migrationVersions
-- dizisinden BIREBIR cikarilmistir. Icerik degistirilmemistir.
-- schema_migrations ledger'inda bu dosya yukaridaki version string'i
-- ile kayitlidir; mevcut veritabanlari etkilenmez.

-- +up
ALTER TABLE graph_nodes ADD COLUMN IF NOT EXISTS context_item_id VARCHAR(255) REFERENCES context_items(id) ON DELETE SET NULL;
ALTER TABLE graph_nodes ADD COLUMN IF NOT EXISTS task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE graph_nodes ADD COLUMN IF NOT EXISTS node_identifier VARCHAR(1055);
ALTER TABLE graph_nodes ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE graph_edges ADD COLUMN IF NOT EXISTS relationship VARCHAR(100);
ALTER TABLE graph_edges ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- +down
-- Geri alma bu migration icin tanimlanmamistir (P01 goc turu birebir
-- kopyadir). Down script'leri, sema degistiren yeni migration'lar icin
-- P02'den itibaren zorunludur.
