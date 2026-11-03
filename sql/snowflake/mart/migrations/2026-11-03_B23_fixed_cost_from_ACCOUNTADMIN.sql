-- =============================================================================
-- B23: fixed cost from a date (FC2), net media (FC4), Melbourne days, stale
-- "currently fixed cost" flag. Snowflake steps for Luke.
-- Run as ACCOUNTADMIN (or the procedure owner) in Snowsight, one part at a time.
-- Not run. Authored 2026-11-03 with read-only queries (CLAUDE_RW).
-- =============================================================================
-- Order against the code deploy and the switches
--   PART A  before deploying the B23 code: the nightly sync MERGE names the
--           two new snapshot columns, so the cron fails until they exist.
--   (deploy the code; switches fixed_cost_report_net and fixed_cost_from_date
--    stay off, so the sync writes null into both columns)
--   PART B  after the deploy, any time: the procedure and the nightly wrapper.
--           With both switches off the B23 procedure writes what the old one
--           wrote, except the stale-flag fix (B4).
--   PART C  turn on fixed_cost_report_net at /admin/features, wait for the
--           next 06:00 sync and 06:30 task, then verify.
--   PART D  turn on fixed_cost_from_date. Planners can set dates; the nightly
--           wrapper backfills any line whose date is before the 3-day window.
-- =============================================================================

-- #############################################################################
-- PART A: snapshot columns (before the code deploy)
-- #############################################################################

-- A1. BEFORE (read only). Expect 13 columns, ending ASSUME_SPEND.
DESCRIBE TABLE ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT;

-- A2. CHANGE. Nullable, no default. No row changes.
ALTER TABLE ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT
  ADD COLUMN IF NOT EXISTS FIXED_COST_FROM DATE;

ALTER TABLE ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT
  ADD COLUMN IF NOT EXISTS FIXED_COST_BURSTS_JSON VARIANT;

-- A3. AFTER (read only). Expect 15 columns: FIXED_COST_FROM DATE and
-- FIXED_COST_BURSTS_JSON VARIANT at the end, and both all null.
DESCRIBE TABLE ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT;
SELECT COUNT(*) AS rows_total,
       COUNT(FIXED_COST_FROM) AS with_date,             -- expect 0
       COUNT(FIXED_COST_BURSTS_JSON) AS with_net_bursts  -- expect 0
FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT;

-- A rollback (only before the code deploy):
--   ALTER TABLE ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT DROP COLUMN FIXED_COST_FROM;
--   ALTER TABLE ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT DROP COLUMN FIXED_COST_BURSTS_JSON;
