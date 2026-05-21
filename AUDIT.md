# Domain 4 — Finance Hub Audit

_Stage 0 discovery output. Each section appended by a separate Cursor prompt. Do not edit by hand during Stage 0._

## 1. Filter bar diagnosis

**Path note:** Prompt referenced `components/finance/hub/FinanceHubPageClient.tsx`; that file does not exist. Hub shell, `useFinanceHubReceivablesData`, tab routing, and `scheduleFinanceFetchAll` live in `app/finance/FinanceHubPageClient.tsx`.

---

### Overview tab

- **File:** `components/finance/tabs/OverviewTab.tsx` (rendered via `components/finance/hub/panels/FinanceOverviewPanel.tsx` → `FinanceOverviewProvider` + `OverviewTab`)
- **Subscribes to `useFinanceStore`:** yes — in `FinanceOverviewProvider` (lines 183–189): `(s) => s.filters`, `(s) => s.setFilters`, `(s) => s.setActiveTab`, `(s) => s.billingRecords`, `(s) => s.payablesRecords`, `(s) => s.billingLoading`, `(s) => s.payablesLoading`
- **Data fetch location:**
  - Edits list: `OverviewTab.tsx` lines 203–211 — `fetchFinanceEditsList()`, deps `[]`
  - Dashboard charts: lines 213–254 — `fetch("/api/dashboard/global-monthly-publisher-spend")` and `global-monthly-client-spend`, deps `[]`
  - Schedule FYTD KPIs: lines 256–278 — `fetch("/api/finance/hub-schedule-ytd")`, deps `[]`
  - Current-month KPI slice: lines 280–304 — `fetchFinanceBillingForMonths(months, {}, …)` and `fetchFinancePayablesForMonths(months, {})` with `months = [currentMonth]`, deps `[currentMonth]` only
  - Store-backed billing/payables for accrual tiles and attention list: derived from `billingRecords` / `payablesRecords` (no tab-local fetch); store reload is triggered by parent `scheduleFinanceFetchAll` in `app/finance/FinanceHubPageClient.tsx` lines 969–1016 when `filters` change
- **Filter deps in fetch effect:** none on the tab-owned effects above (empty or `[currentMonth]` only). Store data indirectly depends on hub filters via parent effect deps: `monthRange.from/to`, `includeDrafts`, `hubFetchClientsKey`, `hubFetchPublishersKey`, `hubFetchBillingTypesKey`, `hubFetchStatusesKey`, `searchQuery` (parent lines 1006–1015)
- **Root cause classification:** `subscribes-but-no-refetch` — tab reads `filters` for labels/accrual memos (`filters.monthRange` at 314–315, `hubRangeMonths` at 539) but several Overview-owned requests never receive hub filter params; KPI “this month” uses unfiltered `{}` fetches (287–288). Store-driven sections only update after toolbar **Load** applies `draft` → `setFilters`.
- **Notes:** `fyClientBillingRows` and `attentionItems` use store `billingRecords`/`payablesRecords` (405–487) which should reflect filters once parent `fetchAll` runs. Charts and `hub-schedule-ytd` are global/unfiltered and will not respond to the filter bar.

---

### Accrual tab

- **File:** `components/finance/tabs/AccrualTab.tsx`
- **Subscribes to `useFinanceStore`:** yes — lines 188–192: `(s) => s.filters`, `(s) => s.billingRecords`, `(s) => s.payablesRecords`, `(s) => s.billingLoading`, `(s) => s.payablesLoading`; also `useAccrualMonths()` (store `filters.monthRange` via `useFinanceStore` in `lib/finance/useFinanceStore.ts` lines 265–268)
- **Data fetch location:**
  - Edits only: `AccrualTab.tsx` lines 200–210 — `fetchFinanceEditsList()`, deps `[loadEdits]` (stable callback, effectively mount-once)
  - Main grid: no tab fetch — `computeAccrualByClient(receivables, payablesRecords, filters.monthRange, …)` (219–221) plus client-side filter on `filters.selectedClients`, `filters.searchQuery` (224–235)
  - Billing/payables source: parent `scheduleFinanceFetchAll` → `useFinanceStore.fetchAll()` (`useFinanceStore.ts` 238–241)
- **Filter deps in fetch effect:** none for accrual grid data (relies on store). Edits effect: none
- **Root cause classification:** `not-applicable` for tab-local fetch (correct pattern: consume filtered store records). If filters appear broken, likely **store not updated** (toolbar draft not applied) or **parent `scheduleFinanceFetchAll` / API** (prompt 2), not missing tab subscription.
- **Notes:** `accrualMonths` is in the `accrualRowsRaw` useMemo dep array (221) but not used inside the callback — harmless extra dep.

---

### Forecast tab

- **File:** `components/finance/tabs/ForecastTab.tsx`
- **Subscribes to `useFinanceStore`:** no — no `useFinanceStore` import or usage (grep: zero matches)
- **Data fetch location:** `ForecastTab.tsx` lines 240–296 — `loadForecast` → `fetch(\`/api/finance/forecast?${params}\`)` with local state `fyStart`, `scenario`, `clientFilter`, `searchInput`, `includeDebug` (249–254). Triggered manually and by `useEffect` on `[scenario]` only (304–307) after first successful load
- **Filter deps in fetch effect:** none from hub store. Scenario auto-reload: `[scenario]` (304–307). `loadForecast` callback deps: `[clientFilter, fyStart, includeDebug, scenario, searchInput]` (296)
- **Root cause classification:** `does-not-subscribe` — Finance Hub filter bar does not connect to Forecast; tab uses its own FY/scenario/client/search controls
- **Notes:** Expected behaviour for current architecture unless product intent is to wire hub filters into forecast API params.

---

### Receivables tab (standalone file `components/finance/tabs/ReceivablesTab.tsx`)

- **Used anywhere in the app?** **no** (dead code for AssembledView hub)
  - Grep `ReceivablesTab`: defined in `components/finance/tabs/ReceivablesTab.tsx` (445); imported only by `components/finance/hub/panels/FinanceReceivablesPanel.tsx` (3, 6)
  - Grep `FinanceReceivablesPanel`: only self-reference — **not imported** by `app/finance/FinanceHubPageClient.tsx` or elsewhere
  - Hub Billing tab uses `useFinanceHubReceivablesData` + `FinanceHubReceivablesSection` in `app/finance/FinanceHubPageClient.tsx` (1413–1420), not `ReceivablesTab`
- **Mark as dead code** — skip remaining sub-fields per prompt.

---

### Billing tab (inline `useFinanceHubReceivablesData` in `FinanceHubPageClient.tsx`)

- **File:** `app/finance/FinanceHubPageClient.tsx`, lines 232–349 (`useFinanceHubReceivablesData`); toolbar wiring 1390–1399; tab panel 1413–1420
- **Subscribes to `useFinanceStore`:** yes — line 233: `(s) => s.filters`; derived `filterSig` via `buildFinanceFetchAllSignature(filters)` (240)
- **Manual-load-only behaviour:** confirmed — fetch effect returns early when `fetchKey === 0` (296–299); initial `fetchKey` is 0 (237). `bumpReceivablesFetch` increments `fetchKey` (258–260). Toolbar passes `receivables.bump` when `activeTab === "billing"` (1391–1398). `applyDraftThenReceivables` calls `setFilters(draft)` then `receivables.bump()` in `setTimeout(0)` (`FinanceFilterToolbar.tsx` 120–127)
- **Filter deps in fetch effect:** `activeTab`, `fetchKey`, `filterSig`, `filters.monthRange.from`, `filters.monthRange.to`, `filters.includeDrafts`, `clientsKey`, `publishersKey`, `filters.searchQuery`, `billingTypesKey`, `statusesKey` (337–349). Params built at 304–314 and passed to `fetchFinanceBillingForMonths` (316–317)
- **Filter-change reset:** lines 250–256 — when `filterSig !== loadedSignature`, clears rows and sets `fetchKey` to 0 (requires explicit Load/Refresh via bump)
- **Root cause classification:** `subscribes-correctly` for subscription/deps; intentional **manual load** after filter apply. Practical failures likely **missing `bump`** (e.g. Search Enter calls `setFilters(draft)` only at `FinanceFilterToolbar.tsx` 241, no `bump` on billing tab) or **API/query** (prompt 2), not missing Zustand subscription
- **What to verify in browser DevTools:**
  - After changing filters and clicking **Load**, Network: requests to finance billing API with query params matching `clients_id`, `publishers_id`, `search`, `billing_type`, `status`, `include_drafts` (per 304–314)
  - React/Zustand: `useFinanceStore.getState().filters` updates only after Load (not while editing draft)
  - Console (`NEXT_PUBLIC_FINANCE_DEBUG=1`): `[finance-hub] scheduleFinanceFetchAll effect fired` should **not** replace billing tab data (billing uses separate hook state, not `billingRecords`)
  - After Load, `fetchKey` should be ≥ 1; if 0, fetch effect no-ops (296–299)
  - Compare filter signature: `hubReceivablesSynced` (`loadedSignature === filterSig`, parent 953) flips false after filter change until load completes

---

### Payables tab

- **File:** `components/finance/hub/FinanceHubPayablesSection.tsx` — hook `useFinanceHubPayablesData` lines 158–278; component lines 361–365
- **Subscribes to `useFinanceStore`:** yes — hook line 163: `(s) => s.filters`; section line 363: `(s) => s.filters` (export label)
- **Auto-refetch on filter change:** yes — `useEffect` lines 199–240 depends on `filters.monthRange.from/to`, `includeDrafts`, `selectedClients`, `selectedPublishers`, `searchQuery`, `billingTypes`, `statuses`; calls `fetchFinancePayablesForMonths(payableMonths, params)` (221) with params 202–212
- **Root cause classification:** `subscribes-correctly` for hook refetch wiring. Code looks sound; reported breakage is unlikely “doesn’t subscribe.” More plausible: **(1)** toolbar `draft` not applied to store until **Load** (`FinanceFilterToolbar.tsx` 64–67, 116–118) so hook still sees stale `filters`; **(2)** API routes ignore or mis-map query params (prompt 2); **(3)** publisher filter uses ID→name map client-side (`filterPayablesByPublisherIds`, 260) while fetch sends `publishers_id` (205) — mismatch could look like “filter broken” if API and client paths diverge
- **What to verify in browser DevTools:**
  - Confirm **Load** clicked after filter edits (`dirty` → `setFilters(draft)`)
  - Network on filter apply: payables requests per month with `clients_id`, `publishers_id`, `search`, `billing_type`, `status`, `include_drafts` (202–212)
  - Distinguish hook fetch vs store `fetchPayables` (parent `scheduleFinanceFetchAll` also updates `payablesRecords` in store — Accrual uses store; Payables tab uses hook-local `records`, not `payablesRecords`)
  - If network params correct but UI wrong, inspect response payloads vs `visibleMonthGroups` month filter (268–271: `expandMonthRange(filters.monthRange)`)

