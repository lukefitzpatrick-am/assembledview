-- =============================================================================
-- VI1: Vistar (Programmatic - OOH) pacing keyed by Insertion Order, not Campaign
-- Run as ACCOUNTADMIN in Snowsight, steps 0 to 5 in order, in one sitting,
-- away from the nightly TSK_ROOT_DAILY_REFRESH run. Measured live 2026-10-26.
-- =============================================================================
-- Why: one Vistar Insertion Order (IO) holds many campaigns (one per venue x
-- publisher x region). The AV line is bought at IO level, so PARTNER_LINE_MAP
-- needed one row per campaign (48 rows today, and every new campaign Vistar
-- spins up lands unmapped until someone adds a row). Keyed by IO it is 9 rows.
--
-- Source: the emailed "Vistar Scheduled Report ... Snowflake Report" CSV
-- already carries "Insertion Order Name" (col 4) and "Insertion Order" (col 5,
-- the IO id). The parser read neither. RAW.PARTNER_FILE_LINES keeps every
-- line of every file, so history is backfilled from the stored file, not a
-- re-send. Every campaign id sits under exactly one IO in every stored file
-- (250 campaigns, 250 campaign/IO pairs, 9 IOs).
--
-- Live 2026-10-26 (RAW holds file vistar/2026-10-20/..._Snowflake-Report.csv):
--   RAW.PARTNER_DELIVERY_DAILY Vistar   15,442 rows  2 Feb - 21 Oct  $98,812.38
--   RAW.PARTNER_LINE_MAP vistar         48 campaign rows (47 with a line)
--   MART.PACING_FACT Programmatic - OOH 1,705 rows  $64,637.89  imps 2,018,360  plays 309,297
--     legal004po1  1,030 rows  34 campaign ids  $54,092.15  imps 1,605,823
--     sinch001po1    675 rows  13 campaign ids  $10,545.74  imps   412,537
--
-- The 9 IOs (spend = whole file):
--   po0H63X8SYuchWn3Desj0Q  legalsuper - Jan-Mar26                           $10,995.21  -> legal004po1
--   Q0ZsTvUrRZydvheNYxVlmQ  legalsuper - FY26 Q4 Apr-Jun                     $43,096.94  -> legal004po1
--   QQazuPCLRo2MRIf_0IvlFA  Sinch - Campaign Current Customers               $11,798.11  -> sinch001po1
--   5WlxO78aQY2Z7JF_DvqisA  Sinch - Small Format B2B Targeting               $6,621.20   unmapped
--   bQNGtD0VRMGhfUdyG4T5lw  Sinch - SME Business Owners - Large Format       $6,501.77   unmapped
--   xJ_2J9cxRgOQhBAv7USHZw  Sinch - Workplace Media                          $5,212.39   unmapped
--   CQSz7VjnRxG22iCsBmo0Og  MoliCare - Skin Protection 2026 - Contextual OOH $6,653.58   unmapped
--   nCcV5GJqS1moYmb5dDhzXg  Strength Meals Co - FY27 Launch Campaign         $7,889.67   unmapped
--   x5MLVC5NTMOXB7RxubHUOg  Strength Meals Co - FY27 Launch Campaign         $43.51      unmapped
--   The 6 unmapped IOs were unmapped before too (no campaign map rows). They
--   go in as map rows with a blank line so they are listed; fill them later.
--
-- ONE CHANGE IN NUMBERS: campaign C90KpWvVQ66CWryXjq0sqw 'sinch PMP'
-- (6-7 Aug, 14 rows, $1,252.37, 46,695 imps) sits in IO QQazuPCL... but had a
-- blank line in the campaign map, so it was left out of sinch001po1. Keyed by
-- IO it is in. sinch001po1 goes from $10,545.74 to $11,798.11.
-- If that PMP must stay out, do NOT run this file; tell Claude (needs a
-- campaign-level exclusion added to the view).
--
-- After (PACING_FACT Programmatic - OOH, one row per day x IO):
--   133 rows  $65,890.26  imps 2,065,055  plays 318,551
--     legal004po1   76 rows  2 IO ids  $54,092.15  imps 1,605,823  plays 207,999
--     sinch001po1   57 rows  1 IO id   $11,798.11  imps   459,232  plays 110,552
--
-- Order matters:
--   Step 1 DDL must run BEFORE the app commit (feat(partner-ingest) VI1) is
--   deployed: the loader now inserts PARTNER_INSERTION_ORDER_ID / _NAME and
--   the INSERT fails if the columns are missing.
-- No LINE_ITEM_LABEL_MAP rows exist for Programmatic - OOH (checked), so no
-- relabels to carry over.
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE AV_APP_WH;

