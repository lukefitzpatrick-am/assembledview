# KR-1 pre-count / post-count ledger

## Matched inventory (live)

| Store | Field | Values |
|---|---|---|
| Xano STEP 0 | `mba_number` list | `krusty001`…`krusty015` (15; **no krabby***) |
| Xano | `clients.id` | `8` (deleted) |
| Fixture preserved | path | `scripts/cutover/fixtures/krusty-complete-krusty002-v1.json` |
| Xano discovery/apply artifact | path | `scripts/cutover/fixtures/xano-kr1-discovery.json` |

## Fixture (before any delete)

| Field | Value |
|---|---|
| File | `scripts/cutover/fixtures/krusty-complete-krusty002-v1.json` |
| MBA / version | `krusty002` / v1 |
| line_items / schedule_months / campaign_kpi | 7 / 112 / 16 |
| Size | 111185 bytes |
| Confirmed on disk | **yes** (`True`, header `exported_at` present) |

## Xano row counts (applied 2026-08-02 — truth order first)

| Table | Pre-count | Deleted | Post-rescan |
|---|---|---|---|
| media_plan_monthly_lines | 0 | 0 | **0** |
| media_plan_television | 1 | 1 | **0** |
| media_plan_radio | 3 | 3 | **0** |
| media_plan_cinema | 1 | 1 | **0** |
| media_plan_newspaper | 2 | 2 | **0** |
| media_plan_magazines | 1 | 1 | **0** |
| media_plan_ooh | 107 | 107 | **0** |
| media_plan_prog_display | 1 | 1 | **0** |
| media_plan_prog_video | 1 | 1 | **0** |
| media_plan_prog_audio | 3 | 3 | **0** |
| media_plan_prog_bvod | 1 | 1 | **0** |
| media_plan_prog_ooh | 1 | 1 | **0** |
| media_plan_digi_display | 1 | 1 | **0** |
| media_plan_digi_video | 1 | 1 | **0** |
| media_plan_digi_audio | 1 | 1 | **0** |
| media_plan_digi_bvod | 1 | 1 | **0** |
| media_plan_social | 24 | 24 | **0** |
| media_plan_search | 21 | 21 | **0** |
| media_plan_influencers | 1 | 1 | **0** |
| media_plan_integrations | 2 | 2 | **0** |
| media_plan_production | 1 | 1 | **0** |
| billing_overrides | 0 | 0 | **0** |
| mba_fee_snapshots | 0 | 0 | **0** |
| campaign_kpi | 164 | 164 | **0** |
| client_kpi | 0 | 0 | **0** |
| finance_edits | 0 | 0 | **0** |
| finance_billing_line_items | 0 | 0 | **0** |
| finance_billing_records | 1 | 1 | **0** |
| mba_line_approvals | 1 | 1 | **0** |
| creative_asset | 0 | 0 | **0** |
| planning_audiences | 0 | 0 | **0** |
| scope_of_work | 0 | 0 | **0** |
| media_plan_versions | 28 | 28 | **0** |
| media_plan_master | 15 | 15 | **0** |
| clients | 1 | 1 | **0** |

**Xano acceptance:** `post_rescan_total=0` via `02a-xano-kr1-discover-delete.ts --apply`.

## Postgres row counts

| Table | Pre-count (to delete) | Post-rescan (must be 0) |
|---|---|---|
| media_plan_masters | _pending — Claude MCP next_ | |
| media_plan_versions | | |
| line_items | | |
| schedule_months | | |
| … (see `04-precount.sql`) | | |

Postgres delete **not** applied yet (Xano-first rule satisfied).
