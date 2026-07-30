-- Migration 0008: PC2 — approved_slice + schedule_component adserving
-- Apply via Supabase SQL Editor / MCP after review — AUTHOR ONLY (Luke/Claude).
-- Do NOT drizzle-kit migrate from Cursor. Idempotent.
--
-- 1. approved_slice jsonb on media_plan_versions — frozen at publish/approve:
--    { totalCents, lines: [{ lineItemId, months, mediaCents, feeCents,
--      adservingCents, productionCents }] }
-- 2. schedule_component enum += 'adserving' so I-1 full scope is queryable
--    as typed schedule_months rows (per-line per-month). Production stays
--    as media component on production line_items (no new enum value).

-- ---------------------------------------------------------------------------
-- 1. approved_slice
-- ---------------------------------------------------------------------------
ALTER TABLE media_plan_versions
  ADD COLUMN IF NOT EXISTS approved_slice jsonb;

COMMENT ON COLUMN media_plan_versions.approved_slice IS
  'PC2: frozen approved billing law at publish — { totalCents, lines[] }. Never mutate after write.';

-- ---------------------------------------------------------------------------
-- 2. schedule_component += adserving
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'schedule_component'
      AND e.enumlabel = 'adserving'
  ) THEN
    ALTER TYPE schedule_component ADD VALUE 'adserving';
  END IF;
END
$$;
