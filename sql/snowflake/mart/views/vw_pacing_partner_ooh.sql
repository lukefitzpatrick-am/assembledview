-- ASSEMBLEDVIEW.MART.VW_PACING_PARTNER_OOH
-- VI1 2026-10-26: keyed by Vistar Insertion Order (ENTITY_ID = lower IO id), not campaign.
-- Applied by sql/snowflake/mart/migrations/2026-10-26_VI1_vistar_insertion_order_entity_ACCOUNTADMIN.sql
-- (step 4). Capture only; this file is not applied by the commit.
-- Previous shape (campaign keyed, 2026-09-15/16) is in git history of this file.
-- Feeds TSK_REFRESH_PACING_FACT. RESULTS = plays on this channel only (SUM(PLAYS)).
-- Line attribution at read time: Contract Number plan code, else RAW.PARTNER_LINE_MAP by
-- PARTNER_INSERTION_ORDER_ID. Unmapped IOs stay in RAW. The map is collapsed per IO first:
-- Snowflake does not enforce its key, and an unaggregated map join tripled delivery on 2026-09-15.
USE SCHEMA ASSEMBLEDVIEW.MART;

CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.VW_PACING_PARTNER_OOH(
  CHANNEL, DATE_DAY, LINE_ITEM_NAME, LINE_ITEM_ID, ENTITY_NAME, ENTITY_ID, CAMPAIGN_NAME,
  AMOUNT_SPENT, IMPRESSIONS, CLICKS, RESULTS, VIDEO_3S_VIEWS, MAX_FIVETRAN_SYNCED_AT
) AS
WITH io_map AS (
  -- collapsed: Snowflake does not enforce the map's key
  SELECT LOWER(TRIM(PARTNER_INSERTION_ORDER_ID)) AS io_key,
         MAX(NULLIF(TRIM(AV_LINE_ITEM_ID), '')) AS AV_LINE_ITEM_ID
  FROM ASSEMBLEDVIEW.RAW.PARTNER_LINE_MAP
  WHERE SOURCE_SLUG = 'vistar' AND IS_ACTIVE
    AND NULLIF(TRIM(PARTNER_INSERTION_ORDER_ID), '') IS NOT NULL
  GROUP BY 1
),
src AS (
  SELECT d.REPORT_DATE,
         LOWER(TRIM(d.PARTNER_INSERTION_ORDER_ID)) AS io_key,
         d.PARTNER_INSERTION_ORDER_NAME,
         d.AMOUNT_SPENT, d.IMPRESSIONS, d.PLAYS, d.LOADED_AT,
         LOWER(REGEXP_SUBSTR(d.AV_LINE_ITEM_ID, '[A-Za-z]{3,}[0-9]{3}P[VO][0-9]+', 1, 1, 'i')) AS file_code,
         LOWER(TRIM(COALESCE(
           REGEXP_SUBSTR(d.AV_LINE_ITEM_ID, '[A-Za-z]{3,}[0-9]{3}P[VO][0-9]+', 1, 1, 'i'),
           m.AV_LINE_ITEM_ID
         ))) AS resolved_line_item_id
  FROM ASSEMBLEDVIEW.RAW.PARTNER_DELIVERY_DAILY d
  LEFT JOIN io_map m ON m.io_key = LOWER(TRIM(d.PARTNER_INSERTION_ORDER_ID))
  WHERE d.SOURCE = 'Vistar'
    AND NULLIF(TRIM(d.PARTNER_INSERTION_ORDER_ID), '') IS NOT NULL
)
SELECT
  'Programmatic - OOH'                    AS CHANNEL,
  REPORT_DATE                             AS DATE_DAY,
  MAX(PARTNER_INSERTION_ORDER_NAME)       AS LINE_ITEM_NAME,
  resolved_line_item_id                   AS LINE_ITEM_ID,
  MAX(PARTNER_INSERTION_ORDER_NAME)       AS ENTITY_NAME,
  -- IO id. A row whose Contract Number carries a plan code gets io:code so it can
  -- never share a PACING_FACT key with the IO's mapped rows on another line.
  io_key || IFF(file_code IS NULL, '', ':' || file_code) AS ENTITY_ID,
  MAX(PARTNER_INSERTION_ORDER_NAME)       AS CAMPAIGN_NAME,
  SUM(AMOUNT_SPENT)                       AS AMOUNT_SPENT,      -- Vistar Revenue = client cost
  ROUND(SUM(IMPRESSIONS))                 AS IMPRESSIONS,
  0                                       AS CLICKS,
  SUM(PLAYS)                              AS RESULTS,           -- plays ride in RESULTS on this channel
  0                                       AS VIDEO_3S_VIEWS,
  MAX(LOADED_AT)                          AS MAX_FIVETRAN_SYNCED_AT
FROM src
WHERE resolved_line_item_id IS NOT NULL
GROUP BY REPORT_DATE, resolved_line_item_id, io_key || IFF(file_code IS NULL, '', ':' || file_code);
