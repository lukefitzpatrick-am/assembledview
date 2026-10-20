-- =============================================================================
-- RL90: relabel delivery from the last 90 days that sits on no published plan line
-- Run as ACCOUNTADMIN in Snowsight. One transaction. Measured live 2026-10-20.
-- =============================================================================
-- Why:
--   Delivery in PACING_FACT, SOCIAL_PACING_FACT and SEARCH_PACING_FACT from
--   22 Jul to 20 Oct 2026 was checked against the line ids of the latest
--   published version of every MBA in Supabase. 149 platform entities carry an
--   id that is on no plan line ($57,030.53 of spend, plus CM360 impressions).
--   47 of them could be pinned to one client, one MBA and one line with at least
--   95% confidence. This script moves those. The rest are in the RL90 review list
--   (review.csv, 93 entities, $15,678.28) and duplicates list (duplicates.csv,
--   9 stale CM360 placement names, $0) for the team to connect by hand.
--
--   Each entity is relabelled for its whole 2026 history (date_day >= 2026-01-01),
--   not only the 90-day window, because it is the same platform entity buying the
--   same line. Exception: the two PGA Institute Meta ad sets and the six PGA
--   Institute search ad groups are relabelled from 1 May only (PGAAUS014 starts
--   1 May; April belongs to PGAAUS006 or PGAAUS014, which is on the review list).
--
--   PACING_FACT and SOCIAL_PACING_FACT: a LINE_ITEM_LABEL_MAP row per entity keeps
--   the label on every future nightly refresh, then history is updated from the map.
--   SEARCH_PACING_FACT: the rolling refresh does not read the map, so history is
--   updated directly. The live ad groups must also be renamed in Google Ads or the
--   next 14-day refresh puts the old label back on recent days (list at the end).
--
--   Rows that are exact duplicates of another row (same channel, day, campaign,
--   spend and impressions under a different key, 20+ impressions) are skipped.
--   Today that is 4 CM360 rows (Penfolds Grange Hero 15sec chapter one / two,
--   19-20 Sep, 28,198 impressions). Nine stale CM360 placement names that
--   duplicate a renamed placement are left alone (duplicates.csv).
--
-- Evidence codes in LINE_ITEM_LABEL_MAP.NOTES ('RL90 2026-10-20: <code>'):
--   a   the same entity already carries the plan id on other days
--   b   id token in the name is a near miss of exactly one plan line
--       (missing media code, one-character typo)
--   b+c near-miss id plus the line's market is the only one that fits
--   c   MBA in the CM360 campaign name and exactly one line of that MBA matches
--       publisher / format and dates
--   C2  no id in the name, but the platform account maps to one client, the
--       platform campaign name matches the plan campaign name, and exactly one
--       line matches channel, platform and flight dates (Challenger, Boss Taboola,
--       PGA Academy, PGA Institute search, Assembled Media search). Strip these
--       VALUES lines if you want strict a / b / c only.
--
-- Summary by client (full relabelled amount, 2026, before the duplicate guard):
--   Client                  Entities  Rows   Spend       Target lines
--   PGA Australia           13       1,197   26,374.52   pgaaus014se1 (6 ad groups), pgaaus014sm1, pgaaus016sm1,
--                                                        pgaaus015dd16 (CM360)
--   Paul Hartmann Pty Ltd    9         454   13,044.31   hartm012sm1, hartm014sm1, hartm017dd1 (CM360)
--   Challenger               2          31   10,997.47   challen005pv1
--   Jayco                    2          26    7,201.96   jayco017sm6 (TAS), jayco017sm7 (NT)
--   LDS Property             1         145    3,257.83   buxton004sm1
--   Boss Engineering         6         500    2,167.37   boss006pd1 (Taboola), boss005pd2 (CM360)
--   Golf Australia           1           9      414.73   golf031sm1
--   Assembled Media          5          29      144.32   assembled001se1..se5
--   Penfolds                 8         571        0.00   penfold018pv2, penfold018dd1, penfold018dv1 (CM360)
--   Total                   47       2,962   63,602.51   ($41,352.25 of it inside the 90-day window)
--   After the duplicate guard: 2,958 rows (PACING_FACT 1,128, SOCIAL 887, SEARCH 943).
--
-- Pacing check (relabelled + already on line, against planned to 20 Oct):
--   no line goes past 150%. Highest: pgaaus014sm1 99.5%, pgaaus014se1 98.6%,
--   jayco017sm6 89.9%, jayco017sm7 89.8%, golf031sm1 85.5%.
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE SCHEMA ASSEMBLEDVIEW.MART;

