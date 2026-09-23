-- Migration 0087: stage + duration on xero_sync_log (AUTHOR ONLY — do not apply yet)
--
-- The nightly Xero cron is four functions. Each writes its own row.
-- stage is invoices | import | contacts | pdfs. NULL = legacy combined run
-- (still the invoice/contacts watermark until a staged success exists).
-- duration_ms is wall time of that stage. NULL while status = running
-- and on every legacy row.
--
-- No backfill. Do not drizzle-kit. Apply before the split crons deploy:
-- the writers SELECT and INSERT these columns.

ALTER TABLE public.xero_sync_log
  ADD COLUMN IF NOT EXISTS stage text NULL,
  ADD COLUMN IF NOT EXISTS duration_ms bigint NULL;

COMMENT ON COLUMN public.xero_sync_log.stage IS
  'Cron stage: invoices | import | contacts | pdfs. NULL = legacy combined run (pre-split watermark).';

COMMENT ON COLUMN public.xero_sync_log.duration_ms IS
  'Wall time of the stage run in milliseconds. NULL while status=running and on legacy rows.';
