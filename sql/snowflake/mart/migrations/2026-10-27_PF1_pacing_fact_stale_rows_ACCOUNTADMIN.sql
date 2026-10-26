-- =============================================================================
-- PF1: remove stale and legacy rows from PACING_FACT, and stop stale keys
-- coming back. Run as ACCOUNTADMIN in Snowsight, top to bottom, one step at a
-- time. Measured live 2026-10-27 about 15:20 AEDT with CLAUDE_RW (SELECT only).
-- Not run.
-- =============================================================================
-- Why
--   TSK_REFRESH_PACING_FACT is a MERGE on (channel, date_day,
--   platform_line_item_id) that never deletes. When a DV360 line item is
--   renamed, Fivetran restates days under the new name. The DV360 key is
--   md5(advertiser | insertion order | line item name), so the new name is a new
--   key. The new key gets rows for the days inside the 14-day window and the old
--   key's rows stay. Both carry the same plan line id (old key through
--   LINE_ITEM_LABEL_MAP from HR1, new key from the name), so those days count
--   twice. Outside the window the opposite happens: the old key's rows stay
--   (right total, stale key) and the new key's rows never arrive.
--
--   PACING_FACT also holds 48,986 legacy social rows ('Social - Meta' 48,721,
--   'Social - TikTok' 265, 11 Jan 2024 to 19 Mar 2026, $2,850,040.46). They copy
--   SOCIAL_PACING_FACT under older keys. Nothing has written them since
--   18 Mar 2026 (only 164 rows were touched on 20 Oct, by the HR1 / DG relabel
--   UPDATEs). The live task (repo capture, 16 Sep and VI1) has no social union.
--
-- How a stale row is identified (exact, no tolerance on the set itself)
--   A PACING_FACT row, not social, dated 2026-01-01 or later, whose
--   (channel, date_day, LOWER(TRIM(platform_line_item_id))) has no row in the
--   task's own source union for that date. The union is the five views the task
--   reads, keyed exactly as the task keys them (LOWER(TRIM(entity_id)), entity
--   id not blank), with NO date window:
--     VW_PACING_DV360, VW_PACING_TABOOLA, VW_PACING_CM360,
--     VW_PACING_PARTNER_FILE (Channel Factory), VW_PACING_PARTNER_OOH (Vistar).
--   Every source covers 2026 in full (DV360 from Jan 2024, Taboola from Aug
--   2024, CM360 from Jan 2024, Channel Factory and Vistar restate all history),
--   so a missing key means the source no longer has that row.
--
--   Before 2026-01-01 is left alone on purpose. Those DV360 rows carry older
--   name-fragment keys ('mens 55+ targeting', 'men_inco') from before FX1, so
--   none match today's md5 keys: 1,124 rows, $115,343.17, Jul to Dec 2025.
--   They are not double counted (no md5 twins before 2026; Video Jul-Dec 2025
--   equals raw DV360 to the cent). Deleting them would remove FY26 H1 history.
--   See the questions in the hand-off.
--
-- Measured 2026-10-27 (CLAUDE_RW; Vistar checked by rebuilding
-- VW_PACING_PARTNER_OOH's SQL on RAW, since CLAUDE_RW cannot read that view)
--   Stale rows: 171, $16,935.97, 1,233,083 impressions
--     source   month    rows   spend       impressions
--     DV360    2026-09    42    6,430.14     332,238
--     DV360    2026-10    67   10,505.83     539,003
--     CM360    2026-08    12        0.00         115
--     CM360    2026-09    23        0.00     359,371
--     CM360    2026-10    27        0.00       2,356
--     Taboola, Channel Factory, Vistar: 0
--   DV360 stale rows by line (all 'Programmatic - Video', YouTube - DV360):
--     hartm001pv1  Sep 14 rows 4,461.50 | Oct 29 rows 7,057.34
--     hartm001pv2  Sep 28 rows 1,968.64 | Oct 38 rows 3,448.49
--   CM360 stale rows are renamed placements (0 spend, impressions only), almost
--   all on unmapped ids ('320x50', '1x1', 'female_30', 'fms_displaybonus',
--   two bic-flex5 twitch placements). Plan lines: trwico001da1/2/3, 1 each.
--
--   Missing rows (in the source, not in PACING_FACT, older than the 14-day
--   window, so the nightly MERGE never adds them): 60, $8,128.83, 443,977 imps
--     hartm001pv1  Sep 14 rows 4,461.50 | Oct (1-5)  8 rows   694.37
--     hartm001pv2  Sep 28 rows 1,968.64 | Oct (1-5) 10 rows 1,004.32
--   They are the new-name copies of stale rows. Delete without insert would
--   drop Sep 17 to Oct 5 from these lines, so this file does both.
--
--   Net effect on the two lines (spend | impressions | 3s video views):
--     hartm001pv1 Sep  11,142.88 -> 11,142.88 (no change)
--     hartm001pv1 Oct  20,149.83 -> 13,786.86 | 858,202 -> 585,698 | 610,707 -> 416,441
--     hartm001pv2 Sep   4,930.55 ->  4,930.55 (no change)
--     hartm001pv2 Oct   7,033.10 ->  4,588.93 | 449,006 -> 294,246 | 369,946 -> 242,943
--   The Oct figures equal raw DV360 (VW_PACING_DV360 with the label map).
--
-- Guards (and why recompute, not fixed numbers)
--   The nightly refresh adds rows every day, so the stale and missing sets are
--   recomputed here from live sources into two snapshot tables (step 4), and
--   the deletes and the insert run from those tables. Bounds stop the run if
--   the recomputed sets look wrong:
--     stale DV360 109..300 rows, stale CM360 62..200, stale other sources 0,
--     missing DV360 60..300, missing other 0, social exactly 48,986.
--   Lower bounds = what was measured (fewer means someone already changed the
--   table: re-measure). Upper bounds catch a broken source view: a view that
--   returns nothing would make every one of its rows look stale.
--   Inside the transaction each statement must hit exactly the snapshot count,
--   then four end checks must pass or everything rolls back:
--     a) no 2026 PACING_FACT key is missing from the sources,
--     b) no source key older than the window is missing from PACING_FACT,
--     c) no duplicate keys,
--     d) DV360 2026 spend in PACING_FACT equals VW_PACING_DV360 (older than
--        the window, within 0.05).
--
-- Permanent fix (step 6): the task deletes keys the sources no longer have in
-- the window it refreshes, then MERGEs as before, in one transaction.
--
-- Who reads PACING_FACT (checked 2026-10-27): every app reader that can see
-- social channels already leaves social rows out or reads SOCIAL_PACING_FACT
-- (pacing-fact.ts, pacing-service.ts, bulkNonSocialChannelWhere, avaSnowflakeSql,
-- relabel match load, fixed cost margin fallback, ops health). Readers with
-- no channel filter: lib/finance/revisions/pacingHint.ts (VW_PACING_FACT, hint
-- only, social lines Jan-Mar 2026 lose a hint they should not have had),
-- VW_CONVERSION_DAILY (id map: 18 social conversion rows, 39 conversions,
-- 13-24 Jan 2026, move from unmapped 'ndis' to hartm001sm2), and the fixed cost
-- procs (EXISTS checks; they also check SOCIAL_PACING_FACT).
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE SCHEMA ASSEMBLEDVIEW.MART;

