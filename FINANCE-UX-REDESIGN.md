# Domain 5 — Finance Hub UX Redesign (Stage 0 Discovery)

**Branch:** `domain-5-finance-ux`  
**Date:** 2026-05-27  
**Mode:** Read-only discovery (this file only). No application code was modified.

**Related audit:** `AUDIT-DOMAIN-4.md` maps finance code for defect work. This document is UX/workflow delta — not a duplicate defect audit.

---

## Route Inventory

### Reused from `AUDIT-DOMAIN-4.md`

The following **page routes** and **hub tab → panel mapping** are documented in Domain 4 § Routes / Hub tabs. They remain accurate; this section adds UX-specific detail and corrections.

| Route | File | Tab / view | Top-level component |
|-------|------|------------|---------------------|
| `/finance` | `app/finance/page.tsx` → `FinanceHubPageClient.tsx` | All five hub tabs | `FinanceOverviewHero`, `Tabs`, `FinanceFilterToolbar`, dynamic panels |
| `/finance/forecast/snapshots/variance` | `app/finance/forecast/snapshots/variance/page.tsx` | Forecast snapshot variance (admin) | `AdminGuard` → `FinanceForecastVariancePageClient.tsx` |

**Correction vs Domain 4:** The **Client Billing** tab (`activeTab === "billing"`) does **not** render `FinanceReceivablesPanel` / `ReceivablesTab`. It renders inline `FinanceHubReceivablesSection` inside `FinanceHubPageClient.tsx` (card/collapsible UI). `FinanceReceivablesPanel.tsx` exists but is **unused** in the current hub wiring.

### `app/finance/**` (complete)

| File | Description |
|------|-------------|
| `app/finance/page.tsx` | Server wrapper with `Suspense`; renders `FinanceHubPageClient`. |
| `app/finance/FinanceHubPageClient.tsx` | Main hub shell: KPI hero, tab strip, saved views, export menu, shared filter bar, tab bodies. |
| `app/finance/forecast/snapshots/variance/page.tsx` | Admin-only variance report page for forecast snapshots. |
| `app/finance/forecast/snapshots/variance/FinanceForecastVariancePageClient.tsx` | Client UI for comparing two forecast snapshots. |

### `app/api/finance/**` (complete)

| Route | File | One-sentence purpose |
|-------|------|----------------------|
| `GET /api/finance/billing` | `app/api/finance/billing/route.ts` | Derives receivable `BillingRecord[]` for one `billing_month` from plan `billingSchedule`, scopes, retainers (not `finance_billing_records`). |
| `PATCH /api/finance/billing/[id]` | `app/api/finance/billing/[id]/route.ts` | PATCHes Xano `finance_billing_records/{id}` (legacy grid path). |
| `POST /api/finance/billing/line-items` | `app/api/finance/billing/line-items/route.ts` | Creates a `finance_billing_line_items` row. |
| `PATCH /api/finance/billing/line-items/[id]` | `app/api/finance/billing/line-items/[id]/route.ts` | Updates a billing line item. |
| `DELETE /api/finance/billing/line-items/[id]` | `app/api/finance/billing/line-items/[id]/route.ts` | Deletes a billing line item. |
| `GET /api/finance/payables` | `app/api/finance/payables/route.ts` | Derives payable records for one month from `deliverySchedule`. |
| `GET /api/finance/accrual` | `app/api/finance/accrual/route.ts` | Server accrual computation across months (403 for `client` role). |
| `GET /api/finance/edits` | `app/api/finance/edits/route.ts` | Lists `finance_edits` (optional filter by `finance_billing_records_id`). |
| `POST /api/finance/edits` | `app/api/finance/edits/route.ts` | Creates a finance edit row (including accrual reconcile). |
| `POST /api/finance/edits/publish` | `app/api/finance/edits/publish/route.ts` | Publishes draft edits via Xano `finance_edits/publish`. |
| `GET /api/finance/data` | `app/api/finance/data/route.ts` | Legacy/alternate month-scoped billing data aggregation (plan versions + schedules). |
| `GET /api/finance/hub-schedule-ytd` | `app/api/finance/hub-schedule-ytd/route.ts` | FYTD billing/delivery schedule totals for Overview KPIs. |
| `GET /api/finance/publishers` | `app/api/finance/publishers/route.ts` | Publisher list helper for finance filters/derivation. |
| `GET /api/finance/sow` | `app/api/finance/sow/route.ts` | Scope-of-work billing rows for finance. |
| `GET /api/finance/saved-views` | `app/api/finance/saved-views/route.ts` | Lists Xano `finance_saved_views` (not used by current hub Saved views UI). |
| `POST /api/finance/saved-views` | `app/api/finance/saved-views/route.ts` | Creates a Xano saved view (not used by current hub Saved views UI). |
| `GET /api/finance/receivables/aa-media-plan` | `app/api/finance/receivables/aa-media-plan/route.ts` | Downloads Advertising Associates media plan Excel for MBA + billing month. |
| `GET /api/finance/forecast` | `app/api/finance/forecast/route.ts` | Builds FY forecast dataset (`loadFinanceForecastDataset`); 403 for `client` role. |
| `GET/POST /api/finance/forecast/snapshots` | `app/api/finance/forecast/snapshots/route.ts` | List/create forecast snapshots (**admin only**). |
| `GET /api/finance/forecast/snapshots/[id]/lines` | `app/api/finance/forecast/snapshots/[id]/lines/route.ts` | Snapshot line rows (**admin only**). |
| `POST /api/finance/forecast/snapshots/variance` | `app/api/finance/forecast/snapshots/variance/route.ts` | Variance report between snapshots (**admin only**). |

### Finance-adjacent routes (outside `/finance`)

