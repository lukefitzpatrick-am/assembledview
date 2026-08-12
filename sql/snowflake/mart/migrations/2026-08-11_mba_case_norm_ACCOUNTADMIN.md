-- =============================================================================
-- MBA / line-item identifier case normalisation (ACCOUNTADMIN)
-- =============================================================================
-- AV_APP_WRITE_ROLE cannot CREATE OR REPLACE these views (OWNERSHIP =
-- ACCOUNTADMIN) and has SELECT-only on PACING_FACT / SOCIAL_PACING_FACT.
-- Run this entire file as ACCOUNTADMIN (or a role that owns MART views + tables).
--
-- Effects:
--   1. MART views LOWER(LINE_ITEM_ID/NAME) + case-insensitive plan-code extract
--   2. Refresh tasks lower label-map coalesced ids/names
--   3. Full-history MERGE into PACING_FACT + SOCIAL_PACING_FACT
--   4. Full-history search refresh (4000 day window)
--   5. Snapshot identity columns lowercased (if not already)
--
-- Raw Fivetran landing schemas are NOT touched.
-- =============================================================================

USE SCHEMA ASSEMBLEDVIEW.MART;

-- ----- Views (source of truth also in sql/snowflake/mart/views/*.sql) -----
-- Paste/run the CREATE OR REPLACE bodies from:
--   vw_pacing_dv360.sql
--   vw_pacing_meta.sql
--   vw_pacing_tiktok.sql
--   vw_pacing_google_search_daily.sql
-- Prefer: npx tsx scripts/snowflake/deploy-mba-case-norm.mjs after granting
-- OWNERSHIP on the four views (+ CREATE VIEW on MART) to AV_APP_WRITE_ROLE,
-- OR run that script while connected as ACCOUNTADMIN by setting
-- SNOWFLAKE_ROLE=ACCOUNTADMIN for the deploy session only.

-- ----- After views are replaced, full-history fact backfill -----
-- (Also embedded in scripts/snowflake/deploy-mba-case-norm.mjs)

-- CALL ASSEMBLEDVIEW.MART.SP_REFRESH_GOOGLESEARCHPACING_ROLLING(4000);

-- Snapshot (AV_APP_WRITE_ROLE can run this independently):
UPDATE ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT
SET
  LINE_ITEM_ID = LOWER(TRIM(LINE_ITEM_ID)),
  MBA_NUMBER = LOWER(TRIM(COALESCE(MBA_NUMBER, ''))),
  LINE_ITEM_NAME = LOWER(TRIM(COALESCE(LINE_ITEM_NAME, '')))
WHERE
  REGEXP_LIKE(COALESCE(LINE_ITEM_ID, ''), '.*[A-Z].*')
  OR REGEXP_LIKE(COALESCE(MBA_NUMBER, ''), '.*[A-Z].*')
  OR REGEXP_LIKE(COALESCE(LINE_ITEM_NAME, ''), '.*[A-Z].*');

-- Verify: uppercase counts should be 0 on ID/NAME for all four tables;
-- row counts must match pre-change; spend-by-MBA must match to the cent.
