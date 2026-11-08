-- ASSEMBLEDVIEW.MART.VW_PACING_FACT_CM360_DRIFT
-- Read-only check (C-180, B29). One row per CM360 placement and day where
-- MART.PACING_FACT (channel 'Ad Serving - CM360') does not equal
-- DOUBLE_CLICK_CAMPAIGN_MANAGER.CM_360_PACING summed per placement and day.
-- No rows means the fact matches its source.
--
-- Key: LOWER(TRIM(PLACEMENT)), the value VW_PACING_CM360 writes as ENTITY_ID
-- and the refresh task stores as PLATFORM_LINE_ITEM_ID.
-- DRIFT_KIND:
--   values_differ      both sides have the key and a metric differs, or the
--                      fact has more than one row for it (FACT_ROWS)
--   missing_in_fact    CM360 has the key and PACING_FACT does not
--   missing_in_source  PACING_FACT has the key and CM360 does not
-- Keys loaded by hand into MART.CM360_MANUAL_ROWS (VW_PACING_CM360 unions
-- them in) are left out only when CM360 has no row for that key and day
-- (they would be missing_in_source). A key and day in both raw CM360 and
-- the manual table makes VW_PACING_CM360 double count, so it stays in as
-- drift.
-- IN_REFRESH_WINDOW: the day is inside the task's 14-day MERGE window, so the
-- next 06:30 run rewrites it. Drift outside the window stays until fixed.
-- IMPRESSIONS_RATIO 4.0 on a values_differ row is the C-180 label map fan-out.
--
-- Authored 2026-11-09, not applied. Deploy:
-- migrations/2026-11-09_CD1_pacing_fact_cm360_drift_view_ACCOUNTADMIN.sql
-- (same text, with checks). Not read by any cron or page yet.
USE SCHEMA ASSEMBLEDVIEW.MART;

CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.VW_PACING_FACT_CM360_DRIFT COPY GRANTS (
  DATE_DAY,
  ENTITY_KEY,
  LINE_ITEM_ID,
  DRIFT_KIND,
  IN_REFRESH_WINDOW,
  FACT_ROWS,
  FACT_IMPRESSIONS,
  SOURCE_IMPRESSIONS,
  IMPRESSIONS_RATIO,
  FACT_CLICKS,
  SOURCE_CLICKS,
  FACT_VIDEO_COMPLETIONS,
  SOURCE_VIDEO_COMPLETIONS,
  FACT_RESULTS,
  SOURCE_RESULTS,
  FACT_UPDATED_AT
) AS
WITH src AS (
  -- CM360 as Fivetran lands it, keyed the way VW_PACING_CM360 keys ENTITY_ID.
  SELECT
    p.date::date AS date_day,
    LOWER(TRIM(p.placement)) AS entity_key,
    SUM(p.impressions) AS impressions,
    SUM(p.clicks) AS clicks,
    SUM(p.video_completions) AS video_completions,
    SUM(p.total_conversions) AS results
  FROM ASSEMBLEDVIEW.DOUBLE_CLICK_CAMPAIGN_MANAGER.CM_360_PACING p
  WHERE p.date IS NOT NULL
    AND p.placement IS NOT NULL
    AND TRIM(p.placement) <> ''
  GROUP BY 1, 2
),
manual AS (
  -- Hand-loaded rows (one row per key here, so the LEFT JOIN below cannot
  -- multiply). A manual key/day is left out only when raw CM360 has no row
  -- for it. If raw also has it, VW_PACING_CM360 double counts it, and that
  -- shows here as drift.
  SELECT DISTINCT
    m.date AS date_day,
    LOWER(TRIM(m.placement)) AS entity_key
  FROM ASSEMBLEDVIEW.MART.CM360_MANUAL_ROWS m
),
fact AS (
  SELECT
    f.date_day,
    LOWER(TRIM(f.platform_line_item_id)) AS entity_key,
    MAX(f.line_item_id) AS line_item_id,
    COUNT(*) AS fact_rows,
    SUM(f.impressions) AS impressions,
    SUM(f.clicks) AS clicks,
    SUM(f.video_3s_views) AS video_completions,
    SUM(f.results) AS results,
    MAX(f.updated_at) AS updated_at
  FROM ASSEMBLEDVIEW.MART.PACING_FACT f
  WHERE f.channel = 'Ad Serving - CM360'
  GROUP BY 1, 2
),
joined AS (
  SELECT
    COALESCE(f.date_day, s.date_day) AS date_day,
    COALESCE(f.entity_key, s.entity_key) AS entity_key,
    f.line_item_id,
    CASE
      WHEN f.entity_key IS NULL THEN 'missing_in_fact'
      WHEN s.entity_key IS NULL THEN 'missing_in_source'
      ELSE 'values_differ'
    END AS drift_kind,
    f.fact_rows,
    f.impressions AS fact_impressions,
    s.impressions AS source_impressions,
    f.clicks AS fact_clicks,
    s.clicks AS source_clicks,
    f.video_completions AS fact_video_completions,
    s.video_completions AS source_video_completions,
    f.results AS fact_results,
    s.results AS source_results,
    f.updated_at AS fact_updated_at
  FROM fact f
  FULL OUTER JOIN src s
    ON s.date_day = f.date_day
   AND s.entity_key = f.entity_key
)
SELECT
  j.date_day,
  j.entity_key,
  j.line_item_id,
  j.drift_kind,
  j.date_day >= DATEADD(day, -14, CURRENT_DATE()) AS in_refresh_window,
  j.fact_rows,
  j.fact_impressions,
  j.source_impressions,
  ROUND(j.fact_impressions / NULLIF(j.source_impressions, 0), 4) AS impressions_ratio,
  j.fact_clicks,
  j.source_clicks,
  j.fact_video_completions,
  j.source_video_completions,
  j.fact_results,
  j.source_results,
  j.fact_updated_at
FROM joined j
LEFT JOIN manual m
  ON m.date_day = j.date_day
 AND m.entity_key = j.entity_key
WHERE NOT (j.drift_kind = 'missing_in_source' AND m.entity_key IS NOT NULL)
  AND (
    j.drift_kind <> 'values_differ'
    OR j.fact_rows <> 1
    OR j.fact_impressions IS DISTINCT FROM j.source_impressions
    OR j.fact_clicks IS DISTINCT FROM j.source_clicks
    OR j.fact_video_completions IS DISTINCT FROM j.source_video_completions
    OR ROUND(j.fact_results, 4) IS DISTINCT FROM ROUND(j.source_results, 4)
  );

GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.VW_PACING_FACT_CM360_DRIFT TO ROLE AV_APP_READ_ROLE;
GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.VW_PACING_FACT_CM360_DRIFT TO ROLE CLAUDE_RW;
