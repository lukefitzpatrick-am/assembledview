-- Migration 0086: relabel_drift_snapshots — nightly LABEL_MAP vs delivery_relabels
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: CREATE TABLE IF NOT EXISTS + migration_markers guard.
--
-- Do not SELECT this table against live Postgres until this file is applied (C-76).
-- Mirror: db/schema/relabelDriftSnapshots.ts.
-- One row per as_of_date. Written by /api/cron/relabel-drift; read by the
-- pacing digest Delivery relabels section and the relabels Log tab.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0086_relabel_drift_snapshots') THEN
    RAISE NOTICE '0086 already applied — no-op';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.relabel_drift_snapshots (
    id            serial PRIMARY KEY,
    as_of_date    date NOT NULL,
    findings      jsonb NOT NULL,
    legacy_count  integer NOT NULL,
    drift_count   integer NOT NULL,
    generated_at  timestamptz NOT NULL DEFAULT now(),
    duration_ms   integer,
    CONSTRAINT relabel_drift_snapshots_as_of_key UNIQUE (as_of_date)
  );

  COMMENT ON TABLE public.relabel_drift_snapshots IS
    'Nightly LINE_ITEM_LABEL_MAP vs applied delivery_relabels. legacy = map with no relabel; drift = relabel map missing or pointing elsewhere.';

  ALTER TABLE public.relabel_drift_snapshots ENABLE ROW LEVEL SECURITY;

  INSERT INTO public.migration_markers (key, note)
  VALUES (
    '0086_relabel_drift_snapshots',
    'relabel_drift_snapshots nightly LABEL_MAP vs applied delivery_relabels keyed by as_of_date.'
  )
  ON CONFLICT (key) DO NOTHING;
END
$$;
