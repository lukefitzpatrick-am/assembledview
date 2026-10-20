-- =============================================================================
-- SR1: bring SEARCH_PACING_FACT history onto ad group grain spend
-- Run as ACCOUNTADMIN in Snowsight. Checked live 2026-10-20.
-- =============================================================================
-- Why:
--   VW_PACING_GOOGLE_SEARCH_DAILY switched from keyword stats to ad group stats
--   on 2026-08-18 (keyword stats miss cost with no keyword behind it). The daily
--   refresh only re-merges the last 14 days, so fact rows older than about
--   4 Aug 2026 still carry the old, lower keyword-grain numbers.
--   For 'Search - Google Ads' from Apr 2025: about 4,500 rows are low by about
--   $15.8K in total (all clients), plus a few hundred small ad-group days that
--   are missing. HARTM001 search is about $5.8K low for 1 Jan to 19 Oct 2026.
-- What it does:
--   * Updates spend, impressions, clicks, conversions, revenue and the two
--     impression-share fields from the live view. LINE_ITEM_ID, LINE_ITEM_NAME
--     and campaign fields are NOT touched, so relabels (HR1 and earlier) stay.
--   * Inserts ad-group days the fact is missing, with the view's ids.
--   * Only from the first date the fact already holds for this channel. Older
--     history (2024 to Mar 2025) is not added.
-- Search channel only. PMax and Shopping already match the source.
-- =============================================================================
USE ROLE ACCOUNTADMIN;
USE SCHEMA ASSEMBLEDVIEW.MART;

-- ----- Preview (expect changed about 4,500 rows / delta about +15.8K; missing small) -----
-- WITH v AS (SELECT channel, date_day, LOWER(TRIM(platform_line_item_id)) pid, SUM(amount_spent) s
--            FROM VW_PACING_GOOGLE_SEARCH_DAILY WHERE channel = 'Search - Google Ads' GROUP BY 1, 2, 3),
--      f AS (SELECT channel, date_day, LOWER(TRIM(platform_line_item_id)) pid, SUM(amount_spent) s
--            FROM SEARCH_PACING_FACT WHERE channel = 'Search - Google Ads' GROUP BY 1, 2, 3),
--      floor AS (SELECT MIN(date_day) d FROM SEARCH_PACING_FACT WHERE channel = 'Search - Google Ads')
-- SELECT COUNT_IF(f.pid IS NULL) missing_rows, ROUND(SUM(IFF(f.pid IS NULL, v.s, 0)), 2) missing_spend,
--        COUNT_IF(f.pid IS NOT NULL AND ABS(v.s - f.s) > 0.005) changed_rows,
--        ROUND(SUM(IFF(f.pid IS NOT NULL, v.s - f.s, 0)), 2) delta_spend
-- FROM v LEFT JOIN f ON f.channel = v.channel AND f.date_day = v.date_day AND f.pid = v.pid
-- WHERE v.date_day >= (SELECT d FROM floor);

MERGE INTO ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT t
USING (
  SELECT
    channel, date_day,
    MAX(line_item_id) AS line_item_id, MAX(line_item_name) AS line_item_name,
    LOWER(TRIM(platform_line_item_id)) AS platform_line_item_id,
    MAX(campaign_id) AS campaign_id, MAX(campaign_name) AS campaign_name, MAX(customer_id) AS customer_id,
    SUM(amount_spent) AS amount_spent, SUM(impressions) AS impressions, SUM(clicks) AS clicks,
    SUM(conversions) AS conversions, SUM(revenue) AS revenue,
    AVG(top_impression_percentage) AS top_impression_percentage,
    AVG(absolute_top_impression_percentage) AS absolute_top_impression_percentage,
    MAX(max_fivetran_synced_at) AS max_fivetran_synced_at
  FROM ASSEMBLEDVIEW.MART.VW_PACING_GOOGLE_SEARCH_DAILY
  WHERE channel = 'Search - Google Ads'
    AND date_day >= (SELECT MIN(date_day) FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT WHERE channel = 'Search - Google Ads')
  GROUP BY channel, date_day, LOWER(TRIM(platform_line_item_id))
) s
ON  t.channel = s.channel
AND t.date_day = s.date_day
AND LOWER(TRIM(t.platform_line_item_id)) = s.platform_line_item_id
WHEN MATCHED AND (ABS(COALESCE(t.amount_spent, 0) - s.amount_spent) > 0.005
                  OR COALESCE(t.impressions, 0) <> s.impressions
                  OR COALESCE(t.clicks, 0) <> s.clicks) THEN UPDATE SET
  amount_spent = s.amount_spent,
  impressions = s.impressions,
  clicks = s.clicks,
  conversions = s.conversions,
  revenue = s.revenue,
  top_impression_percentage = s.top_impression_percentage,
  absolute_top_impression_percentage = s.absolute_top_impression_percentage,
  max_fivetran_synced_at = s.max_fivetran_synced_at,
  updated_at = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN INSERT (
  channel, date_day, line_item_id, line_item_name, platform_line_item_id,
  campaign_id, campaign_name, customer_id,
  amount_spent, impressions, clicks, conversions, revenue,
  top_impression_percentage, absolute_top_impression_percentage,
  max_fivetran_synced_at, updated_at
) VALUES (
  s.channel, s.date_day, s.line_item_id, s.line_item_name, s.platform_line_item_id,
  s.campaign_id, s.campaign_name, s.customer_id,
  s.amount_spent, s.impressions, s.clicks, s.conversions, s.revenue,
  s.top_impression_percentage, s.absolute_top_impression_percentage,
  s.max_fivetran_synced_at, CURRENT_TIMESTAMP()
);

-- ----- After: HARTM001 search 1 Jan to 19 Oct should be about $219.6K (Google Ads, Search filter) -----
-- SELECT ROUND(SUM(amount_spent), 2) FROM SEARCH_PACING_FACT
-- WHERE channel = 'Search - Google Ads' AND date_day BETWEEN '2026-01-01' AND '2026-10-19'
--   AND campaign_id IN ('22137499881','22137623475','22143931385','22144134926','22147585843','22147971286','23389469259');
