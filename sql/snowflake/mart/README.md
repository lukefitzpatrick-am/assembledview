# ASSEMBLEDVIEW MART pacing objects

Source of truth for the live Snowflake pacing objects in `ASSEMBLEDVIEW.MART`.
Live task/proc GET_DDL 2026-09-15 plus the 14 Sep Channel Factory capture and the 15 Sep Vistar / prog OOH union (`VW_PACING_PARTNER_OOH`, `PARTNER_LINE_MAP`).

RAW landing tables live in `sql/snowflake/raw/partner_ingest_tables.sql`. Line map: `sql/snowflake/raw/partner_line_map.sql`. 15 Sep alter: `sql/snowflake/raw/partner_delivery_daily_2026-09-15_alter.sql`.

## Refresh DAG (warehouse `AV_APP_WH`)

```
TSK_ROOT_DAILY_REFRESH            CRON 06:30 Australia/Melbourne, SELECT 1
├─ TSK_REFRESH_PACING_FACT        MERGE PACING_FACT
│                                 <- VW_PACING_DV360 ∪ VW_PACING_TABOOLA ∪ VW_PACING_CM360
│                                    ∪ VW_PACING_PARTNER_FILE ∪ VW_PACING_PARTNER_OOH
├─ TSK_REFRESH_SOCIAL_PACING_FACT MERGE SOCIAL_PACING_FACT
│                                 <- VW_PACING_TIKTOK, VW_PACING_META, VW_PACING_REDDIT
├─ TSK_REFRESH_GOOGLESEARCHPACING CALL SP_REFRESH_GOOGLESEARCHPACING_ROLLING(14)
│                                 -> SEARCH_PACING_FACT      <- VW_PACING_GOOGLE_SEARCH_DAILY
├─ TSK_REFRESH_BINGSEARCHPACING   CALL SP_REFRESH_BINGSEARCHPACING_ROLLING(14)   (DG6, 2026-10-21)
│                                 -> SEARCH_PACING_FACT 'Search - Microsoft Ads' <- VW_PACING_BING_SEARCH_DAILY
│                                 -> CONVERSION_FACT 'microsoft_ads'             <- VW_CONVERSIONS_BING_TOTAL
└─ TSK_REFRESH_FIXED_COST_REPORTED  (after the three above)
                                  CALL SP_REFRESH_FIXED_COST_REPORTED_DAILY(NULL, FALSE)
                                  -> FIXED_COST_REPORTED_DAILY_FACT
                                     FIXED_COST_BURST_FACT
                                     FIXED_COST_LINE_ITEM_FACT
                                  reads XANO_LINE_ITEMS_SNAPSHOT (WHERE FIXED_COST_MEDIA = TRUE)
                                  delivery from SEARCH/SOCIAL/PACING_FACT
                                  (partner-file CPV uses VIDEO_3S_VIEWS dual-write from the view)
                                  B23: FIXED_COST_BURSTS_JSON (net media, Melbourne days) and
                                  FIXED_COST_FROM (rows only from that day) when the app sends them;
                                  SP_REFRESH_FIXED_COST_NIGHTLY backfills a line once when its
                                  basis or date changes (REPORT_BASIS_APPLIED, FIXED_COST_FROM_APPLIED)
```

B23 run order (`migrations/2026-11-03_B23_fixed_cost_from_ACCOUNTADMIN.sql`):

- Supabase 0115, then the code deploy.
- Part A (two snapshot columns) any time before part B and before
  `fixed_cost_report_net` goes on. The sync checks for the columns each run
  and sends the pre-B23 MERGE without them (B23fix).
- Part B (procedure and wrapper) after part A: both read the two columns.
- Part C (`fixed_cost_report_net` on), then part D (`fixed_cost_from_date` on).

Label map rule (C-180, B29). A reader of `LINE_ITEM_LABEL_MAP` keeps one active
row per (`LOWER(TRIM(channel))`, `LOWER(TRIM(platform_line_item_id))`) before it
joins or sums, or a duplicate map row multiplies delivery. Snowflake does not
enforce unique keys. `npm run test:label-map-fanout` checks every file in
`tasks/`, `views/` and `procedures/`: the map is read in a named CTE with
`WHERE is_active = TRUE` and `QUALIFY ROW_NUMBER() ... = 1` (or `GROUP BY` the
two keys), and every JOIN onto that CTE matches on both channel and platform id.

