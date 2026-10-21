-- =============================================================================
-- DG8: delete Meta rows keyed by ad set NAME that copy an id-keyed row exactly
-- Run as ACCOUNTADMIN in Snowsight. One transaction. Measured live 2026-10-21.
-- =============================================================================
-- Issue: SOCIAL_PACING_FACT holds 3,389 'Social - Meta' rows whose key
-- (COALESCE(NULLIF(TRIM(platform_line_item_id), ''), entity_id)) is a word
-- from the ad set name ('retargeting', '55+', 'candel001sm1') instead of the
-- numeric Meta ad set id. $206,817.57, 1 Jul 2025 to 20 Jan 2026. One load,
-- outside the 14 day refresh window, so the task does not touch them.
--
-- 3,370 of them ($205,524.68) copy an id-keyed row exactly: same day, ad set
-- name (ENTITY_NAME), campaign name and spend to the cent. Each one matches
-- exactly one id-keyed row (3,370 distinct twins). Impressions match on
-- 3,368, clicks on 3,369.
-- Most sit on unmapped line ids ('retargeting'), so they only inflate
-- unmapped totals. 18 of them ($4,735.52) double count on plan lines:
--   bicau001sm1    1 row      181.73
--   candel001sm1  17 rows   4,553.79
--
-- Not deleted (listed for Luke, 19 rows, $1,292.89): name-keyed rows with an
-- id-keyed twin on the same day and ad set name, but a slightly different
-- spend. All are 19 or 20 Jan 2026; the id row is the later sync and is a
-- little higher. They read as stale partial-day copies. One is on a plan line
-- (candel001sm1, 20 Jan 2026, 301.39 vs 302.54). The optional block at the end
-- deletes them if you agree.
--   date        line id                ad set (ENTITY_NAME)                       spend   id-row spend
--   2026-01-19  prospecting_roas       ADV+-AU-Prospecting_ROAS                  202.86   202.87
--   2026-01-19  geo – v2               OnCampus-VIC-Geo – V2                      22.84    22.86
--   2026-01-19  interest advantage+    Prospecting-AU-Interest Advantage+          2.62     2.65
--   2026-01-19  lookalike video views  Prospecting-AU-Lookalike video views       21.57    21.70
--   2026-01-19  past engagement        Remarketing-AU-Past Engagement             21.87    22.00
--   2026-01-20  prospecting_roas       ADV+-AU-Prospecting_ROAS                  188.36   189.28
--   2026-01-20  retargeting_roas       ADV+-AU-Retargeting_ROAS                   48.93    49.20
--   2026-01-20  prospecting            AlwaysOn_Consideration-AU-Prospecting      66.64    66.80
--   2026-01-20  55+                    GetIntoGolf-AU-55+                         16.91    17.02
--   2026-01-20  candel001sm1           LeadGen-AUNZ-ADV+                         301.39   302.54
--   2026-01-20  25+handicap            MyGolf-AU-25+Handicap                      24.74    25.00
--   2026-01-20  retargeting            MyGolf-AU-Retargeting                      44.92    45.20
--   2026-01-20  geo – v2               OnCampus-VIC-Geo – V2                      19.39    19.57
--   2026-01-20  interest – v2          Online-AU-Interest – V2                    16.67    16.76
--   2026-01-20  ' wps vic'             PGA TOUR 2025/2026 - Awareness - WPS Vic  225.07   226.93
--   2026-01-20  interest advantage+    Prospecting-AU-Interest Advantage+          0.13     4.24
--   2026-01-20  lookalike video views  Prospecting-AU-Lookalike video views        0.73    20.01
--   2026-01-20  past engagement        Remarketing-AU-Past Engagement              1.59    18.94
--   2026-01-20  parents                TeeMates-AU-Parents                        65.66    66.02
--
-- Order: independent of DG2 (no twin is an RMIT seed row) and DG7 (the match
-- does not use LINE_ITEM_ID; 21 twins are DG7 Hema ad sets, fine either way).
-- A full-history rebuild of SOCIAL_PACING_FACT would not bring these back
-- unless the name-keyed load is re-run.
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE SCHEMA ASSEMBLEDVIEW.MART;

