-- =============================================================================
-- PL1 (DATA-8): remove repeated copies from RAW.PARTNER_FILE_LINES.
-- Run as ACCOUNTADMIN in Snowsight, top to bottom, one step at a time.
-- Measured live 2026-10-28 about 20:35 AEDT with CLAUDE_RW (SELECT only).
-- Not run. Do not run between 09:15 and 09:45 Melbourne (partner ingest cron,
-- 22:30 UTC).
-- =============================================================================
-- Why
--   Overlapping partner ingest runs (DATA-7, now locked in the app) each wrote
--   the raw lines of the same file. The lines table has no key, so the same
--   (SOURCE_FILE, FILE_ROW) is there 2 to 5 times. Every copy of a key holds
--   the same RAW_LINE; copies differ only by LOADED_AT.
--
-- Measured 2026-10-28
--   Rows 440,786. Distinct (SOURCE_FILE, FILE_ROW) keys 314,135. Files 62.
--   Repeated copies (rows beyond the first per key): 126,651, in 8 files
--   (the backlog's "62 files" was the table's file count, not the affected files):
--     channel-factory 2026-10-10  1,616 keys    960 extra (max 2 copies)
--     channel-factory 2026-10-11  1,631 keys  1,360 extra (max 2)
--     channel-factory 2026-10-12  1,646 keys  1,200 extra (max 2)
--     vistar 2026-10-10          12,803 keys 12,803 extra (2 copies)
--     vistar 2026-10-11          13,003 keys 13,003 extra (2)
--     vistar 2026-10-12          13,234 keys 26,468 extra (3)
--     vistar 2026-10-13          13,534 keys 54,136 extra (5)
--     vistar 2026-10-25          16,721 keys 16,721 extra (2)
--   Keys whose copies differ in RAW_LINE: 0. Keys with two copies at the same
--   LOADED_AT: 0. So "keep the earliest LOADED_AT per key" removes exactly
--   126,651 rows and keeps one copy of every line.
--
-- Who reads RAW.PARTNER_FILE_LINES (checked 2026-10-28)
--   * No Snowflake view. GET_DDL on every view CLAUDE_RW can see (50 in MART,
--     STG_PACING and VW_PACING) has no PARTNER_FILE_LINES. VW_PACING_PARTNER_FILE
--     and VW_PLATFORM_SPEND_LINE_MONTH read RAW.PARTNER_DELIVERY_DAILY.
--     VW_PACING_PARTNER_OOH (CLAUDE_RW cannot read it) reads
--     PARTNER_DELIVERY_DAILY and PARTNER_LINE_MAP in its repo capture; step 1d
--     checks it live.
--   * No task or procedure in the repo (sql/snowflake/mart/tasks, procedures).
--   * App: lib/finance/sections/fixedCostMargin/query.ts loadCfPlacements
--     (Channel Factory PL id to plan line): SELECT ... GROUP BY 1, 2, so
--     repeats do not change it.
--   * One-off: VI1 (2026-10-26, already run) read the Vistar lines with GROUP BY
--     and MAX, so repeats did not change it either.
--   * Writer: lib/partner-ingest (INSERT only).
--   So the expected impact on every view total is 0. Step 1c proves it on the
--   lines themselves before anything changes.
-- =============================================================================

USE ROLE ACCOUNTADMIN;

-- ----- 1. BEFORE (SELECT only) -----------------------------------------------
-- a) Shape. Expect (28 Oct): rows 440,786 (more if a new file loaded since),
--    keys 314,135 (same caveat), extra 126,651, dup_files 8, diff_content 0,
--    ties 0. extra, dup_files, diff_content and ties must match exactly.
WITH g AS (
  SELECT SOURCE_FILE, FILE_ROW, COUNT(*) n, COUNT(DISTINCT RAW_LINE) nd,
         COUNT(DISTINCT LOADED_AT) nl
  FROM ASSEMBLEDVIEW.RAW.PARTNER_FILE_LINES GROUP BY 1, 2)
