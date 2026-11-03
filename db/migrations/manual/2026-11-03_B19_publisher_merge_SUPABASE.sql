-- =============================================================================
-- 2026-11-03  B19 / DQ-1: merge the five duplicate publisher pairs, give Linkby
--             its own publisherid, then add the unique name and id rules
-- Target: Supabase (project slpdibnxtpdlttbbczvg). Run in the Supabase SQL editor.
-- Author: Claude for Luke. NOT RUN. Luke runs every step by hand, in order.
-- Decision: P13 (2 Nov 2026), Q5 (1 Nov 2026). Supersedes running
--   db/migrations/manual/2026-10-23_publishers_unique_name_and_id_SUPABASE.sql
--   on its own (step 3 below creates the same two indexes, same names).
--
-- What P13 says
--   - Merge Broadsheet 33/62, MIFF 51/60, MixIn 58/59, Nine 11/61, ARE Media 41/48.
--   - The per-channel finance code on the merged-away row is lost (Luke accepted).
--   - Linkby (22) and LinkedIn (37) share publisherid "link": Linkby gets its own.
--   - Then the unique rule, so duplicates can't come back.
--
-- Survivor rule: the LOWER id survives (11, 33, 41, 51, 58).
--   - Every name lookup in the app already picks the lowest id when a name is
--     shared (lib/publisher/resolvePublisherName.ts, its SQL twin
--     lib/finance/sections/publisherIdentitySql.ts). AA routing, the AA
--     workbook, the finance G./D. split, the forecast and the investment cut
--     all read the lower id today. Keeping it means no billing, finance code,
--     commission or AA result moves.
--   - The only foreign key rows on any of the ten ids point at 11 (one
--     publisher_specs row). The merged-away ids have no foreign key rows.
--   - Finance code kept: 11 digi3004 (61 had G.Digtal), 33 G.Digital (62 had
--     G.NEWSPAPER), 41 digi3004 (48 had G.Print), 51 G.INTERGRATION (60 had
--     G.CINEMA), 58 G.OOH (59 had D.POOH). Billing agency agrees inside every pair.
--
-- How every other table refers to a publisher (read-only map, 3 Nov 2026)
--   Foreign keys to publishers.id (8): client_notes, publisher_profiles,
--     ingest_runs, publisher_specs (RESTRICT), spec_runs (RESTRICT),
--     publisher_domains, publisher_value_synonyms, ingest_eval_runs.
--     Rows pointing at 61, 62, 48, 60, 59: 0 in all eight. Repointed anyway
--     (no-ops today) so the step stays right if that changes; the guard stops
--     the run if the count is no longer 0.
--   By name (text, trimmed and case-insensitive in every reader):
--     line_items.publisher / platform / attrs network, site, station;
--     campaign_kpi.publisher; client_kpi; finance_billing_line_items;
--     reference lists tv_stations, radio_stations, newspapers, magazines
--     (network) and the *_site tables (platform). The pairs share a name, so
--     these keep matching the survivor. Not rewritten: published versions are
--     immutable, and the readers ignore case and spaces.
--     One case-sensitive reader: the Magazines container filters titles with
--     an exact trimmed compare. magazines rows 2, 3, 4 say "ARE Media"; the
--     survivor is renamed "Are Media" (see below), so those three move with it.
--   By publisherid code: publisher_kpi.publisher holds either a name or a
--     publisherid (lib/kpi/matching.ts). Survivor codes keep every KPI row
--     matching ("nine" by code, "Nine" by name; "aremed" by code, "Are Media"
--     by name). The 36 "link" rows: 21 are social / socialMedia (LinkedIn,
--     stay "link"); 15 are digital display, integration and programmatic
--     display (Linkby's channels exactly), moved to "linkby".
--   Inside JSON: no publisher id or code in any jsonb column (line_items attrs
--     and bursts, version snapshots, fee snapshots, drafts, finance runs,
--     pacing, billing revisions). Checked by regex on every jsonb column.
--   Snowflake: nothing synced by publisher id. Xero mappings use names only.
--
-- Survivor fields
--   - Channel flags: the union of both rows, so each publisher stays in every
--     channel picker it was in (Broadsheet newspaper, ARE Media newspaper,
--     MIFF cinema, MixIn programmatic OOH; Nine adds nothing).
--   - Colour: the survivor's, else the merged-away row's (MIFF gets #f21c1c).
--   - Name: trimmed. 41 "ARE Media " becomes "Are Media": every stored plan
--     line (line_items publisher and attrs network), the publisher_kpi name
--     rows, the newspapers and display_site rows and the "Are Media - AM" row
--     spell it that way. Want "ARE Media" instead? Change v_are_media_name in
--     step 2 and drop the magazines update.
--   - Commission (*_comms), type, finance code, best practice: the survivor's.
--     MixIn stays "direct" (59 was internal_biddable; type only changes the
--     forecast bucket for direct digital channels, not programmatic OOH).
--     Optional step 2b copies the merged-away row's commission for the one
--     channel only it covered. Not run by default: it would change forecast
--     commission numbers.
--
-- Run order
--   0. Required: backups (creates b19_backup_* tables). The step 5 undo needs
--      them, and step 2 aborts without them. Run steps 0 to 4 in one sitting.
--   1. Preview (read-only). Compare with the "Expect" lines.
--   2. Merge (one transaction). Aborts and changes nothing unless the data
--      still matches the preview.
--   2b. Optional commission copy (read the note first).
--   3. Unique rules (own transaction). Aborts while any duplicate remains.
--   4. Verify (read-only).
--   5. Rollback notes.
--   Code order: the B19 code can deploy before or after this file. The
--   publisher_guard switch stays off until this has run (see the B19 notes).
--   The server publisher list is cached for up to 10 minutes per instance:
--   wait 10 minutes (or redeploy) before editing publishers after step 2.
-- =============================================================================


-- =============================================================================
-- STEP 0. Backups (required). Run once, before step 2. The step 5 undo needs them.
-- RLS is turned on so the tables are not readable through the public API.
-- Drop them once you're happy (statements at the end of step 5).
-- =============================================================================
BEGIN;
CREATE TABLE public.b19_backup_publishers_20261103 AS
  SELECT * FROM public.publishers;
CREATE TABLE public.b19_backup_publisher_kpi_20261103 AS
  SELECT * FROM public.publisher_kpi WHERE lower(btrim(publisher)) = 'link';
CREATE TABLE public.b19_backup_magazines_20261103 AS
  SELECT * FROM public.magazines WHERE lower(btrim(network)) = 'are media';
CREATE TABLE public.b19_backup_publisher_fk_rows_20261103 AS
  SELECT 'client_notes'::text AS tbl, id::bigint AS row_id, publisher_id::bigint AS publisher_id FROM public.client_notes WHERE publisher_id IN (61, 62, 48, 60, 59)
  UNION ALL SELECT 'publisher_profiles', id, publisher_id FROM public.publisher_profiles WHERE publisher_id IN (61, 62, 48, 60, 59)
  UNION ALL SELECT 'ingest_runs', id, publisher_id FROM public.ingest_runs WHERE publisher_id IN (61, 62, 48, 60, 59)
  UNION ALL SELECT 'publisher_specs', id, publisher_id FROM public.publisher_specs WHERE publisher_id IN (61, 62, 48, 60, 59)
  UNION ALL SELECT 'spec_runs', id, publisher_id FROM public.spec_runs WHERE publisher_id IN (61, 62, 48, 60, 59)
  UNION ALL SELECT 'publisher_domains', id, publisher_id FROM public.publisher_domains WHERE publisher_id IN (61, 62, 48, 60, 59)
  UNION ALL SELECT 'publisher_value_synonyms', id, publisher_id FROM public.publisher_value_synonyms WHERE publisher_id IN (61, 62, 48, 60, 59)
  UNION ALL SELECT 'ingest_eval_runs', id, publisher_id FROM public.ingest_eval_runs WHERE publisher_id IN (61, 62, 48, 60, 59);
ALTER TABLE public.b19_backup_publishers_20261103 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b19_backup_publisher_kpi_20261103 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b19_backup_magazines_20261103 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b19_backup_publisher_fk_rows_20261103 ENABLE ROW LEVEL SECURITY;
COMMIT;

SELECT
  (SELECT count(*) FROM public.b19_backup_publishers_20261103) AS publishers_rows,
  (SELECT count(*) FROM public.b19_backup_publisher_kpi_20261103) AS kpi_rows,
  (SELECT count(*) FROM public.b19_backup_magazines_20261103) AS magazine_rows,
  (SELECT count(*) FROM public.b19_backup_publisher_fk_rows_20261103) AS fk_rows;
-- Expect 88 | 36 | 3 | 0 (publishers can be higher if someone added one since 3 Nov).


-- =============================================================================
-- STEP 1. Preview (read-only)
-- =============================================================================

-- 1a. The twelve rows. "role" says what step 2 does to each.
SELECT p.id,
       CASE WHEN p.id IN (11, 33, 41, 51, 58) THEN 'survives'
            WHEN p.id IN (61, 62, 48, 60, 59) THEN 'merged away, deleted'
            WHEN p.id = 22 THEN 'publisherid link -> linkby'
            ELSE 'untouched' END AS role,
       '"' || p.publisher_name || '"' AS name,
       '"' || p.publisherid || '"' AS publisherid,
       p.publishertype, p.billingagency, p.financecode, p.publisher_colour,
       concat_ws(',',
         CASE WHEN p.pub_television THEN 'tv' END, CASE WHEN p.pub_radio THEN 'radio' END,
         CASE WHEN p.pub_newspaper THEN 'newspaper' END, CASE WHEN p.pub_magazines THEN 'magazines' END,
         CASE WHEN p.pub_ooh THEN 'ooh' END, CASE WHEN p.pub_cinema THEN 'cinema' END,
         CASE WHEN p.pub_digidisplay THEN 'digidisplay' END, CASE WHEN p.pub_digiaudio THEN 'digiaudio' END,
         CASE WHEN p.pub_digivideo THEN 'digivideo' END, CASE WHEN p.pub_bvod THEN 'bvod' END,
         CASE WHEN p.pub_integration THEN 'integration' END, CASE WHEN p.pub_search THEN 'search' END,
         CASE WHEN p.pub_socialmedia THEN 'social' END, CASE WHEN p.pub_progdisplay THEN 'progdisplay' END,
         CASE WHEN p.pub_progvideo THEN 'progvideo' END, CASE WHEN p.pub_progbvod THEN 'progbvod' END,
         CASE WHEN p.pub_progaudio THEN 'progaudio' END, CASE WHEN p.pub_progooh THEN 'progooh' END,
         CASE WHEN p.pub_influencers THEN 'influencers' END) AS channels
FROM public.publishers p
WHERE p.id IN (11, 61, 33, 62, 41, 48, 51, 60, 58, 59, 22, 37)
ORDER BY CASE p.id WHEN 61 THEN 11 WHEN 62 THEN 33 WHEN 48 THEN 41 WHEN 60 THEN 51 WHEN 59 THEN 58 ELSE p.id END, p.id;
-- Expect (3 Nov 2026):
--   11 survives  "Nine"        "nine"        direct  AA  digi3004       #3bccff  tv,newspaper,magazines,digidisplay,digiaudio,digivideo,bvod,social
--   61 deleted   "Nine "       "Nine"        direct  AA  G.Digtal                digidisplay,digivideo
--   22 link->linkby "Linkby"   "link"        direct  AA  digi3004                digidisplay,integration,progdisplay
--   33 survives  "Broadsheet"  "Broadsheet"  direct  AA  G.Digital               digidisplay,digivideo,integration
--   62 deleted   "Broadsheet"  "Broadsheet"  direct  AA  G.NEWSPAPER             newspaper
--   37 untouched "LinkedIn"    "link"        internal_biddable AM digi3004       social
--   41 survives  "ARE Media "  "aremed"      direct  AA  digi3004                magazines,digidisplay,digivideo
--   48 deleted   "Are Media"   "Are Media"   direct  AA  G.Print                 newspaper,digidisplay
--   51 survives  "MIFF"        "MIFF"        direct  AM  G.INTERGRATION          integration
--   60 deleted   "MIFF"        "MIFF"        direct  AM  G.CINEMA       #f21c1c  cinema
--   58 survives  "MixIn"       "MixIn"       direct  AM  G.OOH          #d52a8e  ooh
--   59 deleted   "MixIn"       "MixIn"       internal_biddable AM D.POOH          progooh

-- 1b. Foreign key rows that point at a merged-away id (step 2 repoints them).
SELECT 'client_notes' AS tbl, publisher_id, count(*) AS n FROM public.client_notes WHERE publisher_id IN (61, 62, 48, 60, 59) GROUP BY 2
UNION ALL SELECT 'publisher_profiles', publisher_id, count(*) FROM public.publisher_profiles WHERE publisher_id IN (61, 62, 48, 60, 59) GROUP BY 2
UNION ALL SELECT 'ingest_runs', publisher_id, count(*) FROM public.ingest_runs WHERE publisher_id IN (61, 62, 48, 60, 59) GROUP BY 2
UNION ALL SELECT 'publisher_specs', publisher_id, count(*) FROM public.publisher_specs WHERE publisher_id IN (61, 62, 48, 60, 59) GROUP BY 2
UNION ALL SELECT 'spec_runs', publisher_id, count(*) FROM public.spec_runs WHERE publisher_id IN (61, 62, 48, 60, 59) GROUP BY 2
UNION ALL SELECT 'publisher_domains', publisher_id, count(*) FROM public.publisher_domains WHERE publisher_id IN (61, 62, 48, 60, 59) GROUP BY 2
UNION ALL SELECT 'publisher_value_synonyms', publisher_id, count(*) FROM public.publisher_value_synonyms WHERE publisher_id IN (61, 62, 48, 60, 59) GROUP BY 2
UNION ALL SELECT 'ingest_eval_runs', publisher_id, count(*) FROM public.ingest_eval_runs WHERE publisher_id IN (61, 62, 48, 60, 59) GROUP BY 2;
-- Expect 0 rows.

-- 1c. Text rows step 2 changes.
SELECT 'publisher_kpi link -> linkby (Linkby channels)' AS change, count(*) AS n
FROM public.publisher_kpi WHERE publisher = 'link' AND media_type NOT IN ('social', 'socialMedia')
UNION ALL
SELECT 'publisher_kpi link kept (LinkedIn social)', count(*)
FROM public.publisher_kpi WHERE publisher = 'link' AND media_type IN ('social', 'socialMedia')
UNION ALL
SELECT 'magazines network ARE Media -> Are Media', count(*)
FROM public.magazines WHERE network = 'ARE Media'
UNION ALL
SELECT 'publishers already using linkby (other than 22)', count(*)
FROM public.publishers WHERE id <> 22 AND (lower(btrim(publisherid)) = 'linkby' OR lower(btrim(publisher_name)) = 'linkby');
-- Expect 15 | 21 | 3 | 0

-- 1d. Duplicates across the whole table (step 3 needs both lists empty after step 2).
SELECT 'name' AS field, lower(btrim(publisher_name)) AS k, string_agg(id::text, ',' ORDER BY id) AS ids
FROM public.publishers WHERE coalesce(btrim(publisher_name), '') <> ''
GROUP BY 2 HAVING count(*) > 1
UNION ALL
SELECT 'publisherid', lower(btrim(publisherid)), string_agg(id::text, ',' ORDER BY id)
FROM public.publishers WHERE coalesce(btrim(publisherid), '') <> ''
GROUP BY 2 HAVING count(*) > 1
ORDER BY 1, 2;
-- Expect before step 2 (exactly these, nothing else):
--   name are media 41,48 | name broadsheet 33,62 | name miff 51,60 | name mixin 58,59 | name nine 11,61
--   publisherid broadsheet 33,62 | link 22,37 | miff 51,60 | mixin 58,59 | nine 11,61


-- =============================================================================
-- STEP 2. Merge (one transaction, all or nothing)
-- Any RAISE EXCEPTION rolls the whole transaction back. COMMIT then reports
-- ROLLBACK and nothing has changed.
-- =============================================================================
BEGIN;

DO $$
DECLARE
  v_are_media_name constant text := 'Are Media';
  v_linkby_code    constant text := 'linkby';
  r       record;
  n       int;
  v_fk    int;
BEGIN
  -- The marker first, so a rerun after the backups are dropped still says
  -- the merge already ran (B23fix).
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = 'b19_publisher_merge') THEN
    RAISE EXCEPTION 'Aborted: marker b19_publisher_merge exists, the merge already ran.';
  END IF;

  -- Guard 0: the step 0 backups exist (the step 5 undo needs them).
  IF to_regclass('public.b19_backup_publishers_20261103') IS NULL
     OR to_regclass('public.b19_backup_publisher_kpi_20261103') IS NULL
     OR to_regclass('public.b19_backup_magazines_20261103') IS NULL
     OR to_regclass('public.b19_backup_publisher_fk_rows_20261103') IS NULL THEN
    RAISE EXCEPTION 'Aborted, nothing changed: run step 0 first';
  END IF;

  -- Guard 1: all twelve rows exist and still look like the preview.
  FOR r IN
    SELECT * FROM (VALUES
      (11, 'nine',       'nine',       'advertising associates'),
      (61, 'nine',       'nine',       'advertising associates'),
      (33, 'broadsheet', 'broadsheet', 'advertising associates'),
      (62, 'broadsheet', 'broadsheet', 'advertising associates'),
      (41, 'are media',  'aremed',     'advertising associates'),
      (48, 'are media',  'are media',  'advertising associates'),
      (51, 'miff',       'miff',       'assembled media'),
      (60, 'miff',       'miff',       'assembled media'),
      (58, 'mixin',      'mixin',      'assembled media'),
      (59, 'mixin',      'mixin',      'assembled media'),
      (22, 'linkby',     'link',       'advertising associates'),
      (37, 'linkedin',   'link',       'assembled media')
    ) AS t(id, name_key, pid_key, agency)
  LOOP
    SELECT count(*) INTO n FROM public.publishers p
    WHERE p.id = r.id
      AND lower(btrim(p.publisher_name)) = r.name_key
      AND lower(btrim(p.publisherid)) = r.pid_key
      AND lower(btrim(p.billingagency)) = r.agency;
    IF n <> 1 THEN
      RAISE EXCEPTION 'Aborted, nothing changed: publisher #% is not "%" / "%" / % any more. Re-run step 1.',
        r.id, r.name_key, r.pid_key, r.agency;
    END IF;
  END LOOP;

  -- Guard 2: no foreign key rows on a merged-away id (0 on 3 Nov).
  SELECT (SELECT count(*) FROM public.client_notes WHERE publisher_id IN (61, 62, 48, 60, 59))
       + (SELECT count(*) FROM public.publisher_profiles WHERE publisher_id IN (61, 62, 48, 60, 59))
       + (SELECT count(*) FROM public.ingest_runs WHERE publisher_id IN (61, 62, 48, 60, 59))
       + (SELECT count(*) FROM public.publisher_specs WHERE publisher_id IN (61, 62, 48, 60, 59))
       + (SELECT count(*) FROM public.spec_runs WHERE publisher_id IN (61, 62, 48, 60, 59))
       + (SELECT count(*) FROM public.publisher_domains WHERE publisher_id IN (61, 62, 48, 60, 59))
       + (SELECT count(*) FROM public.publisher_value_synonyms WHERE publisher_id IN (61, 62, 48, 60, 59))
       + (SELECT count(*) FROM public.ingest_eval_runs WHERE publisher_id IN (61, 62, 48, 60, 59))
    INTO v_fk;
  IF v_fk <> 0 THEN
    RAISE EXCEPTION 'Aborted, nothing changed: % foreign key row(s) now point at a merged-away id (expected 0). Re-run 1b and ask Claude to check the repoint (publisher_value_synonyms has a unique scope index).', v_fk;
  END IF;

  -- Guard 3: the text rows step 2 changes.
  SELECT count(*) INTO n FROM public.publisher_kpi WHERE publisher = 'link' AND media_type NOT IN ('social', 'socialMedia');
  IF n <> 15 THEN RAISE EXCEPTION 'Aborted, nothing changed: publisher_kpi Linkby "link" rows = % (expected 15).', n; END IF;
  SELECT count(*) INTO n FROM public.publisher_kpi WHERE publisher = 'link' AND media_type IN ('social', 'socialMedia');
  IF n <> 21 THEN RAISE EXCEPTION 'Aborted, nothing changed: publisher_kpi LinkedIn "link" rows = % (expected 21).', n; END IF;
  SELECT count(*) INTO n FROM public.magazines WHERE network = 'ARE Media';
  IF n <> 3 THEN RAISE EXCEPTION 'Aborted, nothing changed: magazines "ARE Media" rows = % (expected 3).', n; END IF;
  SELECT count(*) INTO n FROM public.publishers
  WHERE id <> 22 AND (lower(btrim(publisherid)) = v_linkby_code OR lower(btrim(publisher_name)) = v_linkby_code);
  IF n <> 0 THEN RAISE EXCEPTION 'Aborted, nothing changed: publisherid "%" is already used by another publisher.', v_linkby_code; END IF;

  -- 2.1 Survivors take the union of both rows' channel flags, and the colour if they have none.
  FOR r IN SELECT * FROM (VALUES (11, 61), (33, 62), (41, 48), (51, 60), (58, 59)) AS t(keep_id, drop_id)
  LOOP
    UPDATE public.publishers s SET
      pub_television  = coalesce(s.pub_television, false)  OR coalesce(m.pub_television, false),
      pub_radio       = coalesce(s.pub_radio, false)       OR coalesce(m.pub_radio, false),
      pub_newspaper   = coalesce(s.pub_newspaper, false)   OR coalesce(m.pub_newspaper, false),
      pub_magazines   = coalesce(s.pub_magazines, false)   OR coalesce(m.pub_magazines, false),
      pub_ooh         = coalesce(s.pub_ooh, false)         OR coalesce(m.pub_ooh, false),
      pub_cinema      = coalesce(s.pub_cinema, false)      OR coalesce(m.pub_cinema, false),
      pub_digidisplay = coalesce(s.pub_digidisplay, false) OR coalesce(m.pub_digidisplay, false),
      pub_digiaudio   = coalesce(s.pub_digiaudio, false)   OR coalesce(m.pub_digiaudio, false),
      pub_digivideo   = coalesce(s.pub_digivideo, false)   OR coalesce(m.pub_digivideo, false),
      pub_bvod        = coalesce(s.pub_bvod, false)        OR coalesce(m.pub_bvod, false),
      pub_integration = coalesce(s.pub_integration, false) OR coalesce(m.pub_integration, false),
      pub_search      = coalesce(s.pub_search, false)      OR coalesce(m.pub_search, false),
      pub_socialmedia = coalesce(s.pub_socialmedia, false) OR coalesce(m.pub_socialmedia, false),
      pub_progdisplay = coalesce(s.pub_progdisplay, false) OR coalesce(m.pub_progdisplay, false),
      pub_progvideo   = coalesce(s.pub_progvideo, false)   OR coalesce(m.pub_progvideo, false),
      pub_progbvod    = coalesce(s.pub_progbvod, false)    OR coalesce(m.pub_progbvod, false),
      pub_progaudio   = coalesce(s.pub_progaudio, false)   OR coalesce(m.pub_progaudio, false),
      pub_progooh     = coalesce(s.pub_progooh, false)     OR coalesce(m.pub_progooh, false),
      pub_influencers = coalesce(s.pub_influencers, false) OR coalesce(m.pub_influencers, false),
      publisher_colour = coalesce(nullif(btrim(s.publisher_colour), ''), m.publisher_colour),
      publisher_name  = btrim(s.publisher_name)
    FROM public.publishers m
    WHERE s.id = r.keep_id AND m.id = r.drop_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'Aborted: survivor #% update touched % rows (expected 1).', r.keep_id, n; END IF;
  END LOOP;

  -- 2.2 ARE Media survivor takes the spelling the plan lines use.
  UPDATE public.publishers SET publisher_name = v_are_media_name WHERE id = 41;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Aborted: rename of #41 touched % rows.', n; END IF;

  -- 2.3 Repoint foreign keys (0 rows on 3 Nov; kept so the step is complete).
  FOR r IN SELECT * FROM (VALUES (11, 61), (33, 62), (41, 48), (51, 60), (58, 59)) AS t(keep_id, drop_id)
  LOOP
    UPDATE public.client_notes             SET publisher_id = r.keep_id WHERE publisher_id = r.drop_id;
    UPDATE public.publisher_profiles       SET publisher_id = r.keep_id WHERE publisher_id = r.drop_id;
    UPDATE public.ingest_runs              SET publisher_id = r.keep_id WHERE publisher_id = r.drop_id;
    UPDATE public.publisher_specs          SET publisher_id = r.keep_id WHERE publisher_id = r.drop_id;
    UPDATE public.spec_runs                SET publisher_id = r.keep_id WHERE publisher_id = r.drop_id;
    UPDATE public.publisher_domains        SET publisher_id = r.keep_id WHERE publisher_id = r.drop_id;
    UPDATE public.publisher_value_synonyms SET publisher_id = r.keep_id WHERE publisher_id = r.drop_id;
    UPDATE public.ingest_eval_runs         SET publisher_id = r.keep_id WHERE publisher_id = r.drop_id;
  END LOOP;

  -- 2.4 Delete the merged-away rows.
  DELETE FROM public.publishers WHERE id IN (61, 62, 48, 60, 59);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 5 THEN RAISE EXCEPTION 'Aborted: deleted % publisher rows (expected 5).', n; END IF;

  -- 2.5 Linkby gets its own publisherid. LinkedIn (#37) keeps "link".
  UPDATE public.publishers SET publisherid = v_linkby_code WHERE id = 22 AND publisherid = 'link';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Aborted: Linkby publisherid update touched % rows (expected 1).', n; END IF;

  -- 2.6 Linkby's KPI rows follow the code. LinkedIn's social rows stay on "link".
  UPDATE public.publisher_kpi SET publisher = v_linkby_code
  WHERE publisher = 'link' AND media_type NOT IN ('social', 'socialMedia');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 15 THEN RAISE EXCEPTION 'Aborted: publisher_kpi update touched % rows (expected 15).', n; END IF;

  -- 2.7 Magazine titles keep showing under the renamed survivor (exact-match filter).
  UPDATE public.magazines SET network = v_are_media_name WHERE network = 'ARE Media';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 3 THEN RAISE EXCEPTION 'Aborted: magazines update touched % rows (expected 3).', n; END IF;

  -- 2.8 After checks: no duplicate names or ids left, nothing points at a deleted id.
  SELECT count(*) INTO n FROM (
    SELECT lower(btrim(publisher_name)) FROM public.publishers
    WHERE coalesce(btrim(publisher_name), '') <> '' GROUP BY 1 HAVING count(*) > 1
  ) d;
  IF n <> 0 THEN RAISE EXCEPTION 'Aborted: % duplicate name group(s) remain after the merge.', n; END IF;
  SELECT count(*) INTO n FROM (
    SELECT lower(btrim(publisherid)) FROM public.publishers
    WHERE coalesce(btrim(publisherid), '') <> '' GROUP BY 1 HAVING count(*) > 1
  ) d;
  IF n <> 0 THEN RAISE EXCEPTION 'Aborted: % duplicate publisherid group(s) remain after the merge.', n; END IF;
  SELECT (SELECT count(*) FROM public.client_notes WHERE publisher_id IN (61, 62, 48, 60, 59))
       + (SELECT count(*) FROM public.publisher_profiles WHERE publisher_id IN (61, 62, 48, 60, 59))
       + (SELECT count(*) FROM public.ingest_runs WHERE publisher_id IN (61, 62, 48, 60, 59))
       + (SELECT count(*) FROM public.publisher_specs WHERE publisher_id IN (61, 62, 48, 60, 59))
       + (SELECT count(*) FROM public.spec_runs WHERE publisher_id IN (61, 62, 48, 60, 59))
       + (SELECT count(*) FROM public.publisher_domains WHERE publisher_id IN (61, 62, 48, 60, 59))
       + (SELECT count(*) FROM public.publisher_value_synonyms WHERE publisher_id IN (61, 62, 48, 60, 59))
       + (SELECT count(*) FROM public.ingest_eval_runs WHERE publisher_id IN (61, 62, 48, 60, 59))
    INTO v_fk;
  IF v_fk <> 0 THEN RAISE EXCEPTION 'Aborted: % foreign key row(s) still point at a deleted id.', v_fk; END IF;

  INSERT INTO public.migration_markers (key, note)
  VALUES ('b19_publisher_merge',
          'P13: merged publishers 61->11, 62->33, 48->41 (renamed Are Media), 60->51, 59->58; Linkby #22 publisherid link->linkby with 15 publisher_kpi rows; 3 magazines rows ARE Media->Are Media.');

  RAISE NOTICE 'Merge done: 5 publishers merged and deleted, Linkby is "linkby", 15 KPI rows and 3 magazine rows moved.';
END
$$;

COMMIT;


-- =============================================================================
-- STEP 2b. Optional: copy the merged-away row's commission for the one channel
-- only it covered. NOT part of the default run. Read first.
--   Today every reader resolves these names to the survivor, so today's
--   forecast already uses the survivor's value. Running these changes forecast
--   commission for those lines:
--     Broadsheet newspaper_comms   0 -> 10  (from #62)
--     MIFF       cinema_comms      0 -> 10  (from #60)
--     MixIn      progooh_comms     0 -> 10  (from #59)
--     Are Media  newspaper_comms  10 ->  0  (from #48)
--   Needs the step 0 backup table. Uncomment only the lines you want.
-- =============================================================================
-- BEGIN;
-- UPDATE public.publishers SET newspaper_comms = (SELECT newspaper_comms FROM public.b19_backup_publishers_20261103 WHERE id = 62) WHERE id = 33;
-- UPDATE public.publishers SET cinema_comms    = (SELECT cinema_comms    FROM public.b19_backup_publishers_20261103 WHERE id = 60) WHERE id = 51;
-- UPDATE public.publishers SET progooh_comms   = (SELECT progooh_comms   FROM public.b19_backup_publishers_20261103 WHERE id = 59) WHERE id = 58;
-- UPDATE public.publishers SET newspaper_comms = (SELECT newspaper_comms FROM public.b19_backup_publishers_20261103 WHERE id = 48) WHERE id = 41;
-- COMMIT;


-- =============================================================================
-- STEP 3. Unique rules (own transaction). Same index names and shape as the
-- 23 Oct file and the drizzle mirror (db/schema/ported.ts), so db:drift
-- matches once this has run.
-- =============================================================================
BEGIN;

DO $$
DECLARE
  dup_names text;
  dup_ids   text;
  n_names   int;
  n_ids     int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.migration_markers WHERE key = 'b19_publisher_merge') THEN
    RAISE EXCEPTION 'Aborted: run step 2 first (marker b19_publisher_merge is missing).';
  END IF;

  SELECT count(*), string_agg(k || ' -> ' || ids, '; ' ORDER BY k)
    INTO n_names, dup_names
  FROM (
    SELECT lower(btrim(publisher_name)) AS k,
           string_agg('#' || id::text || ' "' || publisher_name || '"', ', ' ORDER BY id) AS ids
    FROM public.publishers
    WHERE publisher_name IS NOT NULL AND btrim(publisher_name) <> ''
    GROUP BY lower(btrim(publisher_name))
    HAVING count(*) > 1
  ) d;

  SELECT count(*), string_agg(k || ' -> ' || ids, '; ' ORDER BY k)
    INTO n_ids, dup_ids
  FROM (
    SELECT lower(btrim(publisherid)) AS k,
           string_agg('#' || id::text || ' "' || publisherid || '"', ', ' ORDER BY id) AS ids
    FROM public.publishers
    WHERE publisherid IS NOT NULL AND btrim(publisherid) <> ''
    GROUP BY lower(btrim(publisherid))
    HAVING count(*) > 1
  ) d;

  IF n_names > 0 OR n_ids > 0 THEN
    RAISE EXCEPTION 'Aborted, nothing changed. Duplicates remain. Names: %. Publisher IDs: %.',
      coalesce(dup_names, 'none'), coalesce(dup_ids, 'none');
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS publishers_publisher_name_unique_ci
    ON public.publishers (lower(btrim(publisher_name)))
    WHERE publisher_name IS NOT NULL AND btrim(publisher_name) <> '';

  CREATE UNIQUE INDEX IF NOT EXISTS publishers_publisherid_unique_ci
    ON public.publishers (lower(btrim(publisherid)))
    WHERE publisherid IS NOT NULL AND btrim(publisherid) <> '';

  INSERT INTO public.migration_markers (key, note)
  VALUES ('b19_publisher_unique_ci',
          'DQ-1: unique indexes publishers_publisher_name_unique_ci and publishers_publisherid_unique_ci (trimmed, case-insensitive, blanks ignored).')
  ON CONFLICT (key) DO NOTHING;

  RAISE NOTICE 'Unique indexes in place.';
END
$$;

COMMIT;


-- =============================================================================
-- STEP 4. Verify (read-only)
-- =============================================================================

-- 4a. The merged-away ids are gone; survivors, Linkby and LinkedIn as expected.
SELECT id, '"' || publisher_name || '"' AS name, '"' || publisherid || '"' AS publisherid,
       financecode, publisher_colour, pub_newspaper, pub_cinema, pub_progooh
FROM public.publishers
WHERE id IN (11, 61, 33, 62, 41, 48, 51, 60, 58, 59, 22, 37)
ORDER BY id;
-- Expect 7 rows:
--   11 "Nine" "nine" | 22 "Linkby" "linkby" | 33 "Broadsheet" pub_newspaper true
--   37 "LinkedIn" "link" | 41 "Are Media" "aremed" pub_newspaper true
--   51 "MIFF" colour #f21c1c pub_cinema true | 58 "MixIn" pub_progooh true

-- 4b. Nothing points at a deleted id.
SELECT
  (SELECT count(*) FROM public.client_notes WHERE publisher_id IN (61, 62, 48, 60, 59)) AS client_notes,
  (SELECT count(*) FROM public.publisher_profiles WHERE publisher_id IN (61, 62, 48, 60, 59)) AS publisher_profiles,
  (SELECT count(*) FROM public.ingest_runs WHERE publisher_id IN (61, 62, 48, 60, 59)) AS ingest_runs,
  (SELECT count(*) FROM public.publisher_specs WHERE publisher_id IN (61, 62, 48, 60, 59)) AS publisher_specs,
  (SELECT count(*) FROM public.spec_runs WHERE publisher_id IN (61, 62, 48, 60, 59)) AS spec_runs,
  (SELECT count(*) FROM public.publisher_domains WHERE publisher_id IN (61, 62, 48, 60, 59)) AS publisher_domains,
  (SELECT count(*) FROM public.publisher_value_synonyms WHERE publisher_id IN (61, 62, 48, 60, 59)) AS value_synonyms,
  (SELECT count(*) FROM public.ingest_eval_runs WHERE publisher_id IN (61, 62, 48, 60, 59)) AS ingest_eval_runs;
-- Expect all 0.

-- 4c. Text rows moved.
SELECT
  (SELECT count(*) FROM public.publisher_kpi WHERE publisher = 'linkby') AS kpi_linkby,
  (SELECT count(*) FROM public.publisher_kpi WHERE publisher = 'link') AS kpi_link,
  (SELECT count(*) FROM public.magazines WHERE network = 'Are Media') AS magazines_are_media,
  (SELECT count(*) FROM public.magazines WHERE network = 'ARE Media') AS magazines_old_spelling;
-- Expect 15 | 21 | 3 | 0

-- 4d. The unique indexes and the markers.
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'publishers'
  AND indexname IN ('publishers_publisher_name_unique_ci', 'publishers_publisherid_unique_ci')
ORDER BY indexname;
-- Expect 2 rows.
SELECT key, applied_at FROM public.migration_markers
WHERE key IN ('b19_publisher_merge', 'b19_publisher_unique_ci') ORDER BY key;
-- Expect 2 rows.


-- =============================================================================
-- STEP 5. Rollback notes
-- =============================================================================
-- If step 2 or 3 fails: it rolled back by itself. Nothing changed. Read the
-- message, re-run step 1, and fix or ask before trying again.
--
-- To undo after commit (needs the step 0 backups). Run as one block:
--
-- BEGIN;
-- DROP INDEX IF EXISTS public.publishers_publisher_name_unique_ci;
-- DROP INDEX IF EXISTS public.publishers_publisherid_unique_ci;
-- INSERT INTO public.publishers
--   SELECT * FROM public.b19_backup_publishers_20261103 WHERE id IN (61, 62, 48, 60, 59);
-- UPDATE public.publishers p SET
--   publisher_name = b.publisher_name, publisherid = b.publisherid,
--   publisher_colour = b.publisher_colour,
--   newspaper_comms = b.newspaper_comms, cinema_comms = b.cinema_comms,
--   progooh_comms = b.progooh_comms,
--   pub_television = b.pub_television, pub_radio = b.pub_radio,
--   pub_newspaper = b.pub_newspaper, pub_magazines = b.pub_magazines,
--   pub_ooh = b.pub_ooh, pub_cinema = b.pub_cinema,
--   pub_digidisplay = b.pub_digidisplay, pub_digiaudio = b.pub_digiaudio,
--   pub_digivideo = b.pub_digivideo, pub_bvod = b.pub_bvod,
--   pub_integration = b.pub_integration, pub_search = b.pub_search,
--   pub_socialmedia = b.pub_socialmedia, pub_progdisplay = b.pub_progdisplay,
--   pub_progvideo = b.pub_progvideo, pub_progbvod = b.pub_progbvod,
--   pub_progaudio = b.pub_progaudio, pub_progooh = b.pub_progooh,
--   pub_influencers = b.pub_influencers
-- FROM public.b19_backup_publishers_20261103 b
-- WHERE p.id = b.id AND p.id IN (11, 33, 41, 51, 58, 22);
-- UPDATE public.publisher_kpi k SET publisher = b.publisher
-- FROM public.b19_backup_publisher_kpi_20261103 b WHERE k.id = b.id;
-- UPDATE public.magazines m SET network = b.network
-- FROM public.b19_backup_magazines_20261103 b WHERE m.id = b.id;
-- DELETE FROM public.migration_markers WHERE key IN ('b19_publisher_merge', 'b19_publisher_unique_ci');
-- COMMIT;
--
-- Foreign key rows: none moved on 3 Nov (b19_backup_publisher_fk_rows_20261103
-- holds 0 rows). If it holds rows, set each table's publisher_id back from it
-- by row_id before deleting the backups.
-- Plans and line items are never touched by this file, so nothing to undo there.
--
-- Drop the backups once you're happy:
-- DROP TABLE public.b19_backup_publishers_20261103;
-- DROP TABLE public.b19_backup_publisher_kpi_20261103;
-- DROP TABLE public.b19_backup_magazines_20261103;
-- DROP TABLE public.b19_backup_publisher_fk_rows_20261103;