---

### Filter toolbar → store update path

- **File:** `components/finance/FinanceFilterToolbar.tsx`
- **`setFilters` call sites:**
  - Line 117: `applyDraft` → `setFilters(draft)` (non-billing tabs / “Loaded” button)
  - Line 121: `applyDraftThenReceivables` → `setFilters(draft)` then `receivables.bump()` via `setTimeout(0)` (billing tab when dirty)
  - Line 241: Search `onKeyDown` Enter → `setFilters(draft)` (no receivables bump)
- **Store implementation:** `lib/finance/useFinanceStore.ts` lines 177–181 — `setFilters: (partial) => set((state) => ({ filters: { ...state.filters, ...partial } }))`. Accepts `Partial<FinanceFilters>`; passing full `draft` object merges all keys and **always produces a new `filters` object** (Zustand `set` runs)
- **Draft sync:** lines 55–57 — `useEffect` resets local `draft` when `storeFilters` changes
- **Confirmed correct vs suspicious:**
  - **Correct:** `setFilters(draft)` is a full filter snapshot merge, not a accidental empty partial; subscribers to `(s) => s.filters` re-render when Apply runs
  - **Suspicious / by design:** Filters apply only on **Load** (or Enter on search), not on every control change — `dirty` gates the button (64–67, 172–177). Until Apply, tabs read **store** `filters`, not toolbar `draft` — explains “filters don’t work” if user doesn’t click Load
  - **Suspicious for billing:** Enter on search (241) updates store but does **not** call `receivables.bump()` — billing tab may show stale receivables data until manual Load/Refresh
  - **Not suspicious for Zustand emit:** `setFilters` always spreads into new `filters` reference

---

### Top-3 hypotheses for the actual root cause

1. **Toolbar draft-not-applied (Load gate)** — users change comboboxes/months but data reads `storeFilters` while UI edits live in local `draft` until Load; non-billing tabs also depend on parent `scheduleFinanceFetchAll` only after store update — **~45%**
2. **API / server route does not apply filter query params** (client builds params correctly in payables hook and receivables hook; store `fetchBilling`/`fetchPayables` use `get().filters`) — **~35%**
3. **Billing tab manual-load + missing bump on some apply paths** (Search Enter updates filters without `bumpReceivablesFetch`; filter-change reset sets `fetchKey` to 0 at 250–256) — **~20%**

## 2. API layer & filter param forwarding

**Architecture note (hub billing/payables):** The hub’s primary list endpoints (`GET /api/finance/billing`, `GET /api/finance/payables`) do **not** proxy filter query params to a Xano “billing list” API. They **derive** rows in Next.js from `media_plan_versions` (and related Xano reads), then apply hub filters **in the route handler** after derivation. Filter dimensions therefore “reach Xano” only indirectly (month drives version overlap selection; clients/publishers are loaded unfiltered from Xano caches).

**Xano base URL config (grep):**

| Symbol | Where defined / used |
|---|---|
| `XANO_BASE_URL` | `env.local.example` line 29; fallback in `lib/api/xano.ts` (`DEFAULT_ENV_KEYS`, lines 3–4, 23–30) |
| `XANO_CLIENTS_BASE_URL` | `env.local.example` line 18; billing/payables env check (`app/api/finance/billing/route.ts` 22, `payables/route.ts` 13); `xanoFinanceApi.ts` 11–22; `getCachedClients` / `getCachedPublishers` (`lib/finance/xanoReferenceCache.ts` 24, 50) |
| `XANO_MEDIA_PLANS_BASE_URL` / `XANO_MEDIAPLANS_BASE_URL` | `env.local.example` 16–17; `fetchRelevantPlanVersionsForFinanceMonth` (`lib/finance/relevantPlanVersions.ts` 54, 73) |
| `XANO_PUBLISHERS_BASE_URL` | `env.local.example` line 19; `app/api/publishers/route.ts` line 10 |
| `XANO_SCOPES_BASE_URL` | `env.local.example` line 20; billing SOW branch (`app/api/finance/billing/route.ts` 218) |
| `XANO_API_KEY` | `env.local.example` line 65; `lib/api/xano.ts` 60, 68 (optional Bearer on Xano requests) |
| `NEXT_PUBLIC_XANO` | **No matches** in repo |

`xanoUrl(path, keys)` (`lib/api/xano.ts` 27–30): `{resolvedBase}/{path}` e.g. `{XANO_CLIENTS_BASE_URL}/get_clients`.

---

### Client-side fetchers (`lib/finance/api.ts`)

#### `FinanceBillingQuery` type

```12:21:lib/finance/api.ts
export type FinanceBillingQuery = {
  billing_month: string
  clients_id?: string
  publishers_id?: string
  /** When `false`, request sets `include_drafts=0`. Omit or `true` leaves drafts inclusion to API default. */
  include_drafts?: boolean
  billing_type?: string
  status?: string
  search?: string
}
```

#### `fetchBillingRecords`

- **Signature:** `export async function fetchBillingRecords(filters: FinanceFilters): Promise<BillingRecord[]>` (`lib/finance/api.ts` 199–205)
- **Filter fields accepted (input):** full `FinanceFilters` via `filtersToReceivableBillingParams(filters, ["media", "sow", "retainer"])` (47–63, 202–204)
- **Query params serialised (output):** per month via `fetchFinanceBillingForMonths` → `fetchFinanceBilling`: `billing_month`, optional `clients_id`, `publishers_id`, `include_drafts=0` (when false), `billing_type` (intersection with allowed receivable types), `status`, `search` (120–131)
- **Silent drops:** `billingTypes` entries outside `media|sow|retainer` are omitted from `billing_type` (55–58). Empty `selectedClients` / `selectedPublishers` / `statuses` / `searchQuery` omit those params. `includeDrafts === true` omits `include_drafts` (relies on route default). **`toQuery()` (23–37) is dead code** — never called outside its definition.

#### `fetchPayablesRecords`

- **Signature:** `export async function fetchPayablesRecords(filters: FinanceFilters): Promise<BillingRecord[]>` (212–217)
- **Filter fields accepted (input):** full `FinanceFilters` via `filtersToPayablesParams` → `filtersToReceivableBillingParams(filters, ["payable"])` (207–208)
- **Query params serialised (output):** same set as billing, but `billing_type` only if `payable` is in `filters.billingTypes` (55–58)
- **Silent drops:** same as billing; plus payable route **ignores** several serialised params (see payables handler below)

#### `fetchFinanceBillingForMonths`

- **Signature:** `export async function fetchFinanceBillingForMonths(months: string[], params: Omit<FinanceBillingQuery, "billing_month"> = {}, signal?: AbortSignal): Promise<BillingRecord[]>` (138–162)
- **Filter fields accepted (input):** `params` object (hub hooks pass explicit `FinanceBillingQuery` fields, not raw `FinanceFilters`)
- **Query params serialised (output):** one GET per month; each calls `fetchFinanceBilling({ ...params, billing_month: m })` → params listed above (143–145, 120–131)
- **Silent drops:** inherits `fetchFinanceBilling` rules; failed months return `[]` (145–148)

#### `fetchFinancePayablesForMonths`

- **Signature:** `export async function fetchFinancePayablesForMonths(months: string[], params: Omit<FinanceBillingQuery, "billing_month"> = {}): Promise<BillingRecord[]>` (179–197)
- **Filter fields accepted (input):** `params` object
- **Query params serialised (output):** one GET per month via `fetchFinancePayable` → `billing_month`, `clients_id`, `publishers_id`, `include_drafts`, `billing_type`, `status`, `search` (164–172)
- **Silent drops:** inherits `fetchFinancePayable`; **payables route reads only `billing_month`, `clients_id`, `search`** — see mismatches below

---

### Next.js route handlers under `app/api/finance/`

Found **18** `route.ts` files via glob. Hub filter-bar dimensions apply primarily to **billing** and **payables**; others documented for completeness.

#### `app/api/finance/billing/route.ts`

- **Methods:** GET
- **Query params accepted:** `billing_type` (151–155), `billing_month` (157–161), `include_drafts` (163, `!== "0"` → include non-booked), `clients_id` (256), `search` (257), `status` (258), `publishers_id` (259)
- **Query params forwarded to Xano:** **none** — filters applied in Next after derivation. Upstream Xano reads (no filter query string):
  - `fetchRelevantPlanVersionsForFinanceMonth(monthStr)` → `xanoUrl("media_plan_master", …)` + `xanoUrl("media_plan_versions", …)` (`lib/finance/relevantPlanVersions.ts` 53–74)
  - `getCachedClients()` → `xanoUrl("get_clients", "XANO_CLIENTS_BASE_URL")` (`lib/finance/xanoReferenceCache.ts` 23–24)
  - `getCachedPublishers()` → `xanoUrl("get_publishers", "XANO_CLIENTS_BASE_URL")` (49–50)
  - SOW branch: `xanoUrl("scope_of_work", "XANO_SCOPES_BASE_URL")` (218)
- **Mismatches:** none between accepted params and post-derive filters (261–269). Client always sends params the route reads.
- **Upstream Xano URL pattern:** `{XANO_MEDIA_PLANS_BASE_URL or XANO_MEDIAPLANS_BASE_URL}/media_plan_master`, `/media_plan_versions`; `{XANO_CLIENTS_BASE_URL}/get_clients`, `/get_publishers`; `{XANO_SCOPES_BASE_URL}/scope_of_work`

#### `app/api/finance/payables/route.ts`

