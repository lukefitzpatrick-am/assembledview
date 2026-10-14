-- Run in Snowsight as ACCOUNTADMIN (owner of MART views). Author: Cursor. Not run.
--
-- Do not run this file from the app. A regular view reads its base tables
-- with the owner's privileges. GRANT SELECT below is enough for
-- AV_APP_READ_ROLE and CLAUDE_RW. Those roles still have no USAGE on
-- FACEBOOK_ADS, DOUBLE_CLICK_CAMPAIGN_MANAGER, GOOGLE_ANALYTICS_4, or
-- GOOGLE_SEARCH_CONSOLE.
--
-- Column check (SELECT only, AV_APP_WRITE_ROLE):
-- INFORMATION_SCHEMA.SCHEMATA listed MART and TIKTOK_ADS only.
-- INFORMATION_SCHEMA.COLUMNS listed TIKTOK_ADS.AD_REPORT_DAILY and AD_HISTORY.
-- GET_DDL of the four raw tables failed (compilation error: schema not visible).
-- SNOWFLAKE.ACCOUNT_USAGE.COLUMNS failed the same way.
-- CM360 columns used here are the ones the live views already select:
--   MART.VW_PACING_CM360: date, placement, campaign, impressions, clicks,
--     total_conversions, video_completions
--   STG_PACING.V_CM360_PLACEMENT_DAILY: profile_id
--   MART.V_PLATFORM_ADVERTISERS: advertiser, and the BidManager exclusion
-- No readable view selects a CM360 creative column. The creative name is the
-- placement with the last hyphen token removed (AV-OV2 §3).
-- Meta names are the Fivetran basic_ad report, which adds ad_id, ad_name, and
-- account_id to the columns VW_PACING_META already reads on BASIC_AD_SET.
-- BASIC_AD has no viewable, video, or conversion columns. Those outputs are null.
-- GA4 and Search Console names are the Fivetran prebuilt reports. They were
-- not in INFORMATION_SCHEMA. Confirm them if CREATE fails.
--
-- Every view keeps the last 400 days.

USE SCHEMA ASSEMBLEDVIEW.MART;

CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.V_CREATIVE_PERFORMANCE_DAILY COPY GRANTS AS
WITH latest_tiktok_ad AS (
  SELECT
    ad_id,
    advertiser_id,
    adgroup_id,
    ad_name,
    adgroup_name,
    ROW_NUMBER() OVER (
      PARTITION BY ad_id
      ORDER BY updated_at DESC, _fivetran_synced DESC
    ) AS rn
  FROM ASSEMBLEDVIEW.TIKTOK_ADS.AD_HISTORY
),
raw AS (
  SELECT
    'meta' AS platform,
    b.account_id::varchar AS account_ref,
    b.ad_id::varchar AS creative_key,
    b.ad_name AS creative_name,
    b.adset_name AS ad_group_name,
    LOWER(TRIM(COALESCE(
      NULLIF(REGEXP_SUBSTR(b.adset_name, '[^-]+$'), ''),
      b.ad_id::varchar
    ))) AS line_item_id,
    b.date::date AS date,
    b.spend::float AS spend,
    b.impressions::number AS impressions,
    b.inline_link_clicks::number AS clicks,
    NULL::float AS viewable_impressions,
    NULL::number AS video_views,
    NULL::number AS video_completions,
    NULL::number AS conversions
  FROM ASSEMBLEDVIEW.FACEBOOK_ADS.BASIC_AD b
  WHERE b.date::date >= DATEADD(day, -400, CURRENT_DATE())

  UNION ALL

  SELECT
    'tiktok' AS platform,
    h.advertiser_id::varchar AS account_ref,
    r.ad_id::varchar AS creative_key,
    h.ad_name AS creative_name,
    h.adgroup_name AS ad_group_name,
    LOWER(TRIM(COALESCE(
      NULLIF(REGEXP_SUBSTR(h.adgroup_name, '[^-]+$'), ''),
      h.adgroup_id::varchar,
      r.ad_id::varchar
    ))) AS line_item_id,
    r.stat_time_day::date AS date,
    SUM(r.spend)::float AS spend,
    SUM(r.impressions)::number AS impressions,
    SUM(r.clicks)::number AS clicks,
    NULL::float AS viewable_impressions,
    SUM(r.video_play_actions)::number AS video_views,
    SUM(r.video_views_p_100)::number AS video_completions,
    SUM(r.conversion)::number AS conversions
  FROM ASSEMBLEDVIEW.TIKTOK_ADS.AD_REPORT_DAILY r
  LEFT JOIN latest_tiktok_ad h
    ON r.ad_id = h.ad_id
   AND h.rn = 1
  WHERE r.stat_time_day::date >= DATEADD(day, -400, CURRENT_DATE())
  GROUP BY
    h.advertiser_id,
    r.ad_id,
    h.ad_name,
    h.adgroup_name,
    h.adgroup_id,
    r.stat_time_day::date

  UNION ALL

  SELECT
    'cm360' AS platform,
    TRIM(p.advertiser) AS account_ref,
    LOWER(TRIM(REGEXP_REPLACE(p.placement, '-[^-]+$', ''))) AS creative_key,
    REGEXP_REPLACE(p.placement, '-[^-]+$', '') AS creative_name,
    p.placement AS ad_group_name,
    LOWER(TRIM(COALESCE(
      NULLIF(REGEXP_SUBSTR(p.placement, '[^-]+$'), ''),
      p.placement
    ))) AS line_item_id,
    p.date::date AS date,
    NULL::float AS spend,
    SUM(p.impressions)::number AS impressions,
    SUM(p.clicks)::number AS clicks,
    NULL::float AS viewable_impressions,
    NULL::number AS video_views,
    SUM(p.video_completions)::number AS video_completions,
    SUM(p.total_conversions)::number AS conversions
  FROM ASSEMBLEDVIEW.DOUBLE_CLICK_CAMPAIGN_MANAGER.CM_360_PACING p
  WHERE p.date::date >= DATEADD(day, -400, CURRENT_DATE())
    AND p.advertiser IS NOT NULL
    AND TRIM(p.advertiser) <> ''
    AND p.advertiser NOT LIKE 'BidManager_Advertiser_DO_NOT_EDIT%'
  GROUP BY
    TRIM(p.advertiser),
    REGEXP_REPLACE(p.placement, '-[^-]+$', ''),
    p.placement,
    p.date::date
)
SELECT
  platform,
  account_ref,
  creative_key,
  creative_name,
  ad_group_name,
  line_item_id,
  REGEXP_SUBSTR(
    line_item_id,
    '^(.*)(prod|pb|pa|pd|po|pv|ml|tv|np|sm|ra|mg|cn|dd|da|dv|bv|it|se|oh|in)[0-9]+$',
    1, 1, 'i', 1
  ) AS mba_number,
  date,
  spend,
  impressions,
  clicks,
  viewable_impressions,
  video_views,
  video_completions,
  conversions
FROM raw;

GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.V_CREATIVE_PERFORMANCE_DAILY TO ROLE AV_APP_READ_ROLE;
GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.V_CREATIVE_PERFORMANCE_DAILY TO ROLE CLAUDE_RW;

-- check: row counts by platform for the last 30 days
-- SELECT platform, COUNT(*) AS rows
-- FROM ASSEMBLEDVIEW.MART.V_CREATIVE_PERFORMANCE_DAILY
-- WHERE date >= DATEADD(day, -30, CURRENT_DATE())
-- GROUP BY platform
-- ORDER BY platform;

-- Campaign report has session_campaign_name and does not have session_source
-- or session_medium. Those two dimensions are on
-- TRAFFIC_ACQUISITION_SESSION_SOURCE_MEDIUM_REPORT (session_source,
-- session_medium), which has no session campaign. This view stays on the
-- campaign report so the two grains are not added together. source and
-- medium are null.
CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.V_GA4_CAMPAIGN_DAILY COPY GRANTS AS
SELECT
  NULLIF(REGEXP_SUBSTR(property, '[0-9]+'), '') AS property_id,
  date::date AS date,
  session_campaign_name AS session_campaign,
  NULL::varchar AS session_source,
  NULL::varchar AS session_medium,
  sessions,
  engaged_sessions,
  key_events,
  total_revenue
FROM ASSEMBLEDVIEW.GOOGLE_ANALYTICS_4.TRAFFIC_ACQUISITION_SESSION_CAMPAIGN_REPORT
WHERE date::date >= DATEADD(day, -400, CURRENT_DATE());

GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.V_GA4_CAMPAIGN_DAILY TO ROLE AV_APP_READ_ROLE;
GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.V_GA4_CAMPAIGN_DAILY TO ROLE CLAUDE_RW;

-- check: row counts by property for the last 30 days
-- SELECT property_id, COUNT(*) AS rows
-- FROM ASSEMBLEDVIEW.MART.V_GA4_CAMPAIGN_DAILY
-- WHERE date >= DATEADD(day, -30, CURRENT_DATE())
-- GROUP BY property_id
-- ORDER BY property_id;

-- PAGES_PATH_REPORT has total_users and screen_page_views. It has no sessions
-- column, so the audience column is total_users.
CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.V_GA4_LANDING_DAILY COPY GRANTS AS
SELECT
  NULLIF(REGEXP_SUBSTR(property, '[0-9]+'), '') AS property_id,
  date::date AS date,
  page_path,
  total_users,
  key_events,
  screen_page_views
FROM ASSEMBLEDVIEW.GOOGLE_ANALYTICS_4.PAGES_PATH_REPORT
WHERE date::date >= DATEADD(day, -400, CURRENT_DATE());

GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.V_GA4_LANDING_DAILY TO ROLE AV_APP_READ_ROLE;
GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.V_GA4_LANDING_DAILY TO ROLE CLAUDE_RW;

-- check: row counts by property for the last 30 days
-- SELECT property_id, COUNT(*) AS rows
-- FROM ASSEMBLEDVIEW.MART.V_GA4_LANDING_DAILY
-- WHERE date >= DATEADD(day, -30, CURRENT_DATE())
-- GROUP BY property_id
-- ORDER BY property_id;

-- SITE_REPORT_BY_SITE is keyed by country, device, and search_type.
-- This view keeps search_type = 'web' and sums country and device.
-- ctr is clicks / impressions. position is weighted by impressions.
CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.V_GSC_SITE_DAILY COPY GRANTS AS
SELECT
  site,
  date::date AS date,
  SUM(clicks) AS clicks,
  SUM(impressions) AS impressions,
  SUM(clicks) / NULLIF(SUM(impressions), 0) AS ctr,
  SUM(position * impressions) / NULLIF(SUM(impressions), 0) AS position
FROM ASSEMBLEDVIEW.GOOGLE_SEARCH_CONSOLE.SITE_REPORT_BY_SITE
WHERE search_type = 'web'
  AND date::date >= DATEADD(day, -400, CURRENT_DATE())
GROUP BY site, date::date;

GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.V_GSC_SITE_DAILY TO ROLE AV_APP_READ_ROLE;
GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.V_GSC_SITE_DAILY TO ROLE CLAUDE_RW;

-- check: row counts by site for the last 30 days
-- SELECT site, COUNT(*) AS rows
-- FROM ASSEMBLEDVIEW.MART.V_GSC_SITE_DAILY
-- WHERE date >= DATEADD(day, -30, CURRENT_DATE())
-- GROUP BY site
-- ORDER BY site;

-- KEYWORD_SITE_REPORT_BY_SITE is also keyed by country and device.
-- Query column is `query` (Fivetran connections created after 11 Aug 2022).
-- An older connection would call that column `keyword`.
CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.V_GSC_QUERY_DAILY COPY GRANTS AS
SELECT
  site,
  date::date AS date,
  query,
  SUM(clicks) AS clicks,
  SUM(impressions) AS impressions,
  SUM(position * impressions) / NULLIF(SUM(impressions), 0) AS position
FROM ASSEMBLEDVIEW.GOOGLE_SEARCH_CONSOLE.KEYWORD_SITE_REPORT_BY_SITE
WHERE search_type = 'web'
  AND date::date >= DATEADD(day, -400, CURRENT_DATE())
GROUP BY site, date::date, query;

GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.V_GSC_QUERY_DAILY TO ROLE AV_APP_READ_ROLE;
GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.V_GSC_QUERY_DAILY TO ROLE CLAUDE_RW;

-- check: row counts by site for the last 30 days
-- SELECT site, COUNT(*) AS rows
-- FROM ASSEMBLEDVIEW.MART.V_GSC_QUERY_DAILY
-- WHERE date >= DATEADD(day, -30, CURRENT_DATE())
-- GROUP BY site
-- ORDER BY site;
