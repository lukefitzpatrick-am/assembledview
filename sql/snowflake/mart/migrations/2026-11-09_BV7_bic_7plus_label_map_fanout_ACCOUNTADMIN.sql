-- =============================================================================
-- BV7: put the BIC Unmatchable 7plus BVOD CM360 rows back to 1x CM360.
-- Run as ACCOUNTADMIN in Snowsight, top to bottom.
-- APPLIED: Luke ran the UPDATE below (same text) as ACCOUNTADMIN on
-- 2026-11-09 at 09:50:03 AEDT (query 01c8487a-0004-793c-0001-6cb2026d73ae).
-- It changed 15 rows. A second run changes 0 rows (see Re-run).
-- Checked live with CLAUDE_RW (SELECT only) on 2026-11-09 about 10:05 AEDT.
-- =============================================================================
-- Issue (C-180)
--   MART.PACING_FACT, channel 'Ad Serving - CM360', lines bicau002bv2, bv3 and
--   bv4, held exactly 4x CM360's impressions, clicks and completions on
--   4 Aug and 6 to 9 Aug 2026: 15 rows, 191,748 impressions against 47,937 in
--   CM_360_PACING (+143,811).
--
-- Cause
--   MART.LINE_ITEM_LABEL_MAP held four active copies of each BIC placement row
--   (inserted 17 Aug). TSK_REFRESH_PACING_FACT LEFT JOINs the map in its
--   relabel CTE, then its deduped CTE SUMs impressions, clicks, results and
--   video_3s_views per key, so each copy added the day once more. The nightly
--   MERGE rewrote each day for 14 days while the map had 4 copies. The copies
--   were removed on 21 Sep, after those days had left the 14-day window, so the
--   4x values stayed. Row UPDATED_AT values confirm it. The map has no active
--   duplicate keys today (68 active rows, 68 keys).
--
-- Fix
--   This file: set the 15 rows back to the CM360 sums for the same placement
--   and day. Structural: a reader of the map must keep one row per
--   (channel, platform id) before it can multiply anything. Done for
--   VW_PLATFORM_SPEND_LINE_MONTH (LM1). Pending for both refresh tasks until
--   the repo files are compared with live GET_DDL (C-180). Detection:
--   MART.VW_PACING_FACT_CM360_DRIFT (CD1).
--
-- Measured 2026-11-09
--   Before check (step 1) as of just before Luke's UPDATE (time travel,
--   BEFORE(STATEMENT => '01c8487a-0004-793c-0001-6cb2026d73ae')):
--     15 rows, fact 191,748 impressions, CM360 47,937, ratio 4.000000 on every row
--   Before check now: 0 rows (already applied).
--   After check (step 3) now:
--     bicau002bv2 154,863 | bicau002bv3 154,935 | bicau002bv4 154,845
--     bv4 includes 1 impression from cake_ezreach on 4 Aug (not a 4x row).
--     Every 4 to 9 Aug row equals CM360 (ratio 1).
--
-- Left as it is (question for Luke)
--   FIXED_COST_REPORTED_DAILY_FACT.ACTUAL_DELIVERABLES for bv2 to bv4 still
--   holds the 4x values for 6 to 9 Aug (locked rows; for example bv2 6 Aug
--   10,040 against 2,510). REPORTED_SPEND on those days is time based
--   (104.32 a day) and does not move. Optional step 4 rebuilds the three lines.
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE SCHEMA ASSEMBLEDVIEW.MART;

-- ----- 1. Before -------------------------------------------------------------
-- expect 15 rows, ratio 4 on every row (0 rows once applied):
-- WITH r AS (
--   SELECT date, LOWER(TRIM(placement)) ent, SUM(impressions) imps
--   FROM ASSEMBLEDVIEW.DOUBLE_CLICK_CAMPAIGN_MANAGER.CM_360_PACING GROUP BY 1, 2)
-- SELECT f.line_item_id, f.date_day, f.entity_name, f.impressions, r.imps,
--        f.impressions / NULLIF(r.imps, 0) AS ratio, f.updated_at
-- FROM ASSEMBLEDVIEW.MART.PACING_FACT f
-- JOIN r ON r.date = f.date_day AND r.ent = LOWER(TRIM(f.entity_name))
-- WHERE f.channel = 'Ad Serving - CM360'
--   AND f.line_item_id IN ('bicau002bv2', 'bicau002bv3', 'bicau002bv4')
--   AND f.date_day BETWEEN '2026-08-04' AND '2026-08-09'
--   AND f.impressions = 4 * r.imps
-- ORDER BY 1, 2, 3;

