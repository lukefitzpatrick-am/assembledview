-- Migration 0061: publisher_profiles.field_defaults
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: ADD COLUMN IF NOT EXISTS.
--
-- Canonical AV field → one value for every line (ingest field-card constant).
-- Same audited write path as column_map (publisher_profile_changes.field =
-- 'field_defaults'). RLS unchanged; no ava_readonly grant.

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
  RAISE NOTICE '0061 pre-flight publisher_profiles rows=%', profiles_n;
END
$$;

ALTER TABLE public.publisher_profiles
  ADD COLUMN IF NOT EXISTS field_defaults jsonb NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO public.migration_markers (key, note)
VALUES (
  '0061_publisher_profile_field_defaults',
  'publisher_profiles.field_defaults jsonb. Canonical AV field → one value for every line. RLS unchanged.'
)
ON CONFLICT (key) DO NOTHING;
