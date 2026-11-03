-- =============================================================================
-- B23: fixed cost from a date (FC2), net media (FC4), Melbourne days, stale
-- "currently fixed cost" flag. Snowflake steps for Luke.
-- Run as ACCOUNTADMIN (or the procedure owner) in Snowsight, one part at a time.
-- Not run. Authored 2026-11-03 with read-only queries (CLAUDE_RW).
-- =============================================================================
-- Order against the code deploy and the switches
--   Supabase 0115 before deploying the B23 code (the app reads and writes
--   line_items.fixed_cost_from). Unchanged.
--   PART A  any time before PART B and before fixed_cost_report_net goes on,
--           before or after the code deploy (B23fix). The nightly sync checks
--           the snapshot for the two columns each run: without them it sends
--           the pre-B23 MERGE; with them it names both and writes null while
--           the switches are off.
--   (deploy the code; switches fixed_cost_report_net and fixed_cost_from_date
--    stay off)
--   PART B  after PART A and the deploy, any time: the procedure and the
--           nightly wrapper. Both read the two snapshot columns, so PART A
--           must come first.
--           With both switches off the B23 procedure writes what the old one
--           wrote, except the stale-flag fix (B4).
--   PART C  turn on fixed_cost_report_net at /admin/features, wait for the
--           next 06:00 sync and 06:30 task, then verify.
--   PART D  turn on fixed_cost_from_date. Planners can set dates; the nightly
--           wrapper backfills any line whose date is before the 3-day window.
-- =============================================================================

-- #############################################################################
-- PART A: snapshot columns (any time before PART B and the net switch)
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

-- A rollback (only before PART B, with fixed_cost_report_net off; the sync
-- then goes back to the pre-B23 MERGE on its next run):
--   ALTER TABLE ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT DROP COLUMN FIXED_COST_FROM;
--   ALTER TABLE ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT DROP COLUMN FIXED_COST_BURSTS_JSON;

-- #############################################################################
-- PART B: procedures (after the code deploy, switches still off)
-- #############################################################################

-- B0. Compare the live procedures with the repo copies first. The research
-- role could not read them, so B23 assumes the repo copy is what is live
-- (85% confidence). Run as the owner, copy each result into a text compare
-- against the 9c64b9d2 file (sql/snowflake/mart/procedures/...; also kept at
-- lib/snowflake/__tests__/fixtures/sp_refresh_fixed_cost_reported_daily.2026-09-16.sql).
-- If anything differs beyond whitespace, STOP and send the difference: the
-- B23 file was built on the repo copy.
SELECT GET_DDL('PROCEDURE', 'ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_REPORTED_DAILY(VARCHAR, BOOLEAN)');
SELECT GET_DDL('PROCEDURE', 'ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_NIGHTLY()');
SHOW PROCEDURES LIKE 'SP_REFRESH_FIXED_COST%' IN SCHEMA ASSEMBLEDVIEW.MART;  -- expect exactly the two signatures above

-- B1. Line fact columns the B23 procedure writes (nullable, no default).
ALTER TABLE ASSEMBLEDVIEW.MART.FIXED_COST_LINE_ITEM_FACT
  ADD COLUMN IF NOT EXISTS FIXED_COST_FROM_APPLIED DATE;
ALTER TABLE ASSEMBLEDVIEW.MART.FIXED_COST_LINE_ITEM_FACT
  ADD COLUMN IF NOT EXISTS REPORT_BASIS_APPLIED VARCHAR;
DESCRIBE TABLE ASSEMBLEDVIEW.MART.FIXED_COST_LINE_ITEM_FACT;  -- expect 15 columns, the two new ones last

-- B2. Before snapshot of the facts, for the B5 checks (read only).
SELECT COUNT(*) rows_total, SUM(REPORTED_SPEND) reported_total
FROM ASSEMBLEDVIEW.MART.FIXED_COST_REPORTED_DAILY_FACT;            -- note both
SELECT COUNT(*) AS current_lines
FROM ASSEMBLEDVIEW.MART.FIXED_COST_LINE_ITEM_FACT
WHERE COALESCE(IS_CURRENTLY_FIXED_COST, FALSE) = TRUE;             -- note it

-- B3. Run the whole of sql/snowflake/mart/procedures/sp_refresh_fixed_cost_reported_daily.sql
--     (CREATE OR REPLACE, same signature, so no second overload).
-- B4. Run the whole of sql/snowflake/mart/procedures/sp_refresh_fixed_cost_nightly.sql.
-- CREATE OR REPLACE does not copy grants: re-apply USAGE only if a role other
-- than the owner calls either procedure.

-- B5. Verify with one window call (what the 06:30 task runs first). Expect
-- net_basis_lines 0, fixed_cost_from_lines 0 and stale_fixed_cost_flags_cleared 2
-- (legal003ml1 and trwico001sm1 on 3 Nov; a later count may differ).
CALL ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_REPORTED_DAILY(NULL, FALSE);
SELECT LOWER(LINE_ITEM_ID) lid, IS_CURRENTLY_FIXED_COST, WAS_EVER_FIXED_COST
FROM ASSEMBLEDVIEW.MART.FIXED_COST_LINE_ITEM_FACT
WHERE LOWER(LINE_ITEM_ID) IN ('legal003ml1', 'trwico001sm1');      -- expect FALSE, TRUE on both
SELECT COUNT(*) FROM ASSEMBLEDVIEW.MART.FIXED_COST_LINE_ITEM_FACT
WHERE REPORT_BASIS_APPLIED IS NOT NULL OR FIXED_COST_FROM_APPLIED IS NOT NULL;  -- expect 0

