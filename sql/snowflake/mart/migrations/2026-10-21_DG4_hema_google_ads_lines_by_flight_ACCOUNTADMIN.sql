-- =============================================================================
-- DG4: Hema Google Ads (PMax, search, shopping) onto the plan line for each flight
-- Run as ACCOUNTADMIN in Snowsight. One transaction. Measured live 2026-10-20.
-- =============================================================================
-- Issue: Hema PMax delivery sits on the wrong lines for hema003 - hema007.
--
-- Root cause:
--   SEARCH_PACING_FACT takes the line id from the latest ad group / asset group
--   name. The Hema Maps account (3535571939) has carried '-hema003SE1' since
--   the Jan 2026 build, so the whole account history (Jun 2025 to today) is on
--   hema003se1, though hema003 only runs 1 Jan - 30 Jun 2026. The Saber
--   account (4063267031) carries '-hema004SE1', so the hema005 flight
--   (Oct - Nov 2025) also sits on hema004se1. Two new Maps asset groups
--   ('QLD Maps', 'Scratch&Sticker Maps', from 10 Jun 2026) and seven Saber
--   asset / shopping groups have no id at all.
--
-- Plan lines (published versions, Supabase):
--   Maps   hema002SE1  1 Jul - 31 Dec 2025  $6,085 / month  (hema002 'Search and Social')
--   Maps   hema003SE1  1 Jan - 30 Jun 2026  $7,000 / month
--   Maps   hema007SE1  1 Jul - 31 Oct 2026  $7,000 / month  (Meta already moved to hema007sm1)
--   Saber  hema004SE1  17 Jun - 30 Sep 2025 and 1 Dec 2025 - 30 Apr 2026 (no Oct / Nov bursts)
--   Saber  hema005SE1  1 Oct - 30 Nov 2025  $5,000 / month  ('Responsive Display Ads and Product Listing')
--   hema006 is a Draft copy of hema007 for July (end date 30 Jun before start 1 Jul). Not used.
--
-- Delivered vs plan after the move (spend, all three Google channels):
--   hema007se1 Jul - 20 Oct 2026 24,643.63 vs ~25,600 to date
--   hema003se1 Jan - Jun 2026    41,813.85 vs 42,000
--   hema002se1 Jul - Dec 2025    40,781.42 vs 36,510
--   hema005se1 Oct - Nov 2025     8,990.42 vs 10,000
--
-- PART A (run): 95%+ confidence. 2,837 rows, 34,162.84 on 20 Oct; 2,851 rows,
--   34,340.83 on 21 Oct 15:40 (hema007 now runs to 31 Oct; guard counts live).
--   Maps  1 Jul - 20 Oct 2026, all groups          -> hema007se1  1,842 rows  24,643.63
--   Maps  Jun 2026, QLD Maps / Scratch&Sticker     -> hema003se1     42 rows     107.29
--   Saber unlabelled groups inside hema004 flights -> hema004se1    953 rows   9,411.91
-- PART B (commented out, needs your OK, about 90%): 4,053 rows, 49,771.84
--   Maps  1 Jul - 31 Dec 2025                      -> hema002se1  3,470 rows  40,781.42
--   Saber 1 Oct - 30 Nov 2025                      -> hema005se1    583 rows   8,990.42
--   Why not 95%: it depends on hema002 being the Maps account plan for H2 2025
--   and hema005SE1 taking all Saber Google spend (search + shopping + PMax) in
--   Oct - Nov. Budgets line up, but a person should confirm.
--
-- IMPORTANT, rolling refresh: SP_REFRESH_GOOGLESEARCHPACING_ROLLING rewrites the
-- last 14 days from the live names every night. Until the Maps ad groups and
-- asset groups are renamed '-hema007SE1' in Google Ads, 7 Oct onwards flips back
-- to hema003se1 each night. Rename these in Google Ads 3535571939:
--   PMax 'Hema Maps_Sales_All products_Pmax_Sep24': every asset group incl.
--     'QLD Maps' and 'Scratch&Sticker Maps' -> suffix -hema007SE1
--   'Hema Maps_Sales_All products_Search_Sep24' ad groups -> -hema007SE1
--   'Hema Maps_Conversions_All-Products_Shopping_S...' ad groups -> -hema007SE1
-- Then re-run Part A's UPDATE for 7 - 20 Oct if any rows flipped back
-- (the guard will tell you: it counts rows <= 20 Oct only).
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE SCHEMA ASSEMBLEDVIEW.MART;

