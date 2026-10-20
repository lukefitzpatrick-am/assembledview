-- CF2 Google Ads conversions by conversion action (Phase 2). ACCOUNTADMIN, Snowsight.
-- RUN ONLY AFTER the two Fivetran custom reports in
-- docs/superpowers/SPEC-fivetran-google-ads-conversion-actions.md have synced.
-- Step 1 is guarded: it does nothing until both tables exist with the expected
-- columns, so it is safe to run early.
--
-- Decisions (Luke, 21 Oct 2026): Google count is metrics.conversions (primary
-- actions only). PMax at campaign grain. History from 1 Jan 2026.
-- Confidence: Fivetran column names 75% (confirm with Step 0). PMax allocation
-- to asset groups (below) 80%.
--
-- PMax: the report is campaign grain, but PMax lines key on asset group id in
-- SEARCH_PACING_FACT. Each campaign/day/action is split over that campaign's
-- asset groups by their share of primary conversions that day (ASSET_GROUP),
-- then by cost share, then evenly. A campaign with one asset group maps 1:1.

-- Step 0. Confirm the synced columns (read only). Expect at least:
--   DATE, CUSTOMER_ID, CAMPAIGN_ID, [AD_GROUP_ID], CONVERSION_ACTION,
--   CONVERSION_ACTION_NAME, CONVERSION_ACTION_CATEGORY, CONVERSIONS, CONVERSIONS_VALUE
-- DESC TABLE ASSEMBLEDVIEW.GOOGLE_ADS.AD_GROUP_CONVERSION_ACTION_STATS;
-- DESC TABLE ASSEMBLEDVIEW.GOOGLE_ADS.CAMPAIGN_CONVERSION_ACTION_STATS;
-- If Fivetran named a column differently, edit Step 1 to match before running it.

USE ROLE ACCOUNTADMIN;
USE SCHEMA ASSEMBLEDVIEW.MART;

-- Step 1. Guarded view create.
EXECUTE IMMEDIATE $$
DECLARE
  n_cols INTEGER;
