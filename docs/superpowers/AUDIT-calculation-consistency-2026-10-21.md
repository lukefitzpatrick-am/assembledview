# Audit: calculation consistency (21 Oct 2026)

Scope: the shared calculation functions (rates, fees, GST, rounding, money formatting, day keys, status bands). Pacing surfaces and media plan downloads are audited separately.

Sources of the decided rules: `docs/brain/INVARIANTS.md` (fee math, rounding, KPI law, pacing law), `lib/pacing/status.ts`, commit `a7aab692` (plan CPM is the buy rate), Luke's brief for this audit (CVR = results / clicks, ROAS = revenue / platform spend from purchase events, CPV is a plan rate, Melbourne as-of).

The project docs (`av-review/...`) could not be read in this session (no Projects tool). Anything that depends on a newer project-doc definition is marked.

## Commits

| Commit | Family | What changed |
| --- | --- | --- |
| `825b5fe8` | CVR | `cvr(results, clicks)` added to `lib/money/rates.ts`. Social and programmatic delivery tiles, both pacing aggregates and CF4 `cvrPct` route through it. Was results / impressions in four places. |
| `163f5be0` | Day keys | Orphan admin list, live line picker and orphan assign use `getAsOfDate()` (Melbourne), not the UTC day. |
| `8c0b32df` | Rounding | `deriveSpendFromPlanRate` and AVA `deliveryConversions` round through `lib/money` (half-up, away from zero). Was `Math.round(x * 100) / 100` (1.005 became 1.00). |

## Matrix

Legend: OK = matches the canonical rule. FIXED = changed in a commit above. DIFF = differs, listed under decisions. DEAD = computed, then overwritten or never shown.

### Delivery rates

| Metric | Canonical | Other implementations | Status |
| --- | --- | --- | --- |
| CPM (delivered) | `lib/money/rates.ts` `cpm` | `components/dashboard/delivery/channels/searchAdapter.ts:332`, `components/pacing/detail/CampaignBurstsTab.tsx:72`, `lib/creative/performance/metrics.ts:283`, `lib/kpi/kpiBandTargets.ts:51` | OK (same formula, inline) |
| CPM (plan rate) | `lib/kpi/kpiReview.ts` `resolveCpmPlanRate` (buyAmount weighted by impressions, `a7aab692`) | `lib/kpi/lineItemKpiTargets.ts:91,184` (sum of mediaAmount / sum of calculatedValue x 1000), used by `socialAdapterShared.ts:236,239,72` and `programmaticAdapterShared.ts:304,307,100` | DEAD. `applyKpiBandTargets` replaces expected, caption and status on every CPM and CPV tile. Close to buyAmount on net lines. Cleanup only (D7). |
| CPC | `rates.cpc` | `EntityBreakdownTable.tsx:76`, `CampaignBurstsTab.tsx:70`, `lib/creative/performance/present.ts:67`, `kpiReview.ts:655`, `lib/pacing/maths/index.ts` `computeKpis` | OK. Pacing maths `div0` returns 0, not null, with no clicks. |
| CPC (plan rate) | `kpiReview.ts` `resolveCpcPlanRate` (buyAmount on CPC buys, else spend / planned clicks) | none | OK |
| CTR | `rates.ctr` (decimal) | `EntityBreakdownTable.tsx:81`, `CampaignBurstsTab.tsx:68` (x100 for display), `creative/performance/metrics.ts:281`, `kpiPacing.ts:108`, `pacing/ad-serving/fetchAdServingPacingCampaignRows.ts:20`, `pacing/social/aggregate.ts:30`, `reports/campaignReport/deckDetail.ts:267`, `assembleCampaignReportData.ts:329`, `webReport/displayModel.ts:483`, `kpiReview.ts` `deliveredRatio`, `kpiBandTargets.ts:43` | OK |
| CVR | `rates.cvr` (results / clicks, decimal) | Was results / impressions: `socialChannelCompute.ts:738`, `programmaticCompute.ts:358`, `pacing/social/aggregate.ts:31`, `pacing/programmatic/aggregate.ts:29`. Already clicks: `kpiReview.ts:512`, `kpiBandTargets.ts:44`, `kpiPacing.ts:112`, `pacing/kpi/computeKpiStatus.ts:92`, `searchCore.ts:334`, `searchAdapter.ts:578`, pacing maths `cr`, `assembleCampaignReportData.ts:331`, `conversions/rules.ts` `cvrPct` | FIXED (`825b5fe8`) |
| CPV (delivered) | `rates.cpv` | `kpiReview.ts:525`, `kpiBandTargets.ts:59`, `pacing/scenario/fromLineCard.ts:29`, `pacing/social/aggregate.ts:32`, `programmaticAdapterShared.ts:354` (cost per play) | OK |
| CPV (plan rate) | `kpiReview.ts` `resolveCpvPlanRate` (INVARIANTS KPI law) | `pacing/social/computeSocialKpiStatus.ts`, `pacing/programmatic/computeProgrammaticKpiStatus.ts` compare to `campaign_kpi.cpv` | DIFF (D2) |
| VTR | `rates.vtr` | `kpiReview.ts` `deliveredRatio` uses completes only where the source tracks them; `pacing/social/aggregate.ts:33` and social tiles use 3s views / impressions | DIFF (D1) |
| CPA | `rates.cpa` | `conversions/rules.ts` `cpa` (null when conversions <= 0), `socialChannelCompute.ts:740` `cost_per_result`, `pacing/scenario/fromLineCard.ts:32`, pacing maths `computeKpis` (0 not null) | OK |
| ROAS | `conversions/rules.ts` `roas` (revenue from purchase-category events / platform spend) | `pacing/maths/index.ts:180` `computeKpis.roas` (search fact revenue, not purchase-only) | DIFF, no consumer (D5) |
| Frequency | none (C-134, no reach column) | `kpiReview.ts` prints "Not tracked yet" | OK |

