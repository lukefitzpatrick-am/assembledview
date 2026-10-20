-- Migration 0104: allow platform 'microsoft_ads' on client_conversion_events
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: migration_markers guard.
-- Mirror: db/schema/clientConversions.ts. Rules: lib/delivery/conversions/rules.ts.
-- Why: DG6 (sql/snowflake/mart/migrations/2026-10-21_DG6_bing_search_pacing_ACCOUNTADMIN.sql)
-- loads Microsoft Ads conversions into MART.CONVERSION_FACT as platform 'microsoft_ads',
-- event_key 'all_primary'. Without this the client settings form cannot save that event.

-- Before (read only): expect the 7 platform list without microsoft_ads.
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'client_conversion_events_platform_check';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0104_conversion_platform_microsoft_ads') THEN
    RAISE NOTICE '0104 already applied — no-op';
    RETURN;
  END IF;

  ALTER TABLE public.client_conversion_events
    DROP CONSTRAINT IF EXISTS client_conversion_events_platform_check;
  ALTER TABLE public.client_conversion_events
    ADD CONSTRAINT client_conversion_events_platform_check CHECK (
      platform IN ('meta_ads', 'google_ads', 'microsoft_ads', 'tiktok', 'dv360', 'cm360', 'taboola', 'reddit')
    );

  INSERT INTO public.migration_markers (key, note)
  VALUES ('0104_conversion_platform_microsoft_ads', 'client_conversion_events platform check adds microsoft_ads (DG6).')
  ON CONFLICT (key) DO NOTHING;
END
$$;

-- After (read only): expect the list to include 'microsoft_ads'.
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'client_conversion_events_platform_check';