- **Methods:** GET
- **Query params accepted:** `billing_month` (87–92), `clients_id` (94), `search` (95) only
- **Query params forwarded to Xano:** **none** — filters applied in Next after derivation. Upstream: `fetchRelevantPlanVersionsForFinanceMonth` (same as billing, 102–111) → `derivePayableRecordsForMonth` (125–127)
- **Mismatches:**
  - **Client sends but route ignores:** `publishers_id`, `billing_type`, `status`, `include_drafts` (serialised in `fetchFinancePayable` 167–171; never read in route)
  - Payables hook (`FinanceHubPayablesSection.tsx` 202–212) also applies **publisher** filter client-side in `useMemo` (260); **status / billingTypes / includeDrafts** are not applied client-side in that hook
  - Derived payables use fixed `status: "expected"` (`lib/finance/derivePayableRecords.ts` 129) — hub `statuses` filter cannot match
- **Upstream Xano URL pattern:** same version fetch as billing; no per-filter Xano list endpoint

#### `app/api/finance/publishers/route.ts` (legacy)

- **Methods:** GET
- **Query params accepted:** `month_from`, `month_to`, `range_mode`, `billing_type`, `status`, `clients` (client **names**, not IDs) (53–62)
- **Query params forwarded to Xano:** none on upstream fetch — loads full table then filters in Next
- **Mismatches:** uses different param names than hub (`clients` vs `clients_id`, `month_from` vs `billing_month`); not used by Finance Hub filter bar
- **Upstream Xano URL:** `{XANO_CLIENTS_BASE_URL}/finance_billing_records` (74)

#### `app/api/finance/data/route.ts`

- **Methods:** GET
- **Query params accepted:** `month`, `client` (18–20)
- **Query params forwarded to Xano:** none; `client` filters in Next loop (66+)
- **Mismatches:** not hub filter schema
- **Upstream Xano URL:** `get_clients`, `get_publishers` (38–39) + plan versions via `fetchRelevantPlanVersionsForFinanceMonth`

#### `app/api/finance/sow/route.ts`

- **Methods:** GET
- **Query params accepted:** `month`, `client` (48–50)
- **Query params forwarded to Xano:** none; client filter in handler (69)
- **Mismatches:** not hub filter schema
- **Upstream Xano URL:** `{XANO_SCOPES_BASE_URL}/scope_of_work` (61)

#### `app/api/finance/accrual/route.ts`

- **Methods:** GET
- **Query params accepted:** `months` (CSV YYYY-MM) (206–210)
- **Query params forwarded to Xano:** none
- **Mismatches:** Accrual **hub tab** uses store + `computeAccrualByClient`, not this route for filter bar
- **Upstream Xano URL:** `{XANO_MEDIA_PLANS_BASE_URL}/media_plan_master`, `/media_plan_versions` (233–234)

#### `app/api/finance/hub-schedule-ytd/route.ts`

- **Methods:** GET
- **Query params accepted:** none
- **Query params forwarded to Xano:** via `getFinanceHubScheduleFytdTotals()` (dashboard lib; not filter-driven)
- **Mismatches:** Overview KPI fetch ignores hub filters (Section 1)
- **Upstream Xano URL:** not in this file

#### `app/api/finance/forecast/route.ts`

- **Methods:** GET
- **Query params accepted:** `fy` / `financial_year`, `scenario`, `client`, `q` / `search`, `debug` (45–74, 80–81)
- **Query params forwarded to Xano:** via `loadFinanceForecastDataset` (server-side; not hub `FinanceFilters`)
- **Mismatches:** Forecast tab does not use `useFinanceStore` filters (Section 1)
- **Upstream Xano URL:** inside `loadFinanceForecastDataset` (not inspected here)

#### `app/api/finance/forecast/snapshots/route.ts`

- **Methods:** GET (list), POST (create)
- **Query params accepted (GET):** none
- **POST body filters:** `financial_year`, `scenario`, `client`, `search`/`q`, `debug` (documented 110–112)
- **Upstream Xano URL:** `persistFinanceForecastSnapshotToXano` / `fetchFinanceForecastSnapshotListFromXano` (`XANO_FINANCE_FORECAST_SNAPSHOTS_BASE_URL`)

#### `app/api/finance/forecast/snapshots/variance/route.ts`

- **Methods:** POST
- **Query params accepted:** none (body: `older_snapshot_id`, `newer_snapshot_id`, `include_unchanged`)
- **Upstream Xano URL:** snapshot list/lines via `xanoSnapshotQuery`

#### `app/api/finance/forecast/snapshots/[id]/lines/route.ts`

- **Methods:** GET
- **Query params accepted:** none (path `id`)
- **Upstream Xano URL:** `fetchFinanceForecastSnapshotLinesFromXano`

#### `app/api/finance/receivables/aa-media-plan/route.ts`

- **Methods:** GET
- **Query params accepted:** `mba_number`, `billing_month` (14–17)
- **Upstream Xano URL:** resolved file URL from `resolveRelevantVersionAaMediaPlan` (34)

#### `app/api/finance/edits/route.ts`

- **Methods:** GET, POST
- **Query params accepted (GET):** `finance_billing_records_id` (13–18) — filtered in Next after full list fetch
- **Upstream Xano URL:** `{XANO_CLIENTS_BASE_URL}/finance_edits` via `xanoFinanceGet` (`lib/finance/xanoFinanceApi.ts` 6, 11)

#### `app/api/finance/edits/publish/route.ts`

- **Methods:** POST (body only)
- **Upstream Xano URL:** `{XANO_CLIENTS_BASE_URL}/finance_edits/publish`

#### `app/api/finance/saved-views/route.ts`

- **Methods:** GET, POST
- **Query params accepted:** none
- **Upstream Xano URL:** `{XANO_CLIENTS_BASE_URL}/finance_saved_views`

#### `app/api/finance/billing/[id]/route.ts`

- **Methods:** PATCH
- **Query params:** none
- **Upstream Xano URL:** `{XANO_CLIENTS_BASE_URL}/finance_billing_records/{id}`

#### `app/api/finance/billing/line-items/route.ts`

- **Methods:** POST
- **Upstream Xano URL:** `{XANO_CLIENTS_BASE_URL}/finance_billing_line_items`

#### `app/api/finance/billing/line-items/[id]/route.ts`

- **Methods:** PATCH, DELETE
- **Upstream Xano URL:** `{XANO_CLIENTS_BASE_URL}/finance_billing_line_items/{id}`

---

### Clients & Publishers endpoints

- **`app/api/clients/route.ts`** — path confirmed: **yes**. GET proxies to `getXanoClientsCollectionUrl()` → `xanoUrl("clients", ["XANO_CLIENTS_BASE_URL", "XANO_BASE_URL"])` (`lib/api/xanoClients.ts` 6–8). Returns full Xano client rows (pass-through `withClientSlug`); **`monthlyretainer` not stripped** — present on records if Xano returns it (used by billing derivation: `deriveRetainerBillingRecordsForMonth` reads `monthlyretainer` per `lib/finance/deriveRetainerReceivables.ts` 28). Query: optional `refresh` only (85–86).
- **`app/api/publishers/route.ts`** — path confirmed: **yes**. GET → `xanoUrl("get_publishers", "XANO_PUBLISHERS_BASE_URL")` (line 10). Used by filter toolbar (`FinanceFilterToolbar.tsx` 74). Finance hub billing route uses **`getCachedPublishers`** from `XANO_CLIENTS_BASE_URL/get_publishers` instead — **two publisher list bases** (`XANO_PUBLISHERS_BASE_URL` vs `XANO_CLIENTS_BASE_URL`).

---

### Filter chain integrity table

| Filter dimension | In `FinanceFilters` | Serialised in `lib/finance/api.ts` | Applied by Next route (billing / payables) | Reaches Xano as filter param |
|---|---|---|---|---|
| `selectedClients` → `clients_id` | yes | yes | billing: yes (261); payables: yes (126) | **no** — post-filter in Next |
| `selectedPublishers` → `publishers_id` | yes | yes | billing: yes (264); payables: **no** (client-side only in payables hook UI, 260) | **no** |
| `searchQuery` → `search` | yes | yes | billing: yes (262); payables: yes (127) | **no** |
| `billingTypes` → `billing_type` | yes | yes | billing: yes (266–268); payables: **no** | **no** |
| `statuses` → `status` | yes | yes | billing: yes (263); payables: **no** (derived status `"expected"`) | **no** |
| `includeDrafts` → `include_drafts` | yes | yes (`0` when false) | billing: yes (163, 211–212); payables: **no** | **no** |
| `monthRange` → `billing_month` | yes | yes (fan-out per month) | billing/payables: yes (month drives version overlap) | **partial** — month only affects which plan versions are loaded from Xano; not a Xano query filter |

---

### Identified breakpoints

- **`GET /api/finance/payables` ignores `publishers_id`, `billing_type`, `status`, `include_drafts`** even though `fetchFinancePayable` / `fetchFinancePayablesForMonths` send them (`lib/finance/api.ts` 167–171; route reads only 87–95). Primary code-level break for Payables tab status/type/draft filters.
- **Payables derived rows use `status: "expected"`** (`lib/finance/derivePayableRecords.ts` 129) — hub `statuses` filter (draft/booked/approved/…) cannot apply to payables data model.
- **Publisher filter on payables** may still work via **client-side** `filterPayablesByPublisherIds` in `useFinanceHubPayablesData` (260) after fetching an unfiltered month dataset — depends on full payload size, not route filtering.
- **Hub billing/payables never pass filter params to Xano** — all client/publisher/status/search filtering is in-memory after loading overlapping plan versions for the month. Wrong or empty results may reflect derivation logic, not Xano list filters.
- **`fetchRelevantPlanVersionsForFinanceMonth`** loads all latest versions overlapping the month — **no `clients_id` / `publishers_id` on upstream Xano fetch** (`lib/finance/relevantPlanVersions.ts` 32–106).
- **Two publisher API bases:** toolbar `GET /api/publishers` (`XANO_PUBLISHERS_BASE_URL`) vs billing route cache `get_publishers` on `XANO_CLIENTS_BASE_URL` — ID/name maps could diverge if tables differ.
- **`toQuery()` in `lib/finance/api.ts` (23–37) is unused** — dead helper; live path is `filtersToReceivableBillingParams` + `fetchFinanceBilling`.
- **Legacy `GET /api/finance/publishers`** uses `finance_billing_records` and different query param names — not the hub payables path.

