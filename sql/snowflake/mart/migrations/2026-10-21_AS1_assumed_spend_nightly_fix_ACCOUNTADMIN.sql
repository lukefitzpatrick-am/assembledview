-- =============================================================================
-- AS1: nightly fixed-cost task fails every night; assumed spend frozen at 13 Oct
-- Run as ACCOUNTADMIN in Snowsight. Measured live 2026-10-21 15:50 Melbourne.
-- =============================================================================
-- Issue: TSK_REFRESH_FIXED_COST_REPORTED has FAILED every night since at least
--   15 Oct (TASK_HISTORY, 06:30 Melbourne runs 15 - 21 Oct, plus the 07:04 manual
--   run on 21 Oct). Error:
--     SP_REFRESH_FIXED_COST_NIGHTLY line 22 (the CALL of
--     SP_REFRESH_ASSUMED_SPEND_DAILY('changed')) -> line 50 (CREATE TEMPORARY
--     TABLE _assumed_lines) -> "Unsupported subquery type cannot be evaluated"
--     at its line 48 (the correlated EXISTS over LATERAL FLATTEN inside the OR).
--   The window and partner-file / direct-digital backfill steps run before the
--   failure, so CPM / CPV / fixed_cost rows stay fresh. Only the assumed-spend
--   step fails. ASSUMED_SPEND_RUN_LOG: last full run 'all' 13 Oct 03:25; since
--   then only the single-line 'all|bicau002dv1' call succeeds (its filter prunes
--   the failing branch).
--
-- Effect (to 20 Oct, against BURSTS_JSON assumedDailyCents in the snapshot):
--   724 eligible assume-spend lines; 135 lines on 24 campaigns differ;
--   net gap $203,948.14 (absolute $205,920.74). Examples:
--     bicau006dd1  json 20,322.54  fact 13,548.36  gap 6,774.18
--     sinch001da8  json 35,114.52  fact 30,294.88  gap 4,819.64
--     sinch001da2  json 10,534.56  fact  9,088.64  gap 1,445.92
--   The app keeps a positive Snowflake row as delivered, so these lines show as
--   behind on the portfolio, campaign page, AVA and the deck.
--
-- Fix (repo): sql/snowflake/mart/procedures/sp_refresh_assumed_spend_daily.sql
--   builds the "recent assumedDailyCents" line set once (CTE recent) and LEFT JOINs
--   it. Compile-checked read-only on 21 Oct with the bind values substituted:
--   724 lines in scope.
--
-- Confidence: 95% on the cause and the fix (error reproduced read-only; the
--   rewritten SELECT compiles and returns the same 724 lines).
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE SCHEMA ASSEMBLEDVIEW.MART;

-- ----- Step 1: apply the procedure ------------------------------------------
-- Run the whole file sql/snowflake/mart/procedures/sp_refresh_assumed_spend_daily.sql
-- (CREATE OR REPLACE PROCEDURE). It does not copy grants; the nightly wrapper is
-- EXECUTE AS OWNER, so no new grant is needed when ACCOUNTADMIN owns both.

-- ----- Before ----------------------------------------------------------------
-- Expect (21 Oct 15:50): rows_now 39,355 | dollars_now 4,962,265.91 |
-- last_run 2026-10-20 13:09:52.607 'all|bicau002dv1' | lines_differ_to20 135 | gap_to20 203,948.14
WITH latest AS (
  SELECT LOWER(line_item_id) line_id, bursts_json
  FROM XANO_LINE_ITEMS_SNAPSHOT
  WHERE assume_spend = TRUE AND line_item_id IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY LOWER(line_item_id) ORDER BY synced_at DESC) = 1
),
elig AS (
  SELECT * FROM latest l
  WHERE NOT EXISTS (SELECT 1 FROM PACING_FACT p WHERE LOWER(p.line_item_id) = l.line_id)
    AND NOT EXISTS (SELECT 1 FROM SEARCH_PACING_FACT p WHERE LOWER(p.line_item_id) = l.line_id)
    AND NOT EXISTS (SELECT 1 FROM SOCIAL_PACING_FACT p WHERE LOWER(p.line_item_id) = l.line_id)
),
j AS (
  SELECT l.line_id,
         SUM(IFF(TRY_TO_DATE(LEFT(TO_VARCHAR(d.value:date), 10)) <= DATEADD(day, -1, CONVERT_TIMEZONE('Australia/Melbourne', CURRENT_TIMESTAMP())::DATE),
                 TRY_TO_DOUBLE(TO_VARCHAR(d.value:cents)), 0)) / 100 j_to_yday
  FROM elig l,
       LATERAL FLATTEN(input => IFF(IS_ARRAY(l.bursts_json), l.bursts_json, PARSE_JSON('[]'))) b,
       LATERAL FLATTEN(input => IFF(IS_ARRAY(b.value:assumedDailyCents), b.value:assumedDailyCents, PARSE_JSON('[]'))) d
  GROUP BY 1
),
f AS (
  SELECT LOWER(line_item_id) line_id,
         SUM(IFF(date_day <= DATEADD(day, -1, CONVERT_TIMEZONE('Australia/Melbourne', CURRENT_TIMESTAMP())::DATE), reported_spend, 0)) f_to_yday
  FROM FIXED_COST_REPORTED_DAILY_FACT WHERE cap_applied = 'assumed_spend' GROUP BY 1
)
SELECT
  (SELECT COUNT(*) FROM FIXED_COST_REPORTED_DAILY_FACT WHERE cap_applied = 'assumed_spend') rows_now,
  (SELECT ROUND(SUM(reported_spend), 2) FROM FIXED_COST_REPORTED_DAILY_FACT WHERE cap_applied = 'assumed_spend') dollars_now,
  (SELECT MAX(run_at)::STRING || ' ' || MAX_BY(scope, run_at) FROM ASSUMED_SPEND_RUN_LOG) last_run,
  COUNT_IF(ABS(j.j_to_yday - COALESCE(f.f_to_yday, 0)) > 0.01) lines_differ_to_yday,
  ROUND(SUM(j.j_to_yday - COALESCE(f.f_to_yday, 0)), 2) gap_to_yday
