-- ASSEMBLEDVIEW.MART.VW_CONVERSIONS_* source views for CONVERSION_FACT.
-- Run by Luke 2026-10-21 (plan section 8.2), with two later corrections:
--   * VW_CONVERSIONS_TIKTOK: the LATERAL ... UNION ALL version failed at query
--     time ("Unsupported subquery type"). Replaced with the CTE version below (tested).
--   * VW_CONVERSIONS_OTHER: Reddit wrote a zero row for every event (100 rows each)
--     and Taboola cpa_actions is all zero. HAVING drops zero rows. NOT RUN YET:
--     re-run this view. Zero rows the backfill already loaded stay until the
--     optional clean-up at the end of this file is run.
-- Rules (Luke, 21 Oct 2026):
--   * Never sum Meta omni_purchase with purchase. Only the keys below are loaded.
--   * Meta values are rolled up from ad to ad set through AD_HISTORY (Option A).
--     Value is populated only for purchase, add_to_cart and initiate_checkout.
--   * DV360 REVENUE_ADV_CURRENCY is media revenue, never conversion value: NULL here.
--   * CM360 floodlights win over DV360 for CM360-tagged DV360 lines. Applied at
--     read time (lib/delivery/conversions), not in these views.
--   * Google Ads: one event per line (all_primary = the Conversions column,
--     primary actions) until the conversion action report lands (Phase 2).
-- COPY GRANTS keeps grants on re-run. Grants: migrations/2026-10-21_cf1_conversion_grants_ACCOUNTADMIN.sql
USE ROLE ACCOUNTADMIN;
USE SCHEMA ASSEMBLEDVIEW.MART;

-- Meta: counts at ad set grain, values rolled up from ad grain (Option A).
CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.VW_CONVERSIONS_META COPY GRANTS AS
WITH ad_adset AS (
  SELECT ID::VARCHAR AS ad_id, AD_SET_ID::VARCHAR AS adset_id
  FROM ASSEMBLEDVIEW.FACEBOOK_ADS.AD_HISTORY
  QUALIFY ROW_NUMBER() OVER (PARTITION BY ID ORDER BY UPDATED_TIME DESC) = 1
),
counts AS (
  SELECT ADSET_ID::VARCHAR AS adset_id, DATE::DATE AS date_day, LOWER(ACTION_TYPE) AS event_key,
         SUM(COALESCE(VALUE, 0)) AS conversions, MAX(_FIVETRAN_SYNCED)::TIMESTAMP_NTZ AS synced
  FROM ASSEMBLEDVIEW.FACEBOOK_ADS.BASIC_AD_SET_ACTIONS
  WHERE LOWER(ACTION_TYPE) IN ('purchase','lead','complete_registration','add_to_cart',
                               'initiate_checkout','onsite_conversion.lead_grouped',
                               'offsite_conversion.fb_pixel_custom')
     OR LOWER(ACTION_TYPE) LIKE 'offsite_conversion.custom.%'
  GROUP BY 1, 2, 3
),
vals AS (
  SELECT m.adset_id, v.DATE::DATE AS date_day, LOWER(v.ACTION_TYPE) AS event_key,
         SUM(COALESCE(v.VALUE, 0)) AS conversion_value
  FROM ASSEMBLEDVIEW.FACEBOOK_ADS.BASIC_AD_ACTION_VALUES v
  JOIN ad_adset m ON m.ad_id = v.AD_ID::VARCHAR
  GROUP BY 1, 2, 3
)
SELECT
  'Social - Meta' AS channel,
  c.date_day,
  LOWER(TRIM(c.adset_id)) AS platform_line_item_id,
  'meta_ads' AS platform,
  c.event_key,
  c.event_key AS event_name,
  CASE WHEN c.event_key = 'purchase' THEN 'purchase'
       WHEN c.event_key IN ('lead','onsite_conversion.lead_grouped','complete_registration') THEN 'lead'
       ELSE 'other' END AS event_category,
  c.conversions,
  COALESCE(v.conversion_value, 0) AS conversion_value,
  c.synced AS max_fivetran_synced_at
FROM counts c
LEFT JOIN vals v
  ON v.adset_id = c.adset_id AND v.date_day = c.date_day AND v.event_key = c.event_key;

-- Google Ads, stopgap until Phase 2: one event per line, primary conversions.
CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.VW_CONVERSIONS_GOOGLE_TOTAL COPY GRANTS AS
SELECT channel, date_day, LOWER(TRIM(platform_line_item_id)) AS platform_line_item_id,
       'google_ads' AS platform, 'all_primary' AS event_key, 'All primary conversions' AS event_name,
       'other' AS event_category, conversions, revenue AS conversion_value,
       max_fivetran_synced_at
FROM ASSEMBLEDVIEW.MART.VW_PACING_GOOGLE_SEARCH_DAILY;

-- DV360 and CM360: floodlight totals. DV360 value is NULL on purpose (REVENUE_ADV_CURRENCY is media revenue).
CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.VW_CONVERSIONS_GMP COPY GRANTS AS
SELECT channel, date_day, LOWER(TRIM(entity_id)) AS platform_line_item_id, 'dv360' AS platform,
       'total_conversions' AS event_key, 'Floodlight conversions' AS event_name, 'other' AS event_category,
       results AS conversions, NULL::FLOAT AS conversion_value, max_fivetran_synced_at::TIMESTAMP_NTZ AS max_fivetran_synced_at
