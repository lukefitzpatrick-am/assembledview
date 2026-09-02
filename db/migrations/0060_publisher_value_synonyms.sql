-- Migration 0060: publisher_value_synonyms (learned ingest value map)
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
--
-- Publisher-scoped synonym auto-applies on the next upload. A global row
-- (publisher_id NULL) is a suggestion on the value card — never auto-applied.
-- Seed nothing: every row is earned by a human answering a value card.
-- RLS on; no ava_readonly grant (owner path, same as 0050 / 0037 / 0059).

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

-- Pre-flight always runs so the apply log records the starting position,
-- including on a re-run that skips nothing new.
DO $$
DECLARE
  profiles_n int := 0;
  stages_n int := 0;
BEGIN
  IF to_regclass('public.publisher_profiles') IS NOT NULL THEN
    SELECT count(*)::int INTO profiles_n FROM public.publisher_profiles;
  END IF;
  IF to_regclass('public.ingest_stages') IS NOT NULL THEN
    SELECT count(*)::int INTO stages_n FROM public.ingest_stages;
  END IF;
  RAISE NOTICE '0060 pre-flight publisher_profiles rows=% ingest_stages rows=%', profiles_n, stages_n;
END
$$;

CREATE TABLE IF NOT EXISTS public.publisher_value_synonyms (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  publisher_id bigint REFERENCES public.publishers(id),
  media_type text NOT NULL,
  vocabulary text NOT NULL,
  av_field text NOT NULL,
  raw_value text NOT NULL,
  raw_value_display text NOT NULL,
  av_canonical text NOT NULL,
  learned_from_stage_id uuid,
  created_by text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  retired_at timestamptz,
  retired_by text
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pvs_scope
  ON public.publisher_value_synonyms (coalesce(publisher_id, 0), vocabulary, raw_value)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_pvs_lookup
  ON public.publisher_value_synonyms (vocabulary, raw_value)
  WHERE is_active = true;

ALTER TABLE public.publisher_value_synonyms ENABLE ROW LEVEL SECURITY;

INSERT INTO public.migration_markers (key, note)
VALUES (
  '0060_publisher_value_synonyms',
  'publisher_value_synonyms: per-publisher learned values + global suggestion tier. RLS on; no ava_readonly grant. Seed nothing.'
)
ON CONFLICT (key) DO NOTHING;
