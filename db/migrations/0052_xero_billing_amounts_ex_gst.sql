-- Migration 0052: rewrite xero: finance_billing_records money to Xero sub_total (ex-GST)
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
--
-- Decision (Luke, 1 Sep 2026): ex-GST everywhere internally. Xero Total is
-- GST-inclusive (verified: total = sub_total + total_tax). This UPDATE only
-- touches invoice_key LIKE 'xero:%' joined to xero_ar_invoices. Never media:/sow:/retainer:.
--
-- Live probe 1 Sep 2026 (matched billing rows, not raw AR count):
--   479 rows, billed_amount_cents 9,753,196.79 → 8,899,778.54
--   dollar movement (new − old) = -$853,418.25
--   FY26+ (issue_date >= 2025-07-01) is the same 479 rows / same movement.
-- The ~$949,451.88 total_tax figure is 530 FY26 AR invoices; 51 of those AR
-- rows have no finance_billing_records join yet and are not updated here.
-- Pre-flight RAISE NOTICE reports the actual all-row figure at apply time.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
DECLARE
  rows_n int;
  old_cents bigint;
  new_cents bigint;
  movement_cents bigint;
BEGIN
  SELECT
    count(*)::int,
    COALESCE(SUM(fbr.billed_amount_cents), 0)::bigint,
    COALESCE(SUM(ROUND(ar.sub_total * 100)), 0)::bigint,
    (
      COALESCE(SUM(ROUND(ar.sub_total * 100)), 0)
      - COALESCE(SUM(fbr.billed_amount_cents), 0)
    )::bigint
  INTO rows_n, old_cents, new_cents, movement_cents
  FROM public.finance_billing_records fbr
  JOIN public.xero_ar_invoices ar
    ON fbr.invoice_key = 'xero:' || ar.xero_invoice_id
  WHERE fbr.invoice_key LIKE 'xero:%';

  RAISE NOTICE
    'T0-2 ex-GST rewrite: rows=% old_dollars=% new_dollars=% movement_dollars=% (new-old; expected negative)',
    rows_n,
    ROUND(old_cents / 100.0, 2),
    ROUND(new_cents / 100.0, 2),
    ROUND(movement_cents / 100.0, 2);
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.migration_markers
     WHERE key = '0052_xero_billing_amounts_ex_gst'
  ) THEN
    UPDATE public.finance_billing_records fbr
    SET
      billed_amount_cents = ROUND(ar.sub_total * 100)::bigint,
      total = ar.sub_total,
      updated_at = now()
    FROM public.xero_ar_invoices ar
    WHERE fbr.invoice_key = 'xero:' || ar.xero_invoice_id
      AND fbr.invoice_key LIKE 'xero:%';

    INSERT INTO public.migration_markers (key, note)
    VALUES (
      '0052_xero_billing_amounts_ex_gst',
      'Rewrite xero: finance_billing_records.total and billed_amount_cents from xero_ar_invoices.sub_total (ex-GST). Live probe 1 Sep 2026: 479 rows, movement -$853,418.25.'
    );
  ELSE
    RAISE NOTICE '0052: xero billing amounts ex-GST rewrite already applied — skipping.';
  END IF;
END
$$;
