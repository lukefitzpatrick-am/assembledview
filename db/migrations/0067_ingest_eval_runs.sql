-- Migration 0067: ingest_eval_runs (per-publisher ingest parser scores)
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: CREATE IF NOT EXISTS.
--
-- Written by GET /api/cron/ingest-eval (weekly). One row per publisher per
-- run. scores jsonb holds fixture breakdown. RLS on; no ava_readonly grant
-- (owner path, same as ingest_runs / ingest_stages).
-- Do not SELECT this table against live Postgres before applying (C-76).
-- Runtime overlay fail-softs until applied.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  RAISE NOTICE '0067 pre-flight ingest_eval_runs (new table)';
END
$$;

CREATE TABLE IF NOT EXISTS public.ingest_eval_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  publisher_id bigint REFERENCES public.publishers(id),
  publisher_name text NOT NULL,
  fixture_id text,
  corpus_kind text NOT NULL
    CHECK (corpus_kind IN ('golden', 'full')),
  line_count integer NOT NULL DEFAULT 0,
  money_pct numeric NOT NULL,
  dates_pct numeric NOT NULL,
  format_pct numeric NOT NULL,
  placement_pct numeric NOT NULL,
  buy_type_pct numeric NOT NULL,
  overall_pct numeric NOT NULL,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  ran_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingest_eval_runs_publisher_ran
  ON public.ingest_eval_runs (publisher_name, ran_at DESC);

CREATE INDEX IF NOT EXISTS idx_ingest_eval_runs_ran_at
  ON public.ingest_eval_runs (ran_at DESC);

ALTER TABLE public.ingest_eval_runs ENABLE ROW LEVEL SECURITY;

INSERT INTO public.migration_markers (key, note)
VALUES (
  '0067_ingest_eval_runs',
  'ingest_eval_runs table for weekly parser accuracy scores'
)
ON CONFLICT (key) DO NOTHING;
