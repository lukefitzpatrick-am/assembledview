-- Migration 0040: Fireflies auto-create roster tasks
-- Apply via Supabase SQL Editor — AUTHOR ONLY (Luke / Claude). Idempotent.
--
-- Distinguishes auto-created meeting tasks from human-accepted Inbox tasks
-- (both use source='ava'). ava_auto_key is the idempotency key per
-- (source_note_id, block name, item line).

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS auto_created boolean NOT NULL DEFAULT false;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS ava_auto_key text;

COMMENT ON COLUMN public.tasks.auto_created IS
  'True when Fireflies sync created this task from a uniquely resolved roster action-item block.';

COMMENT ON COLUMN public.tasks.ava_auto_key IS
  'Idempotency key: hash of (source_note_id, block name, item line). Unique when set.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_ava_auto_key
  ON public.tasks (ava_auto_key)
  WHERE ava_auto_key IS NOT NULL;
