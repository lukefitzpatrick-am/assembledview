-- Migration 0035: SCA known reference columns → reference:ignore (ingest AVA gate).
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Merges keys into existing column_map (preserves remaps).
-- Seeds: lib/mediaplans/ingest/seeds/publisherProfiles.json must agree.
-- Do NOT map SEN money columns here — those stay unmapped until rates are mapped for real.

UPDATE public.publisher_profiles
SET
  column_map = column_map || jsonb_build_object(
    'Market Rate', 'reference:ignore',
    'Market Total', 'reference:ignore',
    'Total Stations', 'reference:ignore',
    'Total Impacts', 'reference:ignore',
    'Client Rate', 'reference:ignore'
  ),
  updated_at = now()
WHERE publisher_name = 'SCA';