-- ----- Before: run and keep the numbers ---------------------------------------
-- A) no RL90 map rows yet (expect 0)
-- SELECT COUNT(*) FROM LINE_ITEM_LABEL_MAP WHERE notes LIKE '%RL90 2026-10-20%';
-- B) target lines now (expect only pgaaus014sm1 8,685.54 and boss005pd2 5,516.87 outside CM360)
-- SELECT 'prog' f, channel, LOWER(line_item_id) lid, COUNT(*) n, ROUND(SUM(amount_spent), 2) s, SUM(impressions) i
--   FROM PACING_FACT WHERE date_day >= '2026-01-01' AND LOWER(line_item_id) IN ('challen005pv1','boss006pd1',
--   'hartm017dd1','boss005pd2','penfold018pv2','penfold018dd1','penfold018dv1','pgaaus015dd16') GROUP BY 1, 2, 3
-- UNION ALL SELECT 'social', channel, LOWER(line_item_id), COUNT(*), ROUND(SUM(amount_spent), 2), SUM(impressions)
--   FROM SOCIAL_PACING_FACT WHERE date_day >= '2026-01-01' AND LOWER(line_item_id) IN ('jayco017sm6','jayco017sm7',
--   'hartm014sm1','hartm012sm1','pgaaus016sm1','buxton004sm1','pgaaus014sm1','golf031sm1') GROUP BY 1, 2, 3
-- UNION ALL SELECT 'search', channel, LOWER(line_item_id), COUNT(*), ROUND(SUM(amount_spent), 2), SUM(impressions)
--   FROM SEARCH_PACING_FACT WHERE date_day >= '2026-01-01' AND LOWER(line_item_id) IN ('pgaaus014se1',
--   'assembled001se1','assembled001se2','assembled001se3','assembled001se4','assembled001se5') GROUP BY 1, 2, 3
-- ORDER BY 1, 3;