BEGIN
  SELECT COUNT(*) INTO :n_cols
  FROM ASSEMBLEDVIEW.INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'GOOGLE_ADS'
    AND (
      (TABLE_NAME = 'AD_GROUP_CONVERSION_ACTION_STATS' AND COLUMN_NAME IN
        ('DATE','CUSTOMER_ID','CAMPAIGN_ID','AD_GROUP_ID','CONVERSION_ACTION','CONVERSION_ACTION_NAME','CONVERSION_ACTION_CATEGORY','CONVERSIONS','CONVERSIONS_VALUE'))
      OR
      (TABLE_NAME = 'CAMPAIGN_CONVERSION_ACTION_STATS' AND COLUMN_NAME IN
        ('DATE','CUSTOMER_ID','CAMPAIGN_ID','CONVERSION_ACTION','CONVERSION_ACTION_NAME','CONVERSION_ACTION_CATEGORY','CONVERSIONS','CONVERSIONS_VALUE'))
    );
  IF (n_cols < 17) THEN
    RETURN 'SKIPPED: conversion action tables or columns not found (' || n_cols || ' of 17). Run Step 0.';
  END IF;

  CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.VW_CONVERSIONS_GOOGLE_ACTIONS COPY GRANTS AS
  WITH
  -- Channel per platform id as the search fact keys it (Search, Shopping, PMax).
  channel_map AS (
    SELECT LOWER(TRIM(platform_line_item_id)) AS pid, channel
    FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT
    QUALIFY ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(platform_line_item_id)) ORDER BY date_day DESC) = 1
  ),
  cat AS (
    SELECT column1 AS category, column2 AS event_category FROM VALUES
      ('PURCHASE','purchase'), ('STORE_SALE','purchase'),
      ('SUBMIT_LEAD_FORM','lead'), ('CONTACT','lead'), ('PHONE_CALL_LEAD','lead'),
      ('SIGNUP','lead'), ('BOOK_APPOINTMENT','lead'), ('REQUEST_QUOTE','lead'),
      ('QUALIFIED_LEAD','lead'), ('CONVERTED_LEAD','lead'), ('IMPORTED_LEAD','lead')
  ),
  ad_group_rows AS (
    SELECT
      s.DATE::DATE AS date_day,
      LOWER(TRIM(s.AD_GROUP_ID::VARCHAR)) AS pid,
      s.CONVERSION_ACTION::VARCHAR AS event_key,
      MAX(s.CONVERSION_ACTION_NAME)::VARCHAR AS event_name,
      MAX(UPPER(s.CONVERSION_ACTION_CATEGORY))::VARCHAR AS category,
      SUM(COALESCE(s.CONVERSIONS, 0)) AS conversions,
      SUM(COALESCE(s.CONVERSIONS_VALUE, 0)) AS conversion_value,
      MAX(s._FIVETRAN_SYNCED)::TIMESTAMP_NTZ AS synced
    FROM ASSEMBLEDVIEW.GOOGLE_ADS.AD_GROUP_CONVERSION_ACTION_STATS s
    GROUP BY 1, 2, 3
  ),
  -- PMax asset groups per campaign and day, with weights.
  ag AS (
    SELECT DATE::DATE AS date_day, CAMPAIGN_ID::VARCHAR AS campaign_id, LOWER(TRIM(ID::VARCHAR)) AS pid,
           SUM(COALESCE(CONVERSIONS, 0)) AS conv, SUM(COALESCE(COST_MICROS, 0)) AS cost
    FROM ASSEMBLEDVIEW.GOOGLE_ADS.ASSET_GROUP
    GROUP BY 1, 2, 3
  ),
  ag_w AS (
    SELECT date_day, campaign_id, pid,
      CASE
        WHEN SUM(conv) OVER (PARTITION BY date_day, campaign_id) > 0
          THEN conv / SUM(conv) OVER (PARTITION BY date_day, campaign_id)
        WHEN SUM(cost) OVER (PARTITION BY date_day, campaign_id) > 0
          THEN cost / SUM(cost) OVER (PARTITION BY date_day, campaign_id)
        ELSE 1 / COUNT(*) OVER (PARTITION BY date_day, campaign_id)
      END AS w
    FROM ag
  ),
  pmax_campaign_rows AS (
    SELECT
      s.DATE::DATE AS date_day,
      s.CAMPAIGN_ID::VARCHAR AS campaign_id,
      s.CONVERSION_ACTION::VARCHAR AS event_key,
      MAX(s.CONVERSION_ACTION_NAME)::VARCHAR AS event_name,
      MAX(UPPER(s.CONVERSION_ACTION_CATEGORY))::VARCHAR AS category,
      SUM(COALESCE(s.CONVERSIONS, 0)) AS conversions,
      SUM(COALESCE(s.CONVERSIONS_VALUE, 0)) AS conversion_value,
      MAX(s._FIVETRAN_SYNCED)::TIMESTAMP_NTZ AS synced
    FROM ASSEMBLEDVIEW.GOOGLE_ADS.CAMPAIGN_CONVERSION_ACTION_STATS s
    WHERE s.CAMPAIGN_ID::VARCHAR IN (SELECT DISTINCT CAMPAIGN_ID::VARCHAR FROM ASSEMBLEDVIEW.GOOGLE_ADS.ASSET_GROUP)
    GROUP BY 1, 2, 3
  ),
  pmax_rows AS (
    SELECT p.date_day, w.pid, p.event_key, p.event_name, p.category,
           p.conversions * w.w AS conversions, p.conversion_value * w.w AS conversion_value, p.synced
    FROM pmax_campaign_rows p
    JOIN ag_w w ON w.date_day = p.date_day AND w.campaign_id = p.campaign_id
  ),
  unioned AS (
    SELECT * FROM ad_group_rows
    UNION ALL
    SELECT * FROM pmax_rows
  )
  SELECT
    COALESCE(m.channel, 'Search - Google Ads') AS channel,
    u.date_day,
    u.pid AS platform_line_item_id,
    'google_ads' AS platform,
    u.event_key,
    COALESCE(u.event_name, u.event_key) AS event_name,
    COALESCE(c.event_category, 'other') AS event_category,
    u.conversions,
    u.conversion_value,
    u.synced AS max_fivetran_synced_at
  FROM unioned u
  LEFT JOIN channel_map m ON m.pid = u.pid
  LEFT JOIN cat c ON c.category = u.category
  WHERE u.date_day >= '2026-01-01'
    AND (COALESCE(u.conversions, 0) <> 0 OR COALESCE(u.conversion_value, 0) <> 0);

  GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.VW_CONVERSIONS_GOOGLE_ACTIONS TO ROLE AV_APP_READ_ROLE;
  GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.VW_CONVERSIONS_GOOGLE_ACTIONS TO ROLE CLAUDE_RW;
  RETURN 'CREATED VW_CONVERSIONS_GOOGLE_ACTIONS';