-- ----- 0. Pre-flight ---------------------------------------------------------
-- Note the state of every task before you start (resume only what was started):
-- SHOW TASKS LIKE 'TSK_%' IN SCHEMA ASSEMBLEDVIEW.MART;
--
-- Make sure the pacing refresh is not running right now (expect no EXECUTING row):
-- SELECT name, state, scheduled_time, completed_time
-- FROM TABLE(ASSEMBLEDVIEW.INFORMATION_SCHEMA.TASK_HISTORY(
--   TASK_NAME => 'TSK_REFRESH_PACING_FACT', RESULT_LIMIT => 5))
-- ORDER BY scheduled_time DESC;

-- ----- 1. Before -------------------------------------------------------------
-- expect (27 Oct, plus whatever a later nightly refresh added; social is fixed):
--   Ad Serving - CM360       64,837 rows          0.00
--   Programmatic - Display    4,225 rows    191,347.43
--   Programmatic - OOH          263 rows    104,753.98
--   Programmatic - Video      4,332 rows    356,947.18
--   Social - Meta            48,721 rows  2,805,905.74
--   Social - TikTok             265 rows     44,134.72
--   total                   122,643 rows  3,503,089.05
-- SELECT channel, COUNT(*) n, ROUND(SUM(amount_spent), 2) spend
-- FROM ASSEMBLEDVIEW.MART.PACING_FACT GROUP BY ROLLUP (channel) ORDER BY channel;
--
-- The two lines (expect pv1 2026-09 30 | 11142.88, 2026-10 64 | 20149.83,
--                       pv2 2026-09 60 |  4930.55, 2026-10 80 |  7033.10):
-- SELECT LOWER(line_item_id) lid, TO_CHAR(date_day, 'YYYY-MM') m, COUNT(*) n,
--        ROUND(SUM(amount_spent), 2) spend, SUM(impressions) imps, SUM(video_3s_views) views
-- FROM ASSEMBLEDVIEW.MART.PACING_FACT
-- WHERE LOWER(line_item_id) IN ('hartm001pv1', 'hartm001pv2') AND date_day >= '2026-09-01'
-- GROUP BY 1, 2 ORDER BY 1, 2;

-- ----- 2. Hold the nightly graph ---------------------------------------------
-- TSK_ROOT_DAILY_REFRESH is the root (06:30 Melbourne). Child tasks cannot be
-- created, replaced or resumed while the root runs, and cannot be EXECUTEd on
-- their own. Suspending the root stops the whole graph until step 6.
ALTER TASK ASSEMBLEDVIEW.MART.TSK_ROOT_DAILY_REFRESH SUSPEND;

-- ----- 3. Backup -------------------------------------------------------------
-- Zero-copy clone of the whole table. IF NOT EXISTS keeps the first backup if
-- you re-run this file after a rollback.
CREATE TABLE IF NOT EXISTS ASSEMBLEDVIEW.MART.PF1_PACING_FACT_BACKUP_20261027
  CLONE ASSEMBLEDVIEW.MART.PACING_FACT;
-- expect 122,643 (or what step 1 showed):
-- SELECT COUNT(*) FROM ASSEMBLEDVIEW.MART.PF1_PACING_FACT_BACKUP_20261027;

-- ----- 4. Snapshot the stale and missing sets ---------------------------------
-- Stale: PACING_FACT rows (not social, 2026 on) whose key is in no source.
CREATE OR REPLACE TABLE ASSEMBLEDVIEW.MART.PF1_STALE_ROWS_20261027 AS
SELECT
  CASE
    WHEN f.channel = 'Ad Serving - CM360' THEN 'CM360'
    WHEN f.channel = 'Programmatic - OOH' THEN 'Vistar'
    WHEN REGEXP_LIKE(LOWER(TRIM(f.platform_line_item_id)), '^[0-9a-f]{32}$') THEN 'DV360'
    WHEN f.channel = 'Programmatic - Display' THEN 'Taboola'
    ELSE 'Channel Factory'
  END AS stale_source,
  f.*