SELECT SUM(n) AS rows_, COUNT(*) AS keys, SUM(n - 1) AS extra,
       COUNT(DISTINCT IFF(n > 1, SOURCE_FILE, NULL)) AS dup_files,
       COUNT_IF(nd > 1) AS diff_content, COUNT_IF(n > 1 AND n <> nl) AS ties
FROM g;

-- b) Per file (expect the 8 files listed in the header).
WITH g AS (
  SELECT SOURCE_FILE, FILE_ROW, COUNT(*) n
  FROM ASSEMBLEDVIEW.RAW.PARTNER_FILE_LINES GROUP BY 1, 2)
SELECT SOURCE_FILE, COUNT(*) keys, SUM(n - 1) extra, MAX(n) max_copies
FROM g GROUP BY 1 HAVING SUM(n - 1) > 0 ORDER BY 1;

-- c) Zero-impact proof on the lines: the de-duplicated table gives exactly the
--    same lines and the same results for both readers. Expect each pair equal
--    (28 Oct): content 473107621624201615 both; CF map 21 rows,
--    -7404629154218118929 both; Vistar IO map 3,579 rows, 302344566798840947 both.
WITH cur AS (SELECT * FROM ASSEMBLEDVIEW.RAW.PARTNER_FILE_LINES),
dd AS (SELECT * FROM cur QUALIFY ROW_NUMBER() OVER (PARTITION BY SOURCE_FILE, FILE_ROW ORDER BY LOADED_AT) = 1),
cf_cur AS (SELECT DISTINCT REGEXP_SUBSTR(SPLIT_PART(RAW_LINE, '\t', 3), 'PL[0-9]{6}') PL,
             LOWER(REGEXP_SUBSTR(SPLIT_PART(RAW_LINE, '\t', 4), '[A-Za-z]{3,}[0-9]{3}P[VO][0-9]+', 1, 1, 'i')) LID
           FROM cur WHERE SOURCE_FILE ILIKE 'channel-factory/%' AND RAW_LINE ILIKE '%PL%'),
cf_dd AS (SELECT DISTINCT REGEXP_SUBSTR(SPLIT_PART(RAW_LINE, '\t', 3), 'PL[0-9]{6}') PL,
            LOWER(REGEXP_SUBSTR(SPLIT_PART(RAW_LINE, '\t', 4), '[A-Za-z]{3,}[0-9]{3}P[VO][0-9]+', 1, 1, 'i')) LID
          FROM dd WHERE SOURCE_FILE ILIKE 'channel-factory/%' AND RAW_LINE ILIKE '%PL%'),
vi_cur AS (SELECT SOURCE_FILE sf, SPLIT(RAW_LINE, CHR(9))[7]::STRING camp,
             MAX(NULLIF(TRIM(SPLIT(RAW_LINE, CHR(9))[4]::STRING), '')) io,
             MAX(NULLIF(TRIM(SPLIT(RAW_LINE, CHR(9))[3]::STRING), '')) io_name
           FROM cur WHERE SOURCE_FILE LIKE 'vistar/%' AND ARRAY_SIZE(SPLIT(RAW_LINE, CHR(9))) >= 18
             AND SPLIT(RAW_LINE, CHR(9))[0]::STRING NOT IN ('', 'Day') AND SPLIT(RAW_LINE, CHR(9))[7]::STRING <> ''
           GROUP BY 1, 2),
vi_dd AS (SELECT SOURCE_FILE sf, SPLIT(RAW_LINE, CHR(9))[7]::STRING camp,
            MAX(NULLIF(TRIM(SPLIT(RAW_LINE, CHR(9))[4]::STRING), '')) io,
            MAX(NULLIF(TRIM(SPLIT(RAW_LINE, CHR(9))[3]::STRING), '')) io_name
          FROM dd WHERE SOURCE_FILE LIKE 'vistar/%' AND ARRAY_SIZE(SPLIT(RAW_LINE, CHR(9))) >= 18
            AND SPLIT(RAW_LINE, CHR(9))[0]::STRING NOT IN ('', 'Day') AND SPLIT(RAW_LINE, CHR(9))[7]::STRING <> ''
          GROUP BY 1, 2)
