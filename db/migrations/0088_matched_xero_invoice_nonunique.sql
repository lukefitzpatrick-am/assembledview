-- Migration 0088: many app billing rows may share one Xero invoice (AUTHOR ONLY — do not apply)
--
-- 0057 authored a partial UNIQUE index `uq_finance_billing_records_matched_xero_invoice_id`
-- (one settling invoice, one app row). Nightly matching stamps every app row whose
-- expected totals sum to the invoice sub_total within $1, so that unique index
-- has to go. The non-unique lookup index stays.
--
-- Also stores the match resolution and which figure was the expected amount.
-- No backfill. Do not drizzle-kit. Apply before the invoices cron that writes
-- these columns.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DROP INDEX IF EXISTS public.uq_finance_billing_records_matched_xero_invoice_id;

CREATE INDEX IF NOT EXISTS idx_finance_billing_records_matched_xero_invoice_id
  ON public.finance_billing_records (matched_xero_invoice_id);

ALTER TABLE public.finance_billing_records
  ADD COLUMN IF NOT EXISTS xero_match_resolution text NULL,
  ADD COLUMN IF NOT EXISTS xero_expected_source text NULL;

COMMENT ON COLUMN public.finance_billing_records.xero_match_resolution IS
  'auto_adopted | differs | adopted | disputed. NULL when unmatched.';

COMMENT ON COLUMN public.finance_billing_records.xero_expected_source IS
  'approved_snapshot | schedule_month | legacy_billed. Which figure the match compared to sub_total.';

INSERT INTO public.migration_markers (key, note)
VALUES (
  '0088_matched_xero_invoice_nonunique',
  'Drop uq_finance_billing_records_matched_xero_invoice_id; keep non-unique index; add resolution and expected_source.'
)
ON CONFLICT (key) DO NOTHING;
