-- 0123_data_quality_items: guarded run file for Luke.
-- Supabase project slpdibnxtpdlttbbczvg. Luke runs this by hand in the SQL Editor.
-- Same DDL as db/migrations/0123_data_quality_items.sql (the repo copy, AUTHOR ONLY).
--
-- What it does
--   Creates public.data_quality_items (the Data quality queue, S17: empty,
--   RLS on, no policies, no ava_readonly grant, one open row per rule, plan
--   and line) and writes the marker 0123_data_quality_items.
--   Touches no existing rows.
--   Until this runs, the switch data_quality_queue reads off and can't be
--   turned on.
--
-- Order
--   1. Run the BEFORE block. Check every expected value.
--   2. Run the DO block. It refuses (nothing done) if the marker or the
--      table already exists, and rolls back if any AFTER check inside fails.
--   3. Run the AFTER block. Check every expected value.
--   4. On /admin/features, turn on data_quality_queue (owner Luke) when ready.
--      The first items arrive at the next relabel-drift cron (07:15 Melbourne).

-- ===================== 1. BEFORE (read only) =====================
SELECT to_regclass('public.data_quality_items') AS dq_table;                  -- expect NULL
SELECT count(*) AS marker_rows FROM public.migration_markers
 WHERE key = '0123_data_quality_items';                                        -- expect 0
SELECT count(*) AS clients FROM public.clients;                                -- note it

