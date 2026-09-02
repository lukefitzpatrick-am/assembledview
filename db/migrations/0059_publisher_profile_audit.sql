-- Migration 0059: publisher_profiles.updated_by + publisher_profile_changes
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS.
--
-- Every accepted column_map write is attributed (who / previous / next / why).
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
  profiles_n int := 0;
BEGIN
  IF to_regclass('public.publisher_profiles') IS NOT NULL THEN
    SELECT count(*)::int INTO profiles_n FROM public.publisher_profiles;
  END IF;
  RAISE NOTICE '0059 pre-flight publisher_profiles rows=%', profiles_n;
END
$$;

ALTER TABLE public.publisher_profiles
  ADD COLUMN IF NOT EXISTS updated_by text;

CREATE TABLE IF NOT EXISTS public.publisher_profile_changes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  publisher_profile_id bigint NOT NULL REFERENCES public.publisher_profiles(id),
  publisher_name text NOT NULL,
  field text NOT NULL,
  header text NOT NULL,
  previous_value text,
  next_value text,
  action text NOT NULL,
  changed_by text NOT NULL,
  source text NOT NULL,
  stage_id uuid,
  CONSTRAINT publisher_profile_changes_action_check
    CHECK (action IN ('map', 'remap', 'remove'))
);

CREATE INDEX IF NOT EXISTS idx_ppc_profile
  ON public.publisher_profile_changes (publisher_profile_id, created_at DESC);

ALTER TABLE public.publisher_profile_changes ENABLE ROW LEVEL SECURITY;

INSERT INTO public.migration_markers (key, note)
VALUES (
  '0059_publisher_profile_audit',
  'publisher_profiles.updated_by + publisher_profile_changes. RLS on; no ava_readonly grant.'
)
ON CONFLICT (key) DO NOTHING;
