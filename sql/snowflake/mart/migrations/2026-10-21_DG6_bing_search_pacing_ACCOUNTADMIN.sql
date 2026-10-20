-- =============================================================================
-- DG6: Microsoft Ads (Bing) search delivery into SEARCH_PACING_FACT
-- Run as ACCOUNTADMIN in Snowsight, top to bottom. Measured live 2026-10-21.
-- =============================================================================
-- Issue: Fivetran schema ASSEMBLEDVIEW.BINGADS is live but nothing in MART reads
-- it. Two plan lines are Bing search lines (platform 'Bing - AM', channel search)
-- and show $0 delivered:
--   hartm001se8   Hartmanns, account 151698332, ad groups '...-hartm001SE8'
--   curatif002se2 Curatif, account 138224998, ad groups '...-curatif002SE2'
-- (Account 151231758 has no 2026 delivery.)
--
-- What this file does (new objects only; no existing view, proc or task changes):
--   1. VW_PACING_BING_SEARCH_DAILY: the same 17 columns as the live
--      VW_PACING_GOOGLE_SEARCH_DAILY. Ad group grain, one row per channel / day /
--      ad group. LINE_ITEM_ID = lower(trim(text after the last '-' in the latest
--      ad group name)), the Google rule. CUSTOMER_ID = Bing ACCOUNT_ID.
--      Spend = SPEND (account currency, all AUD). Conversions = CONVERSIONS_QUALIFIED
--      (the Microsoft 'Conv.' column), Revenue = REVENUE (both leave out goals not
--      counted in conversions, like Google primary). Top impression % is NULL:
--      Bing only gives a top / other split and most impressions are Audience
--      network, so it is not comparable with Google's figure.
--      The report is segmented by network, device, match type and top / other;
--      the GROUP BY collapses those. Do not remove it.
--   2. VW_CONVERSIONS_BING_TOTAL: Bing conversions for CONVERSION_FACT, platform
--      'microsoft_ads', event_key 'all_primary' (one event per line, like Google).
--   3. SP_REFRESH_BINGSEARCHPACING_ROLLING(DAYS_BACK): MERGE both into
--      SEARCH_PACING_FACT (channel 'Search - Microsoft Ads') and CONVERSION_FACT.
--      Same MERGE key and columns as SP_REFRESH_GOOGLESEARCHPACING_ROLLING.
--   4. TSK_REFRESH_BINGSEARCHPACING after TSK_ROOT_DAILY_REFRESH, 14 days.
--      It runs beside the Google task; Snowflake queues the two MERGEs on
--      SEARCH_PACING_FACT, they touch different CHANNEL rows.
--   5. Grants. 6. 2026 backfill (guarded). 7. After checks.
--
-- The rolling refresh rewrites line ids from live ad group names every night
-- (same as Google), so a relabel on these rows only holds past 14 days.
-- App side (same commit): 'Search - Microsoft Ads' is in SEARCH_PACING_CHANNELS
-- and 'microsoft_ads' is a conversion platform. Apply Supabase migration
-- db/migrations/0104_conversion_platform_microsoft_ads.sql before saving a
-- Microsoft Ads conversion event for a client.
--
-- Expected 2026 numbers (measured 2026-10-21; Oct is month to date):
--   hartm001se8   Jan 708.71 | Feb 668.91 | Mar 742.44 | Apr 560.75 | May 548.53
--                 Jun 628.66 | Jul 764.06 | Aug 1,230.62 | Sep 781.44 | Oct 764.36
--                 = 7,398.48 over 3,871 rows, 0 conversions
--   curatif002se2 Jan 1,270.33 | Feb 2,154.89 | Mar 1,425.28 | Apr 1,163.58
--                 = 6,014.08 over 1,592 rows, 20 conversions, 2,150.66 revenue
--   Total 2026: 5,463 rows, 13,412.56 (grows a little each day).
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE SCHEMA ASSEMBLEDVIEW.MART;

-- ----- Before ----------------------------------------------------------------
-- expect spf 0, cf 0 (no Bing rows in either fact yet)
-- SELECT 'spf' t, COUNT(*) FROM SEARCH_PACING_FACT WHERE channel = 'Search - Microsoft Ads'
-- UNION ALL SELECT 'cf', COUNT(*) FROM CONVERSION_FACT WHERE platform = 'microsoft_ads';
-- expect no rows
-- SHOW TASKS LIKE 'TSK_REFRESH_BINGSEARCHPACING' IN SCHEMA ASSEMBLEDVIEW.MART;

