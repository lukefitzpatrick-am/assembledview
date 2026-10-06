-- AUTHOR ONLY. Apply before the xero-queue assign/resolve deploy.
-- No backfill. Open rows stay resolved IS NOT TRUE.
-- Do not drizzle-kit this file; the schema mirror is db/schema/ported.ts.

ALTER TABLE xero_sync_exceptions
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by text,
  ADD COLUMN IF NOT EXISTS resolution text;
