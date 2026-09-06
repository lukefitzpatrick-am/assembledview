-- Migration 0066: publisher_profiles.money_rules
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: ADD COLUMN IF NOT EXISTS + per-publisher jsonb merge guarded
-- by migration_markers.
--
-- Profile-level money semantics: media_amount_basis, stated_total (campaign
-- cell label + line column), section_subtotal, rate_card. Not a rewrite of
-- column_map / sheet_rules. RLS unchanged; no ava_readonly grant.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
DECLARE
  profiles_n int := 0;
BEGIN
  IF to_regclass('public.publisher_profiles') IS NOT NULL THEN
    SELECT count(*)::int INTO profiles_n FROM public.publisher_profiles;
  END IF;
  RAISE NOTICE '0066 pre-flight publisher_profiles rows=%', profiles_n;
END
$$;

ALTER TABLE public.publisher_profiles
  ADD COLUMN IF NOT EXISTS money_rules jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.publisher_profiles
SET
  money_rules = jsonb_build_object(
    'media_amount_basis', 'weekly_rate'
  ),
  updated_at = now()
WHERE publisher_name = 'QMS'
  AND NOT EXISTS (
    SELECT 1 FROM public.migration_markers
    WHERE key = '0066_publisher_profiles_money_rules'
  );

UPDATE public.publisher_profiles
SET
  money_rules = jsonb_build_object(
    'media_amount_basis', 'line_total',
    'stated_total', jsonb_build_object('column', 'Client Total')
  ),
  updated_at = now()
WHERE publisher_name = 'SCA'
  AND NOT EXISTS (
    SELECT 1 FROM public.migration_markers
    WHERE key = '0066_publisher_profiles_money_rules'
  );

UPDATE public.publisher_profiles
SET
  money_rules = jsonb_build_object(
    'media_amount_basis', 'line_total',
    'stated_total', jsonb_build_object(
      'label', 'TOTAL MEDIA INVESTMENT (ex. P&I)',
      'column', 'MEDIA BOUGHT RATE'
    ),
    'section_subtotal', jsonb_build_object(
      'label', 'MEDIA INVESTMENT (ex. P&I):'
    ),
    'rate_card', jsonb_build_object(
      'column', 'MEDIA VALUE (inc. STA)'
    )
  ),
  updated_at = now()
WHERE publisher_name = 'JCDecaux'
  AND NOT EXISTS (
    SELECT 1 FROM public.migration_markers
    WHERE key = '0066_publisher_profiles_money_rules'
  );

INSERT INTO public.migration_markers (key, note)
VALUES (
  '0066_publisher_profiles_money_rules',
  'publisher_profiles.money_rules jsonb. QMS weekly_rate; SCA/JCD line_total; JCD stated cell TOTAL MEDIA INVESTMENT (ex. P&I); MEDIA VALUE is rate-card. RLS unchanged.'
)
ON CONFLICT (key) DO NOTHING;
