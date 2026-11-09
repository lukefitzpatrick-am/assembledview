-- ASSEMBLEDVIEW.MART.VW_PLATFORM_SPEND_LINE_DAY
-- Platform spend per plan line per day, for the fixed cost from date split on
-- Finance > Publishers > Fixed cost margin (B31, FC9 C2). The report reads it
-- only for a dated fixed-cost line, only for the days of the date's month
-- before the date. Month totals still come from VW_PLATFORM_SPEND_LINE_MONTH.
-- Created by FC9 (migrations/2026-11-10_FC9_platform_spend_line_day_ACCOUNTADMIN.sql).
--
-- Body: the B29 LM1 text of vw_platform_spend_line_month.sql (label_map_one,
-- one active LINE_ITEM_LABEL_MAP row per key), grouped by day as well. Same
-- sources, same relabel, same filters. DATE_DAY is each platform's own day.
-- Not applied until Luke runs the migration. Until then the report shows a
-- dated line's date month unsplit and says so.
USE SCHEMA ASSEMBLEDVIEW.MART;

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
