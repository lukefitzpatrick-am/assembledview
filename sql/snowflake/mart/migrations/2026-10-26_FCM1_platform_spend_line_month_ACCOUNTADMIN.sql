-- =============================================================================
-- FCM1: platform spend per plan line per month, for Finance > Publishers >
-- Fixed cost margin. Run as ACCOUNTADMIN in Snowsight, top to bottom.
-- Measured live 2026-10-26 with CLAUDE_RW (SELECT only). Not run.
-- =============================================================================
-- Why a new view (and not PACING_FACT):
--   TSK_REFRESH_PACING_FACT is a MERGE that never deletes. When a DV360 line item
--   is renamed, Fivetran restates recent days under the new name, so the new
--   entity key gets fresh rows and the old key's rows stay. Both carry the same
--   plan line id after LINE_ITEM_LABEL_MAP, so PACING_FACT counts those days twice.
--   Measured 2026-10-26 (October to date):
--     hartm001pv1  PACING_FACT 20,149.83 | DV360 raw 13,786.86 | +6,362.97 stale
--     hartm001pv2  PACING_FACT  7,033.10 | DV360 raw  4,588.93 | +2,444.17 stale
--   PACING_FACT also holds 48,721 'Social - Meta' and 265 'Social - TikTok' rows
--   that duplicate SOCIAL_PACING_FACT. This view reads neither.
--
-- What this file does (one new view and grants; no existing object changes):
--   VW_PLATFORM_SPEND_LINE_MONTH: one row per plan line id, month, source and
--   channel, with platform spend, DV360 media cost, impressions, row count, first
--   and last day.
--   Sources, all AUD (DV360 ADVERTISER_CURRENCY is AUD on every 2026 row):
--     DV360            GOOGLE_DISPLAY_AND_VIDEO_360.DV_360_PACING direct, same id
--                      rule and entity key as VW_PACING_DV360.
--                      AMOUNT_SPENT = COST_ADV_CURRENCY (what pacing shows; equals
--                      REVENUE_ADV_CURRENCY on every Oct row).
--                      MEDIA_COST = TOTAL_MEDIA_COST_ADVERTISER_CURRENCY (about 77%
--                      of AMOUNT_SPENT in Oct). Luke confirmed 27 Oct 2026:
--                      AMOUNT_SPENT is our cost. MEDIA_COST is not read by the app.
--     Taboola          VW_PACING_TABOOLA (SPENT)
--     Channel Factory  VW_PACING_PARTNER_FILE (AMOUNT_SPENT is 0 by design)
--     Vistar           VW_PACING_PARTNER_OOH ('Vistar Revenue = client cost')
--     Meta / TikTok / Reddit   SOCIAL_PACING_FACT (ad set / ad group keyed)
--     Google Ads / Microsoft Ads  SEARCH_PACING_FACT
--   Left out: CM360 (ad serving counts, AMOUNT_SPENT 0 by design).
--   Programmatic rows take LINE_ITEM_LABEL_MAP exactly as TSK_REFRESH_PACING_FACT
--   (channel + platform_line_item_id, is_active). Social and search facts are
--   already relabelled.
--
-- App side: GET /api/finance/sections/costs/fixed-cost-margin reads this view.
-- Until it exists the route falls back to PACING_FACT (programmatic only),
-- SOCIAL_PACING_FACT and SEARCH_PACING_FACT and says so on the page.
--
-- Expected after create (October 2026 to date, measured 2026-10-26):
--   hartm001pd1  DV360    3,232.23  media cost 2,486.33
--   hartm001pd2  DV360      608.49  media cost   468.07
--   hartm001pv1  DV360   13,786.86  media cost 10,605.28
--   hartm001pv2  DV360    4,588.93  media cost  3,529.94
--   hartm001pd3  Taboola  1,060.82
--   sinch001po1/po2/po3  Vistar  2,540.65 / 9,401.35 / 5,479.21 (PACING_FACT figures;
--                CLAUDE_RW cannot read VW_PACING_PARTNER_OOH to check the view)
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE SCHEMA ASSEMBLEDVIEW.MART;

