-- Migration 0093: overdue_digest_sends — one weekday overdue digest per Sydney date
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: CREATE TABLE IF NOT EXISTS + migration_markers guard.
--
-- Do not SELECT this table against live Postgres until this file is applied (C-76).
-- Mirror: db/schema/overdueDigestSends.ts.
-- The overdue digest cron inserts a row only after the email succeeds.

CREATE TABLE IF NOT EXISTS public.migration_markers (
    key         text primary key,
    applied_at  timestamptz not null default now(),
    note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0093_overdue_digest_sends') THEN
    RAISE NOTICE '0093 already applied — no-op';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.overdue_digest_sends (
    as_of_date       date PRIMARY KEY,
    sent_at          timestamptz NOT NULL DEFAULT now(),
    invoice_count    int NOT NULL,
    total_due_cents  bigint NOT NULL,
    recipients       text[] NOT NULL
  );

  COMMENT ON TABLE public.overdue_digest_sends IS
    'Weekday overdue invoice digest. One row per Sydney civil date, written after the ops email succeeds.';

  ALTER TABLE public.overdue_digest_sends ENABLE ROW LEVEL SECURITY;

  INSERT INTO public.migration_markers (key, note)
  VALUES (
    '0093_overdue_digest_sends',
    'overdue_digest_sends as_of_date, sent_at, invoice_count, total_due_cents, recipients for the weekday ops digest.'
  )
  ON CONFLICT (key) DO NOTHING;
END
$$;
