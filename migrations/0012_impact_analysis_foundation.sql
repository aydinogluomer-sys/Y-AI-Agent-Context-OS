-- Migration 0012
-- Ledger version: 1.1.1-impact-analysis-foundation
--
-- ADR-003 ile apps/api/src/db.ts icindeki inline migrationVersions
-- dizisinden BIREBIR cikarilmistir. Icerik degistirilmemistir.
-- schema_migrations ledger'inda bu dosya yukaridaki version string'i
-- ile kayitlidir; mevcut veritabanlari etkilenmez.

-- +up
CREATE TABLE IF NOT EXISTS impact_reports (
  id VARCHAR(255) PRIMARY KEY,
  project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
  task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE SET NULL,
  changed_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_tests JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_docs JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_routes JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_apis JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_database_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_ui_components JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_prototypes JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk_by_file JSONB NOT NULL DEFAULT '[]'::jsonb,
  overall_risk VARCHAR(50) NOT NULL,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence_score NUMERIC NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_impact_reports_project ON impact_reports(project_id);

-- +down
-- Geri alma bu migration icin tanimlanmamistir (P01 goc turu birebir
-- kopyadir). Down script'leri, sema degistiren yeni migration'lar icin
-- P02'den itibaren zorunludur.
