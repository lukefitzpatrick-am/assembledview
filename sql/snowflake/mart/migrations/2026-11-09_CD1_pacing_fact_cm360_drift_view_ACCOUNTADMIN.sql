-- =============================================================================
-- CD1 (B29): MART.VW_PACING_FACT_CM360_DRIFT, a read-only check that
-- PACING_FACT 'Ad Serving - CM360' equals CM360 per placement and day.
-- Run as ACCOUNTADMIN in Snowsight, top to bottom. New view and grants only; no
-- table changes. Measured live 2026-11-09 with CLAUDE_RW (SELECT only). Not run.
-- Same text as sql/snowflake/mart/views/vw_pacing_fact_cm360_drift.sql (that
-- file stays the source; a test keeps the two copies equal).
-- =============================================================================
-- Why
--   PACING_FACT held 4x CM360 for the BIC 7plus BVOD lines from mid August to
--   9 Nov and nothing flagged it (C-180). This view returns every placement and
--   day where the fact and CM360 disagree, so the next one shows up the day
--   after it lands.
--
-- Owner's rights: the view reads MART.CM360_MANUAL_ROWS, which CLAUDE_RW cannot
-- read. Created by ACCOUNTADMIN, the view can.
--
-- Measured 2026-11-09 (the SELECT body run as CLAUDE_RW; manual keys taken as
-- the VW_PACING_CM360 keys whose sums differ from CM_360_PACING, because
-- CLAUDE_RW cannot read CM360_MANUAL_ROWS: 448 keys, the Sinch Quantcast load)
--   Now: 0 rows. CM360 66,020 keys, PACING_FACT 66,468 keys (66,020 + 448).
--   Just before Luke's BV7 UPDATE (time travel on PACING_FACT,
--   BEFORE(STATEMENT => '01c8487a-0004-793c-0001-6cb2026d73ae')): 15 rows,
--   all values_differ, all ratio 4.0000, nothing else:
--     bicau002bv2 5 rows 67,768 vs 16,942 | bv3 5 rows 64,020 vs 16,005 |
--     bv4 5 rows 59,960 vs 14,990 (4 to 9 Aug 2026)
--   Manual keys (derived as above, which also counts an overlap): 448, 0 also
--   in raw CM360. The view leaves out the 448 missing_in_source rows only.
--   Overlap control: with three of those keys also given a 1-impression raw
--   row, the old wholesale exclusion returned 0 rows and this body returns
--   the 3 as values_differ (B29fix, review L-3).
--
-- Not done here (question for Luke): no cron, page or digest reads this view.
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE SCHEMA ASSEMBLEDVIEW.MART;

-- ----- Before ----------------------------------------------------------------
-- expect no rows:
-- SHOW VIEWS LIKE 'VW_PACING_FACT_CM360_DRIFT' IN SCHEMA ASSEMBLEDVIEW.MART;

-- ----- 1. View and grants ----------------------------------------------------
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

-- ----- After -----------------------------------------------------------------
-- a) expect 0 rows today (15 BIC rows before BV7):
-- SELECT * FROM ASSEMBLEDVIEW.MART.VW_PACING_FACT_CM360_DRIFT ORDER BY date_day, entity_key;
--
-- b) Manual keys. b1: how many there are, and how many raw CM360 also has
--    (expect 448 or more keys, 0 also in raw today; SQ1 says they must not
--    overlap). b2: view rows on a manual key (expect the b1 also_in_raw
--    count, so 0 today). Each overlap shows in the view unless its manual
--    rows add nothing to the metrics. A manual key with no raw row is the
--    only thing the view leaves out.
-- SELECT COUNT(*) AS manual_keys, COUNT_IF(r.k IS NOT NULL) AS also_in_raw
-- FROM (SELECT DISTINCT date AS d, LOWER(TRIM(placement)) AS k
--       FROM ASSEMBLEDVIEW.MART.CM360_MANUAL_ROWS) m
-- LEFT JOIN (SELECT DISTINCT date::date AS d, LOWER(TRIM(placement)) AS k
--            FROM ASSEMBLEDVIEW.DOUBLE_CLICK_CAMPAIGN_MANAGER.CM_360_PACING
--            WHERE placement IS NOT NULL AND TRIM(placement) <> '') r
--   ON r.d = m.d AND r.k = m.k;
-- SELECT COUNT(*) FROM ASSEMBLEDVIEW.MART.VW_PACING_FACT_CM360_DRIFT d
-- WHERE EXISTS (SELECT 1 FROM ASSEMBLEDVIEW.MART.CM360_MANUAL_ROWS m
--               WHERE m.date = d.date_day AND LOWER(TRIM(m.placement)) = d.entity_key);
--
-- c) CLAUDE_RW can read it (expect a number, not an authorisation error):
-- USE ROLE CLAUDE_RW;
-- SELECT COUNT(*) FROM ASSEMBLEDVIEW.MART.VW_PACING_FACT_CM360_DRIFT;
--
-- Rollback: DROP VIEW ASSEMBLEDVIEW.MART.VW_PACING_FACT_CM360_DRIFT;
