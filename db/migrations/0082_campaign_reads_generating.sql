-- Migration 0082: campaign_reads generating | failed + error_message
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: migration_markers guard. Requires 0079 (campaign_reads).
--
-- Do not SELECT this table against live Postgres until 0079+0082 are applied (C-76).
-- Mirror: db/schema/campaignReads.ts.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0082_campaign_reads_generating') THEN
    RAISE NOTICE '0082 already applied — no-op';
    RETURN;
  END IF;

  IF to_regclass('public.campaign_reads') IS NULL THEN
    RAISE NOTICE '0082 skipped — campaign_reads missing (apply 0079 first)';
    RETURN;
  END IF;

  ALTER TABLE public.campaign_reads
    DROP CONSTRAINT IF EXISTS campaign_reads_status_check;

  ALTER TABLE public.campaign_reads
    ADD CONSTRAINT campaign_reads_status_check
    CHECK (status = ANY (ARRAY[
      'draft'::text,
      'published'::text,
      'generating'::text,
      'failed'::text
    ]));

  ALTER TABLE public.campaign_reads
    ADD COLUMN IF NOT EXISTS error_message text;

  COMMENT ON COLUMN public.campaign_reads.error_message IS
    'Set when status is failed. Cleared when a generating row becomes draft.';

  INSERT INTO public.migration_markers (key, note)
  VALUES (
    '0082_campaign_reads_generating',
    'campaign_reads status generating|failed and error_message for async generate.'
  )
  ON CONFLICT (key) DO NOTHING;
END
$$;