FROM ASSEMBLEDVIEW.MART.PACING_FACT f
JOIN (
  SELECT channel, date_day, LOWER(TRIM(platform_line_item_id)) AS pid
  FROM ASSEMBLEDVIEW.MART.PACING_FACT
  WHERE channel NOT ILIKE 'Social%' AND date_day >= '2026-01-01'
  MINUS
  SELECT channel, date_day, LOWER(TRIM(entity_id::string))
  FROM (
    SELECT channel, date_day, entity_id FROM ASSEMBLEDVIEW.MART.VW_PACING_DV360
    UNION ALL SELECT channel, date_day, entity_id FROM ASSEMBLEDVIEW.MART.VW_PACING_TABOOLA
    UNION ALL SELECT channel, date_day, entity_id FROM ASSEMBLEDVIEW.MART.VW_PACING_CM360
    UNION ALL SELECT channel, date_day, entity_id FROM ASSEMBLEDVIEW.MART.VW_PACING_PARTNER_FILE
    UNION ALL SELECT channel, date_day, entity_id FROM ASSEMBLEDVIEW.MART.VW_PACING_PARTNER_OOH
  ) u
  WHERE entity_id IS NOT NULL AND TRIM(entity_id::string) <> '' AND date_day >= '2026-01-01'
) k
  ON k.channel = f.channel
 AND k.date_day = f.date_day
 AND k.pid = LOWER(TRIM(f.platform_line_item_id));

-- Missing: source rows, shaped exactly as the task's USING (keyed, relabel,
-- deduped), 2026 on and older than the task's 14-day window, with no
-- PACING_FACT row on that key. Rows inside the window are the task's job.
CREATE OR REPLACE TABLE ASSEMBLEDVIEW.MART.PF1_MISSING_ROWS_20261027 AS
WITH unioned AS (
  SELECT channel, date_day, line_item_name, line_item_id, entity_name, entity_id, campaign_name,
         amount_spent, impressions, clicks, results, video_3s_views,
         max_fivetran_synced_at::timestamp_ntz AS max_fivetran_synced_at
  FROM ASSEMBLEDVIEW.MART.VW_PACING_DV360
  UNION ALL
  SELECT channel, date_day, line_item_name, line_item_id, entity_name, entity_id, campaign_name,
         amount_spent, impressions, clicks, results, video_3s_views,
         max_fivetran_synced_at::timestamp_ntz
  FROM ASSEMBLEDVIEW.MART.VW_PACING_TABOOLA
  UNION ALL
  SELECT channel, date_day, line_item_name, line_item_id, entity_name, entity_id, campaign_name,
         amount_spent, impressions, clicks, results, video_3s_views,
         max_fivetran_synced_at::timestamp_ntz
  FROM ASSEMBLEDVIEW.MART.VW_PACING_CM360
  UNION ALL
  SELECT channel, date_day, line_item_name, line_item_id, entity_name, entity_id, campaign_name,
         amount_spent, impressions, clicks, results, video_3s_views,
         max_fivetran_synced_at::timestamp_ntz
  FROM ASSEMBLEDVIEW.MART.VW_PACING_PARTNER_FILE
  UNION ALL
  SELECT channel, date_day, line_item_name, line_item_id, entity_name, entity_id, campaign_name,
         amount_spent, impressions, clicks, results, video_3s_views,
         max_fivetran_synced_at::timestamp_ntz
  FROM ASSEMBLEDVIEW.MART.VW_PACING_PARTNER_OOH
),
keyed AS (
  SELECT channel, date_day, LOWER(TRIM(entity_id::string)) AS platform_line_item_id,
         line_item_id, line_item_name, entity_name, entity_id, campaign_name,
         amount_spent, impressions, clicks, results, video_3s_views, max_fivetran_synced_at
  FROM unioned
  WHERE entity_id IS NOT NULL AND TRIM(entity_id::string) <> ''
    AND date_day >= '2026-01-01'
    AND date_day < DATEADD(day, -14, CURRENT_DATE())
),
relabel AS (
  SELECT k.*,
         COALESCE(m.line_item_id, k.line_item_id) AS final_line_item_id,
         COALESCE(m.line_item_name, k.line_item_name) AS final_line_item_name
  FROM keyed k
  LEFT JOIN ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP m
    ON LOWER(TRIM(m.channel)) = LOWER(TRIM(k.channel))
   AND LOWER(TRIM(m.platform_line_item_id)) = LOWER(TRIM(k.platform_line_item_id))
   AND m.is_active = TRUE
),
deduped AS (
  SELECT channel, date_day, platform_line_item_id,
         MAX(final_line_item_id) AS line_item_id,
         MAX(final_line_item_name) AS line_item_name,
         MAX(entity_name) AS entity_name,
         MAX(entity_id) AS entity_id,
         MAX(campaign_name) AS campaign_name,
         SUM(amount_spent) AS amount_spent,
         SUM(impressions) AS impressions,
         SUM(clicks) AS clicks,
         SUM(results) AS results,
         SUM(video_3s_views) AS video_3s_views,
         MAX(max_fivetran_synced_at) AS max_fivetran_synced_at
  FROM relabel
  GROUP BY 1, 2, 3
)
SELECT d.*
FROM deduped d
WHERE NOT EXISTS (
  SELECT 1 FROM ASSEMBLEDVIEW.MART.PACING_FACT f
  WHERE f.channel = d.channel
    AND f.date_day = d.date_day
    AND LOWER(TRIM(f.platform_line_item_id)) = d.platform_line_item_id
);

-- Check the snapshots before step 5.
-- expect stale: CM360 2026-08 12 | 0 | 115, 2026-09 23 | 0 | 359371, 2026-10 27 | 0 | 2356,
--               DV360 2026-09 42 | 6430.14 | 332238, 2026-10 67 | 10505.83 | 539003
--               (total 171 | 16935.97 | 1233083; no Taboola, Channel Factory or Vistar rows)
-- SELECT stale_source, TO_CHAR(date_day, 'YYYY-MM') m, COUNT(*) n,
--        ROUND(SUM(amount_spent), 2) spend, SUM(impressions) imps
-- FROM ASSEMBLEDVIEW.MART.PF1_STALE_ROWS_20261027 GROUP BY ROLLUP (1, 2) ORDER BY 1, 2;
--
-- expect missing: hartm001pv1 2026-09 14 | 4461.50, 2026-10 8 | 694.37,
--                 hartm001pv2 2026-09 28 | 1968.64, 2026-10 10 | 1004.32 (60 | 8128.83)
-- SELECT LOWER(line_item_id) lid, TO_CHAR(date_day, 'YYYY-MM') m, channel, COUNT(*) n,
--        ROUND(SUM(amount_spent), 2) spend, SUM(impressions) imps
-- FROM ASSEMBLEDVIEW.MART.PF1_MISSING_ROWS_20261027 GROUP BY ROLLUP ((1, 2, 3)) ORDER BY 1, 2;