-- ----- 1. Pacing view --------------------------------------------------------
CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.VW_PACING_BING_SEARCH_DAILY COPY GRANTS AS
WITH ad_group_latest AS (
  SELECT ID::string AS AD_GROUP_ID, NAME AS AD_GROUP_NAME
  FROM ASSEMBLEDVIEW.BINGADS.AD_GROUP_HISTORY
  QUALIFY ROW_NUMBER() OVER (PARTITION BY ID ORDER BY MODIFIED_TIME DESC NULLS LAST, _FIVETRAN_SYNCED DESC) = 1
),
campaign_latest AS (
  SELECT ID::string AS CAMPAIGN_ID, NAME AS CAMPAIGN_NAME
  FROM ASSEMBLEDVIEW.BINGADS.CAMPAIGN_HISTORY
  QUALIFY ROW_NUMBER() OVER (PARTITION BY ID ORDER BY MODIFIED_TIME DESC NULLS LAST, _FIVETRAN_SYNCED DESC) = 1
),
adgroup_rollup AS (
  SELECT
    CAST(r.DATE AS date)                                        AS DATE_DAY,
    r.CAMPAIGN_ID::string                                       AS CAMPAIGN_ID,
    r.AD_GROUP_ID::string                                       AS AD_GROUP_ID,
    r.ACCOUNT_ID::string                                        AS CUSTOMER_ID,
    SUM(COALESCE(r.SPEND, 0))                                   AS AMOUNT_SPENT,
    SUM(COALESCE(r.IMPRESSIONS, 0))                             AS IMPRESSIONS,
    SUM(COALESCE(r.CLICKS, 0))                                  AS CLICKS,
    SUM(COALESCE(r.CONVERSIONS_QUALIFIED, r.CONVERSIONS, 0))    AS CONVERSIONS,
    SUM(COALESCE(r.REVENUE, 0))                                 AS REVENUE,
    MAX(r._FIVETRAN_SYNCED)::timestamp_ntz                      AS MAX_FIVETRAN_SYNCED_AT
  FROM ASSEMBLEDVIEW.BINGADS.AD_GROUP_PERFORMANCE_DAILY_REPORT r
  GROUP BY 1, 2, 3, 4
)
SELECT
  'Search - Microsoft Ads'                                      AS CHANNEL,
  a.DATE_DAY,
  a.CUSTOMER_ID,
  c.CAMPAIGN_NAME,
  LOWER(TRIM(g.AD_GROUP_NAME))                                  AS LINE_ITEM_NAME,
  LOWER(TRIM(REGEXP_SUBSTR(g.AD_GROUP_NAME, '[^-]+$')))         AS LINE_ITEM_ID,
  a.AD_GROUP_ID                                                 AS PLATFORM_LINE_ITEM_ID,
  a.CAMPAIGN_ID,
  a.AMOUNT_SPENT,
  a.IMPRESSIONS,
  a.CLICKS,
  a.CONVERSIONS,
  a.REVENUE,
  NULL::float                                                   AS TOP_IMPRESSION_PERCENTAGE,
  NULL::float                                                   AS ABSOLUTE_TOP_IMPRESSION_PERCENTAGE,
  a.MAX_FIVETRAN_SYNCED_AT,
  CURRENT_TIMESTAMP()                                           AS UPDATED_AT
FROM adgroup_rollup a
LEFT JOIN ad_group_latest g ON g.AD_GROUP_ID = a.AD_GROUP_ID
LEFT JOIN campaign_latest c ON c.CAMPAIGN_ID = a.CAMPAIGN_ID;

-- ----- 2. Conversions source view (same shape as VW_CONVERSIONS_GOOGLE_TOTAL) --
CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.VW_CONVERSIONS_BING_TOTAL COPY GRANTS AS
SELECT channel, date_day, LOWER(TRIM(platform_line_item_id)) AS platform_line_item_id,
       'microsoft_ads' AS platform, 'all_primary' AS event_key,
       'All conversions (Microsoft Ads)' AS event_name, 'other' AS event_category,
       conversions::float AS conversions, revenue::float AS conversion_value,
       max_fivetran_synced_at
FROM ASSEMBLEDVIEW.MART.VW_PACING_BING_SEARCH_DAILY;

