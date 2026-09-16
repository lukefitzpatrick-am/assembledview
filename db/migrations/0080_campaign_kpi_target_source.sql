-- Migration 0080: campaign_kpi target_source + benchmark_ref
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: ADD COLUMN IF NOT EXISTS + migration_markers guard.
--
-- Do not SELECT these columns against live Postgres until this file is applied (C-76).
-- Mirror: db/schema/ported.ts.
-- Existing rows are plan targets. Industry benchmark backfill is a later data step.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0080_campaign_kpi_target_source') THEN
    RAISE NOTICE '0080 already applied — no-op';
    RETURN;
  END IF;

  IF to_regclass('public.campaign_kpi') IS NULL THEN
    RAISE EXCEPTION '0080 requires public.campaign_kpi (apply 0001 first)';
  END IF;

  ALTER TABLE public.campaign_kpi
    ADD COLUMN IF NOT EXISTS target_source text DEFAULT 'target',
    ADD COLUMN IF NOT EXISTS benchmark_ref text;

  UPDATE public.campaign_kpi
     SET target_source = 'target'
   WHERE target_source IS NULL;

  COMMENT ON COLUMN public.campaign_kpi.target_source IS
    'How the review judges the row: target = saved on the plan; benchmark = industry backfill.';
  COMMENT ON COLUMN public.campaign_kpi.benchmark_ref IS
    'Optional label for an industry benchmark row (shown on hover).';

  INSERT INTO public.migration_markers (key, note)
  VALUES (
    '0080_campaign_kpi_target_source',
    'campaign_kpi.target_source and benchmark_ref for KPI review captions.'
  )
  ON CONFLICT (key) DO NOTHING;
END
$$;