### Money

| Item | Canonical | Other implementations | Status |
| --- | --- | --- | --- |
| Fee (fee in budget, client pays, net budget) | `lib/mediaplan/burstAmounts.ts` `computeBurstAmounts` | Snapshot `totalMedia` inline in the 13 container components (for example `CinemaContainer.tsx:607`, `TelevisionContainer.tsx:1011`) and `useMediaChannelContainer.ts:525` (`budget x (100 - pct) / 100` when fees are included, else budget). No client-pays or bonus handling. | Out of scope (Luke: fee math is correct and out of scope). INVARIANTS says snapshot `totalMedia` is unchanged on purpose. Noted (D6). |
| Gross up / down | `lib/mediaplan/deliverableBudget.ts` `netMediaFromGross` / gross from net | `burstAmounts.ts` | OK |
| GST | `lib/finance/gst.ts` (`addGst`, `gstAmount`, `GST_RATE`) | All MBA, media plan, billing PDF and finance report callers import it. Xero totals are tagged `inc_gst`. | OK |
| Rounding | `lib/money/cents.ts` `toCents` / `roundMoney2` (half-up, away from zero) | `lib/format/money.ts` `roundMoney2` delegates (non-finite gives 0). Local `Math.round(x * 100) / 100`: `deriveSpendFromPlanRate.ts:69`, `ava/tools/deliveryConversions.ts:50` (FIXED); `finance/accrual.ts:67`, `finance/extractReportLinesFromBillingSchedule.ts:51`, `finance/forecast/buildFinanceForecastDataset.ts:310`, `finance/forecast/mapping/classification.ts:143`, `finance/report/buildReportRows.ts:15`, `finance/report/metrics.ts:39`, `billing/assertPersistedLineFeesMatchBilling.ts:17`, `snowflake/lineItemSnapshotParity.ts:170` (D3). `toFixed(2)`: `socialChannelCompute.ts:77`, `programmaticCompute.ts:410-699` (pacing payloads, D3). | FIXED / DIFF |
| Currency display | `lib/format/money.ts` `formatMoney` | `conversionTiles.ts` `money2` (`toLocaleString`, 2dp), `formatCurrency2dp` wrappers in adapters | OK (same 2dp output) |

### Pacing and dates

| Item | Canonical | Other implementations | Status |
| --- | --- | --- | --- |
| Status bands | `lib/pacing/status.ts` `PACING_STATUS_THRESHOLDS` (behind < 90, on track 90-110, ahead > 110, over-pacing >= 115) | `deliveryStatusFromPct`, `computeStatus`, `statusFromExpectedPct` read it. KPI cells use `kpiTolerance` 10% one-sided (documented). `socialAdapterShared.ts:93` and `programmaticAdapterShared.ts:63` `compareRateStatus` hard-code 8%. | DIFF, mostly DEAD (D4) |
| Expected spend to date | `lib/spend/resolveCampaignExpectedSpend.ts`, `channelExpectedToDate.ts`, `assumedSpend.ts` | Line-level linear `computeExpectedSpend` in pacing maths | Pacing audit owns this |
| As-of date | `lib/pacing/maths` `getAsOfDate` (Melbourne) | Orphan admin (3 files) used the UTC day | FIXED (`163f5be0`) |
| Other UTC "today" | | `ava/tools/queryXeroStatus.ts:81` (overdue check), `avaSnowflake.ts:94` (default end date), `finance/billingRecordToCampaignData.ts:18` (fallback invoice date), `partner-ingest/sourceFile.ts:4`, `material-instructions/route.ts:58` and `generateMiWorkbook.ts:44` (prepared date), `web/builder/BuilderTopBar.tsx:206` | Labels and fallbacks. Wrong before 10 or 11am Melbourne. D8. |
| Burst day keys | `parseBurstsToNormalised` / `formatBurstDateLocal` | Not changed here | Pacing audit owns this |

## Decisions for Luke

