-- Migration 0071: go-live — delete eight plan_working_drafts rows
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: migration_markers key '0071_clear_plan_working_drafts'.
--
-- Does NOT UPDATE campaign_status (or any other column on
-- media_plan_masters / media_plan_versions). Real-client plans in the
-- delete set are approved; setting them to planned would move money out
-- of finance-included totals. Leave every master's status exactly as it is.
--
-- STRMEA001 (master_id 267) stays. It is live work: 208,622 bytes on a
-- $1.98m campaign, and its owner has not released it. Any rev 16 row that
-- needs that plan stays blocked until they do. glenda009 (master_id
-- 10012553, test client) also stays — it is not in the delete set.
--
-- Recovery (table has no history): restore from the Part A export
--   exports/working-drafts/plan_working_drafts-2026-09-14T005310965Z.json
--
-- Scope: eight rows by master_id, pinned to mba_number:
--   229 glenda006  | 244 golf025  | 245 golf026  | 288 hartm015
--   257 hema007    | 289 krusty001 | 224 malay004 | 243 PGAAUS015
-- Keep (must be present, must not be in the delete set):
--   267 STRMEA001  | 10012553 glenda009
-- Aborts (no marker) unless matching = 8 and table_n >= 8, and unless
-- both keep rows are present and outside the delete set.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
DECLARE
  table_n        int := 0;
  found_n        int := 0;
  deleted_n      int := 0;
  keep_strmea    int := 0;
  keep_glenda    int := 0;
  keep_in_delete int := 0;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.migration_markers
     WHERE key = '0071_clear_plan_working_drafts'
  ) THEN
    RAISE NOTICE '0071 already applied (migration_markers) — skip delete';
    RETURN;
  END IF;

  SELECT count(*)::int INTO table_n
    FROM public.plan_working_drafts;

  SELECT count(*)::int INTO found_n
    FROM public.plan_working_drafts d
    JOIN public.media_plan_masters m
      ON m.id = d.master_id
    JOIN (
      VALUES
        (229::bigint, 'glenda006'),
        (244::bigint, 'golf025'),
        (245::bigint, 'golf026'),
        (288::bigint, 'hartm015'),
        (257::bigint, 'hema007'),
        (289::bigint, 'krusty001'),
        (224::bigint, 'malay004'),
        (243::bigint, 'PGAAUS015')
    ) AS t(master_id, mba_number)
      ON d.master_id = t.master_id
     AND lower(m.mba_number) = lower(t.mba_number);

  SELECT count(*)::int INTO keep_strmea
    FROM public.plan_working_drafts d
    JOIN public.media_plan_masters m
      ON m.id = d.master_id
   WHERE d.master_id = 267
     AND lower(m.mba_number) = lower('STRMEA001');

  SELECT count(*)::int INTO keep_glenda
    FROM public.plan_working_drafts d
    JOIN public.media_plan_masters m
      ON m.id = d.master_id
   WHERE d.master_id = 10012553
     AND lower(m.mba_number) = lower('glenda009');

  SELECT count(*)::int INTO keep_in_delete
    FROM public.plan_working_drafts d
    JOIN public.media_plan_masters m
      ON m.id = d.master_id
    JOIN (
      VALUES
        (229::bigint, 'glenda006'),
        (244::bigint, 'golf025'),
        (245::bigint, 'golf026'),
        (288::bigint, 'hartm015'),
        (257::bigint, 'hema007'),
        (289::bigint, 'krusty001'),
        (224::bigint, 'malay004'),
        (243::bigint, 'PGAAUS015')
    ) AS t(master_id, mba_number)
      ON d.master_id = t.master_id
     AND lower(m.mba_number) = lower(t.mba_number)
   WHERE d.master_id IN (267, 10012553);

  RAISE NOTICE
    '0071 pre-flight table_n=% matching=% (matching must be 8, table_n >= 8) keep_strmea=% keep_glenda=% keep_in_delete=%',
    table_n, found_n, keep_strmea, keep_glenda, keep_in_delete;

  IF found_n <> 8 OR table_n < 8 THEN
    RAISE EXCEPTION
      '0071 expected matching=8 and table_n >= 8, found table_n=% matching=% — abort, no marker',
      table_n, found_n;
  END IF;

  IF keep_strmea < 1 OR keep_glenda < 1 THEN
    RAISE EXCEPTION
      '0071 keep rows missing: STRMEA001(267) n=% glenda009(10012553) n=% — abort, no marker',
      keep_strmea, keep_glenda;
  END IF;

  IF keep_in_delete <> 0 THEN
    RAISE EXCEPTION
      '0071 keep rows must not be in the delete set (keep_in_delete=% ) — abort, no marker',
      keep_in_delete;
  END IF;

  DELETE FROM public.plan_working_drafts d
  USING public.media_plan_masters m,
        (
          VALUES
            (229::bigint, 'glenda006'),
            (244::bigint, 'golf025'),
            (245::bigint, 'golf026'),
            (288::bigint, 'hartm015'),
            (257::bigint, 'hema007'),
            (289::bigint, 'krusty001'),
            (224::bigint, 'malay004'),
            (243::bigint, 'PGAAUS015')
        ) AS t(master_id, mba_number)
  WHERE d.master_id = t.master_id
    AND m.id = d.master_id
    AND lower(m.mba_number) = lower(t.mba_number);

  GET DIAGNOSTICS deleted_n = ROW_COUNT;

  IF deleted_n <> 8 THEN
    RAISE EXCEPTION
      '0071 deleted % rows, expected 8 — abort, no marker',
      deleted_n;
  END IF;

  INSERT INTO public.migration_markers (key, note)
  VALUES (
    '0071_clear_plan_working_drafts',
    'Go-live: delete eight plan_working_drafts rows by master_id. Keep STRMEA001 (267) and glenda009 (10012553). No campaign_status update. Recovery: exports/working-drafts/plan_working_drafts-2026-09-14T005310965Z.json'
  );
END
$$;