-- #############################################################################
-- PART C: net media and Melbourne days (turn on fixed_cost_report_net)
-- #############################################################################
-- C1. Turn on "Fixed-cost report on net media" at /admin/features.
-- C2. Next morning (sync 06:00, task 06:30 Melbourne) check the snapshot and
--     that every fixed-cost line was backfilled once on the new basis:
SELECT COUNT(*) fixed_cost_lines,
       COUNT(FIXED_COST_BURSTS_JSON) with_net_bursts                 -- expect equal
FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT
WHERE FIXED_COST_MEDIA = TRUE AND COALESCE(ASSUME_SPEND, FALSE) = FALSE;
SELECT COUNT(*) lines_not_on_net_basis                               -- expect 0
FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT s
LEFT JOIN ASSEMBLEDVIEW.MART.FIXED_COST_LINE_ITEM_FACT f ON LOWER(f.LINE_ITEM_ID) = LOWER(s.LINE_ITEM_ID)
WHERE s.FIXED_COST_MEDIA = TRUE AND COALESCE(s.ASSUME_SPEND, FALSE) = FALSE
  AND COALESCE(f.REPORT_BASIS_APPLIED, '') <> 'net_melbourne';
-- C3. Rows on the UTC day before a burst start are gone (306 rows on 76 lines on 3 Nov):
WITH snap AS (
  SELECT LOWER(LINE_ITEM_ID) lid, FIXED_COST_BURSTS_JSON j
  FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT
  WHERE FIXED_COST_MEDIA = TRUE AND FIXED_COST_BURSTS_JSON IS NOT NULL
),
w AS (
  SELECT s.lid, f.value:index::NUMBER bi, f.value:startDay::DATE s_day, f.value:endDay::DATE e_day
  FROM snap s, LATERAL FLATTEN(input => s.j) f
)
SELECT COUNT(*) rows_outside_bursts                                   -- expect 0
FROM ASSEMBLEDVIEW.MART.FIXED_COST_REPORTED_DAILY_FACT d
JOIN snap ON snap.lid = LOWER(d.LINE_ITEM_ID)
LEFT JOIN w ON w.lid = LOWER(d.LINE_ITEM_ID) AND w.bi = d.BURST_INDEX
WHERE COALESCE(d.CAP_APPLIED, '') <> 'assumed_spend'
  AND (w.lid IS NULL OR d.DATE_DAY < w.s_day OR d.DATE_DAY > w.e_day);
-- C4. Net media on the fee-inclusive lines (BOSS010, BOSS011, BOSS008, BICAU006PV1):
SELECT LOWER(LINE_ITEM_ID) lid, BURST_INDEX, BURST_START_DATE, BURST_END_DATE, BURST_BUDGET, BURST_REPORTED_SPEND
FROM ASSEMBLEDVIEW.MART.FIXED_COST_BURST_FACT
WHERE LOWER(LINE_ITEM_ID) IN ('boss010pd1', 'boss010pd2', 'boss011pd1', 'boss011pd2', 'bicau006pv1')
ORDER BY 1, 2;   -- expect BOSS bursts 1 Sep to 30 Sep etc. with BURST_BUDGET 1700.0000 (boss010pd1)
-- Undo C: turn the switch off. The next morning every line is backfilled once
-- back on the gross budget and UTC days.

-- #############################################################################
-- PART D: fixed cost from a date (turn on fixed_cost_from_date, after C)
-- #############################################################################
-- D1. Turn on "Fixed cost from a date" at /admin/features. Planners set dates
--     in new versions (BOSS010 and BOSS011 per decision FC1).
-- D2. The morning after a date is saved, check the line (example boss010pd1):
SELECT LOWER(s.LINE_ITEM_ID) lid, s.FIXED_COST_FROM, f.FIXED_COST_FROM_APPLIED, f.REPORT_BASIS_APPLIED,
       f.LINE_ITEM_TOTAL_BUDGET, f.LINE_ITEM_TOTAL_REPORTED
FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT s
LEFT JOIN ASSEMBLEDVIEW.MART.FIXED_COST_LINE_ITEM_FACT f ON LOWER(f.LINE_ITEM_ID) = LOWER(s.LINE_ITEM_ID)
WHERE LOWER(s.LINE_ITEM_ID) = 'boss010pd1';        -- expect FIXED_COST_FROM = FIXED_COST_FROM_APPLIED
SELECT MIN(DATE_DAY) first_reported_day, COUNT(*) days, SUM(REPORTED_SPEND) reported
FROM ASSEMBLEDVIEW.MART.FIXED_COST_REPORTED_DAILY_FACT
WHERE LOWER(LINE_ITEM_ID) = 'boss010pd1' AND COALESCE(CAP_APPLIED, '') <> 'assumed_spend';
                                                    -- expect first_reported_day = the date
-- D3. Optional, to apply a date at once instead of waiting for 06:30:
-- CALL ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_REPORTED_DAILY('boss010pd1', TRUE);
-- (one line id, never NULL with TRUE).
