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

## Decisions (Luke, 22 Oct) and outcomes

| Item | Decision | Outcome |
| --- | --- | --- |
| M1 | Fee and ad serving month cells follow DELIVERY months per line. Totals unchanged. No leftover cents in empty months. | Done `4e52fd3b` |
| M2 | Ad serving bills on bonus impressions. Current behaviour is right. | No change |
| M3 | Finance export with G. and D. media: split production by production publisher. | Done `5b097001` |
| M4 | No supplier or Insertions sheets on the regular plan. | No change |
| M5 | AA matching also uses `publisherid`. | Done `7399dc82` |
| SQL | Delete approved Codex orphan activity rows. | File `349c3cd5`, not run |
| Checksums | Explain; prepare a re-stamp if safe. | Script `67e1f10c`, not run. See below. |

### M1. Fee and ad serving months

- Standard workbook only. The AA layout has no fee or ad serving rows.
- Fee: each approved line's fee months on `financials.deliverySchedule`.
- Ad serving: each approved line's frozen `approved_slice` amount, spread on that line's delivery shape (impressions by month). Drafts use live rates.
- Fallbacks: stored delivery schedule month totals (legacy blob plans), then media share.
- `allocateLineAcrossMonths` puts the residue on the last month with weight.
- Rebuilt read-only (column N and the MBA block unchanged on all four):

| Plan | Row | Before | After |
| --- | --- | --- | --- |
| BICAU006 v24 | Fee Sep / Oct / Nov | 7,212.63 / 10,391.68 / 7,212.64 | 8,181.41 / 8,454.12 / 8,181.42 (equals billing and delivery `schedule_months`) |
| BICAU006 v24 | Ad serving | 531.98 / 766.46 / 531.98 / Dec 0.01 | 603.44 / 623.55 / 603.44 (Dec 0) |
| golf025 | Fee Aug to Dec | 65.60 / 482.52 / 270.29 / 1,384.47 / 429.87 | 682.50 / 879.58 / 664.42 / 369.32 / 36.93 |
| STRMEA001 | Ad serving Sep | 737.10 | 136.43 (spread to Jun 2027 with the digital lines) |
| PENFOLD020 | Ad serving Oct to Jan | 3.33 / 16.02 / 63.84 / 1.64 | 15.42 / 38.56 / 30.85 / 0 (matches delivery `schedule_months`) |

### M2. Ad serving on bonus impressions

- Confirmed correct. `computeAdServingCost` counts bonus and package inclusions impressions. No change.

### M3. Finance export production

- `/api/finance/data` wrote the month's full production under both G.Production and D.Production.
- Now: both codes present, production is split by each production line's publisher (name, then `publisherid`; unresolved goes to D, as `buildItemCode` does).
- Per-line month amounts: billing blob `lineItems.production`, else the line's bursts (old cost x amount bursts weigh their total).
- Cents residue to D. Rows always equal the month production. No usable lines: full amount under D only.
- Affected today: 14 version-months on published tips (CHALLEN003, glenda005, golf009, PENFOLD005, PENFOLD013, PENFOLD014, PGAAUS005).

### M4. Regular plan sheets

- No supplier or Insertions sheets on the regular plan. No change.

### M5. AA matching on publisher id

- Name first, then `publisherid` (case-insensitive). An id shared by two publishers never matches.
- Read-only check over every published version: only 29 "SCA" production lines change (golf001, golf009, golf019, hema005, PGAAUS005, STRMEA001).
- "Farm Machinery Sales" is CarSales's `publisherid`, but those 88 lines already match CarSales by name. No change.
- STRMEA001 AA rebuild now carries the $1,200 SCA production.
- Stored AA files change only when re-rendered.

### Snapshot checksums after SB1

- How it is computed: `lib/docs/snapshotChecksum.ts`. sha256 of canonical JSON of the version's `schedule_months` rows, `approved_slice` and the fee snapshot. Footer shows `v{n} · {first 8 hex}`.
- Where it is stamped: `savePlan` writes `snapshot_checksum` once, at publish. There is no re-stamp path for published versions.
- What reads it:
  - Weekly tripwire `/api/cron/snapshot-checksum`: recomputes and logs mismatches. Report-only.
  - MBA PDF footer: computed live from current rows at render (`buildMbaFromPersisted`). It does not read the stored value.
  - `/api/mediaplans/generate-pdf` returns the stored value as metadata.
  - `scripts/backfill-plan-documents.ts` only checks that a value exists.
- After SB1, 90 versions (13 masters) no longer match. MBA money does not change.
- What re-stamping changes: only the stored column. The tripwire goes quiet for these 90. A regenerated MBA PDF already shows the new hash with or without a re-stamp.
- Risks:
  - PDFs already sent show the old hash8. After a re-stamp, the database no longer holds that value. Keep the script's dry-run output (old and new hash8 per version) with this audit.
  - It writes to published versions, outside the app's immutability guard. The script guards each update on the stored value.
- Not doable in SQL: the canonical JSON is JavaScript `JSON.stringify` with sorted keys. Postgres `jsonb::text` formats differently.
- Prepared (not run): `scripts/backfill/restamp-snapshot-checksum.ts`.
  - Re-stamps a version only when stored != current AND stored equals the checksum with the SB1 rows put back. Anything else is listed as "unexplained" and left.
  - `--apply --expect 90` writes in one transaction.
- Candidates (92 versions with a bare production id; the script picks the 90): bicau009 v1; glenda008 v2-7; hartm015 v5-11; hartm017 v1-5; PENFOLD015 v47-48; PENFOLD020 v26-29; penfold022 v1-3; penfold026 v2-3; PGAAUS015 v14-38; qatar003 v1-9; sinch001 v5-6; STRMEA001 v14-25; TheY001 v4-17. The 2 not expected to change were most likely saved after `0b10e769` (bicau009 v1, hartm017 v5 or TheY001 v17). The dry run names them.

## Found while doing this (not changed)

- Finance export reads media lines only from the old billing blob shape (`mediaTypes`). 60 published tips use the newer `lineItems` shape, so `/api/finance/data` gives them no media lines and no production row.
- Duplicate publishers: "Broadsheet" twice with different billing agencies; "Nine" and "Nine " both AA; LinkedIn and Linkby share id "link".

## Open questions for Luke

- Run the snapshot checksum re-stamp? Dry run first and keep the output.
- Which of the minor items to fix, and in what order?
