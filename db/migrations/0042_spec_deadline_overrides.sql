-- Migration 0042: spec_deadline_overrides (manual material-deadline overrides)
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: CREATE IF NOT EXISTS.
--
-- Renumbered from a premature 0041 filename — 0041 is publisher_specs + spec_runs.
-- Explicit manual override of a derived material date (who / when / value).
-- Never infer an override from display ≠ derivation. RLS on; no ava_readonly grant.

CREATE TABLE IF NOT EXISTS public.spec_deadline_overrides (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mba_number text NOT NULL,
  publisher_key text NOT NULL,
  derived_ymd date NOT NULL,
  override_ymd date NOT NULL,
  overridden_by text NOT NULL,
  overridden_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT spec_deadline_overrides_mba_publisher UNIQUE (mba_number, publisher_key)
);

CREATE INDEX IF NOT EXISTS idx_spec_deadline_overrides_mba
  ON public.spec_deadline_overrides (mba_number);

ALTER TABLE public.spec_deadline_overrides ENABLE ROW LEVEL SECURITY;
