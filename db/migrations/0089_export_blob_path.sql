-- Migration 0089: path of the accounts pack stored for a sent row (AUTHOR ONLY — do not apply)
--
-- Send to accounts writes the CSV and workbook into private Blob, then stamps
-- this column in the same transaction as exported_at / exported_by and the
-- finance_edits row. Value is JSON {"csv","xlsx"} of finance-exports/ pathnames.
-- No backfill. Do not drizzle-kit.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

ALTER TABLE public.finance_billing_records
  ADD COLUMN IF NOT EXISTS export_blob_path text NULL;

COMMENT ON COLUMN public.finance_billing_records.export_blob_path IS
  'JSON {"csv","xlsx"} private Blob pathnames written by Send to accounts.';

INSERT INTO public.migration_markers (key, note)
VALUES (
  '0089_export_blob_path',
  'finance_billing_records.export_blob_path for the accounts pack files'
)
ON CONFLICT (key) DO NOTHING;
