-- Migration 0058: planning_audience_uploads + planning_uploaded_audiences
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: CREATE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
--
-- Staged Roy Morgan workbook parse (48h TTL) then saved uploaded audiences.
-- parse_json / mapping_json / channels_json / definition_json are jsonb
-- (same as ingest_stages.review_package — queryable, compressed).
-- expires_at NULL means retained, not expired (ingest_stages contract).
-- RLS on; no ava_readonly grant (owner path, same as 0050 / 0037).

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

-- Pre-flight always runs so the apply log records the starting position,
-- including on a re-run that skips nothing new.
DO $$
DECLARE
  uploads_n int := 0;
  audiences_n int := 0;
BEGIN
  IF to_regclass('public.planning_audience_uploads') IS NOT NULL THEN
    SELECT count(*)::int INTO uploads_n FROM public.planning_audience_uploads;
  END IF;
  IF to_regclass('public.planning_uploaded_audiences') IS NOT NULL THEN
    SELECT count(*)::int INTO audiences_n FROM public.planning_uploaded_audiences;
  END IF;
  RAISE NOTICE '0058 pre-flight planning_audience_uploads rows=%', uploads_n;
  RAISE NOTICE '0058 pre-flight planning_uploaded_audiences rows=%', audiences_n;
END
$$;

CREATE TABLE IF NOT EXISTS public.planning_audience_uploads (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  clients_id bigint,
  file_name text NOT NULL,
  blob_url text,
  byte_size bigint,
  wave_code text,
  survey_period text,
  filter_label text,
  parse_json jsonb NOT NULL,
  uploaded_by_email text NOT NULL,
  status text NOT NULL DEFAULT 'staged',
  expires_at timestamptz,
  retained_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_planning_audience_uploads_clients_id
  ON public.planning_audience_uploads (clients_id);

CREATE INDEX IF NOT EXISTS idx_planning_audience_uploads_expires_at
  ON public.planning_audience_uploads (expires_at)
  WHERE retained_at IS NULL AND expires_at IS NOT NULL;

ALTER TABLE public.planning_audience_uploads ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.planning_uploaded_audiences (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  upload_id bigint NOT NULL REFERENCES public.planning_audience_uploads(id),
  clients_id bigint,
  name text NOT NULL,
  sheet_name text NOT NULL,
  block_id text NOT NULL,
  segment_key text NOT NULL UNIQUE,
  wave_code text,
  filter_label text,
  audience_wc numeric,
  unweighted_n integer,
  universe_wc numeric,
  mapping_json jsonb NOT NULL,
  channels_json jsonb NOT NULL,
  definition_json jsonb NOT NULL,
  created_by_email text NOT NULL,
  is_archived boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_planning_uploaded_audiences_clients_id
  ON public.planning_uploaded_audiences (clients_id);

CREATE INDEX IF NOT EXISTS idx_planning_uploaded_audiences_upload_id
  ON public.planning_uploaded_audiences (upload_id);

CREATE INDEX IF NOT EXISTS idx_planning_uploaded_audiences_not_archived
  ON public.planning_uploaded_audiences (clients_id)
  WHERE is_archived = false;

ALTER TABLE public.planning_uploaded_audiences ENABLE ROW LEVEL SECURITY;

INSERT INTO public.migration_markers (key, note)
VALUES (
  '0058_planning_uploaded_audiences',
  'planning_audience_uploads + planning_uploaded_audiences. RLS on; no ava_readonly grant.'
)
ON CONFLICT (key) DO NOTHING;
