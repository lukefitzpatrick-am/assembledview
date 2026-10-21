-- 2026-10-21 schedule_months: remove duplicated __service__production rows
-- Project: Supabase slpdibnxtpdlttbbczvg. Run in the Supabase SQL editor.
--
-- Why
--   explodeScheduleToMonthRows wrote the month header production onto
--   __service__production even when the same month already had per-line
--   production rows with bare ids (PENFOLD020PROD1, STRMEA001PROD1). Those
--   ids failed the decorated-id test, so production was counted twice.
--   Code fix: "fix(billing): bare production line ids suppress
--   __service__production" (scripts/migration/_scheduleTransform.ts).
--   Ship that fix before running this, or new saves recreate the rows.
--
-- Target rows (and only these)
--   line_item_id = '__service__production', on a version/basis/month that
--   also has a media row with a bare production id
--   (^[A-Za-z]+[0-9]+PROD[0-9]+$, amount <> 0), AND whose amount equals the
--   sum of those per-line production rows. Rows where the amounts differ
--   are not touched; the DO block raises if any exist so they get reviewed.
--
-- Measured read-only 21 Oct 2026
--   All versions: 592 rows on 90 versions, 13 masters
--     billing  288 rows, 84 versions, $902,149.36
--     delivery 304 rows, 90 versions, $956,149.36
--   Published tips: 13 tips
--     billing  31 rows, 12 tips, $191,257.84
--     delivery 34 rows, 13 tips, $203,257.84
--   Every candidate row equals the per-line production sum (0 mismatches).
--   Expected range for the guard: 592 to 650 rows (allows a few new saves
--   before the code fix ships).
--
-- Readers
--   Unchanged: approved_slice derive and MBA PDF money (skip __service__*),
--   finance blob reader (DATA_BACKEND_FINANCE_SCHEDULE default 'blob').
--   Change (they lose the duplicate): full-scope save gate
--   (sumBillingScheduleFullScopeCents), rows/shadow finance rebuild
--   (scheduleMonthsSource month.production), SQL sums over schedule_months
--   (costs, periods, dashboard client spend, Ava query_schedule_months and
--   query_finance_summary planned).
--   Note: snapshot_checksum hashes schedule_months. All 90 versions have a
--   stored checksum, so the weekly tripwire (report-only) will list them as
--   mismatches and a regenerated MBA PDF footer shows a new checksum.
--   Money on the MBA does not change. Re-stamping checksums is a decision
--   for Luke and is not done here.

-- ===================== BEFORE =====================
SELECT s.basis,
       count(*)                     AS rows_,
       count(DISTINCT s.version_id) AS versions,
       sum(s.amount_cents) / 100.0  AS dollars
FROM schedule_months s
WHERE s.line_item_id = '__service__production'
  AND EXISTS (
    SELECT 1 FROM schedule_months p
    WHERE p.version_id = s.version_id AND p.basis = s.basis AND p.month = s.month
      AND p.component = 'media' AND p.amount_cents <> 0
      AND p.line_item_id ~ '^[A-Za-z]+[0-9]+PROD[0-9]+$')
GROUP BY s.basis
ORDER BY s.basis;
-- Expect billing 288 / 84 / 902149.36 and delivery 304 / 90 / 956149.36

-- Example: PENFOLD020 and STRMEA001 tips, service row vs per-line sum
SELECT v.mba_number, v.version_number, s.basis, s.month,
       s.amount_cents / 100.0 AS service_production,
       (SELECT sum(p.amount_cents) FROM schedule_months p
         WHERE p.version_id = s.version_id AND p.basis = s.basis AND p.month = s.month
           AND p.component = 'media'
           AND p.line_item_id ~ '^[A-Za-z]+[0-9]+PROD[0-9]+$') / 100.0 AS per_line_production
FROM schedule_months s
JOIN media_plan_versions v ON v.id = s.version_id
WHERE s.line_item_id = '__service__production'
  AND v.mba_number IN ('PENFOLD020', 'STRMEA001')
  AND v.id IN (SELECT DISTINCT ON (master_id) id FROM media_plan_versions
               WHERE published_at IS NOT NULL ORDER BY master_id, version_number DESC)