---

### Xano-side verification needed

Cannot inspect Xano Function Stacks from this repo. Luke should confirm:

- **`get_clients`** on `XANO_CLIENTS_BASE_URL` returns `monthlyretainer` (and `id`) for retainer receivable derivation in billing route.
- **`get_publishers`** on `XANO_CLIENTS_BASE_URL` vs `XANO_PUBLISHERS_BASE_URL` return the same publisher `id` / `publisher_name` pairs used for `publishers_id` → name mapping in billing route (96–118).
- **`media_plan_versions` / `media_plan_master`** overlap logic matches product expectation for “billing month” (campaign date overlap only).
- If any workflow still calls **`finance_billing_records`** with query filters, confirm that stack accepts `clients_id`, `billing_month`, etc. — hub rebuild routes **do not** use that table for billing/payables lists (comments at `billing/route.ts` 24–29, `payables/route.ts` 15–19).
- **`scope_of_work`** endpoint returns scopes needed for SOW receivables when `billing_type` includes `sow`.

## 3. Billing write surfaces

**Lock spec (context only):** `billing_month` YYYY-MM is locked when `now >= startOfMonth(addMonths(billingMonth, 1)) + 60 days` (e.g. Jan 2026 locked from 2 Apr 2026 UTC). Stage 2 = client gates; Stage 3 = server gates.

**Hub mount note:** AssembledView Finance Hub **Billing** tab uses `AlterBillingDialog` only (`app/finance/FinanceHubPageClient.tsx` 728, 863–901). `EditableFinanceGrid` is **not** mounted on hub Billing/Payables panels (`FinancePayablesPanel` → `FinanceHubPayablesSection` has no grid). `ReceivablesTab` / `PayablesTab` exist but are **not** imported by the hub shell (see Section 1). `AccrualTab` mounts the grid with `noopCellEdit` (no writes).

**`monthYear` vs `YYYY-MM`:** `BillingMonth.monthYear` is documented as display labels (e.g. `"January 2025"`, `lib/billing/types.ts` 60). Lock predicate may need `extractBillingMonthStart` (`lib/spend/billingScheduleExpectedToDate.ts` 52–68) or a normaliser — see Open questions.

---

### Client-side write surfaces

#### AlterBillingDialog

- **File:** `components/billing/AlterBillingDialog.tsx`
- **Editable fields per row:**
  - Line items: `lineItem.monthlyAmounts[monthYear]` per media column (`handleLineItemAmountChange`, 119–147; inputs 247–258)
  - Month costs: `feeTotal`, `adservingTechFees`, `production` (and `mediaCosts.production` when production changes) via `handleCostChange` (149–167; inputs 325–329)
  - Derived (not directly edited): `mediaCosts[mediaKey]`, `mediaTotal`, `totalAmount` recalculated in `recalculateMonths` (62–80)
- **Row identity (lock predicate input):** `BillingMonth.monthYear` on each column/row (`m.monthYear` at 135–136, 229–231, 304–306)
- **Save trigger:** “Save Billing Changes” button → `handleSaveClick` (169–181) → `onSave(deepCloneMonths(months))`
- **Save endpoint (from `app/finance/FinanceHubPageClient.tsx` 876–881):** `PATCH /api/mediaplans/versions/${versionId}/billing-schedule`
- **Save body shape:** `{ billingSchedule: buildBillingScheduleJSON(newMonths) }` — array of `{ monthYear, mediaTypes[], feeTotal, production, adservingTechFees? }` (`lib/billing/buildBillingSchedule.ts` 16–22, 79–146)
- **Currently checks role:** no (dialog has no auth)
- **Currently checks lock:** no
- **Stage 2 gate target:** per-month column inputs (247–258, 325–329) and Save button (393–398); optionally disable entire dialog open from hub when all months locked

#### EditableFinanceGrid

- **File:** `components/finance/EditableFinanceGrid.tsx` (prompt cited `components/finance/grid/` — **that path does not exist**)
- **Editable fields per row:** driven by `editableFields` prop + column `meta.finance.field` / `accessorKey`. Cell kinds: `status` (Combobox 781–794), `date` (`invoice_date`, 796–817), `currency` (`total`, 819–859), `number` (`payment_days`, 861–898), `text` (default, 901–917). `commitField` (417–455) calls `onCellEdit(record.id, field, value)` then optional zustand `updateBillingRecord`.
- **Row identity:** `record.billing_month` on each `BillingRecord` (`BillingRecord.billing_month`, `lib/types/financeBilling.ts` 64)
- **Save trigger:** blur / Enter / paste on editable cells → `commitField` → `onCellEdit`; footer “Publish” → `POST /api/finance/edits/publish` with body `{}` (466–472); “Discard drafts” → `fetchBilling()` only (458–463)
- **Save endpoint(s) (via callers):**
  - `ReceivablesTab` `onCellEdit` (511–523): `PATCH /api/finance/billing/${id}` via `updateBillingRecord` (`lib/finance/api.ts` 251–260)
  - `PayablesTab` `onCellEdit` (165–171): same; `handlePublisherChange` (174–185): `PATCH` with `{ line_items }`
  - Detail panel `ReceivablesLineItemsPanel` (282–327): `PATCH /api/finance/billing/line-items/${id}`, `DELETE` same, `POST /api/finance/billing/line-items`; parent record `PATCH` via `pushUpdatedRecord` (260–270)
- **Save body shape:** `Partial<BillingRecord>` field map, e.g. `{ status }`, `{ po_number }`, `{ invoice_date }`, `{ total }`; line item `{ amount }` or `{ description }`; publish `{}` or `{ finance_billing_records_id }` from `publishEdits` (not used by grid footer)
- **Currently checks role:** no
- **Currently checks lock:** no
- **Stage 2 gate target:** `renderBodyCell` editable branch (780–918) — disable inputs/combobox/date picker per `record.billing_month`; footer Publish/Discard (1112–1124) if any draft row includes locked month

**Hub / Accrual:** `FinanceAccrualPanel` → `AccrualTab` uses `onCellEdit={noopCellEdit}` (`AccrualTab.tsx` 242, 438) — **no billing writes**.

**Dead in hub but implemented:** `ReceivablesTab.tsx`, `PayablesTab.tsx` — same grid patterns as above if re-wired.

#### Edit page (`app/mediaplans/mba/[mba_number]/edit/page.tsx`) billing-schedule edits

Path confirmed: **`app/mediaplans/mba/[mba_number]/edit/page.tsx`** (not under `app/(authenticated)/`).

| Surface | File:lines | State setter | Field(s) mutated | Row `billing_month` source | Persist path |
|---|---|---|---|---|---|
| Manual billing modal — line item month cell | 8823–8848 | `setManualBillingMonths` (onChange 8837); `handleManualBillingChange` → `setManualBillingMonths` (8840–8847) | `lineItem.monthlyAmounts[month.monthYear]`; cascades `mediaCosts`, `mediaTotal`, `totalAmount` via `handleManualBillingChange` (3536–3664) | `month.monthYear` from `manualBillingMonths` | Modal “Save” → `setWorkingBillingMonths` (4641–4642); campaign save → `PUT /api/mediaplans/mba/${mbaNumber}` with `billingSchedule` (4835–4850) |
| Manual billing modal — fee row | 8983–8991 | `setManualBillingMonths` / `handleManualBillingChange(..., "fee", ...)` | `feeTotal` (3636) | `manualBillingMonths[monthIndex].monthYear` | Same as above |
| Manual billing modal — ad serving row | 9039–9047 | same pattern | `adservingTechFees` (3638) | same | same |
| Manual billing modal — production row | 9096–9109 | same pattern | `production`, `mediaCosts.production` (3639–3643) | same | same |
| Modal commit (no HTTP until plan save) | 4628–4653 | `setWorkingBillingMonths(applied)` | full `BillingMonth[]` snapshot | each `BillingMonth.monthYear` | `handleManualBillingSave` only updates working state |
| Campaign / version save | 4800–4850 | `setSavedBillingMonths` after success (4868–4869) | `billingSchedule` JSON from `buildBillingScheduleForSave()` → `workingBillingMonths` | every entry `.monthYear` in schedule array | `PUT /api/mediaplans/mba/${mbaNumber}` body includes `billingSchedule`, `deliverySchedule` |
| Read-only summary table | 8148–8156 | none (display only) | — | `m.monthYear` displayed | — skipped per prompt |

Pre-bill / reset controls in the same modal mutate distributions but are not separate HTTP writes until save (`handleManualBillingLineItemPreBillToggle` 3688+, reset handlers 4114+, 3788+).

---

### Server-side write surfaces

#### `app/api/mediaplans/versions/[id]/billing-schedule/route.ts`

- **Method(s):** PATCH
- **Body shape:** `{ billingSchedule: unknown }` required (29–36)
- **Contains `billing_month` per row:** **yes** — each schedule entry has `monthYear` (and nested line amounts keyed by `monthYear` in persisted JSON). Extract via parsing `billingSchedule` array entries’ `monthYear` / `month_year` / `month` (`lib/billing/parsePersistedBillingScheduleToMonths.ts` 76–77)
- **Currently checks role:** no
- **Currently checks lock:** no
- **Xano endpoint:** `PATCH {XANO_MEDIA_PLANS_BASE_URL or XANO_MEDIAPLANS_BASE_URL}/media_plan_versions/{id}` with body `{ billingSchedule }` (38–40)
- **Stage 3 gate target:** after parsing body, before `axios.patch` (38), reject if any entry’s month is locked; return 403 with locked month list

#### `app/api/mediaplans/mba/[mba_number]/route.ts` (PUT — new version)

- **Method(s):** PUT (1254–1354); also PATCH on master (1414+) without `billingSchedule` in snippet reviewed
- **Body shape:** full plan payload including `billingSchedule`, `deliverySchedule` (1347–1350)
- **Contains `billing_month` per row:** **yes** — same `billingSchedule` JSON shape as above
- **Currently checks role:** no (comments: “allow access for development”, 1264)
- **Currently checks lock:** no
- **Xano endpoint:** `POST {mediaPlansBaseUrl}/media_plan_versions` (1354); `PATCH .../media_plan_master/{id}` (1366)
- **Stage 3 gate target:** before `axios.post` new version (1354), validate all months in `data.billingSchedule`