SELECT
  (SELECT HASH_AGG(SOURCE_FILE, FILE_ROW, RAW_LINE) FROM (SELECT DISTINCT SOURCE_FILE, FILE_ROW, RAW_LINE FROM cur)) AS content_cur,
  (SELECT HASH_AGG(SOURCE_FILE, FILE_ROW, RAW_LINE) FROM dd) AS content_dd,
  (SELECT COUNT(*) FROM cf_cur) AS cf_cur_n, (SELECT HASH_AGG(*) FROM cf_cur) AS cf_cur_h,
  (SELECT COUNT(*) FROM cf_dd) AS cf_dd_n, (SELECT HASH_AGG(*) FROM cf_dd) AS cf_dd_h,
  (SELECT COUNT(*) FROM vi_cur) AS vi_cur_n, (SELECT HASH_AGG(*) FROM vi_cur) AS vi_cur_h,
  (SELECT COUNT(*) FROM vi_dd) AS vi_dd_n, (SELECT HASH_AGG(*) FROM vi_dd) AS vi_dd_h;

-- d) View totals. Note these numbers; step 4 must show the same (if no partner
--    file loaded or nightly task ran in between). Measured 28 Oct:
--      VW_PACING_PARTNER_FILE          1,676 rows        0.00   4,150,498 imps
--      VW_PLATFORM_SPEND_LINE_MONTH    4,512 rows  7,004,912.61 929,197,090 imps
--      RAW.PARTNER_DELIVERY_DAILY     19,266 rows    107,367.47   9,681,298 imps
--      PACING_FACT partner rows        1,937 rows    106,318.67   7,682,128 imps
--      VW_PACING_PARTNER_OOH           (not readable by CLAUDE_RW; note yours)
SELECT 'VW_PACING_PARTNER_FILE' obj, COUNT(*) n, ROUND(SUM(amount_spent), 2) spend, SUM(impressions) imps FROM ASSEMBLEDVIEW.MART.VW_PACING_PARTNER_FILE
UNION ALL SELECT 'VW_PACING_PARTNER_OOH', COUNT(*), ROUND(SUM(amount_spent), 2), SUM(impressions) FROM ASSEMBLEDVIEW.MART.VW_PACING_PARTNER_OOH
UNION ALL SELECT 'VW_PLATFORM_SPEND_LINE_MONTH', COUNT(*), ROUND(SUM(amount_spent), 2), SUM(impressions) FROM ASSEMBLEDVIEW.MART.VW_PLATFORM_SPEND_LINE_MONTH
UNION ALL SELECT 'RAW.PARTNER_DELIVERY_DAILY', COUNT(*), ROUND(SUM(amount_spent), 2), SUM(impressions) FROM ASSEMBLEDVIEW.RAW.PARTNER_DELIVERY_DAILY
UNION ALL SELECT 'PACING_FACT partner rows', COUNT(*), ROUND(SUM(amount_spent), 2), SUM(impressions) FROM ASSEMBLEDVIEW.MART.PACING_FACT
  WHERE channel = 'Programmatic - OOH'
     OR (channel = 'Programmatic - Video' AND date_day >= '2026-01-01'
         AND NOT REGEXP_LIKE(LOWER(TRIM(platform_line_item_id)), '^[0-9a-f]{32}$'))
ORDER BY 1;

-- e) Confirm nothing else reads the table (as ACCOUNTADMIN you can see every
--    view). Expect 0 rows. ACCOUNT_USAGE lags up to 3 hours.
SELECT referencing_database, referencing_schema, referencing_object_name, referencing_object_domain
FROM SNOWFLAKE.ACCOUNT_USAGE.OBJECT_DEPENDENCIES
WHERE referenced_database = 'ASSEMBLEDVIEW' AND referenced_schema = 'RAW'
  AND referenced_object_name = 'PARTNER_FILE_LINES';

-- ----- 2. Backup (zero-copy clone) -------------------------------------------
-- DDL auto-commits, so it runs before the guarded block. Step 3 checks that
-- the clone row count equals the live row count before it deletes anything.
CREATE TABLE ASSEMBLEDVIEW.RAW.PL1_PARTNER_FILE_LINES_BACKUP_20261028
  CLONE ASSEMBLEDVIEW.RAW.PARTNER_FILE_LINES;