END;
$$;

-- Step 2. Check before wiring the task (expect zero rows).
-- Per ad group and day, per-action CONVERSIONS sum to AD_GROUP_STATS.CONVERSIONS.
-- SELECT a.d, a.pid, a.n AS by_action, s.n AS ad_group_stats
-- FROM (SELECT date_day d, platform_line_item_id pid, SUM(conversions) n
--       FROM ASSEMBLEDVIEW.MART.VW_CONVERSIONS_GOOGLE_ACTIONS
--       WHERE channel IN ('Search - Google Ads','Shopping - Google Ads') GROUP BY 1, 2) a
-- JOIN (SELECT DATE::DATE d, LOWER(ID::VARCHAR) pid, SUM(CONVERSIONS) n
--       FROM ASSEMBLEDVIEW.GOOGLE_ADS.AD_GROUP_STATS WHERE DATE >= '2026-01-01' GROUP BY 1, 2) s
--   ON s.d = a.d AND s.pid = a.pid
-- WHERE ABS(a.n - s.n) > 0.01;
-- PMax: per campaign and day, allocated rows sum back to the campaign report.
-- SELECT p.d, p.n, c.n FROM
--  (SELECT f.date_day d, SUM(f.conversions) n FROM ASSEMBLEDVIEW.MART.VW_CONVERSIONS_GOOGLE_ACTIONS f
--    WHERE f.channel = 'PMax - Google Ads' GROUP BY 1) p
-- JOIN (SELECT DATE::DATE d, SUM(CONVERSIONS) n FROM ASSEMBLEDVIEW.GOOGLE_ADS.CAMPAIGN_CONVERSION_ACTION_STATS
--        WHERE DATE >= '2026-01-01' AND CAMPAIGN_ID IN (SELECT CAMPAIGN_ID FROM ASSEMBLEDVIEW.GOOGLE_ADS.ASSET_GROUP) GROUP BY 1) c
--   ON c.d = p.d WHERE ABS(p.n - c.n) > 0.01;

-- Step 3. Add the per-action view to the task (all_primary stays as an event).
-- Edit tasks/tsk_refresh_conversion_fact.sql: add this line to the UNION ALL,
-- suspend the root, re-create the task, resume the task, resume the root:
--   UNION ALL SELECT channel, date_day, platform_line_item_id, platform, event_key, event_name, event_category, conversions, conversion_value, max_fivetran_synced_at FROM ASSEMBLEDVIEW.MART.VW_CONVERSIONS_GOOGLE_ACTIONS

-- Step 4. One-off backfill of per-action rows from 1 Jan 2026 (the task only covers 14 days).
-- Before: SELECT COUNT(*) FROM ASSEMBLEDVIEW.MART.CONVERSION_FACT WHERE platform='google_ads' AND event_key <> 'all_primary';  -- expect 0
-- INSERT INTO ASSEMBLEDVIEW.MART.CONVERSION_FACT (channel, date_day, platform_line_item_id, platform, event_key,
--   event_name, event_category, conversions, conversion_value, max_fivetran_synced_at, updated_at)
-- SELECT channel, date_day, platform_line_item_id, platform, event_key, MAX(event_name), MAX(event_category),
--        SUM(conversions), SUM(conversion_value), MAX(max_fivetran_synced_at), CURRENT_TIMESTAMP()
-- FROM ASSEMBLEDVIEW.MART.VW_CONVERSIONS_GOOGLE_ACTIONS
-- WHERE date_day < DATEADD(day, -14, CURRENT_DATE())
--   AND platform_line_item_id IS NOT NULL AND platform_line_item_id <> ''
-- GROUP BY 1, 2, 3, 4, 5;
-- After: the Before query returns the per-action row count; Step 2 checks still return zero rows.
