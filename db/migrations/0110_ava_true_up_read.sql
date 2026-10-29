-- Migration 0110: AVA reads the true-up (ava_readonly SELECT on the 0109 tables)
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- The guarded run file for Luke is sql/supabase/2026-10-29_0110_ava_true_up_read_SUPABASE.sql
-- (same DDL, with BEFORE and AFTER checks). Run that one.
-- Idempotent: migration_markers guard. Needs 0109 and the ava_readonly role (0003).
--
-- Why: Luke, 29 Oct 2026 ("approved to do"). The AVA tool query_true_up
-- (admin only) reads saved runs and the ledger. 0003 style allowlist:
-- GRANT SELECT plus an ava_read policy per table. No write grants.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0110_ava_true_up_read') THEN
    RAISE NOTICE '0110 already applied - no-op';
    RETURN;
  END IF;
  IF to_regclass('public.true_up_runs') IS NULL
     OR to_regclass('public.true_up_actions') IS NULL
     OR to_regclass('public.true_up_invoice_links') IS NULL THEN
    RAISE EXCEPTION '0110 needs 0109 (true_up tables) first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ava_readonly') THEN
    RAISE EXCEPTION '0110 needs the ava_readonly role (0003)';
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
END
$$;