-- ----- Before ----------------------------------------------------------------
-- Rows to move by target (expect A: hema007se1 1842 | 24643.63, hema003se1 42 | 107.29,
-- hema004se1 953 | 9411.91; B: hema002se1 3470 | 40781.42, hema005se1 583 | 8990.42)
-- WITH t AS (SELECT f.*, CASE
--   WHEN customer_id = '3535571939' AND date_day BETWEEN '2025-07-01' AND '2025-12-31' THEN 'hema002se1'
--   WHEN customer_id = '3535571939' AND date_day BETWEEN '2026-01-01' AND '2026-06-30' THEN 'hema003se1'
--   WHEN customer_id = '3535571939' AND date_day BETWEEN '2026-07-01' AND '2026-10-20' THEN 'hema007se1'
--   WHEN customer_id = '4063267031' AND date_day BETWEEN '2025-10-01' AND '2025-11-30' THEN 'hema005se1'
--   WHEN customer_id = '4063267031' AND (date_day BETWEEN '2025-06-17' AND '2025-09-30'
--                                     OR date_day BETWEEN '2025-12-01' AND '2026-04-30') THEN 'hema004se1' END tgt
--   FROM SEARCH_PACING_FACT f WHERE customer_id IN ('3535571939','4063267031')
--     AND channel IN ('Search - Google Ads','Shopping - Google Ads','PMax - Google Ads'))
-- SELECT tgt, COUNT(*), ROUND(SUM(amount_spent), 2) FROM t
-- WHERE tgt IS NOT NULL AND COALESCE(LOWER(line_item_id), '') <> tgt GROUP BY 1 ORDER BY 1;

EXECUTE IMMEDIATE $$
DECLARE
  a_updated INTEGER;
  a_expected INTEGER;
BEGIN
  -- Count the rows to move first. The nightly refresh adds rows, so the guard
  -- compares against this live count plus a sanity range (measured 21 Oct 15:40:
  -- 1,856 + 42 + 953 = 2,851 rows, $34,340.83).
  SELECT COUNT(*) INTO :a_expected FROM (
    SELECT CASE
      WHEN customer_id = '3535571939' AND date_day BETWEEN '2026-07-01' AND '2026-10-31' THEN 'hema007se1'
      WHEN customer_id = '3535571939' AND date_day BETWEEN '2026-06-01' AND '2026-06-30'
           AND LOWER(line_item_id) IN ('qld maps', 'scratch&sticker maps') THEN 'hema003se1'
      WHEN customer_id = '4063267031' AND (date_day BETWEEN '2025-06-17' AND '2025-09-30'
                                        OR date_day BETWEEN '2025-12-01' AND '2026-04-30') THEN 'hema004se1'
    END AS tgt, line_item_id
    FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT
    WHERE customer_id IN ('3535571939', '4063267031')
      AND channel IN ('Search - Google Ads', 'Shopping - Google Ads', 'PMax - Google Ads')
  ) WHERE tgt IS NOT NULL AND COALESCE(LOWER(line_item_id), '') <> tgt;
  IF (a_expected < 2800 OR a_expected > 3000) THEN
    RETURN 'STOPPED: expected rows out of range (2800 to 3000). a_expected=' || a_expected;
  END IF;

  BEGIN TRANSACTION;

  UPDATE ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT f
  SET line_item_id = s.tgt, updated_at = CURRENT_TIMESTAMP()
  FROM (
    SELECT channel, date_day, platform_line_item_id, tgt FROM (
      SELECT channel, date_day, platform_line_item_id, line_item_id, CASE
        WHEN customer_id = '3535571939' AND date_day BETWEEN '2026-07-01' AND '2026-10-31' THEN 'hema007se1'
        WHEN customer_id = '3535571939' AND date_day BETWEEN '2026-06-01' AND '2026-06-30'
             AND LOWER(line_item_id) IN ('qld maps', 'scratch&sticker maps') THEN 'hema003se1'
        WHEN customer_id = '4063267031' AND (date_day BETWEEN '2025-06-17' AND '2025-09-30'
                                          OR date_day BETWEEN '2025-12-01' AND '2026-04-30') THEN 'hema004se1'
      END AS tgt
      FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT
      WHERE customer_id IN ('3535571939', '4063267031')
        AND channel IN ('Search - Google Ads', 'Shopping - Google Ads', 'PMax - Google Ads')
    ) WHERE tgt IS NOT NULL AND COALESCE(LOWER(line_item_id), '') <> tgt
  ) s
  WHERE f.channel = s.channel AND f.date_day = s.date_day
    AND f.platform_line_item_id = s.platform_line_item_id
    AND f.customer_id IN ('3535571939', '4063267031');
  a_updated := SQLROWCOUNT;

  -- Must equal the live count above. Anything else rolls back.
  IF (a_updated <> a_expected) THEN
    ROLLBACK;
    RETURN 'ROLLED BACK: count differs. part_a=' || a_updated || ' expected=' || a_expected;
  END IF;

  COMMIT;
  RETURN 'OK part_a=' || a_updated;
