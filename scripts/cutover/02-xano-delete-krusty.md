# KR-1 — Xano deletion (Luke applies in Xano UI / Metadata API)

**Author-only pack.** Cursor does not execute. Apply **after** fixture export (`01-export-krusty-fixture.ts`) and **before** Postgres delete.

Supabase twin: project `slpdibnxtpdlttbbczvg` (Claude applies via MCP after this pack).

## Match patterns (must enumerate first)

| Surface | Match | Notes |
|---|---|---|
| MBA numbers | `lower(mba_number)` starts with `krusty` **or** `krabby` | Literature stems: `krusty001`…`krusty015` + any later; live inventory wins |
| Clients | `lower(mbaidentifier)` ∈ {`krusty`,`krabby`} **or** starts with those tokens; **or** `mp_client_name` contains `krusty`/`krabby` | Do **not** use bare `kr` prefix |
| Channel lines | same `mba_number` prefix | 20 `media_plan_*` tables |
| Aggregates | `media_plan_monthly_lines` rows for those MBAs (if table still present) | Dropped from PG ETL; may still exist in Xano |
| KPI | `campaign_kpi.mba_number` / `mp_client_name`; `client_kpi.mp_client_name` | Same tokens |
| Finance | `finance_billing_records.mba_number` / `client_name` | Cascade line items + edits |

### STEP 0 — Discovery (Xano)

In each table’s browse / filter UI (or Metadata API content GET), list IDs matching the patterns. Paste the MBA list into the pre-count ledger before deleting.

Suggested filter strings (UI search / API filter):

- `mba_number` contains `krusty` **and separately** contains `krabby` (two passes), then discard false positives that do **not** start with those prefixes (e.g. a real client named “Krusty-adjacent” would be unusual — still eye-ball).
- Clients: `mbaidentifier` = `krusty` / `krabby`; name contains `Krusty` / `Krabby`.

Record every distinct `mba_number` and `clients.id` in the ledger.

## Dependency-safe delete order

Delete **children → parents**. Never delete `media_plan_master` while channel rows or versions still reference it.

### 1. Aggregates / monthly rollups

| Table | Action |
|---|---|
| `media_plan_monthly_lines` | Delete where `mba_number` matches prefix set |

If the table is already gone in this workspace, note `N/A` in the ledger and continue.

### 2. Channel line items (20 tables)

For **each** table, delete where `mba_number` matches:

1. `media_plan_television`
2. `media_plan_radio`
3. `media_plan_cinema`
4. `media_plan_newspaper`
5. `media_plan_magazines`
6. `media_plan_ooh`
7. `media_plan_prog_display`
8. `media_plan_prog_video`
9. `media_plan_prog_audio`
10. `media_plan_prog_bvod`
11. `media_plan_prog_ooh`
12. `media_plan_digi_display`
13. `media_plan_digi_video`
14. `media_plan_digi_audio`
15. `media_plan_digi_bvod`
16. `media_plan_social`
17. `media_plan_search`
18. `media_plan_influencers`
19. `media_plan_integrations`
20. `media_plan_production`

### 3. Billing overrides / fee snapshots (if present as tables)

| Table | Action |
|---|---|
| `billing_overrides` | Delete by `media_plan_version` id ∈ matched versions **or** `mba_number` prefix |
| `mba_fee_snapshots` (or equivalent) | Delete by matched version ids |

If fee data lives only inside version JSON, versions delete covers it.

### 4. KPI

| Table | Action |
|---|---|
| `campaign_kpi` | Delete where `mba_number` prefix **or** `mp_client_name` matches client tokens |
| `client_kpi` | Delete where `mp_client_name` matches client tokens |

### 5. Finance billing chain

| Table | Action |
|---|---|
| `finance_edits` | Delete where `finance_billing_records_id` ∈ matched billing records |
| `finance_billing_line_items` | Delete where `finance_billing_records_id` ∈ matched billing records |
| `finance_billing_records` | Delete where `mba_number` prefix **or** `client_name` / `clients_id` matches |

### 6. Ancillary MBA-tagged rows (if present)

| Table | Action |
|---|---|
| `mba_line_approvals` | Usually PG-authoritative; if Xano twin exists, delete by `mba_number` prefix |
| `creative_asset` | Delete by `mba_number` prefix |
| `planning_audiences` | Delete by `mba_number` prefix |
| `scope_of_work` | Delete only if `client_name` clearly matches Krusty/Krabby test client |

### 7. Versions then masters

| Table | Action |
|---|---|
| `media_plan_versions` | Delete where `mba_number` prefix (all version numbers) |
| `media_plan_master` | Delete where `mba_number` prefix |

Clear any UI cache / browse refresh between versions and masters if the UI blocks on FKs.

### 8. Clients (last)

| Table | Action |
|---|---|
| `clients` | Delete only the discovery-listed test client id(s) (`mbaidentifier` `krusty`/`krabby` etc.) |

Do **not** delete production clients that merely share a substring outside the patterns above.

## Xano rescan-to-zero (acceptance)

After deletes, re-run discovery filters on **every** table touched. Expected count = **0** for all match predicates. (C-20 lesson: rescan the pattern, do not “fix the named row” and stop.)

See `05-rescan-to-zero.md` §Xano for the checklist table.

## Pre-count ledger

Before delete, fill `04-precount-ledger.md` with Xano row counts per table from STEP 0 filters.