-- expect 440,786 (or step 1a's rows):
SELECT COUNT(*) FROM ASSEMBLEDVIEW.RAW.PL1_PARTNER_FILE_LINES_BACKUP_20261028;

-- ----- 3. Guarded delete -----------------------------------------------------
-- Keeps the earliest LOADED_AT copy of each (SOURCE_FILE, FILE_ROW) and deletes
-- the rest, in one transaction. Stops before the transaction unless the live
-- shape matches what was measured; rolls back unless the delete hits exactly
-- the measured number and every end check passes.
EXECUTE IMMEDIATE $$
DECLARE
  expected_extra INTEGER DEFAULT 126651;
  expected_files INTEGER DEFAULT 8;
  rows_before INTEGER;
  keys_before INTEGER;
  extra_before INTEGER;
  files_before INTEGER;
  dup_files INTEGER;
  diff_content INTEGER;
  ties INTEGER;
  backup_rows INTEGER;
  content_before INTEGER;
  cf_before INTEGER;
  vi_before INTEGER;
  deleted INTEGER;
  rows_after INTEGER;
  keys_after INTEGER;
  extra_after INTEGER;
  files_after INTEGER;
  content_after INTEGER;
  cf_after INTEGER;
  vi_after INTEGER;
BEGIN
  -- Live counts first.
  SELECT SUM(n), COUNT(*), SUM(n - 1), COUNT(DISTINCT IFF(n > 1, SOURCE_FILE, NULL)),
         COUNT_IF(nd > 1), COUNT_IF(n > 1 AND n <> nl), COUNT(DISTINCT SOURCE_FILE)
    INTO :rows_before, :keys_before, :extra_before, :dup_files, :diff_content, :ties, :files_before
  FROM (SELECT SOURCE_FILE, FILE_ROW, COUNT(*) n, COUNT(DISTINCT RAW_LINE) nd, COUNT(DISTINCT LOADED_AT) nl
        FROM ASSEMBLEDVIEW.RAW.PARTNER_FILE_LINES GROUP BY 1, 2);
  SELECT COUNT(*) INTO :backup_rows FROM ASSEMBLEDVIEW.RAW.PL1_PARTNER_FILE_LINES_BACKUP_20261028;

  IF (extra_before <> expected_extra OR dup_files <> expected_files OR diff_content <> 0
      OR ties <> 0 OR backup_rows <> rows_before) THEN
    RETURN 'STOPPED (nothing changed): extra=' || extra_before || '/' || expected_extra
      || ' dup_files=' || dup_files || '/' || expected_files || ' diff_content=' || diff_content
      || ' ties=' || ties || ' backup=' || backup_rows || ' live=' || rows_before
      || '. Re-measure; if the backup is behind, re-create it (step 2).';
  END IF;

  SELECT HASH_AGG(SOURCE_FILE, FILE_ROW, RAW_LINE) INTO :content_before
  FROM (SELECT DISTINCT SOURCE_FILE, FILE_ROW, RAW_LINE FROM ASSEMBLEDVIEW.RAW.PARTNER_FILE_LINES);
  SELECT HASH_AGG(*) INTO :cf_before FROM (
    SELECT DISTINCT REGEXP_SUBSTR(SPLIT_PART(RAW_LINE, '\t', 3), 'PL[0-9]{6}') PL,
      LOWER(REGEXP_SUBSTR(SPLIT_PART(RAW_LINE, '\t', 4), '[A-Za-z]{3,}[0-9]{3}P[VO][0-9]+', 1, 1, 'i')) LID
    FROM ASSEMBLEDVIEW.RAW.PARTNER_FILE_LINES
    WHERE SOURCE_FILE ILIKE 'channel-factory/%' AND RAW_LINE ILIKE '%PL%');
  SELECT HASH_AGG(*) INTO :vi_before FROM (
    SELECT SOURCE_FILE sf, SPLIT(RAW_LINE, CHR(9))[7]::STRING camp,
      MAX(NULLIF(TRIM(SPLIT(RAW_LINE, CHR(9))[4]::STRING), '')) io,
      MAX(NULLIF(TRIM(SPLIT(RAW_LINE, CHR(9))[3]::STRING), '')) io_name
    FROM ASSEMBLEDVIEW.RAW.PARTNER_FILE_LINES
    WHERE SOURCE_FILE LIKE 'vistar/%' AND ARRAY_SIZE(SPLIT(RAW_LINE, CHR(9))) >= 18
      AND SPLIT(RAW_LINE, CHR(9))[0]::STRING NOT IN ('', 'Day') AND SPLIT(RAW_LINE, CHR(9))[7]::STRING <> ''
    GROUP BY 1, 2);

  BEGIN TRANSACTION;

  DELETE FROM ASSEMBLEDVIEW.RAW.PARTNER_FILE_LINES t
  USING (
    SELECT SOURCE_FILE, FILE_ROW, MIN(LOADED_AT) AS keep_at
    FROM ASSEMBLEDVIEW.RAW.PARTNER_FILE_LINES
    GROUP BY 1, 2
    HAVING COUNT(*) > 1
  ) k
  WHERE t.SOURCE_FILE = k.SOURCE_FILE
    AND t.FILE_ROW = k.FILE_ROW
    AND t.LOADED_AT > k.keep_at;
  deleted := SQLROWCOUNT;

  IF (deleted <> extra_before) THEN
    ROLLBACK;
    RETURN 'ROLLED BACK: deleted ' || deleted || ', expected ' || extra_before;
  END IF;

  -- End checks (inside the transaction).
  SELECT SUM(n), COUNT(*), SUM(n - 1), COUNT(DISTINCT SOURCE_FILE)
    INTO :rows_after, :keys_after, :extra_after, :files_after
  FROM (SELECT SOURCE_FILE, FILE_ROW, COUNT(*) n FROM ASSEMBLEDVIEW.RAW.PARTNER_FILE_LINES GROUP BY 1, 2);
  SELECT HASH_AGG(SOURCE_FILE, FILE_ROW, RAW_LINE) INTO :content_after
  FROM ASSEMBLEDVIEW.RAW.PARTNER_FILE_LINES;
  SELECT HASH_AGG(*) INTO :cf_after FROM (
    SELECT DISTINCT REGEXP_SUBSTR(SPLIT_PART(RAW_LINE, '\t', 3), 'PL[0-9]{6}') PL,
      LOWER(REGEXP_SUBSTR(SPLIT_PART(RAW_LINE, '\t', 4), '[A-Za-z]{3,}[0-9]{3}P[VO][0-9]+', 1, 1, 'i')) LID
    FROM ASSEMBLEDVIEW.RAW.PARTNER_FILE_LINES
    WHERE SOURCE_FILE ILIKE 'channel-factory/%' AND RAW_LINE ILIKE '%PL%');
  SELECT HASH_AGG(*) INTO :vi_after FROM (
    SELECT SOURCE_FILE sf, SPLIT(RAW_LINE, CHR(9))[7]::STRING camp,
      MAX(NULLIF(TRIM(SPLIT(RAW_LINE, CHR(9))[4]::STRING), '')) io,
      MAX(NULLIF(TRIM(SPLIT(RAW_LINE, CHR(9))[3]::STRING), '')) io_name
    FROM ASSEMBLEDVIEW.RAW.PARTNER_FILE_LINES
    WHERE SOURCE_FILE LIKE 'vistar/%' AND ARRAY_SIZE(SPLIT(RAW_LINE, CHR(9))) >= 18
      AND SPLIT(RAW_LINE, CHR(9))[0]::STRING NOT IN ('', 'Day') AND SPLIT(RAW_LINE, CHR(9))[7]::STRING <> ''
    GROUP BY 1, 2);

  IF (rows_after <> rows_before - deleted OR keys_after <> keys_before OR extra_after <> 0
      OR files_after <> files_before OR content_after <> content_before
      OR cf_after <> cf_before OR vi_after <> vi_before) THEN
    ROLLBACK;
    RETURN 'ROLLED BACK: end checks failed. rows ' || rows_after || ' vs ' || (rows_before - deleted)
      || ', keys ' || keys_after || '/' || keys_before || ', extra ' || extra_after
      || ', files ' || files_after || '/' || files_before
      || ', content ' || IFF(content_after = content_before, 'same', 'DIFFERENT')
      || ', cf map ' || IFF(cf_after = cf_before, 'same', 'DIFFERENT')
      || ', vistar io map ' || IFF(vi_after = vi_before, 'same', 'DIFFERENT');
  END IF;

  COMMIT;
  RETURN 'OK deleted=' || deleted || ' rows ' || rows_before || ' -> ' || rows_after
    || ' keys=' || keys_after || ' files=' || files_after || ' content, CF map and Vistar IO map unchanged';
EXCEPTION
  WHEN OTHER THEN
    ROLLBACK;
    RAISE;
END;
$$;
-- expect: OK deleted=126651 rows 440786 -> 314135 keys=314135 files=62 content, CF map and Vistar IO map unchanged
-- (rows and keys higher by the same amount if a new partner file loaded since 28 Oct)

-- ----- 4. AFTER (SELECT only) ------------------------------------------------
-- a) No repeats left. Expect extra 0, rows = keys (314,135 on 28 Oct numbers).
SELECT COUNT(*) AS rows_, COUNT(DISTINCT SOURCE_FILE, FILE_ROW) AS keys,
       COUNT(*) - COUNT(DISTINCT SOURCE_FILE, FILE_ROW) AS extra
