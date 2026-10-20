-- =============================================================================
-- HR1: HARTM001 (Paul Hartmann annual plan) delivery onto the right plan lines,
--      plus stale DV360 duplicates from 1 to 20 Jan 2026 (all clients)
-- Run as ACCOUNTADMIN in Snowsight. One transaction. Checked live 2026-10-20.
-- =============================================================================
-- Why:
--   1. Stale DV360 rows, 1 to 20 Jan 2026. PACING_FACT still holds 185 DV360 rows
--      keyed on old line item names ('men 55+ targeting', 'display_jan26', 'dec',
--      'jan', 'demo', ...). No live source produces these keys any more and every
--      one has a twin under the stable 32-hex key with the same day, spend and
--      impressions. Jan 1 to 20 DV360 spend in the fact is $49,753.59 against
--      $29,564.34 in VW_PACING_DV360: $20,189.25 is double counted
--      (Hartmann $8,837.38, Golf Australia, BOSS, legalsuper). FX1 only removed
--      FIVETRAN_ID-shaped keys, so these survived.
--   2. YouTube (DV360). The 5 DV360 video line items are named ...-hartm001ml1 /
--      ...-hartm001ml2 (the legacy ML code). The plan uses hartm001PV1 / PV2, so
--      $117,068.06 of 2026 delivery sits on no plan line. Map rows keep it
--      right on every future refresh (TSK_REFRESH_PACING_FACT joins the map).
--   3. Taboola. Campaign 47861580 'molicare-annual_performance-native-jan26-
--      hartm001PD3' lands as line id 47861580 because VW_PACING_TABOOLA does not
--      read the id in the name. $13,584.62 (1 Jan to 20 Oct) moves to hartm001pd3.
--   4. Meta. The Q1 ad sets were renamed on 25 Jan to add -hartm001smN. Rows
--      from 1 to 24 Jan carry the old names ('demo', 'ndis', 'consideration ad
--      set'): $8,540.85 on 8 ad sets moves to the id each ad set carries now.
--   5. Search. Ad groups were renamed on 5 Oct from hartm001se1 to se2..se7.
--      Earlier rows of the same ad group (same PLATFORM_LINE_ITEM_ID) still say
--      se1, and the PMax asset group 'female cooking pets' has no id.
--      $145,353.12 moves to the id each ad group carries now.
--   Social and search history older than 14 days is never re-merged by the
--   rolling refresh, so a direct UPDATE stays put.
--
-- Not changed here (see the notes at the end): 7 search ad groups that were
-- paused before the 5 Oct rename, Bing (no HARTM001 Bing data in Snowflake),
-- CM360 placements (HARTM001 has no ad serving line).
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE SCHEMA ASSEMBLEDVIEW.MART;

-- ----- Before: run and keep the numbers ---------------------------------------
-- A) stale DV360 rows (expect 185 rows, 20189.25)
-- SELECT COUNT(*), ROUND(SUM(amount_spent), 2) FROM PACING_FACT
-- WHERE channel IN ('Programmatic - Display', 'Programmatic - Video')
--   AND date_day BETWEEN '2026-01-01' AND '2026-01-20'
--   AND LOWER(TRIM(platform_line_item_id)) IN ('dec','men 55+ targeting','skin p35+','jan',
--     'inmarket_life_events','demo','display_jan26','am white list','jan26','lookalikes','skin_risk','men_inco');
-- B) HARTM001 by line, all facts, 2026
-- SELECT 'prog' f, line_item_id, ROUND(SUM(amount_spent), 2) FROM PACING_FACT
--   WHERE date_day >= '2026-01-01' AND channel LIKE 'Programmatic%'
--     AND (LOWER(line_item_id) LIKE 'hartm001%' OR platform_line_item_id = '47861580') GROUP BY 1, 2
-- UNION ALL SELECT 'social', line_item_id, ROUND(SUM(amount_spent), 2) FROM SOCIAL_PACING_FACT
--   WHERE date_day >= '2026-01-01' AND entity_id IN (SELECT entity_id FROM SOCIAL_PACING_FACT
--     WHERE line_item_id LIKE 'hartm001%') GROUP BY 1, 2
-- UNION ALL SELECT 'search', line_item_id, ROUND(SUM(amount_spent), 2) FROM SEARCH_PACING_FACT
--   WHERE date_day >= '2026-01-01' AND platform_line_item_id IN (SELECT platform_line_item_id
--     FROM SEARCH_PACING_FACT WHERE line_item_id LIKE 'hartm001%') GROUP BY 1, 2
-- ORDER BY 1, 2;

