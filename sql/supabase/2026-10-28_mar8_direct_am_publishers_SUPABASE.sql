-- MAR-8: direct "- AM" publishers for Nova, Are Media, Leba, Linkby and News Corp.
-- Supabase project slpdibnxtpdlttbbczvg. Luke runs this by hand in the SQL Editor.
-- Same pattern as 2026-10-27_fcm2_broadsheet_am_publisher_SUPABASE.sql ("Broadsheet - AM", #85).
-- Nothing in this file edits a media plan, a line item or a version.
--
-- Why
--   Luke, 28 Oct 2026 (backlog decision 12): yes to direct "- AM" publishers for Nova,
--   Are Media, Leba, Linkby and News Corp. These suppliers sometimes bill us directly
--   (Xero contacts "Nova c/o Polar Mobile Group Inc", "Are Media Pty Ltd (Advertising)",
--   "Leba", "Linkby Pty Ltd", "News Pty Limited") while their existing publishers are
--   all 'advertising associates'. A direct bill matches the direct publisher, never the
--   AA one (Luke, 27 Oct, Q8). The fixed cost margin report maps those contacts to these
--   names (lib/finance/sections/fixedCostMargin/bills/suppliers.ts DIRECT_SUPPLIERS).
--   Until this runs, those bill lines stay "no direct publisher set up".
--
-- Measured 2026-10-28 (read-only SELECTs)
--   publishers: 83 rows (41 advertising associates, 42 assembled media), max(id) 85.
--   No publisher has name or publisherid "Nova - AM", "Are Media - AM", "Leba - AM",
--   "Linkby - AM" or "News Corp - AM" (trimmed, case-insensitive).
--   Source rows (all 'direct', 'advertising associates'):
--     #18 Leba       radio, newspaper, OOH, BVOD
--     #20 Nova       radio, digital audio, programmatic audio
--     #22 Linkby     digital display, integration, programmatic display
--     #26 News Corp  newspaper, magazines, digital display, digital video, integration, social
--     #41 "ARE Media " (trailing space) magazines, digital display, digital video
--     #48 Are Media  newspaper, digital display
--   Are Media has two AA rows (DQ-1 duplicate). "Are Media - AM" takes the union of both
--   rows' channel flags (newspaper, magazines, digital display, digital video).
--
-- What it inserts (5 rows)
--   publisher_name = publisherid = '<name> - AM', publishertype 'direct',
--   billingagency 'assembled media', financecode NULL, channel flags copied from the
--   matching AA row at run time. Comms and rate defaults are left at the table default.
--
-- CHECK BEFORE RUNNING (Luke)
--   1. financecode is left NULL on all five (same as "Broadsheet - AM"). Set it in Publishers.
--   2. Comms are not copied (the AA rows carry 10 on some channels). Set them in Publishers
--      if a direct deal has commission.
--   3. Existing lines stay on the AA publisher (published versions are immutable). New lines
--      that are bought direct pick the "- AM" publisher.
--
-- Run order
--   1. BEFORE (SELECT only).
--   2. DO block. Aborts unless the counts are as measured, the five names are free and
--      exactly 5 rows are inserted.
--   3. AFTER (SELECT only).

-- 1. BEFORE
SELECT id, publisher_name, publisherid, publishertype, billingagency, financecode
FROM publishers
WHERE id IN (18, 20, 22, 26, 41, 48)
   OR lower(trim(publisher_name)) LIKE '% - am'
ORDER BY id;
-- Expected: #18 Leba, #20 Nova, #22 Linkby, #26 News Corp, #41 "ARE Media ", #48 Are Media
-- (all advertising associates), plus the existing "- AM" rows (#3 Google Ads - AM, #6 Bing - AM,
-- #8 ChatGPT - AM, #54 ARN - AM, #85 Broadsheet - AM). None of the five new names.

SELECT billingagency, count(*) AS publishers FROM publishers GROUP BY 1 ORDER BY 1;
-- Expected: advertising associates 41, assembled media 42 (83 in all).

-- 2. DO block
DO $$
DECLARE
  v_total_before integer;
  v_am_before    integer;
  v_aa_before    integer;
  v_count        integer;
  v_rows         integer;
  v_inserted     integer := 0;
BEGIN
  SELECT count(*) INTO v_total_before FROM publishers;
  SELECT count(*) INTO v_am_before FROM publishers WHERE billingagency = 'assembled media';
  SELECT count(*) INTO v_aa_before FROM publishers WHERE billingagency = 'advertising associates';
  IF v_total_before <> 83 OR v_am_before <> 42 OR v_aa_before <> 41 THEN
    RAISE EXCEPTION 'Abort: expected 83 publishers (42 assembled media, 41 advertising associates), found % (%, %). Re-run BEFORE and review.',
      v_total_before, v_am_before, v_aa_before;
  END IF;

  -- Uniqueness rule: name and publisherid unique, trimmed, case-insensitive.
  SELECT count(*) INTO v_count FROM publishers
  WHERE lower(trim(publisher_name)) IN ('nova - am', 'are media - am', 'leba - am', 'linkby - am', 'news corp - am')
     OR lower(trim(publisherid))    IN ('nova - am', 'are media - am', 'leba - am', 'linkby - am', 'news corp - am');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Abort: % publishers already use one of the five "- AM" names as name or id', v_count;
  END IF;

  -- The AA rows the flags are copied from must be as measured.
  SELECT count(*) INTO v_count FROM publishers
  WHERE billingagency = 'advertising associates'
    AND ((id = 18 AND lower(trim(publisher_name)) = 'leba')
      OR (id = 20 AND lower(trim(publisher_name)) = 'nova')
      OR (id = 22 AND lower(trim(publisher_name)) = 'linkby')
      OR (id = 26 AND lower(trim(publisher_name)) = 'news corp')
      OR (id = 41 AND lower(trim(publisher_name)) = 'are media')
      OR (id = 48 AND lower(trim(publisher_name)) = 'are media'));
  IF v_count <> 6 THEN
    RAISE EXCEPTION 'Abort: expected source rows #18, #20, #22, #26, #41, #48 on advertising associates, found %', v_count;
  END IF;

  -- One insert per publisher. Flags copied from the AA row(s) at run time.
  INSERT INTO publishers (publisher_name, publisherid, publishertype, billingagency, financecode,
    pub_television, pub_radio, pub_newspaper, pub_magazines, pub_ooh, pub_cinema,
    pub_digidisplay, pub_digiaudio, pub_digivideo, pub_bvod, pub_integration, pub_search,
    pub_socialmedia, pub_progdisplay, pub_progvideo, pub_progbvod, pub_progaudio,
    pub_progooh, pub_influencers)
  SELECT s.new_name, s.new_name, 'direct', 'assembled media', NULL,
    bool_or(COALESCE(p.pub_television, false)), bool_or(COALESCE(p.pub_radio, false)),
    bool_or(COALESCE(p.pub_newspaper, false)), bool_or(COALESCE(p.pub_magazines, false)),
    bool_or(COALESCE(p.pub_ooh, false)), bool_or(COALESCE(p.pub_cinema, false)),
    bool_or(COALESCE(p.pub_digidisplay, false)), bool_or(COALESCE(p.pub_digiaudio, false)),
    bool_or(COALESCE(p.pub_digivideo, false)), bool_or(COALESCE(p.pub_bvod, false)),
    bool_or(COALESCE(p.pub_integration, false)), bool_or(COALESCE(p.pub_search, false)),
    bool_or(COALESCE(p.pub_socialmedia, false)), bool_or(COALESCE(p.pub_progdisplay, false)),
    bool_or(COALESCE(p.pub_progvideo, false)), bool_or(COALESCE(p.pub_progbvod, false)),
    bool_or(COALESCE(p.pub_progaudio, false)), bool_or(COALESCE(p.pub_progooh, false)),
    bool_or(COALESCE(p.pub_influencers, false))
  FROM (VALUES
      ('Leba - AM', 18), ('Nova - AM', 20), ('Linkby - AM', 22), ('News Corp - AM', 26),
      ('Are Media - AM', 41), ('Are Media - AM', 48)
    ) AS s(new_name, source_id)
  JOIN publishers p ON p.id = s.source_id
  GROUP BY s.new_name
  ORDER BY s.new_name;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_inserted := v_rows;
  IF v_inserted <> 5 THEN
    RAISE EXCEPTION 'Abort: inserted % rows, expected 5', v_inserted;
  END IF;

  -- AFTER checks inside the block. Any failure rolls the whole block back.
  SELECT count(*) INTO v_count FROM publishers;
  IF v_count <> v_total_before + 5 THEN
    RAISE EXCEPTION 'Abort: publishers now %, expected %', v_count, v_total_before + 5;
  END IF;
  SELECT count(*) INTO v_count FROM publishers WHERE billingagency = 'assembled media';
  IF v_count <> v_am_before + 5 THEN
    RAISE EXCEPTION 'Abort: assembled media publishers now %, expected %', v_count, v_am_before + 5;
  END IF;
  SELECT count(*) INTO v_count FROM publishers WHERE billingagency = 'advertising associates';
  IF v_count <> v_aa_before THEN
    RAISE EXCEPTION 'Abort: advertising associates publishers now %, expected % (unchanged)', v_count, v_aa_before;
  END IF;
  SELECT count(*) INTO v_count FROM publishers
  WHERE lower(trim(publisher_name)) IN ('nova - am', 'are media - am', 'leba - am', 'linkby - am', 'news corp - am')
    AND publisher_name = publisherid
    AND publishertype = 'direct'
    AND billingagency = 'assembled media'
    AND financecode IS NULL;
  IF v_count <> 5 THEN
    RAISE EXCEPTION 'Abort: expected 5 new "- AM" rows on assembled media, found %', v_count;
  END IF;

  RAISE NOTICE 'Done. Inserted 5 direct "- AM" publishers (assembled media). No line items changed.';
END $$;

-- 3. AFTER
SELECT id, publisher_name, publisherid, publishertype, billingagency, financecode,
       pub_radio, pub_newspaper, pub_magazines, pub_ooh, pub_bvod, pub_digidisplay, pub_digiaudio,
       pub_digivideo, pub_integration, pub_socialmedia, pub_progdisplay, pub_progaudio
FROM publishers
WHERE lower(trim(publisher_name)) IN ('nova - am', 'are media - am', 'leba - am', 'linkby - am', 'news corp - am')
ORDER BY publisher_name;
-- Expected: 5 rows (ids 86 to 90 while the sequence is unchanged), all direct, assembled media,
-- financecode NULL. Flags:
--   Are Media - AM  newspaper, magazines, digital display, digital video
--   Leba - AM       radio, newspaper, OOH, BVOD
--   Linkby - AM     digital display, integration, programmatic display
--   News Corp - AM  newspaper, magazines, digital display, digital video, integration, social
--   Nova - AM       radio, digital audio, programmatic audio

SELECT billingagency, count(*) AS publishers FROM publishers GROUP BY 1 ORDER BY 1;
-- Expected: advertising associates 41, assembled media 47 (88 in all).
