-- =============================================================================
-- 2026-10-29  Xero: clear three October matches that took September's invoice
-- Target: Supabase (project slpdibnxtpdlttbbczvg), table public.finance_billing_records
-- Author: Claude for Luke. NOT RUN. Luke runs this by hand in the SQL Editor.
--
-- Luke (29 Oct 2026): invoices with no PO keep plus or minus one month; fix these
-- three by hand. Each pairs an in-arrears client's October record with the
-- invoice dated 30 Sep, which is really September's:
--   id     invoice_key               invoice   issued      record     invoice
--   38846  media:hartm001:2026-10    INV-1484  2026-09-30  53,292.05  58,057.73
--   38824  media:curatif004:2026-10  INV-1473  2026-09-30   5,800.20   4,760.25
--   38818  media:BICAU003:2026-10    INV-1513  2026-09-30   6,416.66   2,450.00
-- Measured with read-only SELECTs on 29 Oct 2026: all auto, all "differs",
-- none exported.
--
-- Why matched_by = 'manual' and not NULL:
-- The app has no unlink action for finance (Clients billing "assign" only sets
-- a match), and there is no "manual unlink, don't auto-match" value in
-- xero_match_resolution (live values: NULL, differs, auto_adopted; code also
-- writes adopted, disputed). The nightly matcher re-reads every invoice, and
-- with these rows cleared to NULL it would stamp the same three invoices on the
-- same October rows again (September is already taken by the 31 Aug invoice).
-- The only thing every auto path skips is matched_by = 'manual':
--   - lib/finance/sections/xeroBillingMatch.ts decideLive drops manual records
--   - lib/xero/stages/matchBillingRecords.ts writes only where matched_by is
--     NULL, '' or 'auto'
--   - lib/data/writeFinance.ts setFinanceBillingRecordXeroMatch(auto) skips manual
-- No screen reads matched_by; status comes from matched_xero_invoice_id, so the
-- rows show as unmatched.
-- Side effect: auto will not stamp these three October records again, including
-- with the real October invoice. Finance assigns it by hand in Clients billing
-- (assign), which overwrites a manual row.
--
-- Otherwise clears the same columns the matcher's own unlink clears. A
-- "differs" row never adopted an amount, so approved_amount_cents stays.
-- =============================================================================

-- BEFORE
SELECT r.id, r.invoice_key, r.matched_by, r.xero_match_resolution, r.exported_at,
       r.approved_amount_cents, i.invoice_number, i.issue_date, i.sub_total
FROM public.finance_billing_records r
LEFT JOIN public.xero_ar_invoices i ON i.xero_invoice_id = r.matched_xero_invoice_id
WHERE r.id IN (38818, 38824, 38846)
ORDER BY r.id;
-- Expect 3 rows: auto, differs, exported_at NULL, on INV-1513, INV-1473, INV-1484.

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
      (38846, 'media:hartm001:2026-10',   'cbff7366-642f-485a-a0af-ebbbae003843'),
      (38824, 'media:curatif004:2026-10', 'ed5c48d3-aa14-4ce8-9181-2317b4b3f7c0'),
      (38818, 'media:BICAU003:2026-10',   '624646b5-32ab-4001-8036-b43fe28f4e5e')
    );
  IF v_ok <> 3 THEN
    RAISE EXCEPTION 'In-arrears fix: expected 3 auto, unexported rows still on their measured invoices, found %. Nothing changed.', v_ok;
  END IF;

  UPDATE public.finance_billing_records SET
    matched_xero_invoice_id = NULL,
    matched_at = NULL,
    matched_by = 'manual',
    xero_match_resolution = NULL,
    xero_expected_source = NULL,
    updated_at = now()
  WHERE matched_by = 'auto'
    AND exported_at IS NULL
    AND (id, invoice_key, matched_xero_invoice_id) IN (
      (38846, 'media:hartm001:2026-10',   'cbff7366-642f-485a-a0af-ebbbae003843'),
      (38824, 'media:curatif004:2026-10', 'ed5c48d3-aa14-4ce8-9181-2317b4b3f7c0'),
      (38818, 'media:BICAU003:2026-10',   '624646b5-32ab-4001-8036-b43fe28f4e5e')
    );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 3 THEN
    RAISE EXCEPTION 'In-arrears fix: updated % rows, expected 3. Rolled back.', v_updated;
  END IF;
  RAISE NOTICE 'In-arrears fix: cleared 3 October matches (hartm001, curatif004, BICAU003) and held them off auto.';
END $$;

-- AFTER
SELECT id, invoice_key, matched_xero_invoice_id, matched_by, xero_match_resolution, approved_amount_cents
FROM public.finance_billing_records
WHERE id IN (38818, 38824, 38846)
ORDER BY id;
-- Expect 3 rows: matched_xero_invoice_id NULL, matched_by 'manual', xero_match_resolution NULL,
-- approved_amount_cents unchanged (641666, 580020, 5329205).
