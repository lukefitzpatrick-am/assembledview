-- ASSEMBLEDVIEW.MART.SP_REFRESH_ASSUMED_SPEND_DAILY
-- Set-based copy of the JavaScript assumed-spend branch in SP_REFRESH_FIXED_COST_REPORTED_DAILY.
-- One source of truth: BURSTS_JSON assumedDailyCents → daily rows (cents / 100, CAP_APPLIED 'assumed_spend').
-- SCOPE 'changed' (default): latest snapshot row per LOWER(id) whose SYNCED_AT is after the last
-- successful run, plus any line with an assumedDailyCents date in the last 3 UTC days.
-- An empty run log selects every qualifying line, same as 'all'.
-- SCOPE 'all': every ASSUME_SPEND line, full history.
-- LINE_ITEM_ID_FILTER: one line, full history. The inner procedure's single-line CALL passes this.
-- Removal (not ASSUME_SPEND on the latest row, or a pacing / search / social fact row) is set-based
-- for every line, on both scopes. A filter limits that delete to the one line.
-- Daily rows for a line in scope are deleted and inserted again, so a day that left the JSON goes away.
-- The per-line MERGE left those days. IS_LOCKED is true, matching BACKFILL_MODE true.
-- Today for shareToday is the UTC date, matching JavaScript toISOString().slice(0, 10).
-- Burst and line-item facts are merged from the same rows so the Direct reader stays in step.
-- AUTHOR ONLY — Luke applies in Snowsight. CREATE OR REPLACE PROCEDURE does not copy grants.
-- Re-apply USAGE on this procedure only if a role other than the owner calls it.
-- The nightly task calls SP_REFRESH_FIXED_COST_NIGHTLY, which is EXECUTE AS OWNER, so the task
-- role does not need a new grant when that owner also owns this procedure.
USE SCHEMA ASSEMBLEDVIEW.MART;

CREATE OR REPLACE PROCEDURE ASSEMBLEDVIEW.MART.SP_REFRESH_ASSUMED_SPEND_DAILY(
  SCOPE VARCHAR DEFAULT 'changed',
  LINE_ITEM_ID_FILTER VARCHAR DEFAULT NULL
)
RETURNS VARCHAR
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
DECLARE
  scope_norm VARCHAR;
  filter_id VARCHAR;
  last_run TIMESTAMP_NTZ;
  utc_today DATE;
  line_count NUMBER;
  row_count NUMBER;
