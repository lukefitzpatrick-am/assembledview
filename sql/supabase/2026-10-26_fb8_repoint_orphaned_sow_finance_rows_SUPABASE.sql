-- FB-8: repoint orphaned scope-of-work finance status rows to the scope's current key.
-- Supabase project slpdibnxtpdlttbbczvg. Luke runs this by hand. Read-only checks first.
--
-- Why
--   Saving a scope used to rebuild scope_id from scope_version, so every save renamed it.
--   Finance status rows are keyed invoice_key = 'sow:{scope_id}:{YYYY-MM}' with
--   mba_number = scope_id (lib/finance/deriveScopeSowReceivables.ts,
--   lib/finance/overlayFinanceStatus.ts composeInvoiceKey). After a rename the
--   approvals no longer overlay the live row. The code fix keeps scope_id stable.
--
-- Measured 2026-10-26 (read-only SELECTs)
--   finance_billing_records, billing_type 'sow', invoice_key 'sow:%': 8 rows.
--   Orphaned (mba_number not equal to any scope_of_work.scope_id): 2 rows, both Go Golfer.
--     id 21624  sow:GOGOLF_sow004:2026-09  $4,000  approved 2026-09-28 Chelsea Schutlz,
--               matched_xero_invoice_id 3270e127-6cb9-45d5-8856-7ec4ccfbd5ed (INV-1508), resolution 'differs'
--     id 38825  sow:GOGOLF_sow004:2026-10  $4,000  approved 2026-10-26 05:09 UTC Josh Plumridge
--   Current key for scope_of_work id 8: scope_id 'gogolf_sow005'.
--   Rows already under 'sow:gogolf_sow005:%': 0 (at measure time).
--   Other six sow rows (hartm_sow004, legal_sow001, strmea_sow002) already match. Not touched.
--
-- Columns that embed the scope id, and how each is handled
--   finance_billing_records.invoice_key   -> updated here.
--   finance_billing_records.mba_number    -> updated here (it equals scope_id for sow rows).
--   finance_billing_line_items            -> keyed by finance_billing_records_id. 0 rows for 21624/38825. No change.
--   finance_edits                         -> keyed by finance_billing_records_id (2 approval audit rows). No change.
--   finance_run_items (natural_key, mba_number, sow_id) -> 0 sow rows. No change.
--   mba_line_approvals, finance_forecast_snapshot_lines -> 0 rows with a sow id. No change.
--   xero_ar_invoices.reference_raw        -> Xero text, e.g. 'Go Golfer - E-Commerce Scope of Work (GOGOLF_sow004)'
--                                            on INV-1403/1453/1508. External record. Not changed.
--                                            mba_number is NULL on those rows. Row 21624 links by
--                                            matched_xero_invoice_id, which moves with the row.
--   finance_billing_records 'xero:%' rows for Go Golfer (958, 19344, 22206) -> keyed by Xero id. No change.
--
-- Skip rule (Luke, 18:01)
--   Josh will re-approve October under the current key. If a row already exists under the
--   new key for a month, that month is SKIPPED: no duplicate, no overwrite. The old row is
--   left as is and listed in the NOTICE output for Luke to decide.
--   Expected today: 2 repointed, 0 skipped. If Josh has re-approved October first:
--   1 repointed (2026-09), 1 skipped (2026-10).
--
-- Note: approvals are stored as approved_amount_cents 400000 ($4,000). Once Luke's schedule
-- update sets every month to $4,500, the repointed September row will show approval drift
-- (+$500) until it is re-approved. That is expected.
--
-- Run order
--   1. BEFORE (SELECT only). Check it lists the 2 rows above and the skip column.
--   2. DO block. Aborts unless the counts match.
--   3. AFTER (SELECT only).

-- 1. BEFORE: every orphaned sow status row, the proposed key, and whether it would be skipped.
SELECT
  r.id,
  r.invoice_key            AS old_invoice_key,
  r.mba_number             AS old_mba_number,
  r.client_name,
  r.campaign_name,
  r.billing_month,
  r.total,
  r.approved_at,
  r.approved_by_name,
  r.approved_amount_cents,
  r.matched_xero_invoice_id,
  s.id                     AS scope_row_id,
  s.scope_id               AS current_scope_id,
  CASE WHEN s.scope_id IS NULL THEN NULL
       ELSE 'sow:' || s.scope_id || ':' || r.billing_month END AS new_invoice_key,
  EXISTS (
    SELECT 1 FROM finance_billing_records x
    WHERE x.invoice_key = 'sow:' || s.scope_id || ':' || r.billing_month
  )                        AS will_skip_new_key_exists
FROM finance_billing_records r
LEFT JOIN scope_of_work s
  ON s.id = CASE WHEN r.mba_number = 'GOGOLF_sow004' THEN 8 END
WHERE r.billing_type = 'sow'
  AND r.invoice_key LIKE 'sow:%'
  AND NOT EXISTS (SELECT 1 FROM scope_of_work w WHERE w.scope_id = r.mba_number)
ORDER BY r.mba_number, r.billing_month;
-- Expect 2 rows: 21624 (2026-09) and 38825 (2026-10), current_scope_id 'gogolf_sow005'.

