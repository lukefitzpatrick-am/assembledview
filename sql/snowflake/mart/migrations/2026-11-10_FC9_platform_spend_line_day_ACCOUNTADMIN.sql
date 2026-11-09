-- =============================================================================
-- FC9 (B31): MART.VW_PLATFORM_SPEND_LINE_DAY, platform spend per plan line per
-- day, for the fixed cost from date split on Finance > Publishers > Fixed cost
-- margin (decision FC9 option C, stage C2).
-- Run as ACCOUNTADMIN in Snowsight, top to bottom. New view and grants only; no
-- table changes, no data written. Measured live 2026-11-10 with CLAUDE_RW
-- (SELECT only). Not run.
-- Same text as sql/snowflake/mart/views/vw_platform_spend_line_day.sql (that
-- file stays the source; a test keeps the two copies equal).
-- =============================================================================
-- Why
--   The margin report splits a dated fixed-cost line's date month into the
--   days before the date (actual) and the fixed cost leg. It needs that
--   month's platform spend before the date. VW_PLATFORM_SPEND_LINE_MONTH is
--   by month only. This view is the same body grouped by day as well.
--   The report reads it only for dated lines, only for that one month. Month
--   totals still come from VW_PLATFORM_SPEND_LINE_MONTH, so no total moves.
--   Until this runs, the report shows the date month unsplit and says so.
--
-- What it is
--   The B29 LM1 body of VW_PLATFORM_SPEND_LINE_MONTH (label_map_one, one active
--   LINE_ITEM_LABEL_MAP row per key), with DATE_DAY added to the SELECT and the
--   GROUP BY, and FIRST_DAY and LAST_DAY dropped (a row is one day). Same
--   sources (DV360 report, Taboola, Channel Factory, Vistar, Meta, TikTok,
--   Reddit, Google and Microsoft Ads), same relabel, same filters.
--   It does not change VW_PLATFORM_SPEND_LINE_MONTH (LM1 is separate).
--
-- Re-run safety
--   CREATE OR REPLACE ... COPY GRANTS keeps the grants on a re-run, and the
--   GRANTs are idempotent. The checks are SELECTs. Running it twice is safe.
--
-- Measured 2026-11-10 (the SELECT body run as CLAUDE_RW, without the Vistar
-- branch: CLAUDE_RW cannot read VW_PACING_PARTNER_OOH)
--   94,919 day rows; 0 duplicate (line, day, source, channel) keys.
--   Rolled up to month: 4,621 rows, the same 4,621 keys as the live month view
--   (Vistar left out of both); 0 rows differ in AMOUNT_SPENT or MEDIA_COST by
--   more than 0.000001, 0 in IMPRESSIONS, ROW_COUNT, FIRST_DAY or LAST_DAY.
--   BOSS lines, days 1 to 29 Oct 2026 (date 30 Oct, hypothetical):
--     boss010pd1 DV360 1,633.878221 of 1,699.50497 | boss010pd2 Taboola 590.97 of 639.88
--     boss011pd1 Taboola 461.09 of 499.76 | boss011pd2 DV360 771.174371 of 799.866006
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE SCHEMA ASSEMBLEDVIEW.MART;

-- ----- Before ----------------------------------------------------------------
-- a) The view is new (expect 0 rows on the first run, 1 on a re-run):
-- SHOW VIEWS LIKE 'VW_PLATFORM_SPEND_LINE_DAY' IN SCHEMA ASSEMBLEDVIEW.MART;
--
-- b) No duplicate active label map keys (expect 0 rows). With duplicates the
--    month view (still the FCM1 raw join until LM1 runs) and this view differ:
-- SELECT LOWER(TRIM(channel)) c, LOWER(TRIM(platform_line_item_id)) p, COUNT(*) n
-- FROM ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP WHERE is_active = TRUE
-- GROUP BY 1, 2 HAVING COUNT(*) > 1;

