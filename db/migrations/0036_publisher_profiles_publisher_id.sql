-- Migration 0036: publisher_profiles.publisher_id → publishers.id
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: ADD COLUMN IF NOT EXISTS + migration_markers backfill guard.
--
-- Attach by publishers.id (nullable FK). Backfill is the explicit four-row
-- map (QMS=30, JCDecaux=35, SCA=12, SEN=19) — never WHERE publisher_id IS NULL
-- alone, never fuzzy on publishers.publisher_name (SCA/SEN would miss).
-- Keep publisher_name as the detection/display label (short names).

ALTER TABLE public.publisher_profiles
  ADD COLUMN IF NOT EXISTS publisher_id bigint REFERENCES public.publishers(id);

CREATE INDEX IF NOT EXISTS idx_publisher_profiles_publisher_id
  ON public.publisher_profiles (publisher_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.migration_markers
     WHERE key = '0036_publisher_profiles_publisher_id_backfill'
  ) THEN
    UPDATE public.publisher_profiles SET publisher_id = 30
     WHERE publisher_name = 'QMS';
    UPDATE public.publisher_profiles SET publisher_id = 35
     WHERE publisher_name = 'JCDecaux';
    UPDATE public.publisher_profiles SET publisher_id = 12
     WHERE publisher_name = 'SCA';
    UPDATE public.publisher_profiles SET publisher_id = 19
     WHERE publisher_name = 'SEN';
    INSERT INTO public.migration_markers (key, note)
    VALUES (
      '0036_publisher_profiles_publisher_id_backfill',
      'Explicit four-row FK backfill by profile publisher_name; never fuzzy.'
    );
  ELSE
    RAISE NOTICE '0036: publisher_id backfill already applied — skipping.';
  END IF;
END
$$;
