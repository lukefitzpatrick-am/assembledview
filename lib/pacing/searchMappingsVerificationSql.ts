/**
 * Shared Snowflake verification SQL for search / suffix_id pacing mappings.
 * Used by the backfill script and docs; column names match MART_PACING tables.
 */

/** Active search suffix_id rows in DIM_PLAN_MAPPING */
export const SQL_COUNT_SEARCH_SUFFIX_DIM = `
SELECT COUNT(*) AS C
FROM ASSEMBLEDVIEW.MART_PACING.DIM_PLAN_MAPPING
WHERE LOWER(TRIM(COALESCE(MEDIA_TYPE, ''))) = 'search'
  AND LOWER(TRIM(COALESCE(MATCH_TYPE, ''))) = 'suffix_id'
  AND IS_ACTIVE = TRUE
`.trim()

/** Distinct line items with search delivery in FACT_LINE_ITEM_PACING_DAILY (last 7 days) */
export const SQL_COUNT_SEARCH_DELIVERY_7D = `
SELECT COUNT(DISTINCT AV_LINE_ITEM_ID) AS C
FROM ASSEMBLEDVIEW.MART_PACING.FACT_LINE_ITEM_PACING_DAILY
WHERE LOWER(TRIM(COALESCE(MEDIA_TYPE, ''))) = 'search'
  AND DELIVERY_DATE::DATE >= DATEADD(day, -7, CURRENT_DATE)
`.trim()

/**
 * Search suffix mappings with no matching fact row in the last 7 days (typos, renames, no spend).
 */
export const SQL_SEARCH_MAPPINGS_NO_RECENT_DELIVERY = `
SELECT
  m.AV_LINE_ITEM_ID,
  m.AV_LINE_ITEM_LABEL,
  m.AV_LINE_ITEM_CODE
FROM ASSEMBLEDVIEW.MART_PACING.DIM_PLAN_MAPPING m
LEFT JOIN ASSEMBLEDVIEW.MART_PACING.FACT_LINE_ITEM_PACING_DAILY f
  ON f.AV_LINE_ITEM_ID = m.AV_LINE_ITEM_ID
  AND f.DELIVERY_DATE::DATE >= DATEADD(day, -7, CURRENT_DATE)
WHERE LOWER(TRIM(COALESCE(m.MEDIA_TYPE, ''))) = 'search'
  AND LOWER(TRIM(COALESCE(m.MATCH_TYPE, ''))) = 'suffix_id'
  AND m.IS_ACTIVE = TRUE
  AND f.AV_LINE_ITEM_ID IS NULL
LIMIT 50
`.trim()