| Route | File | Relevance |
|-------|------|-----------|
| `PATCH /api/mediaplans/versions/[id]/billing-schedule` | `app/api/mediaplans/versions/[id]/billing-schedule/route.ts` | **Alter Billing** save from Client Billing tab — writes `media_plan_versions.billingSchedule` JSON. |
| `GET /api/mediaplans/mba/[mba_number]` | `app/api/mediaplans/mba/[mba_number]/route.ts` | Loads billing schedule for Alter Billing (`billingScheduleFull=1`). |
| `GET /api/campaigns/[mba_number]/billing-schedule` | `app/api/campaigns/[mba_number]/billing-schedule/route.ts` | Client dashboard billing schedule PDF/JSON download. |
| MBA edit UI | `app/mediaplans/mba/[mba_number]/edit/page.tsx` | Primary billing schedule editor; see Domain 4 Stage 1. |
| Create campaign | `app/mediaplans/create/page.tsx` | Initial `billingSchedule` on create. |
| Scope edit | `/scopes-of-work/[id]/edit` | Linked from Client Billing SOW groups. |
| `GET /api/clients`, `GET /api/publishers` | Shared APIs | Filter dropdowns in `FinanceFilterToolbar`. |
| `GET /api/dashboard/global-monthly-client-spend` | Dashboard API | Overview charts (client spend treemap/series). |
| `GET /api/dashboard/global-monthly-publisher-spend` | Dashboard API | Overview charts (publisher spend). |

**Xero:** No `xero` / `Xero` references in the repo (confirmed in Domain 4). Operations “Xero export” likely means the **Excel receivables workbook** produced client-side (see Export Paths).

---

## Per-tab surface inventory

Shared chrome (all tabs): `FinanceOverviewHero` (KPI row), `Tabs` / `TabsList`, `FinanceFilterToolbar`, top-right **Saved views** + **Export** menus in `FinanceHubPageClient.tsx`.

Filter state: `useFinanceStore` (`lib/finance/useFinanceStore.ts`) + URL query sync (`tab`, `from`, `to`, `clients`, `publishers`, `q`, `drafts`).

---

### Overview

1. **Tab component file:** `components/finance/tabs/OverviewTab.tsx` (wrapped by `components/finance/hub/panels/FinanceOverviewPanel.tsx`).

2. **Top-level components rendered:** `FinanceOverviewProvider`, `FinanceOverviewHero`, `OverviewTab` (charts, attention list, FY client billing table), `PageHeroShell`, `BaseChartCard`, `TreemapShellChart`, `StackedColumnChart`, `ScrollArea`.

3. **Data sources**
   - **Primary:** `useFinanceStore` → `billingRecords`, `payablesRecords` via `scheduleFinanceFetchAll` → `GET /api/finance/billing` + `GET /api/finance/payables` per month in `monthRange`.
   - **Secondary:** `GET /api/finance/edits` (accrual reconcile map), `GET /api/finance/hub-schedule-ytd`, `GET /api/dashboard/global-monthly-client-spend`, `GET /api/dashboard/global-monthly-publisher-spend`, `GET /api/clients` (profile colours), dedicated fetches for current-month billing/payables for KPI tiles.

4. **Actions**
   | Label / control | Behaviour | API | Write? |
   |-----------------|-----------|-----|--------|
   | KPI tiles (5) | Navigate to another tab with filter patch | None (client `setActiveTab` + `setFilters`) | No |
   | Attention items | Same navigation | None | No |
   | Chart / table links | `navigateWith(tab, patch)` | None | No |

5. **Empty state:** Charts show loading skeletons; attention list may be empty; no dedicated “no data” hero.

6. **Mobile / &lt;1200px:** KPI grid collapses (`grid-cols-1` → `sm:grid-cols-2` → `xl:grid-cols-5`). Charts scroll horizontally. Usable but dense; KPI row is visible on **all** tabs (user-flagged as noise off-Overview).

---

### Client Billing

1. **Tab component file:** Inline `FinanceHubReceivablesSection` in `app/finance/FinanceHubPageClient.tsx` (not `ReceivablesTab.tsx`).

2. **Top-level components:** `FinanceHubReceivablesSection`, `HubReceivableRecordArticle`, `Collapsible`, `Avatar`, `Badge`, `AlterBillingDialog`, `Button` (Edit, AA plan, Alter Billing).

3. **Data sources**
   - **Primary:** `fetchFinanceBillingForMonths` → `GET /api/finance/billing` per month (only after user clicks **Load** / **Refresh** on billing tab — `fetchKey` gate in `useFinanceHubReceivablesData`).
   - **Secondary:** `GET /api/mediaplans/mba/[mba]` for Alter Billing load; filter options from shared toolbar (`/api/clients`, `/api/publishers`).

4. **Actions**
   | Label | Behaviour | API | Write? |
   |-------|-----------|-----|--------|
   | Load / Refresh (filter bar) | Fetches receivables for filter signature | `GET /api/finance/billing` | No |
   | Edit | Opens MBA edit in new tab | — | No (navigation) |
   | AA plan | Download AA Excel | `GET /api/finance/receivables/aa-media-plan` | No |
   | Alter Billing | Opens dialog; save rebuilds schedule | `GET` MBA + `PATCH` billing-schedule | **Yes** (schedule JSON) |
   | Edit (SOW) | Opens scope edit | — | No |
   | Export (hub menu) | See Export Paths | Client Excel/CSV | No |

5. **Empty state:**
   - Before load: “Use **Load** or **Refresh** in the filter bar…”
   - After load, no rows: “No receivable billing rows for the current filters…”

6. **Mobile / &lt;1200px:** Collapsible cards stack; action buttons wrap (`flex-wrap`). `lg:grid-cols-2` for invoice cards. No `EditableFinanceGrid` on this tab — read-only cards except Alter Billing.

---

### Publisher Invoices

