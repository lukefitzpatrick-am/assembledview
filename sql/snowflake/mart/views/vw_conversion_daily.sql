-- ASSEMBLEDVIEW.MART.VW_CONVERSION_DAILY
-- Run by Luke 2026-10-21 (plan section 8.4). Matches GET_DDL.
-- Adds LINE_ITEM_ID from the three pacing facts: same channel, day and
-- platform id first, then the latest line id for that channel and platform id
-- (conversions can land on days with no delivery row).
-- Read by lib/snowflake/conversions.ts (app/api/pacing/conversions).
USE ROLE ACCOUNTADMIN;
USE SCHEMA ASSEMBLEDVIEW.MART;

CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.VW_CONVERSION_DAILY COPY GRANTS AS
WITH ids AS (
  SELECT channel, date_day, LOWER(TRIM(platform_line_item_id)) pid, line_item_id FROM ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT
  UNION ALL SELECT channel, date_day, LOWER(TRIM(platform_line_item_id)), line_item_id FROM ASSEMBLEDVIEW.MART.PACING_FACT
  UNION ALL SELECT channel, date_day, LOWER(TRIM(platform_line_item_id)), line_item_id FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT
),
day_map AS (SELECT channel, date_day, pid, MAX(line_item_id) line_item_id FROM ids GROUP BY 1, 2, 3),
latest_map AS (
  SELECT channel, pid, line_item_id FROM ids
  QUALIFY ROW_NUMBER() OVER (PARTITION BY channel, pid ORDER BY date_day DESC) = 1
)
SELECT c.*, LOWER(COALESCE(d.line_item_id, l.line_item_id)) AS line_item_id
FROM ASSEMBLEDVIEW.MART.CONVERSION_FACT c
LEFT JOIN day_map d ON d.channel = c.channel AND d.date_day = c.date_day AND d.pid = c.platform_line_item_id
LEFT JOIN latest_map l ON l.channel = c.channel AND l.pid = c.platform_line_item_id;
