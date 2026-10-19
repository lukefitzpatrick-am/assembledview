-- Run in Snowsight as ACCOUNTADMIN (owner of MART views). Author: Cursor. Not run.
--
-- Do not run this file from the app. A regular view reads its base tables
-- with the owner's privileges. GRANT SELECT below is enough for
-- AV_APP_READ_ROLE and CLAUDE_RW. Those roles still have no USAGE on
-- FACEBOOK_ADS, DOUBLE_CLICK_CAMPAIGN_MANAGER, GOOGLE_ANALYTICS_4, or
-- GOOGLE_SEARCH_CONSOLE.
--
-- Columns confirmed by Claude on 15 Oct 2026 as CLAUDE_RW
-- (the app role cannot see these schemas):
--
-- DOUBLE_CLICK_CAMPAIGN_MANAGER.CM_360_PACING:
--   DATE, PROFILE_ID, _FIVETRAN_ID, _FIVETRAN_SYNCED, IMPRESSIONS,
--   TOTAL_REVENUE, CREATIVE_PIXEL_SIZE, PACKAGE_ROADBLOCK,
--   ACTIVE_VIEW_VIEWABLE_IMPRESSIONS, CAMPAIGN, CREATIVE, PLACEMENT,
--   VIDEO_COMPLETIONS, ADVERTISER, TOTAL_CONVERSIONS, CLICKS.
--   Example placement 'golf_australia-...-ausopen_hype_6sec-golf025DD3'
--   has CREATIVE 'Vertical Video.mp4'. Some rows have CREATIVE '(not set)'.
-- FACEBOOK_ADS.BASIC_AD:
--   AD_ID, DATE, _FIVETRAN_ID, ACCOUNT_ID, IMPRESSIONS, INLINE_LINK_CLICKS,
--   REACH, COST_PER_INLINE_LINK_CLICK, CPC, CPM, CTR, FREQUENCY, SPEND,
--   AD_NAME, ADSET_NAME, INLINE_LINK_CLICK_CTR, _FIVETRAN_SYNCED, CAMPAIGN_ID.
-- GOOGLE_ANALYTICS_4.TRAFFIC_ACQUISITION_SESSION_CAMPAIGN_REPORT:
--   DATE, PROPERTY, SESSION_CAMPAIGN_NAME, EVENT_COUNT, EVENTS_PER_SESSION,
--   USER_ENGAGEMENT_DURATION, ENGAGEMENT_RATE, SESSIONS, KEY_EVENTS,
--   TOTAL_USERS, ENGAGED_SESSIONS, TOTAL_REVENUE.
-- GOOGLE_ANALYTICS_4.TRAFFIC_ACQUISITION_SESSION_SOURCE_MEDIUM_REPORT:
--   DATE, PROPERTY, SESSION_MEDIUM, SESSION_SOURCE, EVENT_COUNT,
--   EVENTS_PER_SESSION, USER_ENGAGEMENT_DURATION, ENGAGEMENT_RATE, SESSIONS,
--   KEY_EVENTS, TOTAL_USERS, ENGAGED_SESSIONS, TOTAL_REVENUE.
-- GOOGLE_ANALYTICS_4.EVENTS_REPORT:
--   DATE, PROPERTY, EVENT_NAME, EVENT_COUNT_PER_USER, EVENT_COUNT,
--   TOTAL_USERS, TOTAL_REVENUE.
-- GOOGLE_ANALYTICS_4.PAGES_TITLE_AND_SCREEN_CLASS_REPORT:
--   DATE, PROPERTY, UNIFIED_SCREEN_CLASS (the page title), KEY_EVENTS,
--   USER_ENGAGEMENT_DURATION, NEW_USERS, SCREEN_PAGE_VIEWS, EVENT_COUNT,
--   TOTAL_USERS, TOTAL_REVENUE.
-- GOOGLE_ANALYTICS_4.PAGES_PATH_REPORT:
--   DATE, PROPERTY, PAGE_PATH, KEY_EVENTS, USER_ENGAGEMENT_DURATION,
--   NEW_USERS, SCREEN_PAGE_VIEWS, EVENT_COUNT, TOTAL_USERS, TOTAL_REVENUE.
-- GOOGLE_SEARCH_CONSOLE.SITE_REPORT_BY_SITE:
--   DATE, SEARCH_TYPE, SITE, COUNTRY, DEVICE, CLICKS, IMPRESSIONS, CTR,
--   POSITION. KEYWORD_SITE_REPORT_BY_SITE has QUERY.
--
-- CM360 creative_name is TRIM(CREATIVE). creative_key is LOWER(TRIM(CREATIVE)).
-- A blank or '(not set)' creative keeps the name '(not set)' and creative_key
-- 'not-set:' || line_item_id. creative_size is CREATIVE_PIXEL_SIZE on CM360
-- and null on Meta and TikTok. Viewable impressions are
-- ACTIVE_VIEW_VIEWABLE_IMPRESSIONS. ad_group_name is PLACEMENT. The parsed
-- line_item_id is still the last hyphen token. An active
-- LINE_ITEM_LABEL_MAP row overrides line_item_id and mba_number
-- (see the relabel join under the view). Spend stays null.
-- BASIC_AD has no viewable, video, or conversion columns. Those outputs are null.
-- Meta is not relabelled here. BASIC_AD has ADSET_NAME and no ad set id.
-- VW_PACING_META reads ADSET_ID from BASIC_AD_SET (vw_pacing_meta.sql:60-73)
-- and does not select an account column. That account column is not
-- confirmed, and this file is not allowed to DESC TABLE. Joining ad set
-- name and date without account can attach another account's ad set.
-- TikTok still uses AD_REPORT_DAILY and AD_HISTORY. Those were confirmed
-- earlier and were not in the 15 Oct column check.
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
    NULL::varchar AS creative_size,
    b.adset_name AS ad_group_name,
    NULL::varchar AS map_channel,
    NULL::varchar AS map_platform_id,
    LOWER(TRIM(COALESCE(
      NULLIF(REGEXP_SUBSTR(b.adset_name, '[^-]+$'), ''),
      b.ad_id::varchar
    ))) AS parsed_line_item_id,
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
    NULL::varchar AS creative_size,
    h.adgroup_name AS ad_group_name,
    'Social - TikTok' AS map_channel,
    LOWER(TRIM(h.adgroup_id::varchar)) AS map_platform_id,
    LOWER(TRIM(COALESCE(
      NULLIF(REGEXP_SUBSTR(h.adgroup_name, '[^-]+$'), ''),
      h.adgroup_id::varchar,
      r.ad_id::varchar
    ))) AS parsed_line_item_id,
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
    CASE
      WHEN LOWER(COALESCE(NULLIF(TRIM(p.creative), ''), '(not set)')) = '(not set)'
      THEN 'not-set:' || LOWER(TRIM(COALESCE(
        NULLIF(REGEXP_SUBSTR(p.placement, '[^-]+$'), ''),
        p.placement
      )))
      ELSE LOWER(TRIM(p.creative))
    END AS creative_key,
    CASE
      WHEN LOWER(COALESCE(NULLIF(TRIM(p.creative), ''), '(not set)')) = '(not set)'
      THEN '(not set)'
      ELSE TRIM(p.creative)
    END AS creative_name,
    NULLIF(TRIM(p.creative_pixel_size), '') AS creative_size,
    p.placement AS ad_group_name,
    'Ad Serving - CM360' AS map_channel,
    LOWER(TRIM(p.placement)) AS map_platform_id,
    LOWER(TRIM(COALESCE(
      NULLIF(REGEXP_SUBSTR(p.placement, '[^-]+$'), ''),
      p.placement
    ))) AS parsed_line_item_id,
    p.date::date AS date,
    NULL::float AS spend,
    SUM(p.impressions)::number AS impressions,
    SUM(p.clicks)::number AS clicks,
    SUM(p.active_view_viewable_impressions)::float AS viewable_impressions,
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
    TRIM(p.creative),
    p.creative_pixel_size,
    p.placement,
    p.date::date
),
-- Same join as TSK_REFRESH_PACING_FACT (tsk_refresh_pacing_fact.sql:85-94)
-- and TSK_REFRESH_SOCIAL_PACING_FACT (tsk_refresh_social_pacing_fact.sql:41-49):
-- active row, channel + platform id, both lower(trim). The map has no
-- date columns. The 14-day window on those tasks is only how far the MERGE
-- rewrites; it is not a predicate on the map. This view applies the active
-- row across its 400-day window. MAX matches the fact's max(line_item_id).
label_map AS (
  SELECT
    LOWER(TRIM(channel)) AS channel,
    LOWER(TRIM(platform_line_item_id::varchar)) AS platform_line_item_id,
    MAX(line_item_id) AS line_item_id,
    MAX(mba_number) AS mba_number
  FROM ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP
  WHERE is_active = TRUE
  GROUP BY 1, 2
),
relabelled AS (
  SELECT
    r.platform,
    r.account_ref,
    CASE
      WHEN r.platform = 'cm360' AND r.creative_key LIKE 'not-set:%'
      THEN 'not-set:' || LOWER(TRIM(COALESCE(m.line_item_id, r.parsed_line_item_id)))
      ELSE r.creative_key
    END AS creative_key,
    r.creative_name,
    r.creative_size,
    r.ad_group_name,
    LOWER(TRIM(COALESCE(m.line_item_id, r.parsed_line_item_id))) AS line_item_id,
    COALESCE(
      NULLIF(TRIM(m.mba_number), ''),
      REGEXP_SUBSTR(
        LOWER(TRIM(COALESCE(m.line_item_id, r.parsed_line_item_id))),
        '^(.*)(prod|pb|pa|pd|po|pv|ml|tv|np|sm|ra|mg|cn|dd|da|dv|bv|it|se|oh|in)[0-9]+$',
        1, 1, 'i', 1
      )
    ) AS mba_number,
    r.date,
    r.spend,
    r.impressions,
    r.clicks,
    r.viewable_impressions,
    r.video_views,
    r.video_completions,
    r.conversions
  FROM raw r
  LEFT JOIN label_map m
    ON r.map_channel IS NOT NULL
   AND NULLIF(r.map_platform_id, '') IS NOT NULL
   AND m.channel = LOWER(TRIM(r.map_channel))
   AND m.platform_line_item_id = r.map_platform_id
)
SELECT
  platform,
  account_ref,
  creative_key,
  creative_name,
  creative_size,
  ad_group_name,
  line_item_id,
  mba_number,
  date,
  spend,
  impressions,
  clicks,
  viewable_impressions,
  video_views,
  video_completions,
  conversions
