-- Advertiser names the app can offer in the CM360 / DV360 picker.
-- AUTHOR ONLY. Luke runs this as a role that can SELECT both raw tables
-- (the other MART views are owned by ACCOUNTADMIN). Do not run it from the app.
--
-- A regular Snowflake view reads its base tables with the view owner's
-- privileges. GRANT SELECT on this view is enough for AV_APP_READ_ROLE.
-- That role still has no grant on the raw schemas (AV-RB0).
--
-- DV360's activity date is `date` (see VW_STG_DV360_PACING). CM360 uses the
-- same unquoted `date` column on CM_360_PACING. If DESCRIBE shows another
-- name, change that one reference before running.

USE SCHEMA ASSEMBLEDVIEW.MART;

CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.V_PLATFORM_ADVERTISERS COPY GRANTS AS
SELECT
  platform,
  advertiser_name,
  MIN(seen_on) AS first_seen,
  MAX(seen_on) AS last_seen,
  COUNT(*) AS row_count
FROM (
  SELECT
    'cm360' AS platform,
    TRIM(advertiser) AS advertiser_name,
    date::date AS seen_on
  FROM ASSEMBLEDVIEW.DOUBLE_CLICK_CAMPAIGN_MANAGER.CM_360_PACING
  WHERE date >= DATEADD(day, -365, CURRENT_DATE())
    AND advertiser IS NOT NULL
    AND TRIM(advertiser) <> ''
    AND advertiser NOT LIKE 'BidManager_Advertiser_DO_NOT_EDIT%'

  UNION ALL

  SELECT
    'dv360' AS platform,
    TRIM(advertiser) AS advertiser_name,
    date::date AS seen_on
  FROM ASSEMBLEDVIEW.GOOGLE_DISPLAY_AND_VIDEO_360.DV_360_PACING
  WHERE date >= DATEADD(day, -365, CURRENT_DATE())
    AND advertiser IS NOT NULL
    AND TRIM(advertiser) <> ''
    AND advertiser NOT LIKE 'BidManager_Advertiser_DO_NOT_EDIT%'
)
GROUP BY platform, advertiser_name;

GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.V_PLATFORM_ADVERTISERS TO ROLE AV_APP_READ_ROLE;
GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.V_PLATFORM_ADVERTISERS TO ROLE CLAUDE_RW;