EXECUTE IMMEDIATE $$
DECLARE
  live_twins INTEGER;
  dv_deleted INTEGER;
  map_added INTEGER;
  prog_updated INTEGER;
  social_updated INTEGER;
  search_updated INTEGER;
BEGIN
  -- Guard: none of the stale keys may still come from a live source.
  SELECT COUNT(*) INTO :live_twins FROM (
    SELECT LOWER(TRIM(entity_id::string)) k FROM ASSEMBLEDVIEW.MART.VW_PACING_DV360 WHERE date_day >= '2025-12-01'
    UNION ALL SELECT LOWER(TRIM(entity_id::string)) FROM ASSEMBLEDVIEW.MART.VW_PACING_PARTNER_FILE
  ) WHERE k IN ('dec','men 55+ targeting','skin p35+','jan','inmarket_life_events','demo',
                'display_jan26','am white list','jan26','lookalikes','skin_risk','men_inco');
  IF (live_twins > 0) THEN
    RETURN 'STOPPED: a stale key is still produced by a live view. Nothing changed.';
  END IF;

  BEGIN TRANSACTION;

  -- 1. Stale DV360 name-keyed rows, 1 to 20 Jan 2026
  DELETE FROM ASSEMBLEDVIEW.MART.PACING_FACT
  WHERE channel IN ('Programmatic - Display', 'Programmatic - Video')
    AND date_day BETWEEN '2026-01-01' AND '2026-01-20'
    AND LOWER(TRIM(platform_line_item_id)) IN ('dec','men 55+ targeting','skin p35+','jan',
      'inmarket_life_events','demo','display_jan26','am white list','jan26','lookalikes','skin_risk','men_inco');
  dv_deleted := SQLROWCOUNT;

  -- 2 and 3. Map rows for YouTube (ML -> PV) and Taboola PD3
  MERGE INTO ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP t
  USING (
    SELECT column1 AS channel, column2 AS platform_line_item_id, column3 AS line_item_id, column4 AS line_item_name
    FROM VALUES
      ('Programmatic - Video',   'de94fbfd4ee1289c7bb64d66fddd85ec', 'hartm001pv1', 'contextual_men 55+ targeting-hartm001ml1'),
      ('Programmatic - Video',   'd856bee43cb14e8ba1160beca37dd552', 'hartm001pv1', 'broad_men 55+ targeting-hartm001ml1'),
      ('Programmatic - Video',   '39a0d4eecd2035712c396b8dc8474d80', 'hartm001pv1', 'broad_women 40+ targeting-hartm001ml1'),
      ('Programmatic - Video',   '2fa818c232fff8ab1141396c04734606', 'hartm001pv2', 'contextual_skin p35+-hartm001ml2'),
      ('Programmatic - Video',   '7bc4161a2bc84c4ec7f02eb55087e224', 'hartm001pv2', 'broad_skin p35+-hartm001ml2'),
      ('Programmatic - Display', '47861580',                         'hartm001pd3', 'molicare-annual_performance-native-jan26-hartm001PD3')
  ) s
  ON LOWER(TRIM(t.channel)) = LOWER(s.channel) AND LOWER(TRIM(t.platform_line_item_id)) = s.platform_line_item_id
  WHEN MATCHED THEN UPDATE SET line_item_id = s.line_item_id, is_active = TRUE, mba_number = 'hartm001',
    notes = COALESCE(t.notes || ' | ', '') || 'HR1 2026-10-20', updated_at = CURRENT_TIMESTAMP()
  WHEN NOT MATCHED THEN INSERT (channel, platform_line_item_id, line_item_id, line_item_name, is_active, notes, created_at, updated_at, mba_number)
    VALUES (s.channel, s.platform_line_item_id, s.line_item_id, s.line_item_name, TRUE,
            'HR1 2026-10-20: legacy ML code to PV / Taboola id in name', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), 'hartm001');
  map_added := SQLROWCOUNT;

  UPDATE ASSEMBLEDVIEW.MART.PACING_FACT f
  SET line_item_id = m.line_item_id, updated_at = CURRENT_TIMESTAMP()
  FROM ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP m
  WHERE m.is_active AND m.notes LIKE '%HR1 2026-10-20%'
    AND LOWER(TRIM(m.channel)) = LOWER(TRIM(f.channel))
    AND LOWER(TRIM(m.platform_line_item_id)) = LOWER(TRIM(f.platform_line_item_id))
    AND f.line_item_id <> m.line_item_id;
  prog_updated := SQLROWCOUNT;

  -- 4. Meta: rows before the 25 Jan rename take the id the same ad set carries now
  UPDATE ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT f
  SET line_item_id = l.tgt, updated_at = CURRENT_TIMESTAMP()
  FROM (
    SELECT channel, entity_id, line_item_id AS tgt
    FROM ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT
    WHERE entity_id IS NOT NULL
    QUALIFY ROW_NUMBER() OVER (PARTITION BY channel, entity_id ORDER BY date_day DESC) = 1
  ) l
  WHERE f.channel = l.channel AND f.entity_id = l.entity_id
    AND l.tgt LIKE 'hartm001sm%'
    AND f.date_day >= '2026-01-01'
    AND f.line_item_id <> l.tgt;
  social_updated := SQLROWCOUNT;

  -- 5. Search: earlier rows take the id the same ad group carries now
  UPDATE ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT f
  SET line_item_id = l.tgt, updated_at = CURRENT_TIMESTAMP()
  FROM (
    SELECT channel, platform_line_item_id, line_item_id AS tgt
    FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT
    QUALIFY ROW_NUMBER() OVER (PARTITION BY channel, platform_line_item_id ORDER BY date_day DESC, line_item_id) = 1
  ) l
  WHERE f.channel = l.channel AND f.platform_line_item_id = l.platform_line_item_id
    AND l.tgt LIKE 'hartm001se%'
    AND f.date_day >= '2026-01-01'
    AND f.line_item_id <> l.tgt;
  search_updated := SQLROWCOUNT;

  -- Expected: 185 / 6 / 1212 / 192 / 10242. Anything else rolls back.
  IF (dv_deleted <> 185 OR map_added <> 6 OR prog_updated <> 1212 OR social_updated <> 192 OR search_updated <> 10242) THEN
    ROLLBACK;
    RETURN 'ROLLED BACK: counts differ. deleted=' || dv_deleted || ' map=' || map_added || ' prog=' || prog_updated
      || ' social=' || social_updated || ' search=' || search_updated;
  END IF;

  COMMIT;
  RETURN 'OK deleted=' || dv_deleted || ' map=' || map_added || ' prog=' || prog_updated
    || ' social=' || social_updated || ' search=' || search_updated;
