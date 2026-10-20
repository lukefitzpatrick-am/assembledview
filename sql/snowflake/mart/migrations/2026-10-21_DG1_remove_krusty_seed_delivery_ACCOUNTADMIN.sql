-- =============================================================================
-- DG1: remove the Krusty Krab synthetic delivery rows (seeded 8 Jul 2026)
-- Run as ACCOUNTADMIN in Snowsight. One transaction. Measured live 2026-10-20.
-- =============================================================================
-- Issue:
--   SOCIAL_PACING_FACT shows TikTok at $51,927.80 (June) and $15,306.80 (July)
--   while the source view VW_PACING_TIKTOK has ~$1.55K and ~$1.72K.
--
-- Root cause (checked row by row against VW_PACING_TIKTOK):
--   One TikTok entity, 1777002200220022 'TT-KrustyKrab-Reels-FY26Q3-LPV'
--   (line krusty002sm2), has no source row in TIKTOK_ADS at all. It is a
--   synthetic test series for the Krusty Krab test client. Every row has the
--   same UPDATED_AT (2026-07-08 05:30 UTC), runs 1 Mar - 8 Jul 2026 and is not
--   in any raw Fivetran schema. Take it out and June / July match the view
--   to the cent:
--     June: 51,927.80 - 50,377.18 = 1,550.62 (golf005sm3 749.80 + golf003sm2 800.82)
--     July: 15,306.80 - 13,586.88 = 1,719.92 (golf003sm2)
--     May is inflated the same way (52,312.55 of 53,062.09).
--   The same seed also wrote two Meta ad sets and three Google search rows
--   (search, ChatGPT, PMax) on fake customer 7454093281. Same timestamp, same
--   flight, no raw source. All are removed here so every channel total is real.
--
--   No repo script created these rows. Krusty Krab is the test client
--   (client 53). Today's krusty002 plan is 'AV Smoke Test 10 Oct' flighting
--   15 Nov - 20 Dec 2026, so these Mar - Jul rows do not sit on any live
--   plan dates. The 2026-10-20 MR1 script left them alone on purpose.
--   Skip this script if you still use them for demos. A backup table is made
--   first, so it can be put back.
--
-- Rows removed (all have LINE_ITEM_ID krusty...):
--   SOCIAL_PACING_FACT  298 rows  335,359.36
--     Social - TikTok 1777002200220022   krusty002sm2  130 rows  216,489.80
--     Social - Meta   120245990010010001 krusty002sm1  130 rows  104,000.00
--     Social - Meta   120245990040040001 krusty004sm1   38 rows   14,869.57
--   SEARCH_PACING_FACT  390 rows  374,081.63 (customer 7454093281)
--     401770010011 krusty002se1 ChatGPT / 401770010022 krusty002se2 Google search /
--     401770010033 krusty002se3 PMax, 130 rows each
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE SCHEMA ASSEMBLEDVIEW.MART;

-- ----- Before ----------------------------------------------------------------
-- A) expect 298 | 335359.36 and 390 | 374081.63
-- SELECT 'social' t, COUNT(*), ROUND(SUM(amount_spent), 2) FROM SOCIAL_PACING_FACT
--  WHERE entity_id::STRING IN ('1777002200220022','120245990010010001','120245990040040001') AND LOWER(line_item_id) LIKE 'krusty%'
-- UNION ALL SELECT 'search', COUNT(*), ROUND(SUM(amount_spent), 2) FROM SEARCH_PACING_FACT
--  WHERE customer_id = '7454093281' AND platform_line_item_id IN ('401770010011','401770010022','401770010033') AND LOWER(line_item_id) LIKE 'krusty%';
-- B) TikTok by month, fact vs view (expect June 51,927.80 vs 1,550.62; July 15,306.80 vs 1,719.92)
-- SELECT DATE_TRUNC('month', date_day) m, ROUND(SUM(amount_spent), 2) FROM SOCIAL_PACING_FACT
--  WHERE channel = 'Social - TikTok' AND date_day BETWEEN '2026-05-01' AND '2026-07-31' GROUP BY 1 ORDER BY 1;
-- SELECT DATE_TRUNC('month', date_day) m, ROUND(SUM(amount_spent), 2) FROM VW_PACING_TIKTOK
--  WHERE date_day BETWEEN '2026-05-01' AND '2026-07-31' GROUP BY 1 ORDER BY 1;