#### `app/api/finance/billing/[id]/route.ts`

- **Method(s):** PATCH
- **Body shape:** arbitrary `Partial<BillingRecord>` JSON (12–13)
- **Contains `billing_month`:** **indirectly** — record `id` must be resolved to row (or require `billing_month` in body if PATCH allows changing it). Hub edits use fields like `status`, `po_number`, `invoice_date`, `total` without changing `billing_month`.
- **Currently checks role:** no
- **Currently checks lock:** no
- **Xano endpoint:** `PATCH {XANO_CLIENTS_BASE_URL}/finance_billing_records/{id}` (`lib/finance/xanoFinanceApi.ts` 20–22)
- **Stage 3 gate target:** load record month (from Xano response or GET) before patch; reject if `billing_month` locked

#### `app/api/finance/billing/line-items/route.ts`

- **Method(s):** POST
- **Body shape:** line item fields + `finance_billing_records_id` (POST handler 7–9)
- **Contains `billing_month`:** **no** in body — derive from parent `finance_billing_records_id`
- **Currently checks role:** no
- **Currently checks lock:** no
- **Xano endpoint:** `POST {XANO_CLIENTS_BASE_URL}/finance_billing_line_items`
- **Stage 3 gate target:** resolve parent record’s `billing_month` before post

#### `app/api/finance/billing/line-items/[id]/route.ts`

- **Method(s):** PATCH, DELETE
- **Body shape (PATCH):** partial line item (16–17)
- **Contains `billing_month`:** **no** — resolve via line item → parent record
- **Currently checks role:** no
- **Currently checks lock:** no
- **Xano endpoint:** `PATCH` / `DELETE {XANO_CLIENTS_BASE_URL}/finance_billing_line_items/{id}`
- **Stage 3 gate target:** resolve parent record month before patch/delete

#### `app/api/finance/edits/route.ts`

- **Method(s):** POST
- **Body shape:** finance edit row (accrual reconcile, field changes, etc.) (28–31)
- **Contains `billing_month`:** **sometimes** — accrual edits encode month in `field_name` (`postAccrualReconcileEdit`, `lib/finance/api.ts` 235–239); billing record edits use `finance_billing_records_id`
- **Currently checks role:** no
- **Currently checks lock:** no
- **Xano endpoint:** `POST {XANO_CLIENTS_BASE_URL}/finance_edits`
- **Stage 3 gate target:** if edit targets a billing record or accrual month, enforce lock on that month

#### `app/api/finance/edits/publish/route.ts`

- **Method(s):** POST
- **Body shape:** optional `finance_billing_records_id` (grid sends `{}`, 468–471)
- **Contains `billing_month`:** via record id when provided
- **Currently checks role:** no
- **Currently checks lock:** no
- **Xano endpoint:** `POST {XANO_CLIENTS_BASE_URL}/finance_edits/publish`
- **Stage 3 gate target:** reject publish if any affected records span locked months

#### `app/api/finance/saved-views/route.ts`

- **Method(s):** POST — saves view metadata/filters, **not** billing schedule rows (23–27). Listed for completeness; low lock relevance unless views trigger writes.

---

### Summary: lock gate targets

**Client-side gates (Stage 2):**

| Component file | Line range | Disable mechanism |
|---|---|---|
| `components/billing/AlterBillingDialog.tsx` | 247–258, 325–329 | Disable `Input` `onBlur` handlers per `month.monthYear`; disable Save 393–398 |
| `app/finance/FinanceHubPageClient.tsx` | 728 | Hide/disable “Alter Billing” when media plan months all locked |
| `components/finance/EditableFinanceGrid.tsx` | 780–918 | Skip `startEdit` / disable controls when `record.billing_month` locked |
| `components/finance/EditableFinanceGrid.tsx` | 1112–1124 | Disable Publish/Discard when draft rows include locked months |
| `components/finance/tabs/ReceivablesTab.tsx` | 398–415, 511–523 | Line item inputs + grid (if tab mounted) |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx` | 8823–9109 | Manual billing modal inputs per `month.monthYear` |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx` | 9212, 9173 | Modal save + campaign save buttons |

**Server-side gates (Stage 3):**

| Route file | Method | Per-row rejection point |
|---|---|---|
| `app/api/mediaplans/versions/[id]/billing-schedule/route.ts` | PATCH | Before `axios.patch` (38): validate each `billingSchedule[].monthYear` |
| `app/api/mediaplans/mba/[mba_number]/route.ts` | PUT | Before `axios.post` version (1354): validate `data.billingSchedule` months |
| `app/api/finance/billing/[id]/route.ts` | PATCH | Before `xanoFinancePatch`: load record, check `billing_month` |
| `app/api/finance/billing/line-items/route.ts` | POST | Before post: parent record month |
| `app/api/finance/billing/line-items/[id]/route.ts` | PATCH, DELETE | Before patch/delete: parent record month |
| `app/api/finance/edits/route.ts` | POST | Before post: target record/month |
| `app/api/finance/edits/publish/route.ts` | POST | Before publish: all records in publish set |

---

### Open questions for Stages 2/3

- **Multi-month PATCH bodies:** For `billing-schedule` PATCH and MBA PUT, if any month in the payload is locked, **reject entire request with 403 + list of locked months** (recommended) vs partial apply.
- **`monthYear` format:** Schedule rows use `"January 2025"` style labels, while lock spec uses `YYYY-MM`. Confirm normalisation (`extractBillingMonthStart`, `parse(month, "MMMM yyyy")`, or stored alternate keys) before implementing `isBillingMonthLocked`.
- **Derived vs persisted hub data:** Hub receivables are derived from `media_plan_versions.billingSchedule` (Section 2); `finance_billing_records` PATCH may apply only to legacy/Xano-persisted rows (`ReceivablesTab` dead in hub). Clarify whether lock gates apply to **schedule JSON edits only** or also **synthetic record metadata** edits if those UI paths return.
- **`POST /api/finance/edits/publish` with `{}`:** Grid publish does not pass `finance_billing_records_id` (466–471) — confirm server behaviour before gating publish.
- **Super-admin override:** Stage 5 “Edit locked row” — server must accept an explicit override flag or role check not present in any route today.

## 4. Auth0 role model today

### SDK and instance

- **Auth0 SDK:** `@auth0/nextjs-auth0` **^4.11.0** (`package.json` line 25) — v4 API (`Auth0Client`, `auth0.middleware`, `/auth/[auth0]` catch-all).
- **`lib/auth0.ts` exports:**
  - `auth0` — `new Auth0Client({ authorizationParameters, beforeSessionSaved })` (24–67)
  - `baseAuthParams` — `{ scope, audience }` (19–22)
- **Session retrieval pattern (server):** `await auth0.getSession(request)` in route handlers / middleware (`middleware.ts` 39, `lib/requireRole.ts` 36, finance forecast routes, etc.). Catch-all auth routes: `app/auth/[auth0]/route.ts` delegates `GET`/`POST` to `auth0.middleware` (1–6).
- **Session retrieval pattern (client):**
  - `useUser()` from `components/AuthWrapper.tsx` (7–27) — wraps `useUser` from `@auth0/nextjs-auth0/client`
  - `useAuthContext()` from `contexts/AuthContext.tsx` (64–69) — derives `userRoles`, `isAdmin`, `isClient`, `userRole` via `getUserRoles` / `getHighestRole` (31–52)
  - App shell: `Auth0Provider` in `app/providers.tsx` (18); `AuthContextProvider` in `components/ClientLayout.tsx` (34–35)
  - **No `useIsSuperAdmin` today** — Stage 4 should add it (model on `useAuthContext` or extend `AuthContextValue`)

**Note:** `lib/utils/auth.ts` (7–8) instantiates a second bare `Auth0Client()` for legacy helpers (`getServerSession`, `withApiRouteAuth`). Primary instance for middleware and routes is `lib/auth0.ts` `auth0`.

### Roles claim

- **Namespace (primary):** `https://assembledview.com/roles` (`lib/rbac.ts` 10; `env.local.example` 41)
- **Alternate namespace:** `https://assembledview.com.au/roles` (`lib/rbac.ts` 11; overridable via `AUTH0_ROLE_NAMESPACE` / `NEXT_PUBLIC_AUTH0_ROLE_NAMESPACE`)
- **Claim key in `session.user`:** first matching key from `ROLE_NAMESPACE_CANDIDATES` plus singular variant `…/role` (`scanRoleNamespaces`, 168–172). Typically `session.user["https://assembledview.com/roles"]` or `.com.au` variant.
- **Persistence onto session:** `beforeSessionSaved` in `lib/auth0.ts` (27–65) copies role/client claims from the ID token onto `session.user` if present.
- **`getUserRoles` implementation (verbatim):**

```ts
export function getUserRoles(user: User | null | undefined): UserRole[] {
  return getUserRolesWithSource(user).roles;
}
```

(`lib/rbac.ts` 382–384). Resolution order is in `getUserRolesWithSource` (248–286): namespaced ID token claims → `app_metadata.role(s)` → `user_metadata.role(s)` → optional permission inference.

- **Return type:** `UserRole[]` where `UserRole = 'admin' | 'manager' | 'client'` (`lib/rbac.ts` 3, 382–384)
- **Auth0 role name normalisation:** `normalizeRole` maps `"Assembled Admin"`, `assembled_admin`, etc. → `'admin'` (113–124). Raw strings outside `admin` | `manager` | `client` are dropped.

### Currently recognised roles

| Role | Purpose / where checked |
|---|---|
| `admin` | Full internal access; `requireAdmin` / `roles.includes("admin")` on admin APIs, pacing admin, finance forecast snapshots, chat-v2; `AdminGuard`; sidebar/admin UI (`UserMenu.tsx` 101); `canAccessPage` clients-only for admin (`lib/rbac.ts` 496) |
| `manager` | Internal user with finance/mediaplans/publishers per `ROLE_PERMISSIONS` and `canAccessPage` (`lib/rbac.ts` 494–502); `getHighestRole` priority below admin (479–480); displayed on profile/account pages; **few explicit `includes('manager')` route gates** — mostly inherits non-`client` middleware path |
| `client` | Tenant-scoped dashboard user; `middleware.ts` redirects and dashboard slug enforcement (86–109); `requireTenantAccess` / API client slug checks; blocked from finance forecast (`app/api/finance/forecast/route.ts` 38) and accrual API (`app/api/finance/accrual/route.ts` 199) |

