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
| DV360 (display, video, YouTube - DV360) | `GOOGLE_DISPLAY_AND_VIDEO_360.DV_360_PACING` via `VW_STG_DV360_PACING` / `VW_PACING_DV360` | `COST_ADV_CURRENCY` as `AMOUNT_SPENT` (equals `REVENUE_ADV_CURRENCY` on every Oct row). `TOTAL_MEDIA_COST_ADVERTISER_CURRENCY` is about 77% of it | AUD only | plan code regex in the DV360 line item name, then `LINE_ITEM_LABEL_MAP` on md5(advertiser, IO, line item) | confirmed by Luke 27 Oct |
| YouTube | DV360 only. Google Ads video campaigns are not ingested (SEARCH_PACING_FACT has Search, Shopping, PMax, Microsoft) | as DV360 | AUD | as DV360 | 90% |
| Taboola | `VW_PACING_TABOOLA` (`TABOOLA.PLATFORM_REPORT.SPENT`) | `AMOUNT_SPENT` | AUD (2,513 of 2,514 2026 rows; one blank) | plan code in campaign name, else campaign id + label map | 95% |
| Meta, TikTok, Reddit | `SOCIAL_PACING_FACT` (`VW_PACING_META` `spend`, `VW_PACING_TIKTOK` `spend`) | `AMOUNT_SPENT` | Meta AUD (one EUR account), TikTok AUD | `LINE_ITEM_ID` (relabelled) | 90% |
| Google Ads, Microsoft Ads | `SEARCH_PACING_FACT` (`COST_MICROS / 1e6`, Bing `SPEND`) | `AMOUNT_SPENT` | AUD | `LINE_ITEM_ID` | 90% |
| Vistar (prog OOH, Broadsign lines) | `VW_PACING_PARTNER_OOH` (`RAW.PARTNER_DELIVERY_DAILY`) | `AMOUNT_SPENT`, commented "Vistar Revenue = client cost" | assumed AUD | plan code in Contract Number or `RAW.PARTNER_LINE_MAP` | confirmed by Luke 27 Oct (CLAUDE_RW still cannot read the view) |
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

## Xero bills for Channel Factory and direct publishers

## Answers from Luke (27 Oct 2026)

1. DV360 and YouTube via DV360: our cost is `AMOUNT_SPENT` (`COST_ADV_CURRENCY`, equal to DV360 revenue), the figure pacing shows. As built. The DV360 media cost column is removed from the page, Excel and payload (commit 6e1f0f77). The FCM1 view keeps `MEDIA_COST` but the app does not read it. See the Five Stones evidence below before this is final.
2. Vistar: `AMOUNT_SPENT` (Vistar revenue) is what Vistar invoices us. Confirmed.
3. Channel Factory: real cost is the signed-off amount, no margin. Cost to come from Xero bills.
4. Direct fixed-cost publishers: cost to come from Xero bills.
5. Scope stays approved, booked and completed. `FINANCE_STATUS_INCLUDED_SQL` is `IN ('approved', 'booked', 'completed')`; planned and draft are excluded. A test pins it.
6. PACING_FACT cleanup: separate work.

## Xero bills for Channel Factory and direct publishers

Discovery only. Nothing built. Measured 27 Oct 2026 (Supabase SELECT only, Snowflake CLAUDE_RW SELECT only).

### Summary

- Supplier bills are already pulled from Xero every night and stored in Postgres `xero_ap_bills` (2,297 rows, 187 issued from 1 Jul 2026, last sync 26 Oct 00:15 UTC). No new Xero scope or OAuth work is needed.
- No bill carries an AV plan line id. No bill has a Reference since FY26 (3 of 2,297 rows have one, all older).
- Channel Factory bills can be matched to plan lines exactly, through the CF placement id (`PL…`) on each bill line and the same id in the CF daily delivery file, which also carries our plan line code. 9 of 9 FY27 CF media placements map 1:1.
- Direct publishers (News Corp, Nova, Nine, CarSales, REA, Apartments.com.au, Broadsheet, Golf Digest, Seven, oOh!) are not billed by the publishers. `publishers.billingagency = 'advertising associates'` for all of them, and their costs arrive as Advertising Associates bills. Those bills name the MBA on 25 of 36 FY27 bills (77% of the dollars) and name the media owner per bill line, but never the plan line.
- Xero tracking ("Client/Campaign") is not reliable as a key: CF bills tagged "BIC - BICAU003" are for BICAU002 and BICAU006 placements.
- Five Stones (our DV360 and CM360 reseller) bills DV360 at about 72 to 74% of DV360 `AMOUNT_SPENT`. Question 1 below.

