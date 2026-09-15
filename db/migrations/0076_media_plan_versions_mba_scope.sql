-- Migration 0076: media_plan_versions.mba_scope jsonb
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: migration_markers guard + ADD COLUMN IF NOT EXISTS.
--
-- Shape: { lineItemIds: string[] | null, monthYears: string[] | null, partial: boolean }
-- NULL = full scope. No backfill — old versions stay null; readers treat null as full.
-- Runtime write lands in a later commit (savePlanVersion). Do not SELECT until applied (C-76).

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0076_media_plan_versions_mba_scope') THEN
    RAISE NOTICE '0076 already applied — no-op';
    RETURN;
  END IF;

  IF to_regclass('public.media_plan_versions') IS NULL THEN
    RAISE EXCEPTION '0076 requires media_plan_versions';
  END IF;

  ALTER TABLE public.media_plan_versions
    ADD COLUMN IF NOT EXISTS mba_scope jsonb NULL;

  COMMENT ON COLUMN public.media_plan_versions.mba_scope IS
    '{ lineItemIds: string[] | null, monthYears: string[] | null, partial: boolean }; null = full scope';

  INSERT INTO public.migration_markers (key, note)
  VALUES (
    '0076_media_plan_versions_mba_scope',
    'media_plan_versions.mba_scope jsonb. null = full scope. No backfill.'
  )
  ON CONFLICT (key) DO NOTHING;
END
$$;