**Not recognised today:** `super_admin` (or any string other than the three above after `normalizeRole`).

### Role check sites

| File | Line(s) | Role(s) checked | Context |
|---|---|---|---|
| `middleware.ts` | 50–51, 76–78 | `client` | API: client must have client slug; pages: client vs admin routing |
| `lib/tenant-guard.ts` | 22–25 | `client` | API tenant isolation — non-client bypasses |
| `lib/requireRole.ts` | 42–45, 81 | `admin` (default) | `requireRole` / `requireAdmin` / `requireAdminUser` for API routes |
| `lib/rbac.ts` | 449–511 | `admin`, `manager`, `client` | `hasRole`, `canAccessPage`, `getHighestRole` helpers |
| `lib/utils/auth.ts` | 45, 72 | `UserRole` via `hasRole` | Legacy API/page wrappers |
| `lib/pacing/pacingAuth.ts` | 31–32, 172–173 | `admin` | Pacing session gate / scope |
| `lib/pacing/pacingScopeServer.ts` | 15–16 | `admin` | Admin → null scope (all clients) |
| `contexts/AuthContext.tsx` | 51–52 | `admin`, `client` | Client `isAdmin` / `isClient` flags |
| `components/guards/AdminGuard.tsx` | 33–42 | `admin` (via `isAdmin`) | Client page guard |
| `components/UserMenu.tsx` | 48, 101 | all via `getUserRoles`; `admin` for menu | Client chrome |
| `components/AppSidebar.tsx` | 43 | `isAdmin` | Nav visibility |
| `components/CommandPalette.tsx` | 145 | `isAdmin`, `userClient` | Command palette scope |
| `components/dashboard/DashboardOverview.tsx` | 947 | `userRole`, `isClient` | Dashboard client |
| `app/dashboard/page.tsx` | 14–17 | `client`, `admin` | Server component redirect logic |
| `app/pacing/portfolio/page.tsx` | 27–28 | `admin` | Server page |
| `app/pacing/(shell)/settings/page.tsx` | 13–14 | `admin` | Server page |
| `app/admin/auth-debug/page.tsx` | 14–15 | `admin` | Server page |
| `app/account/page.tsx` | 62–64 | `admin`, `manager` | Client page badges |
| `app/profile/page.tsx` | 55 | all (display) | Client page |
| `app/api/me/route.ts` | 14–18 | `admin` | Returns `roles`, `isAdmin` JSON |
| `app/api/finance/forecast/route.ts` | 37–38, 69 | `client`, `admin` | Forecast API auth + tenant scoping |
| `app/api/finance/forecast/snapshots/route.ts` | 35, 80, 123 | `admin` | Snapshot list/create |
| `app/api/finance/forecast/snapshots/[id]/lines/route.ts` | 21, 30 | `admin` | Snapshot lines |
| `app/api/finance/forecast/snapshots/variance/route.ts` | 30, 77 | `admin` | Variance POST |
| `app/api/finance/accrual/route.ts` | 198–199 | `client` | Forbidden for client role |
| `app/api/pacing/line-items/route.ts` | 43–46 | `admin` | Response metadata |
| `app/api/pacing/send-daily-summary/route.ts` | 218–219 | `admin` | Cron/admin gate |
| `app/api/chat-v2/route.ts` | 45–46 | `admin` | Chat API |
| `lib/ava/openAvaGptHandler.ts` | 49 | `admin` | MBA context for admins |
| `app/api/admin/users/route.ts` | via `requireAdmin` | `admin` | User provisioning |
| `app/api/admin/clients/refresh-slug/route.ts` | via `requireAdmin` | `admin` | |
| `app/api/admin/client-hub/route.ts` | via `requireAdmin` | `admin` | |
| `app/api/pacing/mappings/resync/route.ts` | via `requireAdmin` | `admin` | |
| `app/api/debug/env-check/route.ts` | via `requireAdmin` | `admin` | |
| `app/pacing/actions.ts` | via `requireAdminUser` | `admin` | Server actions |

**Finance Hub (`app/finance/FinanceHubPageClient.tsx`, `components/finance/*`):** no `getUserRoles` / `useAuthContext` usage found — access is **authenticated user** via middleware session only; no finance-specific role gate in UI or finance API routes (except forecast/accrual sub-APIs above).

### Stage 4 plumbing plan (what changes are needed)

1. **`lib/rbac.ts`:** Extend `UserRole` with `'super_admin'` (or keep as separate claim string normalised in `normalizeRole`). Add `isSuperAdmin(user): boolean` (and optionally `isSuperAdminRole(role)`). Update `getHighestRole` ordering so `super_admin` ranks above `admin`. Add `super_admin` to `ROLE_PERMISSIONS` if permission checks should inherit admin capabilities plus override rights.
2. **Client hook:** Extend `AuthContextValue` in `contexts/AuthContext.tsx` with `isSuperAdmin: boolean` (computed via `userRoles.includes('super_admin')` or helper). Consumers (`AdminGuard`, Finance Hub lock UI in Stage 5) should use `useAuthContext()` — no separate Auth0 hook required if context is already mounted (it is, via `ClientLayout`).
3. **Auth0 dashboard (manual, flagged for Stage 4 doc):** Create `super_admin` role in Auth0; assign to users; update Post-Login Action in `docs/auth0-rbac.md` (14–30) to include the role in `api.idToken.setCustomClaim("https://assembledview.com/roles", roles)`; set `AUTH0_ROLE_*` env IDs if Management API provisioning is used (`lib/api/auth0Management.ts` 49–54 currently only `admin` | `client`).

### Open questions for Stages 4/5

- **Post-login Action source of truth:** Documented only in `docs/auth0-rbac.md` (10–30). **No** `.auth0/` directory or `actions/` folder in repo — Action lives in Auth0 dashboard unless exported elsewhere.
- **Roles caching:** Roles are **not** stored in `localStorage` for auth. Session lives in Auth0 SDK cookies; `useAuthContext` recomputes from `user` on each render. Other `localStorage` keys (finance saved views, dashboard pins, pacing view id) are unrelated — role changes take effect on **next login / session refresh** after Action updates.
- **`manager` vs `admin` on finance hub:** Managers can reach `/finance` today (non-client middleware path) with no extra server check on billing/payables APIs — confirm whether `super_admin` should be finance-override only or also `manager`.
- **Dual Auth0 clients:** `lib/utils/auth.ts` vs `lib/auth0.ts` — ensure new session helpers use the configured `auth0` export with `beforeSessionSaved`.

## 5. Retainer data flow

**Discovery note:** Retainer synthesis is **already implemented** server-side. `GET /api/finance/billing` calls `deriveRetainerBillingRecordsForMonth` (`app/api/finance/billing/route.ts` 243–246) using clients from `getCachedClients()` (`lib/finance/xanoReferenceCache.ts` 12–28 → Xano `get_clients`). The Finance Hub Billing tab loads receivables via `fetchFinanceBillingForMonths` → that route (`app/finance/FinanceHubPageClient.tsx` 316–320). Stage 6 is likely **hardening** (publisher filter, stable `id`, spec alignment) rather than greenfield injection.

---

### `BillingRecord` shape (verbatim from `lib/types/financeBilling.ts`)

```ts
export type BillingType = "media" | "sow" | "retainer" | "payable"

export type BillingStatus =
  | "draft"
  | "booked"
  | "approved"
  | "invoiced"
  | "paid"
  | "cancelled"
  | "expected"
  | "disputed"

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
  network?: string | null
  platform?: string | null
  placement?: string | null
  market?: string | null
  title?: string | null
  ad_size?: string | null
  site?: string | null
  station?: string | null
  format?: string | null
  bid_strategy?: string | null
  creative?: string | null
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
```

**Required vs optional (TypeScript):**

| Field | Required? | Notes |
|---|---|---|
| `id` | required | `number` (not branded) |
| `billing_type` | required | `"retainer"` is a valid member |
| `clients_id` | required | `number` |
| `client_name` | required | `string` |
| `mba_number` | required key, value `string \| null` | |
| `campaign_name` | required key, value `string \| null` | |
| `po_number` | required key, value `string \| null` | |
| `billing_month` | required | `YYYY-MM` in hub path |
| `invoice_date` | required key, value `string \| null` | |
| `payment_days` | required | `number` |
| `payment_terms` | required | `string` |
| `status` | required | `BillingStatus` enum |
| `line_items` | required | array (may be empty) |
| `total` | required | `number` |
| `has_pending_edits` | required | `boolean` |
| `source_billing_schedule_id` | required key, value `number \| null` | |
| `media_plan_version_id` | optional | |
| `media_plan_version_number` | optional | |
| `finance_accrual` | optional | |

**`monthlyretainer` on clients:** Xano field `monthlyretainer`; parsed as `number` in `deriveRetainerBillingRecordsForMonth` (`lib/finance/deriveRetainerReceivables.ts` 28–29). `/api/clients` returns full Xano client objects pass-through (`app/api/clients/route.ts` 99–107) — field present if Xano returns it (forms use `z.number()` in `lib/validations/client.ts` 38). Billing route uses **`getCachedClients()`** (direct Xano `get_clients`), not the Next `/api/clients` route.

---

### Receivables consumers — fields read per `BillingRecord`

