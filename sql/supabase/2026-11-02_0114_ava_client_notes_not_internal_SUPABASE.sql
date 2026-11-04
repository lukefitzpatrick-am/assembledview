-- 0114_ava_client_notes_not_internal: run file for Luke. APPLIED, do not re-run.
-- Supabase project slpdibnxtpdlttbbczvg. Luke ran this by hand in the SQL
-- Editor on 2 Nov 2026 at 09:51:10 UTC (8:51 pm Melbourne). The marker
-- 0114_ava_client_notes_not_internal records it. Kept for the record (B22).
-- Same change as db/migrations/0114_ava_client_notes_not_internal.sql (the repo copy, AUTHOR ONLY).
-- Source: plans PACK-AV-tonight-sql-and-answers-2026-11-02, SQL 2 (Codex F9, decision 10 A).
--
-- What it did
--   Changed policy ava_read on public.client_notes from USING (true) to
--   USING (is_internal IS NOT TRUE AND coalesce(attributed_type, '') <> 'internal'),
--   so the ava_readonly role can't read internal meeting notes. Wrote the
--   marker. Staff access unchanged. No rows changed.
--
-- Running the DO block again raises "already exists - nothing done" and
-- changes nothing. The CHECK query at the end is read only and safe.

-- ===================== CHANGE (applied 2 Nov 2026) =====================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0114_ava_client_notes_not_internal') THEN
    RAISE EXCEPTION 'marker 0114_ava_client_notes_not_internal already exists - nothing done';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'client_notes' AND policyname = 'ava_read') THEN
    RAISE EXCEPTION 'policy ava_read on client_notes not found - nothing done';
  END IF;
  ALTER POLICY ava_read ON public.client_notes
    USING (is_internal IS NOT TRUE AND coalesce(attributed_type, '') <> 'internal');
  INSERT INTO public.migration_markers (key, note)
  VALUES ('0114_ava_client_notes_not_internal', 'ava_read on client_notes excludes internal meetings (is_internal or attributed_type internal).');
END $$;

-- ===================== CHECK (read only) =====================
-- Expect one row, ava_read, with the new condition.
SELECT policyname, roles, cmd, qual FROM pg_policies WHERE tablename = 'client_notes';
