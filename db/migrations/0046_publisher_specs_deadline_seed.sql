-- Migration 0046: seed publisher_specs supply-deadline columns
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: migration_markers key '0046_deadline_seed'.
--
-- Precomputed with the same parseSupplyDeadline patterns SD-3 uses at read
-- time (single "N working days before live" / range "N-M working days").
-- Explicit per-slug numbers — this file is not a runtime parse.
-- Runtime never writes lib/specs/mi-library/.
--
-- Unique clean parse per slug (format + publisher-level supply_deadline_*):
--   cartology  5-10 wd  (all stated rules agree)
--   linkby     10-15 wd (Content Article)
--   ooh-media  5-10 wd  (digital formats; static 10-14 prose does not parse)
--   seven      5 wd     (BVOD/digital format; broadcast prose does not parse)
--
-- Prose-only / no unique clean parse — columns stay NULL:
--   assembled-programmatic, google-ads, meta, tiktok, nine, youtube,
--   news-corp, qms (no vendored JSON), jcdecaux (no vendored JSON),
--   quantcast (5 vs 10 wd disagree), twitch, civic-outdoor, tonic, ten,
--   google-ads-dv360, youtube-dv360

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.migration_markers
     WHERE key = '0046_deadline_seed'
  ) THEN
    RAISE NOTICE '0046_deadline_seed already applied — skipping.';
    RETURN;
  END IF;

  UPDATE public.publisher_specs
     SET supply_deadline_min_days = 5,
         supply_deadline_max_days = 10,
         supply_deadline_business_days = TRUE,
         updated_at = now()
   WHERE publisher_slug = 'cartology';

  UPDATE public.publisher_specs
     SET supply_deadline_min_days = 10,
         supply_deadline_max_days = 15,
         supply_deadline_business_days = TRUE,
         updated_at = now()
   WHERE publisher_slug = 'linkby';

  UPDATE public.publisher_specs
     SET supply_deadline_min_days = 5,
         supply_deadline_max_days = 10,
         supply_deadline_business_days = TRUE,
         updated_at = now()
   WHERE publisher_slug = 'ooh-media';

  UPDATE public.publisher_specs
     SET supply_deadline_min_days = 5,
         supply_deadline_max_days = 5,
         supply_deadline_business_days = TRUE,
         updated_at = now()
   WHERE publisher_slug = 'seven';

  INSERT INTO public.migration_markers (key, note)
  VALUES (
    '0046_deadline_seed',
    'publisher_specs min/max/business from unique clean parseSupplyDeadline; prose-only stay NULL.'
  );
END
$$;