BEGIN
  scope_norm := LOWER(COALESCE(SCOPE, 'changed'));
  filter_id := NULLIF(LOWER(TRIM(LINE_ITEM_ID_FILTER)), '');
  IF (scope_norm NOT IN ('changed', 'all')) THEN
    RETURN 'refused: scope must be changed or all';
  END IF;

  utc_today := TO_DATE(CONVERT_TIMEZONE('UTC', CURRENT_TIMESTAMP()));
  SELECT MAX(run_at) INTO :last_run
  FROM ASSEMBLEDVIEW.MART.ASSUMED_SPEND_RUN_LOG;

  -- Same removal as deleteStaleAssumedSpendRows. Both scopes. Filter limits it to one line.
  DELETE FROM ASSEMBLEDVIEW.MART.FIXED_COST_REPORTED_DAILY_FACT f
  WHERE f.CAP_APPLIED = 'assumed_spend'
    AND (:filter_id IS NULL OR LOWER(f.LINE_ITEM_ID) = :filter_id)
    AND (
      NOT EXISTS (
        SELECT 1
        FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT s
        WHERE LOWER(s.LINE_ITEM_ID) = LOWER(f.LINE_ITEM_ID)
          AND s.ASSUME_SPEND = TRUE
          AND s.SYNCED_AT = (
            SELECT MAX(s2.SYNCED_AT)
            FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT s2
            WHERE LOWER(s2.LINE_ITEM_ID) = LOWER(s.LINE_ITEM_ID)
          )
      )
      OR EXISTS (
        SELECT 1 FROM ASSEMBLEDVIEW.MART.PACING_FACT p
        WHERE LOWER(p.LINE_ITEM_ID) = LOWER(f.LINE_ITEM_ID)
      )
      OR EXISTS (
        SELECT 1 FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT p
        WHERE LOWER(p.LINE_ITEM_ID) = LOWER(f.LINE_ITEM_ID)
      )
      OR EXISTS (
        SELECT 1 FROM ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT p
        WHERE LOWER(p.LINE_ITEM_ID) = LOWER(f.LINE_ITEM_ID)
      )
    );

  CREATE OR REPLACE TEMPORARY TABLE _assumed_lines AS
  WITH latest AS (
    SELECT
      LOWER(LINE_ITEM_ID) AS line_id,
      LINE_ITEM_ID,
      MBA_NUMBER,
      LINE_ITEM_NAME,
      BUY_TYPE,
      FIXED_COST_MEDIA,
      BURSTS_JSON,
      SYNCED_AT
    FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT
    WHERE ASSUME_SPEND = TRUE
      AND LINE_ITEM_ID IS NOT NULL
    QUALIFY ROW_NUMBER() OVER (
      PARTITION BY LOWER(LINE_ITEM_ID)
      ORDER BY SYNCED_AT DESC
    ) = 1
  ),
  -- Lines with an assumedDailyCents date in the last 3 UTC days. Built once here and
  -- joined below: a correlated EXISTS over LATERAL FLATTEN inside the OR fails with
  -- "Unsupported subquery type cannot be evaluated" whenever scope is 'changed' and the
  -- run log is not empty, which failed TSK_REFRESH_FIXED_COST_REPORTED every night
  -- from 14 Oct 2026 (2026-10-21 audit).
  recent AS (
    SELECT DISTINCT l.line_id
    FROM latest l,
         TABLE(FLATTEN(input => IFF(IS_ARRAY(l.BURSTS_JSON), l.BURSTS_JSON, PARSE_JSON('[]')))) b,
         LATERAL FLATTEN(input => IFF(IS_ARRAY(b.value:assumedDailyCents), b.value:assumedDailyCents, PARSE_JSON('[]'))) d
    WHERE TRY_TO_DATE(LEFT(TO_VARCHAR(d.value:date), 10))
          BETWEEN DATEADD(day, -2, :utc_today) AND :utc_today
  )
  SELECT
    l.line_id,
    l.LINE_ITEM_ID,
    l.MBA_NUMBER,
    l.LINE_ITEM_NAME,
    l.BUY_TYPE,
    l.FIXED_COST_MEDIA,
    l.BURSTS_JSON,
    l.SYNCED_AT
  FROM latest l
  LEFT JOIN recent r ON r.line_id = l.line_id
  WHERE NOT EXISTS (
      SELECT 1 FROM ASSEMBLEDVIEW.MART.PACING_FACT p
      WHERE LOWER(p.LINE_ITEM_ID) = l.line_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT p
      WHERE LOWER(p.LINE_ITEM_ID) = l.line_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT p
      WHERE LOWER(p.LINE_ITEM_ID) = l.line_id
    )
    AND (
      :filter_id IS NOT NULL AND l.line_id = :filter_id
      OR :filter_id IS NULL AND :scope_norm = 'all'
      OR :filter_id IS NULL AND :scope_norm = 'changed' AND (
        :last_run IS NULL
        OR l.SYNCED_AT > :last_run
        OR r.line_id IS NOT NULL
      )
    );

  CREATE OR REPLACE TEMPORARY TABLE _assumed_bursts AS
  SELECT
    s.line_id,
    s.LINE_ITEM_ID,
    s.MBA_NUMBER,
    s.LINE_ITEM_NAME,
    s.BUY_TYPE,
    s.FIXED_COST_MEDIA,
    b.INDEX::NUMBER AS burst_index,
    TRY_TO_DATE(LEFT(TO_VARCHAR(b.value:startDate), 10)) AS burst_start_date,
    TRY_TO_DATE(LEFT(TO_VARCHAR(b.value:endDate), 10)) AS burst_end_date,
    COALESCE(
      TRY_TO_DECIMAL(REGEXP_REPLACE(TO_VARCHAR(b.value:budget), '[$,]', ''), 18, 4),
      0
    ) AS burst_budget,
    COALESCE(
      TRY_TO_DECIMAL(REGEXP_REPLACE(TO_VARCHAR(b.value:buyAmount), '[$,]', ''), 18, 4),
      0
    ) AS buy_amount,
    COALESCE(TRY_TO_DOUBLE(TO_VARCHAR(b.value:calculatedValue)), 0)::DECIMAL(18, 4) AS calculated_value,
    IFF(IS_ARRAY(b.value:assumedDailyCents), b.value:assumedDailyCents, PARSE_JSON('[]')) AS series
  FROM _assumed_lines s,
       TABLE(FLATTEN(input => IFF(IS_ARRAY(s.BURSTS_JSON), s.BURSTS_JSON, PARSE_JSON('[]')))) b;

  CREATE OR REPLACE TEMPORARY TABLE _assumed_daily AS
  WITH points AS (
    SELECT
      br.line_id,
      br.LINE_ITEM_ID,
      br.BUY_TYPE,
      br.burst_index,
      br.burst_start_date,
      br.burst_end_date,
      br.burst_budget,
      br.buy_amount,
      br.calculated_value,
      ARRAY_SIZE(br.series) AS series_n,
      d.INDEX::NUMBER AS day_index,
      TRY_TO_DATE(LEFT(TO_VARCHAR(d.value:date), 10)) AS date_day,
      IFF(
        TRY_TO_DOUBLE(TO_VARCHAR(d.value:cents)) IS NULL,
        0,
        TRY_TO_DOUBLE(TO_VARCHAR(d.value:cents)) / 100
      )::DECIMAL(18, 4) AS reported_spend
    FROM _assumed_bursts br,
         TABLE(FLATTEN(input => br.series)) d
  ),
  ranked AS (
    SELECT
      points.*,
      IFF(
        date_day <= :utc_today,
        ((day_index + 1) / NULLIF(series_n, 0))::DECIMAL(8, 4),
        0::DECIMAL(8, 4)
      ) AS share_today,
      ROW_NUMBER() OVER (
        PARTITION BY line_id, burst_index, date_day
        ORDER BY day_index DESC
      ) AS day_rank
    FROM points
    WHERE date_day IS NOT NULL
  )
  SELECT
    line_id,
    LINE_ITEM_ID,
    BUY_TYPE,
    burst_index,
    date_day,
    reported_spend,
    burst_budget,
    burst_start_date,
    burst_end_date,
    buy_amount,
    share_today,
    calculated_value
  FROM ranked
  WHERE day_rank = 1;

  DELETE FROM ASSEMBLEDVIEW.MART.FIXED_COST_REPORTED_DAILY_FACT f
  WHERE f.CAP_APPLIED = 'assumed_spend'
    AND LOWER(f.LINE_ITEM_ID) IN (SELECT line_id FROM _assumed_lines);

  INSERT INTO ASSEMBLEDVIEW.MART.FIXED_COST_REPORTED_DAILY_FACT (
    LINE_ITEM_ID, BURST_INDEX, DATE_DAY,
    REPORTED_SPEND, ACTUAL_PLATFORM_SPEND, ACTUAL_DELIVERABLES, EXPECTED_DAILY_DELIVERABLES,
    BURST_BUDGET, BURST_START_DATE, BURST_END_DATE,
    BUY_TYPE, BUY_AMOUNT, SHARE_TODAY, CAP_APPLIED,
    IS_SQUAREUP_DAY, IS_LOCKED, CALCULATED_AT
  )
  SELECT
    LINE_ITEM_ID,
    burst_index,
    date_day,
    reported_spend,
    0,
    0,
    0,
    burst_budget,
    burst_start_date,
    burst_end_date,
    BUY_TYPE,
    buy_amount,
    share_today,
    'assumed_spend',
    FALSE,
    TRUE,
    CURRENT_TIMESTAMP()
  FROM _assumed_daily;

  row_count := SQLROWCOUNT;

  MERGE INTO ASSEMBLEDVIEW.MART.FIXED_COST_BURST_FACT t
  USING (
    SELECT
      b.line_id,
      ANY_VALUE(b.LINE_ITEM_ID) AS LINE_ITEM_ID,
      b.burst_index,
      ANY_VALUE(b.burst_start_date) AS burst_start_date,
      ANY_VALUE(b.burst_end_date) AS burst_end_date,
      ANY_VALUE(b.burst_budget) AS burst_budget,
      ANY_VALUE(b.BUY_TYPE) AS BUY_TYPE,
      ANY_VALUE(b.calculated_value) AS calculated_value,
      COALESCE(SUM(d.reported_spend), 0) AS burst_reported
    FROM _assumed_bursts b
    LEFT JOIN _assumed_daily d
      ON d.line_id = b.line_id
     AND d.burst_index = b.burst_index
    GROUP BY b.line_id, b.burst_index
  ) s
  ON LOWER(t.LINE_ITEM_ID) = s.line_id
     AND t.BURST_INDEX = s.burst_index
  WHEN MATCHED THEN UPDATE SET
    BURST_START_DATE = s.burst_start_date,
    BURST_END_DATE = s.burst_end_date,
    BURST_BUDGET = s.burst_budget,
    BURST_EXPECTED_DELIVERABLES = IFF(LOWER(COALESCE(s.BUY_TYPE, '')) = 'fixed_cost', 0, s.calculated_value),
    BURST_ACTUAL_DELIVERABLES = 0,
    BURST_DELIVERY_RATIO = 0,
    BURST_REPORTED_SPEND = s.burst_reported,
    BURST_ACTUAL_PLATFORM_SPEND = 0,
    BURST_VARIANCE = s.burst_reported,
    BURST_STATUS = CASE
      WHEN :utc_today < s.burst_start_date THEN 'pending'
      WHEN :utc_today <= s.burst_end_date THEN 'in_progress'
      WHEN LOWER(COALESCE(s.BUY_TYPE, '')) = 'fixed_cost' THEN 'completed'
      ELSE 'completed_under'
    END,
    LAST_CALCULATED_AT = CURRENT_TIMESTAMP()
  WHEN NOT MATCHED THEN INSERT (
    LINE_ITEM_ID, BURST_INDEX, BURST_START_DATE, BURST_END_DATE,
    BURST_BUDGET, BURST_EXPECTED_DELIVERABLES, BURST_ACTUAL_DELIVERABLES, BURST_DELIVERY_RATIO,
    BURST_REPORTED_SPEND, BURST_ACTUAL_PLATFORM_SPEND, BURST_VARIANCE, BURST_STATUS,
    LAST_CALCULATED_AT
  ) VALUES (
    s.LINE_ITEM_ID,
    s.burst_index,
    s.burst_start_date,
    s.burst_end_date,
    s.burst_budget,
    IFF(LOWER(COALESCE(s.BUY_TYPE, '')) = 'fixed_cost', 0, s.calculated_value),
    0,
    0,
    s.burst_reported,
    0,
    s.burst_reported,
    CASE
      WHEN :utc_today < s.burst_start_date THEN 'pending'
      WHEN :utc_today <= s.burst_end_date THEN 'in_progress'
      WHEN LOWER(COALESCE(s.BUY_TYPE, '')) = 'fixed_cost' THEN 'completed'
      ELSE 'completed_under'
    END,
    CURRENT_TIMESTAMP()
  );

  MERGE INTO ASSEMBLEDVIEW.MART.FIXED_COST_LINE_ITEM_FACT t
  USING (
    WITH burst_once AS (
      SELECT
        b.line_id,
        b.burst_index,
        ANY_VALUE(b.LINE_ITEM_ID) AS LINE_ITEM_ID,
        ANY_VALUE(b.MBA_NUMBER) AS MBA_NUMBER,
        ANY_VALUE(b.LINE_ITEM_NAME) AS LINE_ITEM_NAME,
        ANY_VALUE(b.BUY_TYPE) AS BUY_TYPE,
        ANY_VALUE(b.FIXED_COST_MEDIA) AS FIXED_COST_MEDIA,
        ANY_VALUE(b.burst_budget) AS burst_budget,
        ANY_VALUE(b.burst_end_date) AS burst_end_date,
        COALESCE(SUM(d.reported_spend), 0) AS burst_reported
      FROM _assumed_bursts b
      LEFT JOIN _assumed_daily d
        ON d.line_id = b.line_id
       AND d.burst_index = b.burst_index
      GROUP BY b.line_id, b.burst_index
    ),
    rolled AS (
      SELECT
        line_id,
        ANY_VALUE(LINE_ITEM_ID) AS LINE_ITEM_ID,
        ANY_VALUE(MBA_NUMBER) AS MBA_NUMBER,
        ANY_VALUE(LINE_ITEM_NAME) AS LINE_ITEM_NAME,
        ANY_VALUE(FIXED_COST_MEDIA) AS FIXED_COST_MEDIA,
        ANY_VALUE(BUY_TYPE) AS BUY_TYPE,
        SUM(burst_budget) AS total_budget,
        SUM(burst_reported) AS total_reported,
        COUNT(*) AS burst_count,
        SUM(IFF(
          LOWER(COALESCE(BUY_TYPE, '')) <> 'fixed_cost' AND :utc_today > burst_end_date,
          1,
          0
        )) AS bursts_under
      FROM burst_once
      GROUP BY line_id
    )
    SELECT
      l.line_id,
      l.LINE_ITEM_ID,
      l.MBA_NUMBER,
      l.LINE_ITEM_NAME,
      l.FIXED_COST_MEDIA,
      COALESCE(r.total_budget, 0) AS total_budget,
      COALESCE(r.total_reported, 0) AS total_reported,
      COALESCE(r.burst_count, 0) AS burst_count,
      COALESCE(r.bursts_under, 0) AS bursts_under
    FROM _assumed_lines l
    LEFT JOIN rolled r ON r.line_id = l.line_id
  ) s
  ON LOWER(t.LINE_ITEM_ID) = s.line_id
  WHEN MATCHED THEN UPDATE SET
    MBA_NUMBER = s.MBA_NUMBER,
    LINE_ITEM_NAME = s.LINE_ITEM_NAME,
    IS_CURRENTLY_FIXED_COST = s.FIXED_COST_MEDIA,
    WAS_EVER_FIXED_COST = COALESCE(t.WAS_EVER_FIXED_COST, FALSE) OR COALESCE(s.FIXED_COST_MEDIA, FALSE),
    LINE_ITEM_TOTAL_BUDGET = s.total_budget,
    LINE_ITEM_TOTAL_REPORTED = s.total_reported,
    LINE_ITEM_TOTAL_ACTUAL = 0,
    LINE_ITEM_VARIANCE = s.total_reported,
    BURST_COUNT = s.burst_count,
    BURSTS_DELIVERED_OVER = 0,
    BURSTS_DELIVERED_UNDER = s.bursts_under,
    LAST_CALCULATED_AT = CURRENT_TIMESTAMP()
  WHEN NOT MATCHED THEN INSERT (
    LINE_ITEM_ID, MBA_NUMBER, LINE_ITEM_NAME,
    IS_CURRENTLY_FIXED_COST, WAS_EVER_FIXED_COST,
    LINE_ITEM_TOTAL_BUDGET, LINE_ITEM_TOTAL_REPORTED, LINE_ITEM_TOTAL_ACTUAL, LINE_ITEM_VARIANCE,
    BURST_COUNT, BURSTS_DELIVERED_OVER, BURSTS_DELIVERED_UNDER,
    LAST_CALCULATED_AT
  ) VALUES (
    s.LINE_ITEM_ID,
    s.MBA_NUMBER,
    s.LINE_ITEM_NAME,
    s.FIXED_COST_MEDIA,
    COALESCE(s.FIXED_COST_MEDIA, FALSE),
    s.total_budget,
    s.total_reported,
    0,
    s.total_reported,
    s.burst_count,
    0,
    s.bursts_under,
    CURRENT_TIMESTAMP()
  );

  SELECT COUNT(*) INTO :line_count FROM _assumed_lines;

  INSERT INTO ASSEMBLEDVIEW.MART.ASSUMED_SPEND_RUN_LOG (run_at, scope, lines, rows_written)
  SELECT
    CURRENT_TIMESTAMP()::TIMESTAMP_NTZ,
    IFF(:filter_id IS NULL, :scope_norm, :scope_norm || '|' || :filter_id),
    :line_count,
    :row_count;

  RETURN 'assumed spend scope=' || :scope_norm
    || IFF(:filter_id IS NULL, '', ' line=' || :filter_id)
    || ' lines=' || :line_count::VARCHAR
    || ' rows=' || :row_count::VARCHAR;
END;
$$;