-- ----- 1. View ---------------------------------------------------------------
CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.VW_PLATFORM_SPEND_LINE_DAY COPY GRANTS (
  LINE_ITEM_ID,
  DATE_DAY,
  MONTH,
  SOURCE,
  CHANNEL,
  AMOUNT_SPENT,
  MEDIA_COST,
  IMPRESSIONS,
  ROW_COUNT
) AS
WITH dv360 AS (
  SELECT
    CASE
      WHEN UPPER(media_type) = 'DISPLAY' THEN 'Programmatic - Display'
      WHEN UPPER(media_type) = 'VIDEO'   THEN 'Programmatic - Video'
      ELSE 'Programmatic - DV360'
    END AS channel,
    date::date AS date_day,
    LOWER(TRIM(COALESCE(
      NULLIF(REGEXP_SUBSTR(UPPER(line_item), '[A-Z]{3}AU[0-9]{3,}[A-Z0-9]+'), ''),
      NULLIF(REGEXP_SUBSTR(LOWER(line_item), '[a-z]{3,6}[0-9]{3}(prod|pb|pa|pd|po|pv|ml|tv|np|sm|ra|mg|cn|dd|da|dv|bv|it|se|oh|in)[0-9]+'), ''),
      MD5(LOWER(TRIM(COALESCE(advertiser, ''))) || '|' || LOWER(TRIM(COALESCE(insertion_order, ''))) || '|' || LOWER(TRIM(COALESCE(line_item, ''))))
    ))) AS line_item_id,
    MD5(LOWER(TRIM(COALESCE(advertiser, ''))) || '|' || LOWER(TRIM(COALESCE(insertion_order, ''))) || '|' || LOWER(TRIM(COALESCE(line_item, '')))) AS platform_line_item_id,
    COALESCE(cost_adv_currency, 0)::float AS amount_spent,
    COALESCE(total_media_cost_advertiser_currency, 0)::float AS media_cost,
    COALESCE(impressions, 0)::number AS impressions
  FROM ASSEMBLEDVIEW.GOOGLE_DISPLAY_AND_VIDEO_360.DV_360_PACING
  WHERE date IS NOT NULL
),
prog AS (
  SELECT channel, date_day, 'DV360' AS source, platform_line_item_id, line_item_id,
         amount_spent, media_cost, impressions
  FROM dv360
  UNION ALL
  SELECT channel, date_day, 'Taboola', LOWER(TRIM(entity_id::string)), line_item_id,
         COALESCE(amount_spent, 0)::float, NULL, COALESCE(impressions, 0)::number
  FROM ASSEMBLEDVIEW.MART.VW_PACING_TABOOLA
  UNION ALL
  SELECT channel, date_day, 'Channel Factory', LOWER(TRIM(entity_id::string)), line_item_id,
         COALESCE(amount_spent, 0)::float, NULL, COALESCE(impressions, 0)::number
  FROM ASSEMBLEDVIEW.MART.VW_PACING_PARTNER_FILE
  UNION ALL
  SELECT channel, date_day, 'Vistar', LOWER(TRIM(entity_id::string)), line_item_id,
         COALESCE(amount_spent, 0)::float, NULL, COALESCE(impressions, 0)::number
  FROM ASSEMBLEDVIEW.MART.VW_PACING_PARTNER_OOH
),
-- One active map row per (channel, platform id) before the join. Snowflake
-- does not enforce unique keys, and a duplicate map row would multiply every
-- SUM below (C-180).
label_map_one AS (
  SELECT channel, platform_line_item_id, line_item_id, line_item_name, is_active
  FROM ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP
  WHERE is_active = TRUE
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY LOWER(TRIM(channel)), LOWER(TRIM(platform_line_item_id))
    ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST,
             LOWER(TRIM(line_item_id)) DESC NULLS LAST
  ) = 1
),
prog_relabel AS (
  SELECT
    p.channel, p.date_day, p.source,
    COALESCE(m.line_item_id, p.line_item_id) AS line_item_id,
    p.amount_spent, p.media_cost, p.impressions
  FROM prog p
  LEFT JOIN label_map_one m
    ON LOWER(TRIM(m.channel)) = LOWER(TRIM(p.channel))
   AND LOWER(TRIM(m.platform_line_item_id)) = LOWER(TRIM(p.platform_line_item_id))
   AND m.is_active = TRUE
  WHERE p.platform_line_item_id IS NOT NULL AND p.platform_line_item_id <> ''
),
social AS (
  SELECT channel, date_day,
         CASE channel
           WHEN 'Social - Meta' THEN 'Meta'
           WHEN 'Social - TikTok' THEN 'TikTok'
           WHEN 'Social - Reddit' THEN 'Reddit'
           ELSE channel
         END AS source,
         line_item_id, COALESCE(amount_spent, 0)::float AS amount_spent,
         NULL::float AS media_cost, COALESCE(impressions, 0)::number AS impressions
  FROM ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT
),
search AS (
  SELECT channel, date_day,
         CASE WHEN channel ILIKE '%Microsoft%' THEN 'Microsoft Ads' ELSE 'Google Ads' END AS source,
         line_item_id, COALESCE(amount_spent, 0)::float AS amount_spent,
         NULL::float AS media_cost, COALESCE(impressions, 0)::number AS impressions
  FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT
),
all_rows AS (
  SELECT * FROM prog_relabel
  UNION ALL SELECT * FROM social
  UNION ALL SELECT * FROM search
)
SELECT
  LOWER(TRIM(line_item_id))                       AS LINE_ITEM_ID,
  date_day                                        AS DATE_DAY,
  TO_CHAR(DATE_TRUNC('month', date_day), 'YYYY-MM') AS MONTH,
  source                                          AS SOURCE,
  channel                                         AS CHANNEL,
  SUM(amount_spent)                               AS AMOUNT_SPENT,
  SUM(media_cost)                                 AS MEDIA_COST,
  SUM(impressions)                                AS IMPRESSIONS,
  COUNT(*)                                        AS ROW_COUNT
