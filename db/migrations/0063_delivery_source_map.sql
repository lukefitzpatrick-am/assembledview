-- Migration 0063: delivery_source_map (programmatic delivery platform → source)
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: CREATE TABLE IF NOT EXISTS / INSERT ON CONFLICT DO NOTHING.
--
-- Replaces the hardcoded programmatic platform Set. Runtime reads a TypeScript
-- seed that mirrors this table until 0063 is applied (do not SELECT live —
-- C-76). derive_spend_from_plan is TRUE for both Quantcast keys (smoke) and
-- FALSE for DV360/Taboola DSP rows.
-- RLS on; no ava_readonly grant (owner path, same as 0060 / 0041).

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
DECLARE
  map_n int := 0;
BEGIN
  IF to_regclass('public.delivery_source_map') IS NOT NULL THEN
    SELECT count(*)::int INTO map_n FROM public.delivery_source_map;
  END IF;
  RAISE NOTICE '0063 pre-flight delivery_source_map rows=%', map_n;
END
$$;

CREATE TABLE IF NOT EXISTS public.delivery_source_map (
  publisher_key           text PRIMARY KEY,
  delivery_source         text NOT NULL,
  derive_spend_from_plan  boolean NOT NULL DEFAULT false,
  active                  boolean NOT NULL DEFAULT true,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_source_map_delivery_source_check
    CHECK (delivery_source IN ('dsp', 'cm360', 'partner_file'))
);

ALTER TABLE public.delivery_source_map ENABLE ROW LEVEL SECURITY;

INSERT INTO public.delivery_source_map (
  publisher_key,
  delivery_source,
  derive_spend_from_plan,
  active
) VALUES
  ('dv360',               'dsp',   false, true),
  ('youtube - dv360',     'dsp',   false, true),
  ('youtube-dv360',       'dsp',   false, true),
  ('taboola',             'dsp',   false, true),
  ('native - taboola',    'dsp',   false, true),
  ('native',              'dsp',   false, true),
  ('quantcast - direct',  'cm360', true,  true),
  ('quantcast',           'cm360', true,  true)
ON CONFLICT (publisher_key) DO NOTHING;

INSERT INTO public.migration_markers (key, note)
VALUES (
  '0063_delivery_source_map',
  'delivery_source_map: programmatic publisher_key → dsp|cm360|partner_file. RLS on; no ava_readonly grant. Seed = today''s DV360/Taboola allowlist plus both Quantcast keys. derive_spend_from_plan TRUE for both Quantcast keys (smoke); FALSE for DV360/Taboola DSP rows.'
)
ON CONFLICT (key) DO NOTHING;
