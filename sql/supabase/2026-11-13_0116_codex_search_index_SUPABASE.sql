-- 0116_codex_search_index: guarded run file for Luke.
-- Supabase project slpdibnxtpdlttbbczvg. Luke runs this by hand in the SQL Editor.
-- Same DDL as db/migrations/0116_codex_search_index.sql (the repo copy, AUTHOR ONLY).
--
-- What it does
--   Adds GIN index public.idx_client_notes_body_fts on
--   to_tsvector('english', regexp_replace(coalesce(body, ''), <JSON keys and
--   \n \r \t escapes>, ' ', 'g')) and writes the marker
--   0116_codex_search_index. Updates no rows. No grant changes.
--   Codex search works before this runs; the index only makes meeting search
--   fast as Fireflies adds meetings. The expression must stay byte for byte
--   what lib/codex/search.ts CLIENT_NOTES_BODY_FTS_EXPRESSION builds, or the
--   planner will not use the index (B37fix changed both together).
--
-- Order
--   1. Run the BEFORE block. Check every expected value.
--   2. Run the DO block. It refuses (nothing done) if the marker or the
--      index already exists, and rolls back if any AFTER check inside fails.
--   3. Run the AFTER block. Check every expected value.
--   Any time; the code does not depend on it. client_notes is small (341
--   rows on 13 Nov 2026): the build takes well under a second and briefly
--   blocks writes to client_notes (the Fireflies sync), not reads.

-- ===================== 1. BEFORE (read only) =====================
SELECT count(*) AS index_rows FROM pg_indexes
 WHERE schemaname = 'public' AND indexname = 'idx_client_notes_body_fts';   -- expect 0
SELECT count(*) AS marker_rows FROM public.migration_markers
 WHERE key = '0116_codex_search_index';                                     -- expect 0
SELECT count(*) AS client_notes FROM public.client_notes;                   -- note the number
SHOW standard_conforming_strings;                                           -- expect on

-- ===================== 2. CHANGE (one DO block) =====================
DO $$
DECLARE
  n_idx     integer;
  n_marker  integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0116_codex_search_index') THEN
    RAISE EXCEPTION 'marker 0116_codex_search_index already exists - nothing done';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_client_notes_body_fts') THEN
    RAISE EXCEPTION 'index idx_client_notes_body_fts already exists - nothing done';
  END IF;
  IF current_setting('standard_conforming_strings') <> 'on' THEN
    RAISE EXCEPTION 'standard_conforming_strings must be on: the index pattern would not match the app query - nothing done';
  END IF;

  CREATE INDEX IF NOT EXISTS idx_client_notes_body_fts
    ON public.client_notes USING gin (to_tsvector('english'::regconfig, regexp_replace(coalesce(body, ''), '"(summary|action_items)"\s*:|\\[nrt]', ' ', 'g')));

  INSERT INTO public.migration_markers (key, note)
  VALUES ('0116_codex_search_index', 'GIN full-text index on client_notes body for Codex search. No rows changed.');

  -- AFTER checks inside the block. Any failure rolls the whole block back.
  SELECT count(*) INTO n_idx FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'client_notes'
     AND indexname = 'idx_client_notes_body_fts' AND indexdef ILIKE '%USING gin%to_tsvector%regexp_replace%summary|action_items%';
  IF n_idx <> 1 THEN
    RAISE EXCEPTION 'expected 1 GIN index idx_client_notes_body_fts, found %', n_idx;
  END IF;
  SELECT count(*) INTO n_marker FROM public.migration_markers WHERE key = '0116_codex_search_index';
  IF n_marker <> 1 THEN
    RAISE EXCEPTION 'expected 1 marker row, found %', n_marker;
  END IF;

  RAISE NOTICE '0116_codex_search_index applied: index added, marker written.';
END
$$;

-- ===================== 3. AFTER (read only) =====================
SELECT indexname, indexdef FROM pg_indexes
 WHERE schemaname = 'public' AND indexname = 'idx_client_notes_body_fts';   -- expect 1 row, USING gin (to_tsvector('english'::regconfig, regexp_replace(COALESCE(body, ''::text), ...)))
SELECT count(*) AS client_notes FROM public.client_notes;                   -- expect = BEFORE (or more, if Fireflies synced)
SELECT key FROM public.migration_markers WHERE key = '0116_codex_search_index';  -- expect 1 row
-- Optional: the planner can use it (expect "Bitmap Index Scan on idx_client_notes_body_fts").
-- EXPLAIN SELECT id FROM public.client_notes
--  WHERE to_tsvector('english'::regconfig, regexp_replace(coalesce(body, ''), '"(summary|action_items)"\s*:|\\[nrt]', ' ', 'g')) @@ plainto_tsquery('english'::regconfig, 'report');

-- ===================== Rollback (only if you must undo) =====================
-- Safe at any time: search still works without the index, just slower.
-- BEGIN;
--   DROP INDEX IF EXISTS public.idx_client_notes_body_fts;
--   DELETE FROM public.migration_markers WHERE key = '0116_codex_search_index';
-- COMMIT;