ORDER BY v.mba_number, s.basis, s.month;

-- ===================== CHANGE =====================
DO $$
DECLARE
  v_candidates int;
  v_mismatch   int;
  v_deleted    int;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE s.amount_cents IS DISTINCT FROM (
           SELECT sum(p.amount_cents) FROM schedule_months p
           WHERE p.version_id = s.version_id AND p.basis = s.basis AND p.month = s.month
             AND p.component = 'media'
             AND p.line_item_id ~ '^[A-Za-z]+[0-9]+PROD[0-9]+$'))
    INTO v_candidates, v_mismatch
  FROM schedule_months s
  WHERE s.line_item_id = '__service__production'
    AND EXISTS (
      SELECT 1 FROM schedule_months p
      WHERE p.version_id = s.version_id AND p.basis = s.basis AND p.month = s.month
        AND p.component = 'media' AND p.amount_cents <> 0
        AND p.line_item_id ~ '^[A-Za-z]+[0-9]+PROD[0-9]+$');

  RAISE NOTICE 'candidates=% mismatched=%', v_candidates, v_mismatch;

  IF v_mismatch <> 0 THEN
    RAISE EXCEPTION 'Aborting: % candidate rows do not equal the per-line production sum. Review first.', v_mismatch;
  END IF;
  IF v_candidates < 592 OR v_candidates > 650 THEN
    RAISE EXCEPTION 'Aborting: % candidate rows, expected 592 to 650.', v_candidates;
  END IF;

  DELETE FROM schedule_months s
  WHERE s.line_item_id = '__service__production'
    AND EXISTS (
      SELECT 1 FROM schedule_months p
      WHERE p.version_id = s.version_id AND p.basis = s.basis AND p.month = s.month
        AND p.component = 'media' AND p.amount_cents <> 0
        AND p.line_item_id ~ '^[A-Za-z]+[0-9]+PROD[0-9]+$')
    AND s.amount_cents = (
      SELECT sum(p.amount_cents) FROM schedule_months p
      WHERE p.version_id = s.version_id AND p.basis = s.basis AND p.month = s.month
        AND p.component = 'media'
        AND p.line_item_id ~ '^[A-Za-z]+[0-9]+PROD[0-9]+$');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted <> v_candidates THEN
    RAISE EXCEPTION 'Aborting: deleted % rows but counted % candidates. Rolled back.', v_deleted, v_candidates;
  END IF;

  RAISE NOTICE 'deleted % __service__production rows', v_deleted;
END $$;

-- ===================== AFTER =====================
-- 1. No duplicates left (expect 0 rows)
SELECT s.basis, count(*)
FROM schedule_months s
WHERE s.line_item_id = '__service__production'
  AND EXISTS (
    SELECT 1 FROM schedule_months p
    WHERE p.version_id = s.version_id AND p.basis = s.basis AND p.month = s.month
      AND p.component = 'media' AND p.amount_cents <> 0
      AND p.line_item_id ~ '^[A-Za-z]+[0-9]+PROD[0-9]+$')
GROUP BY s.basis;

-- 2. Per-line production rows untouched (expect billing 332 rows / 902149.36,
--    delivery 348 rows / 956149.36)
SELECT basis, count(*) AS rows_, sum(amount_cents) / 100.0 AS dollars
FROM schedule_months
WHERE component = 'media' AND line_item_id ~ '^[A-Za-z]+[0-9]+PROD[0-9]+$'
GROUP BY basis ORDER BY basis;

-- 3. Remaining __service__production rows (were billing 669 / delivery 665;
--    expect billing 381, delivery 361)
SELECT basis, count(*) AS rows_, sum(amount_cents) / 100.0 AS dollars
FROM schedule_months
WHERE line_item_id = '__service__production'
GROUP BY basis ORDER BY basis;
