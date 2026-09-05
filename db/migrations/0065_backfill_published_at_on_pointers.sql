-- Migration 0065: stamp published_at on published_version_id pointers
-- Applied manually 2026-09-05; 34 rows; this file is the record.
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: migration_markers key '0065_backfill_published_at_on_pointers'.
-- published_by stays NULL. Does not touch unpublished drafts that are not
-- the master's published_version_id.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.migration_markers
     WHERE key = '0065_backfill_published_at_on_pointers'
  ) THEN
    update media_plan_versions v
       set published_at = v.created_at
      from media_plan_masters m
     where m.published_version_id = v.id
       and v.published_at is null;

    INSERT INTO public.migration_markers (key, note)
    VALUES (
      '0065_backfill_published_at_on_pointers',
      'Stamp published_at = created_at on published_version_id pointers that had published_at NULL. Applied manually 2026-09-05; 34 rows; published_by left NULL.'
    );
  ELSE
    RAISE NOTICE '0065 already applied (migration_markers) — skip stamp';
  END IF;
END
$$;
