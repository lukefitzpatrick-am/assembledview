-- Migration 0083: campaign_kpi unique per line
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: migration_markers guard.
--
-- Deletes older twins (keep newest created_at, then max id) then unique index
-- on (lower(mba_number), version_number, lower(line_item_id)).
-- Mirror: db/schema/ported.ts. Do not drizzle-kit.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
DECLARE
  deleted_count integer := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0083_campaign_kpi_dedupe') THEN
    RAISE NOTICE '0083 already applied — no-op';
    RETURN;
  END IF;

  IF to_regclass('public.campaign_kpi') IS NULL THEN
    RAISE EXCEPTION '0083 requires public.campaign_kpi (apply 0001 first)';
  END IF;

  WITH ranked AS (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY lower(mba_number), version_number, lower(line_item_id)
        ORDER BY created_at DESC NULLS LAST, id DESC
      ) AS rn
    FROM public.campaign_kpi
    WHERE line_item_id IS NOT NULL
  )
  DELETE FROM public.campaign_kpi k
  USING ranked r
  WHERE k.id = r.id
    AND r.rn > 1;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '0083 deleted % duplicate campaign_kpi row(s)', deleted_count;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_kpi_mba_version_line
    ON public.campaign_kpi (lower(mba_number), version_number, lower(line_item_id))
    WHERE line_item_id IS NOT NULL;

  INSERT INTO public.migration_markers (key, note)
  VALUES (
    '0083_campaign_kpi_dedupe',
    'campaign_kpi unique on lower(mba_number), version_number, lower(line_item_id); twins deleted keeping newest.'
  )
  ON CONFLICT (key) DO NOTHING;
END
$$;
