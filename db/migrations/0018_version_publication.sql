-- Migration 0018: VC Stage 1 — publication columns on media_plan_versions
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
--
-- published_at IS NOT NULL  <=>  version is published.
-- Never infer publication from campaign_status (lib/mediaplan/versionPublication.ts).
--
-- The historical backfill ran once, on 2026-08-06, and is recorded in
-- migration_markers. It must NEVER run again: after VC1-2, a NULL published_at
-- means a genuine unpublished draft, and re-backfilling would publish every
-- draft in the system. See 0018a for the correction that made this safe.

ALTER TABLE media_plan_versions
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by text;

COMMENT ON COLUMN media_plan_versions.published_at IS
  'VC Stage 1: wall-clock publication. NULL = unpublished. Do not infer from campaign_status.';
COMMENT ON COLUMN media_plan_versions.published_by IS
  'VC Stage 1: actor who published (lowercase text). NULL when unpublished or unknown.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.migration_markers
     WHERE key = '0018_version_publication_backfill'
  ) THEN
    UPDATE media_plan_versions SET published_at = created_at WHERE published_at IS NULL;
    UPDATE media_plan_versions SET published_at = NULL
     WHERE lower(trim(COALESCE(campaign_status,''))) = 'draft';
    INSERT INTO public.migration_markers (key, note)
    VALUES ('0018_version_publication_backfill', 'Historical publication backfill.');
  ELSE
    RAISE NOTICE '0018: historical backfill already applied — skipping.';
  END IF;
END
$$;

ALTER TABLE media_plan_versions
  DROP CONSTRAINT IF EXISTS media_plan_versions_published_by_lowercase;
ALTER TABLE media_plan_versions
  ADD CONSTRAINT media_plan_versions_published_by_lowercase
  CHECK (published_by IS NULL OR published_by = lower(published_by));

CREATE INDEX IF NOT EXISTS idx_mpv_published_at
  ON media_plan_versions (published_at) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mpv_master_published
  ON media_plan_versions (master_id, published_at DESC) WHERE published_at IS NOT NULL;
