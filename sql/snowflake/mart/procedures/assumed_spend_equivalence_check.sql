-- Read-only equivalence check. Do not INSERT. Do not CALL the procedure.
-- Compares assumed_spend rows the per-line path already wrote with a dry run of the
-- set-based SELECT in SP_REFRESH_ASSUMED_SPEND_DAILY. Keep that SELECT in step with this one.
-- Sample: 5 newspaper or TV lines whose bursts have ended, plus 5 lines with a day in October 2026.
-- Expect 10 rows (fewer if this morning's write has fewer matching lines). mismatches = 0 on every row.
-- written_rows = set_rows, and written_sum = set_sum.
-- A written-only row is a day the old MERGE kept after it left BURSTS_JSON. The rebuild deletes those.
-- Run this before another snapshot sync, and before CALL SP_REFRESH_ASSUMED_SPEND_DAILY('all').
USE SCHEMA ASSEMBLEDVIEW.MART;

WITH utc AS (
  SELECT TO_DATE(CONVERT_TIMEZONE('UTC', CURRENT_TIMESTAMP())) AS today
),
written_lines AS (
  SELECT
    LOWER(f.LINE_ITEM_ID) AS line_id,
    MAX(f.BURST_END_DATE) AS max_end
  FROM ASSEMBLEDVIEW.MART.FIXED_COST_REPORTED_DAILY_FACT f
  WHERE f.CAP_APPLIED = 'assumed_spend'
    AND f.CALCULATED_AT >= DATEADD(hour, -18, CURRENT_TIMESTAMP()::TIMESTAMP_NTZ)
  GROUP BY 1
),
past_media AS (
  SELECT w.line_id, 'past_np_tv' AS bucket
  FROM written_lines w
  CROSS JOIN utc u
  WHERE REGEXP_LIKE(w.line_id, '.*(np|tv)[0-9]+$')
    AND w.max_end < u.today
  QUALIFY ROW_NUMBER() OVER (ORDER BY w.line_id) <= 5
),
this_month AS (
  SELECT w.line_id, 'october_2026' AS bucket
  FROM written_lines w
  WHERE EXISTS (
      SELECT 1
      FROM ASSEMBLEDVIEW.MART.FIXED_COST_REPORTED_DAILY_FACT f
      WHERE LOWER(f.LINE_ITEM_ID) = w.line_id
        AND f.CAP_APPLIED = 'assumed_spend'
        AND f.DATE_DAY BETWEEN DATE '2026-10-01' AND DATE '2026-10-31'
    )
    AND w.line_id NOT IN (SELECT line_id FROM past_media)
  QUALIFY ROW_NUMBER() OVER (ORDER BY w.line_id) <= 5
),
sample AS (
  SELECT * FROM past_media
  UNION ALL
  SELECT * FROM this_month
),
latest AS (
  SELECT
    LOWER(s.LINE_ITEM_ID) AS line_id,
    s.LINE_ITEM_ID,
    s.BUY_TYPE,
    s.BURSTS_JSON
  FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT s
  WHERE s.ASSUME_SPEND = TRUE
    AND s.LINE_ITEM_ID IS NOT NULL
    AND LOWER(s.LINE_ITEM_ID) IN (SELECT line_id FROM sample)
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY LOWER(s.LINE_ITEM_ID)
    ORDER BY s.SYNCED_AT DESC
  ) = 1
),
points AS (
  SELECT
    l.line_id,
    b.INDEX::NUMBER AS burst_index,
    d.INDEX::NUMBER AS day_index,
    ARRAY_SIZE(IFF(IS_ARRAY(b.value:assumedDailyCents), b.value:assumedDailyCents, PARSE_JSON('[]'))) AS series_n,
    TRY_TO_DATE(LEFT(TO_VARCHAR(d.value:date), 10)) AS date_day,
    IFF(
      TRY_TO_DOUBLE(TO_VARCHAR(d.value:cents)) IS NULL,
      0,
      TRY_TO_DOUBLE(TO_VARCHAR(d.value:cents)) / 100
    )::DECIMAL(18, 4) AS reported_spend
  FROM latest l,
       TABLE(FLATTEN(input => IFF(IS_ARRAY(l.BURSTS_JSON), l.BURSTS_JSON, PARSE_JSON('[]')))) b,
       TABLE(FLATTEN(input => IFF(IS_ARRAY(b.value:assumedDailyCents), b.value:assumedDailyCents, PARSE_JSON('[]')))) d
),
set_based AS (
  SELECT
    line_id,
    burst_index,
    date_day,
    reported_spend,
    IFF(
      date_day <= (SELECT today FROM utc),
      ((day_index + 1) / NULLIF(series_n, 0))::DECIMAL(8, 4),
      0::DECIMAL(8, 4)
    ) AS share_today
  FROM points
  WHERE date_day IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY line_id, burst_index, date_day
    ORDER BY day_index DESC
  ) = 1
),
written AS (
  SELECT
    LOWER(f.LINE_ITEM_ID) AS line_id,
    f.BURST_INDEX AS burst_index,
    f.DATE_DAY AS date_day,
    f.REPORTED_SPEND::DECIMAL(18, 4) AS reported_spend,
    f.SHARE_TODAY::DECIMAL(8, 4) AS share_today
  FROM ASSEMBLEDVIEW.MART.FIXED_COST_REPORTED_DAILY_FACT f
  WHERE f.CAP_APPLIED = 'assumed_spend'
    AND LOWER(f.LINE_ITEM_ID) IN (SELECT line_id FROM sample)
),
joined AS (
  SELECT
    COALESCE(w.line_id, s.line_id) AS line_id,
    w.date_day AS written_day,
    s.date_day AS set_day,
    w.reported_spend AS written_spend,
    s.reported_spend AS set_spend,
    w.share_today AS written_share,
    s.share_today AS set_share,
    w.line_id AS written_line,
    s.line_id AS set_line
  FROM written w
  FULL OUTER JOIN set_based s
    ON s.line_id = w.line_id
   AND s.burst_index = w.burst_index
   AND s.date_day = w.date_day
)
SELECT
  sa.bucket,
  sa.line_id,
  COUNT(j.written_day) AS written_rows,
  COUNT(j.set_day) AS set_rows,
  SUM(j.written_spend) AS written_sum,
  SUM(j.set_spend) AS set_sum,
  COUNT_IF(
    j.written_line IS NULL
    OR j.set_line IS NULL
    OR j.written_spend IS DISTINCT FROM j.set_spend
    OR j.written_share IS DISTINCT FROM j.set_share
  ) AS mismatches
FROM sample sa
LEFT JOIN joined j ON j.line_id = sa.line_id
GROUP BY sa.bucket, sa.line_id
ORDER BY sa.bucket, sa.line_id;