| Component | File:line | Fields touched |
|---|---|---|
| `HubReceivableRecordArticle` | `app/finance/FinanceHubPageClient.tsx` 174–220 | `status`, `invoice_date`, `billing_type`, `total`, `line_items` (length, `sort_order`, `item_code`, `line_type`, `amount` via `formatLineItemDescription`) |
| `useFinanceHubReceivablesData` (grouping) | `app/finance/FinanceHubPageClient.tsx` 351–390 | `billing_month`, `clients_id`, `client_name`, `billing_type`, `mba_number`, `campaign_name`, `total`, `media_plan_version_id`, `media_plan_version_number` (media/sow only) |
| `FinanceHubReceivablesSection` | `app/finance/FinanceHubPageClient.tsx` 442–860 | `MonthGroup`: `monthIso`/`monthLabel`/`total` from `billing_month`; `ClientGroup`: `clientsId` ← `clients_id`, `clientName` ← `client_name`, `total`; `retainers[]` for `billing_type === "retainer"`; `MediaPlanGroup`: `mbaNumber`, `campaignName`, `records`, `versionId`/`versionNumber` (Alter Billing — **not** used for retainers) |
| `ReceivablesTab` | `components/finance/tabs/ReceivablesTab.tsx` | **Dead in hub** (Section 1). If revived: `client_name`, `mba_number`, `billing_type`, `campaign_name`, `billing_month`, `status`, `po_number`, `invoice_date`, `total`, `id`, `line_items` (editable grid — conflicts with “not editable” spec) |

**Publisher helpers:** `lib/finance/aggregatePayablesPublisherGroups.ts` is **not** imported by the hub receivables path. Publisher filtering happens in **`app/api/finance/billing/route.ts`** `filterByPublisherIds` (96–118).

---

### Synthesis injection point

- **Route file:** `app/api/finance/billing/route.ts` (hub receivables read path per Section 2 — not a separate `/receivables` route)
- **Method:** GET (`export async function GET`, 140)
- **Where in the handler:** **After** plan/SOW/retainer derivation, **before** response:
  1. Derive media/SOW/retainer into `derived` (202–247)
  2. Merge/dedupe via `receivableMergeKey` (249–254)
  3. Apply `filterByClients`, `filterBySearch`, `filterByStatuses`, `filterByPublisherIds` (256–264)
  4. Optional `billing_type` intersection (266–268)
  5. `return NextResponse.json({ records: merged })` (271)
- **Client data access:** **Already present** — `const [clients, publishers] = await Promise.all([getCachedClients(), getCachedPublishers()])` (193). `getCachedClients()` → `xanoUrl("get_clients", "XANO_CLIENTS_BASE_URL")` (`lib/finance/xanoReferenceCache.ts` 23–24). No new Xano fetch required unless cache TTL (30s) is insufficient.

**Existing synthesiser:** `lib/finance/deriveRetainerReceivables.ts` `deriveRetainerBillingRecordsForMonth` (17–78) — one row per client with `monthlyretainer > 0` for the requested calendar month.

---

### Synthetic retainer `BillingRecord` shape

Aligned with **current** `deriveRetainerBillingRecordsForMonth` output (57–74); Stage 6 may adjust `id` and publisher-filter behaviour.

| Field | Type | Synthetic value (current implementation) |
|---|---|---|
| `id` | `number` | `0` today — **collision risk** if multiple retainers merged; recommend stable negative id e.g. `-(clients_id * 10000 + month)` or hash of `retainer:${clients_id}:${billing_month}` |
| `billing_type` | enum | `"retainer"` |
| `billing_month` | `string` | `` `${year}-${String(month).padStart(2, "0")}` `` (23) |
| `clients_id` | `number` | `Number(c.id)` from Xano client row (39) |
| `client_name` | `string` | `clientname_input ?? mp_client_name ?? name` (36–37) |
| `total` | `number` | `monthlyretainer` rounded to 2 dp (33–34) — **not** `total_amount` (field is `total`) |
| `status` | enum | `"booked"` (69) |
| `line_items` | array | One synthetic line: `line_type: "retainer"`, `description: "Monthly retainer"`, `publisher_name: null`, `amount` = total (42–55) |
| `mba_number` | `string \| null` | `null` (62) — grouping uses empty MBA; retainers go to `client.retainers[]` not media plan buckets (367–370) |
| `campaign_name` | `string \| null` | `null` (63) |
| `po_number` | `string \| null` | `null` (64) |
| `invoice_date` | `string \| null` | `formatInvoiceDate(year, month)` (66) |
| `payment_days` | `number` | client `payment_days` or 30 (40–41) |
| `payment_terms` | `string` | client `payment_terms` or `"Net 30 days"` (41–42) |
| `has_pending_edits` | `boolean` | `false` (72) |
| `source_billing_schedule_id` | `number \| null` | `null` (73) |
| `media_plan_version_id` | optional | omitted (`undefined`) |
| `media_plan_version_number` | optional | omitted |

**Editability (hub):** Retainers render via read-only `HubReceivableRecordArticle` (830–846). No `EditableFinanceGrid`, no Alter Billing on retainer section (Alter Billing only on `MediaPlanGroup` with `versionId`/`mbaNumber`, 512–738). Matches spec “not editable.”

---

### Filter interactions

| Filter | Behaviour for retainer rows |
|---|---|
| `selectedClients` | **Standard** — `filterByClients` matches `String(r.clients_id)` to CSV (58–65, 261). Empty selection = all clients. |
| `selectedPublishers` | **Current:** `filterByPublisherIds` **keeps** retainer (and SOW) rows when any publisher ID filter is active (112–113: `if (r.billing_type === "retainer" \|\| r.billing_type === "sow") return true`). **Spec recommendation:** hide retainers when `selectedPublishers.length > 0` — **requires Stage 6 change** to billing route filter. |
| `searchQuery` | Server `filterBySearch` (68–83): case-insensitive **substring** on joined haystack of `client_name`, `mba_number`, `campaign_name`, `billing_month`, `status`, and line item text. Literal `"retainer"` matches via line item `description: "Monthly retainer"` (49). Does **not** match `billing_type` string alone. |
| `billingTypes` | `wantRetainer` when `billing_type` query empty or includes `retainer` (166, 243–246). Hub sends intersection of store types with `media|sow|retainer` (`FinanceHubPageClient.tsx` 309–312). **`defaultFilters.billingTypes`** includes `"retainer"` (`lib/finance/useFinanceStore.ts` 159). |
| `statuses` | `filterByStatuses` (86–93): retainers use `"booked"` — hidden if user excludes `booked` from active statuses. Default statuses include `booked` (160). |
| `includeDrafts` | Controls `includeNonBooked` for **media/SOW** derivation only (163, 211–212). Retainer synthesis **ignores** this flag; retainers are always emitted when `wantRetainer` and `monthlyretainer > 0`. |
| `monthRange` | Hub fans out one GET per month (`fetchFinanceBillingForMonths`); each month request synthesises retainers for that `billing_month`. One row per client per month in range. |

---

### Status recommendation

- **Recommended:** Use existing **`"booked"`** status (already set in `deriveRetainerBillingRecordsForMonth`, line 69).
- **Reasoning:** Retainers are standing monthly obligations, not draft invoices and not tied to publisher delivery states. `"booked"` is already in default `statuses` filter and matches accrual/KPI treatment of committed receivables. Adding a new `"retainer"` `BillingStatus` would require enum, UI badges, and filter defaults across finance surfaces for limited gain.

---

### Stage 6 implementation sketch

1. **Confirm product gap:** Reproduce hub with publisher filter active — retainers currently **still show** (billing route 112–113); change `filterByPublisherIds` to **exclude** `billing_type === "retainer"` when `publishers_id` filter is non-empty (if spec requires hide).
2. **Stabilise synthetic `id`:** Replace `id: 0` in `deriveRetainerBillingRecordsForMonth` with deterministic negative or hashed numeric id per `(clients_id, billing_month)` so React keys and merge map stay unique across clients/months.
3. **Verify `monthlyretainer` edge cases:** Treat non-finite, `null`, `undefined`, and `<= 0` as no row (28–34); confirm Penfolds-style values (`12083`) pass through Xano `get_clients` unchanged.
4. **Keep synthesis in billing GET** after client fetch; add unit/integration tests for one month × two clients × publisher filter on/off.
5. **Hub UI:** No grid edits on retainers; optionally add visual “computed from client retainer” hint on `HubReceivableRecordArticle` for `billing_type === "retainer"`.
6. **Export:** `exportReceivablesWorkbook` already handles `billing_type === "retainer"` with per-client sheets (`lib/finance/exportFinanceHub.ts` 43–68) — verify export uses same billing fetch path after filter fixes.

---

### Open questions for Stage 6

- Should retainer rows be included in **month/client subtotals and invoice counts** in `FinanceHubReceivablesSection` (595–622)? **Current:** yes — `cg.retainers` adds to `client.total` and invoice counts.
- **`monthlyretainer == null` vs `0`:** Both skip row (`!Number.isFinite(parsed) \|\| parsed <= 0`, 30–34). Confirm with live Xano data for clients without retainers.
- **Excel export:** Retainers already export via `exportReceivablesWorkbook` — confirm hub “Download Finance Report” uses receivable records including retainers after any publisher-filter fix.
- **Accrual / Overview store `billingRecords`:** `scheduleFinanceFetchAll` also hits billing route — do retainers in store skew accrual KPIs? (Overview uses separate unfiltered KPI fetches per Section 1.)
- **Revive `ReceivablesTab`?** If mounted later, grid would allow edits on `id: 0` rows — would violate non-editable spec unless retainer rows excluded from `EditableFinanceGrid`.

## 6. Lock predicate inputs (Stage 2 prep)

- **`getCurrentBillingMonth()`** — file: `lib/finance/months.ts` lines 1–6, returns `string` in `"YYYY-MM"` format using local calendar `Date` (`getFullYear()`, `getMonth() + 1`). Example for `today = 2026-05-21`: **`"2026-05"`**.
- **`expandMonthRange({ from, to })`** — file: `lib/finance/monthRange.ts` lines 3–19. Input type `MonthRange = { from: string; to: string }` (both `YYYY-MM`). Returns `string[]` of ISO months from `from` through `to` inclusive (empty if `!from`; single month if `!to` or `from === to`; if `from > to`, returns `[from]` only). Uses `date-fns` `parse(from, "yyyy-MM")`, `addMonths`, `format(cur, "yyyy-MM")`.
- **Existing month-arithmetic utilities in `lib/billing/computeSchedule.ts`:** **Only two exports** (Domain 3b extraction):
  - `ComputeBillingAndDeliveryMonthsParams` (type, lines 34–42)
  - `computeBillingAndDeliveryMonths` (lines 48–306) — burst/campaign schedule builder; internal month keys use `format(cur, "MMMM yyyy")` (63), not `YYYY-MM`. **No** exported `parseMonthYear`, `addMonths`, or lock helpers. Stage 2 lock predicate should **not** depend on `computeSchedule` for calendar-month locking.
