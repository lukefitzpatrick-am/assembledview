-- 2026-10-23 campaign_kpi.cpv: archive then null saved CPV targets (OPTIONAL)
-- Project: Supabase slpdibnxtpdlttbbczvg. Run in the Supabase SQL editor.
--
-- Is it needed?
--   No. Since 23 Oct 2026 no code reads campaign_kpi.cpv: the plan CPV is
--   always the CPV target, and every write path sends cpv = null (plan save
--   fan-out and the pacing KPI editor). Leaving the values does nothing.
--   Run this only to tidy the column before dropping it later.
--   Note: `db:etl` truncate-reload from Xano would bring old values back
--   until Xano is cleaned too (same caveat as the percent-unit contract).
--
-- What it does
--   1. Copies every campaign_kpi row with a non-null cpv into
--      campaign_kpi_cpv_archive_20261023 (id, mba_number, version_number,
--      line_item_id, cpv, archived_at). Nothing is deleted.
--   2. Sets campaign_kpi.cpv = NULL on exactly those rows.
--
-- Measured read-only 23 Oct 2026
--   campaign_kpi 20,840 rows; cpv not null 16,088; cpv non-zero 290
--   (18 MBAs); sum of cpv 71.909980. No triggers on campaign_kpi.
--   Guards are exact: 16,088 and 290, or the block aborts. A plan save
--   between the measure and the run can lower these; re-run BEFORE and
--   update the two numbers if it aborts.

-- ===================== BEFORE =====================
SELECT count(*) AS total,
       count(*) FILTER (WHERE cpv IS NOT NULL) AS cpv_not_null,
       count(*) FILTER (WHERE cpv IS NOT NULL AND cpv <> 0) AS cpv_non_zero,
       count(DISTINCT mba_number) FILTER (WHERE cpv IS NOT NULL AND cpv <> 0) AS mbas_non_zero,
       round(sum(cpv) FILTER (WHERE cpv IS NOT NULL)::numeric, 6) AS cpv_sum,
       to_regclass('public.campaign_kpi_cpv_archive_20261023') AS archive_exists
FROM campaign_kpi;
-- Expect 20840 | 16088 | 290 | 18 | 71.909980 | NULL

-- ===================== CHANGE =====================
DO $$
DECLARE
  v_not_null  int;
  v_non_zero  int;
  v_archived  int;
  v_nulled    int;
BEGIN
  IF to_regclass('public.campaign_kpi_cpv_archive_20261023') IS NOT NULL THEN
    RAISE EXCEPTION 'campaign_kpi_cpv_archive_20261023 already exists; aborting';
  END IF;

  SELECT count(*) FILTER (WHERE cpv IS NOT NULL),
         count(*) FILTER (WHERE cpv IS NOT NULL AND cpv <> 0)
    INTO v_not_null, v_non_zero
  FROM campaign_kpi;

  IF v_not_null <> 16088 OR v_non_zero <> 290 THEN
    RAISE EXCEPTION 'Guard failed: cpv not null % (expected 16088), non-zero % (expected 290)',
      v_not_null, v_non_zero;
  END IF;

  CREATE TABLE public.campaign_kpi_cpv_archive_20261023 (
    campaign_kpi_id bigint PRIMARY KEY,
    mba_number      text,
    version_number  bigint,
    line_item_id    text,
    cpv             numeric NOT NULL,
    archived_at     timestamptz NOT NULL DEFAULT now()
  );

  INSERT INTO public.campaign_kpi_cpv_archive_20261023
    (campaign_kpi_id, mba_number, version_number, line_item_id, cpv)
  SELECT id, mba_number, version_number, line_item_id, cpv
  FROM campaign_kpi
  WHERE cpv IS NOT NULL;
  GET DIAGNOSTICS v_archived = ROW_COUNT;

  IF v_archived <> 16088 THEN
    RAISE EXCEPTION 'Archive wrote % rows (expected 16088)', v_archived;
  END IF;

  UPDATE campaign_kpi k
     SET cpv = NULL
    FROM public.campaign_kpi_cpv_archive_20261023 a
   WHERE a.campaign_kpi_id = k.id
     AND k.cpv IS NOT NULL;
  GET DIAGNOSTICS v_nulled = ROW_COUNT;

  IF v_nulled <> 16088 THEN
    RAISE EXCEPTION 'Nulled % rows (expected 16088)', v_nulled;
  END IF;

  RAISE NOTICE 'Archived % and nulled % campaign_kpi.cpv values', v_archived, v_nulled;
END $$;

-- ===================== AFTER =====================
SELECT (SELECT count(*) FROM campaign_kpi WHERE cpv IS NOT NULL) AS cpv_not_null_after,
       (SELECT count(*) FROM campaign_kpi_cpv_archive_20261023) AS archived,
       (SELECT count(*) FROM campaign_kpi_cpv_archive_20261023 WHERE cpv <> 0) AS archived_non_zero,
       (SELECT round(sum(cpv)::numeric, 6) FROM campaign_kpi_cpv_archive_20261023) AS archived_sum;
-- Expect 0 | 16088 | 290 | 71.909980