-- Backups (outside the transaction; keep until you are happy, then drop)
CREATE TABLE IF NOT EXISTS ASSEMBLEDVIEW.MART.DG1_KRUSTY_SEED_SOCIAL_BACKUP_20261021 AS
  SELECT * FROM ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT
  WHERE entity_id::STRING IN ('1777002200220022','120245990010010001','120245990040040001') AND LOWER(line_item_id) LIKE 'krusty%';
CREATE TABLE IF NOT EXISTS ASSEMBLEDVIEW.MART.DG1_KRUSTY_SEED_SEARCH_BACKUP_20261021 AS
  SELECT * FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT
  WHERE customer_id = '7454093281' AND platform_line_item_id IN ('401770010011','401770010022','401770010033') AND LOWER(line_item_id) LIKE 'krusty%';

EXECUTE IMMEDIATE $$
DECLARE
  bk_social INTEGER;
  bk_search INTEGER;
  social_deleted INTEGER;
  search_deleted INTEGER;
BEGIN
  SELECT COUNT(*) INTO :bk_social FROM ASSEMBLEDVIEW.MART.DG1_KRUSTY_SEED_SOCIAL_BACKUP_20261021;
  SELECT COUNT(*) INTO :bk_search FROM ASSEMBLEDVIEW.MART.DG1_KRUSTY_SEED_SEARCH_BACKUP_20261021;
  IF (bk_social <> 298 OR bk_search <> 390) THEN
    RETURN 'STOPPED: backup counts differ. social=' || bk_social || ' search=' || bk_search;
  END IF;

  BEGIN TRANSACTION;

  DELETE FROM ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT
  WHERE entity_id::STRING IN ('1777002200220022','120245990010010001','120245990040040001')
    AND LOWER(line_item_id) LIKE 'krusty%';
  social_deleted := SQLROWCOUNT;

  DELETE FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT
  WHERE customer_id = '7454093281'
    AND platform_line_item_id IN ('401770010011','401770010022','401770010033')
    AND LOWER(line_item_id) LIKE 'krusty%';
  search_deleted := SQLROWCOUNT;

  IF (social_deleted <> 298 OR search_deleted <> 390) THEN
    ROLLBACK;
    RETURN 'ROLLED BACK: counts differ. social=' || social_deleted || ' search=' || search_deleted;
  END IF;

  COMMIT;
  RETURN 'OK social=' || social_deleted || ' search=' || search_deleted;
END;
$$;

-- ----- After -----------------------------------------------------------------
-- A) expect 0 and 0 (same queries as Before A)
-- B) TikTok fact by month (expect May 749.54, June 1,550.62, July 1,719.92, i.e. equal to VW_PACING_TIKTOK)
-- SELECT DATE_TRUNC('month', date_day) m, ROUND(SUM(amount_spent), 2) FROM SOCIAL_PACING_FACT
--  WHERE channel = 'Social - TikTok' AND date_day BETWEEN '2026-05-01' AND '2026-07-31' GROUP BY 1 ORDER BY 1;
--
-- Undo (if needed):
-- INSERT INTO SOCIAL_PACING_FACT SELECT * FROM DG1_KRUSTY_SEED_SOCIAL_BACKUP_20261021;
-- INSERT INTO SEARCH_PACING_FACT SELECT * FROM DG1_KRUSTY_SEED_SEARCH_BACKUP_20261021;
-- Clean-up once happy:
-- DROP TABLE DG1_KRUSTY_SEED_SOCIAL_BACKUP_20261021; DROP TABLE DG1_KRUSTY_SEED_SEARCH_BACKUP_20261021;
