-- Migration 0079: campaign_reads — dashboard campaign read drafts/publishes
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: CREATE TABLE / INDEX IF NOT EXISTS + migration_markers guard.
--
-- Do not SELECT this table against live Postgres until this file is applied (C-76).
-- Mirror: db/schema/campaignReads.ts.
-- One row per generation. Edits update the latest draft in place.
-- Publish stamps the row and unpublishes any earlier published row for the same mba+version.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0079_campaign_reads') THEN
    RAISE NOTICE '0079 already applied — no-op';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.campaign_reads (
    id                   serial PRIMARY KEY,
    mba_number           text NOT NULL,
    version_number       integer NOT NULL,
    status               text NOT NULL DEFAULT 'draft',
    beats                jsonb NOT NULL,
    body_markdown        text NOT NULL,
    sources              jsonb,
    generated_at         timestamptz NOT NULL DEFAULT now(),
    generated_by_email   text NOT NULL,
    edited_at            timestamptz,
    edited_by_email      text,
    published_at         timestamptz,
    published_by_email   text,
    CONSTRAINT campaign_reads_status_check
      CHECK (status = ANY (ARRAY['draft'::text, 'published'::text]))
  );

  CREATE INDEX IF NOT EXISTS idx_campaign_reads_mba_version_status
    ON public.campaign_reads (mba_number, version_number, status);

  CREATE INDEX IF NOT EXISTS idx_campaign_reads_mba_generated
    ON public.campaign_reads (mba_number, generated_at DESC);

  COMMENT ON TABLE public.campaign_reads IS
    'Dashboard campaign read. One row per generation. Publish unpublishes earlier rows for the same mba+version.';

  ALTER TABLE public.campaign_reads ENABLE ROW LEVEL SECURITY;

  INSERT INTO public.migration_markers (key, note)
  VALUES (
    '0079_campaign_reads',
    'campaign_reads table for dashboard six-beat campaign read drafts and publishes.'
  )
  ON CONFLICT (key) DO NOTHING;
END
$$;
