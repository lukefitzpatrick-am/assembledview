-- Migration 0069: VP-1 — published_version_id must point at a stamped version
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: migration_markers key '0069_published_pointer_must_be_stamped'.
--
-- A plain CHECK cannot span tables. This is a CONSTRAINT TRIGGER, DEFERRABLE
-- INITIALLY DEFERRED, so savePlan can stamp published_at and advance the
-- pointer in one transaction in either statement order.
--
-- DO NOT APPLY until the stamping writer (R1) is live in production.
-- Production main 8f31a43d advances published_version_id without stamping.
-- This trigger fires on UPDATE OF published_version_id, so applying 0069
-- before R1 is live makes every production publish fail at COMMIT.
--
-- REQUIRED ORDER: R1 live in production, then 0070, then this file (0069).
-- CREATE CONSTRAINT TRIGGER does not scan existing rows, so 0070 must
-- already have stamped the 12 C-113 pointers. Unstamped-pointer count must
-- be 0 at this point.
--
-- RLS: SECURITY DEFINER so the check sees every version/master row.
-- published_version_id IS NULL is allowed (no live cut).

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

CREATE OR REPLACE FUNCTION public.enforce_published_pointer_stamped()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'media_plan_masters' THEN
    IF NEW.published_version_id IS NULL THEN
      RETURN NEW;
    END IF;
    PERFORM 1
      FROM public.media_plan_versions v
     WHERE v.id = NEW.published_version_id
       AND v.published_at IS NOT NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION
        'VP-1: media_plan_masters.published_version_id (%) must point at a version with published_at set',
        NEW.published_version_id
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'media_plan_versions' THEN
    IF NEW.published_at IS NOT NULL THEN
      RETURN NEW;
    END IF;
    PERFORM 1
      FROM public.media_plan_masters m
     WHERE m.published_version_id = NEW.id;
    IF FOUND THEN
      RAISE EXCEPTION
        'VP-1: cannot clear media_plan_versions.published_at on id % while a master published_version_id points at it',
        NEW.id
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END
$$;

COMMENT ON FUNCTION public.enforce_published_pointer_stamped() IS
  'VP-1: master published_version_id must reference a version with published_at set. Deferred constraint trigger.';

DO $$
DECLARE
  violations int := 0;
BEGIN
  SELECT count(*)::int INTO violations
    FROM public.media_plan_masters m
    JOIN public.media_plan_versions v ON v.id = m.published_version_id
   WHERE v.published_at IS NULL;
  RAISE NOTICE '0069 pre-flight unstamped published pointers=% (must be 0 — 0070 has already run)', violations;

  IF EXISTS (
    SELECT 1 FROM public.migration_markers
     WHERE key = '0069_published_pointer_must_be_stamped'
  ) THEN
    RAISE NOTICE '0069 already applied (migration_markers) — skip trigger create';
    RETURN;
  END IF;

  EXECUTE 'DROP TRIGGER IF EXISTS trg_mp_masters_published_pointer_stamped ON public.media_plan_masters';
  EXECUTE $sql$
    CREATE CONSTRAINT TRIGGER trg_mp_masters_published_pointer_stamped
    AFTER INSERT OR UPDATE OF published_version_id
    ON public.media_plan_masters
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_published_pointer_stamped()
  $sql$;

  EXECUTE 'DROP TRIGGER IF EXISTS trg_mp_versions_published_at_pointer_stamped ON public.media_plan_versions';
  EXECUTE $sql$
    CREATE CONSTRAINT TRIGGER trg_mp_versions_published_at_pointer_stamped
    AFTER UPDATE OF published_at
    ON public.media_plan_versions
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_published_pointer_stamped()
  $sql$;

  INSERT INTO public.migration_markers (key, note)
  VALUES (
    '0069_published_pointer_must_be_stamped',
    'VP-1 constraint triggers: published_version_id must point at published_at IS NOT NULL. DEFERRABLE INITIALLY DEFERRED. Does not validate existing rows.'
  )
  ON CONFLICT (key) DO NOTHING;
END
$$;
