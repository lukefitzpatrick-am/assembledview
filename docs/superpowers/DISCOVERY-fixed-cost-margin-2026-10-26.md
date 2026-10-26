# Discovery: fixed cost margin by client, line, publisher and month

Date: 26 Oct 2026. Measured live (Supabase slpdibnxtpdlttbbczvg, Snowflake ASSEMBLEDVIEW) with SELECT only.

Luke's ask (26 Oct, 21:48): in the Publishers section of Finance, track every fixed-cost line by month: what we bill the client, what DV360, YouTube, Taboola, Meta, TikTok and others actually charge us, and the difference, by client, line item, publisher and month.

## Summary

- The request can be met. Billed per line per month exists. Platform spend per line per month exists for DV360 (incl. YouTube), Taboola, Vistar, Meta, TikTok, Reddit, Google Ads and Microsoft Ads.
- No platform cost exists for Channel Factory (feed carries 0 by design), CM360 ad serving, or direct publishers (News Corp, Golf Digest, Nova and so on). Those lines show billed only, flagged.
- PACING_FACT double counts renamed DV360 line items. The report must not read it for DV360. A new view is written for Luke (not run).
- Two open questions on which column counts as our cost: DV360 (cost vs media cost) and Vistar (revenue).

## 1. How fixed-cost lines are identified (confidence 90%)

Two flags, both on `line_items` (Postgres) and mirrored to `MART.XANO_LINE_ITEMS_SNAPSHOT` (Snowflake):

- `buy_type = 'fixed_cost'`: the client pays a flat amount. Mostly direct publishers (News Corp, Golf Digest, Broadsheet), some social (Meta, Double Verify, TikTok) and influencers.
- `fixed_cost_media = true`: billed at plan while we buy on a rate. This is how DV360, YouTube - DV360, Taboola, Channel Factory, Broadsign (Vistar) and Seven BVOD lines are set. `SP_REFRESH_FIXED_COST_REPORTED_DAILY` reads `FIXED_COST_MEDIA = TRUE OR ASSUME_SPEND = TRUE` from the snapshot.

The report uses `fixed_cost_media OR buy_type = 'fixed_cost'`, client-pays lines out (we do not buy that media).

Not used:

- `FIXED_COST_REPORTED_DAILY_FACT.REPORTED_SPEND` / `FIXED_COST_LINE_ITEM_FACT` (`app/pacing/(shell)/direct/*`, `lib/pacing/direct/fetchDirectPacingRows.ts`) is modelled spend (plan smoothed by date). Its `ACTUAL_PLATFORM_SPEND` is clipped to burst dates and reads PACING_FACT, so it inherits the DV360 double count below.
- `deriveSpendFromPlanRate` is modelled delivered spend for CM360 / Twitch lines. Not platform cost.

FY2026-27 live lines (published tip, billing months from Jul 2026, all statuses):

| Client | MBA | Line | Publisher / platform | Buy | FC media | FY27 billed |
|---|---|---|---|---|---|---|
| BIC | BICAU002 | BV2, BV3, BV4 | Seven (BVOD) | cpm | yes | 6,500 each |
| BIC | BICAU002 | DV1 | UMG Popsta | fixed_cost | yes | 18,240 |
| BIC | BICAU002 | PV1, PV2 / PV3, PV4 | Channel Factory | cpv | yes | 16,000 each / 4,000 each |
| BIC | BICAU006 | PV1 / PV5 | Channel Factory | cpv | yes | 65,352.60 / 16,000 |
| Boss Engineering | BOSS010 | DD2 | CarSales | fixed_cost | no | 6,000 |
| Golf Australia | golf025 | DD11, DD14, DD15, NP6 | Golf Digest | fixed_cost | no | 4,000 / 1,000 / 2,000 / 4,000 |
| LDS Property | buxton004 | DD1 / DD7 | Apartments.com.au / Realestate.com.au | fixed_cost | no | 28,472.83 / 26,199.69 |
| LDS Property | buxton004 | SM1 | Assembled Media (Meta) | fixed_cost | yes | 7,500 |
| Paul Hartmann | hartm001 | PD1, PD2 | DV360 | cpm | yes | 19,998.92 / 4,598.08 |
| Paul Hartmann | hartm001 | PD3 | Taboola | cpc | yes | 17,668 |
| Paul Hartmann | hartm001 | PV1, PV2 | YouTube - DV360 | cpv | yes | 54,051.68 / 31,432.32 |
| Paul Hartmann | hartm013 / hartm015 | IN1 / OH7 | Influencer Mgmt / OOH | fixed_cost | yes / no | 1,350 / 3,250 |
| Penfolds | PENFOLD015/016/018 | PV1 | Channel Factory | cpv | yes | 40,000 / 10,000 / 40,000.02 |
| Penfolds | PENFOLD016 | DD4, DD5 | Broadsheet | fixed_cost | no | 10,500 / 3,500 |
| Penfolds | PENFOLD020 | NP1, OH3, OH33, SM4 | Nine, OOH, OOH, Meta | mixed | mixed | 50,000 / 5,200 / 60,000 / 74.28 |
| Penfolds | penfold025 (planned) | TV1 | TV | package | yes | 35,000 |
| Penfolds - PR | penfold022 (planned) | SM1-SM4 | News Corp | fixed_cost | no | 15,000 total |
| PGA Australia | PGAAUS015 / pgaaus018 (planned) | DD17, DD19 / DD1-DD12 | Golf Digest / News Corp | fixed_cost | no | 6,000 / 28,627.37 |
| Simmone Logue | SML001 (planned) | IN1 | Influencer Mgmt | fixed_cost | yes | 14,994.10 |
| Sinch | sinch001 | DA1, DA4, DA5, DA6, DA9, DD1 | Nova, Nine, Tech Partner News, Ad News | fixed_cost | no | 65,682 total |
| Sinch | sinch001 | PO1, PO2, PO3 | Broadsign (Vistar) | cpm | yes | 30,000 / 40,000 / 30,000 |
| Strength Meals | STRMEA001 | OH161 | OOH | fixed_cost | no | 17,724.30 |
| Treasury Wine Collective | trwico002 | SM4, SM6 | Double Verify | fixed_cost | no | 654 / 376 |