FROM j LEFT JOIN f ON f.line_id = j.line_id;

-- ----- Step 2: guarded refresh -----------------------------------------------
-- The procedure is not one transaction (it creates temp tables), so the guard is
-- the live line count before the CALL and the run-log row after it.
EXECUTE IMMEDIATE $$
DECLARE
  lines_expected INTEGER;
  runs_before INTEGER;
  runs_after INTEGER;
  result VARCHAR;
BEGIN
  SELECT COUNT(*) INTO :lines_expected FROM (
    SELECT LOWER(line_item_id) line_id
    FROM ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT
    WHERE assume_spend = TRUE AND line_item_id IS NOT NULL
    QUALIFY ROW_NUMBER() OVER (PARTITION BY LOWER(line_item_id) ORDER BY synced_at DESC) = 1
  );
  -- Measured 728 assume-spend lines (724 not on a pacing fact) on 21 Oct.
  IF (lines_expected < 650 OR lines_expected > 850) THEN
    RETURN 'STOPPED: assume-spend lines out of range (650 to 850). lines=' || lines_expected;
  END IF;
  SELECT COUNT(*) INTO :runs_before FROM ASSEMBLEDVIEW.MART.ASSUMED_SPEND_RUN_LOG;
  CALL ASSEMBLEDVIEW.MART.SP_REFRESH_ASSUMED_SPEND_DAILY('changed') INTO :result;
  SELECT COUNT(*) INTO :runs_after FROM ASSEMBLEDVIEW.MART.ASSUMED_SPEND_RUN_LOG;
  IF (runs_after <> runs_before + 1) THEN
    RETURN 'CHECK: run log did not gain one row. before=' || runs_before || ' after=' || runs_after || ' result=' || COALESCE(result, 'null');
  END IF;
  RETURN 'OK ' || result;
END;
$$;
-- Expect: 'OK assumed spend scope=changed lines=724 rows=39031' (give or take the
-- day's plan changes). Row and dollar figures measured read-only 21 Oct 15:55:
-- 39,031 rows, $5,191,967.58 all dates, $5,166,214.05 to 20 Oct.

-- ----- After -----------------------------------------------------------------
-- Re-run the Before query. Expect lines_differ_to_yday 0 and gap_to_yday 0.00,
-- rows_now about 39,031, last_run today with scope 'changed'.
-- Then confirm tomorrow's 06:30 run:
-- SELECT name, state, CONVERT_TIMEZONE('Australia/Melbourne', scheduled_time)::STRING
-- FROM TABLE(ASSEMBLEDVIEW.INFORMATION_SCHEMA.TASK_HISTORY(
--   scheduled_time_range_start => DATEADD(day, -1, CURRENT_TIMESTAMP()),
--   task_name => 'TSK_REFRESH_FIXED_COST_REPORTED'));
--
-- Note: the burst-day fix in the app (commit "assumed-spend burst days are Sydney
-- civil days") moves every assumedDailyCents date one day later on the next
-- snapshot sync after it is pushed. The next nightly 'changed' run then rewrites
-- those rows. No extra SQL is needed for that.