-- ----- 3. Refresh procedure --------------------------------------------------
CREATE OR REPLACE PROCEDURE ASSEMBLEDVIEW.MART.SP_REFRESH_BINGSEARCHPACING_ROLLING("DAYS_BACK" NUMBER(38,0))
RETURNS VARCHAR
LANGUAGE SQL
EXECUTE AS OWNER
AS '
declare
  spf_rows integer default 0;
  cf_rows integer default 0;
begin
  merge into ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT t
  using (
    select CHANNEL, DATE_DAY, LINE_ITEM_ID, LINE_ITEM_NAME, PLATFORM_LINE_ITEM_ID,
           CAMPAIGN_ID, CAMPAIGN_NAME, CUSTOMER_ID, AMOUNT_SPENT, IMPRESSIONS, CLICKS,
           CONVERSIONS, REVENUE, TOP_IMPRESSION_PERCENTAGE, ABSOLUTE_TOP_IMPRESSION_PERCENTAGE,
           MAX_FIVETRAN_SYNCED_AT
    from ASSEMBLEDVIEW.MART.VW_PACING_BING_SEARCH_DAILY
    where DATE_DAY >= dateadd(day, -:DAYS_BACK, current_date())
  ) s
  on  t.CHANNEL = s.CHANNEL
  and t.DATE_DAY = s.DATE_DAY
  and lower(trim(t.PLATFORM_LINE_ITEM_ID)) = lower(trim(s.PLATFORM_LINE_ITEM_ID))
  when matched then update set
    LINE_ITEM_ID = s.LINE_ITEM_ID, LINE_ITEM_NAME = s.LINE_ITEM_NAME,
    CAMPAIGN_ID = s.CAMPAIGN_ID, CAMPAIGN_NAME = s.CAMPAIGN_NAME, CUSTOMER_ID = s.CUSTOMER_ID,
    AMOUNT_SPENT = s.AMOUNT_SPENT, IMPRESSIONS = s.IMPRESSIONS, CLICKS = s.CLICKS,
    CONVERSIONS = s.CONVERSIONS, REVENUE = s.REVENUE,
    TOP_IMPRESSION_PERCENTAGE = s.TOP_IMPRESSION_PERCENTAGE,
    ABSOLUTE_TOP_IMPRESSION_PERCENTAGE = s.ABSOLUTE_TOP_IMPRESSION_PERCENTAGE,
    MAX_FIVETRAN_SYNCED_AT = s.MAX_FIVETRAN_SYNCED_AT, UPDATED_AT = current_timestamp()
  when not matched then insert (
    CHANNEL, DATE_DAY, LINE_ITEM_ID, LINE_ITEM_NAME, PLATFORM_LINE_ITEM_ID,
    CAMPAIGN_ID, CAMPAIGN_NAME, CUSTOMER_ID, AMOUNT_SPENT, IMPRESSIONS, CLICKS,
    CONVERSIONS, REVENUE, TOP_IMPRESSION_PERCENTAGE, ABSOLUTE_TOP_IMPRESSION_PERCENTAGE,
    MAX_FIVETRAN_SYNCED_AT, UPDATED_AT
  ) values (
    s.CHANNEL, s.DATE_DAY, s.LINE_ITEM_ID, s.LINE_ITEM_NAME, s.PLATFORM_LINE_ITEM_ID,
    s.CAMPAIGN_ID, s.CAMPAIGN_NAME, s.CUSTOMER_ID, s.AMOUNT_SPENT, s.IMPRESSIONS, s.CLICKS,
    s.CONVERSIONS, s.REVENUE, s.TOP_IMPRESSION_PERCENTAGE, s.ABSOLUTE_TOP_IMPRESSION_PERCENTAGE,
    s.MAX_FIVETRAN_SYNCED_AT, current_timestamp()
  );
  spf_rows := SQLROWCOUNT;

  merge into ASSEMBLEDVIEW.MART.CONVERSION_FACT t
  using (
    select channel, date_day, platform_line_item_id, platform, event_key,
           max(event_name) as event_name, max(event_category) as event_category,
           sum(conversions) as conversions, sum(conversion_value) as conversion_value,
           max(max_fivetran_synced_at) as max_fivetran_synced_at
    from ASSEMBLEDVIEW.MART.VW_CONVERSIONS_BING_TOTAL
    where date_day >= dateadd(day, -:DAYS_BACK, current_date())
      and platform_line_item_id is not null and platform_line_item_id <> ''''
    group by 1, 2, 3, 4, 5
  ) s
  on  t.channel = s.channel and t.date_day = s.date_day
  and t.platform_line_item_id = s.platform_line_item_id
  and t.platform = s.platform and t.event_key = s.event_key
  when matched then update set
    t.event_name = s.event_name, t.event_category = s.event_category,
    t.conversions = s.conversions, t.conversion_value = s.conversion_value,
    t.max_fivetran_synced_at = s.max_fivetran_synced_at, t.updated_at = current_timestamp()
  when not matched then insert (channel, date_day, platform_line_item_id, platform, event_key, event_name,
    event_category, conversions, conversion_value, max_fivetran_synced_at, updated_at)
  values (s.channel, s.date_day, s.platform_line_item_id, s.platform, s.event_key, s.event_name,
    s.event_category, s.conversions, s.conversion_value, s.max_fivetran_synced_at, current_timestamp());
  cf_rows := SQLROWCOUNT;

  return ''OK search_pacing_fact='' || spf_rows || '' conversion_fact='' || cf_rows;
end;
';

-- ----- 4. Task (graph rule: suspend root, create, re-enable the graph) -------
ALTER TASK ASSEMBLEDVIEW.MART.TSK_ROOT_DAILY_REFRESH SUSPEND;

CREATE OR REPLACE TASK ASSEMBLEDVIEW.MART.TSK_REFRESH_BINGSEARCHPACING
  WAREHOUSE = AV_APP_WH
  AFTER ASSEMBLEDVIEW.MART.TSK_ROOT_DAILY_REFRESH
AS
  CALL ASSEMBLEDVIEW.MART.SP_REFRESH_BINGSEARCHPACING_ROLLING(14);

SELECT SYSTEM$TASK_DEPENDENTS_ENABLE('ASSEMBLEDVIEW.MART.TSK_ROOT_DAILY_REFRESH');

-- ----- 5. Grants -------------------------------------------------------------
GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.VW_PACING_BING_SEARCH_DAILY TO ROLE CLAUDE_RW;
GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.VW_PACING_BING_SEARCH_DAILY TO ROLE AV_APP_ROLE;
GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.VW_PACING_BING_SEARCH_DAILY TO ROLE AV_APP_READ_ROLE;
GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.VW_CONVERSIONS_BING_TOTAL   TO ROLE CLAUDE_RW;
GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.VW_CONVERSIONS_BING_TOTAL   TO ROLE AV_APP_ROLE;
GRANT SELECT ON VIEW ASSEMBLEDVIEW.MART.VW_CONVERSIONS_BING_TOTAL   TO ROLE AV_APP_READ_ROLE;

-- ----- 6. Backfill 1 Jan 2026 to today (guarded) -----------------------------
-- Calls the proc once with a window back to 1 Jan 2026, then checks the fact
-- against the view for 2026. MERGE is idempotent, so a re-run is safe.
EXECUTE IMMEDIATE $$
DECLARE
  days_back INTEGER;
  res VARCHAR;
  v_rows INTEGER; v_spend NUMBER(38,2);
  f_rows INTEGER; f_spend NUMBER(38,2);
  cv_rows INTEGER; cf_rows INTEGER;
BEGIN
  days_back := DATEDIFF(day, '2026-01-01'::date, CURRENT_DATE());
  CALL ASSEMBLEDVIEW.MART.SP_REFRESH_BINGSEARCHPACING_ROLLING(:days_back);
  SELECT $1 INTO :res FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()));

  SELECT COUNT(*), ROUND(SUM(amount_spent), 2) INTO :v_rows, :v_spend
    FROM ASSEMBLEDVIEW.MART.VW_PACING_BING_SEARCH_DAILY WHERE date_day >= '2026-01-01';
  SELECT COUNT(*), ROUND(SUM(amount_spent), 2) INTO :f_rows, :f_spend
    FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT
    WHERE channel = 'Search - Microsoft Ads' AND date_day >= '2026-01-01';
  SELECT COUNT(*) INTO :cv_rows FROM ASSEMBLEDVIEW.MART.VW_CONVERSIONS_BING_TOTAL WHERE date_day >= '2026-01-01';
  SELECT COUNT(*) INTO :cf_rows FROM ASSEMBLEDVIEW.MART.CONVERSION_FACT
    WHERE platform = 'microsoft_ads' AND date_day >= '2026-01-01';

  IF (v_rows <> f_rows OR v_spend <> f_spend OR cv_rows <> cf_rows OR f_rows < 5400) THEN
    RETURN 'CHECK FAILED (nothing rolled back; see Undo): ' || res || ' view=' || v_rows || '|' || v_spend
      || ' fact=' || f_rows || '|' || f_spend || ' conv view=' || cv_rows || ' conv fact=' || cf_rows;
  END IF;
  RETURN 'OK ' || res || ' rows=' || f_rows || ' spend=' || f_spend || ' conv rows=' || cf_rows;
END;
$$;
-- expect: OK OK search_pacing_fact=5463 conversion_fact=5463 rows=5463 spend=13412.56 conv rows=5463
-- (each a little higher if Fivetran has synced since 21 Oct)

-- ----- 7. After --------------------------------------------------------------
-- Monthly reconciliation, raw report vs fact (every diff should be 0.00):
-- WITH raw AS (
--   SELECT account_id::string acct, TO_CHAR(DATE_TRUNC('month', date), 'YYYY-MM') m, ROUND(SUM(spend), 2) s
--   FROM ASSEMBLEDVIEW.BINGADS.AD_GROUP_PERFORMANCE_DAILY_REPORT WHERE date >= '2026-01-01' GROUP BY 1, 2),
-- fact AS (
--   SELECT customer_id acct, TO_CHAR(DATE_TRUNC('month', date_day), 'YYYY-MM') m, ROUND(SUM(amount_spent), 2) s
--   FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT
--   WHERE channel = 'Search - Microsoft Ads' AND date_day >= '2026-01-01' GROUP BY 1, 2)
-- SELECT COALESCE(r.acct, f.acct) acct, COALESCE(r.m, f.m) m, r.s raw_spend, f.s fact_spend,
--        ROUND(COALESCE(r.s, 0) - COALESCE(f.s, 0), 2) diff
-- FROM raw r FULL OUTER JOIN fact f ON f.acct = r.acct AND f.m = r.m ORDER BY 1, 2;
-- expect 151698332: 708.71, 668.91, 742.44, 560.75, 548.53, 628.66, 764.06, 1230.62, 781.44, 764.36 (+)
--        138224998: 1270.33, 2154.89, 1425.28, 1163.58
--
-- Line totals (expect curatif002se2 1592 | 6014.08 | 20 | 2150.66, hartm001se8 3871 | 7398.48 | 0 | 0):
-- SELECT LOWER(line_item_id), COUNT(*), ROUND(SUM(amount_spent), 2), SUM(conversions), ROUND(SUM(revenue), 2)
-- FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT
-- WHERE channel = 'Search - Microsoft Ads' AND date_day >= '2026-01-01' GROUP BY 1 ORDER BY 1;
--
-- Conversions land with a line id (expect curatif002se2 20 | 2150.66, hartm001se8 0 | 0):
-- SELECT line_item_id, SUM(conversions), ROUND(SUM(conversion_value), 2)
-- FROM ASSEMBLEDVIEW.MART.VW_CONVERSION_DAILY
-- WHERE platform = 'microsoft_ads' AND date_day >= '2026-01-01' GROUP BY 1;
--
-- Task graph (expect TSK_REFRESH_BINGSEARCHPACING 'started' with the root as
-- predecessor, root 'started'):
-- SHOW TASKS LIKE 'TSK_%' IN SCHEMA ASSEMBLEDVIEW.MART;
-- SHOW GRANTS ON VIEW ASSEMBLEDVIEW.MART.VW_PACING_BING_SEARCH_DAILY;
--
-- ----- Undo (only if needed) -------------------------------------------------
-- ALTER TASK ASSEMBLEDVIEW.MART.TSK_ROOT_DAILY_REFRESH SUSPEND;
-- DROP TASK ASSEMBLEDVIEW.MART.TSK_REFRESH_BINGSEARCHPACING;
-- SELECT SYSTEM$TASK_DEPENDENTS_ENABLE('ASSEMBLEDVIEW.MART.TSK_ROOT_DAILY_REFRESH');
-- DELETE FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT WHERE channel = 'Search - Microsoft Ads';
-- DELETE FROM ASSEMBLEDVIEW.MART.CONVERSION_FACT WHERE platform = 'microsoft_ads';
