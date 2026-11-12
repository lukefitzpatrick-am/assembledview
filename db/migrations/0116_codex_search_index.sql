-- Migration 0116: full-text index on meeting summaries for Codex search (B37, F8)
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- The guarded run file for Luke is sql/supabase/2026-11-13_0116_codex_search_index_SUPABASE.sql
-- (same DDL, with BEFORE and AFTER checks). Run that one.
-- Idempotent: migration_markers guard.
--
-- Why: Codex search (switch codex_search) matches meeting summaries with
-- to_tsvector('english', coalesce(body, '')) @@ plainto_tsquery(...), the
-- repo's full-text pattern (pg_trgm is not installed). Without an index every
-- search rebuilds the vector for every meeting: about 240 ms on 341 meetings
-- on 13 Nov 2026, growing with every Fireflies sync. Search works without
-- this index, just slower.
--
-- What it adds: GIN index idx_client_notes_body_fts on client_notes, on the
-- exact expression lib/codex/searchRepo.ts queries. No rows change. No grant
-- changes. Tasks, comments and Inbox items are small and short; they are not
-- indexed (sequential scan, under 50 ms today).
--
-- Mirror: db/schema/codex.ts (clientNotes index list), snapshot db/drizzle/0026.
-- An index mirror selects nothing, so the mirror can deploy in any order.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0116_codex_search_index') THEN
    RAISE NOTICE '0116 already applied - no-op';
    RETURN;
  END IF;

  CREATE INDEX IF NOT EXISTS idx_client_notes_body_fts
    ON public.client_notes USING gin (to_tsvector('english'::regconfig, coalesce(body, '')));

  INSERT INTO public.migration_markers (key, note)
  VALUES ('0116_codex_search_index', 'GIN full-text index on client_notes body for Codex search. No rows changed.');
END
$$;