END;
$$;

-- ----- After: run query B again. Expected HARTM001 2026 totals move ----------
--   prog:   hartm001ml1 and hartm001ml2 gone; hartm001pv1 +67,264.63, hartm001pv2 +49,803.43,
--           hartm001pd3 +13,584.62; 'display_jan26','jan26','men 55+ targeting','skin p35+' gone
--   social: 'demo' -2,780.96 to sm1, 'ndis' -2,125.36 to sm2, 'consideration ad set' -3,634.53 to sm3
--   search: se1 -145,353.12 (to se2 26,477.86, se3 22,653.21, se4 15,927.59, se5 29,583.38,
--           se6 31,150.06); 'female cooking pets' 19,561.02 to se7
--
-- ----- Optional (needs Luke's decision, not run above) ------------------------
-- Ad groups paused before the 5 Oct rename keep se1 or no id. To move them to the
-- line their campaign now uses (2026 spend in brackets):
--   173093004185 Men -> se2 (3,488.60)        174530290540 Women -> se3 (469.38)
--   174530290740 Women -> se3 (632.07)        176418033569 Brand Skincare -> se5 (176.43)
--   176418034969 Generic Skincare -> se5 (355.30, still live as se1: rename it in Google Ads too)
--   6629142131 PMax 'competitors' -> se7 (1,554.09)   6629225481 PMax 'male sports enthusiasts' -> se7 (1,901.86)
-- UPDATE SEARCH_PACING_FACT SET line_item_id = CASE platform_line_item_id
--     WHEN '173093004185' THEN 'hartm001se2' WHEN '174530290540' THEN 'hartm001se3'
--     WHEN '174530290740' THEN 'hartm001se3' WHEN '176418033569' THEN 'hartm001se5'
--     WHEN '176418034969' THEN 'hartm001se5' WHEN '6629142131' THEN 'hartm001se7'
--     WHEN '6629225481' THEN 'hartm001se7' END, updated_at = CURRENT_TIMESTAMP()
--   WHERE date_day >= '2026-01-01' AND platform_line_item_id IN ('173093004185','174530290540',
--     '174530290740','176418033569','176418034969','6629142131','6629225481');