-- ----- 2. Correction ---------------------------------------------------------
-- No transaction or backup needed: one statement, and the 4x guard in the
-- WHERE means it only touches rows that are still exactly 4x CM360.
update ASSEMBLEDVIEW.MART.PACING_FACT f
set impressions = r.imps, clicks = r.clk, video_3s_views = r.vc, updated_at = current_timestamp()
from (select date, lower(trim(placement)) ent, sum(impressions) imps, sum(clicks) clk, sum(video_completions) vc
      from ASSEMBLEDVIEW.DOUBLE_CLICK_CAMPAIGN_MANAGER.CM_360_PACING group by 1,2) r
where r.date = f.date_day and r.ent = lower(trim(f.entity_name))
  and f.channel = 'Ad Serving - CM360'
  and f.line_item_id in ('bicau002bv2','bicau002bv3','bicau002bv4')
  and f.date_day between '2026-08-04' and '2026-08-09'
  and f.impressions = 4 * r.imps;
-- expect 15 rows updated on the first run, 0 on any later run.

-- ----- 3. After --------------------------------------------------------------
-- a) Line totals (expect bv2 154,863, bv3 154,935, bv4 154,845):
-- SELECT line_item_id, SUM(impressions) imps, SUM(clicks) clk, SUM(video_3s_views) vc
-- FROM ASSEMBLEDVIEW.MART.PACING_FACT
-- WHERE channel = 'Ad Serving - CM360'
--   AND line_item_id IN ('bicau002bv2', 'bicau002bv3', 'bicau002bv4')
-- GROUP BY 1 ORDER BY 1;
--
-- b) Every 4 to 9 Aug row equals CM360 (expect 0 rows):
-- WITH r AS (
--   SELECT date, LOWER(TRIM(placement)) ent, SUM(impressions) imps, SUM(clicks) clk,
--          SUM(video_completions) vc
--   FROM ASSEMBLEDVIEW.DOUBLE_CLICK_CAMPAIGN_MANAGER.CM_360_PACING GROUP BY 1, 2)
-- SELECT f.line_item_id, f.date_day, f.entity_name, f.impressions, r.imps
-- FROM ASSEMBLEDVIEW.MART.PACING_FACT f
-- LEFT JOIN r ON r.date = f.date_day AND r.ent = LOWER(TRIM(f.entity_name))
-- WHERE f.channel = 'Ad Serving - CM360'
--   AND f.line_item_id IN ('bicau002bv2', 'bicau002bv3', 'bicau002bv4')
--   AND f.date_day BETWEEN '2026-08-04' AND '2026-08-09'
--   AND (f.impressions IS DISTINCT FROM r.imps OR f.clicks IS DISTINCT FROM r.clk
--        OR f.video_3s_views IS DISTINCT FROM r.vc);
--
-- c) The map still has no duplicate active keys (expect 0 rows):
-- SELECT LOWER(TRIM(channel)) c, LOWER(TRIM(platform_line_item_id)) p, COUNT(*) n
-- FROM ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP WHERE is_active = TRUE
-- GROUP BY 1, 2 HAVING COUNT(*) > 1;

-- ----- Re-run ----------------------------------------------------------------
-- Safe. A corrected row has impressions = 1x CM360, so "f.impressions =
-- 4 * r.imps" is false and the UPDATE changes 0 rows. The one exception is a
-- row with 0 impressions in both (0 = 4 * 0): it would be set to the same
-- values again. None of the 15 rows is like that.

-- ----- 4. Optional: fixed-cost report for the three lines --------------------
-- FIXED_COST_REPORTED_DAILY_FACT locks rows after 3 days, so the nightly proc
-- will not pick up the corrected deliverables on its own. A filtered backfill
-- recomputes one line (lowercase id; never a null id with TRUE). Run only if
-- you want ACTUAL_DELIVERABLES on those days to match:
-- CALL ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_REPORTED_DAILY('bicau002bv2', TRUE);
-- CALL ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_REPORTED_DAILY('bicau002bv3', TRUE);
-- CALL ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_REPORTED_DAILY('bicau002bv4', TRUE);
-- expect 6 Aug: bv2 2,510, bv3 3,656, bv4 3,261:
-- SELECT LOWER(line_item_id) lid, date_day, actual_deliverables, reported_spend
-- FROM ASSEMBLEDVIEW.MART.FIXED_COST_REPORTED_DAILY_FACT
-- WHERE LOWER(line_item_id) IN ('bicau002bv2', 'bicau002bv3', 'bicau002bv4')
--   AND date_day BETWEEN '2026-08-05' AND '2026-08-12'
-- ORDER BY 1, 2;
