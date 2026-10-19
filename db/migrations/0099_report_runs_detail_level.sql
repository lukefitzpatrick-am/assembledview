-- Migration 0099: detail_level on report_runs
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: migration_markers guard.
--
-- Old indexes from 0097, quoted here. The monthly index is unchanged.
-- The on-demand in-flight index is replaced so detail_level is part of the key.
--
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_report_runs_kind_mba_period
--   ON public.report_runs (kind, mba_number, period_start)
--   WHERE kind <> 'on_demand_deck';
--
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_report_runs_on_demand_inflight
--   ON public.report_runs (kind, mba_number, period_start)
--   WHERE kind = 'on_demand_deck'
--     AND status IN ('queued', 'generating');
--
-- detail_level is channel, line_item, or ad_group. Existing rows become channel.
-- Monthly rows stay channel because they never set the column.
-- No backfill. RLS is already on. No ava_readonly grant.
-- Do not SELECT detail_level until this file is applied (C-76).

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0099_report_runs_detail_level') THEN
    RAISE NOTICE '0099 already applied — no-op';
    RETURN;
  END IF;

  ALTER TABLE public.report_runs
    ADD COLUMN IF NOT EXISTS detail_level text NOT NULL DEFAULT 'channel';

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'report_runs_detail_level_check'
      AND conrelid = 'public.report_runs'::regclass
  ) THEN
    ALTER TABLE public.report_runs
      ADD CONSTRAINT report_runs_detail_level_check
      CHECK (detail_level IN ('channel', 'line_item', 'ad_group'));
  END IF;

  DROP INDEX IF EXISTS uq_report_runs_on_demand_inflight;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_report_runs_on_demand_inflight
    ON public.report_runs (kind, mba_number, period_start, detail_level)
    WHERE kind = 'on_demand_deck'
      AND status IN ('queued', 'generating');

  COMMENT ON COLUMN public.report_runs.detail_level IS
    'Deck grain for an on_demand_deck: channel, line_item, or ad_group. Monthly rows stay channel.';

  INSERT INTO public.migration_markers (key, note)
  VALUES (
    '0099_report_runs_detail_level',
    'report_runs.detail_level default channel, check channel/line_item/ad_group. Replace uq_report_runs_on_demand_inflight so the key is (kind, mba_number, period_start, detail_level). Monthly index unchanged. No backfill.'
  )
  ON CONFLICT (key) DO NOTHING;
END
$$;
