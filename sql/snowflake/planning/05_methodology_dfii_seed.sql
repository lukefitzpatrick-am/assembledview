-- Optional seed: Demand-Flow Impact Index methodology row (R3).
-- Panel picks this up automatically via METHODOLOGY_ID = 'dfii'.

USE SCHEMA ASSEMBLEDVIEW.MART;

MERGE INTO PLANNING_METHODOLOGY t
USING (
  SELECT
    'dfii' AS METHODOLOGY_ID,
    'Demand-Flow Impact Index (DFII)' AS TITLE,
    'dfii = round(bcs / mean(bcs of included channels) × 100)' AS FORMULA_TEXT,
    'Relative BCS strength versus the mean of channels included in the Stage E set (Stage D exclusions omitted from the mean). 100 = average impact; >115 strong; <85 weak. Null when the mean is 0.' AS DESCRIPTION,
    'Assembled BCS engine' AS DATA_SOURCE,
    90 AS SORT_ORDER
) s
ON t.METHODOLOGY_ID = s.METHODOLOGY_ID
WHEN MATCHED THEN UPDATE SET
  TITLE = s.TITLE,
  FORMULA_TEXT = s.FORMULA_TEXT,
  DESCRIPTION = s.DESCRIPTION,
  DATA_SOURCE = s.DATA_SOURCE,
  SORT_ORDER = s.SORT_ORDER,
  UPDATED_AT = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN INSERT (
  METHODOLOGY_ID, TITLE, FORMULA_TEXT, DESCRIPTION, DATA_SOURCE, SORT_ORDER
) VALUES (
  s.METHODOLOGY_ID, s.TITLE, s.FORMULA_TEXT, s.DESCRIPTION, s.DATA_SOURCE, s.SORT_ORDER
);
