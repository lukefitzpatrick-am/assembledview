-- DIM_PLAN_MAPPING: stable key for Xano write-through (pacing_mappings.id).
-- Run after base DIM DDL. Adjust if your table already uses a different name.

ALTER TABLE IF EXISTS ASSEMBLEDVIEW.MART_PACING.DIM_PLAN_MAPPING
  ADD COLUMN IF NOT EXISTS XANO_MAPPING_ID NUMBER;

COMMENT ON COLUMN ASSEMBLEDVIEW.MART_PACING.DIM_PLAN_MAPPING.XANO_MAPPING_ID IS
  'Xano pacing_mappings.id — MERGE / upsert key from app (lib/snowflake/pacing-mapping-sync.ts).';

-- Enforce one row per Xano mapping (optional; may fail until backfilled / deduped):
-- ALTER TABLE ASSEMBLEDVIEW.MART_PACING.DIM_PLAN_MAPPING
--   ADD CONSTRAINT UQ_DIM_PLAN_MAPPING_XANO UNIQUE (XANO_MAPPING_ID);
