-- 0121_billing_above_plan_reasons: guarded run file for Luke.
-- Supabase project slpdibnxtpdlttbbczvg. Luke runs this by hand in the SQL Editor.
-- Same DDL as db/migrations/0121_billing_above_plan_reasons.sql (the repo copy, AUTHOR ONLY).
--
-- What it does
--   Creates public.billing_above_plan_reasons (empty, RLS on, no policies, no
--   ava_readonly grant, append only by trigger, a record with reasons can't be
--   deleted) and writes the marker 0121_billing_above_plan_reasons.
--   Touches no existing rows.
--   Until this runs, the switch billing_above_plan_hold reads off and can't
--   be turned on.
--
-- Order
--   1. Run the BEFORE block. Check every expected value.
--   2. Run the DO block. It refuses (nothing done) if the marker or the
--      table already exists, and rolls back if any AFTER check inside fails.
--   3. Run the AFTER block. Check every expected value.

-- ===================== 1. BEFORE (read only) =====================
SELECT to_regclass('public.billing_above_plan_reasons') AS reasons_table;    -- expect NULL
SELECT count(*) AS marker_rows FROM public.migration_markers
 WHERE key = '0121_billing_above_plan_reasons';                               -- expect 0
SELECT count(*) AS records FROM public.finance_billing_records;              -- note it (719 on 23 Nov 2026)

-- ===================== 2. CHANGE (one DO block) =====================
DO $$
DECLARE
  n_cols    integer;
  n_checks  integer;
  n_rls     integer;
  n_rows    bigint;
  n_grant   integer;
  n_marker  integer;
  n_trig    integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0121_billing_above_plan_reasons') THEN
    RAISE EXCEPTION 'marker 0121_billing_above_plan_reasons already exists - nothing done';
  END IF;
  IF to_regclass('public.billing_above_plan_reasons') IS NOT NULL THEN
    RAISE EXCEPTION 'billing_above_plan_reasons already exists - nothing done';
  END IF;

  CREATE TABLE IF NOT EXISTS public.billing_above_plan_reasons (
    id                         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    finance_billing_record_id  bigint NOT NULL,
    reason                     text NOT NULL,
    covers_cents               bigint NOT NULL,
    created_by                 bigint NOT NULL,
    created_by_name            text,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT billing_above_plan_reasons_record_fk FOREIGN KEY (finance_billing_record_id)
      REFERENCES public.finance_billing_records(id) ON DELETE RESTRICT,
    CONSTRAINT billing_above_plan_reasons_reason_check
      CHECK (char_length(btrim(reason)) BETWEEN 1 AND 2000),
    CONSTRAINT billing_above_plan_reasons_covers_cents_check CHECK (covers_cents > 0)
  );

  CREATE INDEX IF NOT EXISTS billing_above_plan_reasons_record_idx
    ON public.billing_above_plan_reasons (finance_billing_record_id);

  COMMENT ON TABLE public.billing_above_plan_reasons IS
    'S14: finance reasons that let a billing record held above plan go to Xero. Append only; the latest row per record stands while the amount above plan is at most covers_cents.';

  ALTER TABLE public.billing_above_plan_reasons ENABLE ROW LEVEL SECURITY;

  CREATE OR REPLACE FUNCTION public.billing_above_plan_reasons_append_only() RETURNS trigger
  LANGUAGE plpgsql AS $fn$
  BEGIN
    RAISE EXCEPTION USING
      ERRCODE = 'restrict_violation',
      MESSAGE = 'billing_above_plan_reasons is append only: add a new reason instead';
  END
  $fn$;

  DROP TRIGGER IF EXISTS trg_billing_above_plan_reasons_append_only ON public.billing_above_plan_reasons;
  CREATE TRIGGER trg_billing_above_plan_reasons_append_only
    BEFORE UPDATE OR DELETE ON public.billing_above_plan_reasons
    FOR EACH ROW EXECUTE FUNCTION public.billing_above_plan_reasons_append_only();

  INSERT INTO public.migration_markers (key, note)
  VALUES ('0121_billing_above_plan_reasons', 'billing_above_plan_reasons (finance reason for a record held above plan, S14). Empty, RLS on, no ava grant.');

  -- AFTER checks inside the block. Any failure rolls the whole block back.
  SELECT count(*) INTO n_cols FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'billing_above_plan_reasons';
  IF n_cols <> 7 THEN
    RAISE EXCEPTION 'expected 7 columns on billing_above_plan_reasons, found %', n_cols;
  END IF;
  SELECT count(*) INTO n_checks FROM pg_constraint
   WHERE conrelid = 'public.billing_above_plan_reasons'::regclass AND contype IN ('c', 'f');
  IF n_checks <> 3 THEN
    RAISE EXCEPTION 'expected 3 constraints (2 checks, 1 foreign key), found %', n_checks;
  END IF;
  SELECT count(*) INTO n_rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'billing_above_plan_reasons' AND c.relrowsecurity;
  IF n_rls <> 1 THEN
    RAISE EXCEPTION 'expected RLS on billing_above_plan_reasons';
  END IF;
  SELECT count(*) INTO n_rows FROM public.billing_above_plan_reasons;
  IF n_rows <> 0 THEN
    RAISE EXCEPTION 'expected an empty billing_above_plan_reasons, found % rows', n_rows;
  END IF;
  SELECT count(*) INTO n_grant FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'billing_above_plan_reasons' AND grantee = 'ava_readonly';
  IF n_grant <> 0 THEN
    RAISE EXCEPTION 'expected no ava_readonly grant on billing_above_plan_reasons, found %', n_grant;
  END IF;
  SELECT count(*) INTO n_trig FROM pg_trigger
   WHERE tgrelid = 'public.billing_above_plan_reasons'::regclass
     AND tgname = 'trg_billing_above_plan_reasons_append_only' AND NOT tgisinternal;
  IF n_trig <> 1 THEN
    RAISE EXCEPTION 'expected the append-only trigger on billing_above_plan_reasons, found %', n_trig;
  END IF;
  SELECT count(*) INTO n_marker FROM public.migration_markers WHERE key = '0121_billing_above_plan_reasons';
  IF n_marker <> 1 THEN
    RAISE EXCEPTION 'expected 1 marker row, found %', n_marker;
  END IF;

  RAISE NOTICE '0121_billing_above_plan_reasons applied: table created (empty, RLS on, no ava grant, append-only trigger), marker written.';
