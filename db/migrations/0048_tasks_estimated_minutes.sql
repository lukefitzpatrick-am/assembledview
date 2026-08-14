-- Migration 0048: Planner estimate on tasks
-- Apply via Supabase SQL Editor — AUTHOR ONLY (Luke / Claude). Idempotent.
-- Do not apply from the app. Do not drizzle-kit.
--
-- Planner estimate in minutes. Feeds MyHours estimate-vs-actual matching
-- and assignee capacity (CX2). Codex UI stores/displays this column only
-- after this migration exists on the live DB.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS estimated_minutes integer;

COMMENT ON COLUMN public.tasks.estimated_minutes IS
  'Planner estimate. Feeds MyHours estimate-vs-actual matching and assignee capacity.';