### 1. Xero client, token and scopes (confidence 95%)

- `lib/xero/client.ts`: Xero custom connection, `client_credentials` grant, `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET`, token cached per process, no refresh token stored. Requested scope: `accounting.invoices.read accounting.contacts`. GET only by design (the helper cannot send a body).
- `/Invoices` returns both sales invoices and bills. `lib/xero/stages/ingestInvoices.ts` pages `/Invoices` from an If-Modified-Since watermark and splits by `Type`: `ACCREC` / `ACCRECCREDIT` into `xero_ar_invoices`, `ACCPAY` into `xero_ap_bills`. The current scope demonstrably covers bills: 187 FY27 bills are in the table, last synced 26 Oct.
- Crons (finance-billing module doc): `xero-sync-invoices` 00:15 UTC (AR + AP ingest, then AR matching), `xero-sync-import` 00:30, `xero-sync-contacts` 00:45, `xero-sync-pdfs` 01:00. Backfill script `scripts/xero-backfill.ts`.
- Supplier credit notes (`ACCPAYCREDIT`) are not stored. The ingest only handles `ACCREC`, `ACCRECCREDIT` and `ACCPAY` (confidence 85%: read from the upsert branches; I did not see a separate credit note path).
- Snowflake has no Xero data (no Xero schema or table in ASSEMBLEDVIEW).

### 2. What is stored for bills (confidence 95%)

`xero_ap_bills` columns: `xero_invoice_id`, `invoice_number`, `xero_contact_id`, `status`, `sub_total` (ex GST), `total_tax`, `total`, `amount_paid`, `amount_due`, `currency`, `issue_date`, `due_date`, `fully_paid_date`, `activity_month` (0 rows populated), `reference_raw`, `line_items_json` (full Xero line items), `pdf_file`, `xero_updated_utc`, `last_synced_at`, `raw_json`.

- Supplier: `xero_contact_id` joined to `xero_contacts` (`name`, `email`, `role`).
- Line items: `Description`, `LineAmount`, `TaxAmount`, `AccountCode`, `Quantity`, `Tracking` (two categories in use: "Media", for example D.Digital, G.Digital, D.Outdoor, D.Radio, T.Adserving; and "Client/Campaign", free text). All 2,297 bills have line items.
- GST: `LineAmountTypes` is `Exclusive` on 108 FY27 bills, `Inclusive` on 78 and `NoTax` on 1. Bill `sub_total` is ex GST. Line amounts are ex GST only on Exclusive bills; on Inclusive bills ex GST is `LineAmount - TaxAmount` (CF 74242-8: line 6,179.17, sub_total 5,617.43).
- Dates: `issue_date` is the bill date. CF and Five Stones bills are dated the last day of the activity month. Advertising Associates bills are dated month end too, but one bill can carry several weeks or months (bicau008 bill dated 30 Sep carries weeks of 5 Jul, 2 Aug and 6 Sep). 66 of 133 FY27 AA lines with an amount carry a `dd/mm/yyyy` date (74% of AA line dollars).
- 81 bills are DELETED or VOIDED; 11 are not AUD.
- Already used by: Finance > Publishers > Overview (`lib/finance/sections/costsQuery.ts`, AP bills by publisher by contact name, `sub_total`), and AP bill PDFs (`app/api/finance/bills/[xeroInvoiceId]/pdf`).

### 3. `matched_xero_invoice_id` (confidence 90%)

