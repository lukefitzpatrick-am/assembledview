-- Migration 0034: money column_map targets for QMS / SCA / JCDecaux (MR ingest).
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Merges typed money keys into existing column_map (preserves remaps).
-- Seeds: lib/mediaplans/ingest/seeds/publisherProfiles.json must agree.

UPDATE public.publisher_profiles
SET
  column_map = column_map || jsonb_build_object(
    '*WEEKLY MARKET RATE (STATIC LF - 4 WEEKS)', 'media_rate:weekly',
    'PROD', 'charge:production',
    'INSTALL', 'charge:installation'
  ),
  updated_at = now()
WHERE publisher_name = 'QMS';

UPDATE public.publisher_profiles
SET
  column_map = column_map || jsonb_build_object(
    'Client Total', 'media_amount:stated'
  ),
  updated_at = now()
WHERE publisher_name = 'SCA';

UPDATE public.publisher_profiles
SET
  column_map = column_map || jsonb_build_object(
    'Lunar (4 week) Market Rate', 'media_rate:lunar',
    'Production Charge', 'charge:production',
    'Installation Charge', 'charge:installation',
    'MEDIA VALUE (inc. STA)', 'media_amount:stated'
  ),
  notes = 'OOH status matrix. Stated MEDIA VALUE (inc. STA) is authoritative per line; lunar/4×weeks is a cross-check warning only. Village weight shares a header with village name — weight not separately mapped.',
  updated_at = now()
WHERE publisher_name = 'JCDecaux';
