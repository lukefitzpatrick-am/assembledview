-- Migration 0055: unique ingest panels on (line_item_id, source_row_ref)
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: CREATE UNIQUE INDEX IF NOT EXISTS.
--
-- Natural key evidence:
--   0023 / lineItemPanels.migration.test.ts: 500 pack rows share one line_item_id
--     (`pack-line-1`). Unique on line_item_id alone is wrong.
--   (mba_number, line_item_id, site_number) fails JCD (blank/summary site_number)
--     and radio (no site). Pack test rows have null site_number.
--   docs/brain/DISCOVERY-ingest-line-identity.md: source_row_ref = "{sheet}!r{excelRow}"
--     is the per-row ingest identity. insertIngestPanels may append `\nRAW:{json}` —
--     uniqueness is on the stored value.
--
-- Partial WHERE source_row_ref IS NOT NULL:
--   Hand-created panels typically have null source_row_ref. Postgres UNIQUE
--   allows multiple NULLs; the partial predicate means they do not violate.
--   Duplicate ingest of the same line+row does violate.
--
-- Sibling line_item_panel_flights already has (panel_id, period_start) unique.
-- Table has zero rows in production — free to add now.
--
-- Applied (SQL Editor / DIRECT_URL equivalent). Idempotent re-run is safe.

CREATE UNIQUE INDEX IF NOT EXISTS uq_line_item_panels_line_source
  ON public.line_item_panels (line_item_id, source_row_ref)
  WHERE source_row_ref IS NOT NULL;