1. **Tab component file:** `components/finance/hub/FinanceHubPayablesSection.tsx` (panel: `FinancePayablesPanel.tsx`).

2. **Top-level components:** `FinanceHubPayablesSection`, `PayableInvoiceCard`, `Collapsible`, `Switch` (hide client-paid), local Export dropdown.

3. **Data sources**
   - **Primary:** `fetchFinancePayablesForMonths` → `GET /api/finance/payables` (auto-loads on filter change via `useEffect`, not gated behind Load).
   - **Secondary:** `GET /api/publishers` for publisher ID/name maps; shared hub filters.

4. **Actions**
   | Label | Behaviour | API | Write? |
   |-------|-----------|-----|--------|
   | Hide client-paid lines | UI filter (localStorage) | — | No |
   | Export → Excel (publisher layout) | Tab-local export | Client `exportPayablesPublisherDetailExcel` | No |
   | Hub Export menu | Payables workbook / flat CSV | Client | No |

5. **Empty state:** “No payable rows for the current filters and billing months in view.”

6. **Mobile / &lt;1200px:** Same card pattern as billing; switch + export in header row with wrap. No grid edits on hub payables section.

**Note:** `PayablesTab.tsx` + `EditableFinanceGrid` exist but are **not mounted** on the hub (legacy/alternate UI).

---

### Accrual

1. **Tab component file:** `components/finance/tabs/AccrualTab.tsx` (panel: `FinanceAccrualPanel.tsx`).

2. **Top-level components:** `AccrualTab`, `EditableFinanceGrid`, `Checkbox` (reconciled), `Sheet` (row detail), Export dropdown.

3. **Data sources**
   - **Primary:** Computed client-side `computeAccrualByClient(receivables, payables, monthRange, reconcileMap)` from store billing/payables.
   - **Secondary:** `GET /api/finance/edits` for reconcile flags; `useAccrualMonths()` from store.

4. **Actions**
   | Label | Behaviour | API | Write? |
   |-------|-----------|-----|--------|
   | Reconciled checkbox | Toggle per client/month | `POST /api/finance/edits` (`record_type: accrual_reconcile`, `edit_status: published`) | **Yes** |
   | Row click | Opens detail sheet (contributors) | — | No |
   | Export → Excel (2 sheets) | Tab or hub menu | Client `exportAccrualWorkbook` | No |
   | EditableFinanceGrid footer | Discard / Publish | `POST /api/finance/edits/publish` | **Yes** (if drafts exist; accrual uses `editableFields={[]}` so no cell edits) |

5. **Empty state:** “No accrual rows for the current filters and month range.”

6. **Mobile / &lt;1200px:** Virtualized grid horizontal scroll (`overflow-x-auto` on grid container). Wide table; usable on tablet with scroll, cramped on phone.

---

### Forecast

1. **Tab component file:** `components/finance/tabs/ForecastTab.tsx` (panel: `FinanceForecastPanel.tsx`).

2. **Top-level components:** `ForecastTab`, FY/scenario filters, `Load forecast`, Export dropdown, `Take snapshot`, `EditableFinanceGrid` **not used** — custom HTML `<table>`.

3. **Data sources**
   - **Primary:** `GET /api/finance/forecast?fy=&scenario=&client=&q=&debug=` on explicit **Load forecast** click only.
   - **Secondary:** Snapshot POST uses same filter params server-side.

4. **Actions**
   | Label | Behaviour | API | Write? |
   |-------|-----------|-----|--------|
   | Load forecast | Fetches dataset | `GET /api/finance/forecast` | No |
   | Export CSV / Excel | Client build from loaded payload | — | No |
   | Take snapshot | Persist snapshot | `POST /api/finance/forecast/snapshots` | **Yes** (admin only) |
   | Include row debug | Query flag | — | No |
   | Bug icon (row) | Metadata sheet | — | No |

5. **Empty state:** “Select filters and click **Load forecast**…” until first load; then possibly “No data for this financial year and filters.”

6. **Mobile / &lt;1200px:** `min-w-[1100px]` table with horizontal scroll; sticky client/line columns. Filter card stacks (`xl:flex-row`). **Does not use** hub month-range filter (alert explains FY-only).

---

## Status Fields and Write Paths

### Status-like fields (finance-relevant)

| Field | Table / source | Type / values | Read by | Written by |
|-------|----------------|---------------|---------|------------|
| `status` | Derived `BillingRecord` | `BillingStatus`: draft, booked, approved, invoiced, paid, cancelled, expected, disputed | Hub tabs, grids, exports | `PATCH /api/finance/billing/[id]` → Xano `finance_billing_records`; `finance_edits` publish path |
| `status` (derived) | `media_plan_versions.campaign_status` | booked, approved, completed, draft, probable, cancelled, … | `deriveReceivableRecords`, forecast filters | MBA edit `campaign_status` / `mp_campaignstatus` |
| `edit_status` | `finance_edits` | draft, published, reverted | Edits list, publish | POST edits, publish endpoint |
| `has_pending_edits` | `finance_billing_records` (TS) | boolean | Grid badge | Xano / publish flow |
| `record_type` | `finance_edits` | e.g. `accrual_reconcile` | `parseAccrualReconcilesFromEdits` | POST `/api/finance/edits` |
| `field_name` | `finance_edits` | e.g. `accrual:{clients_id}:{YYYY-MM}` | Accrual reconcile | POST edits |
| `new_value` / `old_value` | `finance_edits` | string | Reconcile parser | POST edits |
| `reconciled` | Accrual UI only (computed) | boolean from edits | Accrual tab, Overview attention | Via `accrual_reconcile` edits (not a Xano column in repo) |
| `client_pays_media` | `BillingLineItem` / schedule | boolean | Payables display, accrual API | Line item PATCH or schedule JSON |
| `includeDrafts` | UI filter only | boolean | Billing derivation (`include_drafts=0`) | — |

