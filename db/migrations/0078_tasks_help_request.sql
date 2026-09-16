-- Migration 0078: Codex ask-for-help parent/child columns
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: ADD COLUMN IF NOT EXISTS + index IF NOT EXISTS + migration_markers guard.
--
-- Do not SELECT these columns against live Postgres until this file is applied (C-76).
-- Mirror: db/schema/codex.ts.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0078_tasks_help_request') THEN
    RAISE NOTICE '0078 already applied — no-op';
    RETURN;
  END IF;

  IF to_regclass('public.tasks') IS NULL THEN
    RAISE EXCEPTION '0078 requires public.tasks (apply 0013 first)';
  END IF;

  ALTER TABLE public.tasks
    ADD COLUMN IF NOT EXISTS parent_task_id bigint REFERENCES public.tasks(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS help_requested_by_email text,
    ADD COLUMN IF NOT EXISTS help_prior_status text;

  CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id
    ON public.tasks (parent_task_id);

  COMMENT ON COLUMN public.tasks.parent_task_id IS
    'Help-request child → parent task. NULL on ordinary tasks. ON DELETE SET NULL.';
  COMMENT ON COLUMN public.tasks.help_requested_by_email IS
    'Caller who last asked for help on this parent.';
  COMMENT ON COLUMN public.tasks.help_prior_status IS
    'Status to restore when the last open help child is done. Set only when leaving a non-waiting status.';

  INSERT INTO public.migration_markers (key, note)
  VALUES (
    '0078_tasks_help_request',
    'tasks.parent_task_id + help_requested_by_email + help_prior_status for Codex ask-for-help.'
  )
  ON CONFLICT (key) DO NOTHING;
END
$$;
