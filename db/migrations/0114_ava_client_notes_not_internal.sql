-- Migration 0114: Ava can't read internal meeting notes (Codex F9, decision 10 A)
-- AUTHOR ONLY. Already applied by Luke on 2 Nov 2026 at 09:51:10 UTC
-- (8:51 pm Melbourne), marker 0114_ava_client_notes_not_internal. Do not re-run.
-- Do not drizzle-kit migrate. Repo copy only, added by B22 so the repo
-- matches the live database. The run file Luke used is kept, marked applied,
-- at sql/supabase/2026-11-02_0114_ava_client_notes_not_internal_SUPABASE.sql.
-- Idempotent: migration_markers guard. Running it again is a no-op.
--
-- Why: the ava_readonly role could read every meeting note (0003 policy
-- ava_read USING (true)), including internal ones. This limits it to notes
-- that are not internal. Staff access is unchanged: internal summaries stay
-- visible to all staff.
--
-- What it changes: the USING condition of policy ava_read on client_notes,
-- only. Before: true. After: is_internal IS NOT TRUE AND
-- coalesce(attributed_type, '') <> 'internal'. No rows change, no grant
-- changes, no mirror (policies are not in db/schema).

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0114_ava_client_notes_not_internal') THEN
    RAISE NOTICE '0114 already applied - no-op';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'client_notes' AND policyname = 'ava_read') THEN
    RAISE EXCEPTION 'policy ava_read on client_notes not found - nothing done';
  END IF;

  ALTER POLICY ava_read ON public.client_notes
    USING (is_internal IS NOT TRUE AND coalesce(attributed_type, '') <> 'internal');

  INSERT INTO public.migration_markers (key, note)
  VALUES ('0114_ava_client_notes_not_internal', 'ava_read on client_notes excludes internal meetings (is_internal or attributed_type internal).');
END
$$;
