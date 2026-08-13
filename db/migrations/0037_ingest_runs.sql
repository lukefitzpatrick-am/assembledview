-- Migration 0037: ingest_runs (per-upload history)
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: CREATE IF NOT EXISTS.
--
-- Written on Accept, Cancel, and blocked Accept (409). RLS on; no ava_readonly
-- grant (owner path, same pattern as 0028 myhours_sync_runs).
-- required_coverage is MR-11 completeness (0–1), nullable when absent.

CREATE TABLE IF NOT EXISTS public.ingest_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  publisher_id bigint REFERENCES public.publishers(id),
  publisher_name text,
  file_name text,
  uploaded_by text,
  detected_confidence numeric,
  required_coverage numeric,
  line_item_count integer NOT NULL DEFAULT 0,
  panel_count integer NOT NULL DEFAULT 0,
  burst_count integer NOT NULL DEFAULT 0,
  money_delta numeric,
  outcome text NOT NULL
    CHECK (outcome IN ('accepted', 'cancelled', 'blocked')),
  outcome_reason text,
  accepted_version_id bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingest_runs_publisher_id
  ON public.ingest_runs (publisher_id);

CREATE INDEX IF NOT EXISTS idx_ingest_runs_created_at
  ON public.ingest_runs (created_at DESC);

ALTER TABLE public.ingest_runs ENABLE ROW LEVEL SECURITY;
