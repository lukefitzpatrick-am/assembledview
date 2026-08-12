-- MyHours CX2-1: counted sentinel for activity rows whose userId is missing
-- from Users/getAll (never silently dropped).

ALTER TABLE public.myhours_sync_runs
  ADD COLUMN IF NOT EXISTS unknown_user_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.myhours_sync_runs.unknown_user_count IS
  'Distinct Users/getAll-missing userIds whose activity rows were skipped (CX2-1).';