Only the hartm001 DV360 / YouTube / Taboola lines, sinch001 Vistar lines and buxton004SM1 (Meta) have platform cost in FY27 so far. penfold020SM4 (Meta) bills in Dec.

## 2. What is billed per line per month (confidence 95%)

- `schedule_months` is per line, per month: `component` (media, fee, adserving), `basis` (billing, delivery), `amount_cents`. The plan of record (INVARIANTS, 22 Oct).
- Billed = `component = 'media' AND basis = 'billing'` on the published tip (`PUBLISHED_VERSION_JOIN_SQL`), joined to `line_items` with `SCHEDULE_LINE_JOIN_SQL` (dual-shape line id). No need for the blob's `lineItems` / `monthlyAmounts`.
- Statuses: approved, booked, completed (the finance sections standard). Planned and draft are left out.
- Invoiced: `finance_billing_records` is per MBA-month, and `finance_billing_line_items` has no rows for these MBAs. So invoiced is month level: a line-month counts as invoiced when its MBA-month has a media record that is not cancelled and is billed, invoiced, paid, exported or Xero-matched. The report shows the billed amount for those months. It is not a per-line invoice figure (confidence 75%).
- hartm001 shows billed equal to actual for Jul to Sep (PD2 Jul 1,034.88 vs 1,034.92, PV2 Sep 4,930.56 vs 4,930.55). Those months look billed on actuals, so margin there is near 0 by design.

## 3. Actual platform spend per line per month

| Source | Where | Cost column | Currency | Line match | Confidence |
|---|---|---|---|---|---|
| DV360 (display, video, YouTube - DV360) | `GOOGLE_DISPLAY_AND_VIDEO_360.DV_360_PACING` via `VW_STG_DV360_PACING` / `VW_PACING_DV360` | `COST_ADV_CURRENCY` as `AMOUNT_SPENT` (equals `REVENUE_ADV_CURRENCY` on every Oct row). `TOTAL_MEDIA_COST_ADVERTISER_CURRENCY` is about 77% of it | AUD only | plan code regex in the DV360 line item name, then `LINE_ITEM_LABEL_MAP` on md5(advertiser, IO, line item) | 85% (which column, see questions) |
| YouTube | DV360 only. Google Ads video campaigns are not ingested (SEARCH_PACING_FACT has Search, Shopping, PMax, Microsoft) | as DV360 | AUD | as DV360 | 90% |
| Taboola | `VW_PACING_TABOOLA` (`TABOOLA.PLATFORM_REPORT.SPENT`) | `AMOUNT_SPENT` | AUD (2,513 of 2,514 2026 rows; one blank) | plan code in campaign name, else campaign id + label map | 95% |
| Meta, TikTok, Reddit | `SOCIAL_PACING_FACT` (`VW_PACING_META` `spend`, `VW_PACING_TIKTOK` `spend`) | `AMOUNT_SPENT` | Meta AUD (one EUR account), TikTok AUD | `LINE_ITEM_ID` (relabelled) | 90% |
| Google Ads, Microsoft Ads | `SEARCH_PACING_FACT` (`COST_MICROS / 1e6`, Bing `SPEND`) | `AMOUNT_SPENT` | AUD | `LINE_ITEM_ID` | 90% |
| Vistar (prog OOH, Broadsign lines) | `VW_PACING_PARTNER_OOH` (`RAW.PARTNER_DELIVERY_DAILY`) | `AMOUNT_SPENT`, commented "Vistar Revenue = client cost" | assumed AUD | plan code in Contract Number or `RAW.PARTNER_LINE_MAP` | 70% (column meaning, and CLAUDE_RW cannot read the view) |
| Channel Factory | `VW_PACING_PARTNER_FILE` | `AMOUNT_SPENT` is `CAST(0 AS FLOAT)`: "CF reports no platform cost" | n/a | plan code | 95% that there is no cost |
| CM360 ad serving | `PACING_FACT` 'Ad Serving - CM360' | 0 by design (verification counts) | n/a | n/a | 95% |

