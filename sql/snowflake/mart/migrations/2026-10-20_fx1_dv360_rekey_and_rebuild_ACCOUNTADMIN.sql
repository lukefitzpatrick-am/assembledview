-- =============================================================================
-- FX1: DV360 stable keys, retire per-row relabels, rebuild 2026 DV360 rows
-- Run as ACCOUNTADMIN in Snowsight, straight after
-- sql/snowflake/mart/views/vw_pacing_dv360.sql, and before the next
-- TSK_REFRESH_PACING_FACT run (it runs after TSK_ROOT_DAILY_REFRESH).
-- =============================================================================
-- Why (checked live 2026-10-20):
--   * VW_PACING_DV360 only read old-style plan ids (BICAU002PV1). New ids
--     (hartm001PD1, golf025PV1, legal003PD2) fell back to FIVETRAN_ID, which is
--     different on every raw row. About $310k of 2026 DV360 delivery never met
--     its plan line, and relabels keyed on FIVETRAN_ID covered one day each.
--   * PACING_FACT holds DV360 rows keyed on FIVETRAN_ID values that Fivetran
--     has since replaced (352 rows, about $31k, Jan to Sep 2026). The daily
--     MERGE never matched them again, so they double count.
--   * 377 of the 382 active LINE_ITEM_LABEL_MAP rows on Programmatic -
--     Display/Video are keyed on FIVETRAN_ID. 335 map to exactly the id the new
--     view parses from the name (all BOSS lines); the rest point at FIVETRAN_IDs
--     that no longer exist. None are needed after the view fix. The other 5
--     (Taboola campaign ids 46223123, 46223116, 49845855 and two BOSS name keys)
--     are left as they are.
--
-- What it does, in one transaction:
--   1. Guard: stops unless the new view is live (hartm001pd1 must appear).
--   2. Deactivates those 377 map rows (NOTES gets 'superseded by FX1').
--   3. Deletes DV360 rows from PACING_FACT: Programmatic - Display/Video rows
--      whose PLATFORM_LINE_ITEM_ID is a FIVETRAN_ID-shaped key (27 base64
--      characters plus '='): 3,526 rows, $337,136.13 on 20 Oct. Taboola
--      (numeric keys), Channel Factory partner file (text keys) and rows with
--      no key are not touched.
--   4. Re-inserts DV360 rows from 2026-01-01 from the new view (raw DV360
--      spend for 2026 was $332,543.25 on 20 Oct, so the fact drops by about
--      $4.6k of duplicates), with the same
--      label-map join and per-day dedupe as TSK_REFRESH_PACING_FACT
--      (sql/snowflake/mart/tasks/tsk_refresh_pacing_fact.sql, CTEs keyed,
--      relabel and deduped).
--
-- DV360 rows before 2026-01-01: PACING_FACT has none keyed this way today
-- (earliest 2026-01-13), so none are deleted or added.
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE SCHEMA ASSEMBLEDVIEW.MART;

-- ----- Before: run these first and keep the numbers ------------------------
-- DV360 rows by month in PACING_FACT (FIVETRAN_ID-shaped keys)
-- SELECT DATE_TRUNC('month', date_day) AS m, COUNT(*) AS n, ROUND(SUM(amount_spent), 2) AS spend
-- FROM PACING_FACT
-- WHERE channel IN ('Programmatic - Display', 'Programmatic - Video')
--   AND REGEXP_LIKE(platform_line_item_id, '^[a-z0-9+/]{27}=$')
-- GROUP BY 1 ORDER BY 1;
--
-- Raw DV360 spend by month (what the rebuild should land on)
-- SELECT DATE_TRUNC('month', date_day) AS m, ROUND(SUM(amount_spent), 2) AS spend
-- FROM VW_STG_DV360_PACING WHERE date_day >= '2026-01-01' GROUP BY 1 ORDER BY 1;
--
-- Map rows to be retired (expect 377)
-- SELECT COUNT(*) FROM LINE_ITEM_LABEL_MAP
-- WHERE is_active AND channel IN ('Programmatic - Display', 'Programmatic - Video')
--   AND REGEXP_LIKE(LOWER(TRIM(platform_line_item_id::varchar)), '^[a-z0-9+/]{27}=$');

EXECUTE IMMEDIATE $$
DECLARE
  new_view_rows INTEGER;
  map_retired INTEGER;
  fact_deleted INTEGER;
  fact_inserted INTEGER;
