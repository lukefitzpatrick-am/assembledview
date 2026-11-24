-- Migration 0123: data_quality_items (the Data quality queue, S17 stage 1)
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- The guarded run file for Luke is sql/supabase/2026-11-24_0123_data_quality_items_SUPABASE.sql
-- (same DDL, with BEFORE and AFTER checks). Run that one.
-- Idempotent: migration_markers guard.
--
-- Why: decision S17 A (Luke, 17 Nov 2026). One Data quality queue: every
-- check writes an item with the plan, the line, the rule broken and the fix,
-- assigned to the plan owner. A check that runs again updates last_seen_at on
-- the open item instead of adding a row (the partial unique index below).
--
-- What it adds: public.data_quality_items (empty, RLS on, no policies, no
-- ava_readonly grant)
--   id              bigint identity primary key
--   rule_key        text not null, 1 to 100 characters (lib/dataQuality/rules.ts)
--   mba_number      text not null, not blank (the plan)
--   line_item_id    text, null for a whole-plan problem
--   client_id       bigint -> clients(id) on delete set null
--                   (constraint data_quality_items_client_fk)
--   message         text not null, 1 to 2000 characters
--   fix_label       text not null, 1 to 200 characters
--   fix_href        text not null, an in-app path (starts with one /)
--   owner_email     text, lowercase; null = unassigned
--   status          text not null default 'open': open | resolved | dismissed
--   dismiss_reason  text, 1 to 1000 characters, required when dismissed
--   first_seen_at   timestamptz not null default now()
--   last_seen_at    timestamptz not null default now()
--   resolved_at     timestamptz, set exactly when status is not open
--   resolved_by     text, the actor's email, or 'check' when the check no
--                   longer finds the problem
-- Unique index data_quality_items_open_key on
-- (rule_key, mba_number, coalesce(line_item_id, '')) WHERE status = 'open':
-- one open item per rule, plan and line. Index data_quality_items_status_owner_idx
-- on (status, owner_email).
--
-- Mirror: db/schema/dataQualityItems.ts, snapshot db/drizzle/0032. Read and
-- written only with the switch data_quality_queue on, which can't be turned
-- on until the marker exists.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0123_data_quality_items') THEN
    RAISE NOTICE '0123 already applied - no-op';
    RETURN;
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
END
$$;
