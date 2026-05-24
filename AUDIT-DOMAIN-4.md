# Domain 4 — Finance & Billing Lifecycle (Stage 0 Discovery)

**Branch:** `domain-4-long-lived` (created from current HEAD; remote branch `domain-3b-long-lived` was not present locally at setup time).

**Scope:** Read-only discovery. No application code was modified except this file.

**Date:** 2026-05-24

---

## File Inventory

Files below matched one or more search terms: `billing` / `Billing`, `schedule` / `Schedule` (billing context: `billingSchedule`, `deliverySchedule`, `buildBillingSchedule`, `computeSchedule`, `BillingSchedule`, `scheduleHeaders`), `invoice` / `Invoice`, `finance` / `Finance`, `mp_fixedfee`, `mp_production`, `computeSchedule`, `billingMonth` / `billing_month`.

**`xero` / `Xero`:** No matches anywhere in the repository (see [Xero Export](#xero-export)).

### `app/`

- `app/api/campaigns/[mba_number]/billing-schedule/route.ts`
- `app/api/campaigns/[mba_number]/route.ts`
- `app/api/finance/accrual/route.ts`
- `app/api/finance/billing/[id]/route.ts`
- `app/api/finance/billing/line-items/[id]/route.ts`
- `app/api/finance/billing/line-items/route.ts`
- `app/api/finance/billing/route.ts`
- `app/api/finance/data/route.ts`
- `app/api/finance/edits/publish/route.ts`
- `app/api/finance/edits/route.ts`
- `app/api/finance/forecast/route.ts`
- `app/api/finance/forecast/snapshots/[id]/lines/route.ts`
- `app/api/finance/forecast/snapshots/route.ts`
- `app/api/finance/forecast/snapshots/variance/route.ts`
- `app/api/finance/hub-schedule-ytd/route.ts`
- `app/api/finance/payables/route.ts`
- `app/api/finance/publishers/route.ts`
- `app/api/finance/receivables/aa-media-plan/route.ts`
- `app/api/finance/saved-views/route.ts`
- `app/api/finance/sow/route.ts`
- `app/api/mba/generate/route.ts`
- `app/api/mediaplans/[id]/route.ts`
- `app/api/mediaplans/mba/[mba_number]/route.ts`
- `app/api/mediaplans/route.ts`
- `app/api/mediaplans/versions/[id]/billing-schedule/route.ts`
- `app/api/scopes-of-work/[id]/route.ts`
- `app/api/scopes-of-work/route.ts`
- `app/dashboard/[slug]/[mba_number]/components/CampaignActions.tsx`
- `app/dashboard/[slug]/[mba_number]/components/CampaignDetailContent.tsx`
- `app/dashboard/[slug]/[mba_number]/components/CampaignPageAssembly.tsx`
- `app/dashboard/[slug]/[mba_number]/page.tsx`
- `app/finance/FinanceHubPageClient.tsx`
- `app/finance/forecast/snapshots/variance/FinanceForecastVariancePageClient.tsx`
- `app/finance/forecast/snapshots/variance/page.tsx`
- `app/finance/page.tsx`
- `app/mediaplans/[id]/edit/page.tsx`
- `app/mediaplans/[id]/page.tsx`
- `app/mediaplans/create/page.tsx`
- `app/mediaplans/mba/[mba_number]/edit/page.tsx`
- `app/mediaplans/page.tsx`
- `app/publishers/[publisherId]/PublisherDetailClient.tsx`
- `app/publishers/PublishersPageClient.tsx`
- `app/scopes-of-work/[id]/edit/page.tsx`
- `app/scopes-of-work/create/page.tsx`

### `components/`

- `components/AddClientForm.tsx`
- `components/AddPublisherForm.tsx`
- `components/AppSidebar.tsx`
- `components/billing/AlterBillingDialog.tsx`
- `components/billing/BillingSchedule.tsx`
- `components/billing/EditableLineItemMonthInput.tsx`
- `components/client-hub/ClientFinanceExcelExportDialog.tsx`
- `components/client-hub/UpcomingBillingSection.tsx`
- `components/dashboard/campaign/CampaignSummaryRow.tsx`
- `components/dashboard/DashboardOverview.tsx`
- `components/dashboard/HeroBanner.tsx`
- `components/dashboard/modals/ClientFinanceSlideOver.tsx`
- `components/dashboard/templates.ts`
- `components/EditClientForm.tsx`
- `components/EditPublisherForm.tsx`
- `components/finance/EditableFinanceGrid.tsx`
- `components/finance/FinanceFilterToolbar.tsx`
- `components/finance/hub/FinanceHubPayablesSection.tsx`
- `components/finance/hub/panels/FinanceAccrualPanel.tsx`
- `components/finance/hub/panels/FinanceForecastPanel.tsx`
- `components/finance/hub/panels/FinanceOverviewPanel.tsx`
- `components/finance/hub/panels/FinancePayablesPanel.tsx`
- `components/finance/hub/panels/FinanceReceivablesPanel.tsx`
- `components/finance/InlineEditCell.tsx`
- `components/finance/PayablesDeliveryLinesTable.tsx`
- `components/finance/tabs/AccrualTab.tsx`
- `components/finance/tabs/ForecastTab.tsx`
- `components/finance/tabs/OverviewTab.tsx`
- `components/finance/tabs/PayablesTab.tsx`
- `components/finance/tabs/ReceivablesTab.tsx`
- `components/finance/usePayablesHideClientPaid.ts`
- `components/layout/panel.examples.tsx`
- `components/media-containers/*` — many channel containers and expert grids (billing bursts, `client_pays_for_media`, `ExpertGridBillingHeaderLabel.tsx`, etc.)
- `components/mediaplans/FloatingSectionNav.tsx`
- `components/pacing/PacingMappingsPageClient.tsx`

### `lib/`

- `lib/api.ts`
- `lib/api/dashboard/client.ts`
- `lib/api/dashboard/finance.ts`
- `lib/api/dashboard/global.ts`
- `lib/api/dashboard/publisher.ts`
- `lib/api/dashboard/shared.ts`
- `lib/api/dashboard.ts`
- `lib/billing.ts`
- `lib/billing/buildBillingSchedule.ts`
- `lib/billing/computeSchedule.ts`
- `lib/billing/exportBillingScheduleExcel.ts`
- `lib/billing/generateBillingLineItems.ts`
- `lib/billing/mediaTypeHeaders.ts`
- `lib/billing/parsePersistedBillingScheduleToMonths.ts`
- `lib/billing/prepareBillingMonthsForLineItemExport.ts`
- `lib/billing/resetFromAutoReference.ts`
- `lib/billing/scheduleHeaders.ts`
- `lib/billing/syncLineItemAmountAcrossMonthRows.ts`
- `lib/billing/types.ts`
- `lib/finance/*` — accrual, API client, derive* records, export, forecast, filters, hub Excel, payables, xanoFinanceApi, useFinanceStore, etc.
- `lib/generateBillingSchedulePDF.ts`
- `lib/generateMBA.ts`
- `lib/generateMediaPlan.ts`
- `lib/generateScopeOfWork.ts`
- `lib/mediaplan/advertisingAssociatesExcel.ts`
- `lib/mediaplan/burstAmounts.ts`
- `lib/mediaplan/partialMba.ts`
- `lib/openai.ts`
- `lib/rbac.ts`
- `lib/spend/billingScheduleExpectedToDate.ts`
- `lib/spend/expectedSpend.ts`
- `lib/spend/monthlyPlanCalendar.ts`
- `lib/spend/resolveCampaignExpectedSpend.ts`
- `lib/types/dashboard.ts`
- `lib/types/financeBilling.ts`
- `lib/types/financeForecast.ts`
- `lib/types/financeForecastVariance.ts`
- `lib/types/financePublisherGroup.ts`
- `lib/types/mediaPlan.ts`
- `lib/types/publisher.ts`
- `lib/validations/client.ts`
- `lib/validations/publisher.ts`
- `lib/xano/ava.ts`

### `types/`

- `types/billing.ts`

### `tests/`

- `tests/finance/buildFinanceForecastDataset.test.ts`
- `tests/finance/fixtures/realisticMediaPlanVersion.ts`
- `tests/finance/varianceEngine.test.ts`
- `tests/lib/advertisingAssociatesExcel.test.ts`
- `tests/lib/expertModeSwitch.test.ts`
- `tests/lib/upcomingBillingAggregate.test.ts`
- `lib/finance/__tests__/filterBillingRecords.test.ts`

### `scripts/`

- `scripts/backfill-delivery-schedule-client-paid.ts`

### `docs/` and repo-root audits

- `AUDIT.md`
- `CLIENT_PAYS_FOR_MEDIA_AUDIT.md`
- `docs/finance-forecast-snapshots-xano.md`
- `XANO_SCRIPT_REFERENCE.md`
- `VERIFICATION_REPORT_mp_client_name.md`
- `STAGE-1A-PR.md`, `STAGE-1A-SMOKE.md`
- `README.md`
- `package.json`
- `src/data/learning/terms.json`

---

## Data Model

### Xano tables (from in-repo references only)

Full Xano DDL for billing is **not** checked into this repository. Below is what the codebase explicitly references.

#### `media_plan_versions` (primary billing persistence for campaigns)

Documented POST input in `XANO_SCRIPT_REFERENCE.md` (excerpt — not guaranteed complete vs production Xano):

```xano
input {
  media_plan_master_id: integer
  version_number: integer
  mba_number: string
  campaign_name: string
  campaign_status: string
  campaign_start_date: datetime
  campaign_end_date: datetime
  brand: string
  client_name: string          // maps to mp_client_name in DB
  client_contact: string
  po_number: string
  mp_campaignbudget: number
  fixed_fee: boolean
  mp_television: boolean
  // ... mp_* channel booleans ...
  billingSchedule: json
  created_at: integer
}
```

**Additional fields used by the app but not in that script snippet:**

| Field | Usage in app |
|--------|----------------|
| `billingSchedule` / `billing_schedule` | JSON array of month objects (see `buildBillingScheduleJSON`) — **authoritative saved billing** |
| `deliverySchedule` / `delivery_schedule` | Parallel JSON for delivery/pacing/payables derivation |
| `mp_production` | Boolean — production section / line items |
| `fixed_fee` | Boolean — fixed-fee billing (`mp_fixedfee` in UI) |
| `mp_client_name` | Client name on version row |

**Relationships:** `media_plan_master_id` → `media_plan_master`; channel line items live in separate `media_plan_*` tables keyed by MBA/version (fetched per media type on edit).

**`billingSchedule` JSON shape (in-app):** Built by `lib/billing/buildBillingSchedule.ts` → array of `{ monthYear, feeTotal, adservingTechFees, production, mediaTypes: [{ mediaType, lineItems: [{ lineItemId, header1, header2, amount, clientPaysForMedia? }] }] }`.

#### Per-channel line item tables (`media_plan_*`)

Example from `app/api/media_plans/television/route.ts`:

```ts
client_pays_for_media: boolean;
```

Same pattern appears on other `app/api/media_plans/*/route.ts` handlers. This is the **source** flag for client-paid media at line-item level (UI: `clientPaysForMedia`).

#### `finance_billing_records` / `finance_billing_line_items` / `finance_edits`

Paths in `lib/finance/xanoFinanceApi.ts`:

- `finance_billing_records`
- `finance_billing_line_items`
- `finance_edits`
- `finance_edits/publish`
- `finance_saved_views`

**Important:** `GET /api/finance/billing` comment states receivables are **derived live** from `media_plan_versions.billingSchedule` and do **not** read/write `finance_billing_records` for the hub rebuild. PATCH on `finance_billing_records/{id}` still exists for legacy/grid edits.

TypeScript view of persisted finance rows (`lib/types/financeBilling.ts`):

```ts
export type BillingType = "media" | "sow" | "retainer" | "payable"

export type BillingStatus =
  | "draft" | "booked" | "approved" | "invoiced" | "paid"
  | "cancelled" | "expected" | "disputed"

export interface BillingLineItem {
  id: number
  finance_billing_records_id: number
  item_code: string
  line_type: "media" | "service" | "fee" | "retainer"
  media_type: string | null
  description: string | null
  publisher_name: string | null
  amount: number
  client_pays_media: boolean
  sort_order: number
  // optional enrichment: network, platform, placement, ...
}

export interface BillingRecord {
  id: number
  billing_type: BillingType
  clients_id: number
  client_name: string
  mba_number: string | null
  media_plan_version_id?: number | null
  media_plan_version_number?: number | null
  campaign_name: string | null
  po_number: string | null
  billing_month: string
  invoice_date: string | null
  payment_days: number
  payment_terms: string
  status: BillingStatus
  line_items: BillingLineItem[]
  total: number
  has_pending_edits: boolean
  source_billing_schedule_id: number | null
  finance_accrual?: FinanceAccrualBreakdown | null
}

export interface BillingEdit {
  id: number
  finance_billing_records_id: number
  finance_billing_line_items_id: number | null
  edit_type: "field_change" | "amount_change" | "status_change" | "line_add" | "line_remove"
  field_name: string
  old_value: string | null
  new_value: string | null
  edit_status: "draft" | "published" | "reverted"
  edited_by: number
  edited_by_name: string
  published_at: string | null
  created_at: string
}
```

#### `scope_of_work`

Referenced by `deriveScopeSowReceivables` / finance SOW routes (billing_month on synthetic records). Schema not pasted here — not fully defined in TS beyond finance derivation helpers.

#### `clients`

`monthlyretainer` used for synthetic retainer receivable rows (`deriveRetainerBillingRecordsForMonth`).

---

### TypeScript types — campaign billing (media plan editor)

**`lib/billing/types.ts`** — canonical editor/month grid types:

```ts
export type BillingBurst = {
  startDate: Date
  endDate: Date
  mediaAmount: number
  deliveryMediaAmount?: number
  feeAmount: number
  totalAmount: number
  mediaType: string
  noAdserving: boolean
  feePercentage: number
  clientPaysForMedia: boolean
  budgetIncludesFees: boolean
  deliverables: number
  buyType: 'cpm' | 'cpc' | 'cpv' | 'fixed cost' | 'package' | 'insertion' | string
}

export type BillingLineItem = {
  id: string
  header1: string
  header2: string
  monthlyAmounts: Record<string, number>
  totalAmount: number
  clientPaysForMedia?: boolean
  preBill?: boolean
  preBillSnapshot?: Record<string, number>
  feeMonthlyAmounts?: Record<string, number>
  totalFeeAmount?: number
  adServingMonthlyAmounts?: Record<string, number>
  totalAdServingAmount?: number
  legacySaved?: boolean
}

export type BillingMonth = {
  monthYear: string
  mediaTotal: string
  feeTotal: string
  totalAmount: string
  adservingTechFees: string
  production: string
  mediaCosts: { /* per-channel string amounts */ production: string }
  lineItems?: { /* per-channel BillingLineItem[] */ }
}
```

**`types/billing.ts`** — older/alternate shape (daily overrides, `isManual` on schedule):

```ts
export interface BillingSchedule {
  months: BillingMonth[]
  overrides: BillingOverride[]
  isManual: boolean
  campaignId: string
}
```

Used by legacy `components/billing/BillingSchedule.tsx` and `app/mediaplans/[id]/edit/page.tsx`.

**`lib/api.ts` — `MediaPlanVersion`:**

```ts
interface MediaPlanVersion {
  // ... campaign + mp_* booleans ...
  fixed_fee: boolean
  mp_production?: boolean
  billingSchedule?: any
  deliverySchedule?: any
}
```

---

### Auto-computed vs manually overridden

| Layer | Mechanism |
|--------|-----------|
| **Campaign `billingSchedule` JSON** | No DB column `is_manual` on schedule rows. Override is **implicit**: saved JSON differs from burst-derived `autoReferenceBillingMonths`. MBA edit sets `isManualBilling: true` whenever persisted schedule hydrates. |
| **MBA edit UI** | `savedBillingMonths` (persisted baseline), `workingBillingMonths` (live), `autoReferenceBillingMonths` (burst reference), `manualBillingMonths` (Edit Billing modal draft). `billingLineItemsFollowAutoRef` tracks “follow auto” after full reset. |
| **Legacy `types/billing.ts`** | `BillingSchedule.isManual`, per-day `isOverridden` / `manualMediaAmount` — used by old `BillingSchedule` component, not MBA create path. |
| **`finance_billing_records`** | `has_pending_edits` on `BillingRecord`; draft edits in `finance_edits` until publish. Distinct from campaign schedule JSON. |
| **Line item helpers** | `preBill` / `preBillSnapshot` on `BillingLineItem` (UI-only distribution). `legacySaved` on line items for orphan rows. |

**Conclusion:** There is **no single persisted flag** on `media_plan_versions` that marks the whole schedule as manual; persistence is the JSON itself plus edit-page React state flags.

---

### `client_pays_own_media` / client pays for media

| Location | Field | Type |
|----------|--------|------|
| Media plan line items (Xano / API) | `client_pays_for_media` | `boolean` |
| Editor state / bursts | `clientPaysForMedia` | `boolean` |
| Billing schedule JSON line items | `clientPaysForMedia` | optional on serialized line items |
| Delivery schedule JSON | `clientPaysForMedia` / `client_pays_for_media` | optional (`lib/types/mediaPlan.ts` `DeliveryScheduleLineItem`) |
| Finance hub synthetic/payable rows | `client_pays_media` on `BillingLineItem` | `boolean` |

**Behaviour when true (documented in `CLIENT_PAYS_FOR_MEDIA_AUDIT.md`):**

- `lib/mediaplan/burstAmounts.ts` sets burst **`mediaAmount` to 0** for billing.
- **`deliveryMediaAmount`** (or fallback `mediaAmount`) keeps delivery/pacing non-zero.
- Billing line-item generation uses **0** effective media in `mode === "billing"`; delivery mode still allocates `netMedia`.
- Does **not** skip billing row creation — creates **zero media** billing with fees/adserving as applicable.

There is **no** campaign-level `client_pays_own_media` field found; the flag is **per line item**.

---

## Create Page Billing Flow

**Route:** `app/mediaplans/create/page.tsx`

### Entry point

User save: **`handleSaveAll`** → **`handleSaveMediaPlan`** (master) → **`handleSaveMediaPlanVersion(masterId)`**.

```ts
const handleSaveAll = async () => { /* ... */ newMediaPlanId = await handleSaveMediaPlan(); await handleSaveMediaPlanVersion(newMediaPlanId); /* redirect */ }

const handleSaveMediaPlanVersion = async (masterId: number) => { /* builds billing JSON, calls createMediaPlanVersion */ }
```

### Schedule computation

| Function | Role |
|----------|------|
| `computeBillingAndDeliveryMonths` | `lib/billing/computeSchedule.ts` — month rows from bursts + campaign dates |
| `calculateBillingSchedule` (useCallback) | Wires bursts state into `computeBillingAndDeliveryMonths`; updates `autoBillingMonths`, `billingMonths` when not manual |
| `generateBillingLineItems` | `lib/billing/generateBillingLineItems.ts` — per-line monthly amounts |
| `attachLineItemsToMonths` | Inline in save handler — merges line items into months |
| `buildBillingScheduleJSON` | `lib/billing/buildBillingSchedule.ts` — compact JSON for Xano |
| `appendPartialApprovalToBillingSchedule` | `lib/mediaplan/partialMba.ts` when partial MBA |

On save with campaign dates, save path **re-runs** `computeBillingAndDeliveryMonths` unless manual months are selected (`hasManualBillingMonths`).

### Persistence

**API:** `createMediaPlanVersion(payload)` in `lib/api.ts` → POST to Xano `media_plan_versions`.

**Payload fields (billing-related excerpt):**

```ts
const payload = {
  // ... master/version metadata, mp_* flags, fixed_fee, mp_production ...
  billingSchedule: billingScheduleJSON,
  deliverySchedule: deliveryScheduleJSON,
  delivery_schedule: deliveryScheduleJSON,
}
const version = await createMediaPlanVersion(payload)
```

**Table:** `media_plan_versions.billingSchedule` (JSON) and `deliverySchedule` / `delivery_schedule`.

### Client pays for media on create

Does not skip schedule creation. Bursts get `mediaAmount: 0` via burst pipeline (`burstAmounts.ts`); delivery months retain media via `deliveryMediaAmount`. Line items carry `clientPaysForMedia` in JSON when true (`buildBillingSchedule.ts`).

---

## Edit Page Billing Rehydration

Two edit implementations exist:

| Path | File | Notes |
|------|------|--------|
| **MBA (primary)** | `app/mediaplans/mba/[mba_number]/edit/page.tsx` | Full billing model (saved/working/auto/manual) |
| **Legacy ID** | `app/mediaplans/[id]/edit/page.tsx` | Simpler `BillingSchedule` component; billing calc “removed to prevent infinite loops” on load |

Below focuses on **MBA edit** unless noted.

### Load — where billing comes from

**API:** `GET /api/mediaplans/mba/${mbaNumber}?skipLineItems=true&billingScheduleFull=1&version=...`

Inside `fetchMediaPlan` (useEffect):

```ts
const rawBillingSchedule =
  data.billingSchedule ??
  data.billing_schedule ??
  data.versionData?.billingSchedule ??
  data.versionData?.billing_schedule

const billingHydrated = parseSavedBillingSchedulePayload(rawBillingSchedule, { searchFee, socialFee })
if (billingHydrated) {
  setSavedBillingMonths(deepSaved)
  setWorkingBillingMonths(deepWorking)
  setIsManualBilling(true)
  setHasPersistedBillingSchedule(true)
}
```

Parser: `parseSavedBillingSchedulePayload` in same file (uses `normalizeBillingScheduleToArray` / `lib/billing/parsePersistedBillingScheduleToMonths.ts` patterns).

**State variables:** `savedBillingMonths`, `workingBillingMonths`, `autoReferenceBillingMonths`, `manualBillingMonths`, `hasPersistedBillingSchedule`.

### Recompute timing

| When | Behaviour |
|------|-----------|
| **On load** | Hydrates from API; does **not** replace working with auto on successful hydrate |
| **On change (bursts, dates, line items)** | `calculateBillingSchedule` updates **`autoReferenceBillingMonths` only** (not working), unless `billingLineItemsFollowAutoRef` + not manual |
| **Append effect** (debounced 250ms) | Merges new months/line ids from auto into **`workingBillingMonths`** (append-only); optional full resync when follow-auto |
| **Edit Billing modal** | Edits `manualBillingMonths`; **`handleManualBillingSave`** copies to `workingBillingMonths` |
| **On save** | `buildBillingScheduleForSave()` from `workingBillingMonths` → PATCH/POST version with new `billingSchedule` |

### Compared to stored result?

**Yes, on save (and modal save)** via `validateBillingBeforeSave`:

- Compares working/manual line totals to **`generateBillingLineItems`** (burst-derived expected).
- Produces **`preservedManualOverrides`** (warnings, non-blocking on campaign save for drift) and **`blockingErrors`** (orphan stable ids, structural issues).
- Does **not** auto-revert working to auto on mismatch.

### Line item investment change

- Container edits update bursts → `calculateBillingSchedule` refreshes **auto reference**.
- **Working rows are not wholesale-replaced** unless user chose “follow auto” after reset or append logic adds new ids only.
- Existing line amounts stay until user edits billing UI or resets.

### New line item added

- Append effect adds new line ids/months from auto template into `workingBillingMonths` when `autoReferenceBillingMonths` is populated and media type has loaded line items.
- If auto ref empty (e.g. line items still loading), append is skipped (debug log).
- Not a full automatic rebalance of all rows.

### Key handlers (signatures)

```ts
const calculateBillingSchedule = useCallback((
  startOverride?: Date | string | null,
  endOverride?: Date | string | null
) => { /* computeBillingAndDeliveryMonths → setAutoReferenceBillingMonths */ }, [...])

const validateBillingBeforeSave = useCallback(
  (months: BillingMonth[], options?: { feeCheck?: boolean }): BillingSaveValidationResult => { /* compare to generateBillingLineItems */ },
  [...]
)

function handleManualBillingSave(forceIgnoreMismatch?: boolean) { /* validate → setWorkingBillingMonths */ }

const handleSaveAll = async () => { /* validateBillingBeforeSave(working) → PATCH master → save version with billingSchedule */ }
```

---

## Manual Override Model

### Campaign editor (create + MBA edit)

| UI | File | What user can edit |
|----|------|---------------------|
| **Manual Billing** modal (create) | `app/mediaplans/create/page.tsx` | Month aggregates, line-item month cells (`EditableLineItemMonthInput`), pre-bill toggles |
| **Edit Billing** modal (MBA edit) | Same page, `isManualBillingModalOpen` | `manualBillingMonths` — full month/line grid |
| **Reset billing to auto** | MBA edit + `lib/billing/resetFromAutoReference.ts` | Replaces working from `autoReferenceBillingMonths` |
| **Per-line reset** | MBA edit Edit Billing UI | Resync single line from auto template |
| **Legacy component** | `components/billing/BillingSchedule.tsx` | Month-level search/social/production/fee amounts; `isManualBilling` local state |

**Persistence:** Overrides live in **`media_plan_versions.billingSchedule` JSON** after save. No `manually_overridden` column.

**After line item investment changes:** Overrides preserved in working until user resets or append adds new keys; save validation may **warn** via `preservedManualOverrides` but allows save.

### Finance hub

| UI | File | Persistence |
|----|------|-------------|
| **`AlterBillingDialog`** | `components/billing/AlterBillingDialog.tsx` | PATCH `/api/mediaplans/versions/{id}/billing-schedule` with `{ billingSchedule }` |
| **`EditableFinanceGrid`** | `components/finance/EditableFinanceGrid.tsx` | Cell edits → `finance_edits` draft → publish; PATCH `finance_billing_records` / line items for some flows |
| **`ReceivablesTab` / `PayablesTab` / `AccrualTab`** | `components/finance/tabs/*.tsx` | Grid edits via `lib/finance/api.ts` |

**`AlterBillingDialog` save handler (hub):** Recalculates months from line items, `buildBillingScheduleJSON`, PATCH version — **direct schedule JSON write**, not `finance_edits`.

**Finance grid:** `has_pending_edits` + `finance_edits` table — distinguishes draft metadata edits from derived receivables view.

---

## Finance Pages

### Routes

| Route | File | Purpose |
|-------|------|---------|
| `/finance` | `app/finance/page.tsx` → `FinanceHubPageClient.tsx` | Main finance hub (tabs) |
| `/finance/forecast/snapshots/variance` | `app/finance/forecast/snapshots/variance/page.tsx` | Forecast snapshot variance |

### Hub tabs (panels)

| Tab | Panel component | Shows | Mutations |
|-----|-----------------|-------|-----------|
| Overview | `FinanceOverviewPanel` | Summary / hero metrics | Read-focused |
| Billing (receivables) | `FinanceReceivablesPanel` → `ReceivablesTab` | Derived receivable records by month/client | Grid edit (status, PO, invoice date, etc.) via `EditableFinanceGrid`; exports |
| Payables | `FinancePayablesPanel` → `PayablesTab` / `FinanceHubPayablesSection` | Delivery-schedule-derived payables | Grid edits; hide client-paid toggle |
| Accrual | `FinanceAccrualPanel` → `AccrualTab` | Accrual reconciliation grid | Accrual reconcile edits |
| Forecast | `FinanceForecastPanel` → `ForecastTab` | FY forecast dataset | Snapshot capture (admin) |

**Top-level components per tab:** `FinanceFilterToolbar`, `EditableFinanceGrid`, `FinanceOverviewHero`, `PayablesDeliveryLinesTable`, `AlterBillingDialog` (hub billing section), export dropdowns.

**Xero:** None.

**Manual billing edits:** `AlterBillingDialog` on hub; `EditableFinanceGrid` on receivables/accrual/payables tabs; MBA/create editors for source schedule JSON.

**Exports (Excel/CSV):** `exportReceivablesWorkbook`, `exportPayablesWorkbook`, `exportFlatBillingWorkbook`, `exportBillingRecordsCsv`, `buildFinanceHubWorkbook`, Advertising Associates media plan download per MBA/month.

---

## Xero Export

**No code references** to `xero`, `Xero`, or XERO were found in the repository.

Exports observed are **Excel (.xlsx)** and **CSV** via ExcelJS / file-saver:

| Function | File | Format | Trigger |
|----------|------|--------|---------|
| `exportReceivablesWorkbook` | `lib/finance/exportFinanceHub.ts` | Excel | Finance hub export menu |
| `exportPayablesWorkbook` | `lib/finance/exportFinanceHub.ts` | Excel | Payables tab export |
| `exportBillingRecordsCsv` | `lib/finance/export.ts` | CSV | Hub / ReceivablesTab |
| `exportPayablesDetailCsv` | `lib/finance/export.ts` | CSV | Payables |
| `buildFinanceHubWorkbook` | `lib/finance/excelFinanceExport.ts` | Excel | “Finance report” download |
| `buildBillingScheduleExcelBlob` | `lib/billing/exportBillingScheduleExcel.ts` | Excel | Create/MBA edit download |
| `exportAccrualWorkbook` | `lib/finance/accrualExcel.ts` | Excel | Accrual tab |

**Data sources:**

- Hub receivables/payables: **derived** from `media_plan_versions.billingSchedule` / `deliverySchedule` via `/api/finance/billing`, `/api/finance/payables` (not live Xero API).
- Grid PATCH path: `finance_billing_records` (legacy/pending edits).
- Alter billing: writes **`billingSchedule`** on `media_plan_versions`.

**Representative export entry:**

```ts
export async function exportReceivablesWorkbook(
  records: BillingRecord[],
  monthLabel: string,
  fileStem: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  const media = records.filter((r) => r.billing_type === "media")
  // writeMediaFinanceWorksheet / writeSowFinanceWorksheet / writeRetainerFinanceWorksheet
  const buffer = await workbookToXlsxBuffer(workbook)
  saveAs(blob, `${fileStem}_${filenameMonthSegment(monthLabel)}.xlsx`)
}
```

If Xero import happens in operations, it is likely **manual upload** of these Excel/CSV files — not implemented in this codebase.

---

## Date Range Validation

**No out-of-bounds date validation found** that compares billing month rows to campaign `campaign_start_date` / `campaign_end_date` or line-item flight dates beyond:

- Month grid generation **inside** campaign start/end in `computeBillingAndDeliveryMonths` (only creates months between campaign dates).
- Burst distribution skips invalid burst date ranges (`isNaN` / `s > e`) in `lib/billing/computeSchedule.ts`.
- `validateBillingBeforeSave` / `collectBillingMonthStructuralBlockingIssues` — arithmetic and orphan line checks, **not** calendar bounds vs flights.
- `validateBillingOverrides` in `lib/billing.ts` — total amount tolerance vs original, **not** dates.

Explicit statement: **no `outOfRange`, `validateBilling` date-window, or billing-vs-flight comparison helper** was found in billing/finance paths searched.

---

## Open Questions for Claude

1. **Branch setup:** `domain-3b-long-lived` did not exist locally; `domain-4-long-lived` was created from current HEAD. Confirm intended base branch for downstream stages.

2. **Canonical edit page:** Should Domain 4 stages treat `app/mediaplans/mba/[mba_number]/edit/page.tsx` as the only edit surface, or is `app/mediaplans/[id]/edit/page.tsx` still routed in production?

3. **`finance_billing_records` vs derived receivables:** Hub billing tab uses derived rows; PATCH `finance_billing_records` and `finance_edits` still exist. What is the intended long-term source of truth for receivable **status/invoice date** — Xano finance tables or schedule JSON only?

4. **Xero:** No integration in repo — confirm whether “Xero export” in product language means the existing Excel receivables workbook or an undocumented external process.

5. **`isManualBilling` on hydrate:** MBA edit sets `isManualBilling: true` whenever any persisted `billingSchedule` loads, even if JSON matched auto — is that intentional for all campaigns?

6. **Full Xano schemas:** `finance_billing_records` / `finance_billing_line_items` column list is not in repo — needed from Xano for Stage 1 migrations.

7. **`client_pays_media` on derived receivables:** `derivePlanReceivableBillingRecordsForMonth` sets `client_pays_media: false` on synthetic lines — is client-paid media reflected in hub receivables totals?

8. **ReceivablesTab vs hub:** `ReceivablesTab` still calls `fetchBillingRecords` (may hit legacy data path) while hub overview uses `fetchFinanceBillingForMonths` — are both active?

9. **Partial MBA / fixed fee:** Interaction between `mp_fixedfee`, partial approval metadata in billing JSON, and validation — not fully traced in this pass.

10. **Date lock / super_admin:** `AUDIT.md` references future billing month locks tied to RBAC — not implemented in billing save paths discovered here; confirm Stage scope.
