-- 0115_line_items_fixed_cost_from: guarded run file for Luke.
-- Supabase project slpdibnxtpdlttbbczvg. Luke runs this by hand in the SQL Editor.
-- Same DDL as db/migrations/0115_line_items_fixed_cost_from.sql (the repo copy, AUTHOR ONLY).
--
-- What it does
--   Adds public.line_items.fixed_cost_from date (nullable, no default) and
--   writes the marker 0115_line_items_fixed_cost_from. Every existing line
--   reads null (the whole flight, as today). Updates no rows.
--   ava_readonly already reads line_items (table-level grant); no new grant.
--
-- Order
--   1. Run the BEFORE block. Check every expected value.
--   2. Run the DO block. It refuses (nothing done) if the marker or the
--      column already exists, and rolls back if any AFTER check inside fails.
--   3. Run the AFTER block. Check every expected value.
--   Apply this BEFORE deploying the B23 code that carries the db/schema
--   mirror (C-76): db.select().from(lineItems) lists the column.
--   Adding a nullable column with no default is a catalogue change only: no
--   table rewrite, a brief lock.

-- ===================== 1. BEFORE (read only) =====================
SELECT count(*) AS column_rows FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'line_items'
   AND column_name = 'fixed_cost_from';                                       -- expect 0
SELECT count(*) AS marker_rows FROM public.migration_markers
 WHERE key = '0115_line_items_fixed_cost_from';                               -- expect 0
SELECT count(*) AS line_items,
       count(*) FILTER (WHERE fixed_cost_media) AS fixed_cost_lines
  FROM public.line_items;                                                     -- note both numbers

-- ===================== 2. CHANGE (one DO block) =====================
DO $$
DECLARE
  n_col     integer;
  n_set     bigint;
  n_marker  integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0115_line_items_fixed_cost_from') THEN
    RAISE EXCEPTION 'marker 0115_line_items_fixed_cost_from already exists - nothing done';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'line_items'
                AND column_name = 'fixed_cost_from') THEN
    RAISE EXCEPTION 'line_items.fixed_cost_from already exists - nothing done';
  END IF;

  ALTER TABLE public.line_items
    ADD COLUMN IF NOT EXISTS fixed_cost_from date;

  COMMENT ON COLUMN public.line_items.fixed_cost_from IS
    'Fixed cost media from this Melbourne date. Read only when fixed_cost_media is true. Null: the whole flight. Days before it report actual delivery.';

  INSERT INTO public.migration_markers (key, note)
  VALUES ('0115_line_items_fixed_cost_from', 'line_items.fixed_cost_from date, nullable. No rows updated.');

  -- AFTER checks inside the block. Any failure rolls the whole block back.
  SELECT count(*) INTO n_col FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'line_items'
     AND column_name = 'fixed_cost_from' AND data_type = 'date'
     AND is_nullable = 'YES' AND column_default IS NULL;
  IF n_col <> 1 THEN
    RAISE EXCEPTION 'expected line_items.fixed_cost_from date nullable no default, found % matching columns', n_col;
  END IF;
  SELECT count(*) INTO n_set FROM public.line_items WHERE fixed_cost_from IS NOT NULL;
  IF n_set <> 0 THEN
    RAISE EXCEPTION 'expected every line null, found % with a date', n_set;
  END IF;
  SELECT count(*) INTO n_marker FROM public.migration_markers WHERE key = '0115_line_items_fixed_cost_from';
  IF n_marker <> 1 THEN
    RAISE EXCEPTION 'expected 1 marker row, found %', n_marker;
  END IF;

  RAISE NOTICE '0115_line_items_fixed_cost_from applied: column added (every line null), marker written.';
END
$$;

-- ===================== 3. AFTER (read only) =====================
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'line_items'
   AND column_name = 'fixed_cost_from';                -- expect 1 row: date, YES, null
SELECT count(*) FILTER (WHERE fixed_cost_from IS NOT NULL) AS with_date,
       count(*) AS line_items
  FROM public.line_items;                              -- expect with_date 0, line_items = BEFORE (or more, if a plan saved meanwhile)
SELECT key FROM public.migration_markers
 WHERE key = '0115_line_items_fixed_cost_from';        -- expect 1 row

-- ===================== Rollback (only if you must undo) =====================
-- Safe only while no line has a date and the B23 code with the mirror is not
-- deployed (C-76: the deployed mirror would then select a missing column).
-- BEGIN;
--   ALTER TABLE public.line_items DROP COLUMN IF EXISTS fixed_cost_from;
--   DELETE FROM public.migration_markers WHERE key = '0115_line_items_fixed_cost_from';
-- COMMIT;