FROM relabelled;

GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.V_CREATIVE_PERFORMANCE_DAILY TO ROLE AV_APP_READ_ROLE;
GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.V_CREATIVE_PERFORMANCE_DAILY TO ROLE CLAUDE_RW;

-- check: row counts by platform for the last 30 days
-- SELECT platform, COUNT(*) AS rows
-- FROM ASSEMBLEDVIEW.MART.V_CREATIVE_PERFORMANCE_DAILY
-- WHERE date >= DATEADD(day, -30, CURRENT_DATE())
-- GROUP BY platform
-- ORDER BY platform;

-- check: golf025 CM360 rows with mba_number null in the last 60 days should be 0.
-- Placement names on the map do not contain the token golf025, so this matches
-- the active CM360 map rows whose mba is golf025 (the 15sec placement and the
-- 30sec placement) and any row whose line id already starts with golf025.
-- SELECT COUNT(*) AS golf025_cm360_null_mba
-- FROM ASSEMBLEDVIEW.MART.V_CREATIVE_PERFORMANCE_DAILY v
-- WHERE v.platform = 'cm360'
--   AND v.date >= DATEADD(day, -60, CURRENT_DATE())
--   AND v.mba_number IS NULL
--   AND (
--     LOWER(v.line_item_id) LIKE 'golf025%'
--     OR LOWER(TRIM(v.ad_group_name)) IN (
--       SELECT LOWER(TRIM(m.platform_line_item_id::varchar))
--       FROM ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP m
--       WHERE m.is_active = TRUE
--         AND LOWER(TRIM(m.channel)) = 'ad serving - cm360'
--         AND LOWER(TRIM(m.mba_number)) = 'golf025'
--     )
--   );