- **Reuse elsewhere for Stage 2:**
  - `lib/finance/monthRange.ts` — `parse` / `addMonths` / `format` on `yyyy-MM` (same pattern as hub month fan-out)
  - `lib/finance/utils.ts` — `startOfMonth`, `endOfMonth`, `parse`, `format` (line 1)
  - `lib/spend/billingScheduleExpectedToDate.ts` — `extractBillingMonthStart(entry)` (52–68) to map schedule JSON `monthYear` / `month_year` / `month` → first day of calendar month for gate checks on Alter Billing / edit page
  - `lib/finance/billingApiParams.ts` — `parse` / `format` / `isValid` from `date-fns` for billing API month strings
- **`date-fns` available:** **yes** — `"date-fns": "^3.6.0"` in `package.json` line 68; used in `lib/finance/monthRange.ts`, `lib/finance/utils.ts`, `lib/billing/computeSchedule.ts`, and across app/components (grep: widespread imports).
- **`lib/billing/lockBillingMonth.ts`:** **does not exist** in repo (Stage 2 will create).

### Lock predicate specification (for Stage 2)

```ts
// lib/billing/lockBillingMonth.ts (Stage 2 will create this)
export function isBillingMonthLocked(
  billingMonth: string,    // "YYYY-MM"
  now: Date = new Date()
): boolean {
  // Locked when: now >= startOfMonth(addMonths(parseMonth(billingMonth), 1)) + 60 days
  // i.e. Jan 2026 ("2026-01") becomes locked from 2 Apr 2026 00:00 UTC onwards
}
```

**Implementation note:** Use UTC boundaries consistently in unit tests (spec examples are UTC). Bridge `BillingMonth.monthYear` (`"January 2025"`) → `YYYY-MM` via `extractBillingMonthStart` or `parse(monthYear, "MMMM yyyy", …)` before calling `isBillingMonthLocked`.

Worked examples (for unit tests in Stage 2):

- `billingMonth = "2026-01"`, `now = "2026-04-01T23:59:59Z"` → **not locked** (cutoff is 2 Apr 2026 00:00 UTC)
- `billingMonth = "2026-01"`, `now = "2026-04-02T00:00:00Z"` → **locked**
- `billingMonth = "2026-01"`, `now = "2026-04-02T00:00:01Z"` → **locked**
- `billingMonth = "2026-05"`, `now = "2026-05-21T12:00:00Z"` → **not locked**
- `billingMonth = "2024-12"`, `now = "2025-03-02T00:00:00Z"` → **locked** (cutoff is 2 Mar 2025 UTC)
- Leap year boundary: `billingMonth = "2024-01"`, `now = "2024-04-01T23:59:59Z"` → **not locked**; `now = "2024-04-02T00:00:00Z"` → **locked**

## 7. Cross-cutting open questions

This section collates every “needs Luke decision” or “needs Xano verification” item surfaced in Sections 1–5. Each item must be answered (or explicitly deferred) before the relevant stage runs.

### Filter bar (Stage 1)

- **Load gate UX:** Is “click Load to apply filters” intentional product behaviour, or should filter controls apply on change? (Section 1.3 hypothesis ~45% — draft-not-applied.)
- **Overview / Accrual / Forecast vs hub filters:** Should Overview charts (`global-monthly-*`, `hub-schedule-ytd`) and current-month KPI fetches respect hub `monthRange` / `selectedClients`, or stay global? (Section 1 — Overview effects use `[]` or unfiltered `{}`.)
- **Forecast tab:** Should hub filter bar drive `/api/finance/forecast` params, or remain separate FY/scenario controls? (Section 1 — `does-not-subscribe`.)
- **Billing Search Enter:** Should Enter on search call `receivables.bump()` like Load on billing tab? (Section 1 — Enter at `FinanceFilterToolbar.tsx` 241 updates store only.)
- **Payables route ignores query params:** Confirm Stage 1 fixes `GET /api/finance/payables` to honour `publishers_id`, `billing_type`, `status`, `include_drafts` (Section 2 breakpoints) — **or** document that only client-side publisher filter is intended.
- **Payables `status` filter vs data model:** Derived payables use `status: "expected"` only — should hub status filter be hidden/disabled on Payables tab, or should derivation emit bookable statuses? (Section 2.)
- **Publisher ID source of truth:** `XANO_PUBLISHERS_BASE_URL` (toolbar `/api/publishers`) vs `XANO_CLIENTS_BASE_URL/get_publishers` (billing route cache) — same IDs? (Section 2 Xano verification.)
- **Xano `get_clients` / `get_publishers` / plan version overlap:** Confirm field shapes and overlap rules (Section 2 list) before blaming UI for empty months.
- **Billing manual-load:** Keep manual `fetchKey` bump model or auto-refetch on `filterSig` change like Payables hook? (Section 1 Billing tab.)

### Lock predicate & client gates (Stage 2)

- **`monthYear` vs `YYYY-MM`:** Normalise schedule `monthYear` labels before `isBillingMonthLocked` — use `extractBillingMonthStart` or explicit parse? (Section 3, Section 6.)
- **Multi-month PATCH:** Reject entire `billing-schedule` PATCH / MBA PUT with 403 + locked month list if any month locked? (Section 3.)
- **Lock scope:** Gates on **schedule JSON edits** (`AlterBillingDialog`, edit page) only, or also `finance_billing_records` PATCH / dead `ReceivablesTab` grid? (Section 3 — hub receivables are derived.)
- **UTC vs local:** Lock cutoff at 00:00 UTC — confirm AU business expectation. (Section 6 worked examples.)

### Server-side lock enforcement (Stage 3)

- Same as Stage 2 **`monthYear` normalisation** on server before validating `billingSchedule` arrays.
- **`POST /api/finance/edits/publish` with `{}`:** What records does publish affect when id omitted? (Section 3.)
- **Super-admin override contract:** Header/query flag vs role-only bypass for locked months? (Sections 3–4 — no route accepts override today.)
- **403 response shape:** Locked month list in JSON for client toast? (Deferred — pick in Stage 3.)

### Auth0 super_admin (Stage 4)

- **Post-login Action:** Only documented in `docs/auth0-rbac.md` — no repo Action export; dashboard change required.
- **`super_admin` vs `admin` / `manager`:** Finance hub access for `manager` today with no API role gate — is `super_admin` finance-only override or broader? (Section 4.)
- **Dual Auth0 clients:** `lib/utils/auth.ts` vs `lib/auth0.ts` — which instance should new role helpers use? (Section 4.)
- **Role refresh:** Users must re-login after Action change; no localStorage role cache. (Section 4.)

### Super admin UI override (Stage 5)

- **Which surfaces show override:** Alter Billing only, or also edit page manual billing, dead grid paths? (Sections 3–4.)
- **Override visibility:** Badge on locked months + “Edit anyway” for `isSuperAdmin` only? (Product.)
- **Server must accept override** (Stage 3 prerequisite) — client-only unlock is insufficient.

### Retainer (Stage 6)

- **Publisher filter:** Hide retainer rows when `selectedPublishers` active? (Section 5 — current route **keeps** them.)
- **Subtotals / KPIs:** Retainers in month/client totals and Overview store `billingRecords` — intended? (Section 5.)
- **`monthlyretainer` null vs 0:** Both skip synthesis — confirm on live Xano export.
- **Excel export:** Hub download includes retainer sheets — verify after filter fix.
- **Synthetic `id: 0`:** Replace with stable negative id? (Section 5.)
- **Revive `ReceivablesTab`:** Would allow edits on synthetic rows — exclude retainers from grid if revived.

## 8. Recommended Stage 1 scope

Based on the filter bar diagnosis (Section 1) and API layer findings (Section 2), Stage 1 should prioritise **confirmed server/client filter mismatches** and **billing tab load paths** before rewiring Overview/Forecast (separate product decisions in Section 7).

**Recommended scope (3–5 sentences):**

Stage 1 should fix **`GET /api/finance/payables`** (`app/api/finance/payables/route.ts`) so it applies the same post-derive filters as billing for `publishers_id`, `billing_type`, `status`, and `include_drafts` (or explicitly align payables hook + UI if `status: "expected"` cannot map to hub statuses). Reuse billing route helpers (`filterByPublisherIds`, `filterByStatuses`, etc. from `app/api/finance/billing/route.ts` 86–118) or extract shared filter module. On the client, **`components/finance/FinanceFilterToolbar.tsx`** should call **`receivables.bump()`** when Search Enter runs on the billing tab (line 241), matching `applyDraftThenReceivables` (120–127). **Do not** mount dead `ReceivablesTab`/`PayablesTab` in Stage 1. Defer Overview chart/KPI filter wiring and Forecast hub integration unless Luke answers Section 7 “Filter bar” product questions — those tabs are classified `subscribes-but-no-refetch` / `does-not-subscribe`, not primary “filters broken on Billing/Payables” reports.

### Stage 1 prerequisites

- Luke confirms **payables status filter** intent (hide vs change derivation vs map `"expected"`).
- Luke confirms **publisher table parity** between `XANO_PUBLISHERS_BASE_URL` and `XANO_CLIENTS_BASE_URL/get_publishers` (or Stage 1 accepts billing-route publisher map only).
- Optional: confirm **Load button** UX is intentional so Stage 1 does not remove manual apply without replacement.

### Stage 1 deliverables

- **Modified files (expected):** `app/api/finance/payables/route.ts`; possibly shared extract `lib/finance/filterBillingRecords.ts` (new) if deduplicating billing/payables filters; `components/finance/FinanceFilterToolbar.tsx` (billing Search Enter + bump); optional small test file for payables query param filtering.
- **New files:** optional shared filter helper only — no lock predicate, no Auth0, no retainer changes in Stage 1.
- **Tests:** unit tests for payables route filter application (mirror billing route tests if present); manual DevTools checklist from Section 1 Payables/Billing “What to verify” bullets.
- **Out of scope for Stage 1:** `isBillingMonthLocked`, `super_admin`, retainer publisher-hide, Overview/Forecast filter wiring, `ReceivablesTab` revival.

---

_End of AUDIT.md. Discovery complete._