END;
$$;

-- ----- PART B: only after you confirm hema002 / hema005 ----------------------
-- EXECUTE IMMEDIATE $$
-- DECLARE b_updated INTEGER;
-- BEGIN
--   BEGIN TRANSACTION;
--   UPDATE ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT f
--   SET line_item_id = s.tgt, updated_at = CURRENT_TIMESTAMP()
--   FROM (
--     SELECT channel, date_day, platform_line_item_id, tgt FROM (
--       SELECT channel, date_day, platform_line_item_id, line_item_id, CASE
--         WHEN customer_id = '3535571939' AND date_day BETWEEN '2025-07-01' AND '2025-12-31' THEN 'hema002se1'
--         WHEN customer_id = '4063267031' AND date_day BETWEEN '2025-10-01' AND '2025-11-30' THEN 'hema005se1'
--       END AS tgt
--       FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT
--       WHERE customer_id IN ('3535571939', '4063267031')
--         AND channel IN ('Search - Google Ads', 'Shopping - Google Ads', 'PMax - Google Ads')
--     ) WHERE tgt IS NOT NULL AND COALESCE(LOWER(line_item_id), '') <> tgt
--   ) s
--   WHERE f.channel = s.channel AND f.date_day = s.date_day
--     AND f.platform_line_item_id = s.platform_line_item_id
--     AND f.customer_id IN ('3535571939', '4063267031');
--   b_updated := SQLROWCOUNT;
--   IF (b_updated <> 4053) THEN ROLLBACK; RETURN 'ROLLED BACK: part_b=' || b_updated; END IF;
--   COMMIT;
--   RETURN 'OK part_b=' || b_updated;
-- END;
-- $$;

-- ----- After -----------------------------------------------------------------
-- Before query: Part A targets return no rows (Part B rows remain until you run B).
-- By line, rows <= 20 Oct (expect after Part A, measured as a dry run on 20 Oct):
--   Maps  hema007se1  2 Jul - 20 Oct 2026  1,842 rows   24,643.63
--   Maps  hema003se1  6 Apr 2025 - 30 Jun 2026  8,248 rows  100,166.22
--         (still holds Apr 2025 - Dec 2025 until Part B; Apr - Jun 2025 has no plan line and stays)
--   Saber hema004se1  17 Jun 2025 - 8 Apr 2026  2,441 rows  42,620.20
--         (Oct - Nov 2025 labelled rows stay here until Part B)
--   Saber Oct - Nov 2025 unlabelled groups (bau, compressor(s), recovery gear / kits,
--         soft shackles, winches) stay unlabelled until Part B
-- After Part B: hema002se1 3,470 rows 40,781.42; hema005se1 583 rows 8,990.42.
-- SELECT LOWER(line_item_id), customer_id, MIN(date_day), MAX(date_day), COUNT(*), ROUND(SUM(amount_spent), 2)
-- FROM SEARCH_PACING_FACT WHERE customer_id IN ('3535571939','4063267031') AND date_day <= '2026-10-20'
-- GROUP BY 1, 2 ORDER BY 2, 3;
