-- Migration 0049: publisher_profiles.line_granularity
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: ADD COLUMN IF NOT EXISTS + UPDATE all rows to per_row.
--
-- Doctrine: if it is a row/line on the publisher's media plan, it is a
-- row/line on ours. Seeded publishers (QMS / JCDecaux / SCA / SEN) are
-- all per_row. 'grouped' exists as config for a future publisher whose
-- file is not row-per-buy — no seeded profile uses it.
--
-- Seeds: lib/mediaplans/ingest/seeds/publisherProfiles.json must agree.

ALTER TABLE public.publisher_profiles
  ADD COLUMN IF NOT EXISTS line_granularity text NOT NULL DEFAULT 'per_row';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'publisher_profiles_line_granularity_check'
  ) THEN
    ALTER TABLE public.publisher_profiles
      ADD CONSTRAINT publisher_profiles_line_granularity_check
      CHECK (line_granularity IN ('per_row', 'grouped'));
  END IF;
END
$$;

UPDATE public.publisher_profiles
   SET line_granularity = 'per_row',
       updated_at = now();

COMMENT ON COLUMN public.publisher_profiles.line_granularity IS
  'per_row: each classified buy row is one line. grouped: collapse by grouping_keys (unused by seeded publishers).';