**Not found in code:** `billed`, `reconciled` (as billing record field), `locked`, `confirmed` (as billing status — forecast uses `scenario=confirmed`), `super_admin`, billing-month lock enforcement.

**Derived receivable status mapping** (`lib/finance/deriveReceivableRecords.ts`): `campaign_status` completed/approved/booked → record `booked`; else `draft` (when `includeNonBookedCampaigns`).

### Write sites by status-like field

| Field | Write site | Function / handler | Role gate (code) |
|-------|------------|-------------------|------------------|
| `finance_billing_records.*` | `app/api/finance/billing/[id]/route.ts` | PATCH proxy to Xano | Auth session only (middleware 401) |
| `finance_edits` | `app/api/finance/edits/route.ts` | POST | Auth session only |
| `finance_edits` publish | `app/api/finance/edits/publish/route.ts` | POST | Auth session only |
| Accrual reconcile | `lib/finance/api.ts` → `postAccrualReconcileEdit` | POST edits | Auth session only |
| `billingSchedule` | `app/api/mediaplans/versions/[id]/billing-schedule` | PATCH | MBA edit permissions (Domain 3b/4) |
| Forecast snapshot | `app/api/finance/forecast/snapshots` | POST | **admin** only |

No `isSuperAdmin` or `super_admin` string matches in the repository. Domain 4 “billing month locks” are **not implemented** in finance write paths discovered here.

### Checkboxes / toggles on finance tabs

| Tab | Control | Field / storage | Behaviour |
|-----|---------|-----------------|-----------|
| Accrual | Reconciled checkbox | `finance_edits` (`accrual_reconcile`, published immediately) | Toggles reconcile for client+month bucket |
| Payables (hub) | Hide client-paid lines | `localStorage` key `finance-payables-hide-client-paid` | Hides line items where `client_pays_media` |
| PayablesTab (unused) | Same | Same | — |
| Forecast | Include row debug | Query param only | Larger API payload |
| Filter bar | Include drafts | `FinanceFilters.includeDrafts` → `include_drafts=0` on billing/payables APIs | Excludes non-booked-like campaigns when off |
| ReceivablesTab (unused) | Sort desc | Local state | — |

### `finance_billing_records` (TypeScript contract — full field list in repo)

From `lib/types/financeBilling.ts` (`BillingRecord` + line items). Xano column list is **not** in repo (Domain 4 open question).

| Field | TS type | Purpose |
|-------|---------|---------|
| `id` | number | Primary key |
| `billing_type` | media \| sow \| retainer \| payable | Row classification |
| `clients_id` | number | Client FK |
| `client_name` | string | Display |
| `mba_number` | string \| null | Campaign id |
| `media_plan_version_id` | number \| null | Source version (derived rows) |
| `media_plan_version_number` | number \| null | Version for MBA GET |
| `campaign_name` | string \| null | Display |
| `po_number` | string \| null | Editable in grid |
| `billing_month` | string (YYYY-MM) | Month bucket |
| `invoice_date` | string \| null | Editable in grid |
| `payment_days` | number | Terms |
| `payment_terms` | string | Terms label |
| `status` | BillingStatus | Workflow status |
| `line_items` | BillingLineItem[] | Nested lines |
| `total` | number | Header total |
| `has_pending_edits` | boolean | Draft edits flag |
| `source_billing_schedule_id` | number \| null | Provenance |
| `finance_accrual` | optional breakdown | Synthetic accrual rows only |

**Line item fields:** `id`, `finance_billing_records_id`, `item_code`, `line_type`, `media_type`, `description`, `publisher_name`, `amount`, `client_pays_media`, `sort_order`, plus optional enrichment (network, platform, …).

**Hub note:** Client Billing receivables are **derived live** and may use synthetic `id` values; PATCH `finance_billing_records/{id}` applies to persisted legacy rows (e.g. when using `ReceivablesTab` grid).

### `finance_edits` (TypeScript contract)

| Field | TS type | Purpose |
|-------|---------|---------|
| `id` | number | Edit row id |
| `finance_billing_records_id` | number \| null | Target record (null for accrual reconcile) |
| `finance_billing_line_items_id` | number \| null | Target line |
| `edit_type` | field_change \| amount_change \| status_change \| line_add \| line_remove | Kind of change |
| `field_name` | string | Column or `accrual:…` key |
| `old_value` / `new_value` | string \| null | Serialized values |
| `edit_status` | draft \| published \| reverted | Workflow |
| `edited_by` | number | User id |
| `edited_by_name` | string | Display |
| `published_at` | string \| null | Timestamp |
| `created_at` | string | Created |

**Extension used in code but not in TS interface:** `record_type: "accrual_reconcile"` on POST body.

---

## Edit Surfaces

### 1. `AlterBillingDialog`

| Aspect | Detail |
|--------|--------|
| **File** | `components/billing/AlterBillingDialog.tsx` |
| **Fields edited** | Per-month line item amounts inside `BillingMonth` structure (media keys, fees, production, ad serving); recalculates month totals; grand total tolerance check |
| **Mounted** | `FinanceHubPageClient.tsx` — Client Billing tab only, per media plan group |
| **Patches** | `PATCH /api/mediaplans/versions/{versionId}/billing-schedule` with `buildBillingScheduleJSON(newMonths)` — **not** `finance_edits` |
| **Domain 4** | Documented § Billing edit surfaces |

### 2. `EditableFinanceGrid`