-- ----- Step 0: Before (read only) --------------------------------------------
-- expect 15442 | 2026-02-02 | 2026-10-21 | 98812.38 | 250 | 1 source file
-- SELECT COUNT(*), MIN(REPORT_DATE), MAX(REPORT_DATE), ROUND(SUM(AMOUNT_SPENT), 2),
--        COUNT(DISTINCT PARTNER_CAMPAIGN_ID), COUNT(DISTINCT SOURCE_FILE)
-- FROM ASSEMBLEDVIEW.RAW.PARTNER_DELIVERY_DAILY WHERE SOURCE = 'Vistar';
-- expect 48 rows
-- SELECT COUNT(*) FROM ASSEMBLEDVIEW.RAW.PARTNER_LINE_MAP WHERE SOURCE_SLUG = 'vistar';
-- expect legal004po1 1030 | 54092.15, sinch001po1 675 | 10545.74
-- SELECT line_item_id, COUNT(*), ROUND(SUM(amount_spent), 2), SUM(impressions), SUM(results)
-- FROM ASSEMBLEDVIEW.MART.PACING_FACT WHERE channel = 'Programmatic - OOH' GROUP BY 1 ORDER BY 1;
-- If a newer Vistar file has loaded since 26 Oct the RAW and PACING_FACT numbers
-- will differ and the guarded blocks below roll back. Stop and ask Claude to re-measure.

-- ----- Step 1: DDL (auto-commits; safe to re-run except DROP PRIMARY KEY) ----
CREATE TABLE IF NOT EXISTS ASSEMBLEDVIEW.RAW.PARTNER_LINE_MAP_BAK_20261026
  CLONE ASSEMBLEDVIEW.RAW.PARTNER_LINE_MAP;
CREATE TABLE IF NOT EXISTS ASSEMBLEDVIEW.MART.BKP_PACING_FACT_PROGOOH_20261026 AS
  SELECT * FROM ASSEMBLEDVIEW.MART.PACING_FACT WHERE channel = 'Programmatic - OOH';
-- expect 48 and 1705
SELECT (SELECT COUNT(*) FROM ASSEMBLEDVIEW.RAW.PARTNER_LINE_MAP_BAK_20261026) AS map_bak,
       (SELECT COUNT(*) FROM ASSEMBLEDVIEW.MART.BKP_PACING_FACT_PROGOOH_20261026) AS pf_bak;

ALTER TABLE ASSEMBLEDVIEW.RAW.PARTNER_DELIVERY_DAILY ADD COLUMN IF NOT EXISTS PARTNER_INSERTION_ORDER_ID VARCHAR;
ALTER TABLE ASSEMBLEDVIEW.RAW.PARTNER_DELIVERY_DAILY ADD COLUMN IF NOT EXISTS PARTNER_INSERTION_ORDER_NAME VARCHAR;

ALTER TABLE ASSEMBLEDVIEW.RAW.PARTNER_LINE_MAP ADD COLUMN IF NOT EXISTS PARTNER_INSERTION_ORDER_ID VARCHAR;
ALTER TABLE ASSEMBLEDVIEW.RAW.PARTNER_LINE_MAP ADD COLUMN IF NOT EXISTS PARTNER_INSERTION_ORDER_NAME VARCHAR;
-- The old key was (SOURCE_SLUG, PARTNER_CAMPAIGN_ID). IO rows carry no campaign id.
-- On a re-run this line errors if the key is already gone; that is fine, carry on.
ALTER TABLE ASSEMBLEDVIEW.RAW.PARTNER_LINE_MAP DROP PRIMARY KEY;
ALTER TABLE ASSEMBLEDVIEW.RAW.PARTNER_LINE_MAP ALTER COLUMN PARTNER_CAMPAIGN_ID DROP NOT NULL;

-- ----- Step 2: backfill RAW IO id + name from the stored file lines ----------
-- Data row columns (tab separated, 0-based): [3] Insertion Order Name,
-- [4] Insertion Order, [7] Campaign ID. Joined on the row's own SOURCE_FILE.
EXECUTE IMMEDIATE $$
DECLARE
  expected_rows INTEGER DEFAULT 15442;
  bad_headers INTEGER;
  ambiguous INTEGER;
  target INTEGER;
  updated INTEGER;
  still_null INTEGER;
  io_count INTEGER;