-- Campaign report has session_campaign_name. Source and medium live on
-- V_GA4_SOURCE_MEDIUM_DAILY so the two grains are not added together.
CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.V_GA4_CAMPAIGN_DAILY COPY GRANTS AS
SELECT
  NULLIF(REGEXP_SUBSTR(property, '[0-9]+'), '') AS property_id,
  date::date AS date,
  session_campaign_name AS session_campaign,
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

-- Source and medium are this report's grain. It has no session campaign.
CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.V_GA4_SOURCE_MEDIUM_DAILY COPY GRANTS AS
SELECT
  NULLIF(REGEXP_SUBSTR(property, '[0-9]+'), '') AS property_id,
  date::date AS date,
  session_source,
  session_medium,
  sessions,
  engaged_sessions,
  engagement_rate,
  key_events,
  total_users,
  total_revenue
FROM ASSEMBLEDVIEW.GOOGLE_ANALYTICS_4.TRAFFIC_ACQUISITION_SESSION_SOURCE_MEDIUM_REPORT
WHERE date::date >= DATEADD(day, -400, CURRENT_DATE());

GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.V_GA4_SOURCE_MEDIUM_DAILY TO ROLE AV_APP_READ_ROLE;
GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.V_GA4_SOURCE_MEDIUM_DAILY TO ROLE CLAUDE_RW;