-- C) expected counts for the guards below (re-run if this is not run on 20 Oct:
--    the nightly refresh adds rows for live entities; put the new numbers in the IF)
-- WITH c(f, ch, k, t, fl) AS (SELECT column1, column2, column3, column4, column5::DATE FROM VALUES
--   ('pf','Programmatic - Video','745187f1d084133e97e2f3177cc5099f','challen005pv1','2026-01-01'),
--   ('pf','Programmatic - Video','6f7d5f9ce7fc761285909c4e6fce5229','challen005pv1','2026-01-01'),
--   ('pf','Programmatic - Display','49845708','boss006pd1','2026-01-01'),
--   ('pf','Ad Serving - CM360','molicare-mens_the_leak-channelfactory-rich_media_display-1x1--5drops','hartm017dd1','2026-01-01'),
--   ('pf','Ad Serving - CM360','molicare-mens_the_leak-channelfactory-rich_media_display-1x1--3drops','hartm017dd1','2026-01-01'),
--   ('pf','Ad Serving - CM360','molicare-mens_the_leak-channelfactory-rich_media_display-1x1--2drops','hartm017dd1','2026-01-01'),
--   ('pf','Ad Serving - CM360','boss_engineering-boss automotive - july/august-dv360-display-300x250-csa-bau','boss005pd2','2026-01-01'),
--   ('pf','Ad Serving - CM360','boss_engineering-boss automotive - july/august-dv360-display-300x600-csa-bau','boss005pd2','2026-01-01'),
--   ('pf','Ad Serving - CM360','boss_engineering-boss automotive - july/august-dv360-display-728x90-csa-bau','boss005pd2','2026-01-01'),
--   ('pf','Ad Serving - CM360','boss_engineering-boss automotive - july/august-dv360-display-970x250-csa-bau','boss005pd2','2026-01-01'),
--   ('pf','Ad Serving - CM360','boss_engineering-boss automotive - july/august-dv360-display-320x50-csa-bau','boss005pd2','2026-01-01'),
--   ('pf','Ad Serving - CM360','penfolds-grange_hero-yahoo-video-30sec-mixin-chapter_one','penfold018pv2','2026-01-01'),
--   ('pf','Ad Serving - CM360','penfolds-grange_hero-yahoo-video-15sec-mixin-chapter_one','penfold018pv2','2026-01-01'),
--   ('pf','Ad Serving - CM360','penfolds-grange_hero-yahoo-video-15sec-mixin-chapter_two','penfold018pv2','2026-01-01'),
--   ('pf','Ad Serving - CM360','penfolds-grange_hero-yahoo-video-30sec-mixin-chapter_two','penfold018pv2','2026-01-01'),
--   ('pf','Ad Serving - CM360','penfolds-grange_hero-gumgum-high_impact_display-1x1--velocity','penfold018dd1','2026-01-01'),
--   ('pf','Ad Serving - CM360','penfolds-grange_hero-gumgum-high_impact_display-1x1--superskins','penfold018dd1','2026-01-01'),
--   ('pf','Ad Serving - CM360','penfolds-grange_hero-gumgum-high_impact_display-1x1--hangtime','penfold018dd1','2026-01-01'),
--   ('pf','Ad Serving - CM360','penfolds-grange_hero-7plus-bvod-1920x1080--30sec','penfold018dv1','2026-01-01'),
--   ('pf','Ad Serving - CM360','pga-champs_fy27-newscorp-standard_display-728x90--champs_desktop-ppgaaus015dd16','pgaaus015dd16','2026-01-01'),
--   ('soc','Social - Meta','120250169080330224','jayco017sm6','2026-01-01'),
--   ('soc','Social - Meta','120250169080360224','jayco017sm7','2026-01-01'),
--   ('soc','Social - Meta','120250202535440542','hartm014sm1','2026-01-01'),
--   ('soc','Social - Meta','120251219637010542','hartm014sm1','2026-01-01'),
--   ('soc','Social - Meta','120249628737600542','hartm014sm1','2026-01-01'),
--   ('soc','Social - Meta','120249567126250542','hartm014sm1','2026-01-01'),
--   ('soc','Social - Meta','120244481681020542','hartm012sm1','2026-01-01'),
--   ('soc','Social - Meta','120244477003380542','hartm012sm1','2026-01-01'),
--   ('soc','Social - Meta','52609130756286','pgaaus016sm1','2026-01-01'),
--   ('soc','Social - Meta','52609138761286','pgaaus016sm1','2026-01-01'),
--   ('soc','Social - Meta','52615822267686','pgaaus016sm1','2026-01-01'),
--   ('soc','Social - Meta','52615821918686','pgaaus016sm1','2026-01-01'),
--   ('soc','Social - Meta','120242229721160113','buxton004sm1','2026-01-01'),
--   ('soc','Social - Meta','120244852193820325','pgaaus014sm1','2026-05-01'),
--   ('soc','Social - Meta','120244852697410325','pgaaus014sm1','2026-05-01'),
--   ('soc','Social - Meta','120246464967840540','golf031sm1','2026-01-01'),
--   ('sea','Search - Google Ads','198018494587','pgaaus014se1','2026-05-01'),
--   ('sea','Search - Google Ads','198018494787','pgaaus014se1','2026-05-01'),
--   ('sea','Search - Google Ads','198018494827','pgaaus014se1','2026-05-01'),
--   ('sea','Search - Google Ads','198018494627','pgaaus014se1','2026-05-01'),
--   ('sea','Search - Google Ads','198018494867','pgaaus014se1','2026-05-01'),
--   ('sea','Search - Google Ads','198018494547','pgaaus014se1','2026-05-01'),
--   ('sea','Search - Google Ads','201436824192','assembled001se1','2026-01-01'),
--   ('sea','Search - Google Ads','202425989964','assembled001se4','2026-01-01'),
--   ('sea','Search - Google Ads','201519583180','assembled001se3','2026-01-01'),
--   ('sea','Search - Google Ads','197759896301','assembled001se5','2026-01-01'),
--   ('sea','Search - Google Ads','207560961744','assembled001se2','2026-01-01')),
-- x AS (SELECT 'pf' f, channel ch, date_day, LOWER(TRIM(platform_line_item_id)) k, line_item_id lid, campaign_name cn, amount_spent s, impressions i FROM PACING_FACT
--       UNION ALL SELECT 'soc', channel, date_day, LOWER(TRIM(COALESCE(NULLIF(TRIM(platform_line_item_id), ''), entity_id::STRING))), line_item_id, campaign_name, amount_spent, impressions FROM SOCIAL_PACING_FACT
--       UNION ALL SELECT 'sea', channel, date_day, LOWER(TRIM(platform_line_item_id)), line_item_id, campaign_name, amount_spent, impressions FROM SEARCH_PACING_FACT)
-- SELECT c.f, COUNT(*) FROM c JOIN x ON x.f = c.f AND x.ch = c.ch AND x.k = c.k
-- WHERE x.date_day >= c.fl AND COALESCE(LOWER(x.lid), '') <> c.t
--   AND NOT EXISTS (SELECT 1 FROM x d WHERE d.f = x.f AND d.ch = x.ch AND d.date_day = x.date_day AND d.k <> x.k
--                   AND d.cn = x.cn AND ROUND(d.s, 2) = ROUND(x.s, 2) AND d.i = x.i AND x.i >= 20)
-- GROUP BY 1;   -- expect pf 1128, soc 887, sea 943

