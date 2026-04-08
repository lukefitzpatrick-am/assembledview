-- =============================================================================
-- DIM_PLAN_MAPPING.CREATED_VIA — mirrors Xano pacing_mappings.created_via
-- =============================================================================
-- Values: 'manual' | 'search_sync' (application-defined; NULL for legacy rows).
-- =============================================================================

ALTER TABLE IF EXISTS ASSEMBLEDVIEW.MART_PACING.DIM_PLAN_MAPPING
  ADD COLUMN IF NOT EXISTS CREATED_VIA VARCHAR(32);

COMMENT ON COLUMN ASSEMBLEDVIEW.MART_PACING.DIM_PLAN_MAPPING.CREATED_VIA IS
  'Origin: manual vs search_sync. Mirrors Xano pacing_mappings.created_via.';