-- ----- 5. Cleanup, one transaction -------------------------------------------
EXECUTE IMMEDIATE $$
DECLARE
  st_dv INTEGER; st_cm INTEGER; st_other INTEGER; st_total INTEGER;
  ms_dv INTEGER; ms_other INTEGER; ms_total INTEGER;
  soc INTEGER;
  del_social INTEGER; del_stale INTEGER; ins_missing INTEGER;
  pf_only INTEGER; src_only INTEGER; dup_keys INTEGER; social_left INTEGER;
  pf_dv NUMBER(38,2); vw_dv NUMBER(38,2);
BEGIN
  SELECT COUNT_IF(stale_source = 'DV360'), COUNT_IF(stale_source = 'CM360'),
         COUNT_IF(stale_source NOT IN ('DV360', 'CM360')), COUNT(*)
    INTO :st_dv, :st_cm, :st_other, :st_total
    FROM ASSEMBLEDVIEW.MART.PF1_STALE_ROWS_20261027;
  SELECT COUNT_IF(REGEXP_LIKE(platform_line_item_id, '^[0-9a-f]{32}$')),
         COUNT_IF(NOT REGEXP_LIKE(platform_line_item_id, '^[0-9a-f]{32}$')), COUNT(*)
    INTO :ms_dv, :ms_other, :ms_total
    FROM ASSEMBLEDVIEW.MART.PF1_MISSING_ROWS_20261027;
  SELECT COUNT(*) INTO :soc FROM ASSEMBLEDVIEW.MART.PACING_FACT WHERE channel ILIKE 'Social%';

  IF (st_dv < 109 OR st_dv > 300 OR st_cm < 62 OR st_cm > 200 OR st_other <> 0
      OR ms_dv < 60 OR ms_dv > 300 OR ms_other <> 0 OR soc <> 48986) THEN
    RETURN 'STOPPED before any change: stale dv360=' || st_dv || ' cm360=' || st_cm || ' other=' || st_other
      || ' missing dv360=' || ms_dv || ' other=' || ms_other || ' social=' || soc
      || '. Expected stale 109..300 / 62..200 / 0, missing 60..300 / 0, social 48986.';
  END IF;

  BEGIN TRANSACTION;

  -- a) legacy social rows (SOCIAL_PACING_FACT is the only social source)
  DELETE FROM ASSEMBLEDVIEW.MART.PACING_FACT WHERE channel ILIKE 'Social%';
  del_social := SQLROWCOUNT;

  -- b) stale keys
  DELETE FROM ASSEMBLEDVIEW.MART.PACING_FACT t
  USING ASSEMBLEDVIEW.MART.PF1_STALE_ROWS_20261027 s
  WHERE t.channel = s.channel
    AND t.date_day = s.date_day
    AND LOWER(TRIM(t.platform_line_item_id)) = LOWER(TRIM(s.platform_line_item_id));
  del_stale := SQLROWCOUNT;

  -- c) the new-name rows the nightly window never reached
  INSERT INTO ASSEMBLEDVIEW.MART.PACING_FACT (
    channel, date_day, platform_line_item_id,
    line_item_id, line_item_name,
    entity_name, entity_id, campaign_name,
    amount_spent, impressions, clicks, results, video_3s_views,
    max_fivetran_synced_at, updated_at
  )
  SELECT m.channel, m.date_day, m.platform_line_item_id,
         m.line_item_id, m.line_item_name,
         m.entity_name, m.entity_id, m.campaign_name,
         m.amount_spent, m.impressions, m.clicks, m.results, m.video_3s_views,
         m.max_fivetran_synced_at, CURRENT_TIMESTAMP()
  FROM ASSEMBLEDVIEW.MART.PF1_MISSING_ROWS_20261027 m
  WHERE NOT EXISTS (
    SELECT 1 FROM ASSEMBLEDVIEW.MART.PACING_FACT f
    WHERE f.channel = m.channel AND f.date_day = m.date_day
      AND LOWER(TRIM(f.platform_line_item_id)) = m.platform_line_item_id
  );
  ins_missing := SQLROWCOUNT;

  IF (del_social <> soc OR del_stale <> st_total OR ins_missing <> ms_total) THEN
    ROLLBACK;
    RETURN 'ROLLED BACK: counts differ. social=' || del_social || '/' || soc
      || ' stale=' || del_stale || '/' || st_total || ' inserted=' || ins_missing || '/' || ms_total;
  END IF;

  -- End checks.
  -- (a) every 2026 PACING_FACT key exists in a source
  SELECT COUNT(*) INTO :pf_only FROM (
    SELECT channel, date_day, LOWER(TRIM(platform_line_item_id))
    FROM ASSEMBLEDVIEW.MART.PACING_FACT
    WHERE channel NOT ILIKE 'Social%' AND date_day >= '2026-01-01'
    MINUS
    SELECT channel, date_day, LOWER(TRIM(entity_id::string))
    FROM (
      SELECT channel, date_day, entity_id FROM ASSEMBLEDVIEW.MART.VW_PACING_DV360
      UNION ALL SELECT channel, date_day, entity_id FROM ASSEMBLEDVIEW.MART.VW_PACING_TABOOLA
      UNION ALL SELECT channel, date_day, entity_id FROM ASSEMBLEDVIEW.MART.VW_PACING_CM360
      UNION ALL SELECT channel, date_day, entity_id FROM ASSEMBLEDVIEW.MART.VW_PACING_PARTNER_FILE
      UNION ALL SELECT channel, date_day, entity_id FROM ASSEMBLEDVIEW.MART.VW_PACING_PARTNER_OOH
    ) u
    WHERE entity_id IS NOT NULL AND TRIM(entity_id::string) <> '' AND date_day >= '2026-01-01'
  );

  -- (b) every source key older than the window exists in PACING_FACT
  SELECT COUNT(*) INTO :src_only FROM (
    SELECT channel, date_day, LOWER(TRIM(entity_id::string))
    FROM (
      SELECT channel, date_day, entity_id FROM ASSEMBLEDVIEW.MART.VW_PACING_DV360
      UNION ALL SELECT channel, date_day, entity_id FROM ASSEMBLEDVIEW.MART.VW_PACING_TABOOLA
      UNION ALL SELECT channel, date_day, entity_id FROM ASSEMBLEDVIEW.MART.VW_PACING_CM360
      UNION ALL SELECT channel, date_day, entity_id FROM ASSEMBLEDVIEW.MART.VW_PACING_PARTNER_FILE
      UNION ALL SELECT channel, date_day, entity_id FROM ASSEMBLEDVIEW.MART.VW_PACING_PARTNER_OOH
    ) u
    WHERE entity_id IS NOT NULL AND TRIM(entity_id::string) <> ''
      AND date_day >= '2026-01-01' AND date_day < DATEADD(day, -14, CURRENT_DATE())
    MINUS
    SELECT channel, date_day, LOWER(TRIM(platform_line_item_id))
    FROM ASSEMBLEDVIEW.MART.PACING_FACT
    WHERE date_day >= '2026-01-01'
  );

  -- (c) one row per key
  SELECT COUNT(*) INTO :dup_keys FROM (
    SELECT channel, date_day, LOWER(TRIM(platform_line_item_id))
    FROM ASSEMBLEDVIEW.MART.PACING_FACT
    GROUP BY 1, 2, 3 HAVING COUNT(*) > 1
  );

  -- (d) DV360 2026 spend, older than the window, equals the view
  SELECT ROUND(COALESCE(SUM(amount_spent), 0), 2) INTO :pf_dv
  FROM ASSEMBLEDVIEW.MART.PACING_FACT
  WHERE channel IN ('Programmatic - Display', 'Programmatic - Video')
    AND REGEXP_LIKE(LOWER(TRIM(platform_line_item_id)), '^[0-9a-f]{32}$')
    AND date_day >= '2026-01-01' AND date_day < DATEADD(day, -14, CURRENT_DATE());
  SELECT ROUND(COALESCE(SUM(amount_spent), 0), 2) INTO :vw_dv
  FROM ASSEMBLEDVIEW.MART.VW_PACING_DV360
  WHERE entity_id IS NOT NULL AND TRIM(entity_id::string) <> ''
    AND channel IN ('Programmatic - Display', 'Programmatic - Video')
    AND date_day >= '2026-01-01' AND date_day < DATEADD(day, -14, CURRENT_DATE());

  SELECT COUNT(*) INTO :social_left FROM ASSEMBLEDVIEW.MART.PACING_FACT WHERE channel ILIKE 'Social%';

  IF (pf_only <> 0 OR src_only <> 0 OR dup_keys <> 0 OR social_left <> 0 OR ABS(pf_dv - vw_dv) > 0.05) THEN
    ROLLBACK;
    RETURN 'ROLLED BACK: end checks failed. pf_only=' || pf_only || ' src_only=' || src_only
      || ' dup_keys=' || dup_keys || ' social_left=' || social_left
      || ' dv360 fact=' || pf_dv || ' view=' || vw_dv;
  END IF;

  COMMIT;
  RETURN 'OK social=' || del_social || ' stale=' || del_stale || ' (dv360 ' || st_dv || ', cm360 ' || st_cm
    || ') inserted=' || ins_missing || ' dv360 2026 before window fact=' || pf_dv || ' view=' || vw_dv;
