-- Migration 0057: one Xero invoice settles one app billing record
-- AUTHOR ONLY — do not apply yet.
--
-- `0053` indexed `matched_xero_invoice_id` without UNIQUE. Concurrent stamp
-- writers could pair the same Xero invoice to two invoice_keys. Partial unique
-- (NULLs remain many) is the contract: one settling invoice, one app row.
--
-- Do not drizzle-kit migrate. Pre-flight fails if duplicates exist — resolve
-- those rows by hand before applying.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
DECLARE
  dup_n int := 0;
BEGIN
  SELECT count(*)::int INTO dup_n
  FROM (
    SELECT matched_xero_invoice_id
    FROM public.finance_billing_records
    WHERE matched_xero_invoice_id IS NOT NULL
    GROUP BY matched_xero_invoice_id
    HAVING count(*) > 1
  ) d;

  IF dup_n > 0 THEN
    RAISE EXCEPTION
      '0057: % duplicate matched_xero_invoice_id value(s) — resolve before unique index',
      dup_n;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_billing_records_matched_xero_invoice_id
  ON public.finance_billing_records (matched_xero_invoice_id)
  WHERE matched_xero_invoice_id IS NOT NULL;

DROP INDEX IF EXISTS idx_finance_billing_records_matched_xero_invoice_id;

INSERT INTO public.migration_markers (key, note)
VALUES (
  '0057_matched_xero_invoice_unique',
  'UNIQUE matched_xero_invoice_id WHERE NOT NULL. One Xero invoice settles one app billing record.'
)
ON CONFLICT (key) DO NOTHING;