- Lives on `finance_billing_records`. Set by the AR matcher (`stageMatchBillingRecords`, `lib/xero/matchMba.ts`: MBA number or `scope_of_work.scope_id` in the AR invoice Reference). It points at sales invoices only.
- FY27 records: 32 of 204 media records and 4 of 11 SOW records matched, all to `xero_ar_invoices`, none to `xero_ap_bills`. There is no bill matching today.

### 4. Xero contacts to publishers (confidence 90%)

- No `publishers.xero_contact_id` or similar. `xero_contact_links` maps Xero contacts to clients (AR), not publishers.
- Costs Overview attributes bills to publishers by normalised contact name only (`lib/finance/sections/costsAttribution.ts`, flagged heuristic, rest under Unattributed).
- `publishers.billingagency` is the useful field: `assembled media` on 42 publishers (DV360, YouTube - DV360, Channel Factory, Taboola, Vistar, Broadsign, UMG Popsta, Double Verify, Influencer Management, Ad News, Tech Partner News, NineNow) and `advertising associates` on 39 (News Corp, Nova, Nine, CarSales, Realestate.com.au, Apartments.com.au, Broadsheet, Golf Digest, Seven, oOh! media and others). `publishers.financecode` is set on all 81 (for example `digi3004`, `G.Digital`, `G.Print`).

### 5. FY27 bills by supplier (ex GST, not deleted or voided)

| Supplier | Bills | Ex GST | MBA found (number, tracking or description) |
|---|---|---|---|
| Advertising Associates | 36 | 1,082,598 | 25 exactly one MBA (830,858), 1 several |
| Meta Platforms Ireland | 26 | 358,481 | 7 |
| Google Australia | 3 | 246,301 | 3, all several MBAs |
| Channel Factory Australia | 16 | 123,343 | 3 (tracking, and wrong, see 6) |
| Five Stones (DV360, CM360 reseller) | 6 | 83,308 | 6, all several MBAs |
| Sports Entertainment Network | 4 | 39,618 | 3 |
| Quantcast | 8 | 24,482 | 0 |
| Broadsheet Media (direct) | 1 | 19,400 | 0 |
| Taboola | 3 | 7,845 | 1 |
| Vistar Media | 1 | 5,094 | 1 (sinch001) |

No FY27 bills exist from News Pty Limited (last May 2026), Nova c/o Polar Mobile (last Feb 2026), Golf Digest, Nine, CarSales or REA as Xero contacts. Their FY27 costs come through Advertising Associates.

### 6. Matching a bill to client, line and month

**Channel Factory (confidence 90%, measured).** Each CF bill is one CF IO (`OP0…` in the header line, for example "Penfolds Grange Brand AU GO Q3-Q4'26 OP072970") for one month (issue date = month end), with one line per CF placement (`PL…`). The CF daily delivery file in Snowflake (`RAW.PARTNER_FILE_LINES`, `channel-factory/…`) carries the same `OP…` and `PL…` in column 3 and our plan line code in column 4 (for example `OP072970_<Grange_CF12>_@15s/30s Skippable PL267346` with `CF12_AT1_P25-64_3_Lux_PENFOLD018PV1`).

| CF placement | CF IO | Plan line | Rows in file |
|---|---|---|---|
| PL267346 | OP072970 | penfold018pv1 | 10,550 |
| PL267347 | OP074148 | penfold016pv1 | 3,603 |
| PL267349 | OP074149 | penfold015pv1 | 9,510 |
| PL278352 / 53 / 55 / 56 | OP074757 | bicau002pv1 / pv2 / pv3 / pv4 | 7,705 to 9,797 each |
| PL285003 / PL285004 | OP072760 | bicau006pv1 / pv5 | 1,374 / 1,421 |

Each placement maps to exactly one plan line. The 5 FY27 CF bill placements that do not map (PL231219, PL231220 Molicare; PL271754, PL284494 Boss Agriculture; PL288840 Golf Australia) are "7.5%" fee lines ("7.5% DL Fee", "Molicare Skin 7.5%") on CF IOs that are not in the CF daily file.

The Xero "Client/Campaign" tracking on those BIC bills says "BIC - BICAU003", but the placements belong to BICAU002 and BICAU006. Tracking must not be the key.