BEGIN
  BEGIN TRANSACTION;

  -- every file RAW holds must have the IO columns where we read them
  SELECT COUNT(*) INTO :bad_headers
  FROM (SELECT DISTINCT SOURCE_FILE FROM ASSEMBLEDVIEW.RAW.PARTNER_DELIVERY_DAILY WHERE SOURCE = 'Vistar') f
  WHERE NOT EXISTS (
    SELECT 1 FROM ASSEMBLEDVIEW.RAW.PARTNER_FILE_LINES l
    WHERE l.SOURCE_FILE = f.SOURCE_FILE
      AND SPLIT(l.RAW_LINE, CHR(9))[0]::STRING = 'Day'
      AND SPLIT(l.RAW_LINE, CHR(9))[3]::STRING = 'Insertion Order Name'
      AND SPLIT(l.RAW_LINE, CHR(9))[4]::STRING = 'Insertion Order'
      AND SPLIT(l.RAW_LINE, CHR(9))[7]::STRING = 'Campaign ID');

  -- a campaign under two IOs (or two IO names) in one file would make the join ambiguous
  SELECT COUNT(*) INTO :ambiguous FROM (
    SELECT SOURCE_FILE, SPLIT(RAW_LINE, CHR(9))[7]::STRING AS camp
    FROM ASSEMBLEDVIEW.RAW.PARTNER_FILE_LINES
    WHERE SOURCE_FILE LIKE 'vistar/%'
      AND ARRAY_SIZE(SPLIT(RAW_LINE, CHR(9))) >= 18
      AND SPLIT(RAW_LINE, CHR(9))[0]::STRING NOT IN ('', 'Day')
      AND SPLIT(RAW_LINE, CHR(9))[7]::STRING <> ''
    GROUP BY 1, 2
    HAVING COUNT(DISTINCT SPLIT(RAW_LINE, CHR(9))[4]::STRING) > 1
        OR COUNT(DISTINCT SPLIT(RAW_LINE, CHR(9))[3]::STRING) > 1);

  SELECT COUNT(*) INTO :target FROM ASSEMBLEDVIEW.RAW.PARTNER_DELIVERY_DAILY
  WHERE SOURCE = 'Vistar' AND PARTNER_INSERTION_ORDER_ID IS NULL;

  UPDATE ASSEMBLEDVIEW.RAW.PARTNER_DELIVERY_DAILY d
  SET PARTNER_INSERTION_ORDER_ID = m.io,
      PARTNER_INSERTION_ORDER_NAME = m.io_name
  FROM (
    SELECT SOURCE_FILE AS sf,
           SPLIT(RAW_LINE, CHR(9))[7]::STRING AS camp,
           MAX(NULLIF(TRIM(SPLIT(RAW_LINE, CHR(9))[4]::STRING), '')) AS io,
           MAX(NULLIF(TRIM(SPLIT(RAW_LINE, CHR(9))[3]::STRING), '')) AS io_name
    FROM ASSEMBLEDVIEW.RAW.PARTNER_FILE_LINES
    WHERE SOURCE_FILE LIKE 'vistar/%'
      AND ARRAY_SIZE(SPLIT(RAW_LINE, CHR(9))) >= 18
      AND SPLIT(RAW_LINE, CHR(9))[0]::STRING NOT IN ('', 'Day')
      AND SPLIT(RAW_LINE, CHR(9))[7]::STRING <> ''
    GROUP BY 1, 2
  ) m
  WHERE d.SOURCE = 'Vistar'
    AND d.PARTNER_INSERTION_ORDER_ID IS NULL
    AND m.sf = d.SOURCE_FILE
    AND m.camp = d.PARTNER_CAMPAIGN_ID;
  updated := SQLROWCOUNT;

  SELECT COUNT(*) INTO :still_null FROM ASSEMBLEDVIEW.RAW.PARTNER_DELIVERY_DAILY
  WHERE SOURCE = 'Vistar' AND (PARTNER_INSERTION_ORDER_ID IS NULL OR PARTNER_INSERTION_ORDER_NAME IS NULL);
  SELECT COUNT(DISTINCT PARTNER_INSERTION_ORDER_ID) INTO :io_count
  FROM ASSEMBLEDVIEW.RAW.PARTNER_DELIVERY_DAILY WHERE SOURCE = 'Vistar';

  IF (bad_headers <> 0 OR ambiguous <> 0 OR target <> expected_rows OR updated <> expected_rows
      OR still_null <> 0 OR io_count <> 9) THEN
    ROLLBACK;
    RETURN 'ROLLED BACK: bad_headers=' || bad_headers || ' ambiguous=' || ambiguous || ' target=' || target
      || ' updated=' || updated || ' still_null=' || still_null || ' ios=' || io_count;
  END IF;

  COMMIT;
  RETURN 'OK updated=' || updated || ' ios=' || io_count;
