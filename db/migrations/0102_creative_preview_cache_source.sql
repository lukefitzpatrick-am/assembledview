-- Migration 0102: creative_preview_cache source columns
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: migration_markers guard. Requires 0098 applied (raises otherwise).
--
-- Adds what the nightly preview job (GET /api/cron/creative-previews) needs:
--   preview_kind  V_CREATIVE_ASSETS.preview_kind ('image' | 'video'); the kind of
--                 creative the cached still represents, not the file type (mime_type).
--   view_url      V_CREATIVE_ASSETS.view_url (Meta shareable preview link; null for TikTok).
--   source_hash   sha256 hex of the source image URL with signing and cache
--                 parameters removed (lib/creative/previews/sourceHash.ts). The job
--                 re-fetches only when this changes, so a re-signed Meta URL is not a change.
-- No backfill. No new grants. RLS stays on with no policies (set by 0098).
-- Do not read these columns until the marker 0102_creative_preview_cache_source exists (C-76).
-- Mirror: db/schema/creativePreviewCache.ts.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.migration_markers
    WHERE key = '0102_creative_preview_cache_source'
  ) THEN
    RAISE NOTICE '0102 already applied — no-op';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.migration_markers
    WHERE key = '0098_ga4_gsc_accounts_and_creative_previews'
  ) THEN
    RAISE EXCEPTION '0102 requires 0098 (0098_ga4_gsc_accounts_and_creative_previews) to be applied first';
  END IF;

  ALTER TABLE public.creative_preview_cache
    ADD COLUMN IF NOT EXISTS preview_kind text,
    ADD COLUMN IF NOT EXISTS view_url     text,
    ADD COLUMN IF NOT EXISTS source_hash  text;

  INSERT INTO public.migration_markers (key, note)
  VALUES (
    '0102_creative_preview_cache_source',
    'creative_preview_cache preview_kind, view_url, source_hash. No backfill. No new grants.'
  )
  ON CONFLICT (key) DO NOTHING;
END
$$;