-- ===================== 2. CHANGE (one DO block) =====================
DO $$
DECLARE
  n_cols    integer;
  n_checks  integer;
  n_idx     integer;
  n_rls     integer;
  n_rows    bigint;
  n_grant   integer;
  n_marker  integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0123_data_quality_items') THEN
    RAISE EXCEPTION 'marker 0123_data_quality_items already exists - nothing done';
  END IF;
  IF to_regclass('public.data_quality_items') IS NOT NULL THEN
    RAISE EXCEPTION 'data_quality_items already exists - nothing done';
  END IF;

  CREATE TABLE IF NOT EXISTS public.data_quality_items (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rule_key        text NOT NULL,
    mba_number      text NOT NULL,
    line_item_id    text,
    client_id       bigint,
    message         text NOT NULL,
    fix_label       text NOT NULL,
    fix_href        text NOT NULL,
    owner_email     text,
    status          text NOT NULL DEFAULT 'open',
    dismiss_reason  text,
    first_seen_at   timestamptz NOT NULL DEFAULT now(),
    last_seen_at    timestamptz NOT NULL DEFAULT now(),
    resolved_at     timestamptz,
    resolved_by     text,
    CONSTRAINT data_quality_items_client_fk FOREIGN KEY (client_id)
      REFERENCES public.clients(id) ON DELETE SET NULL,
    CONSTRAINT data_quality_items_rule_key_check CHECK (char_length(rule_key) BETWEEN 1 AND 100),
    CONSTRAINT data_quality_items_mba_number_check CHECK (btrim(mba_number) <> ''),
    CONSTRAINT data_quality_items_message_check CHECK (char_length(message) BETWEEN 1 AND 2000),
    CONSTRAINT data_quality_items_fix_label_check CHECK (char_length(fix_label) BETWEEN 1 AND 200),
    CONSTRAINT data_quality_items_fix_href_check CHECK (fix_href LIKE '/%' AND fix_href NOT LIKE '//%'),
    CONSTRAINT data_quality_items_owner_email_check CHECK (owner_email IS NULL OR owner_email = lower(owner_email)),
    CONSTRAINT data_quality_items_status_check CHECK (status IN ('open', 'resolved', 'dismissed')),
    CONSTRAINT data_quality_items_dismiss_reason_check
      CHECK (status <> 'dismissed' OR char_length(btrim(coalesce(dismiss_reason, ''))) BETWEEN 1 AND 1000),
    CONSTRAINT data_quality_items_resolved_check CHECK ((status = 'open') = (resolved_at IS NULL))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS data_quality_items_open_key
    ON public.data_quality_items (rule_key, mba_number, (coalesce(line_item_id, '')))
    WHERE status = 'open';

  CREATE INDEX IF NOT EXISTS data_quality_items_status_owner_idx
    ON public.data_quality_items (status, owner_email);

  COMMENT ON TABLE public.data_quality_items IS
    'S17: the Data quality queue. One open row per rule, plan and line; checks write through lib/dataQuality/items.server.ts. Staff only.';

  ALTER TABLE public.data_quality_items ENABLE ROW LEVEL SECURITY;

  INSERT INTO public.migration_markers (key, note)
  VALUES ('0123_data_quality_items', 'data_quality_items (the Data quality queue, S17). Empty, RLS on, no ava grant.');

  -- AFTER checks inside the block. Any failure rolls the whole block back.
  SELECT count(*) INTO n_cols FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'data_quality_items';
  IF n_cols <> 15 THEN
    RAISE EXCEPTION 'expected 15 columns on data_quality_items, found %', n_cols;
  END IF;
  SELECT count(*) INTO n_checks FROM pg_constraint
   WHERE conrelid = 'public.data_quality_items'::regclass AND contype IN ('c', 'f');
  IF n_checks <> 10 THEN
    RAISE EXCEPTION 'expected 10 constraints (9 checks, 1 foreign key), found %', n_checks;
  END IF;
  SELECT count(*) INTO n_idx FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'data_quality_items'
     AND indexname IN ('data_quality_items_open_key', 'data_quality_items_status_owner_idx');
  IF n_idx <> 2 THEN
    RAISE EXCEPTION 'expected the open key and the status owner index, found %', n_idx;
  END IF;
  SELECT count(*) INTO n_rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'data_quality_items' AND c.relrowsecurity;
  IF n_rls <> 1 THEN
    RAISE EXCEPTION 'expected RLS on data_quality_items';
  END IF;
  SELECT count(*) INTO n_rows FROM public.data_quality_items;
  IF n_rows <> 0 THEN
    RAISE EXCEPTION 'expected an empty data_quality_items, found % rows', n_rows;
  END IF;
  SELECT count(*) INTO n_grant FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'data_quality_items' AND grantee = 'ava_readonly';
  IF n_grant <> 0 THEN
    RAISE EXCEPTION 'expected no ava_readonly grant on data_quality_items, found %', n_grant;
  END IF;
  SELECT count(*) INTO n_marker FROM public.migration_markers WHERE key = '0123_data_quality_items';
  IF n_marker <> 1 THEN
    RAISE EXCEPTION 'expected 1 marker row, found %', n_marker;
  END IF;

  RAISE NOTICE '0123_data_quality_items applied: table created (empty, RLS on, no ava grant), marker written.';
END
$$;

-- ===================== 3. AFTER (read only) =====================
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'data_quality_items'
 ORDER BY ordinal_position;          -- expect 15 rows: id, rule_key, mba_number, line_item_id, client_id, message, fix_label, fix_href, owner_email, status, dismiss_reason, first_seen_at, last_seen_at, resolved_at, resolved_by
SELECT conname FROM pg_constraint
 WHERE conrelid = 'public.data_quality_items'::regclass ORDER BY conname;   -- expect the pkey, data_quality_items_client_fk and 9 checks
SELECT indexname, indexdef FROM pg_indexes
 WHERE tablename = 'data_quality_items' ORDER BY indexname;               -- expect data_quality_items_open_key (unique, WHERE status = 'open'), the status owner index, the pkey
SELECT relrowsecurity FROM pg_class WHERE relname = 'data_quality_items';  -- expect true
SELECT count(*) AS rows FROM public.data_quality_items;   -- expect 0
SELECT count(*) AS clients FROM public.clients;           -- expect the BEFORE count
SELECT key FROM public.migration_markers WHERE key = '0123_data_quality_items';  -- expect 1 row

-- ===================== Rollback (only if you must undo) =====================
-- Turn data_quality_queue off first. Drops every stored item.
-- BEGIN;
--   DROP TABLE IF EXISTS public.data_quality_items;
--   DELETE FROM public.migration_markers WHERE key = '0123_data_quality_items';
-- COMMIT;