END;
$$;
-- expect: OK updated=15442 ios=9

-- ----- Step 3: PARTNER_LINE_MAP from 48 campaign rows to 9 IO rows -----------
EXECUTE IMMEDIATE $$
DECLARE
  pre_rows INTEGER;
  deleted INTEGER;
  inserted INTEGER;
  io_rows INTEGER;
  mapped INTEGER;
  campaign_rows INTEGER;
BEGIN
  BEGIN TRANSACTION;

  SELECT COUNT(*) INTO :pre_rows FROM ASSEMBLEDVIEW.RAW.PARTNER_LINE_MAP
  WHERE SOURCE_SLUG = 'vistar' AND PARTNER_INSERTION_ORDER_ID IS NULL;

  -- the 48 rows stay in RAW.PARTNER_LINE_MAP_BAK_20261026
  DELETE FROM ASSEMBLEDVIEW.RAW.PARTNER_LINE_MAP
  WHERE SOURCE_SLUG = 'vistar' AND PARTNER_INSERTION_ORDER_ID IS NULL;
  deleted := SQLROWCOUNT;

  INSERT INTO ASSEMBLEDVIEW.RAW.PARTNER_LINE_MAP
    (SOURCE_SLUG, PARTNER_CAMPAIGN_ID, PARTNER_CAMPAIGN_NAME, PARTNER_INSERTION_ORDER_ID,
     PARTNER_INSERTION_ORDER_NAME, AV_LINE_ITEM_ID, IS_ACTIVE, NOTES, UPDATED_AT)
  SELECT 'vistar', NULL, NULL, column1, column2, column3, TRUE, column4, CURRENT_TIMESTAMP()
  FROM VALUES
    ('po0H63X8SYuchWn3Desj0Q', 'legalsuper - Jan-Mar26', 'legal004po1', 'VI1 2026-10-26: was 16 campaign rows'),
    ('Q0ZsTvUrRZydvheNYxVlmQ', 'legalsuper - FY26 Q4 Apr-Jun', 'legal004po1', 'VI1 2026-10-26: was 18 campaign rows'),
    ('QQazuPCLRo2MRIf_0IvlFA', 'Sinch - Campaign Current Customers', 'sinch001po1', 'VI1 2026-10-26: was 14 campaign rows (13 sinch001po1, sinch PMP blank)'),
    ('5WlxO78aQY2Z7JF_DvqisA', 'Sinch - Small Format B2B Targeting', NULL, 'VI1 2026-10-26: unmapped, needs an AV line'),
    ('bQNGtD0VRMGhfUdyG4T5lw', 'Sinch - SME Business Owners - Large Format', NULL, 'VI1 2026-10-26: unmapped, needs an AV line'),
    ('xJ_2J9cxRgOQhBAv7USHZw', 'Sinch - Workplace Media', NULL, 'VI1 2026-10-26: unmapped, needs an AV line'),
    ('CQSz7VjnRxG22iCsBmo0Og', 'MoliCare - Skin Protection 2026 - Contextual OOH', NULL, 'VI1 2026-10-26: unmapped, needs an AV line'),
    ('nCcV5GJqS1moYmb5dDhzXg', 'Strength Meals Co - FY27 Launch Campaign', NULL, 'VI1 2026-10-26: unmapped, needs an AV line'),
    ('x5MLVC5NTMOXB7RxubHUOg', 'Strength Meals Co - FY27 Launch Campaign', NULL, 'VI1 2026-10-26: unmapped, needs an AV line (second IO, same name)');
  inserted := SQLROWCOUNT;

  SELECT COUNT(*), COUNT_IF(NULLIF(TRIM(AV_LINE_ITEM_ID), '') IS NOT NULL), COUNT_IF(PARTNER_INSERTION_ORDER_ID IS NULL)
  INTO :io_rows, :mapped, :campaign_rows
  FROM ASSEMBLEDVIEW.RAW.PARTNER_LINE_MAP WHERE SOURCE_SLUG = 'vistar';

  IF (pre_rows <> 48 OR deleted <> 48 OR inserted <> 9 OR io_rows <> 9 OR mapped <> 3 OR campaign_rows <> 0) THEN
    ROLLBACK;
    RETURN 'ROLLED BACK: pre=' || pre_rows || ' deleted=' || deleted || ' inserted=' || inserted
      || ' io_rows=' || io_rows || ' mapped=' || mapped || ' campaign_rows=' || campaign_rows;
  END IF;

  COMMIT;
  RETURN 'OK deleted=' || deleted || ' inserted=' || inserted || ' mapped=' || mapped;