FROM ASSEMBLEDVIEW.MART.VW_PACING_DV360
UNION ALL
SELECT 'Ad Serving - CM360', P.DATE, LOWER(TRIM(P.PLACEMENT)), 'cm360',
       'total_conversions', 'Floodlight conversions', 'other',
       P.TOTAL_CONVERSIONS, P.TOTAL_REVENUE, P._FIVETRAN_SYNCED::TIMESTAMP_NTZ
FROM ASSEMBLEDVIEW.DOUBLE_CLICK_CAMPAIGN_MANAGER.CM_360_PACING P;

-- TikTok: unpivot the wide report (CTE version; the LATERAL version fails in Snowflake).
-- Zero in 2026, kept so a connected advertiser works on day one.
CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.VW_CONVERSIONS_TIKTOK COPY GRANTS AS
WITH r AS (SELECT STAT_TIME_DAY::DATE AS d, LOWER(TRIM(ADGROUP_ID::VARCHAR)) AS pid, _FIVETRAN_SYNCED::TIMESTAMP_NTZ AS s, CONVERSION, COMPLETE_PAYMENT, VALUE_PER_COMPLETE_PAYMENT, TOTAL_PURCHASE, TOTAL_PURCHASE_VALUE, TOTAL_SALES_LEAD, TOTAL_SALES_LEAD_VALUE, TOTAL_REGISTRATION FROM ASSEMBLEDVIEW.TIKTOK_ADS.ADGROUP_REPORT_DAILY),
e AS (
  SELECT d, pid, s, 'conversion' AS event_key, 'Optimisation conversions' AS event_name, 'other' AS event_category, CONVERSION::FLOAT AS conversions, NULL::FLOAT AS conversion_value FROM r
  UNION ALL SELECT d, pid, s, 'complete_payment', 'Complete payment', 'purchase', COMPLETE_PAYMENT, COMPLETE_PAYMENT * VALUE_PER_COMPLETE_PAYMENT FROM r
  UNION ALL SELECT d, pid, s, 'total_purchase', 'Purchase', 'purchase', TOTAL_PURCHASE, TOTAL_PURCHASE_VALUE FROM r
  UNION ALL SELECT d, pid, s, 'total_sales_lead', 'Lead', 'lead', TOTAL_SALES_LEAD, TOTAL_SALES_LEAD_VALUE FROM r
  UNION ALL SELECT d, pid, s, 'total_registration', 'Registration', 'lead', TOTAL_REGISTRATION, NULL FROM r)
SELECT 'Social - TikTok' AS channel, d AS date_day, pid AS platform_line_item_id, 'tiktok' AS platform, event_key, event_name, event_category, conversions, conversion_value, s AS max_fivetran_synced_at
FROM e WHERE COALESCE(conversions, 0) <> 0 OR COALESCE(conversion_value, 0) <> 0;

-- Taboola and Reddit. Zero rows dropped (HAVING), see header.
CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.VW_CONVERSIONS_OTHER COPY GRANTS AS
SELECT 'Programmatic - Display' AS channel, P.DATE::DATE AS date_day, LOWER(TRIM(P.CAMPAIGN_ID::VARCHAR)) AS platform_line_item_id,
       'taboola' AS platform, 'cpa_actions' AS event_key, 'Taboola conversions' AS event_name, 'other' AS event_category,
       SUM(COALESCE(P.CPA_ACTIONS_NUM, 0)) AS conversions, SUM(COALESCE(P.CONVERSIONS_VALUE, 0)) AS conversion_value,
       MAX(P._FIVETRAN_SYNCED)::TIMESTAMP_NTZ AS max_fivetran_synced_at
FROM ASSEMBLEDVIEW.TABOOLA.PLATFORM_REPORT P
WHERE P.CAMPAIGN_ID IS NOT NULL
GROUP BY 1, 2, 3
HAVING SUM(COALESCE(P.CPA_ACTIONS_NUM, 0)) <> 0 OR SUM(COALESCE(P.CONVERSIONS_VALUE, 0)) <> 0
UNION ALL
SELECT 'Social - Reddit', g.DATE::DATE, LOWER(TRIM(g.AD_GROUP_ID::VARCHAR)), 'reddit',
       LOWER(g.EVENT_NAME), g.EVENT_NAME,
       CASE WHEN LOWER(g.EVENT_NAME) = 'purchase' THEN 'purchase' WHEN LOWER(g.EVENT_NAME) IN ('lead','sign_up') THEN 'lead' ELSE 'other' END,
       SUM(COALESCE(g.CLICKS, 0) + COALESCE(g.VIEWS, 0)), SUM(COALESCE(g.TOTAL_VALUE, 0)),
       MAX(g._FIVETRAN_SYNCED)::TIMESTAMP_NTZ
FROM ASSEMBLEDVIEW.REDDIT_ADS.AD_GROUP_CONVERSIONS_REPORT g
GROUP BY 1, 2, 3, 4, 5, 6, 7
HAVING SUM(COALESCE(g.CLICKS, 0) + COALESCE(g.VIEWS, 0)) <> 0 OR SUM(COALESCE(g.TOTAL_VALUE, 0)) <> 0;

-- Optional clean-up after re-running VW_CONVERSIONS_OTHER (removes zero rows the backfill loaded).
-- Before: SELECT platform, COUNT(*) FROM ASSEMBLEDVIEW.MART.CONVERSION_FACT
--         WHERE platform IN ('reddit','taboola') AND COALESCE(conversions,0)=0 AND COALESCE(conversion_value,0)=0 GROUP BY 1;
-- DELETE FROM ASSEMBLEDVIEW.MART.CONVERSION_FACT
--  WHERE platform IN ('reddit','taboola') AND COALESCE(conversions,0)=0 AND COALESCE(conversion_value,0)=0;
-- After: the Before query returns no rows.