CF bill vs our billed, ex GST, same month:

| Line | Month | CF bill | Billed | Difference |
|---|---|---|---|---|
| penfold018pv1 | Jul | 7,854.42 | 7,410.73 | -443.69 |
| penfold018pv1 | Aug | 5,617.43 | 5,509.93 | -107.50 |
| penfold018pv1 | Sep | 7,723.03 | 7,269.85 | -453.18 |
| penfold016pv1 | Aug / Sep | 7,689.54 / 2,310.48 | 7,000.00 / 3,000.00 | -689.54 / +689.52 |
| penfold015pv1 | Aug / Sep | 19,885.68 / 20,114.34 | 18,571.43 / 21,428.57 | -1,314.25 / +1,314.23 |
| bicau002pv1 | Aug / Sep | 5,290.86 / 5,061.48 | 5,268.29 / 5,853.66 | |
| bicau002pv3 | Aug / Sep | 1,630.80 / 1,002.73 | 1,317.07 / 1,463.42 | |
| bicau006pv1 | Sep | 17,564.16 | 21,544.81 | |

penfold016pv1 and penfold015pv1 net to about 0 over Aug and Sep. So "no margin" holds over the campaign, not month by month: CF bills on delivery, we bill on the plan split. This shapes question 2.

**Advertising Associates, the direct publishers (confidence 70%, measured but needs Luke's rules).** Each AA bill is one client schedule. The MBA appears in the invoice number ("Treasury Wines | Collection Release FY2027 | PENFOLD015 | 26210"), the description ("Purchase Order PENFOLD016") or the tracking ("Golf Australia - Australian Open FY27 July-December (golf025)") on 25 of 36 bills. Each bill line names the media owner ("Nova Online", "news.com.au", "Apartments.com.au", "RealEstate", "Broadsheet", "Melbourne Herald Sun", "KAYO Digital") and often a week date ("Sun-Sat 06/09/2026"). No plan line id, no PO number other than the MBA.

- Only 29 of 133 FY27 AA lines contain a `publishers.publisher_name` as written (38% of dollars). Media owner names differ from AV publisher names (news.com.au and Herald Sun vs News Corp; Aus Fin Review vs Nine; KAYO). A media owner alias list is needed.
- Sinch bills carry no MBA ("Sinch Engage - Brand", tracking "Sinch Engage Australia") and two say "Client: Treasury Wines" in the description. Client name alone is not safe.
- One plan line can be several AA bill lines (Nova Podcasts package plus production, talent, hot read), and one AA bill line can cover more than one plan line.
- Production lines (installation, talent, production) are on the same bills. Whether they count as media cost is Luke's call.

FY27 fixed-cost MBAs with any bill naming them: penfold015 (7 bills), penfold016 (4), penfold018 (4), boss010 (4), golf025 (3), strmea001 (3), sinch001 (3, Five Stones and Vistar only), hartm015 (1), hartm013 (1, Linkby). None: buxton004 (its Apartments.com.au and Realestate.com.au bill names the campaign "LDS Property WM Residences Mordia", not the MBA), penfold020, pgaaus015, trwico002.

**Five Stones and DV360 (confidence 80%, measured; the DV360 side is filtered on `hartm001` in IO or line item name).** Five Stones bills DV360 per DV360 campaign per month, ex GST, Exclusive:

| hartm001 | Five Stones bill | DV360 AMOUNT_SPENT | Share | DV360 media cost | Share |
|---|---|---|---|---|---|
| Aug display | 3,855.86 | 5,281.80 | 73.0% | 4,062.92 | 94.9% |
| Aug YouTube | 11,334.95 | 15,752.13 | 72.0% | 12,117.02 | 93.5% |
| Sep display | 6,320.63 | 8,579.94 | 73.7% | 6,599.95 | 95.8% |
| Sep YouTube | 11,566.15 | 16,073.43 | 72.0% | 12,364.18 | 93.5% |

If the Five Stones bill is what we pay for DV360, `AMOUNT_SPENT` overstates our DV360 cost by about 26 to 28%, and the report understates DV360 margin by that much. The code follows Luke's 27 Oct decision (AMOUNT_SPENT) and is unchanged; this is question 1.

### 7. Proposed design (not built)

1. New read-only table or view `ap_bill_line_costs` (Postgres): one row per bill line with an amount, from `xero_ap_bills.line_items_json`: bill id, supplier contact, issue month, line index, description, ex GST amount (by `LineAmountTypes`), tracking options, parsed `OP…` / `PL…` ids, parsed MBA candidates, parsed week date. DELETED and VOIDED bills out.
2. Channel Factory: `PL…` to plan line from the CF partner file (a small Snowflake view `VW_CF_PLACEMENT_LINE_MAP`: distinct `PL`, `OP`, plan line code, first and last day), copied to Postgres nightly or read at report time. Cost month = bill issue month. Unmapped placements listed as unmatched, never dropped.
3. Advertising Associates: match bill to MBA (number, then description, then tracking), then bill line to plan line by media owner alias to the line's publisher within that MBA, month from the week date or else the issue month. A line matches only when exactly one fixed-cost line of that MBA and publisher fits. Anything else goes to a manual match queue (new `ap_bill_line_matches` table: bill line key, plan line id, month, amount, matched by, matched at), the same pattern as `xero_invoice_matches`.
4. Fixed cost margin: for CF and `billingagency = advertising associates` lines, actual = matched bill cost for the month, source "Xero bill". Lines with no matched bill keep "No cost yet (Xero bill not matched)". CF margin shown over the line's life as well as by month.
5. Status: show the bill status (DRAFT, SUBMITTED, AUTHORISED, PAID) next to the cost so unapproved bills are visible.

Effort: CF is small and exact. AA needs the alias list and a match queue; a large part will be manual at first.

### Questions for Luke

1. DV360: Five Stones bills hartm001 DV360 at about 72 to 74% of DV360 `AMOUNT_SPENT` (and about 94 to 96% of DV360 media cost) in Aug and Sep. Is the Five Stones bill our real DV360 cost? If yes, should DV360 cost come from Five Stones bills instead of `AMOUNT_SPENT`?
2. Channel Factory: CF bills on delivery each month, while we bill the plan split, so monthly margin swings (penfold016pv1 Aug -689.54, Sep +689.52) but nets to about 0. Do you want CF margin shown by month from the bills, or only over the whole line (cost = billed by definition, bills used as a check)?
3. CF "7.5%" fee bill lines (Molicare, Boss Agriculture, Golf Australia) are not on any plan line. Are they a cost of a fixed-cost line, an ad serving or fee cost, or out of scope?
4. Advertising Associates: is AA the billing agent for every `billingagency = advertising associates` publisher, so their bills are the only cost source for News Corp, Nova, Nine, CarSales, REA, Apartments.com.au, Broadsheet and Golf Digest? Is AA's bill the publisher's net cost, or does AA add commission or a fee we should split out?
5. Can AA be asked to put the MBA and the AV line id (for example PENFOLD016DD4) in the bill Reference or each line description? Today 11 of 36 FY27 AA bills have no MBA and none has a line id.
6. Production, talent, installation and "hot read" lines on AA bills: media cost of the line, or separate (not in this report)?
7. Bill month: use the bill issue month, the week date on the bill line, or spread over the line's months? (An AA bill dated 30 Sep carries Jul, Aug and Sep weeks.)
8. Broadsheet billed us directly once in FY27 (19,400, Jul) and through AA (19,250, Aug). Are some direct publishers billed both ways? Which wins if both exist?
9. Golf Digest (golf025 DD11, DD14, DD15, NP6 and PGAAUS015 DD17, DD19): no FY27 bill names Golf Digest. Who bills Golf Digest, and has it been billed yet?
10. Should bills in DRAFT or SUBMITTED status count as cost, or only AUTHORISED and PAID?
11. Supplier credit notes (`ACCPAYCREDIT`) are not ingested today. Do suppliers send credit notes for under-delivery? If so, the ingest needs a small change before bill costs are trusted.
