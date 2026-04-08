-- =============================================================================
-- DIM_PLAN_MAPPING — AV line item code for match_type = suffix_id
-- =============================================================================
-- Run after base DIM exists. Lexical order: before 12_fact_delivery_daily.sql
-- so column is present for any later objects that reference it.
--
-- Rule: For MATCH_TYPE = 'suffix_id', CAMPAIGN_NAME_PATTERN and GROUP_NAME_PATTERN
-- are ignored; AV_LINE_ITEM_CODE must be populated (enforced in app / Xano).
-- =============================================================================

ALTER TABLE IF EXISTS ASSEMBLEDVIEW.MART_PACING.DIM_PLAN_MAPPING
  ADD COLUMN IF NOT EXISTS AV_LINE_ITEM_CODE VARCHAR
  COMMENT 'Suffix code appended to ad group / asset group names after the last "-". Used by match_type = ''suffix_id''. Source of truth: line item / container code from Xano (see lib/snowflake/pacing-mapping-sync.ts).';

COMMENT ON COLUMN ASSEMBLEDVIEW.MART_PACING.DIM_PLAN_MAPPING.MATCH_TYPE IS
  'exact | prefix | regex | suffix_id. When suffix_id: campaign/group patterns are ignored; match on REGEXP_SUBSTR(group_name, ''[^-]+$'') = AV_LINE_ITEM_CODE for ad_group / asset_group rows.';

ALTER TABLE ASSEMBLEDVIEW.MART_PACING.DIM_PLAN_MAPPING
  CLUSTER BY (PLATFORM, IS_ACTIVE, CLIENTS_ID, AV_LINE_ITEM_CODE);

-- Optional after backfilling AV_LINE_ITEM_CODE for suffix_id rows:
-- ALTER TABLE ASSEMBLEDVIEW.MART_PACING.DIM_PLAN_MAPPING
--   ADD CONSTRAINT CHK_DIM_PLAN_MAPPING_SUFFIX_CODE CHECK (
--     MATCH_TYPE IS NULL OR MATCH_TYPE <> 'suffix_id' OR
--     (AV_LINE_ITEM_CODE IS NOT NULL AND LENGTH(TRIM(AV_LINE_ITEM_CODE)) > 0)
--   );
