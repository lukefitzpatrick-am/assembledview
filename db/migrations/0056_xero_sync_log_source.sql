-- Migration 0056: typed source on xero_sync_log (AUTHOR ONLY — do not apply yet)
-- Authored with CB-FIX-1. The live 22P02 fix is CASE-guarded notes::jsonb in
-- lib/xero/syncLogNotes.ts. This column is the durable replacement: filter
-- `source IS DISTINCT FROM 'pull-xero'` without casting free text.
--
-- Do not drizzle-kit migrate. Do not apply until writers populate it
-- (runXeroSync + pullXero persist). Do not backfill or rewrite notes.
-- Legacy rows stay source NULL = not a pull (same as pre-CB-5 eligibility).

ALTER TABLE public.xero_sync_log
  ADD COLUMN IF NOT EXISTS source text NULL;

COMMENT ON COLUMN public.xero_sync_log.source IS
  'Run origin. pull-xero = finance Pull from Xero (skipped by cron resume). NULL = cron/legacy. Independent of notes (text; may be prose or JSON).';
