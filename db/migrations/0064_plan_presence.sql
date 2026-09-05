-- Migration 0064: plan_presence (SM-7 — who else has the campaign open)
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: CREATE TABLE IF NOT EXISTS / INSERT ON CONFLICT DO NOTHING.
--
-- Presence is information, not a lock. Do not grant ava_readonly.
-- Runtime uses raw sql and fail-softs if this table is missing (C-76).
-- RLS on; no ava_readonly grant.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
DECLARE
  presence_n int := 0;
BEGIN
  IF to_regclass('public.plan_presence') IS NOT NULL THEN
    SELECT count(*)::int INTO presence_n FROM public.plan_presence;
  END IF;
  RAISE NOTICE '0064 pre-flight plan_presence rows=%', presence_n;
END
$$;

CREATE TABLE IF NOT EXISTS public.plan_presence (
  master_id     bigint NOT NULL REFERENCES public.media_plan_masters(id) ON DELETE CASCADE,
  user_id       text NOT NULL,
  user_label    text,
  page          text NOT NULL DEFAULT 'edit',
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (master_id, user_id),
  CONSTRAINT plan_presence_page_check CHECK (page IN ('edit', 'create'))
);

CREATE INDEX IF NOT EXISTS idx_plan_presence_last_seen
  ON public.plan_presence (last_seen_at);

ALTER TABLE public.plan_presence ENABLE ROW LEVEL SECURITY;
-- Not granted to ava_readonly (presence is editor-private).

INSERT INTO public.migration_markers (key, note)
VALUES (
  '0064_plan_presence',
  'plan_presence: (master_id, user_id) PK. Heartbeat last_seen_at. RLS on; no ava_readonly grant. Information only — not a lock.'
)
ON CONFLICT (key) DO NOTHING;
