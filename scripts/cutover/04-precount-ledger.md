# KR-1 pre-count / post-count ledger

Fill **before** deletes (from `04-precount.sql` + Xano STEP 0).  
Fill **after** from `05-rescan-to-zero.sql` + Xano checklist.

## Matched inventory (from discovery — paste live)

| Store | Field | Values |
|---|---|---|
| Both | `mba_number` list | _pending live discovery_ |
| Both | `clients.id` / `mbaidentifier` / `mp_client_name` | _pending live discovery_ |

Literature stems for cross-check only (not live inventory): `krusty001`…`krusty015` (+ any later `krusty*` / `krabby*` in store). Client `mbaidentifier` typically `krusty` (see `resolveClientsIdByMbaIdentifier`).

## Postgres row counts

| Table | Pre-count (to delete) | Post-rescan (must be 0) |
|---|---|---|
| media_plan_masters | | |
| media_plan_versions | | |
| line_items | | |
| schedule_months | | |
| mba_fee_snapshots | | |
| billing_overrides | | |
| mba_line_approvals | | |
| campaign_kpi | | |
| client_kpi | | |
| clients | | |
| creative_asset | | |
| planning_audiences | | |
| finance_billing_records | | |
| finance_billing_line_items | | |
| finance_edits | | |
| revenue_forecast_lines | | |
| xero_ar_invoices (mba assigned → NULL) | | |
| xero_client_aliases | | |

## Xano row counts

| Table | Pre-count | Post-rescan (must be 0) |
|---|---|---|
| media_plan_monthly_lines | | |
| media_plan_* (20 channel tables, sum or per-table) | | |
| billing_overrides / mba_fee_snapshots (if present) | | |
| campaign_kpi | | |
| client_kpi | | |
| finance_billing_* chain | | |
| media_plan_versions | | |
| media_plan_master | | |
| clients | | |
| creative_asset / planning_audiences / mba_line_approvals (if present) | | |

## Fixture

| Field | Value |
|---|---|
| Fixture file path | `scripts/cutover/fixtures/krusty-complete-<mba>-v<n>.json` |
| MBA / version chosen | |
| line_items / schedule_months counts | |
