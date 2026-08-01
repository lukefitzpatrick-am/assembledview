# S9 — fully clean `tsc` + precise fee-snapshot law

Status: done  
Branch: `localhost`

## One-paragraph summary

Restored `npx tsc --noEmit` to **zero diagnostics** (no `@ts-ignore`, no new `tsconfig` excludes). Pin in INVARIANTS: `mba_fee_snapshots` write on save **`mode=publish` only**, independent of `campaign_status` — code matches Luke’s live krusty012 v3 (`draft` status + snapshot). Re-ran S1–S7 suites + O3/O4/O4.5 in one batch: **174 tests, 0 failures** (S8 soak has no suite).

## Confirmed snapshot law

| Gate | Writes snapshot? |
|---|---|
| `mode=publish` | **Yes** (publish block: BOSS006 → slice → status persist → snapshot upsert/insert-once) |
| `mode=draft` / `mode=new_version` | **No** |
| `campaign_status` | **Not a gate** — publish-mode may persist `draft` (etc.) and still snapshot |

Code: `lib/data/savePlan.ts` (`published = input.mode === "publish"`; snapshot insert inside that block after `resolvePersistedCampaignStatus`). Live (Luke): krusty012 v3. This session did **not** re-query Postgres for that row — confidence on live evidence rests on Luke’s verify + code read.

## Each `tsc` fix

| Area | Fix |
|---|---|
| `ClientKpiSection.tsx` | Null-safe `cpv` / metric inputs after C-20 `number \| null` (`?? 0` / `?? ""`) |
| `InvoicingLocalFilters.tsx` | Switch requires `aria-labelledby` (paired label id) |
| `xeroLinks` / `labels` / `invoicingVisibleMonths` / `apply-0014-*` | Drop illegal `.ts` import extensions under bundler resolution |
| `postgresAutoBillingCorrection.test.ts` | Full `mediaCosts` fixture helper |
| `mbaPlanDetailParity.test.ts` | Annotate Xano `versionData` as `Record<string, unknown>` so `.id` exists |
| `mirrorToXano.test.ts` | Fixture includes required `feeLoading: {}` (O4.5) |
| `saveDocSteps.test.ts` | Type dialog items as `SaveDocStepItem[]` so `.error` narrows |
| `costsAccrualHelpers.test.ts` | Complete finance `BillingLineItem` fixture fields |
| Investment cut (`cutQuery` / `cutAggregate` / `cutGrain` / `agencyEconomics` + tests + probe) | Partial measure/totals typing; grain narrowing; `mappingLogicRef` via forecast row def; fixture/DEFAULT_FILTERS; probe `?? 0` |

## Suite tally (one run, all green)

| Slot | Suite | Pass |
|---|---|---:|
| S1 | `dashboardMonthlySpend.test.ts` | 4 |
| S2 | `test:xano-mirror` | 17 |
| S3 | `saveDocSteps.test.ts` | 9 |
| S4 | `readResult.test.ts` | 3 |
| S5 | `test:mba-plan-detail` | 6 |
| S6 | `test:match-text` + `test:finance-filters` + pacing filters + vitest homeDashboardFilters | 14+13+13+3 |
| S7 | `test:kpi-writes` | 38 |
| S8 | soak report-only | N/A |
| O3+O4.5 | `test:postgres-save-mode` (incl. publish feeLoading) | 49 |
| O4 | `postgresAutoBillingCorrection.test.ts` | 5 |
| **Total** | | **174** |

Also: `npx tsc --noEmit` exit 0 (zero diagnostics) immediately before this report.

## Confidence

**~85%.** Suite + `tsc` evidence is fresh in-session. Live krusty012 snapshot×draft status was not re-probed against the DB here (Luke’s verify + code agreement only). Investment-cut typing fixes are compile-correct; full `test:finance-sections` not part of the S1–S8/O3/O4.5 mandate.