END;
$$;
-- expect: OK social=48986 stale=171 (dv360 109, cm360 62) inserted=60 dv360 2026 before window fact=323186.59 view=323186.59
-- (measured 27 Oct with the window starting 12 Oct: the Snowflake account clock is
-- US time, so CURRENT_DATE() is a day behind Melbourne. Both sides grow as the
-- window moves; they must match each other. Before step 5 they were
-- fact 325,059.09 vs view 323,186.59.)
-- If it says ROLLED BACK on pf_only or src_only, a Fivetran sync probably landed
-- mid-run: re-run step 4 and step 5. If it says STOPPED, do not loosen the
-- bounds; send the message back for a re-measure.

-- ----- 6. Permanent fix: delete stale keys on every run ------------------------
-- Snowflake MERGE has no WHEN NOT MATCHED BY SOURCE, so the task now runs a
-- Snowflake Scripting block: a DELETE of keys the sources no longer have, then
-- the same MERGE as before, in one transaction.
-- What the DELETE covers (only where the MERGE also refreshes, so a delete is
-- always matched by a re-insert of the current key):
--   * every non-social row in the 14-day window (DV360, Taboola and CM360 are
--     read for 14 days; Channel Factory and Vistar for all history),
--   * every 'Programmatic - OOH' row (Vistar restates all history),
--   * 'Programmatic - Video' rows from 2026 whose key is not an md5 (the
--     Channel Factory partner file, which restates all history).
--   It never touches social rows or pre-2026 rows.
-- Safety: if more than 500 rows look stale (for example a source view comes
-- back empty after a Fivetran re-sync), the DELETE is skipped and the MERGE
-- still runs. Tonight's run after step 5 should delete 0 rows; with no step 5
-- it would delete 34 (31 hartm001 video rows 12-19 Oct, $6,934.64, and 3 CM360).
-- Limitation: a rename that Fivetran restates further back than 14 days (this
-- one went back to 17 Sep) leaves old-key rows outside the window. Totals stay
-- right there, since the new key is not inserted outside the window either.
--
-- Task graph rule: the root is suspended (step 2). Replace the child, resume
-- the child, then resume the root. A replaced task is created suspended.
ALTER TASK ASSEMBLEDVIEW.MART.TSK_ROOT_DAILY_REFRESH SUSPEND;

