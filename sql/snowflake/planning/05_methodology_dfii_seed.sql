-- Optional seed: Demand-Flow Impact Index methodology row (R3).
-- Panel picks this up automatically via METRIC_KEY = 'dfii' (queried as METHODOLOGY_ID).

USE SCHEMA ASSEMBLEDVIEW.MART;

MERGE INTO PLANNING_METHODOLOGY t
USING (
  SELECT
    'dfii' AS METRIC_KEY,
    'Demand-Flow Impact Index (DFII)' AS TITLE,
    'dfii = round(bcs / mean(bcs of included channels) × 100)' AS FORMULA_TEXT,
    'Relative BCS strength versus the mean of channels included in the Stage E set (Stage D exclusions omitted from the mean). 100 = average impact; >115 strong; <85 weak. Null when the mean is 0.' AS DESCRIPTION,
    'Assembled BCS engine' AS DATA_SOURCE,
    90 AS SORT_ORDER
) s
ON t.METRIC_KEY = s.METRIC_KEY
WHEN MATCHED THEN UPDATE SET
  TITLE = s.TITLE,
  FORMULA_TEXT = s.FORMULA_TEXT,
  DESCRIPTION = s.DESCRIPTION,
  DATA_SOURCE = s.DATA_SOURCE,
  SORT_ORDER = s.SORT_ORDER,
  UPDATED_AT = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN INSERT (
  METRIC_KEY, TITLE, FORMULA_TEXT, DESCRIPTION, DATA_SOURCE, SORT_ORDER
) VALUES (
  s.METRIC_KEY, s.TITLE, s.FORMULA_TEXT, s.DESCRIPTION, s.DATA_SOURCE, s.SORT_ORDER
);
