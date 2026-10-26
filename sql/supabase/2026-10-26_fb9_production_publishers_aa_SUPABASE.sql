-- FB-9: Vogue as an AA publisher, and Vicinity (#65) to Advertising Associates.
-- Supabase project slpdibnxtpdlttbbczvg. Luke runs this by hand. Read-only checks first.
-- Nothing in this file edits a media plan, a line item or a version.
--
-- Why
--   Production lines took a free-text publisher before the picker (48f72271, 20 Oct).
--   AA routing (AA media plan workbook, AA billing cycle, finance G./D. split for media
--   and production) matches that text to publishers.publisher_name, trimmed and
--   case-insensitive, lowest id, then a read-time alias, then publishers.publisherid
--   (lib/publisher/resolvePublisherName.ts). Text that matches nothing counts as
--   Assembled Media, so the line misses AA.
--
-- Luke's decisions (26 Oct 2026, 20:33 and 20:34)
--   - "Go Transit": NOT created. Code alias "Go Transit" -> "GoTranist" (#77, AA,
--     publisherid 'GoTransit'). No SQL needed.
--   - "Vicinity Group": NOT created. Code alias "Vicinity Group" -> "Vicinity" (#65).
--   - Vicinity (#65) bills through Advertising Associates. This file sets #65
--     billingagency to 'advertising associates' (only while it is 'assembled media').
--   - "Vogue": created here as a new AA publisher.
--   - SCA and NOVA stay code aliases (no SQL).
--
-- Why no line edits (published versions are immutable)
--   Published versions refuse writes (assertVersionMutable, VERSION_PUBLISHED_IMMUTABLE,
--   docs/brain/INVARIANTS.md). Their approved_slice and snapshot_checksum are frozen, so
--   this file does NOT touch line_items. Stored text keeps resolving by name or alias.
--
-- Measured 2026-10-26 evening (read-only SELECTs)
--   publishers: 81 rows (39 advertising associates, 42 assembled media), max(id) 83,
--   publishers_id_seq last_value 83 (identity by default).
--   No publisher has name or publisherid "Vogue" (trimmed, case-insensitive).
--   #65 Vicinity: publisherid 'Vicinity', billingagency 'assembled media', financecode G.OOH.
--   Production text, all versions:
--     text             lines   versions   MBAs
--     Vogue            16      13         PENFOLD013, penfold022
--     Vicinity Group   40      20         PENFOLD020
--     Go Transit       14      14         TheY001
--   Media lines on Vicinity (network/publisher/platform "Vicinity"): 54 lines over 27
--   versions, all PENFOLD020.
--
-- What moves when #65 becomes AA (live published versions; billing basis)
--   Only PENFOLD020 (v29, approved, live) uses Vicinity. No October amount moves.
--     Month      Line                              Was        Now        Amount
--     Nov 2026   PENFOLD020PROD5 Vicinity Group    D.Production  G.Production   552.44
--     Dec 2026   PENFOLD020OH9   Vicinity (OOH)    D.OOH      G.OOH      35,890.29
--     Dec 2026   PENFOLD020PROD4 Vicinity Group    D.Production  G.Production 4,306.00
--     Dec 2026   PENFOLD020PROD5 Vicinity Group    D.Production  G.Production 4,281.37
--     Jan 2027   PENFOLD020OH9   Vicinity (OOH)    D.OOH      G.OOH       5,981.71
--     Jan 2027   PENFOLD020PROD5 Vicinity Group    D.Production  G.Production 3,728.94
--   PENFOLD020OH10 (Vicinity) has no schedule months. Totals do not change, only the
--   G./D. codes. No finance_billing_line_items and no AA pack items exist for these yet.
--   PENFOLD020 is already on the AA plan (Cartology, JCDecaux, Motto, Jolt, oOh! media,
--   Revolution 360, Nine, Broadsheet), so the Vicinity rows join that workbook.
--
-- CHECK BEFORE RUNNING (Luke)
--   1. Vogue: financecode is left NULL (existing AA rows use G.OOH, G.Print, digi3004 and
--      others). Set it in Publishers if finance needs it.
--   2. Vogue: pub_* channel flags are left false and *_comms 0, so it does not appear in
--      media channel pickers. Production picks from every publisher. Tick channels in
--      Publishers if media lines should use it too.
--   3. #65 financecode stays G.OOH (already a G. code). Not changed here.
--
-- After running
--   - Finance G./D. codes change for Vicinity lines (media and production) from the next
--     read. Finance views read publishers live (60s cache).
--   - Stored AA media plan files were built before this change. Rebuild them:
--       npm run docs:backfill -- --refresh-before <time you ran this, ISO UTC> --kinds aa_media_plan
--     (dry run first; add --apply to write).
--
-- Run order
--   1. BEFORE (SELECT only). Check the counts match the expected lines.
--   2. DO block. Aborts unless the counts match.
--   3. AFTER (SELECT only).

-- 1. BEFORE: the publishers involved.
SELECT id, publisher_name, publisherid, publishertype, billingagency, financecode
FROM publishers
WHERE id IN (65, 77)
   OR lower(trim(publisher_name)) IN ('vogue', 'vicinity', 'vicinity group', 'go transit', 'gotranist')
   OR lower(trim(publisherid))    IN ('vogue', 'vicinity', 'vicinity group', 'go transit', 'gotransit')
ORDER BY id;
-- Expected: 2 rows. #65 Vicinity (assembled media, G.OOH), #77 GoTranist (advertising
-- associates, D.OOH). No Vogue.

-- 1b. BEFORE: publisher totals by billing agency.
SELECT billingagency, count(*) AS publishers FROM publishers GROUP BY 1 ORDER BY 1;
-- Expected: advertising associates 39, assembled media 42 (81 in all).

-- 1c. BEFORE: production text this file relies on.
SELECT li.publisher AS production_text, v.mba_number,
       count(*) AS lines, count(DISTINCT v.id) AS versions
FROM line_items li
JOIN media_plan_versions v ON v.id = li.version_id
WHERE li.channel = 'production'
  AND li.publisher IN ('Vogue', 'Vicinity Group')
GROUP BY 1, 2
ORDER BY 1, 2;
-- Expected: Vicinity Group PENFOLD020 40 / 20; Vogue PENFOLD013 13 / 10 and
-- penfold022 3 / 3 (Vogue 16 lines, 13 versions in all).

-- 2. DO block: create Vogue (AA) and move #65 Vicinity to AA.
DO $$
DECLARE
  c_expected_publishers CONSTANT integer := 81;
  c_expected_aa         CONSTANT integer := 39;
  c_expected_lines_vo   CONSTANT integer := 16;
  c_expected_lines_vg   CONSTANT integer := 40;
  v_count    integer;
  v_rows     integer;
BEGIN
  SELECT count(*) INTO v_count FROM publishers;
  IF v_count <> c_expected_publishers THEN
    RAISE EXCEPTION 'Abort: expected % publishers, found %. Re-run BEFORE and review.',
      c_expected_publishers, v_count;
  END IF;

  SELECT count(*) INTO v_count FROM publishers WHERE billingagency = 'advertising associates';
  IF v_count <> c_expected_aa THEN
    RAISE EXCEPTION 'Abort: expected % AA publishers, found %', c_expected_aa, v_count;
  END IF;

  -- Uniqueness rule: name and publisherid unique, trimmed, case-insensitive.
  SELECT count(*) INTO v_count FROM publishers
  WHERE lower(trim(publisher_name)) = 'vogue' OR lower(trim(publisherid)) = 'vogue';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Abort: % publishers already use Vogue as name or id', v_count;
  END IF;

  -- #65 must be exactly the Vicinity row, still on Assembled Media.
  SELECT count(*) INTO v_count FROM publishers
  WHERE id = 65 AND lower(trim(publisher_name)) = 'vicinity' AND billingagency = 'assembled media';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Abort: expected 1 row #65 Vicinity on assembled media, found %', v_count;
  END IF;

  -- Line counts this relies on. No lines are changed, so more lines (a newer version
  -- saved since 26 Oct) is fine; fewer means the text changed. Re-measure then.
  SELECT count(*) INTO v_count FROM line_items WHERE channel = 'production' AND publisher = 'Vogue';
  IF v_count < c_expected_lines_vo THEN
    RAISE EXCEPTION 'Abort: expected at least % Vogue production lines, found %', c_expected_lines_vo, v_count;
  END IF;
  SELECT count(*) INTO v_count FROM line_items WHERE channel = 'production' AND publisher = 'Vicinity Group';
  IF v_count < c_expected_lines_vg THEN
    RAISE EXCEPTION 'Abort: expected at least % Vicinity Group production lines, found %', c_expected_lines_vg, v_count;
  END IF;

  INSERT INTO publishers (publisher_name, publisherid, publishertype, billingagency, financecode,
    pub_television, pub_radio, pub_newspaper, pub_magazines, pub_ooh, pub_cinema,
    pub_digidisplay, pub_digiaudio, pub_digivideo, pub_bvod, pub_integration, pub_search,
    pub_socialmedia, pub_progdisplay, pub_progvideo, pub_progbvod, pub_progaudio,
    pub_progooh, pub_influencers)
  VALUES ('Vogue', 'Vogue', 'direct', 'advertising associates', NULL,
    false, false, false, false, false, false, false, false, false, false, false, false,
    false, false, false, false, false, false, false);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Abort: inserted % Vogue rows, expected 1', v_rows;
  END IF;

  UPDATE publishers
  SET billingagency = 'advertising associates'
  WHERE id = 65 AND lower(trim(publisher_name)) = 'vicinity' AND billingagency = 'assembled media';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Abort: updated % rows for #65 Vicinity, expected 1', v_rows;
  END IF;

  SELECT count(*) INTO v_count FROM publishers;
  IF v_count <> c_expected_publishers + 1 THEN
    RAISE EXCEPTION 'Abort: publishers now %, expected %', v_count, c_expected_publishers + 1;
  END IF;

  SELECT count(*) INTO v_count FROM publishers WHERE billingagency = 'advertising associates';
  IF v_count <> c_expected_aa + 2 THEN
    RAISE EXCEPTION 'Abort: AA publishers now %, expected %', v_count, c_expected_aa + 2;
  END IF;

  SELECT count(*) INTO v_count FROM publishers
  WHERE ((lower(trim(publisher_name)) = 'vogue') OR id = 65)
    AND billingagency = 'advertising associates';
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Abort: expected Vogue and #65 on AA, found %', v_count;
  END IF;

  RAISE NOTICE 'Done. Inserted Vogue (AA). #65 Vicinity now advertising associates. No line items changed.';
END $$;

-- 3. AFTER: the publishers involved.
SELECT id, publisher_name, publisherid, publishertype, billingagency, financecode
FROM publishers
WHERE id IN (65, 77) OR lower(trim(publisher_name)) = 'vogue'
ORDER BY id;
-- Expected: 3 rows. #65 Vicinity advertising associates (G.OOH), #77 GoTranist
-- advertising associates, new Vogue advertising associates (id 84 if the sequence is
-- still at 83).

-- 3b. AFTER: publisher totals by billing agency.
SELECT billingagency, count(*) AS publishers FROM publishers GROUP BY 1 ORDER BY 1;
-- Expected: advertising associates 41, assembled media 41 (82 in all).

-- 3c. AFTER: Vogue production text now resolves by name to an AA publisher.
SELECT li.publisher AS production_text, p.id AS publisher_id, p.publisher_name,
       p.billingagency, count(*) AS lines
FROM line_items li
LEFT JOIN publishers p ON lower(trim(p.publisher_name)) = lower(trim(li.publisher))
WHERE li.channel = 'production' AND li.publisher = 'Vogue'
GROUP BY 1, 2, 3, 4;
-- Expected: Vogue 16 -> the new AA row. Vicinity Group (40) and Go Transit (14) resolve
-- in code through the alias, not by name, so they are not listed here.

-- 3d. AFTER: no duplicate publisher names or ids (case and spaces ignored).
SELECT 'name' AS field, lower(trim(publisher_name)) AS key, count(*) FROM publishers
GROUP BY 2 HAVING count(*) > 1
UNION ALL
SELECT 'publisherid', lower(trim(publisherid)), count(*) FROM publishers
WHERE coalesce(trim(publisherid), '') <> ''
GROUP BY 2 HAVING count(*) > 1;
-- Expected (measured 2026-10-26): names broadsheet, nine, miff, mixin, are media (2 each);
-- ids broadsheet, nine, miff, mixin, link (2 each). Nothing new.