FROM ASSEMBLEDVIEW.RAW.PARTNER_FILE_LINES;
-- b) Re-run step 1d. Expect every row identical to what you noted (impact 0:
--    none of these objects reads PARTNER_FILE_LINES).
-- c) Every deleted row is in the backup and is a copy of a kept line.
--    Expect deleted 126,651, not_a_copy 0.
WITH gone AS (
  SELECT b.* FROM ASSEMBLEDVIEW.RAW.PL1_PARTNER_FILE_LINES_BACKUP_20261028 b
  WHERE NOT EXISTS (
    SELECT 1 FROM ASSEMBLEDVIEW.RAW.PARTNER_FILE_LINES l
    WHERE l.SOURCE_FILE = b.SOURCE_FILE AND l.FILE_ROW = b.FILE_ROW AND l.LOADED_AT = b.LOADED_AT))
SELECT COUNT(*) AS deleted, COUNT_IF(k.SOURCE_FILE IS NULL) AS not_a_copy
FROM gone g
LEFT JOIN (SELECT DISTINCT SOURCE_FILE, FILE_ROW, RAW_LINE FROM ASSEMBLEDVIEW.RAW.PARTNER_FILE_LINES) k
  ON k.SOURCE_FILE = g.SOURCE_FILE AND k.FILE_ROW = g.FILE_ROW AND k.RAW_LINE = g.RAW_LINE;

