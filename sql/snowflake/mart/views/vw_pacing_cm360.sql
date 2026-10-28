-- ASSEMBLEDVIEW.MART.VW_PACING_CM360
-- Captured from Snowflake GET_DDL (CLAUDE_RW) on 2026-10-28, after SQ1.
-- SQ1 (28 Oct, Sinch Quantcast 12 to 27 Oct) added the UNION ALL of
-- MART.CM360_MANUAL_ROWS: partner delivery that ran without CM360 tags, loaded
-- by hand in the CM360 shape. With no manual rows the view returns exactly the
-- Fivetran CM_360_PACING result. Table capture:
-- sql/snowflake/mart/tables/cm360_manual_rows.sql.
-- Read by TSK_REFRESH_PACING_FACT (14-day window). PF1's stale-key DELETE
-- treats manual rows as source rows, so they are not deleted from PACING_FACT.
-- Checked 2026-10-28: 448 manual rows (Sinch, 12 to 27 Oct), 2,656,066 imps.
USE SCHEMA ASSEMBLEDVIEW.MART;

CREATE OR REPLACE VIEW VW_PACING_CM360 COPY GRANTS (
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
  MAX_FIVETRAN_SYNCED_AT,
  UPDATED_AT
) AS
SELECT
  'Ad Serving - CM360' AS channel,
  P.DATE AS date_day,
  P.PLACEMENT AS line_item_name,
  LOWER(TRIM(COALESCE(NULLIF(REGEXP_SUBSTR(P.PLACEMENT, '[^-]+$'), ''), P.PLACEMENT))) AS line_item_id,
  P.PLACEMENT AS entity_name,
  LOWER(TRIM(P.PLACEMENT)) AS entity_id,
  P.CAMPAIGN AS campaign_name,
  0                    AS amount_spent,
  P.IMPRESSIONS        AS impressions,
  P.CLICKS             AS clicks,
  P.TOTAL_CONVERSIONS  AS results,
  P.VIDEO_COMPLETIONS  AS video_3s_views,
  MAX(P._FIVETRAN_SYNCED) OVER (PARTITION BY P.DATE) AS max_fivetran_synced_at,
  CURRENT_TIMESTAMP() AS updated_at
FROM ASSEMBLEDVIEW.DOUBLE_CLICK_CAMPAIGN_MANAGER.CM_360_PACING P
UNION ALL
-- Manual rows (partners that ran without CM360 tags). Same shape and rules.
SELECT
  'Ad Serving - CM360',
  M.DATE,
  M.PLACEMENT,
  LOWER(TRIM(COALESCE(NULLIF(REGEXP_SUBSTR(M.PLACEMENT, '[^-]+$'), ''), M.PLACEMENT))),
  M.PLACEMENT,
  LOWER(TRIM(M.PLACEMENT)),
  M.CAMPAIGN,
  0,
  M.IMPRESSIONS,
  M.CLICKS,
  M.TOTAL_CONVERSIONS,
  M.VIDEO_COMPLETIONS,
  M.LOADED_AT,
  CURRENT_TIMESTAMP()
FROM ASSEMBLEDVIEW.MART.CM360_MANUAL_ROWS M;
