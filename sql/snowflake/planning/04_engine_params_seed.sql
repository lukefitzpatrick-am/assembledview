-- PLANNING_ENGINE_PARAMS seed — values LIFTED VERBATIM from live engine code.
-- Run in Snowsight after 03_methodology_engine_params_ddl.sql (or if tables already exist).
-- App behaviour is identical before/after seeding (code constants === these values).
--
-- Sources:
--   weight_*          → components/planning/constants.ts OBJECTIVE_PRESETS.consideration
--                       + components/planning/store.ts createInitialState
--   aff_scale         → app/tools/behavioural-planner/lib/bcs-engine.ts computeBcs
--                       (affAvg * 0.7)
--   attn_scale        → bcs-engine.ts computeBcs (ch.attn * 3.2)
--   cost_scale        → bcs-engine.ts computeBcs (valuePer * 18)
--   alloc_power       → bcs-engine.ts allocate (Math.pow(bcs/100, 1.5))
--   alloc_top_n       → bcs-engine.ts allocate (scored.slice(0, 8))
--   salience_* / gap_* / capture_* / create_* / weight_floor
--                     → components/planning/store.ts deriveBcsParams

USE SCHEMA ASSEMBLEDVIEW.MART;

MERGE INTO PLANNING_ENGINE_PARAMS t
USING (
  SELECT column1 AS PARAM_KEY, column2 AS PARAM_VALUE, column3 AS DESCRIPTION
  FROM VALUES
    (
      'weight_A',
      30::FLOAT,
      'OBJECTIVE_PRESETS.consideration.weights.A / createInitialState diagnosis.weights — components/planning/constants.ts + store.ts'
    ),
    (
      'weight_T',
      25::FLOAT,
      'OBJECTIVE_PRESETS.consideration.weights.T / createInitialState — components/planning/constants.ts + store.ts'
    ),
    (
      'weight_E',
      30::FLOAT,
      'OBJECTIVE_PRESETS.consideration.weights.E / createInitialState — components/planning/constants.ts + store.ts'
    ),
    (
      'weight_C',
      15::FLOAT,
      'OBJECTIVE_PRESETS.consideration.weights.C / createInitialState — components/planning/constants.ts + store.ts'
    ),
    (
      'aff_scale',
      0.7::FLOAT,
      'computeBcs A = min(100, affAvg * 0.7 * ageMod * genderMod) — app/tools/behavioural-planner/lib/bcs-engine.ts'
    ),
    (
      'attn_scale',
      3.2::FLOAT,
      'computeBcs T = min(100, ch.attn * 3.2) — app/tools/behavioural-planner/lib/bcs-engine.ts'
    ),
    (
      'cost_scale',
      18::FLOAT,
      'computeBcs C = min(100, valuePer * 18) — app/tools/behavioural-planner/lib/bcs-engine.ts'
    ),
    (
      'alloc_power',
      1.5::FLOAT,
      'allocate weights = pow(bcs/100, 1.5) — app/tools/behavioural-planner/lib/bcs-engine.ts'
    ),
    (
      'alloc_top_n',
      8::FLOAT,
      'allocate top = scored.slice(0, 8) — app/tools/behavioural-planner/lib/bcs-engine.ts'
    ),
    (
      'salience_boost_high',
      8::FLOAT,
      'deriveBcsParams salience === high → T + 8 — components/planning/store.ts'
    ),
    (
      'salience_boost_low',
      -6::FLOAT,
      'deriveBcsParams salience === low → T - 6 — components/planning/store.ts'
    ),
    (
      'gap_boost_cap',
      12::FLOAT,
      'deriveBcsParams Math.min(12, round(gap * 0.25)) — components/planning/store.ts'
    ),
    (
      'gap_boost_factor',
      0.25::FLOAT,
      'deriveBcsParams Math.min(12, round(gap * 0.25)) — components/planning/store.ts'
    ),
    (
      'capture_boost',
      6::FLOAT,
      'deriveBcsParams createCapture >= 60 → C + 6 — components/planning/store.ts'
    ),
    (
      'create_boost',
      -4::FLOAT,
      'deriveBcsParams createCapture <= 30 → C - 4 — components/planning/store.ts'
    ),
    (
      'capture_threshold',
      60::FLOAT,
      'deriveBcsParams createCapture >= 60 branch — components/planning/store.ts'
    ),
    (
      'create_threshold',
      30::FLOAT,
      'deriveBcsParams createCapture <= 30 branch — components/planning/store.ts'
    ),
    (
      'weight_floor',
      5::FLOAT,
      'deriveBcsParams Math.max(5, base + boost) — components/planning/store.ts'
    )
) s
ON t.PARAM_KEY = s.PARAM_KEY
WHEN MATCHED THEN UPDATE SET
  PARAM_VALUE = s.PARAM_VALUE,
  DESCRIPTION = s.DESCRIPTION,
  UPDATED_AT = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN INSERT (PARAM_KEY, PARAM_VALUE, DESCRIPTION, UPDATED_AT)
  VALUES (s.PARAM_KEY, s.PARAM_VALUE, s.DESCRIPTION, CURRENT_TIMESTAMP());