END
$$;

-- ===================== 3. AFTER (read only) =====================
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'billing_above_plan_reasons'
 ORDER BY ordinal_position;          -- expect 7 rows: id, finance_billing_record_id, reason, covers_cents, created_by, created_by_name, created_at
SELECT conname FROM pg_constraint
 WHERE conrelid = 'public.billing_above_plan_reasons'::regclass ORDER BY conname;   -- expect the pkey, billing_above_plan_reasons_record_fk, reason check, covers_cents check
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.billing_above_plan_reasons'::regclass
   AND NOT tgisinternal;             -- expect trg_billing_above_plan_reasons_append_only
SELECT relrowsecurity FROM pg_class WHERE relname = 'billing_above_plan_reasons';  -- expect true
SELECT count(*) AS rows FROM public.billing_above_plan_reasons;   -- expect 0
SELECT count(*) AS records FROM public.finance_billing_records;    -- expect the BEFORE count
SELECT key FROM public.migration_markers WHERE key = '0121_billing_above_plan_reasons';  -- expect 1 row

-- ===================== Rollback (only if you must undo) =====================
-- Turn billing_above_plan_hold off first. Drops every stored reason.
-- BEGIN;
--   DROP TABLE IF EXISTS public.billing_above_plan_reasons;
--   DROP FUNCTION IF EXISTS public.billing_above_plan_reasons_append_only();
--   DELETE FROM public.migration_markers WHERE key = '0121_billing_above_plan_reasons';
-- COMMIT;
