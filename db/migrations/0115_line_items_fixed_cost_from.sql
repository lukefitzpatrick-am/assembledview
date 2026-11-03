-- Migration 0115: line_items.fixed_cost_from (fixed cost from a date, B23)
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- The guarded run file for Luke is sql/supabase/2026-11-03_0115_line_items_fixed_cost_from_SUPABASE.sql
-- (same DDL, with BEFORE and AFTER checks). Run that one.
-- Idempotent: migration_markers guard.
--
-- Why: decisions FC2 and FC5 (Luke, 3 Nov 2026). A line can switch to fixed
-- cost media mid flight. Days before the date keep their actuals; from the
-- date the line reports fixed-cost spend.
--
-- What it adds: line_items.fixed_cost_from date, nullable, no default. A
-- Melbourne civil date. Read only when fixed_cost_media is true. Null means
-- the whole flight (today's behaviour). No rows are updated: every existing
-- line reads null, so nothing changes (no backfill, by rule).
--
-- ava_readonly has table-level SELECT on line_items, so AVA can read the
-- column with no new grant. RLS is unchanged.
--
-- Deploy order (C-76): db/schema/planCore.ts mirrors the column, and
-- db.select().from(lineItems) lists it, so apply this BEFORE deploying the
-- code that carries the mirror.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0115_line_items_fixed_cost_from') THEN
    RAISE NOTICE '0115 already applied - no-op';
    RETURN;
  END IF;

  ALTER TABLE public.line_items
    ADD COLUMN IF NOT EXISTS fixed_cost_from date;

  COMMENT ON COLUMN public.line_items.fixed_cost_from IS
    'Fixed cost media from this Melbourne date. Read only when fixed_cost_media is true. Null: the whole flight. Days before it report actual delivery.';

  INSERT INTO public.migration_markers (key, note)
  VALUES ('0115_line_items_fixed_cost_from', 'line_items.fixed_cost_from date, nullable. No rows updated.');
END
$$;
