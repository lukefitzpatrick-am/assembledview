-- Migration 0121: billing_above_plan_reasons (finance reason for a record held above plan, S14)
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- The guarded run file for Luke is sql/supabase/2026-11-23_0121_billing_above_plan_reasons_SUPABASE.sql
-- (same DDL, with BEFORE and AFTER checks). Run that one.
-- Idempotent: migration_markers guard.
--
-- Why: decision S14 A (Luke, 17 Nov 2026). A media billing record about to
-- go to Xero above plan is held at Send to accounts until a finance admin
-- gives a reason. Each row is one reason: the record, why, the amount above
-- plan it covers (integer cents), who and when. Append only, enforced: the
-- trigger trg_billing_above_plan_reasons_append_only refuses UPDATE and
-- DELETE (restrict_violation). The latest row
-- for a record is its reason, earlier rows are its history. A reason stops
-- covering the record when the amount above plan grows past covers_cents.
--
-- A new table, not columns on finance_billing_records, so no existing
-- whole-row read of finance_billing_records changes before this runs.
--
-- What it adds: public.billing_above_plan_reasons
--   id                          bigint identity primary key
--   finance_billing_record_id   bigint not null -> finance_billing_records(id), on delete restrict
--                               (constraint billing_above_plan_reasons_record_fk)
--   reason                      text not null, 1 to 2000 characters after trimming
--   covers_cents                bigint not null, above 0
--   created_by                  bigint not null (team member id, as approved_by)
--   created_by_name             text
--   created_at                  timestamptz not null default now()
-- Index on finance_billing_record_id. Trigger function
-- public.billing_above_plan_reasons_append_only(). Empty, no backfill. RLS on, no
-- policies (server connection only), no ava_readonly grant.
--
-- Mirror: db/schema/billingAbovePlanReasons.ts, snapshot db/drizzle/0030.
-- Read and written only with the switch billing_above_plan_hold on, which
-- can't be turned on until the marker exists.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0121_billing_above_plan_reasons') THEN
    RAISE NOTICE '0121 already applied - no-op';
    RETURN;
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
END
$$;