EXECUTE IMMEDIATE $$
DECLARE
  map_added INTEGER;
  prog_updated INTEGER;
  social_updated INTEGER;
  search_updated INTEGER;
BEGIN
  BEGIN TRANSACTION;

  -- 1. Map rows for PACING_FACT (DV360, Taboola, CM360) and SOCIAL_PACING_FACT (Meta) entities
  MERGE INTO ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP t
  USING (
    SELECT column1 AS channel, column2 AS platform_line_item_id, column3 AS line_item_id,
           column4 AS line_item_name, column5 AS mba_number, column6 AS notes
    FROM VALUES
      ('Programmatic - Video',    '745187f1d084133e97e2f3177cc5099f', 'challen005pv1', 'youtube challenger - finance', 'challen005', 'RL90 2026-10-20: C2'),
      ('Programmatic - Video',    '6f7d5f9ce7fc761285909c4e6fce5229', 'challen005pv1', 'youtube challenger - health', 'challen005', 'RL90 2026-10-20: C2'),
      ('Programmatic - Display',  '49845708', 'boss006pd1', 'Boss_Traffic_Agriculture_Native_Jul26', 'boss006', 'RL90 2026-10-20: C2'),
      ('Ad Serving - CM360',      'molicare-mens_the_leak-channelfactory-rich_media_display-1x1--5drops', 'hartm017dd1', 'molicare-mens_the_leak-channelfactory-rich_media_display-1x1--5drops', 'hartm017', 'RL90 2026-10-20: c'),
      ('Ad Serving - CM360',      'molicare-mens_the_leak-channelfactory-rich_media_display-1x1--3drops', 'hartm017dd1', 'molicare-mens_the_leak-channelfactory-rich_media_display-1x1--3drops', 'hartm017', 'RL90 2026-10-20: c'),
      ('Ad Serving - CM360',      'molicare-mens_the_leak-channelfactory-rich_media_display-1x1--2drops', 'hartm017dd1', 'molicare-mens_the_leak-channelfactory-rich_media_display-1x1--2drops', 'hartm017', 'RL90 2026-10-20: c'),
      ('Ad Serving - CM360',      'boss_engineering-boss automotive - july/august-dv360-display-300x250-csa-bau', 'boss005pd2', 'boss_engineering-boss automotive - july/august-dv360-display-300x250-csa-bau', 'boss005', 'RL90 2026-10-20: c'),
      ('Ad Serving - CM360',      'boss_engineering-boss automotive - july/august-dv360-display-300x600-csa-bau', 'boss005pd2', 'boss_engineering-boss automotive - july/august-dv360-display-300x600-csa-bau', 'boss005', 'RL90 2026-10-20: c'),
      ('Ad Serving - CM360',      'boss_engineering-boss automotive - july/august-dv360-display-728x90-csa-bau', 'boss005pd2', 'boss_engineering-boss automotive - july/august-dv360-display-728x90-csa-bau', 'boss005', 'RL90 2026-10-20: c'),
      ('Ad Serving - CM360',      'boss_engineering-boss automotive - july/august-dv360-display-970x250-csa-bau', 'boss005pd2', 'boss_engineering-boss automotive - july/august-dv360-display-970x250-csa-bau', 'boss005', 'RL90 2026-10-20: c'),
      ('Ad Serving - CM360',      'boss_engineering-boss automotive - july/august-dv360-display-320x50-csa-bau', 'boss005pd2', 'boss_engineering-boss automotive - july/august-dv360-display-320x50-csa-bau', 'boss005', 'RL90 2026-10-20: c'),
      ('Ad Serving - CM360',      'penfolds-grange_hero-yahoo-video-30sec-mixin-chapter_one', 'penfold018pv2', 'penfolds-grange_hero-yahoo-video-30sec-mixin-chapter_one', 'penfold018', 'RL90 2026-10-20: c'),
      ('Ad Serving - CM360',      'penfolds-grange_hero-yahoo-video-15sec-mixin-chapter_one', 'penfold018pv2', 'penfolds-grange_hero-yahoo-video-15sec-mixin-chapter_one', 'penfold018', 'RL90 2026-10-20: c'),
      ('Ad Serving - CM360',      'penfolds-grange_hero-yahoo-video-15sec-mixin-chapter_two', 'penfold018pv2', 'penfolds-grange_hero-yahoo-video-15sec-mixin-chapter_two', 'penfold018', 'RL90 2026-10-20: c'),
      ('Ad Serving - CM360',      'penfolds-grange_hero-yahoo-video-30sec-mixin-chapter_two', 'penfold018pv2', 'penfolds-grange_hero-yahoo-video-30sec-mixin-chapter_two', 'penfold018', 'RL90 2026-10-20: c'),
      ('Ad Serving - CM360',      'penfolds-grange_hero-gumgum-high_impact_display-1x1--velocity', 'penfold018dd1', 'penfolds-grange_hero-gumgum-high_impact_display-1x1--velocity', 'penfold018', 'RL90 2026-10-20: c'),
      ('Ad Serving - CM360',      'penfolds-grange_hero-gumgum-high_impact_display-1x1--superskins', 'penfold018dd1', 'penfolds-grange_hero-gumgum-high_impact_display-1x1--superskins', 'penfold018', 'RL90 2026-10-20: c'),
      ('Ad Serving - CM360',      'penfolds-grange_hero-gumgum-high_impact_display-1x1--hangtime', 'penfold018dd1', 'penfolds-grange_hero-gumgum-high_impact_display-1x1--hangtime', 'penfold018', 'RL90 2026-10-20: c'),
      ('Ad Serving - CM360',      'penfolds-grange_hero-7plus-bvod-1920x1080--30sec', 'penfold018dv1', 'penfolds-grange_hero-7plus-bvod-1920x1080--30sec', 'penfold018', 'RL90 2026-10-20: c'),
      ('Ad Serving - CM360',      'pga-champs_fy27-newscorp-standard_display-728x90--champs_desktop-ppgaaus015dd16', 'pgaaus015dd16', 'PGA-Champs_fy27-NewsCorp-Standard_Display-728x90--Champs_Desktop-PPGAAUS015DD16', 'pgaaus015', 'RL90 2026-10-20: b'),
      ('Social - Meta',           '120250169080330224', 'jayco017sm6', 'INTEREST-TAS-P35+-jayco017SM4', 'jayco017', 'RL90 2026-10-20: b+c'),
      ('Social - Meta',           '120250169080360224', 'jayco017sm7', 'INTEREST-NT-P35+-jayco017SM5', 'jayco017', 'RL90 2026-10-20: b+c'),
      ('Social - Meta',           '120250202535440542', 'hartm014sm1', 'BROAD-P35+-AUS-hartm014', 'hartm014', 'RL90 2026-10-20: b'),
      ('Social - Meta',           '120251219637010542', 'hartm014sm1', 'BROAD-P35+-AUS-hartm014', 'hartm014', 'RL90 2026-10-20: b'),
      ('Social - Meta',           '120249628737600542', 'hartm014sm1', 'Test - BROAD-P35+-AUS-hartm014', 'hartm014', 'RL90 2026-10-20: b'),
      ('Social - Meta',           '120249567126250542', 'hartm014sm1', 'BROAD-P35+-AUS-hartm014', 'hartm014', 'RL90 2026-10-20: b'),
      ('Social - Meta',           '120244481681020542', 'hartm012sm1', 'BROAD-P35+-AUS-hartm012', 'hartm012', 'RL90 2026-10-20: b'),
      ('Social - Meta',           '120244477003380542', 'hartm012sm1', 'BROAD-P35+-AUS-hartm012', 'hartm012', 'RL90 2026-10-20: b'),
      ('Social - Meta',           '52609130756286', 'pgaaus016sm1', 'Academy-AU-Golf Interest-Sandringham', 'pgaaus016', 'RL90 2026-10-20: C2'),
      ('Social - Meta',           '52609138761286', 'pgaaus016sm1', 'Academy-AU-Golf Interest-Sandhurst', 'pgaaus016', 'RL90 2026-10-20: C2'),
      ('Social - Meta',           '52615822267686', 'pgaaus016sm1', 'Academy-AU-Retargeting-Sandringham', 'pgaaus016', 'RL90 2026-10-20: C2'),
      ('Social - Meta',           '52615821918686', 'pgaaus016sm1', 'Academy-AU-Retargeting-Sandhurst', 'pgaaus016', 'RL90 2026-10-20: C2'),
      ('Social - Meta',           '120242229721160113', 'buxton004sm1', 'Mordialloc-VIC-GEO-buxton0041', 'buxton004', 'RL90 2026-10-20: b'),
      ('Social - Meta',           '120244852193820325', 'pgaaus014sm1', 'Institute-AU-SchoolLeavers-PGAAUS014SM1', 'pgaaus014', 'RL90 2026-10-20: a'),
      ('Social - Meta',           '120244852697410325', 'pgaaus014sm1', 'Institute-AU-Career Changers-PGAAUS014SM1', 'pgaaus014', 'RL90 2026-10-20: a'),
      ('Social - Meta',           '120246464967840540', 'golf031sm1', 'MyGolf-AU-AOPromo_Burst1-golf030SM1', 'golf031', 'RL90 2026-10-20: b')
  ) s
  ON LOWER(TRIM(t.channel)) = LOWER(s.channel) AND LOWER(TRIM(t.platform_line_item_id)) = s.platform_line_item_id
  WHEN MATCHED THEN UPDATE SET line_item_id = s.line_item_id, line_item_name = s.line_item_name, is_active = TRUE,
    mba_number = s.mba_number, notes = COALESCE(t.notes || ' | ', '') || s.notes, updated_at = CURRENT_TIMESTAMP()
  WHEN NOT MATCHED THEN INSERT (channel, platform_line_item_id, line_item_id, line_item_name, is_active, notes, created_at, updated_at, mba_number)
    VALUES (s.channel, s.platform_line_item_id, s.line_item_id, s.line_item_name, TRUE, s.notes,
            CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), s.mba_number);
  map_added := SQLROWCOUNT;

  -- 2. PACING_FACT history from the RL90 map rows, 2026, skipping exact duplicate rows
  UPDATE ASSEMBLEDVIEW.MART.PACING_FACT f
  SET line_item_id = s.tgt, updated_at = CURRENT_TIMESTAMP()
  FROM (
    SELECT p.channel, p.date_day, LOWER(TRIM(p.platform_line_item_id)) AS k, m.line_item_id AS tgt
    FROM ASSEMBLEDVIEW.MART.PACING_FACT p
    JOIN ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP m
      ON m.is_active AND m.notes LIKE '%RL90 2026-10-20%'
     AND LOWER(TRIM(m.channel)) = LOWER(TRIM(p.channel))
     AND LOWER(TRIM(m.platform_line_item_id)) = LOWER(TRIM(p.platform_line_item_id))
    WHERE p.date_day >= '2026-01-01'
      AND COALESCE(LOWER(p.line_item_id), '') <> m.line_item_id
      AND NOT EXISTS (SELECT 1 FROM ASSEMBLEDVIEW.MART.PACING_FACT d
                      WHERE d.channel = p.channel AND d.date_day = p.date_day
                        AND LOWER(TRIM(d.platform_line_item_id)) <> LOWER(TRIM(p.platform_line_item_id))
                        AND d.campaign_name = p.campaign_name
                        AND ROUND(d.amount_spent, 2) = ROUND(p.amount_spent, 2) AND d.impressions = p.impressions
                        AND p.impressions >= 20)
  ) s
  WHERE f.channel = s.channel AND f.date_day = s.date_day
    AND LOWER(TRIM(f.platform_line_item_id)) = s.k;
  prog_updated := SQLROWCOUNT;

  -- 3. SOCIAL_PACING_FACT history from the RL90 map rows (key falls back to ENTITY_ID
  --    where PLATFORM_LINE_ITEM_ID is blank). PGA Institute ad sets from 1 May only.
  UPDATE ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT f
  SET line_item_id = s.tgt, updated_at = CURRENT_TIMESTAMP()
  FROM (
    SELECT p.channel, p.date_day, LOWER(TRIM(COALESCE(NULLIF(TRIM(p.platform_line_item_id), ''), p.entity_id::STRING))) AS k,
           m.line_item_id AS tgt
    FROM ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT p
    JOIN ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP m
      ON m.is_active AND m.notes LIKE '%RL90 2026-10-20%'
     AND LOWER(TRIM(m.channel)) = LOWER(TRIM(p.channel))
     AND LOWER(TRIM(m.platform_line_item_id)) = LOWER(TRIM(COALESCE(NULLIF(TRIM(p.platform_line_item_id), ''), p.entity_id::STRING)))
    LEFT JOIN (SELECT column1 AS k, column2::DATE AS from_date FROM VALUES ('120244852193820325', '2026-05-01'), ('120244852697410325', '2026-05-01')) fl
      ON fl.k = LOWER(TRIM(m.platform_line_item_id))
    WHERE p.date_day >= COALESCE(fl.from_date, '2026-01-01'::DATE)
      AND COALESCE(LOWER(p.line_item_id), '') <> m.line_item_id
      AND NOT EXISTS (SELECT 1 FROM ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT d
                      WHERE d.channel = p.channel AND d.date_day = p.date_day
                        AND COALESCE(NULLIF(TRIM(d.platform_line_item_id), ''), d.entity_id::STRING) <> COALESCE(NULLIF(TRIM(p.platform_line_item_id), ''), p.entity_id::STRING)
                        AND d.campaign_name = p.campaign_name
                        AND ROUND(d.amount_spent, 2) = ROUND(p.amount_spent, 2) AND d.impressions = p.impressions
                        AND p.impressions >= 20)
  ) s
  WHERE f.channel = s.channel AND f.date_day = s.date_day
    AND LOWER(TRIM(COALESCE(NULLIF(TRIM(f.platform_line_item_id), ''), f.entity_id::STRING))) = s.k;
  social_updated := SQLROWCOUNT;

  -- 4. SEARCH_PACING_FACT history by explicit ad group / asset group id (no map for search)
  UPDATE ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT f
  SET line_item_id = s.tgt, updated_at = CURRENT_TIMESTAMP()
  FROM (
    SELECT p.channel, p.date_day, p.platform_line_item_id AS k, v.tgt
    FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT p
    JOIN (SELECT column1 AS channel, column2 AS k, column3 AS tgt, column4::DATE AS from_date FROM VALUES
      ('Search - Google Ads', '198018494587', 'pgaaus014se1', '2026-05-01'),
      ('Search - Google Ads', '198018494787', 'pgaaus014se1', '2026-05-01'),
      ('Search - Google Ads', '198018494827', 'pgaaus014se1', '2026-05-01'),
      ('Search - Google Ads', '198018494627', 'pgaaus014se1', '2026-05-01'),
      ('Search - Google Ads', '198018494867', 'pgaaus014se1', '2026-05-01'),
      ('Search - Google Ads', '198018494547', 'pgaaus014se1', '2026-05-01'),
      ('Search - Google Ads', '201436824192', 'assembled001se1', '2026-01-01'),
      ('Search - Google Ads', '202425989964', 'assembled001se4', '2026-01-01'),
      ('Search - Google Ads', '201519583180', 'assembled001se3', '2026-01-01'),
      ('Search - Google Ads', '197759896301', 'assembled001se5', '2026-01-01'),
      ('Search - Google Ads', '207560961744', 'assembled001se2', '2026-01-01')
    ) v ON v.channel = p.channel AND v.k = LOWER(TRIM(p.platform_line_item_id))
    WHERE p.date_day >= v.from_date
      AND COALESCE(LOWER(p.line_item_id), '') <> v.tgt
      AND NOT EXISTS (SELECT 1 FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT d
                      WHERE d.channel = p.channel AND d.date_day = p.date_day
                        AND LOWER(TRIM(d.platform_line_item_id)) <> LOWER(TRIM(p.platform_line_item_id))
                        AND d.campaign_name = p.campaign_name
                        AND ROUND(d.amount_spent, 2) = ROUND(p.amount_spent, 2) AND d.impressions = p.impressions
                        AND p.impressions >= 20)
  ) s
  WHERE f.channel = s.channel AND f.date_day = s.date_day AND f.platform_line_item_id = s.k;
  search_updated := SQLROWCOUNT;

  -- Expected: map 36 / prog 1128 / social 887 / search 943. Anything else rolls back.
  IF (map_added <> 36 OR prog_updated <> 1128 OR social_updated <> 887 OR search_updated <> 943) THEN
    ROLLBACK;
    RETURN 'ROLLED BACK: counts differ. map=' || map_added || ' prog=' || prog_updated
      || ' social=' || social_updated || ' search=' || search_updated;
  END IF;

  COMMIT;
  RETURN 'OK map=' || map_added || ' prog=' || prog_updated || ' social=' || social_updated || ' search=' || search_updated;
