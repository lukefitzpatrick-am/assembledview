-- =============================================================================
-- MART_PACING.FACT_DELIVERY_DAILY — (re)create with Meta UNION arms
-- =============================================================================
-- Snowflake dynamic tables cannot ALTER the SELECT body; use CREATE OR REPLACE.
--
-- PREREQUISITE: ASSEMBLEDVIEW.STG_PACING.V_GOOGLE_ADS_AD_GROUP_DAILY must exist
-- and expose the SAME 14 columns in the SAME order as the Meta views:
--   DELIVERY_DATE, PLATFORM, ACCOUNT_ID, CAMPAIGN_ID, CAMPAIGN_NAME,
--   GROUP_ID, GROUP_NAME, GROUP_TYPE, SPEND, IMPRESSIONS, CLICKS,
--   CONVERSIONS, REVENUE, VIEW_THROUGH_CONVERSIONS
--
-- If your Google arm is inlined or named differently, replace the first branch
-- below before running.
--
-- After deploy:
--   ALTER DYNAMIC TABLE ASSEMBLEDVIEW.MART_PACING.FACT_DELIVERY_DAILY REFRESH;
--   ALTER DYNAMIC TABLE ASSEMBLEDVIEW.MART_PACING.FACT_LINE_ITEM_PACING_DAILY REFRESH;
-- =============================================================================

CREATE OR REPLACE DYNAMIC TABLE ASSEMBLEDVIEW.MART_PACING.FACT_DELIVERY_DAILY
  TARGET_LAG = '1 hour'
  WAREHOUSE = AV_APP_WH
  AS
SELECT * FROM ASSEMBLEDVIEW.STG_PACING.V_GOOGLE_ADS_AD_GROUP_DAILY
UNION ALL
SELECT * FROM ASSEMBLEDVIEW.STG_PACING.V_META_DAILY
UNION ALL
SELECT * FROM ASSEMBLEDVIEW.STG_PACING.V_META_CAMPAIGN_DAILY;