FROM all_rows
WHERE line_item_id IS NOT NULL AND TRIM(line_item_id) <> '' AND date_day IS NOT NULL
GROUP BY 1, 2, 3, 4, 5;

GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.VW_PLATFORM_SPEND_LINE_DAY TO ROLE AV_APP_WRITE_ROLE;
GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.VW_PLATFORM_SPEND_LINE_DAY TO ROLE AV_APP_READ_ROLE;
GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.VW_PLATFORM_SPEND_LINE_DAY TO ROLE CLAUDE_RW;

-- ----- After -----------------------------------------------------------------
-- a) Rolled up to month it equals the month view (expect 0, 0 and 0):
-- WITH dm AS (
--   SELECT LINE_ITEM_ID, MONTH, SOURCE, CHANNEL, SUM(AMOUNT_SPENT) A, SUM(MEDIA_COST) MC,
--          SUM(IMPRESSIONS) I, SUM(ROW_COUNT) RC, MIN(DATE_DAY) FD, MAX(DATE_DAY) LD
--   FROM ASSEMBLEDVIEW.MART.VW_PLATFORM_SPEND_LINE_DAY GROUP BY 1, 2, 3, 4
-- ), mv AS (SELECT * FROM ASSEMBLEDVIEW.MART.VW_PLATFORM_SPEND_LINE_MONTH)
-- SELECT
--   (SELECT COUNT(*) FROM (SELECT LINE_ITEM_ID, MONTH, SOURCE, CHANNEL FROM dm
--                          MINUS SELECT LINE_ITEM_ID, MONTH, SOURCE, CHANNEL FROM mv)) AS keys_day_only,
--   (SELECT COUNT(*) FROM (SELECT LINE_ITEM_ID, MONTH, SOURCE, CHANNEL FROM mv
--                          MINUS SELECT LINE_ITEM_ID, MONTH, SOURCE, CHANNEL FROM dm)) AS keys_month_only,
--   (SELECT COUNT(*) FROM dm JOIN mv USING (LINE_ITEM_ID, MONTH, SOURCE, CHANNEL)
--    WHERE ABS(dm.A - mv.AMOUNT_SPENT) > 0.000001
--       OR ABS(COALESCE(dm.MC, 0) - COALESCE(mv.MEDIA_COST, 0)) > 0.000001
--       OR dm.I <> mv.IMPRESSIONS OR dm.RC <> mv.ROW_COUNT
--       OR dm.FD <> mv.FIRST_DAY OR dm.LD <> mv.LAST_DAY) AS rows_differ;
--
-- b) Grants (expect SELECT to AV_APP_WRITE_ROLE, AV_APP_READ_ROLE and CLAUDE_RW):
-- SHOW GRANTS ON VIEW ASSEMBLEDVIEW.MART.VW_PLATFORM_SPEND_LINE_DAY;
--
-- c) The guard is live (expect TRUE):
-- SELECT CONTAINS(GET_DDL('view', 'ASSEMBLEDVIEW.MART.VW_PLATFORM_SPEND_LINE_DAY'), 'label_map_one AS (');
--
-- d) Run as AV_APP_WRITE_ROLE (expect a number, not an authorisation error):
-- USE ROLE AV_APP_WRITE_ROLE;
-- SELECT COUNT(*) FROM ASSEMBLEDVIEW.MART.VW_PLATFORM_SPEND_LINE_DAY;
--
-- e) Spot check (expect boss010pd1 1633.878221, boss010pd2 590.97,
--    boss011pd1 461.09, boss011pd2 771.174371, give or take later DV360 restatements):
-- SELECT LINE_ITEM_ID, ROUND(SUM(AMOUNT_SPENT), 6)
-- FROM ASSEMBLEDVIEW.MART.VW_PLATFORM_SPEND_LINE_DAY
-- WHERE LINE_ITEM_ID IN ('boss010pd1', 'boss010pd2', 'boss011pd1', 'boss011pd2')
--   AND DATE_DAY >= '2026-10-01' AND DATE_DAY < '2026-10-30'
-- GROUP BY 1 ORDER BY 1;
--
-- Rollback (the report then shows the date month unsplit, as before the view):
-- DROP VIEW IF EXISTS ASSEMBLEDVIEW.MART.VW_PLATFORM_SPEND_LINE_DAY;