-- 2. Guarded repoint.
DO $$
DECLARE
  c_old_scope_id   CONSTANT text   := 'GOGOLF_sow004';
  c_scope_row_id   CONSTANT bigint := 8;
  c_expected_orphans_total  CONSTANT int := 2;  -- all orphaned sow rows, any scope
  c_expected_orphans_mapped CONSTANT int := 2;  -- orphaned rows for c_old_scope_id
  v_new_scope_id   text;
  v_orphans_total  int;
  v_orphans_mapped int;
  v_updated        int := 0;
  v_skipped        int := 0;
  v_skipped_months text := '';
  v_new_key        text;
  v_rows           int;
  rec              record;
BEGIN
  SELECT scope_id INTO v_new_scope_id FROM scope_of_work WHERE id = c_scope_row_id;
  IF v_new_scope_id IS NULL OR btrim(v_new_scope_id) = '' THEN
    RAISE EXCEPTION 'Abort: scope_of_work id % has no scope_id', c_scope_row_id;
  END IF;
  IF v_new_scope_id = c_old_scope_id THEN
    RAISE EXCEPTION 'Abort: scope % already uses %, nothing to repoint', c_scope_row_id, c_old_scope_id;
  END IF;
  RAISE NOTICE 'Current key for scope_of_work id %: %', c_scope_row_id, v_new_scope_id;

  SELECT count(*) INTO v_orphans_total
  FROM finance_billing_records r
  WHERE r.billing_type = 'sow'
    AND r.invoice_key LIKE 'sow:%'
    AND NOT EXISTS (SELECT 1 FROM scope_of_work w WHERE w.scope_id = r.mba_number);
  IF v_orphans_total <> c_expected_orphans_total THEN
    RAISE EXCEPTION 'Abort: expected % orphaned sow rows in total, found %. Re-run BEFORE and review.',
      c_expected_orphans_total, v_orphans_total;
  END IF;

  SELECT count(*) INTO v_orphans_mapped
  FROM finance_billing_records r
  WHERE r.billing_type = 'sow'
    AND r.mba_number = c_old_scope_id
    AND r.invoice_key = 'sow:' || c_old_scope_id || ':' || r.billing_month;
  IF v_orphans_mapped <> c_expected_orphans_mapped THEN
    RAISE EXCEPTION 'Abort: expected % rows keyed %, found %', c_expected_orphans_mapped, c_old_scope_id, v_orphans_mapped;
  END IF;

  FOR rec IN
    SELECT r.id, r.billing_month
    FROM finance_billing_records r
    WHERE r.billing_type = 'sow'
      AND r.mba_number = c_old_scope_id
      AND r.invoice_key = 'sow:' || c_old_scope_id || ':' || r.billing_month
    ORDER BY r.billing_month
    FOR UPDATE
  LOOP
    v_new_key := 'sow:' || v_new_scope_id || ':' || rec.billing_month;
    IF EXISTS (SELECT 1 FROM finance_billing_records x WHERE x.invoice_key = v_new_key) THEN
      v_skipped := v_skipped + 1;
      v_skipped_months := v_skipped_months || rec.billing_month || ' (old row id ' || rec.id || ') ';
      RAISE NOTICE 'SKIPPED %: % already exists. Old row % left unchanged.', rec.billing_month, v_new_key, rec.id;
      CONTINUE;
    END IF;

    UPDATE finance_billing_records
    SET invoice_key = v_new_key,
        mba_number  = v_new_scope_id,
        updated_at  = now()
    WHERE id = rec.id
      AND invoice_key = 'sow:' || c_old_scope_id || ':' || rec.billing_month;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'Abort: update of row % touched % rows', rec.id, v_rows;
    END IF;
    v_updated := v_updated + 1;
    RAISE NOTICE 'Repointed row % (%) to %', rec.id, rec.billing_month, v_new_key;
  END LOOP;

  IF v_updated + v_skipped <> c_expected_orphans_mapped THEN
    RAISE EXCEPTION 'Abort: repointed % + skipped % <> expected %', v_updated, v_skipped, c_expected_orphans_mapped;
  END IF;

  RAISE NOTICE 'Done. Repointed: %. Skipped: %. Skipped months: %',
    v_updated, v_skipped, CASE WHEN v_skipped = 0 THEN 'none' ELSE v_skipped_months END;
END $$;

-- 3. AFTER: Go Golfer sow status rows and any remaining orphans.
SELECT id, invoice_key, mba_number, billing_month, total, approved_at, approved_by_name,
       approved_amount_cents, matched_xero_invoice_id, updated_at
FROM finance_billing_records
WHERE billing_type = 'sow'
  AND (mba_number IN ('GOGOLF_sow004', (SELECT scope_id FROM scope_of_work WHERE id = 8)))
ORDER BY billing_month, invoice_key;
-- Expect: 21624 and 38825 now 'sow:gogolf_sow005:2026-09' / '...:2026-10'
-- (or, if October was skipped, 38825 still 'sow:GOGOLF_sow004:2026-10' beside Josh's new row).

SELECT count(*) AS remaining_orphans
FROM finance_billing_records r
WHERE r.billing_type = 'sow'
  AND r.invoice_key LIKE 'sow:%'
  AND NOT EXISTS (SELECT 1 FROM scope_of_work w WHERE w.scope_id = r.mba_number);
-- Expect 0, or 1 if October was skipped.
