-- Migration 0070: VP-1 backfill — stamp exactly 12 unstamped published pointers
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: migration_markers key '0070_backfill_vp1_unstamped_pointers'.
--
-- REQUIRED ORDER: R1 live in production, then this file (0070), then 0069.
-- 0070 runs FIRST of the two SQL files. Do not apply 0069 first.
-- Why this file is still needed after 0069 exists: CREATE CONSTRAINT TRIGGER
-- does not scan existing rows, so the 12 C-113 pointers would survive 0069
-- unstamped. This UPDATE stamps them before the trigger is installed.
--
-- Recurrence of C-93 (0065 stamped 34 on 5 Sep, published_by left NULL).
-- Re-accumulation from 6 Sep because production main still advances
-- published_version_id without stamping. These 12 only — not a generic
-- WHERE published_at IS NULL (that would republish genuine drafts).
--
-- Stamp:
--   published_at = created_at
--     Pointer advanced in the same transaction that created the version;
--     creation time is publication time for these rows (zero-second lag).
--   published_by = COALESCE(published_by, 'backfill:vp-1')
--     Lowercase required by media_plan_versions_published_by_lowercase.
--     Not NULL: 0065's 34 NULLs are indistinguishable from "unknown actor".
--     Sentinel is not an email; it marks a VP-1 backfill, not a person.
--     COALESCE keeps a real actor if one is already on the row.
--
-- Aborts (no marker) unless exactly 12 matching unstamped pointer rows
-- with snapshot_checksum are found and updated.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
DECLARE
  found_n   int := 0;
  stamped_n int := 0;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.migration_markers
     WHERE key = '0070_backfill_vp1_unstamped_pointers'
  ) THEN
    RAISE NOTICE '0070 already applied (migration_markers) — skip stamp';
    RETURN;
  END IF;

  SELECT count(*)::int INTO found_n
    FROM (
      VALUES
        ('pgaaus018', 3),
        ('golf025', 30),
        ('sthaus002', 2),
        ('hartm015', 9),
        ('pgaaus017', 7),
        ('sinch001', 6),
        ('pgaaus015', 25),
        ('golf028', 1),
        ('hema008', 2),
        ('they001', 13),
        ('bicau006', 21),
        ('bicau002', 27)
    ) AS t(mba_number, version_number)
    JOIN public.media_plan_masters m
      ON lower(m.mba_number) = lower(t.mba_number)
    JOIN public.media_plan_versions v
      ON v.id = m.published_version_id
     AND v.version_number = t.version_number
   WHERE v.published_at IS NULL
     AND v.snapshot_checksum IS NOT NULL;

  RAISE NOTICE '0070 pre-flight matching unstamped pointers=% (must be 12)', found_n;

  IF found_n <> 12 THEN
    RAISE EXCEPTION
      '0070 expected 12 unstamped published-pointer rows with snapshot_checksum, found % — abort, no marker',
      found_n;
  END IF;

  UPDATE public.media_plan_versions v
     SET published_at = v.created_at,
         published_by = COALESCE(v.published_by, 'backfill:vp-1')
    FROM public.media_plan_masters m
    JOIN (
      VALUES
        ('pgaaus018', 3),
        ('golf025', 30),
        ('sthaus002', 2),
        ('hartm015', 9),
        ('pgaaus017', 7),
        ('sinch001', 6),
        ('pgaaus015', 25),
        ('golf028', 1),
        ('hema008', 2),
        ('they001', 13),
        ('bicau006', 21),
        ('bicau002', 27)
    ) AS t(mba_number, version_number)
      ON lower(m.mba_number) = lower(t.mba_number)
   WHERE v.id = m.published_version_id
     AND v.version_number = t.version_number
     AND v.published_at IS NULL
     AND v.snapshot_checksum IS NOT NULL;

  GET DIAGNOSTICS stamped_n = ROW_COUNT;

  IF stamped_n <> 12 THEN
    RAISE EXCEPTION
      '0070 stamped % rows, expected 12 — abort, no marker',
      stamped_n;
  END IF;

  INSERT INTO public.migration_markers (key, note)
  VALUES (
    '0070_backfill_vp1_unstamped_pointers',
    'Stamp published_at = created_at and published_by = backfill:vp-1 on 12 published_version_id pointers (C-113 / VP-1). Not a generic NULL scan.'
  );
END
$$;