-- ----- 5. Rollback (only if needed) ------------------------------------------
-- Puts back exactly the deleted copies (each copy differs by LOADED_AT, so the
-- match is exact) and keeps any lines loaded after the backup.
-- Expect the INSERT to add 126,651 rows, then step 1a numbers again.
-- BEGIN TRANSACTION;
-- INSERT INTO ASSEMBLEDVIEW.RAW.PARTNER_FILE_LINES (SOURCE_FILE, FILE_ROW, RAW_LINE, LOADED_AT)
-- SELECT b.SOURCE_FILE, b.FILE_ROW, b.RAW_LINE, b.LOADED_AT
-- FROM ASSEMBLEDVIEW.RAW.PL1_PARTNER_FILE_LINES_BACKUP_20261028 b
-- WHERE NOT EXISTS (
--   SELECT 1 FROM ASSEMBLEDVIEW.RAW.PARTNER_FILE_LINES l
--   WHERE l.SOURCE_FILE = b.SOURCE_FILE AND l.FILE_ROW = b.FILE_ROW AND l.LOADED_AT = b.LOADED_AT);
-- COMMIT;

-- ----- 6. Clean-up once happy (a week or so) ---------------------------------
-- DROP TABLE ASSEMBLEDVIEW.RAW.PL1_PARTNER_FILE_LINES_BACKUP_20261028;
