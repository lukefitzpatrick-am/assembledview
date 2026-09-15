-- Migration 0075: seed Twitch onto delivery_source_map
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
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0075_delivery_source_map_twitch') THEN
    RAISE NOTICE '0075 already applied — no-op';
    RETURN;
  END IF;

  IF to_regclass('public.delivery_source_map') IS NULL THEN
    RAISE EXCEPTION '0075 requires delivery_source_map (apply 0063 first)';
  END IF;

  INSERT INTO public.delivery_source_map (
    publisher_key,
    delivery_source,
    derive_spend_from_plan,
    active,
    notes
  ) VALUES (
    'twitch',
    'cm360',
    true,
    true,
    'CM360 verification; modelled spend (Quantcast pattern).'
  )
  ON CONFLICT (publisher_key) DO NOTHING;

  INSERT INTO public.migration_markers (key, note)
  VALUES (
    '0075_delivery_source_map_twitch',
    'delivery_source_map: Twitch cm360 seed with derive_spend_from_plan true. App reads TS seed, not this table (C-76).'
  )
  ON CONFLICT (key) DO NOTHING;
END
$$;
