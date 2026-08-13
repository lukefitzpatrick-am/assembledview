-- Migration 0038: drop SCA Days from column_map (IGNORE-BY-DEFAULT).
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Days is not a radio template field; stuffing it into placement is forbidden.
-- Seeds: lib/mediaplans/ingest/seeds/publisherProfiles.json must agree.
-- Number is 0038 because 0036 is publisher_id FK and 0037 is ingest_runs.

UPDATE public.publisher_profiles
SET
  column_map = column_map - 'Days',
  updated_at = now()
WHERE publisher_name = 'SCA';
