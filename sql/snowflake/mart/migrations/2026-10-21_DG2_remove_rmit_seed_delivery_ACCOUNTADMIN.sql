-- =============================================================================
-- DG2: remove the RMIT synthetic delivery rows (written 14 Jan 2026)
-- Run as ACCOUNTADMIN in Snowsight. One transaction. Measured live 2026-10-20.
-- =============================================================================
-- Issue:
--   PACING_FACT has programmatic rows for RMIT with an empty PLATFORM_LINE_ITEM_ID,
--   17 Jan - 26 Feb 2026: $13,284 (RMIT_POSTGRAD_Students $5,015 with no line id,
--   RMIT_Undergrad_Students $8,269 on RMIT001PD1 / RMIT001ML1).
--
-- Root cause: these are not platform data. They are one synthetic test set:
--   - One ENTITY_ID (120210334964940000) on 14 different "lines" across DV360,
--     Meta, TikTok and Google Ads. Real platforms never share an id like that.
--   - Every row was written in the same second, 2026-01-14 08:38:49 UTC, for
--     dates 17 Jan to 26 Feb, i.e. 3 to 43 days in the future.
--   - Written before the DV360 (15 Jan), TikTok (15 Jan) and Google Ads
--     (28 Jan) Fivetran schemas existed, so they cannot have come from them.
--   - Whole-dollar spend on every row, fractional clicks (e.g. 12.8131...),
--     Meta and TikTok rows inside PACING_FACT, no PLATFORM_LINE_ITEM_ID, no SOURCE.
--   - RMIT University (client 31) has no media plan in Supabase. Nothing reads these.
--   The same set also sits in SOCIAL_PACING_FACT (Meta) and SEARCH_PACING_FACT
--   (PLATFORM_LINE_ITEM_ID '1.2021e+17', CUSTOMER_ID '1.2021e+17'), so all three go.
--
-- Rows removed:
--   PACING_FACT         328 rows  54,871.00  (8 series: prog display / video, Meta, TikTok)
--   SOCIAL_PACING_FACT   82 rows  30,436.00  (RMIT001SM1, RMIT002SM1)
--   SEARCH_PACING_FACT  164 rows  18,378.00  (RMIT001SE1/SE2, RMIT002SE1/SE2)
--   Total               574 rows 103,685.00
-- A backup table per fact is made first.
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE SCHEMA ASSEMBLEDVIEW.MART;

-- ----- Before ----------------------------------------------------------------
-- expect pf 328 | 54871, social 82 | 30436, search 164 | 18378
-- SELECT 'pf' t, COUNT(*), SUM(amount_spent) FROM PACING_FACT
--  WHERE entity_id = '120210334964940000' AND campaign_name IN ('RMIT_POSTGRAD_Students','RMIT_Undergrad_Students')
-- UNION ALL SELECT 'social', COUNT(*), SUM(amount_spent) FROM SOCIAL_PACING_FACT
--  WHERE entity_id::STRING = '120210334964940000' AND campaign_name IN ('RMIT_POSTGRAD_Students','RMIT_Undergrad_Students')
-- UNION ALL SELECT 'search', COUNT(*), SUM(amount_spent) FROM SEARCH_PACING_FACT
--  WHERE platform_line_item_id = '1.2021e+17' AND LOWER(line_item_id) IN ('rmit001se1','rmit001se2','rmit002se1','rmit002se2');
-- Empty-key programmatic Jan - Feb 2026 (expect 4 groups, all RMIT, 13,284):
-- SELECT channel, line_item_id, campaign_name, COUNT(*), SUM(amount_spent) FROM PACING_FACT
--  WHERE COALESCE(TRIM(platform_line_item_id), '') = '' AND channel ILIKE 'programmatic%'
--    AND date_day BETWEEN '2026-01-01' AND '2026-02-28' GROUP BY 1, 2, 3;

CREATE TABLE IF NOT EXISTS ASSEMBLEDVIEW.MART.DG2_RMIT_SEED_PF_BACKUP_20261021 AS
  SELECT * FROM ASSEMBLEDVIEW.MART.PACING_FACT
  WHERE entity_id = '120210334964940000' AND campaign_name IN ('RMIT_POSTGRAD_Students','RMIT_Undergrad_Students');
CREATE TABLE IF NOT EXISTS ASSEMBLEDVIEW.MART.DG2_RMIT_SEED_SOCIAL_BACKUP_20261021 AS
  SELECT * FROM ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT
  WHERE entity_id::STRING = '120210334964940000' AND campaign_name IN ('RMIT_POSTGRAD_Students','RMIT_Undergrad_Students');
CREATE TABLE IF NOT EXISTS ASSEMBLEDVIEW.MART.DG2_RMIT_SEED_SEARCH_BACKUP_20261021 AS
  SELECT * FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT
  WHERE platform_line_item_id = '1.2021e+17' AND LOWER(line_item_id) IN ('rmit001se1','rmit001se2','rmit002se1','rmit002se2');

EXECUTE IMMEDIATE $$
DECLARE
  bk_pf INTEGER;
  bk_social INTEGER;
  bk_search INTEGER;
  pf_deleted INTEGER;
  social_deleted INTEGER;
  search_deleted INTEGER;
BEGIN
  SELECT COUNT(*) INTO :bk_pf FROM ASSEMBLEDVIEW.MART.DG2_RMIT_SEED_PF_BACKUP_20261021;
  SELECT COUNT(*) INTO :bk_social FROM ASSEMBLEDVIEW.MART.DG2_RMIT_SEED_SOCIAL_BACKUP_20261021;
  SELECT COUNT(*) INTO :bk_search FROM ASSEMBLEDVIEW.MART.DG2_RMIT_SEED_SEARCH_BACKUP_20261021;
  IF (bk_pf <> 328 OR bk_social <> 82 OR bk_search <> 164) THEN
    RETURN 'STOPPED: backup counts differ. pf=' || bk_pf || ' social=' || bk_social || ' search=' || bk_search;
  END IF;

  BEGIN TRANSACTION;

  DELETE FROM ASSEMBLEDVIEW.MART.PACING_FACT
  WHERE entity_id = '120210334964940000'
    AND campaign_name IN ('RMIT_POSTGRAD_Students','RMIT_Undergrad_Students');
  pf_deleted := SQLROWCOUNT;

  DELETE FROM ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT
  WHERE entity_id::STRING = '120210334964940000'
    AND campaign_name IN ('RMIT_POSTGRAD_Students','RMIT_Undergrad_Students');
  social_deleted := SQLROWCOUNT;

  DELETE FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT
  WHERE platform_line_item_id = '1.2021e+17'
    AND LOWER(line_item_id) IN ('rmit001se1','rmit001se2','rmit002se1','rmit002se2');
  search_deleted := SQLROWCOUNT;

  IF (pf_deleted <> 328 OR social_deleted <> 82 OR search_deleted <> 164) THEN
    ROLLBACK;
    RETURN 'ROLLED BACK: counts differ. pf=' || pf_deleted || ' social=' || social_deleted || ' search=' || search_deleted;
  END IF;

  COMMIT;
  RETURN 'OK pf=' || pf_deleted || ' social=' || social_deleted || ' search=' || search_deleted;
END;
$$;

-- ----- After -----------------------------------------------------------------
-- Before queries return 0 rows for all three, and the empty-key programmatic
-- query for Jan - Feb 2026 returns nothing.
-- Undo: INSERT INTO <fact> SELECT * FROM DG2_RMIT_SEED_<PF|SOCIAL|SEARCH>_BACKUP_20261021;
-- Clean-up once happy: DROP the three DG2_* backup tables.