-- check: row counts by property for the last 30 days
-- SELECT property_id, COUNT(*) AS rows
-- FROM ASSEMBLEDVIEW.MART.V_GA4_SOURCE_MEDIUM_DAILY
-- WHERE date >= DATEADD(day, -30, CURRENT_DATE())
-- GROUP BY property_id
-- ORDER BY property_id;

CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.V_GA4_EVENTS_DAILY COPY GRANTS AS
SELECT
  NULLIF(REGEXP_SUBSTR(property, '[0-9]+'), '') AS property_id,
  date::date AS date,
  event_name,
  event_count,
  total_users
FROM ASSEMBLEDVIEW.GOOGLE_ANALYTICS_4.EVENTS_REPORT
WHERE date::date >= DATEADD(day, -400, CURRENT_DATE());

GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.V_GA4_EVENTS_DAILY TO ROLE AV_APP_READ_ROLE;
GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.V_GA4_EVENTS_DAILY TO ROLE CLAUDE_RW;

-- check: row counts by property for the last 30 days
-- SELECT property_id, COUNT(*) AS rows
-- FROM ASSEMBLEDVIEW.MART.V_GA4_EVENTS_DAILY
-- WHERE date >= DATEADD(day, -30, CURRENT_DATE())
-- GROUP BY property_id
-- ORDER BY property_id;

-- UNIFIED_SCREEN_CLASS is the page title.
CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.V_GA4_PAGE_TITLE_DAILY COPY GRANTS AS
SELECT
  NULLIF(REGEXP_SUBSTR(property, '[0-9]+'), '') AS property_id,
  date::date AS date,
  unified_screen_class AS page_title,
  screen_page_views,
  total_users,
  new_users,
  key_events
FROM ASSEMBLEDVIEW.GOOGLE_ANALYTICS_4.PAGES_TITLE_AND_SCREEN_CLASS_REPORT
WHERE date::date >= DATEADD(day, -400, CURRENT_DATE());

GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.V_GA4_PAGE_TITLE_DAILY TO ROLE AV_APP_READ_ROLE;
GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.V_GA4_PAGE_TITLE_DAILY TO ROLE CLAUDE_RW;

-- check: row counts by property for the last 30 days
-- SELECT property_id, COUNT(*) AS rows
-- FROM ASSEMBLEDVIEW.MART.V_GA4_PAGE_TITLE_DAILY
-- WHERE date >= DATEADD(day, -30, CURRENT_DATE())
-- GROUP BY property_id
-- ORDER BY property_id;

-- PAGES_PATH_REPORT has total_users and screen_page_views. It has no sessions
-- column, so the audience column is total_users. Page title is
-- V_GA4_PAGE_TITLE_DAILY.
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

-- PAGE_REPORT is keyed by country, device, and search_type.
-- This view keeps search_type = 'web' and sums country and device.
-- position is weighted by impressions.
CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.V_GSC_PAGE_DAILY COPY GRANTS AS
SELECT
  site,
  date::date AS date,
  page,
  SUM(clicks) AS clicks,
  SUM(impressions) AS impressions,
  SUM(position * impressions) / NULLIF(SUM(impressions), 0) AS position
FROM ASSEMBLEDVIEW.GOOGLE_SEARCH_CONSOLE.PAGE_REPORT
WHERE search_type = 'web'
  AND date::date >= DATEADD(day, -400, CURRENT_DATE())
GROUP BY site, date::date, page;

GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.V_GSC_PAGE_DAILY TO ROLE AV_APP_READ_ROLE;
GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.V_GSC_PAGE_DAILY TO ROLE CLAUDE_RW;

-- check: row counts by site for the last 30 days
-- SELECT site, COUNT(*) AS rows
-- FROM ASSEMBLEDVIEW.MART.V_GSC_PAGE_DAILY
-- WHERE date >= DATEADD(day, -30, CURRENT_DATE())
-- GROUP BY site
-- ORDER BY site;
