-- 0120_client_fee_rates: guarded run file for Luke.
-- Supabase project slpdibnxtpdlttbbczvg. Luke runs this by hand in the SQL Editor.
-- Same DDL as db/migrations/0120_client_fee_rates.sql (the repo copy, AUTHOR ONLY).
--
-- What it does
--   Creates public.client_fee_rates (empty, RLS on, no policies, no
--   ava_readonly grant) and writes the marker 0120_client_fee_rates.
--   Touches no existing rows. No client rate is copied: with no dated row
--   the app reads the clients column, as today.
--   Until this runs, the switch client_fee_rate_history reads off and can't
--   be turned on.
--
-- Order
--   1. Run the BEFORE block. Check every expected value.
--   2. Run the DO block. It refuses (nothing done) if the marker or the
--      table already exists, and rolls back if any AFTER check inside fails.
--   3. Run the AFTER block. Check every expected value.

-- ===================== 1. BEFORE (read only) =====================
SELECT to_regclass('public.client_fee_rates') AS client_fee_rates;           -- expect NULL
SELECT count(*) AS marker_rows FROM public.migration_markers
 WHERE key = '0120_client_fee_rates';                                         -- expect 0
SELECT count(*) AS clients FROM public.clients;                               -- note it (49 on 23 Nov 2026)

-- ===================== 2. CHANGE (one DO block) =====================
DO $$
DECLARE
  n_cols    integer;
  n_rls     integer;
  n_rows    bigint;
  n_grant   integer;
  n_checks  integer;
  n_marker  integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0120_client_fee_rates') THEN
    RAISE EXCEPTION 'marker 0120_client_fee_rates already exists - nothing done';
  END IF;
  IF to_regclass('public.client_fee_rates') IS NOT NULL THEN
    RAISE EXCEPTION 'client_fee_rates already exists - nothing done';
  END IF;

  CREATE TABLE IF NOT EXISTS public.client_fee_rates (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_id      bigint NOT NULL,
    fee_field      text NOT NULL,
    rate_pct       numeric NOT NULL,
    effective_from date NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     text,
    CONSTRAINT client_fee_rates_fee_field_check CHECK (fee_field IN (
      'feetelevision', 'feeradio', 'feenewspapers', 'feemagazines', 'feeooh', 'feecinema',
      'feedigidisplay', 'feedigiaudio', 'feedigivideo', 'feebvod', 'feeintegration',
      'feesearch', 'feesocial', 'feeprogdisplay', 'feeprogvideo', 'feeprogbvod',
      'feeprogaudio', 'feeprogooh', 'feeinfluencers', 'feecontentcreator')),
    CONSTRAINT client_fee_rates_client_id_clients_id_fk FOREIGN KEY (client_id)
      REFERENCES public.clients(id) ON DELETE CASCADE,
    CONSTRAINT client_fee_rates_rate_pct_check CHECK (rate_pct >= 0 AND rate_pct <= 100),
    CONSTRAINT client_fee_rates_client_field_from_unique UNIQUE (client_id, fee_field, effective_from)
  );

  COMMENT ON TABLE public.client_fee_rates IS
    'Client fee rate changes with an effective-from Melbourne date (S4). The rate on a date is the latest row on or before it, else the clients column.';

  ALTER TABLE public.client_fee_rates ENABLE ROW LEVEL SECURITY;

  INSERT INTO public.migration_markers (key, note)
  VALUES ('0120_client_fee_rates', 'client_fee_rates (client fee rates with effective dates, S4). Empty, RLS on, no ava grant.');

  -- AFTER checks inside the block. Any failure rolls the whole block back.
  SELECT count(*) INTO n_cols FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'client_fee_rates';
  IF n_cols <> 7 THEN
    RAISE EXCEPTION 'expected 7 columns on client_fee_rates, found %', n_cols;
  END IF;
  SELECT count(*) INTO n_checks FROM pg_constraint
   WHERE conrelid = 'public.client_fee_rates'::regclass AND contype IN ('c', 'u', 'f');
  IF n_checks <> 4 THEN
    RAISE EXCEPTION 'expected 4 constraints (2 checks, 1 unique, 1 foreign key), found %', n_checks;
  END IF;
  SELECT count(*) INTO n_rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'client_fee_rates' AND c.relrowsecurity;
  IF n_rls <> 1 THEN
    RAISE EXCEPTION 'expected RLS on client_fee_rates';
  END IF;
  SELECT count(*) INTO n_rows FROM public.client_fee_rates;
  IF n_rows <> 0 THEN
    RAISE EXCEPTION 'expected an empty client_fee_rates, found % rows', n_rows;
  END IF;
  SELECT count(*) INTO n_grant FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'client_fee_rates' AND grantee = 'ava_readonly';
  IF n_grant <> 0 THEN
    RAISE EXCEPTION 'expected no ava_readonly grant on client_fee_rates, found %', n_grant;
  END IF;
  SELECT count(*) INTO n_marker FROM public.migration_markers WHERE key = '0120_client_fee_rates';
  IF n_marker <> 1 THEN
    RAISE EXCEPTION 'expected 1 marker row, found %', n_marker;
  END IF;

  RAISE NOTICE '0120_client_fee_rates applied: table created (empty, RLS on, no ava grant), marker written.';
END
$$;

-- ===================== 3. AFTER (read only) =====================
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'client_fee_rates'
 ORDER BY ordinal_position;                                    -- expect 7 rows: id, client_id, fee_field, rate_pct, effective_from, created_at, created_by
SELECT conname FROM pg_constraint
 WHERE conrelid = 'public.client_fee_rates'::regclass ORDER BY conname;   -- expect the pkey, client_id fkey, fee_field check, rate_pct check, unique
SELECT relrowsecurity FROM pg_class WHERE relname = 'client_fee_rates';   -- expect true
SELECT count(*) AS rows FROM public.client_fee_rates;          -- expect 0
SELECT count(*) AS clients FROM public.clients;                -- expect the BEFORE count
SELECT key FROM public.migration_markers WHERE key = '0120_client_fee_rates';  -- expect 1 row

-- ===================== Rollback (only if you must undo) =====================
-- Turn client_fee_rate_history off first. Drops every dated rate; plans then
-- read the clients column again on their next save.
-- BEGIN;
--   DROP TABLE IF EXISTS public.client_fee_rates;
--   DELETE FROM public.migration_markers WHERE key = '0120_client_fee_rates';
-- COMMIT;
