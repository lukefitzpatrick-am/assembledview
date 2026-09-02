-- Migration 0062: JCDecaux column_map MEDIA BOUGHT RATE → media_rate:bought
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Merges one key onto the live JCDecaux column_map (preserves the hand repair).
-- Seeds: lib/mediaplans/ingest/seeds/publisherProfiles.json must agree.

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
BEGIN
  IF to_regclass('public.publisher_profiles') IS NOT NULL THEN
    SELECT count(*)::int INTO profiles_n FROM public.publisher_profiles;
  END IF;
  RAISE NOTICE '0062 pre-flight publisher_profiles rows=%', profiles_n;
END
$$;

UPDATE public.publisher_profiles
SET
  column_map = column_map || jsonb_build_object(
    'MEDIA BOUGHT RATE', 'media_rate:bought'
  ),
  updated_at = now()
WHERE publisher_name = 'JCDecaux'
  AND NOT EXISTS (
    SELECT 1 FROM public.migration_markers
    WHERE key = '0062_publisher_profiles_jcd_bought_rate'
  );

INSERT INTO public.migration_markers (key, note)
VALUES (
  '0062_publisher_profiles_jcd_bought_rate',
  'JCDecaux column_map MEDIA BOUGHT RATE → media_rate:bought. jsonb merge only; do not rewrite the rest of the profile.'
)
ON CONFLICT (key) DO NOTHING;
