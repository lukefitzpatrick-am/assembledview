-- Fireflies Stage 3: store duration + transcript URL + internal flag on client_notes.
-- Existing columns already cover title/date/attendees/summary body/mba/client/matched_by.
-- Why: sync must persist duration + transcript_url as first-class fields (not only JSON body);
-- internal meetings need client_id NULL + is_internal so they stay out of the unattributed queue
-- while remaining queryable for time context.

ALTER TABLE public.client_notes
  ADD COLUMN IF NOT EXISTS duration_seconds integer,
  ADD COLUMN IF NOT EXISTS transcript_url text,
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.client_notes.duration_seconds IS
  'Meeting length in seconds (from Fireflies duration minutes × 60).';
COMMENT ON COLUMN public.client_notes.transcript_url IS
  'Fireflies app transcript URL.';
COMMENT ON COLUMN public.client_notes.is_internal IS
  'True when all attendee domains are Assembled — client_id stays NULL; not unattributed.';
