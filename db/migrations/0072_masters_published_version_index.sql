-- Migration 0072: index covering media_plan_masters.published_version_id
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: CREATE INDEX IF NOT EXISTS. No data change. Non-destructive.
--
-- pg_indexes has no index covering this column. Supabase's performance
-- linter flags fk_masters_published_version as an unindexed foreign key.
-- Finance published-cut joins (31 sites via PUBLISHED_VERSION_JOIN_SQL),
-- the published-version guard fragment, and 0069's reverse lookup
-- (masters.published_version_id = versions.id on published_at UPDATE)
-- all need it.
--
-- Table is small (~189 non-null pointers). Plain CREATE INDEX is enough;
-- CREATE INDEX CONCURRENTLY is not needed (no long write lock on this
-- size). btree, no partial WHERE — the FK check and the joins look up
-- by value, including finding which master points at a given version.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
DECLARE
  masters_n int := 0;
  pointers_n int := 0;
BEGIN
  IF to_regclass('public.media_plan_masters') IS NOT NULL THEN
    SELECT count(*)::int INTO masters_n FROM public.media_plan_masters;
    SELECT count(*)::int INTO pointers_n
      FROM public.media_plan_masters
     WHERE published_version_id IS NOT NULL;
  END IF;
  RAISE NOTICE '0072 pre-flight media_plan_masters rows=% non-null published_version_id=%',
    masters_n, pointers_n;
END
$$;

CREATE INDEX IF NOT EXISTS idx_media_plan_masters_published_version_id
  ON public.media_plan_masters (published_version_id);

INSERT INTO public.migration_markers (key, note)
VALUES (
  '0072_masters_published_version_index',
  'btree index on media_plan_masters.published_version_id covering fk_masters_published_version. Finance published-cut joins, published-version guard, and 0069 reverse lookup. Table is small (~189 pointers); plain CREATE INDEX, not CONCURRENTLY.'
)
ON CONFLICT (key) DO NOTHING;