CREATE OR REPLACE TASK ASSEMBLEDVIEW.MART.TSK_REFRESH_PACING_FACT
  WAREHOUSE = AV_APP_WH
  AFTER ASSEMBLEDVIEW.MART.TSK_ROOT_DAILY_REFRESH
AS
EXECUTE IMMEDIATE $$
DECLARE
  stale_n INTEGER DEFAULT 0;
BEGIN
  -- PF1 2026-10-27: keys the sources no longer have, in the refreshed window.
  SELECT COUNT(*) INTO :stale_n FROM (
    SELECT channel, date_day, LOWER(TRIM(platform_line_item_id)) AS pid
    FROM ASSEMBLEDVIEW.MART.PACING_FACT
    WHERE channel NOT ILIKE 'Social%'
      AND (
        date_day >= DATEADD(day, -14, CURRENT_DATE())
        OR channel = 'Programmatic - OOH'
        OR (channel = 'Programmatic - Video' AND date_day >= '2026-01-01'
            AND NOT REGEXP_LIKE(LOWER(TRIM(platform_line_item_id)), '^[0-9a-f]{32}$'))
      )
    MINUS
    SELECT channel, date_day, LOWER(TRIM(entity_id::string))
    FROM (
      SELECT channel, date_day, entity_id FROM ASSEMBLEDVIEW.MART.VW_PACING_DV360
      WHERE date_day >= DATEADD(day, -14, CURRENT_DATE())
      UNION ALL
      SELECT channel, date_day, entity_id FROM ASSEMBLEDVIEW.MART.VW_PACING_TABOOLA
      WHERE date_day >= DATEADD(day, -14, CURRENT_DATE())
      UNION ALL
      SELECT channel, date_day, entity_id FROM ASSEMBLEDVIEW.MART.VW_PACING_CM360
      WHERE date_day >= DATEADD(day, -14, CURRENT_DATE())
      UNION ALL
      SELECT channel, date_day, entity_id FROM ASSEMBLEDVIEW.MART.VW_PACING_PARTNER_FILE
      UNION ALL
      SELECT channel, date_day, entity_id FROM ASSEMBLEDVIEW.MART.VW_PACING_PARTNER_OOH
    ) u
    WHERE entity_id IS NOT NULL AND TRIM(entity_id::string) <> ''
  );

  BEGIN TRANSACTION;

  IF (stale_n BETWEEN 1 AND 500) THEN
    DELETE FROM ASSEMBLEDVIEW.MART.PACING_FACT t
    USING (
      SELECT channel, date_day, LOWER(TRIM(platform_line_item_id)) AS pid
      FROM ASSEMBLEDVIEW.MART.PACING_FACT
      WHERE channel NOT ILIKE 'Social%'
        AND (
          date_day >= DATEADD(day, -14, CURRENT_DATE())
          OR channel = 'Programmatic - OOH'
          OR (channel = 'Programmatic - Video' AND date_day >= '2026-01-01'
              AND NOT REGEXP_LIKE(LOWER(TRIM(platform_line_item_id)), '^[0-9a-f]{32}$'))
        )
      MINUS
      SELECT channel, date_day, LOWER(TRIM(entity_id::string))
      FROM (
        SELECT channel, date_day, entity_id FROM ASSEMBLEDVIEW.MART.VW_PACING_DV360
        WHERE date_day >= DATEADD(day, -14, CURRENT_DATE())
        UNION ALL
        SELECT channel, date_day, entity_id FROM ASSEMBLEDVIEW.MART.VW_PACING_TABOOLA
        WHERE date_day >= DATEADD(day, -14, CURRENT_DATE())
        UNION ALL
        SELECT channel, date_day, entity_id FROM ASSEMBLEDVIEW.MART.VW_PACING_CM360
        WHERE date_day >= DATEADD(day, -14, CURRENT_DATE())
        UNION ALL
        SELECT channel, date_day, entity_id FROM ASSEMBLEDVIEW.MART.VW_PACING_PARTNER_FILE
        UNION ALL
        SELECT channel, date_day, entity_id FROM ASSEMBLEDVIEW.MART.VW_PACING_PARTNER_OOH
      ) u
      WHERE entity_id IS NOT NULL AND TRIM(entity_id::string) <> ''
    ) s
    WHERE t.channel = s.channel
      AND t.date_day = s.date_day
      AND LOWER(TRIM(t.platform_line_item_id)) = s.pid;
  END IF;

  -- Unchanged MERGE (repo capture sql/snowflake/mart/tasks/tsk_refresh_pacing_fact.sql, VI1).
  MERGE INTO ASSEMBLEDVIEW.MART.PACING_FACT t
  USING (
    WITH unioned AS (

      SELECT
        channel, date_day, line_item_name, line_item_id,
        entity_name, entity_id, campaign_name,
        amount_spent, impressions, clicks, results, video_3s_views,
        max_fivetran_synced_at::timestamp_ntz AS max_fivetran_synced_at
      FROM ASSEMBLEDVIEW.MART.VW_PACING_DV360
      WHERE date_day >= DATEADD(day, -14, CURRENT_DATE())

      UNION ALL

      SELECT
        channel, date_day, line_item_name, line_item_id,
        entity_name, entity_id, campaign_name,
        amount_spent, impressions, clicks, results, video_3s_views,
        max_fivetran_synced_at::timestamp_ntz AS max_fivetran_synced_at
      FROM ASSEMBLEDVIEW.MART.VW_PACING_TABOOLA
      WHERE date_day >= DATEADD(day, -14, CURRENT_DATE())

      UNION ALL

      SELECT
        channel, date_day, line_item_name, line_item_id,
        entity_name, entity_id, campaign_name,
        amount_spent, impressions, clicks, results, video_3s_views,
        max_fivetran_synced_at::timestamp_ntz AS max_fivetran_synced_at
      FROM ASSEMBLEDVIEW.MART.VW_PACING_CM360
      WHERE date_day >= DATEADD(day, -14, CURRENT_DATE())

      UNION ALL

      -- Channel Factory via the partner-file pipeline. NO date filter:
      -- the source restates its entire history every day.
      SELECT
        channel, date_day, line_item_name, line_item_id,
        entity_name, entity_id, campaign_name,
        amount_spent, impressions, clicks, results, video_3s_views,
        max_fivetran_synced_at::timestamp_ntz AS max_fivetran_synced_at
      FROM ASSEMBLEDVIEW.MART.VW_PACING_PARTNER_FILE

      UNION ALL

      -- Vistar exchange report (prog OOH). NO date filter: restates year to date.
      -- VI1 2026-10-26: entity_id (so platform_line_item_id) is the Vistar Insertion Order id.
      SELECT
        channel, date_day, line_item_name, line_item_id,
        entity_name, entity_id, campaign_name,
        amount_spent, impressions, clicks, results, video_3s_views,
        max_fivetran_synced_at::timestamp_ntz AS max_fivetran_synced_at
      FROM ASSEMBLEDVIEW.MART.VW_PACING_PARTNER_OOH

    ),

    keyed AS (
      SELECT
        channel,
        date_day,
        LOWER(TRIM(entity_id::string)) AS platform_line_item_id,
        line_item_id,
        line_item_name,
        entity_name,
        entity_id,
        campaign_name,
        amount_spent,
        impressions,
        clicks,
        results,
        video_3s_views,
        max_fivetran_synced_at
      FROM unioned
      WHERE entity_id IS NOT NULL
        AND TRIM(entity_id::string) <> ''
    ),

    relabel AS (
      SELECT
        k.*,
        COALESCE(m.line_item_id, k.line_item_id) AS final_line_item_id,
        COALESCE(m.line_item_name, k.line_item_name) AS final_line_item_name
      FROM keyed k
      LEFT JOIN ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP m
        ON LOWER(TRIM(m.channel)) = LOWER(TRIM(k.channel))
       AND LOWER(TRIM(m.platform_line_item_id)) = LOWER(TRIM(k.platform_line_item_id))
       AND m.is_active = TRUE
    ),

    deduped AS (
      SELECT
        channel,
        date_day,
        platform_line_item_id,
        MAX(final_line_item_id) AS line_item_id,
        MAX(final_line_item_name) AS line_item_name,
        MAX(entity_name) AS entity_name,
        MAX(entity_id) AS entity_id,
        MAX(campaign_name) AS campaign_name,
        SUM(amount_spent) AS amount_spent,
        SUM(impressions) AS impressions,
        SUM(clicks) AS clicks,
        SUM(results) AS results,
        SUM(video_3s_views) AS video_3s_views,
        MAX(max_fivetran_synced_at) AS max_fivetran_synced_at
      FROM relabel
      GROUP BY 1, 2, 3
    )

    SELECT *, CURRENT_TIMESTAMP() AS updated_at
    FROM deduped
  ) s
  ON  t.channel = s.channel
  AND t.date_day = s.date_day
  AND LOWER(TRIM(t.platform_line_item_id)) = LOWER(TRIM(s.platform_line_item_id))

  WHEN MATCHED THEN UPDATE SET
    t.line_item_id           = s.line_item_id,
    t.line_item_name         = s.line_item_name,
    t.entity_name            = s.entity_name,
    t.entity_id              = s.entity_id,
    t.campaign_name          = s.campaign_name,
    t.amount_spent           = s.amount_spent,
    t.impressions            = s.impressions,
    t.clicks                 = s.clicks,
    t.results                = s.results,
    t.video_3s_views         = s.video_3s_views,
    t.max_fivetran_synced_at = s.max_fivetran_synced_at,
    t.updated_at             = CURRENT_TIMESTAMP()

  WHEN NOT MATCHED THEN INSERT (
    channel, date_day, platform_line_item_id,
    line_item_id, line_item_name,
    entity_name, entity_id, campaign_name,
    amount_spent, impressions, clicks, results, video_3s_views,
    max_fivetran_synced_at, updated_at
  )
  VALUES (
    s.channel, s.date_day, s.platform_line_item_id,
    s.line_item_id, s.line_item_name,
    s.entity_name, s.entity_id, s.campaign_name,
    s.amount_spent, s.impressions, s.clicks, s.results, s.video_3s_views,
    s.max_fivetran_synced_at, CURRENT_TIMESTAMP()
  );

  COMMIT;
