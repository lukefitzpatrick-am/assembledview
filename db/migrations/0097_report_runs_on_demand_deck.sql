-- Migration 0097: on-demand deck rows on report_runs
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: migration_markers guard.
--
-- Do not apply until monthly enqueue names the partial index. After this
-- file drops uq_report_runs_kind_mba_period, both inserts fail:
--   app/api/cron/reports-enqueue/route.ts onConflictDoNothing (kind, mba_number, period_start)
--   lib/reports/adminReportRunsStore.ts same target
-- Postgres will not infer a partial unique index unless ON CONFLICT repeats
-- its predicate: kind <> 'on_demand_deck'.
--
-- Do not SELECT requested_by_email until this file is applied (C-76).
-- The Drizzle mirror stays the 0095 constraint until then.
-- No backfill. RLS is already on. No ava_readonly grant.
--
-- Report window already lives on period_start and period_end.
-- requested_by_email is who asked. Monthly rows leave it null.
-- kind is free text, so on_demand_deck needs no check-constraint change.
--
-- Kinds other than on_demand_deck stay one row per kind, MBA and period start.
-- on_demand_deck may have another row once the previous row for that MBA and
-- period start is generated, failed or skipped. At most one queued or
-- generating on_demand_deck row exists for that MBA and period start.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0097_report_runs_on_demand_deck') THEN
    RAISE NOTICE '0097 already applied — no-op';
    RETURN;
  END IF;

  ALTER TABLE public.report_runs
    ADD COLUMN IF NOT EXISTS requested_by_email text;

  COMMENT ON COLUMN public.report_runs.requested_by_email IS
    'Email of the user who asked for an on_demand_deck. Null on monthly rows.';

  ALTER TABLE public.report_runs
    DROP CONSTRAINT IF EXISTS uq_report_runs_kind_mba_period;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_report_runs_kind_mba_period
    ON public.report_runs (kind, mba_number, period_start)
    WHERE kind <> 'on_demand_deck';

  CREATE UNIQUE INDEX IF NOT EXISTS uq_report_runs_on_demand_inflight
    ON public.report_runs (kind, mba_number, period_start)
    WHERE kind = 'on_demand_deck'
      AND status IN ('queued', 'generating');

  COMMENT ON TABLE public.report_runs IS
    'Campaign report runs. Kinds other than on_demand_deck stay one row per kind, MBA and period start. on_demand_deck allows another row once the previous row is generated, failed or skipped, and keeps at most one queued or generating row.';

  INSERT INTO public.migration_markers (key, note)
  VALUES (
    '0097_report_runs_on_demand_deck',
    'report_runs.requested_by_email. Replace uq_report_runs_kind_mba_period with a partial unique index for other kinds and an in-flight unique index for on_demand_deck. No backfill. Do not apply until monthly enqueue names the partial predicate.'
  )
  ON CONFLICT (key) DO NOTHING;
END
$$;
