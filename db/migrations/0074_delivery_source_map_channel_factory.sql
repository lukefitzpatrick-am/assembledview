-- Migration 0074: seed Channel Factory onto delivery_source_map
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: INSERT ON CONFLICT DO NOTHING + migration_markers guard.
--
-- Runtime does NOT SELECT this table (C-76). The app reads the TypeScript seed
-- in lib/delivery/deliverySourceMap.ts. This file keeps Postgres in step with
-- that seed once 0063 is applied. Hand-sync nothing else.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0074_delivery_source_map_channel_factory') THEN
    RAISE NOTICE '0074 already applied — no-op';
    RETURN;
  END IF;

  IF to_regclass('public.delivery_source_map') IS NULL THEN
    RAISE EXCEPTION '0074 requires delivery_source_map (apply 0063 first)';
  END IF;

  INSERT INTO public.delivery_source_map (
    publisher_key,
    delivery_source,
    derive_spend_from_plan,
    active,
    notes
  ) VALUES (
    'channel factory',
    'partner_file',
    false,
    true,
    'Datorama report 1248052 via partner-ingest. No platform cost.'
  )
  ON CONFLICT (publisher_key) DO NOTHING;

  INSERT INTO public.migration_markers (key, note)
  VALUES (
    '0074_delivery_source_map_channel_factory',
    'delivery_source_map: Channel Factory partner_file seed. App reads TS seed, not this table (C-76).'
  )
  ON CONFLICT (key) DO NOTHING;
END
$$;
