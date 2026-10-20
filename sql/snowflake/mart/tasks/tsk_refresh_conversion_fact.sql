-- ASSEMBLEDVIEW.MART.TSK_REFRESH_CONVERSION_FACT
-- Run by Luke 2026-10-21 (plan section 8.3, look-back 14 days to match the
-- other pacing fact tasks; decision 11). Child of TSK_ROOT_DAILY_REFRESH.
-- MERGE CONVERSION_FACT from the five VW_CONVERSIONS_* views for the last 14 days.
-- Task graph rule: suspend the root, create the child, resume the child, resume the root.
USE ROLE ACCOUNTADMIN;
USE SCHEMA ASSEMBLEDVIEW.MART;

ALTER TASK ASSEMBLEDVIEW.MART.TSK_ROOT_DAILY_REFRESH SUSPEND;

CREATE OR REPLACE TASK ASSEMBLEDVIEW.MART.TSK_REFRESH_CONVERSION_FACT
  WAREHOUSE = AV_APP_WH
  AFTER ASSEMBLEDVIEW.MART.TSK_ROOT_DAILY_REFRESH
AS
MERGE INTO ASSEMBLEDVIEW.MART.CONVERSION_FACT t
USING (
  SELECT channel, date_day, platform_line_item_id, platform, event_key,
         MAX(event_name) AS event_name, MAX(event_category) AS event_category,
         SUM(conversions) AS conversions, SUM(conversion_value) AS conversion_value,
         MAX(max_fivetran_synced_at) AS max_fivetran_synced_at
  FROM (
    SELECT channel, date_day, platform_line_item_id, platform, event_key, event_name, event_category, conversions, conversion_value, max_fivetran_synced_at FROM ASSEMBLEDVIEW.MART.VW_CONVERSIONS_META
    UNION ALL SELECT channel, date_day, platform_line_item_id, platform, event_key, event_name, event_category, conversions, conversion_value, max_fivetran_synced_at FROM ASSEMBLEDVIEW.MART.VW_CONVERSIONS_GOOGLE_TOTAL
    UNION ALL SELECT channel, date_day, platform_line_item_id, platform, event_key, event_name, event_category, conversions, conversion_value, max_fivetran_synced_at FROM ASSEMBLEDVIEW.MART.VW_CONVERSIONS_GMP
    UNION ALL SELECT channel, date_day, platform_line_item_id, platform, event_key, event_name, event_category, conversions, conversion_value, max_fivetran_synced_at FROM ASSEMBLEDVIEW.MART.VW_CONVERSIONS_TIKTOK
    UNION ALL SELECT channel, date_day, platform_line_item_id, platform, event_key, event_name, event_category, conversions, conversion_value, max_fivetran_synced_at FROM ASSEMBLEDVIEW.MART.VW_CONVERSIONS_OTHER
  )
  WHERE date_day >= DATEADD(day, -14, CURRENT_DATE())
    AND platform_line_item_id IS NOT NULL AND platform_line_item_id <> ''
  GROUP BY 1, 2, 3, 4, 5
) s
ON  t.channel = s.channel AND t.date_day = s.date_day
AND t.platform_line_item_id = s.platform_line_item_id
AND t.platform = s.platform AND t.event_key = s.event_key
WHEN MATCHED THEN UPDATE SET
  t.event_name = s.event_name, t.event_category = s.event_category,
  t.conversions = s.conversions, t.conversion_value = s.conversion_value,
  t.max_fivetran_synced_at = s.max_fivetran_synced_at, t.updated_at = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN INSERT (channel, date_day, platform_line_item_id, platform, event_key, event_name,
  event_category, conversions, conversion_value, max_fivetran_synced_at, updated_at)
VALUES (s.channel, s.date_day, s.platform_line_item_id, s.platform, s.event_key, s.event_name,
  s.event_category, s.conversions, s.conversion_value, s.max_fivetran_synced_at, CURRENT_TIMESTAMP());

ALTER TASK ASSEMBLEDVIEW.MART.TSK_REFRESH_CONVERSION_FACT RESUME;
ALTER TASK ASSEMBLEDVIEW.MART.TSK_ROOT_DAILY_REFRESH RESUME;

-- One-off backfill from 1 Jan 2026 (run once, into an empty table; done 2026-10-21):
-- INSERT INTO ASSEMBLEDVIEW.MART.CONVERSION_FACT (channel, date_day, platform_line_item_id, platform, event_key,
--   event_name, event_category, conversions, conversion_value, max_fivetran_synced_at, updated_at)
-- SELECT channel, date_day, platform_line_item_id, platform, event_key, MAX(event_name), MAX(event_category),
--        SUM(conversions), SUM(conversion_value), MAX(max_fivetran_synced_at), CURRENT_TIMESTAMP()
-- FROM ( <the five-view UNION ALL above> )
-- WHERE date_day >= '2026-01-01' AND platform_line_item_id IS NOT NULL AND platform_line_item_id <> ''
-- GROUP BY 1, 2, 3, 4, 5;
