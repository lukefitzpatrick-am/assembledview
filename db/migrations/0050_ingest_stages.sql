-- Migration 0050: ingest_stages (staged review package persistence)
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: CREATE IF NOT EXISTS.
--
-- Chat POST /api/admin/ingest/review and the later chat turn can hit different
-- Vercel instances; Fast Refresh empties a module Map. This table is the
-- durable store for the staged IngestReviewPackage.
--
-- Column type: review_package jsonb NOT NULL.
-- Why jsonb (not json, not exploded scalars): the 106-line JCD fixture
-- serialises at 306.08 KB / 313423 bytes (under the ~500 KB design-A
-- threshold), so the whole package is stored. ingest_runs (0037) already
-- records the ingest EVENT as numeric/integer scalars; this table records
-- CONTENT. jsonb matches publisher_profiles mapping blobs (queryable,
-- compressed). JSON numbers inside the package stay JSON numbers.
--
-- expires_at timestamptz NULL — NULL means retained, not expired.
-- retained_at / master_id / accepted_version_id stay NULL until Accept.
-- RLS on; no ava_readonly grant (owner path, same as 0037).

CREATE TABLE IF NOT EXISTS public.ingest_stages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stage_id uuid NOT NULL UNIQUE,
  review_package jsonb NOT NULL,
  file_name text,
  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  retained_at timestamptz,
  master_id bigint,
  accepted_version_id bigint
);

CREATE INDEX IF NOT EXISTS idx_ingest_stages_expires_at
  ON public.ingest_stages (expires_at)
  WHERE retained_at IS NULL AND expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ingest_stages_master_id
  ON public.ingest_stages (master_id)
  WHERE master_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ingest_stages_accepted_version_id
  ON public.ingest_stages (accepted_version_id)
  WHERE accepted_version_id IS NOT NULL;

ALTER TABLE public.ingest_stages ENABLE ROW LEVEL SECURITY;
