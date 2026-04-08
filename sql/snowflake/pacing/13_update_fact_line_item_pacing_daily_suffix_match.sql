-- =============================================================================
-- MART_PACING.FACT_LINE_ITEM_PACING_DAILY — suffix_id match + refresh
-- =============================================================================
-- Replaces dynamic table body. Join predicates MUST stay in sync with
-- ASSEMBLEDVIEW.VW_PACING.V_DELIVERY_PACING (see 14_vw_pacing_v_delivery_pacing.sql).
--
-- If your environment already had a different FACT_LINE_ITEM_PACING_DAILY shape
-- (extra columns, joins to plan dims, etc.), merge these predicates into your
-- production definition via GET_DDL rather than running this blindly.
--
-- After deploy:
--   ALTER DYNAMIC TABLE ASSEMBLEDVIEW.MART_PACING.FACT_LINE_ITEM_PACING_DAILY REFRESH;
-- =============================================================================

CREATE OR REPLACE DYNAMIC TABLE ASSEMBLEDVIEW.MART_PACING.FACT_LINE_ITEM_PACING_DAILY
  TARGET_LAG = '1 hour'
  WAREHOUSE = AV_APP_WH
AS
WITH matched AS (
  SELECT
    f.DELIVERY_DATE::DATE AS DELIVERY_DATE,
    m.CLIENTS_ID,
    m.MEDIA_PLAN_ID,
    m.AV_LINE_ITEM_ID,
    m.AV_LINE_ITEM_LABEL,
    m.MEDIA_TYPE,
    m.PLATFORM,
    f.SPEND * COALESCE(m.BUDGET_SPLIT_PCT, 100) / 100.0 AS SPEND,
    f.IMPRESSIONS * COALESCE(m.BUDGET_SPLIT_PCT, 100) / 100.0 AS IMPRESSIONS,
    f.CLICKS * COALESCE(m.BUDGET_SPLIT_PCT, 100) / 100.0 AS CLICKS,
    f.CONVERSIONS * COALESCE(m.BUDGET_SPLIT_PCT, 100) / 100.0 AS CONVERSIONS
  FROM ASSEMBLEDVIEW.MART_PACING.FACT_DELIVERY_DAILY f
  INNER JOIN ASSEMBLEDVIEW.MART_PACING.DIM_PLAN_MAPPING m
    ON m.IS_ACTIVE = TRUE
    AND LOWER(TRIM(COALESCE(f.PLATFORM, ''))) = LOWER(TRIM(COALESCE(m.PLATFORM, '')))
    AND (m.START_DATE IS NULL OR f.DELIVERY_DATE::DATE >= m.START_DATE)
    AND (m.END_DATE IS NULL OR f.DELIVERY_DATE::DATE <= m.END_DATE)
    AND CASE m.MATCH_TYPE
      WHEN 'exact' THEN f.CAMPAIGN_NAME = m.CAMPAIGN_NAME_PATTERN
      WHEN 'prefix' THEN f.CAMPAIGN_NAME ILIKE m.CAMPAIGN_NAME_PATTERN || '%'
      WHEN 'regex' THEN REGEXP_LIKE(f.CAMPAIGN_NAME, m.CAMPAIGN_NAME_PATTERN, 'i')
      WHEN 'suffix_id' THEN TRUE
      ELSE FALSE
    END
    AND (
      (m.MATCH_TYPE = 'suffix_id'
        AND f.GROUP_TYPE IN ('ad_group', 'asset_group')
        AND LOWER(TRIM(REGEXP_SUBSTR(f.GROUP_NAME, '[^-]+$'))) = LOWER(TRIM(m.AV_LINE_ITEM_CODE))
      )
      OR (
        m.MATCH_TYPE <> 'suffix_id'
        AND (
          (m.GROUP_NAME_PATTERN IS NULL AND f.GROUP_TYPE = 'campaign')
          OR (m.GROUP_NAME_PATTERN IS NOT NULL AND f.GROUP_TYPE IN ('ad_group', 'asset_group'))
        )
        AND CASE m.MATCH_TYPE
          WHEN 'exact' THEN m.GROUP_NAME_PATTERN IS NULL OR f.GROUP_NAME = m.GROUP_NAME_PATTERN
          WHEN 'prefix' THEN m.GROUP_NAME_PATTERN IS NULL OR f.GROUP_NAME ILIKE m.GROUP_NAME_PATTERN || '%'
          WHEN 'regex' THEN m.GROUP_NAME_PATTERN IS NULL OR REGEXP_LIKE(f.GROUP_NAME, m.GROUP_NAME_PATTERN, 'i')
          ELSE FALSE
        END
      )
    )
)
SELECT
  DELIVERY_DATE,
  CLIENTS_ID,
  MEDIA_PLAN_ID,
  AV_LINE_ITEM_ID,
  MAX(AV_LINE_ITEM_LABEL) AS AV_LINE_ITEM_LABEL,
  MAX(MEDIA_TYPE) AS MEDIA_TYPE,
  MAX(PLATFORM) AS PLATFORM,
  SUM(SPEND) AS SPEND,
  SUM(IMPRESSIONS) AS IMPRESSIONS,
  SUM(CLICKS) AS CLICKS,
  SUM(CONVERSIONS) AS CONVERSIONS
FROM matched
GROUP BY DELIVERY_DATE, CLIENTS_ID, MEDIA_PLAN_ID, AV_LINE_ITEM_ID;
