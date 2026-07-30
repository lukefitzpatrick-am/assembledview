# Module: Finance & Billing

Admin-only finance hub (`/finance`, 7 tabs: overview, billing, payables, accrual, forecast, report, queue) that **derives** its rows live from media plan schedule JSON. Xano is the only finance datastore — Snowflake is not involved. Amounts come from `media_plan_versions.billingSchedule`/`deliverySchedule`; only status (billed/notes/invoice) is overlaid from persisted `finance_billing_records`.

## The fee engine — the seam that matters most

- **`lib/finance/computeCampaignFinancials.ts` is the shared planning+finance engine** — it merely lives under `lib/finance/`. Both mega-pages import it; `recomputeBillingScheduleOnSave` gates every schedule PATCH with it ($0.01 equality → 409 `BILLING_SCHEDULE_DIVERGENCE`).
- It composes the canonical primitives from the planning domain: `computeBurstAmounts` (fee math — see INVARIANTS), `computeBillingAndDeliveryMonths`, `prorateAcrossMonths`, `deliverableBudget`.
- **Plan-C S1-P1b:** server-generated `billingSchedule` / `deliverySchedule` attach `month.lineItems` via `attachScheduleLineDetail` (id = stable line id, `monthlyAmounts` + `feeMonthlyAmounts` from resolved lines / `prorateBurstFeesToMonths`). Header ↔ lineItems sum invariant (±$0.01); assert throws when `PLANC_LINE_DETAIL_ASSERT=1`. `PLANC_SERVER_AUTHORITY=enforce` remains OFF — separate flip.
- Fee % resolution: `resolveFeePctFromFeeLoading` → `FEE_FIELD_BY_MEDIA` (client `fee*` columns per channel). production→0; influencers→`feecontentcreator` fallback; integration→no fallback. `normaliseScheduleMediaType` defaults unknown types to **search** (C-9).
- Ad serving + production are deliberately excluded from the save-time equality gate.
- Known divergent re-implementations: `generateBillingLineItems.ts:89` (C-7) and `computeDerivedCampaignFeeAmount` ($10 tolerance, C-8).

## Key files

- `app/finance/FinanceHubPageClient.tsx` + `lib/finance/useFinanceStore.ts` (Zustand, debounced fetch-all with signature dedupe).
- `lib/finance/composeFinanceHubRecords.ts` — shared derive → dedupe (`receivableMergeKey`) → month filter → status overlay pipeline; multi-month is byte-identical to concatenated single months.
- `lib/finance/derive{Receivable,Payable,ScopeSow,Retainer}Records.ts` — version/SOW/retainer → synthetic records. Record `total` = schedule month header ex-GST (`monthExGstFromScheduleEntry`), NOT re-derived from raw line items.
- `lib/finance/computeCampaignFinancialsFromVersion.ts` — hydrate path from persisted JSON; returns empty `deliveryVsBillingDelta`, no `reconciliation` — silent falsy defaults, not "unknown".
- `lib/finance/relevantPlanVersions.ts` — which version is authoritative per month (from `master.version_number` only; staged versions never relevant); 30s cache cleared only by the schedule PATCH route.
- `lib/finance/overlayFinanceStatus.ts` (`invoice_key`), `billedDrift.ts` (FNV-1a hash of billed line set → `billed_drift` flags on later edits), `computeAccrual.ts`.
- `lib/finance/forecast/` — `buildFinanceForecastDataset.ts` (1.1k lines; derived booked projection for an AU FY; full version-history crawl BY DESIGN — do not switch to the latest view), `mapping/definitions.ts` (field mappings, commission buckets, the `≤1 = decimal fraction` scale heuristic), snapshots (immutable, hashed, process-local duplicate guard), `varianceEngine` (snapshot A vs B) + `targetVsActual` (targets in `revenue_forecast_lines` vs `billed_amount`, hardcoded RAG bands).
- `lib/billing/` — `computeSchedule`, `buildBillingSchedule` (drops $0 lines — the reason `injectMissingFeeLinesFromMedia` exists for client-pays fee lines), `parsePersistedBillingScheduleToMonths` (legacy-shape inference), `seedLineFees`, `applyBillingLineMode` (billingMode auto/manual — see INVARIANTS), `exportBillingScheduleExcel`.
- `lib/generateBillingSchedulePDF.ts` — single consumer: `app/api/campaigns/[mba_number]/billing-schedule`.

## Write path (planning → finance)

Editor → `buildEditorLineItemInputs` → `PATCH /api/mediaplans/versions/[id]/billing-schedule` → fetch `billing_overrides` → recompute + validate (409s: `BILLING_OVERRIDE_SUM_VIOLATION`, `BILLING_SCHEDULE_DIVERGENCE`) → PATCH Xano version `{billingSchedule, inputs_hash, rebill_needed:false}` → clear relevantPlanVersions cache → audit diff to `finance_edits`.

## Consumed by

61 files import `lib/finance/*`: both mega-pages (edit page has ~25 finance/billing imports), `components/billing/*` (9), client hub billing + Excel export, dashboard chart reshapes, AVA client-brain tools, creative upload digest (via `lib/billing/scheduleHeaders`). All 19 media containers import `lib/billing/*`.

## Gotchas (verified)

- Two engines produce `CampaignFinancials` (line items vs persisted JSON) with silently different completeness. `mbaScopeFromSchedules` prefers the **delivery** schedule to avoid double client-pays subtraction — fragile, untested boundary.
- `receivableMergeKey`/`composeInvoiceKey` changes orphan persisted status rows (billed reappears as unbilled).
- Payment terms "Net 30" hardcoded ×4; GST 10% centralised in `lib/finance/gst.ts` (good).
- Synthetic client IDs from djb2 name-hash fallback (C-10); synthetic record ids are per-request counters — store updates can't address derived rows.
- Three caches (relevantPlanVersions 30s / forecast raw 30s / forecast dataset 20s) with no shared invalidation; snapshot duplicate guard is process-local.
- Saved views exist in BOTH localStorage (`hubSavedViews`) and Xano (`finance_saved_views`).
- Fee overrides are un-gated by construction; media overrides are gated — asymmetric.
- `FINANCE-HUB-STAGES-DISCOVERY.md` is historical — the tabs directory it describes no longer exists.
- Finance table reads (`finance_billing_records`, `finance_billing_line_items`, `finance_edits`, `finance_saved_views`, `billing_overrides`, `revenue_forecast_lines`, `revenue_line_catalog`, `scope_of_work`) go through `lib/data/readFinance.ts` + `DATA_BACKEND_FINANCE` / `DATA_BACKEND`. Writes (billing upserts, finance_edits POST, overrides replace/reset, forecast target upserts) stay on Xano. Shadow compare tags PG-deduped / Xano-duplicated extras as `duplicate-class` (EXPECTED) vs unexpected; `/api/admin/migration-diffs` surfaces the split (`financeDiffSplit`, `?probe=finance`).
- Postgres `finance_billing_records` stores `billed_amount_cents` + `billed_lines_hash` as real columns; API shape still exposes `billed_amount` (dollars). `finance_saved_views.user` → `user_id` rename is honourred on read/ETL. Dual `invoice_key` schemes (`media:`/`sow:`/`retainer:`/`xero:`) port verbatim.
