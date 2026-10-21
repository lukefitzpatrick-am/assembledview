# Audit: media plan downloads (21 Oct 2026)

Scope: every download that carries plan money, checked against `schedule_months` and `approved_slice`.

## Inventory

| Download | Built by | Source |
| --- | --- | --- |
| Media plan Excel (stored at publish) | `renderPlanVersionDocuments` -> `buildMediaItemsFromPlanDetail` -> `buildMediaPlanWorkbook` | Plan detail |
| Draft media plan Excel | `renderDraftDocuments` | Live form |
| AA media plan Excel (stored as `aa_media_plan`) | AA workbook: Monthly by supplier and Insertions sheets | Plan detail |
| MBA PDF | `buildMbaFromPersisted` | `approved_slice` + `schedule_months` |
| Billing schedule Excel | `buildBillingScheduleExcelBlob` | Billing schedule |
| Finance exports | `writeMediaFinanceWorksheet` via `app/api/finance/data` | Finance data |

## What matched

- Media by line and month matched `schedule_months` on BICAU006, curatif004, PENFOLD020, golf025, STRMEA001 and hartm001.
- Totals matched `approved_slice`.

## Commits

| Commit | What changed |
| --- | --- |
| `0b10e769` | Bare production line ids (PENFOLD020PROD1) suppress `__service__production`. Stops new double counts. |
| `75184ed4` | Manual SQL `db/migrations/manual/2026-10-21_schedule_months_service_production_dupes_SUPABASE.sql` to remove existing duplicates. Not run. |
| `21d210e2` | AA Insertions show the spot or insertion rate for offline media. |

## Mismatches

1. Fee and ad serving month cells (standard and AA Excel).
   - Spread by plan-wide media weight (`lib/generateMediaPlan.ts` about lines 2011 to 2020), not by the billing months.
   - BICAU006 fee, Excel Sep / Oct / Nov: $7,212.63 / $10,391.68 / $7,212.64. Billing: $8,181.41 / $8,454.12 / $8,181.42.
   - Decision for Luke: delivery months or billing months.
2. AA Insertions "Spot or insertion rate" was $0 for radio, TV, OOH, cinema and press. `buyAmount` was only set on digital lines. Fixed `21d210e2`.
3. `schedule_months` production double count where the plan has bare production line ids.
   - The transform also wrote the header production to `__service__production`.
   - Measured: 592 rows on 90 versions (13 masters). Billing basis $902,149.36 across all versions; $191,257.84 on the published tips (12 tips on billing, 13 on delivery). Every duplicate equals the per-line production sum for that month.
   - Code fix `0b10e769`. Clean-up SQL `75184ed4` (guard 592 to 650 rows, zero mismatches).
   - Readers that skip `__service__*` and do not change: `approved_slice` derive, MBA PDF money, finance blob reader (default backend).
   - Readers that change (lose the duplicate): full-scope save gate, rows / shadow finance rebuild, SQL sums over `schedule_months` (costs, periods, dashboard client spend, Ava `query_schedule_months` and `query_finance_summary`).
   - Side effect: `snapshot_checksum` hashes `schedule_months`. All 90 versions have a stored checksum, so the weekly tripwire (report-only) will list them and a regenerated MBA PDF footer shows a new checksum. MBA money is unchanged.
4. STRMEA001 AA drops $1,200 SCA production.
   - The publisher is free text "SCA", so it does not match a supplier.
   - Fix: re-pick the publisher on the plan. Matching on `publisherid` would also work (75% confidence; not changed).
5. Finance export doubles production when a plan has both G. and D. lines (`app/api/finance/data/route.ts:128-143`). Product decision.
6. Minor:
   - OOH format codes show in Insertions instead of names.
   - Package inclusions are not flagged as bonus.
   - $0 channels appear in the MBA block.
   - Empty edge months on the supplier sheet.
   - 1c gaps between the blob and `schedule_months`.
   - BIC fee-inclusive CPM is not in any download.

## Open questions for Luke

- Fee and ad serving month cells: delivery months or billing months?
- Run the `schedule_months` clean-up SQL after `0b10e769` ships? Re-stamp `snapshot_checksum` on the 90 versions afterwards?
- STRMEA001: re-pick SCA, or match the AA supplier on `publisherid`?
- Finance export with both G. and D. production lines: which one counts?
- Which of the minor items to fix, and in what order?