- `TSK_REFRESH_PACING_FACT` and `TSK_REFRESH_SOCIAL_PACING_FACT` still join the
  raw map. They are on the test's pending list until their repo files are
  compared with `GET_DDL` as ACCOUNTADMIN (CLAUDE_RW cannot see the tasks). The
  pending list is held to these two entries.
- `views/vw_platform_spend_line_month.sql` joins `label_map_one`. Deploy with
  `migrations/2026-11-09_LM1_platform_spend_label_map_one_row_ACCOUNTADMIN.sql`.
- `views/vw_pacing_fact_cm360_drift.sql` (`VW_PACING_FACT_CM360_DRIFT`) lists
  every CM360 placement and day where `PACING_FACT` differs from
  `CM_360_PACING`. A manual key and day is left out only when CM360 has no
  row for it, so a raw and manual overlap shows as drift. Deploy with
  `migrations/2026-11-09_CD1_pacing_fact_cm360_drift_view_ACCOUNTADMIN.sql`.
  The 07:00 pacing digest counts it (`lib/ops/digest/dataChecks.ts`, switch
  `pacing_digest_data_checks`, B34) and fails soft until it exists.
- `migrations/2026-11-09_BV7_bic_7plus_label_map_fanout_ACCOUNTADMIN.sql` records
  the BIC 7plus BVOD correction (applied by Luke on 9 Nov, 15 rows).
- In a view file with a migration copy, the views file is the source and the
  test keeps the two `CREATE` blocks equal.

## App read paths

- `/api/pacing/campaigns` reads `SEARCH_PACING_FACT` (search surface and overview).

## Notes

- **Identifier case:** MART pacing views emit `LOWER(TRIM(...))` for `LINE_ITEM_ID` /
  `LINE_ITEM_NAME` (and DV360 plan-code extract is case-insensitive via
  `REGEXP_SUBSTR(UPPER(name), …)` then `LOWER`). Raw Fivetran schemas stay
  immutable.   Live `TSK_REFRESH_PACING_FACT` (GET_DDL 2026-09-15) relabel is `coalesce` only —
  `lower(trim())` lives on `platform_line_item_id` and the MERGE ON, matching
  `TSK_REFRESH_SOCIAL_PACING_FACT`.
  Deploy + full-history backfill was `scripts/snowflake/deploy-mba-case-norm.mjs`,
  **retired 2026-10-28 (DATA-6)**: it now exits without running, because its
  full-history MERGE has no delete and would re-create PACING_FACT duplicates
  (it required a role that **owns** the MART views/tables — `AV_APP_WRITE_ROLE` is
  SELECT-only on `PACING_FACT`/`SOCIAL_PACING_FACT` and cannot `CREATE OR REPLACE`
  views owned by `ACCOUNTADMIN`). Snapshot sync writes lowercase and collapses
  case-alias duplicate PKs.
- `views/vw_pacing_fact.sql` is a thin pass-through over `PACING_FACT`. No app
  references were found in the 2026-06-08 repo audit. Redundancy candidate,
  retained pending confirmation. Do not drop without checking.
- `procedures/sp_refresh_fixed_cost_reported_daily.sql` is the 2026-09-15
  ACCOUNTADMIN GET_DDL paste (~600 line JavaScript). Do not re-type it.
- Pattern A objects (`V_LINE_ITEM_PACING`, `V_DELIVERY_PACING`,
  `FACT_LINE_ITEM_PACING_DAILY`, `DIM_PLAN_MAPPING`) are NOT in this folder.
  They are slated for retirement and live under `sql/snowflake/pacing/`.
  `V_LINE_ITEM_PACING` was not previously version-controlled; its definition is
  captured at `sql/snowflake/pacing/16_capture_v_line_item_pacing_pre_retirement.sql`.
- These files are faithful captures. `create or replace` is intentional so they
  can be re-run as the source of truth.
- Conversion fact (CF1, 2026-10-21): `tables/conversion_fact.sql`,
  `views/vw_conversions_sources.sql` (five `VW_CONVERSIONS_*` views),
  `tasks/tsk_refresh_conversion_fact.sql` (14-day MERGE, child of the root task),
  `views/vw_conversion_daily.sql` (read view with `LINE_ITEM_ID`), grants and checks under
  `migrations/2026-10-21_cf1_*`. Long format, one row per line, day and event. Do not reuse
  `RESULTS` in the pacing facts for conversions.
