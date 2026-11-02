-- Migration 0112: clients.is_test_client (test and internal clients)
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- The guarded run file for Luke is sql/supabase/2026-11-02_0112_clients_is_test_client_SUPABASE.sql
-- (same DDL, with BEFORE and AFTER checks). Run that one.
-- Idempotent: migration_markers guard.
--
-- Why: Luke, 2 Nov 2026. Finance checks (the true-up first) leave out test
-- and internal clients (demo plans, Assembled Media's own campaigns). The
-- client form sets it ("Test or internal client", admin only).
--
-- What it adds: clients.is_test_client boolean NOT NULL DEFAULT false. Every
-- existing client reads false, so nothing changes until someone ticks it.
-- No rows are updated here: setting the three test clients is a separate,
-- guarded UPDATE Luke runs after this.
--
-- ava_readonly already has table-level SELECT on clients (0003), so AVA can
-- read the column with no new grant. RLS is unchanged.
--
-- Deploy order (C-76): db/schema/ported.ts mirrors the column, and
-- db.select().from(clients) lists it, so apply this BEFORE deploying the code
-- that carries the mirror.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0112_clients_is_test_client') THEN
    RAISE NOTICE '0112 already applied - no-op';
    RETURN;
  END IF;

  ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS is_test_client boolean NOT NULL DEFAULT false;

  COMMENT ON COLUMN public.clients.is_test_client IS
    'Test or internal client. Finance checks such as the true-up leave its plans out. Set on the client form (admin).';

  INSERT INTO public.migration_markers (key, note)
  VALUES ('0112_clients_is_test_client', 'clients.is_test_client boolean NOT NULL DEFAULT false. No rows updated.');
END
$$;