D1. VTR on Meta and TikTok.
- Today: the MBA KPI review says "Not tracked for this source" (no completed views). The pacing line card and the social "View rate" tile divide 3s views by impressions, and the pacing card compares that to the VTR target.
- Options: (a) VTR is completes only, pacing card shows "Not tracked" for Meta; (b) 3s view rate counts as VTR everywhere, review shows it too.
- Money: none. Status only.

D2. Pacing KPI cells still use the leftover `campaign_kpi.cpv`.
- INVARIANTS: CPV is a plan rate; leftover non-zero `cpv` values are ignored. The pacing social and programmatic KPI status still reads them.
- Live data: 290 rows on 18 MBAs carry a non-zero `cpv`, including live PENFOLD020 ($0.07), hartm001 ($0.10) and TRWICO001 ($0.08 to $0.38).
- Rule is decided. It sits on the pacing surface, so it is routed to the pacing audit rather than changed here.
- Money: none.

D3. Finance rounding.
- Rule is decided (one rule, half-up away from zero, through `lib/money`). Eight finance and billing helpers still use `Math.round(x * 100) / 100`. The pacing payloads in social and programmatic compute use `toFixed(2)`.
- Difference: at most $0.01 per rounded value, on an x.xx5 amount or a negative half cent. Example: $1.005 rounds to $1.00 today, $1.01 under the rule.
- Options: (a) route all eight through `roundMoney2` now; (b) leave them under the `check:money-inline` ratchet.
- Not changed here: they are finance amounts.

D4. KPI status tolerance.
- Three numbers: 90 to 110 percent (MBA review and the KPI band pill), 10% one-sided (pacing KPI cells, documented), 8% (`compareRateStatus` in the social and programmatic adapters).
- The 8% status is overwritten by the KPI band overlay on every CPM, CPC, CPV, CTR, CVR and VTR tile, so it is dead there.
- Recommendation: delete `compareRateStatus` (cleanup, no visible change). Confirm the pacing cells keep 10%.
- Money: none.

D5. Pacing maths ROAS.
- `computePacing` returns `roas = revenue / spend` from the search fact revenue (all conversion value, not purchase events). Nothing displays it.
- Options: (a) remove it; (b) route it to `rules.roas` with purchase revenue.
- Money: none today.

D6. Snapshot `totalMedia` in the containers.
- Inline formula, no client-pays or bonus handling. INVARIANTS keeps it unchanged on purpose and fee math is out of scope.
- Confirm it stays out of scope. Not quantified.

D7. Duplicate plan CPM / CPV target (`lib/kpi/lineItemKpiTargets.ts`).
- Computed by the social and programmatic adapters, then replaced by the review's plan rate on the same tile.
- Recommendation: delete the dead path. Money: none.

D8. UTC "today" in labels and fallbacks.
- `queryXeroStatus` overdue check is the only one with an effect: before 10 or 11am Melbourne an invoice due yesterday is not yet overdue.
- Recommendation: use the Melbourne or Sydney date (`owedQuery` already uses `sydney_today`). Money: none, timing of the overdue label only.

## Real campaign check (CVR)

hartm001sm3, Meta, 1 to 20 Oct 2026: 254,343 impressions, 1,449 clicks, 124 results. Saved conversion rate target 1.92%.
- Before: tile 0.05% (results / impressions). Pill compared 8.56% (results / clicks) to 1.92%. Pacing card Conv. rate read off target.
- After: tile, pill and pacing card all read 8.56%.

## Tests

Node (UTC and Australia/Melbourne, `DATABASE_URL=" "`): `lib/money/__tests__/rates.test.ts`, `lib/delivery/social/__tests__/summarizeActuals.test.ts`, `lib/delivery/programmatic/__tests__/summarizeDv360Actuals.test.ts`, `lib/pacing/__tests__/conversionRateAggregates.test.ts` (new), `lib/delivery/conversions/__tests__/rules.test.ts`, `channelConversions.test.ts`, `lib/kpi/__tests__/kpiReview.test.ts`, `kpiBandTargets.test.ts`, `lib/pacing/channel/__tests__/lineCardModel.test.ts`, `lineCardTiles.test.ts`, `lib/pacing/overview/__tests__/countChannelOverviewStatus.test.ts`, `components/dashboard/delivery/channels/__tests__/conversionTiles.test.ts`, `socialRedditAdapter.test.ts`, `programmaticAdapter.deliverySourceMap.test.ts`, `searchAdapter.revenueTiles.test.ts`, `lib/pacing/programmatic/__tests__/fixedCostProgrammaticPresentation.test.ts`, `lib/pacing/maths/__tests__/dateArithmetic.test.ts`, `lib/delivery/__tests__/deriveSpendFromPlanRate.test.ts`, `estimateDirectDigitalSpend.test.ts`, `lib/ava/tools/__tests__/deliveryConversions.test.ts`.

Vitest for Luke to run: `components/pacing/channel/__tests__/LinePacingCard.test.tsx`, `components/dashboard/campaign/__tests__/KpiReview.test.tsx`, `app/dashboard/[slug]/[mba_number]/components/__tests__/CampaignPageAssembly.order.test.ts`.