The pacing facts do not carry modelled spend in `AMOUNT_SPENT` (modelled spend lives in `FIXED_COST_REPORTED_DAILY_FACT.REPORTED_SPEND`). They carry platform spend. But PACING_FACT has two defects:

- **Stale DV360 rows.** `TSK_REFRESH_PACING_FACT` is a MERGE with no delete. When a DV360 line item is renamed, the DV360 report restates recent days under the new name, so new entity keys get fresh rows and the old keys keep theirs. Both map to the same plan line. October to date: hartm001pv1 PACING_FACT 20,149.83 vs DV360 raw 13,786.86 (+6,362.97); hartm001pv2 7,033.10 vs 4,588.93 (+2,444.17). Pacing and the client dashboard show the same overstatement today.
- **Duplicate social rows.** PACING_FACT holds 48,721 'Social - Meta' and 265 'Social - TikTok' rows besides SOCIAL_PACING_FACT.

So the report reads platform spend from a new view, `MART.VW_PLATFORM_SPEND_LINE_MONTH`, built from the live sources with the same label map as the task: `sql/snowflake/mart/migrations/2026-10-26_FCM1_platform_spend_line_month_ACCOUNTADMIN.sql` (for Luke, not run). Until it exists, the route falls back to PACING_FACT (programmatic channels only), SOCIAL_PACING_FACT and SEARCH_PACING_FACT and says so on the page.

## 4. Fees (confidence 95%)

Billed uses `schedule_months.component = 'media'` only. Agency fees (`fee`) and ad serving (`adserving`) are separate rows and are never read. Media is net media (all FY27 fixed-cost lines have `budget_includes_fees = false`).

## 5. Where it lives (confidence 95%)

- Finance > Publishers is `/finance/costs` (`CostsOverviewClient`, title "Publishers") with `CostsSubNav` pills: Overview, Publisher invoices, Accruals, Client-pays.
- "Fixed cost margin" is a fifth pill and page: `/finance/costs/fixed-cost-margin`, same shell, scope bar (FY, month range, clients) and admin gate as Client-pays.
- API: `GET /api/finance/sections/costs/fixed-cost-margin`, `requireFinanceAdmin`.

## October 2026 examples (month to date, 26 Oct)

| Line | Source | Billed | Actual | Margin | Margin % | DV360 media cost |
|---|---|---|---|---|---|---|
| hartm001PD1 | DV360 | 3,750.36 | 3,232.23 | 518.13 | 13.8% | 2,486.33 |
| hartm001PD3 | Taboola | 2,784.00 | 1,060.82 | 1,723.18 | 61.9% | n/a |
| hartm001PV1 | YouTube - DV360 | 9,741.44 | 13,786.86 | -4,045.42 | -41.5% | 10,605.28 |
| sinch001PO2 | Vistar | 19,076.92 | 9,401.35 | 9,675.57 | 50.7% | n/a |

PV1 from PACING_FACT would read 20,149.83 actual and -10,408.39 margin. October is not complete, so billed (full month) is ahead of actual (to date) on most lines.

## Questions for Luke

1. DV360: is our cost `COST_ADV_CURRENCY` (what pacing shows, equal to DV360 revenue) or `TOTAL_MEDIA_COST_ADVERTISER_CURRENCY` (about 77% of it, before DV360 fees and partner margin)? The report uses the first and shows the second beside it.
2. Vistar: is `AMOUNT_SPENT` (Vistar revenue) what Vistar invoices us?
3. Channel Factory: where does its real cost come from (their invoice)? The feed has no cost, so those lines show "No cost in feed".
4. Direct fixed-cost publishers (News Corp, Golf Digest, Nova and so on) have no platform feed. Should their cost come from Xero AP bills? Today they show "No platform data".
5. Should planned (not yet approved) campaigns show? The report follows finance sections: approved, booked, completed.
6. PACING_FACT double counting renamed DV360 line items (and old Social rows) is a separate pacing fix. Want a guarded cleanup SQL?
