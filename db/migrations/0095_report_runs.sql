-- Migration 0095: report_runs and report_digest_sends
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: CREATE TABLE IF NOT EXISTS + migration_markers guard.
--
-- Do not SELECT these tables against live Postgres until this file is applied (C-76).
-- Mirror: db/schema/reportRuns.ts.
-- report_runs is one generated deck per kind, MBA and period start.
-- report_digest_sends is one digest email per kind and period start.

CREATE TABLE IF NOT EXISTS public.migration_markers (
    key         text primary key,
    applied_at  timestamptz not null default now(),
    note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0095_report_runs') THEN
    RAISE NOTICE '0095 already applied, no-op';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.report_runs (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind                   text NOT NULL DEFAULT 'monthly_campaign',
    mba_number             text NOT NULL,
    client_id              bigint NULL REFERENCES public.clients (id),
    period_start           date NOT NULL,
    period_end             date NOT NULL,
    status                 text NOT NULL,
    attempts               int NOT NULL DEFAULT 0,
    blob_pathname          text,
    file_name              text,
    error                  text,
    skip_reason            text,
    commentary_generated   boolean,
    created_at             timestamptz NOT NULL DEFAULT now(),
    started_at             timestamptz,
    finished_at            timestamptz,
    CONSTRAINT report_runs_status_check CHECK (
      status IN ('queued', 'generating', 'generated', 'failed', 'skipped')
    ),
    CONSTRAINT uq_report_runs_kind_mba_period UNIQUE (kind, mba_number, period_start)
  );

  CREATE INDEX IF NOT EXISTS idx_report_runs_kind_period_status
    ON public.report_runs (kind, period_start, status);

  COMMENT ON TABLE public.report_runs IS
    'One campaign report run per kind, MBA and period start.';

  CREATE TABLE IF NOT EXISTS public.report_digest_sends (
    kind           text NOT NULL,
    period_start   date NOT NULL,
    sent_at        timestamptz NOT NULL DEFAULT now(),
    recipients     text[] NOT NULL,
    run_count      int NOT NULL,
    PRIMARY KEY (kind, period_start)
  );

  COMMENT ON TABLE public.report_digest_sends IS
    'One report digest email per kind and period start, written after the email succeeds.';

  ALTER TABLE public.report_runs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.report_digest_sends ENABLE ROW LEVEL SECURITY;

  INSERT INTO public.migration_markers (key, note)
  VALUES (
    '0095_report_runs',
    'report_runs and report_digest_sends. RLS on, no policies. No backfill.'
  )
  ON CONFLICT (key) DO NOTHING;
END
$$;
