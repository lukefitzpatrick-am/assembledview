# ASSEMBLEDVIEW MART pacing objects

Source of truth for the live Snowflake pacing objects in `ASSEMBLEDVIEW.MART`.
Captured from `GET_DDL` on 2026-06-08. Previously these existed only in Snowsight.

## Refresh DAG (warehouse `AV_APP_WH`)

```
TSK_ROOT_DAILY_REFRESH            CRON 06:30 Australia/Melbourne, SELECT 1
├─ TSK_REFRESH_PACING_FACT        MERGE PACING_FACT         <- VW_PACING_DV360 (+ programmatic)
├─ TSK_REFRESH_SOCIAL_PACING_FACT MERGE SOCIAL_PACING_FACT  <- VW_PACING_TIKTOK, VW_PACING_META
├─ TSK_REFRESH_GOOGLESEARCHPACING CALL SP_REFRESH_GOOGLESEARCHPACING_ROLLING(14)
│                                 -> SEARCH_PACING_FACT      <- VW_PACING_GOOGLE_SEARCH_DAILY
└─ TSK_REFRESH_FIXED_COST_REPORTED  (after the three above)
                                  CALL SP_REFRESH_FIXED_COST_REPORTED_DAILY(NULL, FALSE)
                                  -> FIXED_COST_REPORTED_DAILY_FACT
                                     FIXED_COST_BURST_FACT
                                     FIXED_COST_LINE_ITEM_FACT
                                  reads XANO_LINE_ITEMS_SNAPSHOT (WHERE FIXED_COST_MEDIA = TRUE)
                                  delivery from SEARCH/SOCIAL/PACING_FACT
```

## App read paths

- `/api/pacing/campaigns` reads `SEARCH_PACING_FACT` (search surface and overview).

## Notes

- **Identifier case:** MART pacing views emit `LOWER(TRIM(...))` for `LINE_ITEM_ID` /
  `LINE_ITEM_NAME` (and DV360 plan-code extract is case-insensitive via
  `REGEXP_SUBSTR(UPPER(name), …)` then `LOWER`). Raw Fivetran schemas stay
  immutable. Refresh tasks also `LOWER` label-map coalesced ids/names.
  Deploy + full-history backfill: `npx tsx scripts/snowflake/deploy-mba-case-norm.mjs`
  (requires a role that **owns** the MART views/tables — `AV_APP_WRITE_ROLE` is
  SELECT-only on `PACING_FACT`/`SOCIAL_PACING_FACT` and cannot `CREATE OR REPLACE`
  views owned by `ACCOUNTADMIN`). Snapshot sync writes lowercase and collapses
  case-alias duplicate PKs.
- `views/vw_pacing_fact.sql` is a thin pass-through over `PACING_FACT`. No app
  references were found in the 2026-06-08 repo audit. Redundancy candidate,
  retained pending confirmation. Do not drop without checking.
- `procedures/sp_refresh_fixed_cost_reported_daily.sql` is NOT generated here.
  It is a ~600 line JavaScript procedure. Save it directly from Snowsight
  `GET_DDL` output to avoid transcription corruption. See commit steps.
- Pattern A objects (`V_LINE_ITEM_PACING`, `V_DELIVERY_PACING`,
  `FACT_LINE_ITEM_PACING_DAILY`, `DIM_PLAN_MAPPING`) are NOT in this folder.
  They are slated for retirement and live under `sql/snowflake/pacing/`.
  `V_LINE_ITEM_PACING` was not previously version-controlled; its definition is
  captured at `sql/snowflake/pacing/16_capture_v_line_item_pacing_pre_retirement.sql`.
- These files are faithful captures. `create or replace` is intentional so they
  can be re-run as the source of truth.
