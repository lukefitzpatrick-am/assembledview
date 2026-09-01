-- Migration 0053: client billing lifecycle stamps on finance_billing_records
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
--
-- Lifecycle state is derived from evidence, never stored as a `state` column.
-- This adds the missing approval stamp and the link from an app billing record
-- to the Xero invoice that settles it. exported_at / exported_by already exist
-- and stay; they are the "we sent the sheet" stamp (writers currently leave
-- them null — later CB work starts writing them).
--
-- Do NOT drop billed / billed_at / billed_by / billed_amount_cents /
-- billed_lines_hash here. CB-2 stops writing them; a later cleanup drops them
-- once nothing reads them.
--
-- Do NOT add an account-lead (or any other) column on clients — approval is
-- attributed (approved_by / approved_by_name), not routed.
-- Do NOT touch xero_ar_invoices or xero_ap_bills. matched_xero_invoice_id is
-- a text copy of xero_ar_invoices.xero_invoice_id with no FK.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

-- Pre-flight always runs so the apply log records the starting position,
-- including on a re-run that skips DDL.
DO $$
DECLARE
  rec record;
  total_n int := 0;
BEGIN
  RAISE NOTICE '0053 pre-flight finance_billing_records by invoice_key prefix:';
  FOR rec IN
    SELECT
      CASE
        WHEN invoice_key IS NULL OR btrim(invoice_key) = '' THEN '(null/empty)'
        WHEN position(':' in invoice_key) > 0 THEN split_part(invoice_key, ':', 1)
        ELSE '(no-prefix)'
      END AS prefix,
      count(*)::int AS n
    FROM public.finance_billing_records
    GROUP BY 1
    ORDER BY 1
  LOOP
    total_n := total_n + rec.n;
    RAISE NOTICE '  prefix=% rows=%', rec.prefix, rec.n;
  END LOOP;
  RAISE NOTICE '  total rows=%', total_n;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.migration_markers
     WHERE key = '0053_client_billing_lifecycle'
  ) THEN
    ALTER TABLE public.finance_billing_records
      ADD COLUMN IF NOT EXISTS approved_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS approved_by bigint NULL,
      ADD COLUMN IF NOT EXISTS approved_by_name text NULL,
      ADD COLUMN IF NOT EXISTS approved_amount_cents bigint NULL,
      ADD COLUMN IF NOT EXISTS approved_lines_hash text NULL,
      ADD COLUMN IF NOT EXISTS matched_xero_invoice_id text NULL,
      ADD COLUMN IF NOT EXISTS matched_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS matched_by text NULL;

    COMMENT ON COLUMN public.finance_billing_records.approved_at IS
      'Approval stamp. NULL = not yet approved. Lifecycle state is derived; never store a state column.';
    COMMENT ON COLUMN public.finance_billing_records.approved_by IS
      'Actor id who approved. Attribution only — not a routing / account-lead field.';
    COMMENT ON COLUMN public.finance_billing_records.approved_by_name IS
      'Display name of the approver at stamp time.';
    COMMENT ON COLUMN public.finance_billing_records.approved_amount_cents IS
      'Integer cents snapshotted at approval. Do not overwrite on later schedule recomputes.';
    COMMENT ON COLUMN public.finance_billing_records.approved_lines_hash IS
      'Hash of the line set snapshotted at approval.';
    COMMENT ON COLUMN public.finance_billing_records.matched_xero_invoice_id IS
      'xero_ar_invoices.xero_invoice_id of the settling invoice. Text, no FK.';
    COMMENT ON COLUMN public.finance_billing_records.matched_at IS
      'When the app billing record was linked to a Xero invoice.';
    COMMENT ON COLUMN public.finance_billing_records.matched_by IS
      'How the Xero match was made: auto | manual.';

    CREATE INDEX IF NOT EXISTS idx_finance_billing_records_approved_at_null
      ON public.finance_billing_records (approved_at)
      WHERE approved_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_finance_billing_records_matched_xero_invoice_id
      ON public.finance_billing_records (matched_xero_invoice_id);

    INSERT INTO public.migration_markers (key, note)
    VALUES (
      '0053_client_billing_lifecycle',
      'Add approval + Xero-match stamps on finance_billing_records. No state column. billed_* retained until a later cleanup. No clients account-lead. No xero_* DDL.'
    );
  ELSE
    RAISE NOTICE '0053: client billing lifecycle columns already applied — skipping.';
  END IF;
END
$$;
