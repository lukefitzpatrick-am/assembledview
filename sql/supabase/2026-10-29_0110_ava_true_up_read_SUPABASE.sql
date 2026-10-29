-- 0110_ava_true_up_read: guarded run file for Luke.
-- Supabase project slpdibnxtpdlttbbczvg. Luke runs this by hand in the SQL Editor.
-- Same DDL as db/migrations/0110_ava_true_up_read.sql (the repo copy, AUTHOR ONLY).
--
-- What it does
--   Lets AVA read the true-up (Luke, 29 Oct 2026: "approved to do"). Grants
--   the ava_readonly role SELECT on public.true_up_runs, public.true_up_actions
--   and public.true_up_invoice_links, and adds one ava_read policy
--   (FOR SELECT TO ava_readonly USING (true)) on each, the same pattern as
--   0003, 0011 and 0103. No INSERT, UPDATE or DELETE. Touches no rows and no
--   other role. Writes the marker 0110_ava_true_up_read.
--   The AVA tool query_true_up is admin only and refuses until this exists.
--
-- Needs 0109 (true_up tables) first, and the ava_readonly role (0003).
--
-- Run order
--   1. Run the BEFORE block. Check every expected value.
--   2. Run the DO block. It refuses (nothing done) if the marker exists, 0109
--      is missing or the role is missing, and rolls back if any AFTER check
--      inside fails.
--   3. Run the AFTER block. Check every expected value.

-- ===================== BEFORE (read only) =====================
SELECT key FROM public.migration_markers
 WHERE key IN ('0109_true_up', '0110_ava_true_up_read')
 ORDER BY key;                                       -- expect 0109_true_up only (1 row)
SELECT count(*) AS ava_role FROM pg_roles WHERE rolname = 'ava_readonly';   -- expect 1
SELECT table_name, privilege_type FROM information_schema.role_table_grants
 WHERE grantee = 'ava_readonly'
   AND table_name IN ('true_up_runs', 'true_up_actions', 'true_up_invoice_links')
 ORDER BY table_name;                                -- expect 0 rows
SELECT tablename, policyname FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('true_up_runs', 'true_up_actions', 'true_up_invoice_links')
 ORDER BY tablename;                                 -- expect 0 rows

-- ===================== CHANGE (one DO block) =====================
DO $$
DECLARE
  n_select   integer;
  n_write    integer;
  n_policy   integer;
  n_marker   integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0110_ava_true_up_read') THEN
    RAISE EXCEPTION 'marker 0110_ava_true_up_read already exists - nothing done';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0109_true_up')
     OR to_regclass('public.true_up_runs') IS NULL
     OR to_regclass('public.true_up_actions') IS NULL
     OR to_regclass('public.true_up_invoice_links') IS NULL THEN
    RAISE EXCEPTION '0110 needs 0109 (true_up tables) first - nothing done';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ava_readonly') THEN
    RAISE EXCEPTION '0110 needs the ava_readonly role (0003) - nothing done';
  END IF;

  GRANT SELECT ON TABLE public.true_up_runs TO ava_readonly;
  GRANT SELECT ON TABLE public.true_up_actions TO ava_readonly;
  GRANT SELECT ON TABLE public.true_up_invoice_links TO ava_readonly;

  DROP POLICY IF EXISTS ava_read ON public.true_up_runs;
  CREATE POLICY ava_read ON public.true_up_runs FOR SELECT TO ava_readonly USING (true);
  DROP POLICY IF EXISTS ava_read ON public.true_up_actions;
  CREATE POLICY ava_read ON public.true_up_actions FOR SELECT TO ava_readonly USING (true);
  DROP POLICY IF EXISTS ava_read ON public.true_up_invoice_links;
  CREATE POLICY ava_read ON public.true_up_invoice_links FOR SELECT TO ava_readonly USING (true);

  INSERT INTO public.migration_markers (key, note)
  VALUES ('0110_ava_true_up_read', 'ava_readonly SELECT and ava_read policy on true_up_runs, true_up_actions, true_up_invoice_links. Read only.');

  -- AFTER checks inside the block: any failure rolls the whole block back.
  SELECT count(*) INTO n_select FROM information_schema.role_table_grants
   WHERE grantee = 'ava_readonly' AND privilege_type = 'SELECT'
     AND table_name IN ('true_up_runs', 'true_up_actions', 'true_up_invoice_links');
  IF n_select <> 3 THEN
    RAISE EXCEPTION 'expected SELECT for ava_readonly on 3 true_up tables, found %', n_select;
  END IF;
  SELECT count(*) INTO n_write FROM information_schema.role_table_grants
   WHERE grantee = 'ava_readonly' AND privilege_type <> 'SELECT'
     AND table_name IN ('true_up_runs', 'true_up_actions', 'true_up_invoice_links');
  IF n_write <> 0 THEN
    RAISE EXCEPTION 'ava_readonly must have no write grants on true_up tables, found %', n_write;
  END IF;
  SELECT count(*) INTO n_policy FROM pg_policies
   WHERE schemaname = 'public' AND policyname = 'ava_read' AND cmd = 'SELECT'
     AND tablename IN ('true_up_runs', 'true_up_actions', 'true_up_invoice_links');
  IF n_policy <> 3 THEN
    RAISE EXCEPTION 'expected 3 ava_read SELECT policies, found %', n_policy;
  END IF;
  SELECT count(*) INTO n_marker FROM public.migration_markers WHERE key = '0110_ava_true_up_read';
  IF n_marker <> 1 THEN
    RAISE EXCEPTION 'expected 1 marker row, found %', n_marker;
  END IF;

  RAISE NOTICE '0110_ava_true_up_read applied: ava_readonly SELECT and ava_read on 3 true_up tables, marker written.';
END
$$;

-- ===================== AFTER (read only) =====================
SELECT table_name, privilege_type FROM information_schema.role_table_grants
 WHERE grantee = 'ava_readonly'
   AND table_name IN ('true_up_runs', 'true_up_actions', 'true_up_invoice_links')
 ORDER BY table_name;                                -- expect 3 rows, all SELECT
SELECT tablename, policyname, cmd, roles FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('true_up_runs', 'true_up_actions', 'true_up_invoice_links')
 ORDER BY tablename;                                 -- expect 3 rows: ava_read, SELECT, {ava_readonly}
SELECT key FROM public.migration_markers WHERE key = '0110_ava_true_up_read';   -- expect 1 row
