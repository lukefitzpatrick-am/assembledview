-- Migration 0041: publisher_specs + spec_runs (MI specs store)
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: CREATE IF NOT EXISTS + migration_markers join-seed guard.
--
-- Join is explicit publishers.id (verified live). Never fuzzy on publisher_name.
-- Vendored lib/specs/mi-library/ is NOT copied into spec_json here — runtime
-- never writes that folder; JSON import is a later cycle. spec_json defaults {}.
-- Structured deadline columns exist nullable; C-53 read-time parse stays until
-- this store is applied and the parse migrates in.
-- SCA/SEN stay ingest-only (publisher_profiles) — not seeded here.
-- civic-outdoor / tonic / ten stay publisher_id NULL.
-- Buying-platform suffix rows (Google Ads / YouTube - AM/DV360/CM360) join
-- ids 3 and 15 as-is — do not mint extra publishers.
-- publishers.id 61 is a trailing-space duplicate of Nine (id 11) — do not touch.
-- RLS on; no ava_readonly grant (owner path, same pattern as ingest_runs).

CREATE TABLE IF NOT EXISTS public.publisher_specs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  publisher_slug text NOT NULL,
  publisher_id bigint REFERENCES public.publishers(id) ON DELETE RESTRICT,
  publisher_name text NOT NULL,
  spec_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  supply_deadline_min_days integer,
  supply_deadline_max_days integer,
  supply_deadline_business_days boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publisher_specs_slug_unique UNIQUE (publisher_slug)
);

CREATE INDEX IF NOT EXISTS idx_publisher_specs_publisher_id
  ON public.publisher_specs (publisher_id);

ALTER TABLE public.publisher_specs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.spec_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  publisher_specs_id bigint REFERENCES public.publisher_specs(id) ON DELETE SET NULL,
  publisher_id bigint REFERENCES public.publishers(id) ON DELETE RESTRICT,
  publisher_slug text,
  file_name text,
  uploaded_by text,
  blob_path text,
  extracted jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome text NOT NULL
    CHECK (outcome IN ('parsed', 'confirmed', 'rejected', 'failed')),
  outcome_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spec_runs_publisher_specs_id
  ON public.spec_runs (publisher_specs_id);

CREATE INDEX IF NOT EXISTS idx_spec_runs_created_at
  ON public.spec_runs (created_at DESC);

ALTER TABLE public.spec_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.migration_markers
     WHERE key = '0041_publisher_specs_join_seed'
  ) THEN
    INSERT INTO public.publisher_specs (publisher_slug, publisher_id, publisher_name)
    VALUES
      ('assembled-programmatic', 2, 'Assembled Programmatic (internal default specs)'),
      ('google-ads', 3, 'Google Ads'),
      ('meta', 4, 'Meta (Facebook + Instagram)'),
      ('tiktok', 7, 'TikTok'),
      ('cartology', 10, 'Cartology'),
      ('nine', 11, 'Nine'),
      ('youtube', 15, 'YouTube (via Google Ads)'),
      ('linkby', 22, 'Linkby'),
      ('news-corp', 26, 'News Corp Australia'),
      ('seven', 29, 'Seven Network'),
      ('qms', 30, 'QMS'),
      ('jcdecaux', 35, 'JCDecaux'),
      ('ooh-media', 43, 'oOh!media'),
      ('quantcast', 49, 'Quantcast'),
      ('twitch', 66, 'Twitch (via Amazon Ads)'),
      ('civic-outdoor', NULL, 'Civic Outdoor'),
      ('tonic', NULL, 'Tonic Media Network'),
      ('ten', NULL, 'Ten'),
      -- Suffix aliases share canonical catalogue ids (3 / 15) as-is.
      ('google-ads-dv360', 3, 'Google Ads - DV360'),
      ('youtube-dv360', 15, 'YouTube - DV360')
    ON CONFLICT (publisher_slug) DO UPDATE SET
      publisher_id = EXCLUDED.publisher_id,
      publisher_name = EXCLUDED.publisher_name,
      updated_at = now();

    INSERT INTO public.migration_markers (key, note)
    VALUES (
      '0041_publisher_specs_join_seed',
      'Explicit publisher_specs.publisher_id map; never fuzzy; never id 61.'
    );
  ELSE
    RAISE NOTICE '0041: publisher_specs join seed already applied — skipping.';
  END IF;
END
$$;
