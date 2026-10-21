-- =============================================================================
-- DG7: Hema maps Meta ad sets with no plan suffix -> hema002sm1 (2H 2025) and
--      hema003sm1 (Jan - Feb 2026)
-- Run as ACCOUNTADMIN in Snowsight. One transaction. Measured live 2026-10-21.
-- =============================================================================
-- Issue: hema002SM1 (Hema maps Meta, 1 Jul - 31 Dec 2025, $23,490 planned)
-- shows $0 delivered, and hema003SM1 (1 Jan - 30 Jun 2026, $18,000) has no
-- January delivery.
--
-- Root cause: the FY25Q3 Hema maps ad sets were never renamed with a plan code,
-- so their line id is the last '-' part of the ad set name ('Interest',
-- 'Interest – BF', 'Interest – Boxing Day'). Same cause as DG4 (names without
-- the plan suffix), not a hema003sm1 overlap: hema003sm1 holds no 2025 rows.
-- The FY26Q1 ad sets ending -hema003SM1 start 1 Feb 2026.
--
-- Ad sets (Meta ad set ids):
--   120228641267120418  Prospecting-AU-Interest      FBIG-Hema maps-Prospecting-FY25Q3-Conversions
--   120228644525510418  Remarketing-AU-Interest      FBIG-Hema maps-Remarketing-FY25Q3-Conversions
--   120228644781270418  Prospecting-AU-Interest      FBIG-Hema maps-Prospecting-FY25Q3-Clicks
--   120237205259050418  Prospecting-AU-Interest – BF          (26 Nov - 8 Dec 2025)
--   120238432844860418  Prospecting-AU-Interest – Boxing Day  (23 Dec 2025 - 1 Jan 2026)
-- Spend matches raw FACEBOOK_ADS.BASIC_AD_SET to the cent.
--
-- Rows moved (split by flight, inclusive dates):
--   SOCIAL_PACING_FACT  1 Jul - 31 Dec 2025 -> hema002sm1   572 rows  19,693.55
--   SOCIAL_PACING_FACT  1 Jan - 30 Jun 2026 -> hema003sm1   109 rows   2,981.03
--                       (Jan 2,981.03; 1 - 7 Feb rows are $0)
--   PACING_FACT legacy 'Social - Meta' copies 13 Jan - 7 Feb 2026
--                                           -> hema003sm1    72 rows   1,797.40
--                       (relabelled so no stray 'interest' copy is left, as DG5)
-- After: hema002sm1 19,693.55 of 23,490 (84%); hema003sm1 14,946.04 -> 17,927.07
-- of 18,000 (99.6%).
--
-- Not moved (left for Luke):
--   * Name-keyed duplicate rows for the BF and Boxing Day ad sets
--     (PLATFORM_LINE_ITEM_ID = the ad set name, 2025-07-01 to 2026-01-20 load).
--     They copy the id-keyed rows day for day; moving them would double count.
--   * Saber 2H 2025 Meta (hema004 / hema005 lines): several unsuffixed ad sets
--     across FY25Q2 / Q3 / Q4 campaigns; the line split is not clear enough.
-- No LINE_ITEM_LABEL_MAP rows: the map has one line per ad set with no dates,
-- and three ad sets span both flights. The ad sets stopped on 7 Feb 2026, so the
-- 14 day refresh never touches these rows. A full-history rebuild of
-- SOCIAL_PACING_FACT would undo this file; re-run it after one.
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE SCHEMA ASSEMBLEDVIEW.MART;

