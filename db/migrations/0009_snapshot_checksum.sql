-- Migration 0009: PC3 — snapshot_checksum on media_plan_versions
-- Apply via Supabase SQL Editor / MCP after review — AUTHOR ONLY (Luke/Claude).
-- Do NOT drizzle-kit migrate from Cursor. Idempotent.
--
-- snapshot_checksum = sha256 hex (full) of canonical
-- (schedule_months rows + approved_slice + mba_fee_snapshots.fees)
-- Written on publish inside savePlanVersion; never mutated afterwards.
-- Doc footer uses first 8 hex chars (hash8).

ALTER TABLE media_plan_versions
  ADD COLUMN IF NOT EXISTS snapshot_checksum text;

COMMENT ON COLUMN media_plan_versions.snapshot_checksum IS
  'PC3: sha256 hex of canonical schedule_months + approved_slice + fee snapshot at publish. Doc footer uses left(8).';