END;
$$;
-- expect: OK deleted=48 inserted=9 mapped=3

-- ----- Step 4: view keyed by IO ----------------------------------------------
-- Same body as sql/snowflake/mart/views/vw_pacing_partner_ooh.sql (VI1 capture).
CREATE OR REPLACE VIEW ASSEMBLEDVIEW.MART.VW_PACING_PARTNER_OOH(
  CHANNEL, DATE_DAY, LINE_ITEM_NAME, LINE_ITEM_ID, ENTITY_NAME, ENTITY_ID, CAMPAIGN_NAME,
  AMOUNT_SPENT, IMPRESSIONS, CLICKS, RESULTS, VIDEO_3S_VIEWS, MAX_FIVETRAN_SYNCED_AT
) AS
WITH io_map AS (
  -- collapsed: Snowflake does not enforce the map's key
  SELECT LOWER(TRIM(PARTNER_INSERTION_ORDER_ID)) AS io_key,
         MAX(NULLIF(TRIM(AV_LINE_ITEM_ID), '')) AS AV_LINE_ITEM_ID
  FROM ASSEMBLEDVIEW.RAW.PARTNER_LINE_MAP
  WHERE SOURCE_SLUG = 'vistar' AND IS_ACTIVE
    AND NULLIF(TRIM(PARTNER_INSERTION_ORDER_ID), '') IS NOT NULL
  GROUP BY 1
),
src AS (
  SELECT d.REPORT_DATE,
         LOWER(TRIM(d.PARTNER_INSERTION_ORDER_ID)) AS io_key,
         d.PARTNER_INSERTION_ORDER_NAME,
         d.AMOUNT_SPENT, d.IMPRESSIONS, d.PLAYS, d.LOADED_AT,
         LOWER(REGEXP_SUBSTR(d.AV_LINE_ITEM_ID, '[A-Za-z]{3,}[0-9]{3}P[VO][0-9]+', 1, 1, 'i')) AS file_code,
         LOWER(TRIM(COALESCE(
           REGEXP_SUBSTR(d.AV_LINE_ITEM_ID, '[A-Za-z]{3,}[0-9]{3}P[VO][0-9]+', 1, 1, 'i'),
           m.AV_LINE_ITEM_ID
         ))) AS resolved_line_item_id
  FROM ASSEMBLEDVIEW.RAW.PARTNER_DELIVERY_DAILY d
  LEFT JOIN io_map m ON m.io_key = LOWER(TRIM(d.PARTNER_INSERTION_ORDER_ID))
  WHERE d.SOURCE = 'Vistar'
    AND NULLIF(TRIM(d.PARTNER_INSERTION_ORDER_ID), '') IS NOT NULL
)
SELECT
  'Programmatic - OOH'                    AS CHANNEL,
  REPORT_DATE                             AS DATE_DAY,
  MAX(PARTNER_INSERTION_ORDER_NAME)       AS LINE_ITEM_NAME,
  resolved_line_item_id                   AS LINE_ITEM_ID,
  MAX(PARTNER_INSERTION_ORDER_NAME)       AS ENTITY_NAME,
  -- IO id. A row whose Contract Number carries a plan code gets io:code so it can
  -- never share a PACING_FACT key with the IO's mapped rows on another line.
  io_key || IFF(file_code IS NULL, '', ':' || file_code) AS ENTITY_ID,
  MAX(PARTNER_INSERTION_ORDER_NAME)       AS CAMPAIGN_NAME,
  SUM(AMOUNT_SPENT)                       AS AMOUNT_SPENT,      -- Vistar Revenue = client cost
  ROUND(SUM(IMPRESSIONS))                 AS IMPRESSIONS,
  0                                       AS CLICKS,
  SUM(PLAYS)                              AS RESULTS,           -- plays ride in RESULTS on this channel
  0                                       AS VIDEO_3S_VIEWS,
  MAX(LOADED_AT)                          AS MAX_FIVETRAN_SYNCED_AT
