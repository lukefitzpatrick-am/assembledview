-- Migration 0084: pacing_scenarios — saved what-if planner runs
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: CREATE TABLE IF NOT EXISTS + migration_markers guard.
--
-- Do not SELECT this table against live Postgres until this file is applied (C-76).
-- Mirror: db/schema/pacingScenarios.ts.
-- Index (mba_number, created_at desc) is the saved-list order.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0084_pacing_scenarios') THEN
    RAISE NOTICE '0084 already applied — no-op';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.pacing_scenarios (
    id                 serial PRIMARY KEY,
    mba_number         text NOT NULL,
    version_number     integer NOT NULL,
    name               text NOT NULL,
    levers             jsonb NOT NULL,
    result             jsonb NOT NULL,
    created_by_email   text NOT NULL,
    created_at         timestamptz NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS pacing_scenarios_mba_created_idx
    ON public.pacing_scenarios (mba_number, created_at DESC);

  COMMENT ON TABLE public.pacing_scenarios IS
    'Saved pacing scenario planner runs. Written by POST /api/pacing/scenarios; listed in the planner panel.';

  ALTER TABLE public.pacing_scenarios ENABLE ROW LEVEL SECURITY;

  INSERT INTO public.migration_markers (key, note)
  VALUES (
    '0084_pacing_scenarios',
    'pacing_scenarios saved what-if planner runs keyed by mba_number + created_at desc.'
  )
  ON CONFLICT (key) DO NOTHING;
END
$$;
