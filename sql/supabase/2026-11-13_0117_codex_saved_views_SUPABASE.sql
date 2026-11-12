-- 0117_codex_saved_views: guarded run file for Luke.
-- Supabase project slpdibnxtpdlttbbczvg. Luke runs this by hand in the SQL Editor.
-- Same DDL as db/migrations/0117_codex_saved_views.sql (the repo copy, AUTHOR ONLY).
--
-- What it does
--   Creates public.codex_saved_views (empty, RLS on, no policies, no
--   ava_readonly grant) and writes the marker 0117_codex_saved_views.
--   Touches no existing rows.
--   Until this runs, Tasks hides Save view and the views menu even with the
--   codex_saved_views switch on; the page loads as today.
--
-- Order
--   1. Run the BEFORE block. Check every expected value.
--   2. Run the DO block. It refuses (nothing done) if the marker or the
--      table already exists, and rolls back if any AFTER check inside fails.
--   3. Run the AFTER block. Check every expected value.
--   Any time before turning codex_saved_views on. Until the marker exists
--   the app reads it on each request; once seen, it stops checking.

-- ===================== 1. BEFORE (read only) =====================
SELECT to_regclass('public.codex_saved_views') AS codex_saved_views;          -- expect NULL
SELECT count(*) AS marker_rows FROM public.migration_markers
 WHERE key = '0117_codex_saved_views';                                        -- expect 0

-- ===================== 2. CHANGE (one DO block) =====================
DO $$
DECLARE
  n_cols    integer;
  n_rls     integer;
  n_rows    bigint;
  n_grant   integer;
  n_marker  integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0117_codex_saved_views') THEN
    RAISE EXCEPTION 'marker 0117_codex_saved_views already exists - nothing done';
  END IF;
  IF to_regclass('public.codex_saved_views') IS NOT NULL THEN
    RAISE EXCEPTION 'codex_saved_views already exists - nothing done';
  END IF;

  CREATE TABLE IF NOT EXISTS public.codex_saved_views (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_email text NOT NULL,
    name        text NOT NULL,
    screen      text NOT NULL,
    lens        text NOT NULL,
    filters     jsonb NOT NULL DEFAULT '{}'::jsonb,
    layout      text,
    group_by    text,
    shared      boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now()
  );

  COMMENT ON TABLE public.codex_saved_views IS
    'Codex saved views (F8): named list or board filters. Owner renames and deletes; shared views are readable by staff. filters is the /tasks query string as an object.';

  ALTER TABLE public.codex_saved_views ENABLE ROW LEVEL SECURITY;

  INSERT INTO public.migration_markers (key, note)
  VALUES ('0117_codex_saved_views', 'codex_saved_views (Codex saved views, F8). Empty, RLS on, no ava grant.');

  -- AFTER checks inside the block. Any failure rolls the whole block back.
  SELECT count(*) INTO n_cols FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'codex_saved_views';
  IF n_cols <> 10 THEN
    RAISE EXCEPTION 'expected 10 columns on codex_saved_views, found %', n_cols;
  END IF;
  SELECT count(*) INTO n_rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'codex_saved_views' AND c.relrowsecurity;
  IF n_rls <> 1 THEN
    RAISE EXCEPTION 'expected RLS on codex_saved_views';
  END IF;
  SELECT count(*) INTO n_rows FROM public.codex_saved_views;
  IF n_rows <> 0 THEN
    RAISE EXCEPTION 'expected an empty codex_saved_views, found % rows', n_rows;
  END IF;
  SELECT count(*) INTO n_grant FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'codex_saved_views' AND grantee = 'ava_readonly';
  IF n_grant <> 0 THEN
    RAISE EXCEPTION 'expected no ava_readonly grant on codex_saved_views, found %', n_grant;
  END IF;
  SELECT count(*) INTO n_marker FROM public.migration_markers WHERE key = '0117_codex_saved_views';
  IF n_marker <> 1 THEN
    RAISE EXCEPTION 'expected 1 marker row, found %', n_marker;
  END IF;

  RAISE NOTICE '0117_codex_saved_views applied: table created (empty, RLS on, no ava grant), marker written.';
END
$$;

-- ===================== 3. AFTER (read only) =====================
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'codex_saved_views'
 ORDER BY ordinal_position;                                    -- expect 10 rows: id, owner_email, name, screen, lens, filters, layout, group_by, shared, created_at
SELECT relrowsecurity FROM pg_class WHERE relname = 'codex_saved_views';   -- expect true
SELECT count(*) AS rows FROM public.codex_saved_views;         -- expect 0
SELECT key FROM public.migration_markers WHERE key = '0117_codex_saved_views';  -- expect 1 row

-- ===================== Rollback (only if you must undo) =====================
-- Turn codex_saved_views off first. Drops every saved view.
-- BEGIN;
--   DROP TABLE IF EXISTS public.codex_saved_views;
--   DELETE FROM public.migration_markers WHERE key = '0117_codex_saved_views';
-- COMMIT;