FROM src
WHERE resolved_line_item_id IS NOT NULL
GROUP BY REPORT_DATE, resolved_line_item_id, io_key || IFF(file_code IS NULL, '', ':' || file_code);

-- expect legal004po1 76 | 2 | 54092.15 | 1605823 | 207999 and sinch001po1 57 | 1 | 11798.11 | 459232 | 110552
SELECT LINE_ITEM_ID, COUNT(*), COUNT(DISTINCT ENTITY_ID), ROUND(SUM(AMOUNT_SPENT), 2), SUM(IMPRESSIONS), SUM(RESULTS)
FROM ASSEMBLEDVIEW.MART.VW_PACING_PARTNER_OOH GROUP BY 1 ORDER BY 1;

-- ----- Step 5: replace the campaign-keyed PACING_FACT rows -------------------
-- TSK_REFRESH_PACING_FACT merges and never deletes, so the 1,705 campaign-keyed
-- rows would stay beside the new IO-keyed rows and double count. Vistar is the
-- only feed for this channel (checked: 0 rows on any other key), so the whole
-- channel is cleared and rebuilt from the view the same way the task does it
-- (keyed, LINE_ITEM_LABEL_MAP relabel, grouped by channel, day, key).
EXECUTE IMMEDIATE $$
DECLARE
  pre_rows INTEGER;
  unknown_rows INTEGER;
  deleted INTEGER;
  inserted INTEGER;
  post_rows INTEGER;
  post_spend NUMBER(18,2);
  post_imps INTEGER;
  legal_rows INTEGER;
  sinch_rows INTEGER;
