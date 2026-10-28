-- =============================================================================
-- 2026-10-28  XERO-2: clear auto Xero matches the new month window rejects
-- Regenerated 29 Oct 2026 for the narrowed PO rule.
-- Target: Supabase (project slpdibnxtpdlttbbczvg), table public.finance_billing_records
-- Author: Claude for Luke. NOT RUN. Luke runs this by hand in the SQL Editor.
--
-- Rule (Luke, 28 Oct 2026, decision 2a; narrowed 29 Oct 2026): an invoice whose
-- Reference carries a PO token with digits (PO 1005369, PO#983905, PO1017399,
-- C120-PO-1002167) matches the exact billing month only. Every other invoice,
-- including a bare number segment such as "| 1010438", keeps plus or minus one
-- month. The billing record's own po_number does not count.
-- Code: lib/finance/sections/xeroBillingMatch.ts (invoiceCarriesPo).
--
-- RUN ONLY AFTER the narrowed XERO-2 commit is deployed. The old matcher would
-- stamp this row again on the next invoices cron.
--
-- Measured with read-only SELECTs on 29 Oct 2026: every current match whose
-- invoice issue month differs from the record's billing month (24 rows), of
-- which exactly 1 has a PO token in the Reference:
--   id     invoice_key               invoice   issued      record    invoice   reference
--   38850  media:PENFOLD018:2026-10  INV-1501  2026-09-30  6,792.63  7,269.85  "... (PENFOLD018) | PO 1005369"
-- auto, differs, not exported.
--
-- Dropped from the 28 Oct version (bare number segment, now plus or minus one
-- month, so the match stands): 21642 PENFOLD018 Sep INV-1426 (| 1005369),
-- 21645 PENFOLD016 Sep INV-1422 (| 1010438), 38849 PENFOLD015 Oct INV-1493
-- (| 1005380).
--
-- Clears the same columns the matcher's own unlink clears. A "differs" row
-- never adopted an amount, so approved_amount_cents is left as it is.
-- =============================================================================

-- BEFORE
SELECT r.id, r.invoice_key, r.matched_by, r.xero_match_resolution, r.exported_at,
       i.invoice_number, i.issue_date, i.reference_raw
FROM public.finance_billing_records r
LEFT JOIN public.xero_ar_invoices i ON i.xero_invoice_id = r.matched_xero_invoice_id
WHERE r.id = 38850;
-- Expect 1 row: media:PENFOLD018:2026-10, auto, differs, exported_at NULL, INV-1501, 2026-09-30.

-- Optional cross-check: current cross-month matches with a PO token. Expect 1 row (38850).
SELECT r.id, r.invoice_key, i.invoice_number, i.issue_date, i.reference_raw
FROM public.finance_billing_records r
JOIN public.xero_ar_invoices i ON i.xero_invoice_id = r.matched_xero_invoice_id
WHERE to_char(i.issue_date, 'YYYY-MM') <> left(r.billing_month::text, 7)
  AND i.reference_raw ~* '(^|[^a-z])p\.?o\.?(?=[[:space:]#:-]|[0-9])[[:space:]#:-]*[a-z0-9-]*[0-9]'
ORDER BY r.id;

DO $$
DECLARE
  v_ok      int;
  v_set     int;
  v_updated int;
BEGIN
  -- The full set the narrowed rule rejects must still be exactly this one row.
  SELECT count(*) INTO v_set
  FROM public.finance_billing_records r
  JOIN public.xero_ar_invoices i ON i.xero_invoice_id = r.matched_xero_invoice_id
  WHERE r.matched_by = 'auto'
    AND to_char(i.issue_date, 'YYYY-MM') <> left(r.billing_month::text, 7)
    AND i.reference_raw ~* '(^|[^a-z])p\.?o\.?(?=[[:space:]#:-]|[0-9])[[:space:]#:-]*[a-z0-9-]*[0-9]';
  IF v_set <> 1 THEN
    RAISE EXCEPTION 'XERO-2: expected 1 auto cross-month match with a PO token, found %. Re-measure. Nothing changed.', v_set;
  END IF;

  SELECT count(*) INTO v_ok
  FROM public.finance_billing_records
  WHERE matched_by = 'auto'
    AND exported_at IS NULL
    AND (id, invoice_key, matched_xero_invoice_id) IN (
      (38850, 'media:PENFOLD018:2026-10', '247e71f5-e250-4c66-8d6e-bb0af3883d40')
    );
  IF v_ok <> 1 THEN
    RAISE EXCEPTION 'XERO-2: expected 1 auto, unexported row still on its measured invoice, found %. Nothing changed.', v_ok;
  END IF;

  UPDATE public.finance_billing_records SET
    matched_xero_invoice_id = NULL,
    matched_at = NULL,
    matched_by = NULL,
    xero_match_resolution = NULL,
    xero_expected_source = NULL,
    updated_at = now()
  WHERE matched_by = 'auto'
    AND exported_at IS NULL
    AND (id, invoice_key, matched_xero_invoice_id) IN (
      (38850, 'media:PENFOLD018:2026-10', '247e71f5-e250-4c66-8d6e-bb0af3883d40')
    );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'XERO-2: updated % rows, expected 1. Rolled back.', v_updated;
  END IF;
  RAISE NOTICE 'XERO-2: cleared 1 match (38850 PENFOLD018 Oct, INV-1501).';
END $$;

-- AFTER
SELECT id, invoice_key, matched_xero_invoice_id, matched_by, xero_match_resolution
FROM public.finance_billing_records
WHERE id = 38850;
-- Expect 1 row with matched_xero_invoice_id, matched_by and xero_match_resolution NULL.