EXCEPTION
  WHEN OTHER THEN
    ROLLBACK;
    RAISE;
END;
$$;

-- Resume only this child, then the root. (SYSTEM$TASK_DEPENDENTS_ENABLE would
-- also resume any child you had suspended on purpose; check step 0 first.)
ALTER TASK ASSEMBLEDVIEW.MART.TSK_REFRESH_PACING_FACT RESUME;
ALTER TASK ASSEMBLEDVIEW.MART.TSK_ROOT_DAILY_REFRESH RESUME;

-- ----- 7. After --------------------------------------------------------------
-- a) Channels (expect, before any new nightly rows):
--   Ad Serving - CM360       64,775 rows          0.00
--   Programmatic - Display    4,225 rows    191,347.43
--   Programmatic - OOH          263 rows    104,753.98
--   Programmatic - Video      4,283 rows    348,140.04
--   total                    73,546 rows    644,241.45   (no Social rows)
-- SELECT channel, COUNT(*) n, ROUND(SUM(amount_spent), 2) spend
-- FROM ASSEMBLEDVIEW.MART.PACING_FACT GROUP BY ROLLUP (channel) ORDER BY channel;
--
-- b) The two lines (expect pv1 2026-09 30 | 11142.88 | 498701 | 354915,
--                          pv1 2026-10 43 | 13786.86 | 585698 | 416441,
--                          pv2 2026-09 60 |  4930.55 | 332555 | 273670,
--                          pv2 2026-10 52 |  4588.93 | 294246 | 242943;
--    October grows by each new day after 27 Oct):
-- SELECT LOWER(line_item_id) lid, TO_CHAR(date_day, 'YYYY-MM') m, COUNT(*) n,
--        ROUND(SUM(amount_spent), 2) spend, SUM(impressions) imps, SUM(video_3s_views) views
-- FROM ASSEMBLEDVIEW.MART.PACING_FACT
-- WHERE LOWER(line_item_id) IN ('hartm001pv1', 'hartm001pv2') AND date_day >= '2026-09-01'
-- GROUP BY 1, 2 ORDER BY 1, 2;
--
-- c) Same lines from raw DV360 through the label map (every diff 0.00):
-- WITH v AS (
--   SELECT LOWER(COALESCE(m.line_item_id, d.line_item_id)) lid, TO_CHAR(d.date_day, 'YYYY-MM') m,
--          SUM(d.amount_spent) spend
--   FROM ASSEMBLEDVIEW.MART.VW_PACING_DV360 d
--   LEFT JOIN ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP m
--     ON m.is_active AND LOWER(TRIM(m.channel)) = LOWER(TRIM(d.channel))
--    AND LOWER(TRIM(m.platform_line_item_id)) = LOWER(TRIM(d.entity_id::string))
--   WHERE d.date_day >= '2026-01-01' GROUP BY 1, 2),
-- f AS (
--   SELECT LOWER(line_item_id) lid, TO_CHAR(date_day, 'YYYY-MM') m, SUM(amount_spent) spend
--   FROM ASSEMBLEDVIEW.MART.PACING_FACT
--   WHERE channel IN ('Programmatic - Display', 'Programmatic - Video')
--     AND REGEXP_LIKE(LOWER(TRIM(platform_line_item_id)), '^[0-9a-f]{32}$')
--     AND date_day >= '2026-01-01' GROUP BY 1, 2)
-- SELECT COALESCE(v.lid, f.lid) lid, COALESCE(v.m, f.m) m, ROUND(v.spend, 2) raw_spend,
--        ROUND(f.spend, 2) fact_spend, ROUND(COALESCE(f.spend, 0) - COALESCE(v.spend, 0), 2) diff
-- FROM v FULL OUTER JOIN f ON f.lid = v.lid AND f.m = v.m
-- WHERE ABS(COALESCE(f.spend, 0) - COALESCE(v.spend, 0)) >= 0.01 ORDER BY 1, 2;
-- expect 0 rows (DV360 2026 total 346,128.47 on 27 Oct in both).
--
-- d) The task is in the graph and started (expect TSK_REFRESH_PACING_FACT
--    'started', predecessor the root, root 'started'):
-- SHOW TASKS LIKE 'TSK_REFRESH_PACING_FACT' IN SCHEMA ASSEMBLEDVIEW.MART;
-- SHOW TASKS LIKE 'TSK_ROOT_DAILY_REFRESH' IN SCHEMA ASSEMBLEDVIEW.MART;
--
-- e) After the next 06:30 run: it SUCCEEDED, and nothing is stale in the window
--    (expect 0). Same query as the task's count:
-- SELECT name, state, error_message, completed_time
-- FROM TABLE(ASSEMBLEDVIEW.INFORMATION_SCHEMA.TASK_HISTORY(
--   TASK_NAME => 'TSK_REFRESH_PACING_FACT', RESULT_LIMIT => 3)) ORDER BY scheduled_time DESC;
--
-- f) Optional, only if you want Direct pacing / fixed cost actuals to move too.
--    FIXED_COST_REPORTED_DAILY_FACT.ACTUAL_PLATFORM_SPEND is locked after 3 days,
--    so the nightly proc will not pick up the change on its own. Today:
--    hartm001pv1 Sep 11,142.88 / Oct 14,914.30, hartm001pv2 Sep 4,930.55 / Oct 4,772.94.
--    A filtered backfill recomputes one line (lowercase id; never a null id with TRUE):
-- CALL ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_REPORTED_DAILY('hartm001pv1', TRUE);
-- CALL ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_REPORTED_DAILY('hartm001pv2', TRUE);