| Aspect | Detail |
|--------|--------|
| **File** | `components/finance/EditableFinanceGrid.tsx` |
| **Visible in current hub workflow?** | **No** on Client Billing or Publisher Invoices (those use card layouts). **Yes** on Accrual tab. **ReceivablesTab** / **PayablesTab** still implement grid edits but are **not mounted** by `FinanceHubPageClient`. |
| **Editable fields (when used)** | ReceivablesTab: `status`, `po_number`, `invoice_date`, `total`. PayablesTab: `status`, `invoice_date`, `total`, publisher combobox on lines. Accrual: none (`editableFields={[]}`) — grid is display + reconcile checkbox column only. |
| **Write path** | `onCellEdit` → typically `updateBillingRecord` → `PATCH /api/finance/billing/[id]`; footer **Publish** → `POST /api/finance/edits/publish` |

### 3. Per-row inline edits

| Tab | Inline edit |
|-----|-------------|
| Client Billing (hub) | **None** on displayed cards (status shown read-only on `HubReceivableRecordArticle`) |
| Publisher Invoices (hub) | **None** |
| Accrual | Reconcile **checkbox** only (not cell inline edit) |
| Forecast | **None** (read-only amounts) |
| ReceivablesTab (unmounted) | Grid cell inline edit for status, PO, invoice date, total |

### 4. Batch edit / bulk actions

**None found** on any finance hub tab (no multi-select row actions).

### 5. Edit paths outside `/finance`

| Surface | Path | Writes |
|---------|------|--------|
| MBA edit billing UI | `app/mediaplans/mba/[mba_number]/edit/page.tsx` | `billingSchedule`, `deliverySchedule`, campaign fields — Domain 4 Stage 1 |
| Create campaign | `app/mediaplans/create/page.tsx` | Initial schedules |
| Scope of work edit | `/scopes-of-work/[id]/edit` | SOW billing (linked from hub) |
| Client dashboard | `app/dashboard/[slug]/[mba_number]/` | Downloads schedule; not finance hub |

---

## Export Paths

### 1. “Xero” / primary receivables export

There is **no Xero SDK or API** in the codebase. The operations export aligned with receivables invoicing is:

**Function:** `exportReceivablesWorkbook` in `lib/finance/exportFinanceHub.ts`

```typescript
export async function exportReceivablesWorkbook(
  records: BillingRecord[],
  monthLabel: string,
  fileStem: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  const media = records.filter((r) => r.billing_type === "media")
  const sow = records.filter((r) => r.billing_type === "sow")
  const retainer = records.filter((r) => r.billing_type === "retainer")
  // writeMediaFinanceWorksheet / writeSowFinanceWorksheet / writeRetainerFinanceWorksheet
  const buffer = await workbookToXlsxBuffer(workbook)
  saveAs(blob, `${fileStem}_${filenameMonthSegment(monthLabel)}.xlsx`)
}
```

**Format:** Excel `.xlsx` (ExcelJS), worksheets Media / Scopes / per-retainer sheets.

**Hub trigger:** Top-right **Export → Export to Excel** when `activeTab` is billing (default), accrual, payables, or forecast (forecast uses separate workbook builder).

### 2. Filter behaviour (hub Export menu)

| Export item | Data scope |
|-------------|------------|
| **Download Finance Report** | **Client Billing only.** Uses `visibleMonthGroups` from receivables fetch (must click **Load** first). Respects loaded receivables = current filter signature (months, clients, publishers, search, drafts, billing types, statuses). **Disabled** if billing tab not active or no loaded groups. |
| **Export to Excel** | **billing:** `receivableRecords` from store (`billingRecords` filtered) — store populated by `scheduleFinanceFetchAll` (auto on filter change), **not** the billing-tab explicit Load gate → can differ from visible cards if user never clicked Load on billing. **payables:** `payablesRecords` from store (respects filters). **accrual:** recomputed from store billing+payables + client/search filters. **forecast:** `GET /api/finance/forecast?fy={current FY}&scenario=confirmed` only — **ignores** hub month range, clients, publishers, drafts. |
| **Flat list (CSV/XLSX)** | `billingRecords` or `payablesRecords` from store for active tab (same as above). |

### 3. Other Export buttons

| Location | Function | Format | Use case |
|----------|----------|--------|----------|
| Client Billing card | `downloadAaMediaPlan` | Excel (server) | AA media plan per MBA/month |
| Payables tab section | `exportPayablesPublisherDetailExcel` | Excel | Publisher-layout payables |
| Accrual tab | `exportAccrualWorkbook` | Excel (2 sheets) | Accrual report |
| Forecast tab | `buildFinanceForecastCsvString` / `buildFinanceForecastWorkbook` | CSV / Excel | FY forecast extract |
| ReceivablesTab (unmounted) | `exportReceivablesWorkbook` / CSV helpers | Excel/CSV | Legacy grid exports |

### 4. Triggering pattern

| Pattern | Examples |
|---------|----------|
| **Client-side** | All hub Export menu items (ExcelJS + file-saver), forecast exports, payables/accrual tab exports |
| **Server-side** | `GET /api/finance/receivables/aa-media-plan` returns blob |

---

## Forecast Tab

### Files

**Under `app/finance/forecast/**`**

- `app/finance/forecast/snapshots/variance/page.tsx`
- `app/finance/forecast/snapshots/variance/FinanceForecastVariancePageClient.tsx`

**Forecast UI logic:** `components/finance/tabs/ForecastTab.tsx` (not under `app/finance/forecast/` except variance page).

**Supporting libs:** `lib/finance/forecast/**`, `lib/types/financeForecast.ts`, `app/api/finance/forecast/route.ts`, snapshot routes.

### Main page component

The forecast **hub tab** is entirely `ForecastTab` (~1168 lines). There is no separate `app/finance/forecast/page.tsx`. Full source: `components/finance/tabs/ForecastTab.tsx`.

### `loadForecast` handler

