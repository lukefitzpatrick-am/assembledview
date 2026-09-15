# Channel Factory / Datorama — MART objects applied 14 Sep 2026 (rev3)

Status: applied 2026-09-14  
Date: 2026-09-14  
Scope: warehouse only. Author-only capture in `sql/snowflake/`. This commit does not apply anything.  
Brain: `docs/brain/MAP.md` §3; `docs/brain/modules/pacing.md`; `docs/brain/DATA-MODEL.md` warehouse; `docs/brain/KNOWN-ISSUES.md` C-125.

The Claude-project runbook (`av-review/runbook-channel-factory-datorama-rev3-2026-09-14.md`) is not in this workspace. This page records what is live in Snowflake after the 14 Sep Snowsight apply, from `GET_DDL` on 2026-09-15 (`AV_APP_WRITE_ROLE`). ACCOUNTADMIN-owned tasks and the fixed-cost procedure are not readable by that role; their bodies stay the June captures plus the partner-file union on `TSK_REFRESH_PACING_FACT`.

## Money path

`RAW.PARTNER_DELIVERY_DAILY` → `MART.VW_PACING_PARTNER_FILE` → `PACING_FACT` (`TSK_REFRESH_PACING_FACT`) → `SP_REFRESH_FIXED_COST_REPORTED_DAILY` → `FIXED_COST_REPORTED_DAILY_FACT.REPORTED_SPEND`.

Channel Factory reports no platform cost. The view sets `AMOUNT_SPENT = 0` (zero-$ law). CPV still reads `VIDEO_3S_VIEWS` in the proc, so the view dual-writes `SUM(COMPLETED_VIEWS)` there until the proc reads `COMPLETED_VIEWS` directly.

## Objects applied (and captured)

| Object | File |
|---|---|
| `MART.VW_PACING_PARTNER_FILE` | `sql/snowflake/mart/views/vw_pacing_partner_file.sql` |
| `MART.FIXED_COST_REPORTED_DAILY_FACT` / `FIXED_COST_BURST_FACT` / `FIXED_COST_LINE_ITEM_FACT` | `sql/snowflake/mart/tables/fixed_cost_facts.sql` |
| `RAW.PARTNER_SOURCE_MAP` / `PARTNER_DELIVERY_DAILY` / `PARTNER_FILE_INGEST_LOG` / `PARTNER_FILE_LINES` | `sql/snowflake/raw/partner_ingest_tables.sql` |
| `MART.TSK_REFRESH_PACING_FACT` | `sql/snowflake/mart/tasks/tsk_refresh_pacing_fact.sql` (June capture + `VW_PACING_PARTNER_FILE` union; live GET_DDL pending ACCOUNTADMIN) |
| `MART.TSK_REFRESH_FIXED_COST_REPORTED` | `sql/snowflake/mart/tasks/tsk_refresh_fixed_cost_reported.sql` (June capture; live GET_DDL pending ACCOUNTADMIN) |
| `MART.SP_REFRESH_FIXED_COST_REPORTED_DAILY` | `sql/snowflake/mart/procedures/sp_refresh_fixed_cost_reported_daily.sql` (June capture; live GET_DDL pending ACCOUNTADMIN) |

## View contract (Channel Factory only until PI-1)

- Filter: `SOURCE = 'Channel Factory'` and `AV_LINE_ITEM_ID IS NOT NULL`. Uncoded rows stay in RAW.
- `CHANNEL` = `'Programmatic - Video'` (20 chars, fits `VARCHAR(22)`).
- `LINE_ITEM_ID` = `LOWER(TRIM(AV_LINE_ITEM_ID))`.
- `ENTITY_ID` = `LOWER(TRIM(PARTNER_LINE_ITEM_NAME))` (required for the PACING_FACT merge key).
- Grain: channel, date, plan code, partner line-item name.

## App cron

Mailbox ingest is `GET|POST /api/cron/partner-ingest`, Vercel `30 22 * * *` (08:30 Sydney) only. The stale `0 3 * * *` slot is not in `vercel.json`.

## ACCOUNTADMIN paste (still needed)

```sql
select get_ddl('task','ASSEMBLEDVIEW.MART.TSK_REFRESH_PACING_FACT');
select get_ddl('task','ASSEMBLEDVIEW.MART.TSK_REFRESH_FIXED_COST_REPORTED');
show procedures like 'SP_REFRESH_FIXED_COST_REPORTED_DAILY' in schema ASSEMBLEDVIEW.MART;
-- then, with the argument signature from the row above:
select get_ddl('procedure','ASSEMBLEDVIEW.MART.SP_REFRESH_FIXED_COST_REPORTED_DAILY(<signature>)');
```

Overwrite the three files named above. Author only.
