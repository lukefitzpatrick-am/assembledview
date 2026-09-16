-- Migration 0081: pacing_portfolio_snapshots — daily precomputed portfolio rows
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: CREATE TABLE IF NOT EXISTS + migration_markers guard.
--
-- Do not SELECT this table against live Postgres until this file is applied (C-76).
-- Mirror: db/schema/pacingPortfolioSnapshots.ts.
-- One row per (as_of_date, scope_key, live_only). scope_key matches pacingRowsCache
-- (`all` for admin, sorted slugs joined for a client allowlist).

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0081_pacing_portfolio_snapshots') THEN
    RAISE NOTICE '0081 already applied — no-op';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.pacing_portfolio_snapshots (
    id            serial PRIMARY KEY,
    as_of_date    date NOT NULL,
    scope_key     text NOT NULL,
    live_only     boolean NOT NULL,
    rows          jsonb NOT NULL,
    counts        jsonb NOT NULL,
    generated_at  timestamptz NOT NULL DEFAULT now(),
    duration_ms   integer,
    CONSTRAINT pacing_portfolio_snapshots_as_of_scope_live_key
      UNIQUE (as_of_date, scope_key, live_only)
  );

  COMMENT ON TABLE public.pacing_portfolio_snapshots IS
    'Daily campaign-level portfolio. Served by GET /api/pacing/portfolio. Built by cron and admin miss/refresh.';

  ALTER TABLE public.pacing_portfolio_snapshots ENABLE ROW LEVEL SECURITY;

  INSERT INTO public.migration_markers (key, note)
  VALUES (
    '0081_pacing_portfolio_snapshots',
    'pacing_portfolio_snapshots daily portfolio rows keyed by as_of_date + scope_key + live_only.'
  )
  ON CONFLICT (key) DO NOTHING;
END
$$;
