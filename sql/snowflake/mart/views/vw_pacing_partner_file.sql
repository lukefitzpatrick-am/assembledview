-- ASSEMBLEDVIEW.MART.VW_PACING_PARTNER_FILE
-- Captured from production 2026-09-15 (applied 2026-09-14, Channel Factory runbook rev3).
-- Feeds TSK_REFRESH_PACING_FACT. Channel Factory only until PI-1 adds per-source parsing.
USE SCHEMA ASSEMBLEDVIEW.MART;

create or replace view VW_PACING_PARTNER_FILE(
	CHANNEL,
	DATE_DAY,
	LINE_ITEM_NAME,
	LINE_ITEM_ID,
	ENTITY_NAME,
	ENTITY_ID,
	CAMPAIGN_NAME,
	AMOUNT_SPENT,
	IMPRESSIONS,
	CLICKS,
	RESULTS,
	VIDEO_3S_VIEWS,
	MAX_FIVETRAN_SYNCED_AT
) as
SELECT
  'Programmatic - Video'                   AS CHANNEL,          -- 20 chars, fits VARCHAR(22)
  d.REPORT_DATE                            AS DATE_DAY,
  MAX(d.PARTNER_LINE_ITEM_NAME)            AS LINE_ITEM_NAME,
  LOWER(TRIM(d.AV_LINE_ITEM_ID))           AS LINE_ITEM_ID,     -- our plan code
  MAX(d.PARTNER_CAMPAIGN_NAME)             AS ENTITY_NAME,
  LOWER(TRIM(d.PARTNER_LINE_ITEM_NAME))    AS ENTITY_ID,        -- REQUIRED. See below.
  MAX(d.PARTNER_CAMPAIGN_NAME)             AS CAMPAIGN_NAME,
  CAST(0 AS FLOAT)                         AS AMOUNT_SPENT,     -- CF reports no platform cost
  SUM(d.IMPRESSIONS)                       AS IMPRESSIONS,
  SUM(d.CLICKS)                            AS CLICKS,
  CAST(NULL AS FLOAT)                      AS RESULTS,
  SUM(d.COMPLETED_VIEWS)                   AS VIDEO_3S_VIEWS,   -- TEMPORARY dual-write.
                                                                -- The proc reads this for cpv.
                                                                -- Remove when the proc reads
                                                                -- COMPLETED_VIEWS. See step 12.
  MAX(d.LOADED_AT)                         AS MAX_FIVETRAN_SYNCED_AT
FROM ASSEMBLEDVIEW.RAW.PARTNER_DELIVERY_DAILY d
WHERE d.SOURCE = 'Channel Factory'
  AND d.AV_LINE_ITEM_ID IS NOT NULL        -- uncoded rows stay in RAW, per your 14 Sep call
GROUP BY 1, 2, 4, 6;