-- ----- Before ----------------------------------------------------------------
-- expect name_keyed 3389 | 206817.57, exact_dup 3370 | 205524.68,
--        bicau001sm1 186 | 34851.81, candel001sm1 1732 | 113177.37,
--        meta_total 59442 | 3878134.12 (less 82 rows if DG2 ran first)
-- WITH b AS (SELECT *, COALESCE(NULLIF(TRIM(platform_line_item_id), ''), entity_id::STRING) k
--            FROM SOCIAL_PACING_FACT WHERE channel = 'Social - Meta'),
-- nk AS (SELECT * FROM b WHERE TRY_TO_NUMBER(k) IS NULL),
-- ik AS (SELECT * FROM b WHERE TRY_TO_NUMBER(k) IS NOT NULL)
-- SELECT 'name_keyed' t, COUNT(*), ROUND(SUM(amount_spent), 2) FROM nk
-- UNION ALL SELECT 'exact_dup', COUNT(*), ROUND(SUM(amount_spent), 2) FROM nk
--  WHERE EXISTS (SELECT 1 FROM ik WHERE ik.date_day = nk.date_day AND ik.entity_name = nk.entity_name
--                  AND ik.campaign_name = nk.campaign_name AND ik.amount_spent = nk.amount_spent)
-- UNION ALL SELECT LOWER(line_item_id), COUNT(*), ROUND(SUM(amount_spent), 2) FROM SOCIAL_PACING_FACT
--  WHERE LOWER(line_item_id) IN ('bicau001sm1', 'candel001sm1') GROUP BY 1
-- UNION ALL SELECT 'meta_total', COUNT(*), ROUND(SUM(amount_spent), 2) FROM SOCIAL_PACING_FACT
--  WHERE channel = 'Social - Meta';

CREATE TABLE IF NOT EXISTS ASSEMBLEDVIEW.MART.DG8_META_NAME_KEYED_BACKUP_20261021 AS
  SELECT * FROM ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT
  WHERE channel = 'Social - Meta'
    AND TRY_TO_NUMBER(COALESCE(NULLIF(TRIM(platform_line_item_id), ''), entity_id::STRING)) IS NULL;

EXECUTE IMMEDIATE $$
DECLARE
  bk INTEGER;
  dup_rows INTEGER;
  deleted INTEGER;
BEGIN
  -- The backup holds all 3,389 name-keyed rows (the 19 kept rows too).
  SELECT COUNT(*) INTO :bk FROM ASSEMBLEDVIEW.MART.DG8_META_NAME_KEYED_BACKUP_20261021;
  IF (bk <> 3389) THEN
    RETURN 'STOPPED: backup count differs. backup=' || bk;
  END IF;

  BEGIN TRANSACTION;

  DELETE FROM ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT nk
  WHERE nk.channel = 'Social - Meta'
    AND TRY_TO_NUMBER(COALESCE(NULLIF(TRIM(nk.platform_line_item_id), ''), nk.entity_id::STRING)) IS NULL
    AND EXISTS (
      SELECT 1 FROM ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT ik
      WHERE ik.channel = 'Social - Meta'
        AND TRY_TO_NUMBER(COALESCE(NULLIF(TRIM(ik.platform_line_item_id), ''), ik.entity_id::STRING)) IS NOT NULL
        AND ik.date_day = nk.date_day
        AND ik.entity_name = nk.entity_name
        AND ik.campaign_name = nk.campaign_name
        AND ik.amount_spent = nk.amount_spent
    );
  deleted := SQLROWCOUNT;

  -- Name-keyed rows left: the 19 near-copies only.
  SELECT COUNT(*) INTO :dup_rows FROM ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT
  WHERE channel = 'Social - Meta'
    AND TRY_TO_NUMBER(COALESCE(NULLIF(TRIM(platform_line_item_id), ''), entity_id::STRING)) IS NULL;

  IF (deleted <> 3370 OR dup_rows <> 19) THEN
    ROLLBACK;
    RETURN 'ROLLED BACK: counts differ. deleted=' || deleted || ' name_keyed_left=' || dup_rows;
  END IF;

  COMMIT;
  RETURN 'OK deleted=' || deleted || ' name_keyed_left=' || dup_rows;
END;
$$;

-- ----- After -----------------------------------------------------------------
-- Before query: name_keyed 19 | 1292.89, exact_dup 0,
--   bicau001sm1 185 | 34670.08, candel001sm1 1715 | 108623.58,
--   meta_total 56072 | 3672609.44 (3,370 rows and 205,524.68 lower than before).
-- Undo: INSERT INTO SOCIAL_PACING_FACT
--   SELECT b.* FROM DG8_META_NAME_KEYED_BACKUP_20261021 b
--   WHERE NOT EXISTS (SELECT 1 FROM SOCIAL_PACING_FACT s WHERE s.channel = b.channel
--     AND s.date_day = b.date_day AND s.platform_line_item_id = b.platform_line_item_id
--     AND s.entity_name = b.entity_name AND s.campaign_name = b.campaign_name);
-- Clean-up once happy: DROP TABLE DG8_META_NAME_KEYED_BACKUP_20261021;

-- ----- Optional: the 19 near-copies (only if you agree) ------------------------
-- Run after the block above. Expect 19 rows, 1,292.89. candel001sm1 drops a
-- further 301.39 to 108,322.19.
-- DELETE FROM ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT
-- WHERE channel = 'Social - Meta'
--   AND TRY_TO_NUMBER(COALESCE(NULLIF(TRIM(platform_line_item_id), ''), entity_id::STRING)) IS NULL
--   AND date_day BETWEEN '2026-01-19' AND '2026-01-20';