BEGIN
  BEGIN TRANSACTION;

  SELECT COUNT(*) INTO :pre_rows FROM ASSEMBLEDVIEW.MART.PACING_FACT WHERE channel = 'Programmatic - OOH';

  -- rows on a key that is neither a Vistar campaign id nor a Vistar IO id
  SELECT COUNT(*) INTO :unknown_rows
  FROM ASSEMBLEDVIEW.MART.PACING_FACT f
  LEFT JOIN (
    SELECT DISTINCT LOWER(TRIM(PARTNER_CAMPAIGN_ID)) AS k
    FROM ASSEMBLEDVIEW.RAW.PARTNER_DELIVERY_DAILY
    WHERE SOURCE = 'Vistar' AND PARTNER_CAMPAIGN_ID IS NOT NULL
    UNION
    SELECT DISTINCT LOWER(TRIM(PARTNER_INSERTION_ORDER_ID))
    FROM ASSEMBLEDVIEW.RAW.PARTNER_DELIVERY_DAILY
    WHERE SOURCE = 'Vistar' AND PARTNER_INSERTION_ORDER_ID IS NOT NULL
  ) ks ON ks.k = SPLIT_PART(LOWER(TRIM(f.platform_line_item_id)), ':', 1)
  WHERE f.channel = 'Programmatic - OOH'
    AND ks.k IS NULL;

  DELETE FROM ASSEMBLEDVIEW.MART.PACING_FACT WHERE channel = 'Programmatic - OOH';
  deleted := SQLROWCOUNT;

  INSERT INTO ASSEMBLEDVIEW.MART.PACING_FACT
    (channel, date_day, platform_line_item_id, line_item_id, line_item_name,
     entity_name, entity_id, campaign_name,
     amount_spent, impressions, clicks, results, video_3s_views,
     max_fivetran_synced_at, updated_at)
  SELECT
    r.channel, r.date_day, r.platform_line_item_id,
    MAX(r.final_line_item_id), MAX(r.final_line_item_name),
    MAX(r.entity_name), MAX(r.entity_id), MAX(r.campaign_name),
    SUM(r.amount_spent), SUM(r.impressions), SUM(r.clicks), SUM(r.results), SUM(r.video_3s_views),
    MAX(r.max_fivetran_synced_at), CURRENT_TIMESTAMP()
  FROM (
    SELECT k.*,
           COALESCE(m.line_item_id, k.line_item_id) AS final_line_item_id,
           COALESCE(m.line_item_name, k.line_item_name) AS final_line_item_name
    FROM (
      SELECT channel, date_day, LOWER(TRIM(entity_id::STRING)) AS platform_line_item_id,
             line_item_id, line_item_name, entity_name, entity_id, campaign_name,
             amount_spent, impressions, clicks, results, video_3s_views,
             max_fivetran_synced_at::TIMESTAMP_NTZ AS max_fivetran_synced_at
      FROM ASSEMBLEDVIEW.MART.VW_PACING_PARTNER_OOH
      WHERE entity_id IS NOT NULL AND TRIM(entity_id::STRING) <> ''
    ) k
    LEFT JOIN ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP m
      ON LOWER(TRIM(m.channel)) = LOWER(TRIM(k.channel))
     AND LOWER(TRIM(m.platform_line_item_id)) = LOWER(TRIM(k.platform_line_item_id))
     AND m.is_active = TRUE
  ) r
  GROUP BY r.channel, r.date_day, r.platform_line_item_id;
  inserted := SQLROWCOUNT;

  SELECT COUNT(*), ROUND(SUM(amount_spent), 2), SUM(impressions),
         COUNT_IF(line_item_id = 'legal004po1'), COUNT_IF(line_item_id = 'sinch001po1')
  INTO :post_rows, :post_spend, :post_imps, :legal_rows, :sinch_rows
  FROM ASSEMBLEDVIEW.MART.PACING_FACT WHERE channel = 'Programmatic - OOH';

  IF (pre_rows <> 1705 OR unknown_rows <> 0 OR deleted <> 1705 OR inserted <> 133 OR post_rows <> 133
      OR post_spend <> 65890.26 OR post_imps <> 2065055 OR legal_rows <> 76 OR sinch_rows <> 57) THEN
    ROLLBACK;
    RETURN 'ROLLED BACK: pre=' || pre_rows || ' unknown=' || unknown_rows || ' deleted=' || deleted
      || ' inserted=' || inserted || ' post=' || post_rows || ' spend=' || post_spend || ' imps=' || post_imps
      || ' legal=' || legal_rows || ' sinch=' || sinch_rows;
  END IF;

  COMMIT;
  RETURN 'OK deleted=' || deleted || ' inserted=' || inserted || ' spend=' || post_spend;
END;
$$;
-- expect: OK deleted=1705 inserted=133 spend=65890.26

-- ----- After -----------------------------------------------------------------
-- expect legal004po1 76 | 2 | 54092.15 | 1605823 | 207999, sinch001po1 57 | 1 | 11798.11 | 459232 | 110552
-- SELECT line_item_id, COUNT(*), COUNT(DISTINCT platform_line_item_id), ROUND(SUM(amount_spent), 2),
--        SUM(impressions), SUM(results)
-- FROM ASSEMBLEDVIEW.MART.PACING_FACT WHERE channel = 'Programmatic - OOH' GROUP BY 1 ORDER BY 1;
-- expect 0 (no campaign-keyed rows left)
-- SELECT COUNT(*) FROM ASSEMBLEDVIEW.MART.PACING_FACT f
-- WHERE channel = 'Programmatic - OOH'
--   AND platform_line_item_id IN (SELECT LOWER(PARTNER_CAMPAIGN_ID) FROM ASSEMBLEDVIEW.RAW.PARTNER_LINE_MAP_BAK_20261026);
--
-- Mapping a new IO later (no PACING_FACT work needed; the nightly task picks it up):
-- UPDATE ASSEMBLEDVIEW.RAW.PARTNER_LINE_MAP SET AV_LINE_ITEM_ID = '<plan line id>', UPDATED_AT = CURRENT_TIMESTAMP()
-- WHERE SOURCE_SLUG = 'vistar' AND PARTNER_INSERTION_ORDER_ID = '<IO id>';
--
-- Rollback (only if needed): restore the map from RAW.PARTNER_LINE_MAP_BAK_20261026,
-- re-apply the previous view from git (vw_pacing_partner_ooh.sql before VI1), and
-- DELETE PACING_FACT channel rows + INSERT from MART.BKP_PACING_FACT_PROGOOH_20261026.
-- The two new RAW columns can stay.
