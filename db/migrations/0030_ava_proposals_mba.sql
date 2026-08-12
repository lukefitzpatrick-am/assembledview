-- Fireflies Stage 4: MBA on proposals for duplicate-flag (same MBA + title).
-- Also widen client_notes.matched_by for title/internal attribution from Stage 3.

ALTER TABLE public.ava_task_proposals
  ADD COLUMN IF NOT EXISTS proposed_mba_number text;

CREATE INDEX IF NOT EXISTS idx_ava_task_proposals_mba
  ON public.ava_task_proposals (proposed_mba_number)
  WHERE proposed_mba_number IS NOT NULL;

COMMENT ON COLUMN public.ava_task_proposals.proposed_mba_number IS
  'MBA from Fireflies attribution; used for inbox duplicate flag vs open tasks.';

-- Drop and recreate matched_by check to allow title + internal (Stage 3 attribution).
ALTER TABLE public.client_notes
  DROP CONSTRAINT IF EXISTS client_notes_matched_by_check;

ALTER TABLE public.client_notes
  ADD CONSTRAINT client_notes_matched_by_check
  CHECK (
    matched_by IS NULL
    OR matched_by IN ('domain', 'keyword', 'manual', 'title', 'internal')
  );