-- ----- Before ----------------------------------------------------------------
-- expect soc_2h25 572 | 19693.55, soc_2026 109 | 2981.03, pf_2026 72 | 1797.40,
--        hema002sm1 0 rows, hema003sm1 566 | 14946.04
-- SELECT 'soc_2h25' t, COUNT(*), ROUND(SUM(amount_spent), 2) FROM SOCIAL_PACING_FACT
--  WHERE channel = 'Social - Meta' AND date_day BETWEEN '2025-07-01' AND '2025-12-31'
--    AND COALESCE(NULLIF(TRIM(platform_line_item_id), ''), entity_id::STRING) IN ('120228641267120418','120228644525510418','120228644781270418','120237205259050418','120238432844860418')
--    AND LOWER(line_item_id) NOT IN ('hema002sm1', 'hema003sm1')
-- UNION ALL SELECT 'soc_2026', COUNT(*), ROUND(SUM(amount_spent), 2) FROM SOCIAL_PACING_FACT
--  WHERE channel = 'Social - Meta' AND date_day BETWEEN '2026-01-01' AND '2026-06-30'
--    AND COALESCE(NULLIF(TRIM(platform_line_item_id), ''), entity_id::STRING) IN ('120228641267120418','120228644525510418','120228644781270418','120237205259050418','120238432844860418')
--    AND LOWER(line_item_id) NOT IN ('hema002sm1', 'hema003sm1')
-- UNION ALL SELECT 'pf_2026', COUNT(*), ROUND(SUM(amount_spent), 2) FROM PACING_FACT
--  WHERE channel = 'Social - Meta' AND date_day BETWEEN '2026-01-01' AND '2026-06-30'
--    AND TRIM(platform_line_item_id) IN ('120228641267120418','120228644525510418','120228644781270418','120237205259050418','120238432844860418')
--    AND LOWER(line_item_id) NOT IN ('hema002sm1', 'hema003sm1')
-- UNION ALL SELECT LOWER(line_item_id), COUNT(*), ROUND(SUM(amount_spent), 2) FROM SOCIAL_PACING_FACT
--  WHERE LOWER(line_item_id) IN ('hema002sm1', 'hema003sm1') GROUP BY 1;

EXECUTE IMMEDIATE $$
DECLARE
  soc_2h25 INTEGER;
  soc_2026 INTEGER;
  pf_2026 INTEGER;
BEGIN
  BEGIN TRANSACTION;

  UPDATE ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT
  SET line_item_id = 'hema002sm1', updated_at = CURRENT_TIMESTAMP()
  WHERE channel = 'Social - Meta'
    AND date_day BETWEEN '2025-07-01' AND '2025-12-31'
    AND COALESCE(NULLIF(TRIM(platform_line_item_id), ''), entity_id::STRING) IN
        ('120228641267120418', '120228644525510418', '120228644781270418', '120237205259050418', '120238432844860418')
    AND LOWER(line_item_id) NOT IN ('hema002sm1', 'hema003sm1');
  soc_2h25 := SQLROWCOUNT;

  UPDATE ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT
  SET line_item_id = 'hema003sm1', updated_at = CURRENT_TIMESTAMP()
  WHERE channel = 'Social - Meta'
    AND date_day BETWEEN '2026-01-01' AND '2026-06-30'
    AND COALESCE(NULLIF(TRIM(platform_line_item_id), ''), entity_id::STRING) IN
        ('120228641267120418', '120228644525510418', '120228644781270418', '120237205259050418', '120238432844860418')
    AND LOWER(line_item_id) NOT IN ('hema002sm1', 'hema003sm1');
  soc_2026 := SQLROWCOUNT;

  UPDATE ASSEMBLEDVIEW.MART.PACING_FACT
  SET line_item_id = 'hema003sm1', updated_at = CURRENT_TIMESTAMP()
  WHERE channel = 'Social - Meta'
    AND date_day BETWEEN '2026-01-01' AND '2026-06-30'
    AND TRIM(platform_line_item_id) IN
        ('120228641267120418', '120228644525510418', '120228644781270418', '120237205259050418', '120238432844860418')
    AND LOWER(line_item_id) NOT IN ('hema002sm1', 'hema003sm1');
  pf_2026 := SQLROWCOUNT;

  IF (soc_2h25 <> 572 OR soc_2026 <> 109 OR pf_2026 <> 72) THEN
    ROLLBACK;
    RETURN 'ROLLED BACK: counts differ. soc_2h25=' || soc_2h25 || ' soc_2026=' || soc_2026 || ' pf_2026=' || pf_2026;
  END IF;

  COMMIT;
  RETURN 'OK soc_2h25=' || soc_2h25 || ' soc_2026=' || soc_2026 || ' pf_2026=' || pf_2026;
END;
$$;

-- ----- After -----------------------------------------------------------------
-- Before query: soc_2h25 0, soc_2026 0, pf_2026 0;
-- hema002sm1 572 | 19693.55, hema003sm1 675 | 17927.07.
