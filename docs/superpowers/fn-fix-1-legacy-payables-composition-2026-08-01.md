# FN-FIX-1 — Legacy payables composition (from code)

Status: match-or-decide for Luke  
Source: live code on `localhost` working tree (not memory)

## What legacy hub payables counted

| Axis | Code | Behaviour |
|------|------|-----------|
| **Basis** | `lib/finance/derivePayableRecords.ts` | Delivery schedule only (`computeCampaignFinancialsFromVersion` → `deliverySchedule`). Never billingSchedule. |
| **Media** | `payablesFromDeliveryMonth` in `scheduleMonthFinanceExtract.ts` | Per-line media amounts from `month.lineItems`; **skips `production` mediaKey**; keeps client-pays rows for UI but **agency total excludes** `clientPaysForMedia`. |
| **Fee** | Month header `feeTotal` via `serviceAmountsFromBillingMonth` / hub panel paths | Assembled fee is month-level on the schedule blob — not always exploded to line fee components. |
| **Adserving** | Month header `adservingTechFees` | Campaign-level service amount on the month row. |
| **Production** | Month header `production`; line mediaKey `production` skipped in payables extract | Production is **not** in payable media lines; may appear as month service. |
| **Version pool** | `lib/finance/relevantPlanVersions.ts` | Masters + **all versions**, then `selectRelevantVersionsForMonth` / `buildMbaToLatestVersionMap` — **latest overlapping version per MBA for the calendar month**, not necessarily `published_version_id`. |
| **Campaign statuses** | `filterPlanVersionsByIncludeDrafts` when `include_drafts=0` | Hub UI default: **booked \| approved \| completed** only (`filterBillingRecords.ts:86–95`). `PAYABLE_STATUSES` (`expected\|invoiced\|paid`) is finance-record status, not campaign_status. Full scoping: `fs2-payables-status-scoping-2026-08-01.md`. |

## What sections Costs / summary payables count

| Axis | Code | Behaviour |
|------|------|-----------|
| **Basis** | `summaryQuery` / `costsQuery` | Postgres `schedule_months` `basis='delivery'`, components `media`+`fee`+`adserving`. |
| **Version pool** | published tip | `media_plan_masters.published_version_id` only. |
| **Client-pays** | dual-shape join + gate | Exclude media when `line_items.client_pays_for_media`; fee/adserving always. |
| **`__service__*`** | FN-FIX-1 | Explicit **campaign-level (no line detail)** bucket; never publisher/channel/buyType. |
| **Production component** | Not in `component IN (...)` list | `production` component rows on `schedule_months` are **outside** current sections payables sum (media/fee/adserving only). |

## Match-or-decide (Luke)

| # | Divergence risk | Decision needed |
|---|-----------------|-----------------|
| D1 | Legacy version pool = latest overlapping version; sections = **published tip** | Confirm published tip is the intended payables authority (recommended: yes). |
| D2 | Legacy payable **media lines skip production**; sections omit `component='production'` | Confirm production stays out of Costs booked cost (or add component). |
| D3 | Legacy fee/adserving often month-header; sections use exploded `__service__*` / fee rows | Accept campaign-level bucket + `coverage.lineDetailPct` as the honesty signal. |
| D4 | Legacy status filter `expected|invoiced|paid`; sections Costs is schedule-vs-AP, not status-filtered | Confirm Costs does not inherit payable status filters (recommended: schedule booked vs Xero AP). |

Until D1–D4 are signed, Costs banner remains: **Payables under reconciliation — do not use for month-end.**