```typescript
  const loadForecast = useCallback(async () => {
    const requestSeq = ++requestSeqRef.current
    if (loadAbortRef.current) loadAbortRef.current.abort()
    const controller = new AbortController()
    loadAbortRef.current = controller

    setError(null)
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("fy", String(fyStart))
      params.set("scenario", scenario)
      if (clientFilter.trim()) params.set("client", clientFilter.trim())
      if (searchInput.trim()) params.set("q", searchInput.trim())
      if (includeDebug) params.set("debug", "1")

      const res = await fetch(`/api/finance/forecast?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      })
      // ... parse body, setPayload or setError
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setLoading(false)
      }
    }
  }, [clientFilter, fyStart, includeDebug, scenario, searchInput])
```

**Not auto-invoked on mount** — only on button click (and on scenario change after first successful load).

### API behaviour today

`GET /api/finance/forecast` calls `loadFinanceForecastDataset` (real implementation: loads versions, clients, publishers; builds `FinanceForecastDataset`). Returns `{ dataset, meta }` or 4xx/5xx JSON error. **Not stubbed.**

### Plain assessment

**Forecast is partially built — backend and full UI exist, but the hub tab defaults to an empty state until the user clicks “Load forecast”, and it uses separate FY/scenario filters rather than the shared month-range filter.** Empty grid after load usually means zero matching versions for FY/scenario/client/search, not a broken API. Snapshot features require **admin** role and optional Xano env configuration.

---

## Filters and Page Chrome

### KPI card row

| Aspect | Detail |
|--------|--------|
| **Component** | `FinanceOverviewHero` in `components/finance/tabs/OverviewTab.tsx` (rendered above tabs for **all** tabs via `FinanceHubPageClient`) |
| **Cards** | (1) Client Billing this month (2) Client Billing FYTD (3) Publisher Invoices this month (4) Publisher Invoices FYTD (5) Net accrual FYTD |
| **Sources** | (1)(2) Receivables from billing API / store with status filter booked+; FYTD uses `fytdMonthRange` + billing records. (3)(4) Payables line sums with expected/invoiced/paid. (5) `computeAccrualByClient` over FYTD range + edits. Also `GET /api/finance/hub-schedule-ytd` for schedule YTD context in provider. |
| **UX note** | User reports KPI noise on non-Overview tabs — cards are always visible. |

### Tab strip

| Aspect | Detail |
|--------|--------|
| **Component** | `Tabs`, `TabsList`, `TabsTrigger` in `FinanceHubPageClient.tsx` |
| **Tabs** | overview, billing (Client Billing), payables (Publisher Invoices), accrual, forecast |
| **Role gating** | **None** on tab visibility — all five shown to anyone who can open `/finance`. Forecast **API** blocks `client` role; snapshot actions require **admin**. |

### Filter bar

| Aspect | Detail |
|--------|--------|
| **Component** | `FinanceFilterToolbar` (`components/finance/FinanceFilterToolbar.tsx`) |
| **State** | Draft local state → **Apply** writes to `useFinanceStore.filters`; URL synced via `buildSearchParams` |
| **Filters** | Clients (multi), Publishers (multi), Search, Billing month (single/range), Include drafts (switch) |
| **Per-tab consumption** | **Overview / Accrual / Payables store fetch:** `scheduleFinanceFetchAll` on filter change. **Client Billing:** separate fetch gated by **Load/Refresh** (`receivables.bump`). **Forecast:** ignores hub month filter; own FY/scenario UI inside tab. |
| **Mobile** | Filters in bottom `Sheet` on `lg:hidden`; desktop 12-column grid. |

### Saved Views

| Aspect | Detail |
|--------|--------|
| **UI** | Hub dropdown “Saved views” in `FinanceHubPageClient.tsx` |
| **Persists** | **`localStorage` only** — key `finance-hub-saved-views-v3`, per browser |
| **Saves** | Full `FinanceFilters` snapshot (clients, publishers, month range, drafts, billing types, statuses, search) |
| **Who** | Any user with access to the page; **not** per-user server-side, **not** org-wide |
| **Xano** | `GET/POST /api/finance/saved-views` exists but hub does **not** call it (legacy `ReceivablesTab` used Xano saved views) |

---

## Roles on Finance

### `isSuperAdmin` / `super_admin`

**Not present** in finance code paths searched.

### `getUserRoles` checks in finance code

| Location | Gated action | Without role |
|----------|--------------|--------------|
| `app/api/finance/forecast/route.ts` | GET forecast | 403 if `client` |
| `app/api/finance/accrual/route.ts` | GET accrual API | 403 if `client` |
| `app/api/finance/forecast/snapshots/route.ts` | GET list / POST snapshot | 403 unless `admin` |
| `app/api/finance/forecast/snapshots/[id]/lines/route.ts` | GET lines | 403 unless `admin` |
| `app/api/finance/forecast/snapshots/variance/route.ts` | POST variance | 403 unless `admin` |
| `app/finance/forecast/snapshots/variance/page.tsx` | Variance page | `AdminGuard` wrapper |

Forecast GET also scopes non-admin users via `getUserClientSlugs` → `allowedClientSlugs` in dataset loader.

### Entire `/finance` section

| Layer | Gate |
|-------|------|
| **Navigation** | Finance link only in `adminMenuItems` (`AppSidebar` when `isAdmin` from `AuthContext`) — **client users do not see the link** |
| **`canAccessPage(user, 'finance')`** | Requires `admin` or `manager` (`lib/rbac.ts`) — **not called** by `app/finance/page.tsx` itself |
| **Middleware** | Authenticated session required; **no** `/finance`-specific block — client users redirected away from most non-dashboard pages, but finance page has no dedicated `AdminGuard` |
| **Practical access** | Intended for internal admin/manager; clients unlikely to reach URL |

---

## Open Questions for Claude

1. **Product naming:** Confirm “Xero export” = `exportReceivablesWorkbook` / Download Finance Report Excel, not an external integration.

2. **Dual receivables UIs:** Should Stage 1 retire `ReceivablesTab` + `EditableFinanceGrid` on billing, or restore grid editing on the card-based Client Billing tab?

3. **`finance_billing_records` vs derived rows:** Hub billing is derived from schedule JSON; grid PATCH targets Xano records. Is status/invoice date long-term on schedule JSON, `finance_billing_records`, or both?

4. **Billing tab Load gate:** Store auto-fetches for Overview/Accrual but Client Billing requires explicit Load — intentional UX or oversight?

5. **Export data mismatch:** “Export to Excel” on billing uses store records; Finance Report uses separately loaded `visibleMonthGroups` — should exports unify?

6. **Saved views:** Keep browser-local only, or wire hub to `finance_saved_views` / per-user server persistence?

7. **`super_admin` / billing month locks:** Mentioned in Domain 4 / AUDIT roadmap — confirm out of scope for Domain 5 UX or required for Stage 1 IA.

8. **Forecast adoption:** Is empty Forecast tab a training issue (must click Load) or should FY view auto-load with sensible defaults?

9. **Manager vs admin:** `canAccessPage('finance')` includes manager; sidebar shows Finance only for `isAdmin` — which is authoritative?

10. **Full Xano schemas:** `finance_billing_records`, `finance_billing_line_items`, `finance_edits` column types/enums in Xano still needed for status field design (`billed` / `reconciled`).

11. **`FinanceReceivablesPanel`:** Dead code or planned switch back from cards to grid?

12. **PayablesTab publisher combobox writes:** If payables grid is retired, where should publisher corrections happen?

---

## Jobs-to-be-Done (signed off 2026-05-27)

Numbered for reference. Grouped by frequency. Each job represents a discrete outcome the finance team is trying to achieve on `/finance`.

### Monthly jobs (the core cycle)

**J1. Generate the client Xero export for the month.**
Pick a billing month, confirm receivables are correct, click Export, hand the workbook to accounts.

**J2. Mark each client invoice as billed once it has been raised AND sent to the client in Xero.**
After accounts raises invoices in Xero and sends them out, the finance person marks each client-month-invoice as "billed" in AssembledView so the team knows what has been shipped vs what remains outstanding. Billed = in the client's hands.

**J3. Track expected publisher invoices and mark them received and correct.**
For each publisher, for each line item, the team is expecting an invoice for a known amount. When the invoice arrives, the team marks "received and correct" (or "received and disputed" / "received but amount differs").

**J4. Reconcile the accrual for each client-month.**
For each client where receivable timing doesn't match payable timing, confirm the timing gap is intentional and tick the row off.

### Weekly jobs

**J5. Spot-check a specific client's billing before invoicing.**
Drill into a client, see the rolled-up amount, see the breakdown, see whether anything looks off.

**J6. Edit a billing schedule when something has changed.**
A campaign got extended, a client changed payment terms, a media plan was repriced. Open the schedule, change the amounts/months, save.

**J7. Spot-check a publisher invoice that has arrived against what was expected.**
Match received against expected for a single publisher/line-item.

### Cyclical / monthly-plus jobs

**J8. See what's upcoming for the next month or two.**
Forward-looking view of client invoices due to be raised and publisher invoices due to arrive.

**J9. Investigate a discrepancy.**
Walk an accrual row back to source line items, see what's contributing.

### Ad-hoc / management jobs

**J10. Answer "what are we spending with [publisher] across the year?"**
Publisher-level FY view at line-item or summary grain.

**J11. Answer "what is [client] spending across the year and on what?"**
Client-level FY view.

**J12. Forecast revenue and cost for the FY.**
**Parked — total redesign required, scheduled for the end of Domain 5.**

**J13. Pull a custom view of data for a one-off analysis.**
Export-and-Excel escape hatch.

### Coordination / handover jobs

**J14. Hand the Xero export workbook to the accounts team.**
The human step around J1. Audit trail of when the export happened and by whom is desirable.

---

## Friction Inventory

For each job, where the current UI obstructs it. Confidence ratings denote how strongly the friction is evidenced by the Stage 0 code inventory vs. inferred from the brief.

### J1. Generate the client Xero export

- **F1.1 (~95%)** Export hides behind two clicks in a dropdown menu. Should be a first-class button.
- **F1.2 (~90%)** Two different exports produce two different outputs (`exportReceivablesWorkbook` via "Export to Excel" using store records vs. "Download Finance Report" using `visibleMonthGroups`). Confirmed to be unified (open question 5).
- **F1.3 (~80%)** No pre-flight check before export — no "N rows are draft, M schedules have warnings, export anyway?" gate.
- **F1.4 (~70%)** No audit trail of when the export happened or by whom.

### J2. Mark each client invoice as billed

- **F2.1 (~95%)** **No billed status exists anywhere** — not on `billingSchedule` JSON, not in the UI. Single biggest gap in the surface vs. the brief.
- **F2.2 (~95%)** Therefore no "unbilled" filter, no outstanding view, no tick-off affordance.
- **F2.3 (~85%)** Status grain is per-client-per-month-per-invoice, not per-line-item.

### J3. Track expected publisher invoices and mark received/correct

- **F3.1 (~95%)** No received/correct/disputed status on `deliverySchedule[]` rows.
- **F3.2 (~90%)** No variance flag affordance for "received but amount differs."
- **F3.3 (~80%)** No ageing view ("which publishers haven't sent their April invoice yet").

### J4. Reconcile the accrual for each client-month

- **F4.1 (~85%)** No filter for "unreconciled only" — reconciled is the only status that exists today, but the team has to scroll the grid to find untoggled rows.
- **F4.2 (~70%)** No visual signal for which rows materially need attention (large delta vs. rounding noise).
- **F4.3 (~60%)** Row detail sheet lists contributors but doesn't narrate the *why* of the timing gap.

### J5. Spot-check a specific client's billing

- **F5.1 (~95%)** The 20-row-repetition problem (Image 3). Identical-description-identical-amount line items should collapse to a grouped row with expand affordance.
- **F5.2 (~90%)** No rolled-up "this client owes us $X this month for $Y media + $Z fees + $W production" view at the client header. The summary the user is mentally building is exactly what should display by default.
- **F5.3 (~85%)** Load required before any data appears. Load button is far from the primary action.
- **F5.4 (~70%)** "AA plan" export per media plan is noise for clients that aren't Advertising Associates handovers.

### J6. Edit a billing schedule

- **F6.1 (~90%)** Alter Billing edits one media plan at a time. The mental model is per-client-per-month; the tool is per-media-plan.
- **F6.2 (~85%)** No inline edits on Client Billing. Even trivial amount corrections require the full dialog.
- **F6.3 (~80%)** "Edit" (full MBA edit page) and "Alter Billing" (dialog) coexist on the same media plan group with overlapping intent. Label disambiguation worth reviewing.
- **F6.4 (~60%)** No draft/preview/diff state. Save PATCHes `billingSchedule` directly with no preview of what's about to change.

### J7. Spot-check a publisher invoice

- **F7.1 (~85%)** Publisher Invoices groups by publisher → line item; users typically arrive with a line item in mind, not a publisher. Search exists but isn't surfaced for this flow.
- **F7.2 (~80%)** No "match received against expected" affordance.
- **F7.3 (~70%)** No notes/comments per line item.

### J8. See what's upcoming

- **F8.1 (~95%)** **"Upcoming" doesn't exist as a view.** No "next 30 days," no expected-invoices-in-the-next-week, no forward-looking surface.
- **F8.2 (~85%)** No ageing buckets.

### J9. Investigate a discrepancy

- **F9.1 (~75%)** Accrual → contributors trace is one-way. From a receivable card you can't navigate to the contributing payables.
- **F9.2 (~70%)** No diff log of who changed what on a schedule and when.

### J10 / J11. Spend by publisher / spend by client across the year

- **F10.1 (~80%)** Treemaps show relative size, not absolute amounts or trends. Wrong visualisation for the question.
- **F10.2 (~70%)** No drilldown from the treemap to contributing line items.
- **F10.3 (~60%)** These charts live on Overview, which the finance team opens least often. Data is in the wrong place for the users who'd benefit from it.

### J13. Custom view for one-off analysis

- **F13.1 (~75%)** Every job currently bottoms out at Export-and-Excel because in-app surfaces don't answer the question. Successful redesign should reduce Excel reliance substantially.

### J14. Hand the export to accounts

- **F14.1 (~80%)** No "marked as exported / batch shipped" intermediate state. Tied to F1.4 and F2.

### Cross-cutting frictions (not tied to a single job)

- **CF1 (~90%)** KPI hero is fixed on all tabs. Useful on Overview, noise on the four working tabs. ~150px of fixed vertical real estate paid for on every load.
- **CF2 (~90%)** Five tabs implying equality. Overview and Forecast are read-only summaries; Client Billing, Publisher Invoices, Accrual are working surfaces. IA should reflect this hierarchy.
- **CF3 (~90%)** Filter bar lives above tabs; some filters apply differently per tab (Forecast ignores month range entirely). Per-tab filter affordances would let each surface ask for only what it needs.
- **CF4 (~90%)** No multi-select / bulk actions anywhere.
- **CF5 (~95%)** Status is the spine of the redesign and currently doesn't exist outside the accrual reconcile checkbox.

---

## Stage 0 Decisions (locked)

| ID | Decision | Notes |
|----|----------|-------|
| D1 | Long-term billing status lives on `billingSchedule` JSON, not `finance_billing_records` | `finance_billing_records` is SOW-only |
| D2 | Long-term payable status lives on `deliverySchedule` JSON | Symmetric to D1 |
| D3 | All tabs require explicit Load (no auto-fetch on filter change) | Aligns Overview/Accrual to Client Billing's current pattern |
| D4 | Export paths unify: one Xero export function for receivables | Resolves the "Export to Excel" vs "Download Finance Report" split |
| D5 | Saved views remain browser-local (`localStorage`) | No Xano persistence in Domain 5 |
| D6 | `super_admin` / billing month locks are out of scope for Domain 5 | Deferred to a future domain |
| D7 | `/finance` is admin-only; add explicit `AdminGuard` to the route | Today it's admin-by-convention via sidebar gating |
| D8 | "Billed" means client invoice raised in Xero **and** sent to the client | Not "raised only," not "paid" |
| D9 | `FinanceReceivablesPanel` is dead code, to be deleted in a later stage | Confirmed not a planned switch-back |
| D10 | Forecast tab requires total redesign, parked for the end of Domain 5 | Last stage in the domain |

### Open within Stage 1

- **O1** Cards vs grid for the redesigned Client Billing surface — to be decided visually during IA proposal
- **O2** Where publisher corrections happen if the payables grid is retired — to be decided alongside Stage 1 IA
- **O3** Full Xano column schemas for `finance_billing_records`, `finance_billing_line_items`, `finance_edits` — Stage 1 will require these pulled from the Xano UI
- **O4** Full JSON shape of `billingSchedule` and `deliverySchedule` per-month rows — Stage 1 will need these to design the status field addition

---

## Stage 1 priority

User-signed-off priority of jobs to address first in implementation stages, after Stage 1 IA proposal:

1. **J2** — billed status (single biggest gap)
2. **J5** — spot-check client billing (most repeated/painful daily friction)
3. **J1** — Xero export (the monthly deliverable everything else feeds)

Remaining jobs sequenced based on Stage 1 IA outcomes.

---

*Stage 0 closed 2026-05-27. Next: Stage 1 — Information Architecture proposal (document-only, no code).*
