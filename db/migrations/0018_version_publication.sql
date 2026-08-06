-- Migration 0018: VC Stage 1 — publication columns on media_plan_versions
-- Apply via Supabase SQL Editor / MCP after review — AUTHOR ONLY (Luke/Claude).
-- Do NOT drizzle-kit migrate from Cursor. Idempotent.
--
-- published_at IS NOT NULL ⇔ version is published.
-- Never infer publication from campaign_status (see lib/mediaplan/versionPublication.ts).
-- Backfill: existing rows get published_at = created_at (all historical tips treated published).
-- published_by CHECK: must be lowercase or NULL (callers must normalise).

ALTER TABLE media_plan_versions
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by text;

COMMENT ON COLUMN media_plan_versions.published_at IS
  'VC Stage 1: wall-clock publication. NULL = unpublished. Do not infer from campaign_status.';
COMMENT ON COLUMN media_plan_versions.published_by IS
  'VC Stage 1: actor who published (lowercase text). NULL when unpublished or unknown.';

UPDATE media_plan_versions
SET published_at = created_at
WHERE published_at IS NULL;

UPDATE media_plan_versions
SET published_by = lower(published_by)
WHERE published_by IS NOT NULL AND published_by <> lower(published_by);

ALTER TABLE media_plan_versions
  DROP CONSTRAINT IF EXISTS media_plan_versions_published_by_lowercase;

ALTER TABLE media_plan_versions
  ADD CONSTRAINT media_plan_versions_published_by_lowercase
  CHECK (published_by IS NULL OR published_by = lower(published_by));
