-- FCM-2: "Broadsheet - AM", the direct (Assembled Media billed) Broadsheet publisher.
-- Supabase project slpdibnxtpdlttbbczvg. Luke runs this by hand. Read-only checks first.
-- RUN by Luke 27 Oct 2026: created #85 "Broadsheet - AM" (assembled media, financecode NULL,
-- digital display, digital video and integration on). Do not run again (it aborts: name taken).
-- Nothing in this file edits a media plan, a line item or a version.
--
-- Why
--   Broadsheet bills us both directly (Xero contact "Broadsheet Media Pty Ltd": Feb 2026
--   15,000; Jul 2026 19,400 "7894 - Penfolds - Special Shiraz - Fathers Day") and through
--   Advertising Associates (Aug 2026 19,250 and Sep 2026 8,250, PENFOLD016). Luke, 27 Oct
--   (Q8a): a direct bill matches a direct publisher, never the AA one. The two existing
--   Broadsheet rows (#33 G.Digital, #62 G.NEWSPAPER) are both 'advertising associates'.
--   The fixed cost margin report (Finance > Publishers > Fixed cost margin) matches
--   "Broadsheet Media" bills to this publisher once it exists
--   (lib/finance/sections/fixedCostMargin/bills/suppliers.ts DIRECT_SUPPLIERS). Until then
--   those bill lines show as unmatched ("no direct publisher set up").
--
-- Measured 2026-10-27 (read-only SELECTs)
--   publishers: 81 rows (39 advertising associates, 42 assembled media), max(id) 83.
--   FB-9 (2026-10-26_fb9_production_publishers_aa_SUPABASE.sql) is not run yet; it adds
--   Vogue. This file works before or after FB-9 (it counts rows at run time).
--   No publisher has name or publisherid "Broadsheet - AM" (trimmed, case-insensitive).
--   #33 Broadsheet: pub_digidisplay, pub_digivideo, pub_integration true; comms 10 on each.
--
-- CHECK BEFORE RUNNING (Luke)
--   1. financecode is left NULL (#33 uses G.Digital, an AA code; direct publishers use
--      digi3004 or D.* codes). Set it in Publishers.
--   2. Channel flags copy #33 (digital display, digital video, content integration) so the
--      publisher shows in those pickers. Comms are left 0; #33 has 10 on each. Set them in
--      Publishers if the direct deal has commission.
--   3. Existing lines that should be direct stay on "Broadsheet" (published versions are
--      immutable). New lines pick "Broadsheet - AM".
--
-- Run order
--   1. BEFORE (SELECT only).
--   2. DO block. Aborts unless exactly 1 row is inserted and the name is free.
--   3. AFTER (SELECT only).

-- 1. BEFORE
SELECT id, publisher_name, publisherid, publishertype, billingagency, financecode,
       pub_digidisplay, pub_digivideo, pub_integration
FROM publishers
WHERE lower(trim(publisher_name)) LIKE 'broadsheet%' OR lower(trim(publisherid)) LIKE 'broadsheet%'
ORDER BY id;
-- Expected: 2 rows, #33 and #62, both advertising associates. No "Broadsheet - AM".

SELECT billingagency, count(*) AS publishers FROM publishers GROUP BY 1 ORDER BY 1;
-- Expected: advertising associates 39, assembled media 42 (81 in all). If FB-9 ran first:
-- advertising associates 41, assembled media 41 (82 in all).

-- 2. DO block
DO $$
DECLARE
  v_total_before integer;
  v_am_before    integer;
  v_count        integer;
  v_rows         integer;
BEGIN
  SELECT count(*) INTO v_total_before FROM publishers;
  IF v_total_before NOT IN (81, 82) THEN
    RAISE EXCEPTION 'Abort: expected 81 publishers (82 after FB-9), found %. Re-run BEFORE and review.',
      v_total_before;
  END IF;
  SELECT count(*) INTO v_am_before FROM publishers WHERE billingagency = 'assembled media';

  -- Uniqueness rule: name and publisherid unique, trimmed, case-insensitive.
  SELECT count(*) INTO v_count FROM publishers
  WHERE lower(trim(publisher_name)) = 'broadsheet - am' OR lower(trim(publisherid)) = 'broadsheet - am';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Abort: % publishers already use "Broadsheet - AM" as name or id', v_count;
  END IF;

  -- The AA Broadsheet rows this mirrors must be as measured.
  SELECT count(*) INTO v_count FROM publishers
  WHERE id IN (33, 62) AND lower(trim(publisher_name)) = 'broadsheet' AND billingagency = 'advertising associates';
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Abort: expected #33 and #62 Broadsheet on advertising associates, found %', v_count;
  END IF;

  INSERT INTO publishers (publisher_name, publisherid, publishertype, billingagency, financecode,
    pub_television, pub_radio, pub_newspaper, pub_magazines, pub_ooh, pub_cinema,
    pub_digidisplay, pub_digiaudio, pub_digivideo, pub_bvod, pub_integration, pub_search,
    pub_socialmedia, pub_progdisplay, pub_progvideo, pub_progbvod, pub_progaudio,
    pub_progooh, pub_influencers)
  VALUES ('Broadsheet - AM', 'Broadsheet - AM', 'direct', 'assembled media', NULL,
    false, false, false, false, false, false,
    true, false, true, false, true, false,
    false, false, false, false, false, false, false);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Abort: inserted % rows, expected 1', v_rows;
  END IF;

  SELECT count(*) INTO v_count FROM publishers;
  IF v_count <> v_total_before + 1 THEN
    RAISE EXCEPTION 'Abort: publishers now %, expected %', v_count, v_total_before + 1;
  END IF;
  SELECT count(*) INTO v_count FROM publishers WHERE billingagency = 'assembled media';
  IF v_count <> v_am_before + 1 THEN
    RAISE EXCEPTION 'Abort: assembled media publishers now %, expected %', v_count, v_am_before + 1;
  END IF;
  SELECT count(*) INTO v_count FROM publishers
  WHERE lower(trim(publisher_name)) = 'broadsheet - am' AND billingagency = 'assembled media';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Abort: expected 1 "Broadsheet - AM" on assembled media, found %', v_count;
  END IF;

  RAISE NOTICE 'Done. Inserted "Broadsheet - AM" (assembled media). No line items changed.';
END $$;

-- 3. AFTER
SELECT id, publisher_name, publisherid, publishertype, billingagency, financecode,
       pub_digidisplay, pub_digivideo, pub_integration
FROM publishers
WHERE lower(trim(publisher_name)) LIKE 'broadsheet%'
ORDER BY id;
-- Expected: 3 rows. #33, #62 advertising associates; new "Broadsheet - AM" assembled
-- media (id 84, or 85 if FB-9 ran first, while the sequence is unchanged).

SELECT billingagency, count(*) AS publishers FROM publishers GROUP BY 1 ORDER BY 1;
-- Expected: assembled media one more than BEFORE; advertising associates unchanged.
