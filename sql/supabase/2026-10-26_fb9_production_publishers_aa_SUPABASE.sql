-- FB-9: production publishers for Advertising Associates routing.
-- Supabase project slpdibnxtpdlttbbczvg. Luke runs this by hand. Read-only checks first.
-- Nothing in this file edits a media plan, a line item or a version.
--
-- Why
--   Production lines took a free-text publisher before the picker (48f72271, 20 Oct).
--   AA routing (AA media plan workbook, AA billing cycle, finance G./D. production split)
--   matches that text to publishers.publisher_name, trimmed and case-insensitive, then a
--   read-time alias, then publishers.publisherid (lib/publisher/resolvePublisherName.ts).
--   Text that matches nothing counts as Assembled Media, so the line misses AA.
--
-- Why no line edits (published versions are immutable)
--   Published versions refuse writes (assertVersionMutable, VERSION_PUBLISHED_IMMUTABLE,
--   docs/brain/INVARIANTS.md). Their approved_slice and snapshot_checksum are frozen.
--   Rewriting line_items.publisher on them would break that rule, so this file does NOT
--   touch line_items. Instead:
--   - "SCA"  -> "Southern Cross Austereo" and "NOVA" -> "Nova" are a read-time alias table
--     in code (PUBLISHER_NAME_ALIASES). They already resolved before this change
--     (SCA by publisherid 'sca', NOVA by case-insensitive name), so nothing moves for them.
--   - "Go Transit", "Vicinity Group", "Vogue": Luke (26 Oct, 18:01) says all three bill via
--     Advertising Associates. This file creates them as publishers with exactly those
--     names. The stored text then matches by name. No alias and no line edit needed.
--
-- Measured 2026-10-26 (read-only SELECTs), production lines (channel 'production'), all versions
--   text             published lines/versions   unpublished lines/versions   MBAs
--   SCA              29 / 29                     2 / 2                        golf001, golf009, golf019, hema005, PGAAUS005, STRMEA001
--   NOVA              5 / 5                      4 / 4                        qatar003
--   Go Transit       13 / 13                     1 / 1                        TheY001
--   Vicinity Group   36 / 18                     4 / 2                        PENFOLD020
--   Vogue            16 / 13                     0 / 0                        PENFOLD013, penfold022
--   publishers: 81 rows, max(id) 83, publishers_id_seq last_value 83 (identity by default).
--   No publisher has name or publisherid "Go Transit", "Vicinity Group" or "Vogue" (trimmed,
--   case-insensitive).
--
-- CHECK BEFORE RUNNING (Luke)
--   1. "GoTranist" (#77, publisherid 'GoTransit', advertising associates, D.OOH, created
--      2026-08-07) already exists. It looks like a misspelt Go Transit. TheY001 OOH media
--      lines use it. Creating "Go Transit" as well gives two Go Transit publishers.
--      This file inserts a new "Go Transit", per your decision. Renaming #77 instead is NOT
--      offered: published TheY001 OOH media lines store the text "GoTranist", and finance
--      media lines match the exact name, so a rename would drop them from AA. If you want
--      one publisher, say so and the fix (alias or merge) gets written separately.
--   2. "Vicinity" (#65) exists with billing agency assembled media (G.OOH). "Vicinity Group"
--      is created as a separate AA publisher, as you asked. Confirm they are different.
--   3. financecode is left NULL on the new rows (existing AA rows use G.OOH, G.Print,
--      digi3004 and others). Set it in Publishers if finance needs it.
--   4. pub_* channel flags are left false and *_comms 0, so the new publishers do not appear
--      in media channel pickers. Production picks from every publisher. Tick channels in
--      Publishers if media lines should use them too.
--
-- Production lines with a blank publisher (needs a publisher picked by the planner)
--   Luke: these should be AA too, but there is no name to match. Not mapped. A planner opens
--   the plan, picks the publisher on the production line and saves (published versions
--   then cut a new version).
--   Blank text '' (20 lines since 2026-08-01):
--     hartm015   PROD1  v5, v6, v7, v9, v10, v11 (published), v8 (unpublished, approved)
--     hartm017   PROD2  v1, v2, v3, v4, v5 (published; v5 booked)
--     PENFOLD018 PROD1  v26 (published), v22, v23, v24, v25 (unpublished; booked/approved)
--     penfold026 PROD1  v2, v3 (published)
--     TheY001    PROD1  v3 (published)
--   NULL publisher (27 lines, migrated 2026-08-03, older Xano ids '<mba>-production-v<id>-p1'):
--     BOSS006 v1, v3, v5, v6, v7, v10, v11, v12, v14 (unpublished drafts); bowel001 v1;
--     candel003 v1 (draft), v2; CHALLEN003 v1; golf009 v7, v8; hartm002 v1; krusty001 v1;
--     PENFOLD006 v1; PENFOLD013 v1, v2; PENFOLD018 v15 to v21.
--
-- Other production text that matches no publisher (not in the brief, not changed, Luke to decide)
--   "API Charge" (candel001, 12), "Newscorp" (CHALLEN004, 2; publisher "News Corp" #26 exists),
--   "oOh!" (PENFOLD018, 3; "oOh! media" #43 exists), "SBS on Demand" (PENFOLD014, 4; "SBS" #9
--   exists), "test" (glenda001, glenda005). Add an alias in code or pick on the plan if wanted.
--
-- After running
--   Stored AA media plan files were built before these publishers existed. Rebuild them:
--     npm run docs:backfill -- --refresh-before <time you ran this, ISO UTC> --kinds aa_media_plan
--   (dry run first; add --apply to write). Finance views read publishers live (60s cache).
--
-- Run order
--   1. BEFORE (SELECT only). Check the counts match the table above.
--   2. DO block. Aborts unless the counts match.
--   3. AFTER (SELECT only).

-- 1. BEFORE: production text by MBA and publication, and whether it resolves to a publisher.
SELECT
  li.publisher                               AS production_text,
  v.mba_number,
  (v.published_at IS NOT NULL)               AS published,
  count(*)                                   AS lines,
  count(DISTINCT v.id)                       AS versions,
  (SELECT p.publisher_name FROM publishers p
    WHERE lower(trim(p.publisher_name)) = lower(trim(li.publisher))
    ORDER BY p.id LIMIT 1)                   AS matches_name
FROM line_items li
JOIN media_plan_versions v ON v.id = li.version_id
WHERE li.channel = 'production'
  AND li.publisher IN ('SCA', 'NOVA', 'Go Transit', 'Vicinity Group', 'Vogue')
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;
-- Expected: SCA 31 lines over 6 MBAs, NOVA 9 (qatar003), Go Transit 14 (TheY001),
-- Vicinity Group 40 (PENFOLD020), Vogue 16 (PENFOLD013 13, penfold022 3). matches_name NULL
-- except NOVA -> Nova.

-- 1b. BEFORE: the publishers involved.
SELECT id, publisher_name, publisherid, publishertype, billingagency, financecode
FROM publishers
WHERE lower(trim(publisher_name)) IN ('southern cross austereo', 'nova', 'vicinity', 'gotranist',
                                      'go transit', 'vicinity group', 'vogue')
   OR lower(trim(publisherid)) IN ('sca', 'nova', 'vicinity', 'gotransit', 'go transit',
                                   'vicinity group', 'vogue')
ORDER BY id;
-- Expected: #12 Southern Cross Austereo, #20 Nova, #65 Vicinity, #77 GoTranist. No others.

-- 1c. BEFORE: blank production publishers since 1 Aug (planner to pick).
SELECT v.mba_number, v.version_number, (v.published_at IS NOT NULL) AS published,
       v.campaign_status, li.line_item_id,
       CASE WHEN li.publisher IS NULL THEN 'NULL' ELSE 'blank' END AS publisher_state
FROM line_items li
JOIN media_plan_versions v ON v.id = li.version_id
WHERE li.channel = 'production'
  AND li.created_at >= '2026-08-01'
  AND coalesce(trim(li.publisher), '') = ''
ORDER BY publisher_state, v.mba_number, v.version_number;
-- Expected: 20 blank, 27 NULL.

-- 2. DO block: create the three AA publishers.
DO $$
DECLARE
  c_expected_publishers CONSTANT integer := 81;
  c_expected_lines_go   CONSTANT integer := 14;
  c_expected_lines_vg   CONSTANT integer := 40;
  c_expected_lines_vo   CONSTANT integer := 16;
  v_count   integer;
  v_rows    integer;
  v_inserted integer := 0;
  v_name    text;
BEGIN
  SELECT count(*) INTO v_count FROM publishers;
  IF v_count <> c_expected_publishers THEN
    RAISE EXCEPTION 'Abort: expected % publishers, found %. Re-run BEFORE and review.',
      c_expected_publishers, v_count;
  END IF;

  -- Uniqueness rule: name and publisherid unique, trimmed, case-insensitive.
  SELECT count(*) INTO v_count FROM publishers
  WHERE lower(trim(publisher_name)) IN ('go transit', 'vicinity group', 'vogue')
     OR lower(trim(publisherid))    IN ('go transit', 'vicinity group', 'vogue');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Abort: % publishers already use Go Transit / Vicinity Group / Vogue as name or id', v_count;
  END IF;

  -- Line counts this mapping relies on. No lines are changed, so more lines (a newer
  -- version saved since 26 Oct) is fine; fewer means the text changed. Re-measure then.
  SELECT count(*) INTO v_count FROM line_items WHERE channel = 'production' AND publisher = 'Go Transit';
  IF v_count < c_expected_lines_go THEN
    RAISE EXCEPTION 'Abort: expected at least % Go Transit production lines, found %', c_expected_lines_go, v_count;
  END IF;
  SELECT count(*) INTO v_count FROM line_items WHERE channel = 'production' AND publisher = 'Vicinity Group';
  IF v_count < c_expected_lines_vg THEN
    RAISE EXCEPTION 'Abort: expected at least % Vicinity Group production lines, found %', c_expected_lines_vg, v_count;
  END IF;
  SELECT count(*) INTO v_count FROM line_items WHERE channel = 'production' AND publisher = 'Vogue';
  IF v_count < c_expected_lines_vo THEN
    RAISE EXCEPTION 'Abort: expected at least % Vogue production lines, found %', c_expected_lines_vo, v_count;
  END IF;

  FOREACH v_name IN ARRAY ARRAY['Go Transit', 'Vicinity Group', 'Vogue'] LOOP
    INSERT INTO publishers (publisher_name, publisherid, publishertype, billingagency, financecode,
      pub_television, pub_radio, pub_newspaper, pub_magazines, pub_ooh, pub_cinema,
      pub_digidisplay, pub_digiaudio, pub_digivideo, pub_bvod, pub_integration, pub_search,
      pub_socialmedia, pub_progdisplay, pub_progvideo, pub_progbvod, pub_progaudio,
      pub_progooh, pub_influencers)
    VALUES (v_name, v_name, 'direct', 'advertising associates', NULL,
      false, false, false, false, false, false, false, false, false, false, false, false,
      false, false, false, false, false, false, false);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_inserted := v_inserted + v_rows;
  END LOOP;

  IF v_inserted <> 3 THEN
    RAISE EXCEPTION 'Abort: inserted % publishers, expected 3', v_inserted;
  END IF;

  SELECT count(*) INTO v_count FROM publishers;
  IF v_count <> c_expected_publishers + v_inserted THEN
    RAISE EXCEPTION 'Abort: publishers now %, expected %', v_count, c_expected_publishers + v_inserted;
  END IF;

  -- Every target name now resolves to exactly one AA publisher.
  SELECT count(*) INTO v_count FROM publishers
  WHERE lower(trim(publisher_name)) IN ('go transit', 'vicinity group', 'vogue')
    AND billingagency = 'advertising associates';
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Abort: expected 3 AA publishers named Go Transit / Vicinity Group / Vogue, found %', v_count;
  END IF;

  RAISE NOTICE 'Done. Inserted % publishers (Go Transit, Vicinity Group, Vogue). No line items changed.', v_inserted;
END $$;

-- 3. AFTER: every mapped production text now resolves by name to an AA publisher.
SELECT
  li.publisher                 AS production_text,
  p.id                         AS publisher_id,
  p.publisher_name,
  p.billingagency,
  count(*)                     AS lines
FROM line_items li
LEFT JOIN publishers p ON lower(trim(p.publisher_name)) = lower(trim(li.publisher))
WHERE li.channel = 'production'
  AND li.publisher IN ('Go Transit', 'Vicinity Group', 'Vogue', 'NOVA')
GROUP BY 1, 2, 3, 4
ORDER BY 1;
-- Expected: Go Transit 14, Vicinity Group 40, Vogue 16 -> new AA rows; NOVA 9 -> #20 Nova.
-- SCA is resolved in code (alias), not by name, so it is not listed here.

-- 3b. AFTER: no duplicate publisher names or ids (case and spaces ignored).
SELECT 'name' AS field, lower(trim(publisher_name)) AS key, count(*) FROM publishers
GROUP BY 2 HAVING count(*) > 1
UNION ALL
SELECT 'publisherid', lower(trim(publisherid)), count(*) FROM publishers
WHERE coalesce(trim(publisherid), '') <> ''
GROUP BY 2 HAVING count(*) > 1;
-- Expected (measured 2026-10-26): names broadsheet, nine, miff, mixin, are media (2 each);
-- ids broadsheet, nine, miff, mixin, link (2 each). Nothing new.
