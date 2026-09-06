-- Migration 0068: ingest_stages.source_file
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: ADD COLUMN IF NOT EXISTS.
--
-- Private Vercel Blob pointer for the staged workbook
-- ({ url, pathname, name, size, mime, uploadedAt, sha256 }).
-- Path: ingest/{stageId}/{filename}. Retained stages keep it; expired
-- stages delete the Blob with the row. RLS unchanged; no ava_readonly grant.
-- Do not SELECT this column against live Postgres before applying (C-76).
-- Runtime overlay + fail-soft read/write until applied.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
DECLARE
  stages_n int := 0;
BEGIN
  IF to_regclass('public.ingest_stages') IS NOT NULL THEN
    SELECT count(*)::int INTO stages_n FROM public.ingest_stages;
  END IF;
  RAISE NOTICE '0068 pre-flight ingest_stages rows=%', stages_n;
END
$$;

ALTER TABLE public.ingest_stages
  ADD COLUMN IF NOT EXISTS source_file jsonb;

INSERT INTO public.migration_markers (key, note)
VALUES (
  '0068_ingest_stages_source_file',
  'ingest_stages.source_file jsonb. Private Blob pointer for the staged workbook. RLS unchanged.'
)
ON CONFLICT (key) DO NOTHING;