-- ----- Before ----------------------------------------------------------------
-- expect no rows
-- SHOW VIEWS LIKE 'VW_PLATFORM_SPEND_LINE_MONTH' IN SCHEMA ASSEMBLEDVIEW.MART;

-- ----- 1. View ---------------------------------------------------------------
CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.VW_PLATFORM_SPEND_LINE_MONTH COPY GRANTS (
  LINE_ITEM_ID,
  MONTH,
  SOURCE,
  CHANNEL,
  AMOUNT_SPENT,
  MEDIA_COST,
  IMPRESSIONS,
  ROW_COUNT,
  FIRST_DAY,
  LAST_DAY
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
prog_relabel AS (
  SELECT
    p.channel, p.date_day, p.source,
    COALESCE(m.line_item_id, p.line_item_id) AS line_item_id,
    p.amount_spent, p.media_cost, p.impressions
  FROM prog p
  LEFT JOIN ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP m
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
  TO_CHAR(DATE_TRUNC('month', date_day), 'YYYY-MM') AS MONTH,
  source                                          AS SOURCE,
  channel                                         AS CHANNEL,
  SUM(amount_spent)                               AS AMOUNT_SPENT,
  SUM(media_cost)                                 AS MEDIA_COST,
  SUM(impressions)                                AS IMPRESSIONS,
  COUNT(*)                                        AS ROW_COUNT,
  MIN(date_day)                                   AS FIRST_DAY,
  MAX(date_day)                                   AS LAST_DAY
FROM all_rows
WHERE line_item_id IS NOT NULL AND TRIM(line_item_id) <> '' AND date_day IS NOT NULL
GROUP BY 1, 2, 3, 4;

-- ----- 2. Grants -------------------------------------------------------------
GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.VW_PLATFORM_SPEND_LINE_MONTH TO ROLE AV_APP_WRITE_ROLE;
GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.VW_PLATFORM_SPEND_LINE_MONTH TO ROLE AV_APP_READ_ROLE;
GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.VW_PLATFORM_SPEND_LINE_MONTH TO ROLE CLAUDE_RW;

-- ----- 3. After checks -------------------------------------------------------
-- a) October to date, the expected figures in the header (grow a little each day):
-- SELECT LINE_ITEM_ID, SOURCE, ROUND(AMOUNT_SPENT, 2) spend, ROUND(MEDIA_COST, 2) media_cost
-- FROM ASSEMBLEDVIEW.MART.VW_PLATFORM_SPEND_LINE_MONTH
-- WHERE MONTH = '2026-10'
--   AND LINE_ITEM_ID IN ('hartm001pd1','hartm001pd2','hartm001pv1','hartm001pv2','hartm001pd3',
--                        'sinch001po1','sinch001po2','sinch001po3')
-- ORDER BY 1;
--
-- b) One row per key (expect 0 rows):
-- SELECT LINE_ITEM_ID, MONTH, SOURCE, CHANNEL, COUNT(*) FROM ASSEMBLEDVIEW.MART.VW_PLATFORM_SPEND_LINE_MONTH
-- GROUP BY 1, 2, 3, 4 HAVING COUNT(*) > 1;
--
-- c) DV360 totals match the raw report for 2026 (expect diff 0.00):
-- SELECT ROUND((SELECT SUM(AMOUNT_SPENT) FROM ASSEMBLEDVIEW.MART.VW_PLATFORM_SPEND_LINE_MONTH
--               WHERE SOURCE = 'DV360' AND MONTH >= '2026-01')
--            - (SELECT SUM(cost_adv_currency) FROM ASSEMBLEDVIEW.GOOGLE_DISPLAY_AND_VIDEO_360.DV_360_PACING
--               WHERE date >= '2026-01-01'), 2) AS diff;
--
-- d) Run as AV_APP_WRITE_ROLE (expect a number, not an authorisation error):
-- USE ROLE AV_APP_WRITE_ROLE;
-- SELECT COUNT(*) FROM ASSEMBLEDVIEW.MART.VW_PLATFORM_SPEND_LINE_MONTH;