END;
$$;

-- ----- After: per client, 2026, on the RL90 target lines ----------------------
-- Expected spend (from the measurement, allow cents of drift from tonight's refresh):
--   challen005pv1 10,997.47 | boss006pd1 2,167.37 | boss005pd2 5,516.87 (unchanged, CM360 adds impressions only)
--   jayco017sm6 6,778.68 | jayco017sm7 423.28 | hartm014sm1 6,924.71 | hartm012sm1 6,119.60
--   pgaaus016sm1 7,996.49 | pgaaus014sm1 18,432.16 (8,685.54 + 9,746.62) | buxton004sm1 3,257.83
--   golf031sm1 414.73 | pgaaus014se1 8,631.41 | assembled001se1 144.32 (se2-se5 0.00, impressions only)
--   CM360 impressions moved: hartm017dd1 136,398 | boss005pd2 803,819 | penfold018pv2 1,485,045
--   (1,513,243 less 28,198 on the 4 duplicate rows) | penfold018dd1 927,819 | penfold018dv1 983,207 | pgaaus015dd16 2,111
-- SELECT CASE WHEN LOWER(line_item_id) LIKE 'challen%' THEN 'Challenger' WHEN LOWER(line_item_id) LIKE 'boss%' THEN 'Boss Engineering'
--   WHEN LOWER(line_item_id) LIKE 'hartm%' THEN 'Paul Hartmann' WHEN LOWER(line_item_id) LIKE 'jayco%' THEN 'Jayco'
--   WHEN LOWER(line_item_id) LIKE 'pgaaus%' THEN 'PGA Australia' WHEN LOWER(line_item_id) LIKE 'buxton%' THEN 'LDS Property'
--   WHEN LOWER(line_item_id) LIKE 'golf%' THEN 'Golf Australia' WHEN LOWER(line_item_id) LIKE 'penfold%' THEN 'Penfolds'
--   ELSE 'Assembled Media' END client, f, channel, LOWER(line_item_id) lid, COUNT(*) n, ROUND(SUM(s), 2) spend, SUM(i) imps
-- FROM (SELECT 'prog' f, channel, line_item_id, amount_spent s, impressions i FROM PACING_FACT WHERE date_day >= '2026-01-01'
--       UNION ALL SELECT 'social', channel, line_item_id, amount_spent, impressions FROM SOCIAL_PACING_FACT WHERE date_day >= '2026-01-01'
--       UNION ALL SELECT 'search', channel, line_item_id, amount_spent, impressions FROM SEARCH_PACING_FACT WHERE date_day >= '2026-01-01')
-- WHERE LOWER(line_item_id) IN ('challen005pv1','boss006pd1','boss005pd2','hartm017dd1','hartm012sm1','hartm014sm1',
--   'jayco017sm6','jayco017sm7','pgaaus016sm1','pgaaus014sm1','pgaaus014se1','pgaaus015dd16','buxton004sm1','golf031sm1',
--   'penfold018pv2','penfold018dd1','penfold018dv1','assembled001se1','assembled001se2','assembled001se3','assembled001se4','assembled001se5')
-- GROUP BY 1, 2, 3, 4 ORDER BY 1, 4, 3;
-- And: SELECT COUNT(*) FROM LINE_ITEM_LABEL_MAP WHERE notes LIKE '%RL90 2026-10-20%';   -- expect 36
--
-- ----- Still to do in the platforms (search does not read the map) -----------
-- Rename these live ad groups so the 14-day search refresh keeps the label:
--   Google Ads 3390941707 PGA_Conversions_Institute_Search_April26: 'golf education', 'pga program',
--     'pga certification', 'golf certification', 'pure brand', 'sports management'  -> append -pgaaus014se1
--   Google Ads 7372785560 'Ad group 1' in Assembled Media - Search - Australia -> -assembled001se1,
--     Singapore -> -assembled001se2, Hong Kong -> -assembled001se3, America -> -assembled001se4,
--     London -> -assembled001se5
-- Optional platform renames (the map already covers these): Meta ad sets ending jayco017SM4 / SM5 -> sm6 / sm7,
-- hartm012 / hartm014 -> hartm012sm1 / hartm014sm1, buxton0041 -> buxton004sm1, golf030SM1 -> golf031sm1;
-- CM360 placement ...-ppgaaus015dd16 -> ...-pgaaus015dd16.