-- ----- 8. Rollback (only if needed) ------------------------------------------
-- Puts PACING_FACT back exactly as the clone, keeping the table's grants, and
-- puts the old task body back. Rows the nightly added after step 3 are lost and
-- come back on the next run (14-day window).
-- ALTER TASK ASSEMBLEDVIEW.MART.TSK_ROOT_DAILY_REFRESH SUSPEND;
-- BEGIN TRANSACTION;
-- DELETE FROM ASSEMBLEDVIEW.MART.PACING_FACT;
-- INSERT INTO ASSEMBLEDVIEW.MART.PACING_FACT
--   SELECT * FROM ASSEMBLEDVIEW.MART.PF1_PACING_FACT_BACKUP_20261027;
-- COMMIT;
-- -- expect the step 1 counts:
-- SELECT COUNT(*), ROUND(SUM(amount_spent), 2) FROM ASSEMBLEDVIEW.MART.PACING_FACT;
-- -- Old task body: run sql/snowflake/mart/tasks/tsk_refresh_pacing_fact.sql
-- -- (the repo capture, unchanged by PF1), then:
-- ALTER TASK ASSEMBLEDVIEW.MART.TSK_REFRESH_PACING_FACT RESUME;
-- ALTER TASK ASSEMBLEDVIEW.MART.TSK_ROOT_DAILY_REFRESH RESUME;

-- ----- 9. Clean-up once happy (a week or so) ---------------------------------
-- DROP TABLE ASSEMBLEDVIEW.MART.PF1_STALE_ROWS_20261027;
-- DROP TABLE ASSEMBLEDVIEW.MART.PF1_MISSING_ROWS_20261027;
-- DROP TABLE ASSEMBLEDVIEW.MART.PF1_PACING_FACT_BACKUP_20261027;
