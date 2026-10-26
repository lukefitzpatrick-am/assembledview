-- =============================================================================
-- 2026-10-26  clients: bad data cleanup (ABN "0", payment_days 0, postcode "0")
-- Target: Supabase (project slpdibnxtpdlttbbczvg), table public.clients
-- Author: Claude for Luke. NOT RUN. Luke runs this by hand in the SQL Editor.
--
-- Three independent sections. Each has a BEFORE SELECT, a DO block with exact
-- count and id guards (it raises and changes nothing if the live rows differ
-- from what was measured), and an AFTER SELECT. Run the whole file, or one
-- section at a time.
--
-- Measured with read-only SELECTs on 26 Oct 2026 (49 clients).
--
-- ---- A. ABN "0" -> NULL (7 rows) -------------------------------------------
--   #30 International Women's Day      #32 M1 Traffic
--   #42 Historical OX and Harty Clients #43 The Dor Foundation
--   #49 Olive Grove                    #52 Simmone Logue
--   #53 Krusty Krab
--
--   Needs the real ABN (NOT changed here, can't be guessed):
--   #21 Bowel Cancer Australia  abn "9515863300"  10 digits (an ABN is 11).
--
--   For information only, NOT changed: 11-digit values that fail the ABN
--   check-digit test (weights 10,1,3,5,7,9,11,13,15,17,19, mod 89):
--   #2  test client                abn "12345678910"  placeholder
--   #9  Glendale Community College abn "12345678900"  placeholder
--   #10 Test QA Client 3           abn "12345678901"  placeholder
--   #14 Malaysian Airlines         abn "12345678900"  placeholder (foreign, may have no ABN)
--   #41 Go Golfer                  abn "12345678900"  placeholder
--   #26 Veil Brighton              abn "68660349400"  fails check digit (typo?)
--   #27 Windsor Pavilion           abn "68875215000"  fails check digit (typo?)
--   #50 Sinch                      abn "55674754950"  fails check digit (typo?)
--   30 other ABNs pass. 3 clients have a NULL ABN.
--
-- ---- B. payment_days 0 -> 30 (6 rows) --------------------------------------
--   id  client                          payment_terms  proposed
--   #2  test client                     NULL           30
--   #9  Glendale Community College      NULL           30
--   #42 Historical OX and Harty Clients NULL           30
--   #49 Olive Grove                     NULL           30
--   #51 Strength Meals Co.              NULL           30
--   #53 Krusty Krab                     NULL           30
--   None of the six has terms text, so none says prepaid or upfront.
--   Every finance reader already treats 0 as 30 (payment_days || 30 in
--   deriveReceivableRecords, deriveRetainerReceivables, finance/data route,
--   ClientFinanceExcelExportDialog), so this changes no due date. It only
--   makes the Edit client form valid (it needs a positive whole number).
--   Not touched: #43 The Dor Foundation payment_days 1, terms "Date of Invoice".
--   2 clients have NULL payment_days (left alone).
--
-- ---- C. postcode "0" -> NULL (4 rows) --------------------------------------
--   #2 test client   #42 Historical OX and Harty Clients
--   #49 Olive Grove  #53 Krusty Krab
--   (postcode is text. 1 client already has NULL.)
--
-- Expected totals: A 7 rows, B 6 rows, C 4 rows. 17 updates over 8 clients.
-- =============================================================================


-- ============================================================ A. ABN "0"
-- BEFORE
SELECT id, mp_client_name, abn
FROM public.clients
WHERE btrim(abn) = '0' OR id = 21
ORDER BY id;
-- Expect 8 rows: 7 with "0", plus #21 "9515863300".

DO $$
DECLARE
  v_ids     bigint[];
  v_updated int;
BEGIN
  SELECT coalesce(array_agg(id ORDER BY id), '{}') INTO v_ids
  FROM public.clients WHERE btrim(abn) = '0';

  IF v_ids IS DISTINCT FROM ARRAY[30, 32, 42, 43, 49, 52, 53]::bigint[] THEN
    RAISE EXCEPTION 'A: expected ABN "0" on clients {30,32,42,43,49,52,53}, found %. Nothing changed.', v_ids;
  END IF;

  UPDATE public.clients SET abn = NULL
  WHERE id = ANY (ARRAY[30, 32, 42, 43, 49, 52, 53]::bigint[]) AND btrim(abn) = '0';
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> 7 THEN
    RAISE EXCEPTION 'A: updated % rows, expected 7. Rolled back.', v_updated;
  END IF;
  IF EXISTS (SELECT 1 FROM public.clients WHERE btrim(abn) = '0') THEN
    RAISE EXCEPTION 'A: an ABN "0" remains. Rolled back.';
  END IF;

  RAISE NOTICE 'A: % ABN "0" values set to NULL.', v_updated;
END $$;

-- AFTER
SELECT id, mp_client_name, abn
FROM public.clients
WHERE id IN (21, 30, 32, 42, 43, 49, 52, 53)
ORDER BY id;
-- Expect #21 unchanged ("9515863300"), the other 7 NULL.


-- ============================================================ B. payment_days 0
-- BEFORE
SELECT id, mp_client_name, payment_days, payment_terms
FROM public.clients
WHERE payment_days = 0
ORDER BY id;
-- Expect 6 rows: 2, 9, 42, 49, 51, 53, all payment_terms NULL.

DO $$
DECLARE
  v_ids     bigint[];
  v_terms   int;
  v_updated int;
BEGIN
  SELECT coalesce(array_agg(id ORDER BY id), '{}') INTO v_ids
  FROM public.clients WHERE payment_days = 0;

  IF v_ids IS DISTINCT FROM ARRAY[2, 9, 42, 49, 51, 53]::bigint[] THEN
    RAISE EXCEPTION 'B: expected payment_days 0 on clients {2,9,42,49,51,53}, found %. Nothing changed.', v_ids;
  END IF;

  -- Stop if any of them now has terms text (it might say prepaid / upfront).
  SELECT count(*) INTO v_terms
  FROM public.clients
  WHERE id = ANY (ARRAY[2, 9, 42, 49, 51, 53]::bigint[])
    AND nullif(btrim(payment_terms), '') IS NOT NULL;
  IF v_terms <> 0 THEN
    RAISE EXCEPTION 'B: % of these clients now have payment_terms text. Review it before setting 30. Nothing changed.', v_terms;
  END IF;

  UPDATE public.clients SET payment_days = 30
  WHERE id = ANY (ARRAY[2, 9, 42, 49, 51, 53]::bigint[]) AND payment_days = 0;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> 6 THEN
    RAISE EXCEPTION 'B: updated % rows, expected 6. Rolled back.', v_updated;
  END IF;
  IF EXISTS (SELECT 1 FROM public.clients WHERE payment_days = 0) THEN
    RAISE EXCEPTION 'B: a payment_days 0 remains. Rolled back.';
  END IF;

  RAISE NOTICE 'B: % payment_days 0 values set to 30.', v_updated;
END $$;

-- AFTER
SELECT id, mp_client_name, payment_days, payment_terms
FROM public.clients
WHERE id IN (2, 9, 42, 49, 51, 53)
ORDER BY id;
-- Expect payment_days 30 on all 6.


-- ============================================================ C. postcode "0"
-- BEFORE
SELECT id, mp_client_name, postcode
FROM public.clients
WHERE btrim(postcode) = '0'
ORDER BY id;
-- Expect 4 rows: 2, 42, 49, 53.

DO $$
DECLARE
  v_ids     bigint[];
  v_updated int;
BEGIN
  SELECT coalesce(array_agg(id ORDER BY id), '{}') INTO v_ids
  FROM public.clients WHERE btrim(postcode) = '0';

  IF v_ids IS DISTINCT FROM ARRAY[2, 42, 49, 53]::bigint[] THEN
    RAISE EXCEPTION 'C: expected postcode "0" on clients {2,42,49,53}, found %. Nothing changed.', v_ids;
  END IF;

  UPDATE public.clients SET postcode = NULL
  WHERE id = ANY (ARRAY[2, 42, 49, 53]::bigint[]) AND btrim(postcode) = '0';
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> 4 THEN
    RAISE EXCEPTION 'C: updated % rows, expected 4. Rolled back.', v_updated;
  END IF;
  IF EXISTS (SELECT 1 FROM public.clients WHERE btrim(postcode) = '0') THEN
    RAISE EXCEPTION 'C: a postcode "0" remains. Rolled back.';
  END IF;

  RAISE NOTICE 'C: % postcode "0" values set to NULL.', v_updated;
END $$;

-- AFTER
SELECT id, mp_client_name, postcode
FROM public.clients
WHERE id IN (2, 42, 49, 53)
ORDER BY id;
-- Expect postcode NULL on all 4.

-- Note: the clients list cache (10 min) may show the old values until it
-- refreshes or a client is saved.
