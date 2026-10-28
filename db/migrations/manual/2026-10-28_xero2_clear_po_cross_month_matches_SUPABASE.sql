-- =============================================================================
-- 2026-10-28  XERO-2: clear auto Xero matches the new month window rejects
-- Target: Supabase (project slpdibnxtpdlttbbczvg), table public.finance_billing_records
-- Author: Claude for Luke. NOT RUN. Luke runs this by hand in the SQL Editor.
--
-- Rule (Luke, 28 Oct 2026, decision 2a): an invoice whose Reference carries a
-- PO matches the exact billing month only; others keep plus or minus one month.
-- Code: lib/finance/sections/xeroBillingMatch.ts (invoiceCarriesPo).
--
-- RUN ONLY AFTER the XERO-2 commit is deployed. The old matcher would stamp
-- these rows again on the next invoices cron.
--
-- Measured with read-only SELECTs on 28 Oct 2026. 4 rows, all auto, all
-- "differs", none exported, all approved:
--   id     invoice_key               invoice   issued      record      invoice
--   21642  media:PENFOLD018:2026-09  INV-1426  2026-08-26  187,571.60  5,509.93  (| 1005369)
--   21645  media:PENFOLD016:2026-09  INV-1422  2026-08-26   14,245.72  4,571.43  (| 1010438)
--   38849  media:PENFOLD015:2026-10  INV-1493  2026-09-30   18,444.32 14,366.57  (| 1005380)
--   38850  media:PENFOLD018:2026-10  INV-1501  2026-09-30    6,792.63  7,269.85  (| PO 1005369)
--
-- Not cleared (no PO in the Reference, so plus or minus one month still
-- applies): hartm001 Oct INV-1484, curatif004 Oct INV-1473, BICAU003 Oct
-- INV-1513. Those need decision 2b or 2c, or a manual fix.
--
-- Clears the same columns the matcher's own unlink clears. "differs" rows
-- never adopted an amount, so approved_amount_cents is left as it is.
-- =============================================================================

-- BEFORE
SELECT r.id, r.invoice_key, r.matched_by, r.xero_match_resolution, r.exported_at, i.invoice_number, i.issue_date
FROM public.finance_billing_records r
LEFT JOIN public.xero_ar_invoices i ON i.xero_invoice_id = r.matched_xero_invoice_id
WHERE r.id IN (21642, 21645, 38849, 38850)
ORDER BY r.id;
-- Expect 4 rows, matched as listed above.

DO $$
DECLARE
  v_ok      int;
  v_updated int;
BEGIN
  SELECT count(*) INTO v_ok
  FROM public.finance_billing_records
  WHERE matched_by = 'auto'
    AND exported_at IS NULL
    AND (id, invoice_key, matched_xero_invoice_id) IN (
      (21642, 'media:PENFOLD018:2026-09', 'baa63fd9-6701-415b-b3dd-84bf4559e97e'),
      (21645, 'media:PENFOLD016:2026-09', 'f09066df-15c3-4c22-9dee-9cca0be8358f'),
      (38849, 'media:PENFOLD015:2026-10', 'b974c39c-2410-42a8-bf94-c60a9bc6476b'),
      (38850, 'media:PENFOLD018:2026-10', '247e71f5-e250-4c66-8d6e-bb0af3883d40')
    );
  IF v_ok <> 4 THEN
    RAISE EXCEPTION 'XERO-2: expected 4 auto, unexported rows still on their measured invoices, found %. Nothing changed.', v_ok;
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
      (21642, 'media:PENFOLD018:2026-09', 'baa63fd9-6701-415b-b3dd-84bf4559e97e'),
      (21645, 'media:PENFOLD016:2026-09', 'f09066df-15c3-4c22-9dee-9cca0be8358f'),
      (38849, 'media:PENFOLD015:2026-10', 'b974c39c-2410-42a8-bf94-c60a9bc6476b'),
      (38850, 'media:PENFOLD018:2026-10', '247e71f5-e250-4c66-8d6e-bb0af3883d40')
    );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 4 THEN
    RAISE EXCEPTION 'XERO-2: updated % rows, expected 4. Rolled back.', v_updated;
  END IF;
  RAISE NOTICE 'XERO-2: cleared 4 matches.';
END $$;

-- AFTER
SELECT id, invoice_key, matched_xero_invoice_id, matched_by, xero_match_resolution
FROM public.finance_billing_records
WHERE id IN (21642, 21645, 38849, 38850)
ORDER BY id;
-- Expect 4 rows with matched_xero_invoice_id, matched_by and xero_match_resolution NULL.
