-- =============================================================================
-- 2026-10-23  publishers: unique publisher_name and publisherid
-- Target: Supabase (project slpdibnxtpdlttbbczvg), table public.publishers
-- Author: Claude for Luke. NOT RUN. Luke runs this by hand AFTER the
-- duplicates below are cleaned up (the DO block aborts while any remain).
--
-- Why: two publishers shared name "Broadsheet" and publisherid "Broadsheet"
-- (#33 and #62). Edits to #62 landed on #33 and Advertising Associates name
-- matching picked a row at random. Luke's decision (23 Oct 2026): two
-- publishers must never share a name or an id. The app now refuses
-- duplicates on create/edit (lib/publisher/publisherUniqueness.ts); these
-- indexes make the database refuse them too, including concurrent saves.
--
-- Rule: compared case-insensitively after trimming, ignoring NULL/blank.
--   publishers_publisher_name_unique_ci  ON lower(btrim(publisher_name))
--   publishers_publisherid_unique_ci     ON lower(btrim(publisherid))
--
-- Before (read-only query, 23 Oct 2026): 81 rows, 0 blank names, 0 blank ids,
-- only index is publishers_pkey. Duplicates today:
--
--   Shared name (lower/trim)
--     "are media"   #41 "ARE Media " (aremed)        | #48 "Are Media" (Are Media)    both advertising associates
--     "broadsheet"  #33 "Broadsheet" (Broadsheet)    | #62 "Broadsheet" (Broadsheet)  both advertising associates
--     "miff"        #51 "MIFF" (MIFF)                | #60 "MIFF" (MIFF)              both assembled media
--     "mixin"       #58 "MixIn" (MixIn)              | #59 "MixIn" (MixIn)            both assembled media
--     "nine"        #11 "Nine" (nine)                | #61 "Nine " (Nine)             both advertising associates
--   Shared publisherid (lower/trim)
--     "broadsheet"  #33 | #62
--     "link"        #22 Linkby (link)                | #37 LinkedIn (link)            AA | AM (26 Oct)
--     "miff"        #51 | #60
--     "mixin"       #58 | #59
--     "nine"        #11 (nine)                       | #61 (Nine)
--
--   = 5 name groups, 5 id groups, 11 distinct rows involved.
--   Billing agency agrees within every group except id "link" (26 Oct:
--   #22 Linkby advertising associates, #37 LinkedIn assembled media). A
--   shared id never matches in AA matching, so no billing pick depends on it.
--
-- Cleanup is a business decision (which row to keep, re-pointing any plan
-- lines / payables that reference the row being retired). Not done here.
--
-- Expected result once clean: duplicate counts 0 and 0, two indexes created.
-- After check (run separately):
--   SELECT indexname FROM pg_indexes
--   WHERE tablename = 'publishers' AND indexname LIKE 'publishers_%_unique_ci';
--   -- expect 2 rows
-- =============================================================================

DO $$
DECLARE
  dup_names text;
  dup_ids   text;
  n_names   int;
  n_ids     int;
BEGIN
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

  RAISE NOTICE 'Before: % duplicate name group(s), % duplicate publisherid group(s)', n_names, n_ids;

  IF n_names > 0 OR n_ids > 0 THEN
    RAISE EXCEPTION 'Aborted, nothing changed. Clean up duplicates first. Names: %. Publisher IDs: %.',
      coalesce(dup_names, 'none'), coalesce(dup_ids, 'none');
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS publishers_publisher_name_unique_ci
    ON public.publishers (lower(btrim(publisher_name)))
    WHERE publisher_name IS NOT NULL AND btrim(publisher_name) <> '';

  CREATE UNIQUE INDEX IF NOT EXISTS publishers_publisherid_unique_ci
    ON public.publishers (lower(btrim(publisherid)))
    WHERE publisherid IS NOT NULL AND btrim(publisherid) <> '';

  RAISE NOTICE 'After: unique indexes publishers_publisher_name_unique_ci and publishers_publisherid_unique_ci in place (% total)',
    (SELECT count(*) FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'publishers'
        AND indexname IN ('publishers_publisher_name_unique_ci', 'publishers_publisherid_unique_ci'));
END
$$;
