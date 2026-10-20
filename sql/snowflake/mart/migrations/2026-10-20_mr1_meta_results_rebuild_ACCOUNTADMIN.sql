-- MR1 (2026-10-20): fix Meta RESULTS and rebuild 2026 history.
-- Run in Snowsight as ACCOUNTADMIN, AFTER running
-- sql/snowflake/mart/views/vw_pacing_meta.sql (the corrected view).
--
-- Why: VW_PACING_META summed purchase + omni_purchase (the same number twice)
-- with lead and complete_registration. SOCIAL_PACING_FACT rows for Jan to Jul
-- 2026 also carry results from an older loader (fractional, far higher:
-- 288,955 in 2026 vs 22,666 under the corrected rule).
--
-- What: UPDATE results (only) on 'Social - Meta' fact rows from 2026-01-01 that
-- match the view on (date_day, platform_line_item_id = entity_id).
-- Spend, impressions and clicks are not touched. Rows the view can't match
-- (2024 and 2025 history, Krusty Krab test rows) are left as they are.
-- Expect about 2,380 rows to change (checked live 20 Oct, 14:20).
--
-- Before:
-- SELECT ROUND(SUM(results)) FROM ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT
-- WHERE channel = 'Social - Meta' AND date_day >= '2026-01-01';   -- about 288,955

BEGIN;

UPDATE ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT t
SET results = v.results,
    updated_at = CURRENT_TIMESTAMP()
FROM (
  SELECT date_day, entity_id, SUM(results) AS results
  FROM ASSEMBLEDVIEW.MART.VW_PACING_META
  WHERE date_day >= '2026-01-01'
  GROUP BY date_day, entity_id
) v
WHERE t.channel = 'Social - Meta'
  AND t.date_day >= '2026-01-01'
  AND t.date_day = v.date_day
  AND LOWER(TRIM(t.platform_line_item_id)) = v.entity_id
  AND (t.results IS NULL OR ABS(t.results - v.results) > 0.001);

COMMIT;

-- After (expect about 22,700 plus the unmatched test rows):
-- SELECT ROUND(SUM(results)) FROM ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT
-- WHERE channel = 'Social - Meta' AND date_day >= '2026-01-01';
-- And the double count is gone (expect 0 rows):
-- SELECT f.date_day, f.platform_line_item_id, f.results, v.results
-- FROM ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT f
-- JOIN ASSEMBLEDVIEW.MART.VW_PACING_META v
--   ON v.date_day = f.date_day AND v.entity_id = LOWER(TRIM(f.platform_line_item_id))
-- WHERE f.channel = 'Social - Meta' AND f.date_day >= '2026-01-01'
--   AND ABS(f.results - v.results) > 0.001
-- LIMIT 20;
