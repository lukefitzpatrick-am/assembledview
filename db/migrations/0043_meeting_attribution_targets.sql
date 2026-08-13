-- Migration 0043: Fireflies attribution targets (publisher / internal / new_business)
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE IF NOT EXISTS + migration_markers backfill guard.
--
-- 0042 is spec_deadline_overrides — this is the next free number.
-- Never seed publisher_domains (veridooh.com etc. are learned on assign, never hardcoded).
-- publishers.id 61 is a trailing-space duplicate of Nine (id 11) — do not touch.
-- RLS on new tables; no ava_readonly grant (owner path, same pattern as ingest_runs).

-- ---------------------------------------------------------------------------
-- 1. client_notes attribution columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.client_notes
  ADD COLUMN IF NOT EXISTS attributed_type text;

ALTER TABLE public.client_notes
  DROP CONSTRAINT IF EXISTS client_notes_attributed_type_check;

ALTER TABLE public.client_notes
  ADD CONSTRAINT client_notes_attributed_type_check
  CHECK (
    attributed_type IS NULL
    OR attributed_type IN ('client', 'publisher', 'internal', 'new_business')
  );

ALTER TABLE public.client_notes
  ADD COLUMN IF NOT EXISTS publisher_id bigint REFERENCES public.publishers(id);

CREATE INDEX IF NOT EXISTS idx_client_notes_attributed_type
  ON public.client_notes (attributed_type);

CREATE INDEX IF NOT EXISTS idx_client_notes_publisher_id
  ON public.client_notes (publisher_id);

COMMENT ON COLUMN public.client_notes.attributed_type IS
  'Fireflies attribution bucket. NULL is the unattributed queue.';

COMMENT ON COLUMN public.client_notes.publisher_id IS
  'Set when attributed_type = publisher. Client mappings always win over publisher.';

-- Widen matched_by for publisher-domain + title-rule attribution.
ALTER TABLE public.client_notes
  DROP CONSTRAINT IF EXISTS client_notes_matched_by_check;

ALTER TABLE public.client_notes
  ADD CONSTRAINT client_notes_matched_by_check
  CHECK (
    matched_by IS NULL
    OR matched_by IN (
      'domain',
      'keyword',
      'manual',
      'title',
      'internal',
      'publisher_domain',
      'title_rule'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Backfill attributed_type (NULL after this pass IS the queue)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.migration_markers
     WHERE key = '0042_attributed_type_backfill'
  ) THEN
    UPDATE public.client_notes
       SET attributed_type = 'client'
     WHERE client_id IS NOT NULL
       AND attributed_type IS NULL;

    UPDATE public.client_notes
       SET attributed_type = 'internal'
     WHERE client_id IS NULL
       AND is_internal = true
       AND attributed_type IS NULL;

    INSERT INTO public.migration_markers (key, note)
    VALUES (
      '0042_attributed_type_backfill',
      'client_id → client; else is_internal → internal; neither stays NULL (queue).'
    );
  ELSE
    RAISE NOTICE '0043: attributed_type backfill already applied — skipping.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. publisher_domains — learned on assign, never seeded
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.publisher_domains (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  publisher_id bigint NOT NULL REFERENCES public.publishers(id),
  email_domain text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_publisher_domains_publisher_id
  ON public.publisher_domains (publisher_id);

ALTER TABLE public.publisher_domains ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.publisher_domains IS
  'Attendee email domain → publisher. Learned on manual assign. Never seed vendor domains.';

-- ---------------------------------------------------------------------------
-- 4. meeting_title_rules — internal / new_business from normalised title
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_title_rules (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  normalized_title text NOT NULL UNIQUE,
  target_type text NOT NULL
    CHECK (target_type IN ('internal', 'new_business')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meeting_title_rules ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.meeting_title_rules IS
  'Exact match on Fireflies title after the same normalisation as client title matching.';
