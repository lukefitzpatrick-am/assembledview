-- Migration 0117: codex_saved_views (Codex saved views, B37, F8)
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- The guarded run file for Luke is sql/supabase/2026-11-13_0117_codex_saved_views_SUPABASE.sql
-- (same DDL, with BEFORE and AFTER checks). Run that one.
-- Idempotent: migration_markers guard.
--
-- Why: Asana parity (plan section 4.2, F8). People save the list or board
-- filters they use as a named view, pick it again, and share it by link
-- (/tasks?view=<id>).
--
-- What it adds: public.codex_saved_views, exactly as plan section 10:
-- id, owner_email, name, screen, lens, filters jsonb, layout, group_by,
-- shared, created_at. Empty. The app validates the values (screen 'tasks',
-- lens 'plan', layout list|board, filters the /tasks query string as an
-- object; lib/codex/savedViews.ts). Owner renames and deletes; shared views
-- are readable by all staff. RLS on, no policies (server connection only),
-- no ava_readonly grant.
--
-- Mirror: db/schema/codex.ts (codexSavedViews), snapshot db/drizzle/0027.
-- The code reads the table only once the marker exists, so the mirror can
-- deploy in any order. Behind switches codex_v2 and codex_saved_views.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0117_codex_saved_views') THEN
    RAISE NOTICE '0117 already applied - no-op';
    RETURN;
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
END
$$;
