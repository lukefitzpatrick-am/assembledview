-- ASSEMBLEDVIEW.MART.VW_PACING_TABOOLA
-- Live DDL captured 2026-10-20, then changed (TB1): the line id now also reads
-- new-style plan ids (hartm001PD3, boss010PD2), the same rule as
-- vw_pacing_dv360.sql. Before this only old-style ids (BICAU002PD1) were read,
-- so new campaigns landed on their numeric campaign id.
-- Covers every Taboola account Fivetran syncs: the Assembled Media network
-- (1726630) and its sub-accounts (Molicare SC 1858422, Boss Engineering SC
-- 1858420), plus the old partner account (1714302).
-- 2026-10-26 (live 00:42 PDT, checked with GET_DDL as CLAUDE_RW on 2026-10-28):
-- impressions are now VISIBLE_IMPRESSIONS (viewable), not IMPRESSIONS, at Luke's
-- request. The live body matches this file apart from the comments in the
-- line id block, which the live text does not carry.
USE SCHEMA ASSEMBLEDVIEW.MART;

CREATE OR REPLACE VIEW VW_PACING_TABOOLA COPY GRANTS (
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
WITH camp AS (
  SELECT ID, NAME, BRANDING_TEXT
  FROM ASSEMBLEDVIEW.TABOOLA.CAMPAIGN
  QUALIFY ROW_NUMBER() OVER (PARTITION BY ID ORDER BY _FIVETRAN_SYNCED DESC NULLS LAST, LENGTH(NAME) DESC) = 1
),
daily AS (
  SELECT
    P.CAMPAIGN_ID,
    P.DATE AS date_day,
    SUM(COALESCE(P.SPENT, 0)) AS amount_spent,
    SUM(COALESCE(P.VISIBLE_IMPRESSIONS, 0)) AS impressions,   -- was P.IMPRESSIONS (26 Oct, Luke: viewable)
    SUM(COALESCE(P.CLICKS, 0)) AS clicks,
    SUM(COALESCE(P.CPA_ACTIONS_NUM, 0)) AS results,
    MAX(P._FIVETRAN_SYNCED) AS max_fivetran_synced_at
  FROM ASSEMBLEDVIEW.TABOOLA.PLATFORM_REPORT P
  WHERE P.DATE IS NOT NULL AND P.CAMPAIGN_ID IS NOT NULL
  GROUP BY 1, 2
)
SELECT
  'Programmatic - Display' AS channel,
  d.date_day,
  COALESCE(c.NAME, d.CAMPAIGN_ID::varchar) AS line_item_name,
  LOWER(TRIM(COALESCE(
    -- 1. old style: three letters, AU, digits, code (BICAU002PD1)
    NULLIF(REGEXP_SUBSTR(COALESCE(c.NAME, ''), '[A-Z]{3}AU[0-9]{3,}[A-Z0-9]+'), ''),
    -- 2. new style: MBA (3 to 6 letters + 3 digits) + line code + number (hartm001PD3)
    NULLIF(REGEXP_SUBSTR(LOWER(COALESCE(c.NAME, '')), '[a-z]{3,6}[0-9]{3}(prod|pb|pa|pd|po|pv|ml|tv|np|sm|ra|mg|cn|dd|da|dv|bv|it|se|oh|in)[0-9]+'), ''),
    -- 3. else the campaign id
    d.CAMPAIGN_ID::varchar
  ))) AS line_item_id,
  COALESCE(c.NAME, d.CAMPAIGN_ID::varchar) AS entity_name,
  LOWER(TRIM(d.CAMPAIGN_ID::varchar)) AS entity_id,
  COALESCE(c.BRANDING_TEXT, c.NAME, d.CAMPAIGN_ID::varchar) AS campaign_name,
  d.amount_spent,
  d.impressions,
  d.clicks,
  d.results,
  0 AS video_3s_views,
  d.max_fivetran_synced_at,
  CURRENT_TIMESTAMP() AS updated_at
FROM daily d
LEFT JOIN camp c ON c.ID = d.CAMPAIGN_ID;

GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.VW_PACING_TABOOLA TO ROLE CLAUDE_RW;

-- One-off: history older than the 14-day refresh window keeps the campaign id.
-- Move it to the id the view now reads (expect 2 campaigns, BOSS010PD2 and
-- BOSS011PD1, from 2 Sep; Molicare 47861580 is already hartm001pd3 via HR1).
-- Checked 2026-10-20: 92 rows, 50349060 -> boss010pd2 (44 rows, $958.52),
-- 50349107 -> boss011pd1 (48 rows, $787.85).
-- Rows with an active LINE_ITEM_LABEL_MAP entry are left alone.
-- Preview first:
-- SELECT f.platform_line_item_id, f.line_item_id, v.line_item_id AS new_id, COUNT(*) n, ROUND(SUM(f.amount_spent), 2) spend
-- FROM ASSEMBLEDVIEW.MART.PACING_FACT f
-- JOIN (SELECT DISTINCT entity_id, line_item_id FROM ASSEMBLEDVIEW.MART.VW_PACING_TABOOLA) v ON v.entity_id = f.platform_line_item_id
-- WHERE f.channel = 'Programmatic - Display' AND f.line_item_id = f.platform_line_item_id AND v.line_item_id <> f.line_item_id
--   AND NOT EXISTS (SELECT 1 FROM ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP m WHERE m.is_active
--     AND LOWER(TRIM(m.channel)) = 'programmatic - display' AND LOWER(TRIM(m.platform_line_item_id)) = f.platform_line_item_id)
-- GROUP BY 1, 2, 3;
UPDATE ASSEMBLEDVIEW.MART.PACING_FACT f
SET line_item_id = v.line_item_id, updated_at = CURRENT_TIMESTAMP()
FROM (SELECT DISTINCT entity_id, line_item_id FROM ASSEMBLEDVIEW.MART.VW_PACING_TABOOLA) v
WHERE v.entity_id = f.platform_line_item_id
  AND f.channel = 'Programmatic - Display'
  AND f.line_item_id = f.platform_line_item_id
  AND v.line_item_id <> f.line_item_id
  AND NOT EXISTS (SELECT 1 FROM ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP m WHERE m.is_active
    AND LOWER(TRIM(m.channel)) = 'programmatic - display' AND LOWER(TRIM(m.platform_line_item_id)) = f.platform_line_item_id);