BEGIN
  SELECT COUNT(*) INTO :new_view_rows
  FROM ASSEMBLEDVIEW.MART.VW_PACING_DV360
  WHERE line_item_id = 'hartm001pd1';

  IF (new_view_rows = 0) THEN
    RETURN 'STOPPED: VW_PACING_DV360 is still the old version. Run sql/snowflake/mart/views/vw_pacing_dv360.sql first.';
  END IF;

  BEGIN TRANSACTION;

  UPDATE ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP
  SET is_active = FALSE,
      notes = COALESCE(notes || ' | ', '') || 'superseded by FX1 2026-10-20 (DV360 stable keys)',
      updated_at = CURRENT_TIMESTAMP()
  WHERE is_active
    AND channel IN ('Programmatic - Display', 'Programmatic - Video')
    AND REGEXP_LIKE(LOWER(TRIM(platform_line_item_id::varchar)), '^[a-z0-9+/]{27}=$');
  map_retired := SQLROWCOUNT;

  DELETE FROM ASSEMBLEDVIEW.MART.PACING_FACT
  WHERE channel IN ('Programmatic - Display', 'Programmatic - Video')
    AND REGEXP_LIKE(platform_line_item_id, '^[a-z0-9+/]{27}=$');
  fact_deleted := SQLROWCOUNT;

  INSERT INTO ASSEMBLEDVIEW.MART.PACING_FACT (
    channel, date_day, platform_line_item_id,
    line_item_id, line_item_name,
    entity_name, entity_id, campaign_name,
    amount_spent, impressions, clicks, results, video_3s_views,
    max_fivetran_synced_at, updated_at
  )
  WITH keyed AS (
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
      max_fivetran_synced_at::timestamp_ntz AS max_fivetran_synced_at
    FROM ASSEMBLEDVIEW.MART.VW_PACING_DV360
    WHERE date_day >= '2026-01-01'
      AND channel IN ('Programmatic - Display', 'Programmatic - Video')
      AND entity_id IS NOT NULL
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
  )
  SELECT
    channel,
    date_day,
    platform_line_item_id,
    MAX(final_line_item_id),
    MAX(final_line_item_name),
    MAX(entity_name),
    MAX(entity_id),
    MAX(campaign_name),
    SUM(amount_spent),
    SUM(impressions),
    SUM(clicks),
    SUM(results),
    SUM(video_3s_views),
    MAX(max_fivetran_synced_at),
    CURRENT_TIMESTAMP()
  FROM relabel
  GROUP BY channel, date_day, platform_line_item_id;
  fact_inserted := SQLROWCOUNT;

  COMMIT;

  RETURN 'FX1 done. Map rows retired: ' || map_retired ||
         '. PACING_FACT DV360 rows deleted: ' || fact_deleted ||
         '. Inserted: ' || fact_inserted || '.';
EXCEPTION
  WHEN OTHER THEN
    ROLLBACK;
    RAISE;
END;
$$;

-- ----- After: checks ---------------------------------------------------------
-- 1. hartm001 DV360 lines (expect hartm001ml1 ~67,264.62, hartm001ml2 ~49,803.43,
--    hartm001pd1 ~26,672.68, hartm001pd2 ~7,699.43)
-- SELECT line_item_id, ROUND(SUM(amount_spent), 2) AS spend, MIN(date_day), MAX(date_day)
-- FROM PACING_FACT
-- WHERE line_item_id LIKE 'hartm001%' AND channel ILIKE 'Programmatic%'
-- GROUP BY 1 ORDER BY 1;
--
-- 2. FIVETRAN_ID-shaped keys left in 2026 (expect 0)
-- SELECT COUNT(*) FROM PACING_FACT
-- WHERE channel IN ('Programmatic - Display', 'Programmatic - Video')
--   AND REGEXP_LIKE(platform_line_item_id, '^[a-z0-9+/]{27}=$');
--
-- 3. DV360 spend by month now equals raw DV360 spend by month (compare with
--    the second "before" query)
-- SELECT DATE_TRUNC('month', date_day) AS m, ROUND(SUM(amount_spent), 2) AS spend
-- FROM PACING_FACT
-- WHERE channel IN ('Programmatic - Display', 'Programmatic - Video')
--   AND LENGTH(platform_line_item_id) = 32 AND date_day >= '2026-01-01'
-- GROUP BY 1 ORDER BY 1;
