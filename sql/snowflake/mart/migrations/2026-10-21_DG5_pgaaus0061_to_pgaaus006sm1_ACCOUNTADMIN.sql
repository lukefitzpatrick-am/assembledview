-- =============================================================================
-- DG5: PGA Institute Meta ad sets labelled 'pgaaus0061' -> pgaaus006sm1
-- Run as ACCOUNTADMIN in Snowsight. One transaction. Measured live 2026-10-20.
-- =============================================================================
-- Issue: delivery sits on line id 'pgaaus0061', which is on no plan.
--
-- Root cause: a typo in two Meta ad set names. The suffix is 'PGAAUS0061'
-- ('PGAAUS006' + '1', the 'SM' is missing) instead of 'PGAAUS006SM1':
--   120242303126700325  Online-AU-Interest-PGAAUS0061
--   120242303126690325  OnCampus-VIC-Geo-PGAAUS0061
--   Campaign FBIG-PGA-Institute-FY26Q3-Leads, 2 Feb - 1 Apr 2026.
-- PGAAUS006 'PGA Institute' (1 Feb - 30 Apr 2026) has one Meta line,
-- PGAAUS006SM1 (AU, Meta, 'Career Changers, School Leavers, Golf Interest',
-- $800 Feb, $800 Mar, $3,600 Apr). Today it shows $0 delivered.
-- Every row is inside its flight and before PGAAUS014 starts (1 May), so
-- there is no PGAAUS006 / PGAAUS014 split to make here.
--
-- Rows moved:
--   SOCIAL_PACING_FACT  117 rows  1,599.60  (2 Feb - 1 Apr)
--   PACING_FACT          92 rows  1,273.15  (legacy 'Social - Meta' copies in
--                                            PACING_FACT, 2 Feb - 19 Mar; relabelled
--                                            so no stray 'pgaaus0061' is left)
-- Plus 2 LINE_ITEM_LABEL_MAP rows so the label holds on any future refresh.
-- pgaaus006sm1 after: 1,599.60 delivered of 5,200 planned (31%).
-- Optional: rename the two ad sets in Meta to end -PGAAUS006SM1.
-- =============================================================================

USE ROLE ACCOUNTADMIN;
USE SCHEMA ASSEMBLEDVIEW.MART;

-- ----- Before ----------------------------------------------------------------
-- expect soc pgaaus0061 117 | 1599.60, pf pgaaus0061 92 | 1273.15, no pgaaus006sm1 rows, 0 map rows
-- SELECT 'soc' t, LOWER(line_item_id), COUNT(*), ROUND(SUM(amount_spent), 2) FROM SOCIAL_PACING_FACT
--  WHERE LOWER(line_item_id) IN ('pgaaus0061', 'pgaaus006sm1') GROUP BY 1, 2
-- UNION ALL SELECT 'pf', LOWER(line_item_id), COUNT(*), ROUND(SUM(amount_spent), 2) FROM PACING_FACT
--  WHERE LOWER(line_item_id) IN ('pgaaus0061', 'pgaaus006sm1') GROUP BY 1, 2;
-- SELECT COUNT(*) FROM LINE_ITEM_LABEL_MAP WHERE platform_line_item_id IN ('120242303126700325', '120242303126690325');

EXECUTE IMMEDIATE $$
DECLARE
  map_added INTEGER;
  social_updated INTEGER;
  prog_updated INTEGER;
BEGIN
  BEGIN TRANSACTION;

  MERGE INTO ASSEMBLEDVIEW.MART.LINE_ITEM_LABEL_MAP t
  USING (
    SELECT column1 AS channel, column2 AS platform_line_item_id, column3 AS line_item_id,
           column4 AS line_item_name, column5 AS mba_number, column6 AS notes
    FROM VALUES
      ('Social - Meta', '120242303126700325', 'pgaaus006sm1', 'Online-AU-Interest-PGAAUS0061', 'pgaaus006', 'DG5 2026-10-21: typo PGAAUS0061 -> PGAAUS006SM1'),
      ('Social - Meta', '120242303126690325', 'pgaaus006sm1', 'OnCampus-VIC-Geo-PGAAUS0061', 'pgaaus006', 'DG5 2026-10-21: typo PGAAUS0061 -> PGAAUS006SM1')
  ) s
  ON LOWER(TRIM(t.channel)) = LOWER(s.channel) AND LOWER(TRIM(t.platform_line_item_id)) = s.platform_line_item_id
  WHEN MATCHED THEN UPDATE SET line_item_id = s.line_item_id, line_item_name = s.line_item_name, is_active = TRUE,
    mba_number = s.mba_number, notes = COALESCE(t.notes || ' | ', '') || s.notes, updated_at = CURRENT_TIMESTAMP()
  WHEN NOT MATCHED THEN INSERT (channel, platform_line_item_id, line_item_id, line_item_name, is_active, notes, created_at, updated_at, mba_number)
    VALUES (s.channel, s.platform_line_item_id, s.line_item_id, s.line_item_name, TRUE, s.notes,
            CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), s.mba_number);
  map_added := SQLROWCOUNT;

  UPDATE ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT
  SET line_item_id = 'pgaaus006sm1', updated_at = CURRENT_TIMESTAMP()
  WHERE channel = 'Social - Meta'
    AND LOWER(line_item_id) = 'pgaaus0061'
    AND COALESCE(NULLIF(TRIM(platform_line_item_id), ''), entity_id::STRING) IN ('120242303126700325', '120242303126690325');
  social_updated := SQLROWCOUNT;

  UPDATE ASSEMBLEDVIEW.MART.PACING_FACT
  SET line_item_id = 'pgaaus006sm1', updated_at = CURRENT_TIMESTAMP()
  WHERE channel = 'Social - Meta'
    AND LOWER(line_item_id) = 'pgaaus0061'
    AND TRIM(platform_line_item_id) IN ('120242303126700325', '120242303126690325');
  prog_updated := SQLROWCOUNT;

  IF (map_added <> 2 OR social_updated <> 117 OR prog_updated <> 92) THEN
    ROLLBACK;
    RETURN 'ROLLED BACK: counts differ. map=' || map_added || ' social=' || social_updated || ' prog=' || prog_updated;
  END IF;

  COMMIT;
  RETURN 'OK map=' || map_added || ' social=' || social_updated || ' prog=' || prog_updated;
END;
$$;

-- ----- After -----------------------------------------------------------------
-- Before query: soc pgaaus006sm1 117 | 1599.60, pf pgaaus006sm1 92 | 1273.15, no pgaaus0061 rows;
-- map count 2.
