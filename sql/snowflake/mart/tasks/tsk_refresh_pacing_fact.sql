-- ASSEMBLEDVIEW.MART.TSK_REFRESH_PACING_FACT
-- Live body from PF1 (sql/snowflake/mart/migrations/2026-10-27_PF1_pacing_fact_stale_rows_ACCOUNTADMIN.sql,
-- step 6). Applied by Luke as ACCOUNTADMIN on 2026-10-27. Luke confirmed all 7
-- tasks in the graph are started after the run.
-- Earlier captures: live DDL 2026-09-15 (OOH union), VI1 2026-10-26 (Vistar keyed
-- by Insertion Order). This file replaces the pre-PF1 plain MERGE body.
--
-- What it does: a Snowflake Scripting block in one transaction.
--   1. Counts PACING_FACT keys (channel, date_day, platform_line_item_id) that the
--      source views no longer have, only where the MERGE also refreshes: the
--      14-day window, all 'Programmatic - OOH' rows, and 2026 'Programmatic - Video'
--      rows with a non-md5 key (Channel Factory). Never social, never pre-2026.
--   2. Deletes those keys when the count is 1 to 500 (more than 500 means a source
--      view probably came back empty, so the delete is skipped).
--   3. Runs the same MERGE as before (VI1 body), unchanged.
--
-- Not captured with GET_DDL: CLAUDE_RW has no privilege on the task, so this is
-- the PF1 text Luke ran. To check against live, as ACCOUNTADMIN:
--   SELECT GET_DDL('task', 'ASSEMBLEDVIEW.MART.TSK_REFRESH_PACING_FACT');
--
-- Task graph rule when re-applying: suspend TSK_ROOT_DAILY_REFRESH first, run
-- this, then RESUME this task and then the root (a replaced task is created
-- suspended).
USE SCHEMA ASSEMBLEDVIEW.MART;

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

-- After re-applying:
-- ALTER TASK ASSEMBLEDVIEW.MART.TSK_REFRESH_PACING_FACT RESUME;
-- ALTER TASK ASSEMBLEDVIEW.MART.TSK_ROOT_DAILY_REFRESH RESUME;
