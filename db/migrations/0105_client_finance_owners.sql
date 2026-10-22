-- Migration 0105: client_finance_owners (FP-6, D6)
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: migration_markers guard.
--
-- Do not SELECT this table against live Postgres until this file is applied (C-76).
-- The app reads it through lib/finance/financeOwnersStore.ts, which reports
-- "not ready" (no error page) while the table is missing.
-- Mirror: db/schema/clientFinanceOwners.ts.
--
-- One named finance owner per client. Replaces the WIP responsibilities tab
-- (Luke, D6, 21 Oct 2026). Edited on /finance/owners by any admin (D5 rule).
-- No row = no owner. Unassign deletes the row.
-- team_member_id is SET NULL if the team member row is ever deleted, so a
-- roster clean-up cannot fail on this table; the UI shows "No owner".
-- updated_by is the audit actor id (team_members.id when resolvable) with no
-- FK, same as approved_by on finance_billing_records.
--
-- RLS on, no policies for app roles (server connection only). No ava_readonly
-- grant (same as 0100 billing_partner_packs).
--
-- Before: SELECT to_regclass('public.client_finance_owners');  -- expect NULL
-- After:  SELECT to_regclass('public.client_finance_owners');  -- expect client_finance_owners
--         SELECT count(*) FROM public.client_finance_owners;      -- expect 0

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0105_client_finance_owners') THEN
    RAISE NOTICE '0105 already applied — no-op';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.client_finance_owners (
    client_id        bigint PRIMARY KEY REFERENCES public.clients (id) ON DELETE CASCADE,
    team_member_id   bigint NULL REFERENCES public.team_members (id) ON DELETE SET NULL,
    updated_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       bigint NULL,
    updated_by_name  text NULL
  );

  CREATE INDEX IF NOT EXISTS client_finance_owners_team_member_idx
    ON public.client_finance_owners (team_member_id);

  COMMENT ON TABLE public.client_finance_owners IS
    'FP-6: one finance owner (team_members.id) per client. No row = no owner.';

  ALTER TABLE public.client_finance_owners ENABLE ROW LEVEL SECURITY;

  INSERT INTO public.migration_markers (key, note)
  VALUES (
    '0105_client_finance_owners',
    'client_finance_owners: finance owner per client (FP-6).'
  )
  ON CONFLICT (key) DO NOTHING;
END
$$;
