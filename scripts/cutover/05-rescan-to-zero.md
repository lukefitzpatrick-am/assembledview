# KR-1 — Rescan-to-zero (both stores)

Acceptance = **0** remaining rows for every match predicate on every touched table.  
Do not stop after deleting a named MBA — **rescan the pattern** (C-20 lesson).

## Postgres

Run `05-rescan-to-zero.sql` against Supabase `slpdibnxtpdlttbbczvg`.  
`total_remaining_non_zero_cells` must be **0**, and every per-table `remaining_rows` must be **0**.

## Xano checklist

Re-apply the same filters used in `02-xano-delete-krusty.md` STEP 0. Fill after Luke’s apply:

| Table | Filter | Remaining (must be 0) |
|---|---|---|
| `media_plan_monthly_lines` | mba prefix krusty/krabby | |
| `media_plan_television` … `media_plan_production` (×20) | mba prefix | |
| `billing_overrides` (if present) | matched versions / mba | |
| `mba_fee_snapshots` (if present) | matched versions | |
| `campaign_kpi` | mba / client name tokens | |
| `client_kpi` | client name tokens | |
| `finance_edits` | via matched billing records | |
| `finance_billing_line_items` | via matched billing records | |
| `finance_billing_records` | mba / client tokens | |
| `creative_asset` / `planning_audiences` / `mba_line_approvals` | mba prefix | |
| `media_plan_versions` | mba prefix | |
| `media_plan_master` | mba prefix | |
| `clients` | mbaidentifier / name tokens | |

## Post-zero product checks (not this pack)

After both stores are zero: treemaps + pacing re-check (application order owner).
