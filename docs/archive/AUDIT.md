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

## Domain 4 — Stage 1 Discovery

**Scope:** Line item flight date-range warnings on `mediaplans/create` and `mediaplans/mba/[mba_number]/edit`. Discovery only — no code changes, no fix proposals.

**Note on terminology:** Internal docs (e.g. `BURSTS_AUDIT.md`) refer to standard media containers (Television, Search, etc.) as **“consulting-style”** containers. There is **no** separate `ConsultingContainer` in the codebase. **Production / consulting** in save-path comments refers to the **Production** section (`ProductionContainer`), which holds production-type line items (including rows whose `mediaType` / production-type label may represent consulting work). Domain 3b’s `productionLineItems` state on the MBA edit page is the API-hydration source for that container.

---

### A. Campaign dates — source of truth on each page

#### 1. `mediaplans/create`

| Item | Detail |
|------|--------|
| **File** | `app/mediaplans/create/page.tsx` |
| **Schema** | `mediaPlanSchema` — `mp_campaigndates_start` and `mp_campaigndates_end` as `z.date()` (`128:133`) |
| **Form state** | React Hook Form via `useForm<MediaPlanFormValues>` (`685:723`) |
| **Default values** | `mp_campaigndates_start: new Date()`, `mp_campaigndates_end: new Date()` (`691:692`) |
| **Reactive reads** | `useWatch` → `campaignStart`, `campaignEnd` (`756:758`) |
| **UI binding** | `FormField` + `SingleDatePicker` for each date (`5739:5788`) |
| **Shape** | Two separate form fields (not a single range object). Types: `Date` (inferred from schema). |

#### 2. `mediaplans/mba/[mba_number]/edit`

| Item | Detail |
|------|--------|
| **File** | `app/mediaplans/mba/[mba_number]/edit/page.tsx` |
| **Schema** | `mediaPlanSchema` — same field names `mp_campaigndates_start` / `mp_campaigndates_end` (`1116:1121`) |
| **Form state** | `useForm<MediaPlanFormValues>` (`1967:1988`) |
| **Defaults** | `new Date()` for both (`1973:1974`) until load completes |
| **Loaded on mount** | Yes. MBA/version fetch maps API → `form.reset(formData)` with `mp_campaigndates_start: parseDate(data.campaign_start_date)` and `mp_campaigndates_end: parseDate(data.campaign_end_date)` (`2847:2848`, `2886`). Load occurs in the page’s data-load `useEffect` (context around `2685:2890`). |
| **Reactive reads** | `useWatch` → `campaignStartDate`, `campaignEndDate` (`2214:2215`) |
| **UI** | **Editable** — `FormField` + `SingleDatePicker` (`8153:8202`), same pattern as create |
| **Shape** | Two separate `Date` fields in RHF |

#### 3. Symmetry / divergence (campaign dates)

| Aspect | Create | MBA edit |
|--------|--------|----------|
| Field names for dates | `mp_campaigndates_start`, `mp_campaigndates_end` | Same |
| Types | `Date` (Zod) | Same |
| Storage | RHF only (no parallel `useState` for campaign dates) | Same |
| `useWatch` aliases | `campaignStart`, `campaignEnd` | `campaignStartDate`, `campaignEndDate` |
| Other form naming | e.g. `mp_client_name`, `mba_number` | e.g. `mp_clientname`, `mbanumber` (differs) |
| Initial source | Defaults only | API `campaign_start_date` / `campaign_end_date` on load |

Campaign **date** shape and naming are aligned; surrounding campaign metadata field names diverge.

---

### B. Line item dates — source of truth on each page

#### 4. Create page — path by container type

**Pattern (all 18 media types):** Each enabled media section uses a lazy-loaded `*Container` under `app/mediaplans/create/page.tsx` (`6634:6757`). Inside the container, line item dates live in **container-local RHF state** (e.g. `televisionlineItems[].bursts[].startDate` / `endDate` as `Date` in `TelevisionContainer`). On every `watchedLineItems` change, a `useEffect` serializes to the page via `onMediaLineItemsChange` → `*MediaLineItems` arrays (e.g. `bursts_json` string on API-shaped objects in `TelevisionContainer.tsx` ~`1271`).

**Page-level state (authoritative for save, billing, and existing date warning):**

| Container group | Page state variables | Setter / handler (examples) |
|-----------------|----------------------|-----------------------------|
| Television … Influencers (18 types) | `{type}MediaLineItems` e.g. `televisionMediaLineItems` (`583` area, one per type) | e.g. `handleTelevisionMediaLineItemsChange` → `setTelevisionMediaLineItems` (`2081`) |
| Production | `productionMediaLineItems`, also `productionItems` (export), `productionBursts` (billing) | `handleProductionMediaLineItemsChange` (`2104:2107`), `handleProductionItemsChange` (`2109:2112`) |

**Production / consulting (create):**

- UI: `ProductionContainer` when `mp_production` is enabled (`6777:6792`).
- In-container path: `lineItems[].bursts[].startDate` / `endDate` (`ProductionContainer.tsx` `55:68`, `847:891`).
- Lifted to page: `productionMediaLineItems` via `onMediaLineItemsChange` → objects with a `bursts` array (`425:456` in `ProductionContainer.tsx`), not `bursts_json` in the live callback shape.
- `productionLineItems` as a separate page state name **does not exist** on create (only on MBA edit for API hydration).

**“Consulting” line items (product sense):** Implemented as the 18 standard media containers above, not a separate state tree.

#### 5. MBA edit page — path by container type

**Dual state per media type on edit (important):**

| Role | State | Example lines |
|------|--------|----------------|
| API hydration / `initialLineItems` | `{type}LineItems` | `televisionLineItems` (`1763`), `productionLineItems` (`1824`) |
| Live edited / save & billing | `{type}MediaLineItems` | `televisionMediaLineItems` (`1813`), `productionMediaLineItems` (`1825`) |

Load: `lineItemLoaderConfig` fetches per type and calls `setTelevisionLineItems`, `setProductionLineItems`, etc. (`3036:3058`, `3069:3091`). Containers receive `initialLineItems={televisionLineItems}` (`8604`) or `initialLineItems={productionLineItems}` (`8793`) and push updates via `onMediaLineItemsChange` → `*MediaLineItems` handlers (`6480:6550`).

**Production (post–Domain 3b):**

- `productionLineItems` — loaded from `getProductionLineItemsByMBA` (`3050`).
- `productionMediaLineItems` — runtime mirror used for billing/save/KPIs (`1825`, `6546:6549`, `8787`).
- Dates still originate in `ProductionContainer` burst fields; persisted shape uses `bursts` on lifted objects and `bursts_json` when saved to API.

#### 6. Derived / defaulted dates (not direct user entry)

| Mechanism | Where | Behaviour |
|-----------|--------|-----------|
| Default burst window | `lib/date-picker-anchor.ts` `defaultMediaBurstStartDate` / `defaultMediaBurstEndDate` (`15:33`) | New bursts default to campaign start/end when campaign window is valid |
| Production default burst | `ProductionContainer` `makeDefaultBurst` (`258:266`, `305`) | Uses campaign dates; if no window, `getPeriodEnd` for end |
| TV / Radio expert modes | `TelevisionContainer` expert grid (`357:366`, mappings in `lib/mediaplan/expertChannelMappings.ts`) | Weekly/expert UI maps to standard line items with `startDate`/`endDate` on bursts — dates are **derived** when switching modes, then stored on bursts |
| Hydration from API | All containers’ `initialLineItems` effects | Parse `bursts_json` or `bursts` into `Date` fields (e.g. `TelevisionContainer.tsx` `695:742`, `ProductionContainer.tsx` `362:404`) |
| Calendar UX | Most containers | `calendarContext="media-burst"` on `SingleDatePicker` affects **initial calendar month**, not hard disable of out-of-range days (`components/ui/single-date-picker.tsx` `56:66`) |
| TV burst picker (example) | `TelevisionContainer.tsx` `1984:1990` | Raw `Calendar` — only disables `date > 2100`; **does not** clamp to campaign window |

Users can enter or retain flight dates outside the campaign window; defaults merely suggest in-range values.

---

### C. Existing date validation or warning logic

#### 7. Line item vs campaign — today

| Page | Exists? | Details |
|------|---------|---------|
| **`mediaplans/create`** | **Yes (partial)** | `hasDateWarning` state (`673`). `useEffect` calls `checkMediaDatesOutsideCampaign` (`1467:1517`). UI: sticky footer text (`7201:7205`) — “Media placement outside campaign dates”, `text-destructive`, pulsing dot. **Reactive** (deps: `campaignStart`, `campaignEnd`, all `*MediaLineItems` except production). **Not** save-gated. |
| **`mediaplans/mba/[mba_number]/edit`** | **No** | No import or use of `checkMediaDatesOutsideCampaign` or `hasDateWarning` in this file (grep). Sticky bar shows **billing mismatch** only (`9952:9958`). |
| **`mediaplans/[id]/edit`** (legacy) | Yes | Same utility + sticky pattern as create (`89`, `392`, `791:818`, `3906:3910`) — **out of scoped routes** but shows prior art |

**Gaps in existing create warning:**

- **`productionMediaLineItems` not included** in the `useEffect` dependency object (`1467:1517`).
- Utility `checkMediaDatesOutsideCampaign` only accepts the 18 media `*MediaLineItems` keys — **no production** parameter (`lib/utils/mediaPlanValidation.ts` `11:31`).
- Checks each burst’s **start** and **end** independently against campaign bounds (`62:107`) — matches the locked Domain 4 rule (boundary violation if start &lt; campaign start OR end &gt; campaign end).
- Does **not** block save; warning only.

#### 8. `lib/billing/computeSchedule.ts`

- **No** “out of range” validation or warning.
- Uses `campaignStart` / `campaignEnd` to build month buckets (`61:95`), then distributes each burst across months (`97:120`). Bursts extending outside the campaign window still contribute dollars to months **inside** the loop that only iterates campaign months — behaviour is financial distribution, not user warnings. No surfaced UI from this file.

#### 9. Related `lib/` utilities

| File | Purpose |
|------|---------|
| `lib/utils/mediaPlanValidation.ts` | `checkMediaDatesOutsideCampaign` — only consumer-facing range check found for media plan editors |
| `lib/date-picker-anchor.ts` | Campaign-window helpers for default burst dates and calendar month anchor |
| `lib/dashboard/dateFilter.ts` | `clipDateRangeToCampaign`, `filterDailySeriesByRange` — dashboard filtering, not plan editor validation |
| `lib/pacing/calcExpected.ts` | `expandDateRange` — pacing expected delivery |
| `lib/finance/utils.ts` | Burst/month **overlap** for billing amounts — not campaign-boundary warnings |
| `lib/kpi/deliveryTargetCurve.ts` | “outside campaign window” → `"no-data"` for on-track KPI (`217:218`) — pacing/KPI only |

No shared `isLineItemOutsideCampaign` helper used by both create and MBA edit today.

---

### D. Page composition — where could a warning be surfaced?

#### 10. Create page layout (`app/mediaplans/create/page.tsx`)

| Region | Lines (approx.) | Description |
|--------|-----------------|-------------|
| **Hero** | `5556:5573` | `MediaPlanEditorHero` — title “Create a Campaign”, Copy Context |
| **Campaign details card** | `5577:5876` | Client, campaign name, status, PO, **campaign dates**, budget, MBA fields |
| **Media types card** | `5878:5916` | Toggles for enabled containers |
| **MBA details / billing / KPI row** | `5919:6132` | MBA identifiers, billing schedule table, `KPISection` |
| **Media containers** | `6634:7120` | One scroll section per enabled type (`id=media-section-{name}`) |
| **Floating nav** | `7412` | `FloatingSectionNav` → `enabledSections` |
| **Sticky footer** | `7195:7238` | `hasDateWarning` text + `CampaignExportsSection` + Save / Generate MBA |
| **Modals** | Various | Unsaved changes, save progress, partial MBA, manual billing |

#### 11. MBA edit page layout (`app/mediaplans/mba/[mba_number]/edit/page.tsx`)

| Region | Lines (approx.) | Description |
|--------|-----------------|-------------|
| **Hero** | `7986:8003` | `MediaPlanEditorHero` — “Edit Campaign” |
| **Version rollback dialog** | `8006:8025` | Load prior version |
| **Campaign details** | `8029:8203+` | Same grid as create + **version selector** in header (`8031:8050`) |
| **Media types / MBA / billing / KPI** | Same structural grid as create (~`8205:8537`) |
| **Media containers** | `8540:8930+` | Per-type sections with load/retry UI (`8563:8579`) |
| **Sticky footer** | `9946:10024` | Billing mismatch banner + exports + Save (no date warning today) |
| **Floating nav** | `10110` | `FloatingSectionNav` with `storageKey="mediaplan-edit-section-nav-collapsed"` |

#### 12. Page-level warning banners (existing patterns)

| Pattern | Location | Use |
|---------|----------|-----|
| Sticky footer destructive text | `app/mediaplans/create/page.tsx` `7201:7205` | Date warning (create) |
| Sticky footer amber text | `app/mediaplans/mba/[mba_number]/edit/page.tsx` `9952:9958` | Billing schedule mismatch |
| Yellow `role="alert"` box | `app/mediaplans/create/page.tsx` `6474:6481` | Partial MBA budget mismatch (inside modal content) |
| shadcn `Alert` | e.g. `components/finance/tabs/ForecastTab.tsx` `460:466`, `661:666` | Finance hub — not used on media plan editors |

No top-of-page `Alert` on create/edit MBA routes today for line-item dates.

#### 13. Inline per-row warnings

- Media containers use RHF **`FormMessage`** for Zod field errors (required fields, min bursts, etc.) — not campaign-range warnings.
- **No** codebase matches for inline “outside campaign” copy on line item rows (grep across `components/media-containers`).
- Row-level badges are media-type accent styling (`mediaTypeLineItemBadgeStyle`), not validation.

#### 14. Toast / snackbar for validation

- `toast` from `@/components/ui/use-toast` is used on MBA edit for **save/download outcomes** (e.g. `3527`, `5832`, `6185`) — not for date-range validation.
- Create uses `toast` similarly for operational feedback (`43`).
- Container-level `toast({ variant: "destructive" })` for actions like duplicate failures — not date validation.

---

### E. Reactivity plumbing

#### 15. Line item date changes → page state

1. User edits burst `startDate` / `endDate` in container RHF form.
2. `useWatch` on line items triggers container `useEffect`.
3. Container calls `onMediaLineItemsChange(transformed)` (and usually `onBurstsChange` for billing).
4. Page handler updates `*MediaLineItems` `useState` (and optionally `*Bursts`).

**Not** blur-gated; updates on each watched change. **Not** stored in the top-level `form`’s `lineItems` schema on create (that schema exists at `172:185` but page-level line items use parallel state).

#### 16. Campaign date changes

- Bound to RHF `FormField` + `SingleDatePicker` `onChange` → immediate form update.
- `useWatch` on create (`756:758`) / edit (`2214:2215`) propagates to containers via props `campaignStartDate` / `campaignEndDate` (e.g. create `6769:6770`, edit `8599:8600`).
- Edit page also triggers billing recalculation `useEffect`s when campaign dates change (e.g. `4273:4298`, `7292:7400`).

Same RHF mechanism for campaign dates; line items use separate container forms + lift via callbacks.

#### 17. Natural integration points for reactive “any line item out of range”

| Page | Integration point |
|------|-------------------|
| **Create** | Extend or replace the existing `useEffect` at `1467:1517` — already watches `campaignStart`/`campaignEnd` and 18 `*MediaLineItems` arrays. Add `productionMediaLineItems`. Optionally centralize in `checkMediaDatesOutsideCampaign` or a sibling helper. |
| **MBA edit** | **New** page-level `useEffect` (none exists) watching `campaignStartDate`, `campaignEndDate`, all `*MediaLineItems` (including `productionMediaLineItems`), same helper. Reuse sticky footer slot used for billing mismatch (`9951`) or hero/top banner. |
| **Shared** | `lib/utils/mediaPlanValidation.ts` — single pure function for all container payloads (must handle both `bursts` and `bursts_json`). |

Container-internal hooks would duplicate logic 19×; page-level aggregation matches the existing create pattern.

---

### F. Symmetry between pages

#### 18. Structural differences affecting warnings

| Topic | Create | MBA edit |
|-------|--------|----------|
| Persisted data | None until save | Loaded MBA + version; `initialLineItems` hydration |
| Versioning | Fixed plan “1” | Version selector, rollback, `loadSingleMediaTypeLineItems` |
| Line item state | `*MediaLineItems` only | `*LineItems` (API) + `*MediaLineItems` (live) |
| Date warning | Present (media only) | Absent |
| Other sticky warning | — | Billing mismatch |
| Form field names | `mp_client_name`, `mba_number` | `mp_clientname`, `mbanumber` |
| Container loading | Lazy + `lazyWithChunkRetry` | Lazy `import()`; per-section load status |
| Unsaved / save | `handleSaveAll`, modals | Same family + line-item load modal |

#### 19. Shared composition

**Shared components (both pages):**

- `components/mediaplans/MediaPlanEditorHero.tsx`
- `components/mediaplans/FloatingSectionNav.tsx`
- `components/dashboard/CampaignExportsSection.tsx`
- `components/kpis/KPISection.tsx`
- All `components/media-containers/*` (lazy)
- `lib/utils/mediaPlanValidation.ts` (create + legacy edit only today)

**Not shared:** Each route is a large standalone `page.tsx` (~7k–10k lines). There is **no** shared layout wrapper that currently hosts validation UI; warnings would be added per page or extracted to a new shared component in Stage 2.

---

### G. Risks and unknowns

#### Surprises / fragility (with confidence)

| Finding | Confidence |
|---------|------------|
| MBA edit route has **no** date warning while create does | **High** |
| Create warning **omits production** line items | **High** |
| `checkMediaDatesOutsideCampaign` compares **point** dates (start/end), not interval overlap semantics beyond the locked rule | **High** — matches spec |
| Campaign end normalized to `23:59:59.999` in helper (`41:42`) while burst dates use midnight (`66:67`) — edge-case timezone/day boundary risk | **Medium** |
| TV uses raw `Calendar` without campaign clamp; Production uses `SingleDatePicker` without `isDateDisabled` for campaign | **High** |
| Expert TV/Radio modes derive bursts from weekly grids — warning logic must use **serialized** `*MediaLineItems`, not expert-only state | **Medium–High** |
| MBA edit: warning logic must use `*MediaLineItems`, not stale `*LineItems` before container mounts | **High** |
| `productionLineItems` vs `productionMediaLineItems` split on edit — easy to wire the wrong array | **High** |

#### Ambiguity: “consulting line items”

- **Code interpretation A:** All 18 media containers (“consulting-style” in `BURSTS_AUDIT.md`). **High confidence** this is the main bucket.
- **Interpretation B:** Rows inside `ProductionContainer` whose production-type label is consulting-like. **Low confidence** without product glossary — `mediaTypes` passed to production on create is **all** channel labels (`6791`), not a consulting-only list.

#### Needs Luke input before Stage 2 design

1. Confirm **consulting** = standard media containers only, or also production-type rows (or both).
2. Confirm MBA edit should **match create** warning placement (sticky footer) vs top-of-form `Alert` vs per-row.
3. Whether **legacy** `mediaplans/[id]/edit` should stay in parity (out of scope list but has existing warning).
4. Whether violating dates should **block save** or remain warn-only (create is warn-only today).
5. Copy: create says “Media placement…” — include production/consulting in wording?

#### Out of scope but worth flagging

- Legacy `app/mediaplans/[id]/edit/page.tsx` still in repo with date warning; may confuse if URLs still linked.
- `app/mediaplans/[id]/edit/page.tsx` vs `mba/[mba_number]/edit` duplication (~10k lines each).
- Existing create warning does not cover production despite Domain 3b consolidation emphasis on `productionLineItems`.
- Partial MBA modal budget warning (`6474:6481`) is a precedent for in-form yellow alert pattern.

---

## Domain 4 — Stage 2.5 Legacy Deletion

**Date:** 2026-05-27  
**Canonical edit route:** `app/mediaplans/mba/[mba_number]/edit/page.tsx`

### Pre-flight grep results

| Pattern | Production hits | Notes |
|---------|-----------------|-------|
| `mediaplans/[id]/edit` | Docs/audit only (no runtime imports of legacy page) | Legacy page was not imported elsewhere |
| `/mediaplans/${id}/edit` | `app/mediaplans/[id]/page.tsx:344` | **Only production caller** — "Edit Media Plan" on ID detail view |
| `/mediaplans/mba/.../edit` | `app/mediaplans/page.tsx`, `DashboardOverview.tsx`, `CampaignSection.tsx`, `CampaignDetailsModal.tsx`, `ClientDashboardPageContent.tsx`, `FinanceHubPageClient.tsx`, `PacingPageClient.tsx`, `LineItemPacingTable.tsx`, `AlterBillingDialog.tsx` | Already canonical |
| `router.push` / `Link` to numeric-id edit | Same as above (`[id]/page.tsx` only) | Sidebar / CommandPalette link to `/mediaplans` and `/mediaplans/create` only |
| Imports from `[id]/edit/page.tsx` | None | No cross-file imports |

**Legacy route behaviour before deletion:** No redirect — full legacy client editor (~4k lines) rendered at `/mediaplans/{id}/edit`. No `loading.tsx` / `error.tsx` siblings in `app/mediaplans/[id]/edit/`.

**Navigation audit:** `AppSidebar`, `CommandPalette`, dashboards, finance hub, pacing — all MBA edit URLs. No blockers outside `[id]/page.tsx`.

### Files deleted

| File | Reason |
|------|--------|
| `app/mediaplans/[id]/edit/page.tsx` (legacy editor, ~4034 lines) | Replaced with redirect stub (see below) |
| `components/billing/BillingSchedule.tsx` | Exclusive to legacy editor |
| `types/billing.ts` — `BillingScheduleType`, `BillingSchedule` interface | Exclusive to legacy editor |

**Not deleted:** `app/mediaplans/[id]/page.tsx` (detail view remains; edit button updated).

### References updated

| File | Change |
|------|--------|
| `app/mediaplans/[id]/page.tsx` | Edit button → `/mediaplans/mba/{mba}/edit?version={n}`; disabled when no MBA |
| `app/mediaplans/[id]/edit/page.tsx` | Replaced legacy editor with server redirect to MBA edit |

### Redirect added

**Yes** — `app/mediaplans/[id]/edit/page.tsx` (server component):

- Fetches `media_plan_versions` by numeric `id` (same Xano query as `app/api/mediaplans/[id]/route.ts`).
- `redirect()` to `/mediaplans/mba/{mba_number}/edit?version={version_number}` when MBA present; `notFound()` otherwise.

Preserves old bookmarks without keeping the legacy editor.

### Blockers

None after pre-flight fix. The single production link on `[id]/page.tsx` was updated before removing the editor.

### Smoke test

| Check | Result |
|-------|--------|
| `npm run build` | **Pass** (2026-05-27) |
| `/mediaplans/create` | Route unchanged |
| `/mediaplans/mba/{mba}/edit` | Canonical page unchanged |
| Nav / dashboard / finance links | Pre-flight: already MBA URLs |
| Legacy `/mediaplans/{id}/edit` redirect | New server redirect page |

---

## Domain 4 — Stage 2 Implementation

**Completed:** 2026-05-27  
**Scope:** Shared date-range warning helper + sticky footer on `mediaplans/create` and `mediaplans/mba/[mba_number]/edit`. Warn-only; no save blocking.

### Files changed

| File | Line ranges (approx.) | Change |
|------|----------------------|--------|
| `lib/utils/mediaPlanValidation.ts` | `1:144` (full rewrite) | Renamed `checkMediaDatesOutsideCampaign` → `checkLineItemDatesOutsideCampaign`; new signature, `startOfDay` comparison, burst resolver, `offendingCount`, production bucket, exported types |
| `app/mediaplans/create/page.tsx` | `101`, `673:676`, `1470:1522`, `7206:7213` | `dateWarning` state, helper call incl. `productionMediaLineItems`, sticky footer copy with count |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx` | `173`, `1836:1839`, `2305:2356`, `10010:10017` | Import, state, `useEffect` on `*MediaLineItems` + `productionMediaLineItems`, sticky footer warning stacked above billing mismatch |

### Caller migration

| File | Status |
|------|--------|
| `app/mediaplans/create/page.tsx` | Migrated to `checkLineItemDatesOutsideCampaign` |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx` | New consumer (Stage 2) |
| `app/mediaplans/[id]/edit/page.tsx` | **No migration needed** — file is a server redirect stub to MBA edit (`1:54`), not an editor. Stage 1 discovery referenced a prior monolithic editor that is no longer in the tree. |

**Grep result:** Zero remaining references to `checkMediaDatesOutsideCampaign` in source (only historical mentions in this AUDIT discovery section above).

### Deviations / surprises

1. **Legacy `[id]/edit` already removed** — Design Step 2 assumed a compile-only rename on `app/mediaplans/[id]/edit/page.tsx`. That route is now `LegacyMediaPlanEditRedirect` only; no helper import to update.
2. **`npm run build` fails on pre-existing error** — `app/mediaplans/[id]/page.tsx:347` (`mediaPlan` possibly null). Unrelated to Stage 2. Changed files have no IDE/linter diagnostics.
3. **Burst check requires both valid dates** — Per locked spec, a burst with only one valid date is skipped entirely (not partially evaluated). Differs slightly from the old helper which could still flag the valid side.
4. **Removed `23:59:59.999` campaign-end fudge** — Intentional; date-only `startOfDay` on all four values. Burst end equal to campaign end is in-range.

### Smoke test readiness (15 steps)

All paths are wired via `checkLineItemDatesOutsideCampaign` + reactive `useEffect` on campaign dates and lifted `*MediaLineItems` / `productionMediaLineItems`. Luke can run on localhost:

**Create (`/mediaplans/create`)**

| # | Step | Wired? |
|---|------|--------|
| 1 | Baseline in-range TV burst | Yes — `dateWarning.hasViolation` false |
| 2 | Burst start one day before campaign | Yes — count 1, footer copy |
| 3 | Burst end one day after campaign | Yes |
| 4 | Second out-of-range line item (other type) | Yes — count 2 |
| 5 | Production burst outside window | Yes — `productionLineItems: productionMediaLineItems` |
| 6 | Widen campaign end to clear warning | Yes — deps include `campaignEnd` |
| 7 | Burst end equals campaign end (no warning) | Yes — `burstEnd > campaignEnd` is strict |

**MBA edit (`/mediaplans/mba/[mba]/edit`)**

| # | Step | Wired? |
|---|------|--------|
| 8 | Saved MBA, all in-range after hydration | Yes — empty arrays until lift → no false positive |
| 9 | Saved MBA with out-of-range burst after hydration | Yes |
| 10 | Narrow campaign end in real time | Yes — `campaignStartDate` / `campaignEndDate` in deps |
| 11 | Production burst violation counted | Yes — `productionMediaLineItems` only (not `productionLineItems` API array) |
| 12 | Date + billing mismatch both in sticky footer | Yes — stacked `dateWarning` then `hasBillingMismatch` |

**Helper edge cases**

| # | Step | Wired? |
|---|------|--------|
| 13 | Null campaign start → no warning | Yes — early return |
| 14 | Empty bursts → no crash | Yes — skip line item |
| 15 | Null burst startDate → skip burst | Yes |

No unit test file existed for `mediaPlanValidation.ts`; none added per spec.

### Follow-up (out of scope, not fixed)

- `app/mediaplans/[id]/page.tsx` TypeScript build error (`mediaPlan` possibly null).
- Legacy route cleanup (Stage 2.5) largely done for edit; confirm no stale links to old editor UX.
- Expert TV/Radio modes: warning uses lifted `*MediaLineItems` only — if expert grid desyncs from lifted state, warning could lag (Stage 1 medium risk; unchanged).
- `socialMediaLineItems` vs `socialMediaMediaLineItems` on create — warning uses `socialMediaMediaLineItems` (lifted container state), consistent with pre-Stage-2 create behaviour.

---

## Domain 5 — Stage 1 Discovery

**Scope:** New line item auto-add billing behaviour on `app/mediaplans/mba/[mba_number]/edit/page.tsx` (post–Domain 3b). Discovery only — no fix proposals.

---

### A. Line item identity — what makes a line item "new"?

#### A1. Initial state when user adds a line item (before save)

**Cleanest trace example: Television** (`components/media-containers/TelevisionContainer.tsx`)

| Step | Location | Behaviour |
|------|----------|-----------|
| User clicks "Add Line Item" | Lines 2137–2179 | `appendLineItem({ … })` via RHF `useFieldArray` |
| IDs assigned at click | Lines 2157–2163 | `createLineItemId(nextNum)` → `buildLineItemId(mbaNumber, MEDIA_TYPE_ID_CODES.television, nextNum)` (e.g. `MBA123TV3`) set as both `lineItemId` and `line_item_id` |
| Other fields | Lines 2142–2173 | Empty network/station/etc.; default burst with `startDate`/`endDate` = `new Date()`; `line_item` / `lineItem` = next line number |
| No `__new` flag | — | None in Television or other containers checked |

`createLineItemId` definition: ```389:393:components/media-containers/TelevisionContainer.tsx```

Add handler: ```2137:2179:components/media-containers/TelevisionContainer.tsx```

**Production** (`components/media-containers/ProductionContainer.tsx`) differs:

| Step | Location | Behaviour |
|------|----------|-----------|
| Add handler | Lines 458–467 | `handleAddLineItem` → `appendLineItem({ … lineItemId: "" … })` — **no ID at click** |
| ID assigned later | Lines 425–456 (`apiLineItems` `useEffect`) | `line_item_id: lineItem.lineItemId \|\| buildLineItemId(mbaNumber, "PROD", index + 1)` — note `"PROD"` is **not** in `MEDIA_TYPE_ID_CODES` (`lib/mediaplan/lineItemIds.ts`) |

**Billing-side stable id** (edit page, used in append/merge): ```176:182:app/mediaplans/mba/[mba_number]/edit/page.tsx```

- If `line_item_id` / `id` present → `billing-{mediaType}::{rawId}` (e.g. `billing-television::MBA123TV3`)
- Else → `billing-{mediaType}::new-{index}`

New TV rows get a deterministic MBA id immediately, so they typically get a **prefixed** billing id, not `::new-{index}`.

#### A2. Snapshot of loaded line item ids after hydrate

**No dedicated snapshot** of “loaded line item ids” for new-vs-loaded diffing.

What exists instead:

| State | Role | Path |
|-------|------|------|
| `*LineItems` (e.g. `televisionLineItems`) | API fetch result passed as `initialLineItems` to containers | Set in `lineItemLoaderConfig` / `loadSingleMediaTypeLineItems` (~3094–3144); passed at render e.g. `initialLineItems={televisionLineItems}` (~8662) |
| `*MediaLineItems` (e.g. `televisionMediaLineItems`) | Live lifted state from container `onMediaLineItemsChange` | Declared ~1813–1835; updated via handlers e.g. `handleTelevisionMediaLineItemsChange` (~6538–6542) |
| `savedBillingMonths` | Persisted **billing** baseline from version hydrate / post-save | ~1568, hydrate ~2831–2840 |
| `billingPlanStructureKey` | Fingerprint of enabled media + stable line ids + burst counts (not a mount snapshot) | ~4377–4420 |

Containers hydrate once from `initialLineItems` (e.g. Television `hasProcessedInitialLineItemsRef` / hydrate effect ~700–792). After that, **in-session adds only update `*MediaLineItems`**, not the original `*LineItems` arrays.

**Conclusion:** “New” could be computed by diffing `*MediaLineItems` ids against `*LineItems` ids at hydrate time, but **no code does this today**.

#### A3. Identity on save

**Save entry:** `handleSaveAll` (~4879+).

| Aspect | Behaviour | Evidence |
|--------|-----------|----------|
| Billing payload | `buildBillingScheduleForSave()` clones **`workingBillingMonths`** (attach line items only if months lack detail) | ~4977–4978, `buildBillingScheduleForSave` ~4497–4520 |
| Line items | Saved in parallel after version PUT with client-side `line_item_id` values from container/export shapes (step 4 ~5125+) | ~5125–5128 |
| Backend id assignment | Could not determine from frontend alone whether Xano overwrites `line_item_id` on insert; containers **generate** ids client-side before save (`buildLineItemId` / `buildLineItemIdentity` in `lib/mediaplan/lineItemIds.ts`) | — |
| State after successful save | `router.push('/mediaplans')` (~5496) — user leaves edit page; no in-place re-hydrate of line items | ~5494–5496 |
| Billing after save | `savedBillingMonths` ← deep copy of `workingBillingMonths`; `workingBillingMonths` unchanged; `billingLineItemsFollowAutoRef` cleared | ~5040–5048 |
| “New” flag | None persisted | — |

On save failure: master/version errors leave prior editor state; `savedBillingMonths` only updates on **full** successful version save (~5045). Partial failure (master OK, version fail) leaves billing state unchanged relative to pre-save.

---

### B. Billing schedule — the mutation surface

#### B4. All mutation call sites (`workingBillingMonths`, `savedBillingMonths`, related)

**File:** `app/mediaplans/mba/[mba_number]/edit/page.tsx` only (no other app files call `setWorkingBillingMonths`).

| Lines | Variable(s) | Trigger | Replace vs merge |
|-------|---------------|---------|------------------|
| 2572–2580 | `saved`, `working`, `autoReference` cleared | MBA/version fetch reset (`useEffect` ~2506) | Full replace → `[]` |
| 2837–2840 | `saved`, `working` | Billing hydrate from `parseSavedBillingSchedulePayload` | Full replace (clone of persisted months) |
| 2857–2858 | `saved` | No billing on fetch | Clear |
| 2453, 2454 | `autoReference`, `autoDelivery` | `calculateBillingSchedule` | Auto ref: full replace; **does not** touch working (comment ~2394–2395) |
| 2474–2475 | `working` | Inside `calculateBillingSchedule` when `billingLineItemsFollowAutoRef && !isManualBilling` | Merge via `appendAutoReferenceIntoWorkingBilling` with `{ resyncExistingFromTemplate: true }` |
| 4348–4349 | `working` | `handleResetBillingScheduleToAuto` (Edit Billing confirmed full reset) | **Full replace** via `buildWorkingMonthsFromAutoReference` |
| 4819–4820 | `working` | `handleManualBillingSave` | **Full replace** from `manualBillingMonths` clone |
| 5046–5047 | `saved` only | Successful `handleSaveAll` version PUT | Snapshot of working; working unchanged |
| 7445–7446 | `working` | Main append `useEffect` (~7349) | **Merge** via `appendAutoReferenceIntoWorkingBilling` |
| 7572–7573, 7580–7581 | `working`, optionally `saved` | Fee seed `useEffect` (~7492) | In-place month graph updates (`seedBillingMonthsLineFees`) |

**`manualBillingMonths`:** modal draft only — many `setManualBillingMonths` from open/edit (~3576, ~3648+, UI temp copies). Commits to working only via `handleManualBillingSave` (~4819).

**`autoReferenceBillingMonths`:** set in `calculateBillingSchedule` (~2453); read by append effect; not user-facing schedule.

#### B5. Dependency surfaces (key paths)

**`calculateBillingSchedule`** (~2397–2503): `useCallback` deps — all `*Bursts` arrays, fee/ad-serving inputs, `isManualBilling`, `form`, etc. Does **not** list `*MediaLineItems`. Writes auto ref; conditionally merges working with **resync** when follow-auto.

**Append effect** (~7349–7486): deps include `campaignStartDate`, `campaignEndDate`, `billingPlanStructureKey`, `billingLineItemsLengthFingerprint`, **all `*MediaLineItems` arrays**, `autoReferenceBillingMonths.length`, `attachLineItemsToMonths`, `calculateBillingSchedule`, `isManualBilling`, `form`. **250ms debounce**; deep-equality skip before `setWorkingBillingMonths` (~7438–7443).

**Burst-only auto refresh** (~7633–7705): deps — campaign dates + media **totals** + **bursts** + ad-serving; calls `calculateBillingSchedule` only (no direct working write).

**Fee seed** (~7492–7630): deps — `workingBillingMonths`, `savedBillingMonths`, `billingLineItemsLengthFingerprint`, all `*MediaLineItems`, all `*Bursts`, `form`.

#### B6. Canonical billing-calculation functions

| Function | Path | Used on MBA edit for |
|----------|------|----------------------|
| `computeBillingAndDeliveryMonths` | `lib/billing/computeSchedule.ts` (~48+) | Month-level auto aggregates from bursts (`calculateBillingSchedule` ~2411) |
| `calculateBillingSchedule` | `app/mediaplans/mba/[mba_number]/edit/page.tsx` ~2397–2503 | Page-local wrapper; burst → `autoReferenceBillingMonths` |
| `generateBillingLineItems` (page-local) | Same file ~3975–4175 | Per-line burst distribution; used by `attachLineItemsToMonths`, modal open, validation |
| `generateBillingLineItems` (shared) | `lib/billing/generateBillingLineItems.ts` | **Not** imported on MBA edit page (create uses shared module) |
| `attachLineItemsToMonths` | Edit page ~4225–4320 | Builds template with line items from **all** enabled `*MediaLineItems` |
| `appendAutoReferenceIntoWorkingBilling` | Edit page ~751–770 | Append merge into working |
| `buildWorkingMonthsFromAutoReference` | `lib/billing/resetFromAutoReference.ts` ~22–31 | Full working reset from auto |
| `parseSavedBillingSchedulePayload` | Edit page ~800+ | Hydrate saved/working from API |
| `compareBillingDivergence` | `lib/billing/compareBillingDivergence.ts` | Manual vs auto detection |
| `seedBillingMonthsLineFees` | (imported) | Post-append fee seeding on working/saved |
| Alter Billing dialog | `components/billing/AlterBillingDialog.tsx` | **Finance Hub only** (`app/finance/FinanceHubPageClient.tsx` ~869) — **not** MBA edit |

#### B7. Full set vs subset

| Function / path | Scope |
|-----------------|--------|
| `computeBillingAndDeliveryMonths` | **Full campaign** — all burst arrays passed in (~2414–2435) |
| Page `generateBillingLineItems` | **Per media type** — one container’s `*MediaLineItems` array per call (~3986+) |
| `attachLineItemsToMonths` | **All enabled media types** — iterates `mediaTypeMap` (~4259–4267) |
| `appendAutoReferenceIntoWorkingBilling` | **All months / all template keys**; merge logic is append-only per id (~344–379, ~537–684) except `resyncExistingFromTemplate` |
| `handleManualBillingLineItemResetToAuto` | **Single** line item (~4182–4223) |
| `copySingleLineItemFromAutoTemplate` | **Single** line item (`lib/billing/resetFromAutoReference.ts` ~74–108) |

---

### C. Existing "preserved vs computed" semantics

#### C8. Manual billing modal — how edits survive

| Question | Answer |
|----------|--------|
| Where stored | `manualBillingMonths` while modal open; commit copies to `workingBillingMonths` (~4818–4820) |
| What prevents overwrite | Comments/state model (~1560–1566): working preserved; append should only add **new** line ids; `isManualBilling` set true on modal save (~4822); `billingLineItemsFollowAutoRef` cleared (~4823) |
| Explicit per-line lock | **No** `Set` of locked ids on working. Modal rows support `preBill` / `preBillSnapshot` on **draft** rows (~322–336, pre-bill toggles ~3804+) |
| Divergence | `compareBillingDivergence` + `isManualBilling` (~7286–7333, ~7302) |

Append path preserves existing ids unless `resyncExistingFromTemplate` (~558–585) or zero-amount backfill (~363–371).

**ID format risk (high confidence):** Hydrated billing rows use **raw** ids from saved JSON (~909–914: `String(rawLiId)`). Template from `generateBillingLineItems` uses **`billing-{mediaType}::{rawId}`** (~3988). `appendMissingLineItemsOnly` compares normalized string keys (~352–356). Mismatch → template rows treated as **new** → duplicate line rows + bucket deltas (~619–639). Could present as “re-spread” / duplicated totals when append re-runs.

#### C9. Create page comparison (`app/mediaplans/create/page.tsx`)

| Behaviour | Classification |
|-----------|----------------|
| `calculateBillingSchedule` when `!isManualBilling` | **(a) Full auto-compute** — `setBillingMonths(billingMonthsCalculated)` (~1228–1230) |
| When `isManualBilling` | Auto ref still computed; **billing months not replaced** (~1228–1230) |
| Line item add | No separate “append only new line” pipeline; burst/total `useEffect` (~2304+) recomputes auto for whole campaign |
| Incremental preserve | **(b) not implemented** on create — only manual **mode** gate, not per-line or append-merge |

**Conclusion:** Create is **(a)** with manual mode gate; edit intends append-only **(b)**-like behaviour but implementation is more complex (see D/E).

#### C10. Edit page: loaded vs in-session line item in billing logic

**No explicit “came from API” vs “added in-session” flag** in billing code.

Proxies that exist:

- `hasPersistedBillingSchedule` / hydrate path skips some modal regeneration (~3522–3526)
- `billingLineItemsFollowAutoRef` + `resyncExistingFromTemplate` (post–full reset only)
- `billingStableLineItemId` / `::new-{index}` only when **no** `line_item_id` (uncommon for TV after add)
- `savedBillingMonths` vs `workingBillingMonths` for divergence, not new-line detection

---

### D. The re-spread trigger — likely root cause

#### D11. `useEffect`s that write billing schedule and touch line items / dates / flags

| Lines | Writes | Deps (summary) |
|-------|--------|----------------|
| 7349–7486 | `setWorkingBillingMonths` (merge) | Campaign dates, `billingPlanStructureKey`, `billingLineItemsLengthFingerprint`, all `*MediaLineItems`, auto ref length, … |
| 7492–7630 | `setWorkingBillingMonths`, `setSavedBillingMonths` (fee seed) | `workingBillingMonths`, `savedBillingMonths`, fingerprint, all `*MediaLineItems`, all `*Bursts`, `form` |
| 2456–2476 (inside `calculateBillingSchedule`) | `setWorkingBillingMonths` when follow-auto | Invoked from 7633–7705 and append effect |
| 4330–4356 | Full working reset | Handler, not effect |
| 7286–7319 | Sets `isManualBilling` only | `saved`, `working`, `autoReference` |
| 7324–7342 | Updates `isManualBilling` / divergence | `workingBillingMonths`, debounced 500ms |

**Not writing working:** 7633–7705 (auto ref only), 2506 hydrate reset, 7286+ divergence.

`mp_production` / `mp_fixedfee`: no billing `useEffect` deps on those form flags directly; production line items flow via `productionMediaLineItems` and `mp_production` in `mediaTypeMap` / append rows (~7375, ~4245).

#### D12. Hypotheses for full re-spread (confidence)

| Hypothesis | Mechanism | Confidence |
|------------|-----------|------------|
| **H1: Billing id mismatch on append** | Hydrated working ids unprefixed; template prefixed → duplicates + bucket re-sum | **High** (code paths verified; runtime symptom match plausible) |
| **H2: `resyncExistingFromTemplate`** | `billingLineItemsFollowAutoRef` true after “Reset billing to auto” → all existing lines overwritten from template (~558–585) | **High** when that mode active; **Low** for typical edit-after-hydrate |
| **H3: Fee seed effect** | Re-seeds `feeMonthlyAmounts` on working when bursts arrive (~7561–7573) | **Medium** — affects fees, not necessarily all media cells |
| **H4: Manual modal not applied** | User edits main table only (read-only summary ~8523+) — must use Edit Billing | **Medium** — UX, not auto-spread |
| **H5: Zero-amount backfill** | Existing row `totalAmount === 0` replaced from template (~363–371) | **Medium** for edge cases |
| **H6: `attachLineItemsToMonths` on save** | Only if months lack detail (`buildBillingScheduleForSave` ~4506–4508) | **Low** during edit session |

#### D13. Gates / debouncing

| Mechanism | Present? |
|-----------|----------|
| Append effect debounce | **Yes** — 250ms (~7356, 7455) |
| Append skip if deep-equal merged | **Yes** (~7438–7443) |
| `calculateBillingSchedule` fingerprint | **Yes** — JSON compare auto ref (~2441–2445) |
| “Needs recompute?” for line add | **No** — `billingLineItemsLengthFingerprint` is **count-only** (~4446–4469), not diff of ids |
| Skip append when `isManualBilling` | **No** — append still runs; only `followAuto` controls resync (~7429–7436) |

---

### E. Add-line-item flow — end-to-end

#### E14. Television on MBA edit (reference flow)

1. **Click** “Add Line Item” — `TelevisionContainer` ~2137–2179 → RHF append with `lineItemId` / `line_item_id` from `createLineItemId`.
2. **`useWatch`** (`watchedLineItems`) updates → effects run:
   - Transform lift: ~1232–1287 → `onMediaLineItemsChangeRef.current(transformedLineItems)`.
   - Bursts/totals: ~1289+ → `onBurstsChange` → page `setTelevisionBursts`.
3. **Page** `handleTelevisionMediaLineItemsChange` (~6538) → `setTelevisionMediaLineItems`.
4. **Billing effects fired** (order approximate, debounced):
   - `billingLineItemsLengthFingerprint` changes → **append effect** (~7349).
   - Burst/total changes → **7633–7705** → `calculateBillingSchedule` → updates `autoReferenceBillingMonths`.
   - Append timeout: `calculateBillingSchedule` again, then `appendAutoReferenceIntoWorkingBilling(working, autoRef, …)` (~7431–7446).
   - Possible **fee seed** (~7492) if bursts populated.
5. **Written to `workingBillingMonths`:** merge template from **all** `*MediaLineItems` via `attachLineItemsToMonths` → `appendMissingLineItemsOnly` per month/key. **Intended:** only new billing ids appended. **Risk:** H1 duplicate ids if hydrate format ≠ template format.
6. **What can be lost:** Manual per-cell amounts on **existing** rows if resync mode (H2), id mismatch duplicates (H1), or zero-backfill (H5). Loaded rows with stable matching ids should keep `monthlyAmounts` (append ~340–341 comment, ~619–647).

#### E15. Media vs production

| Aspect | Media (e.g. TV) | Production |
|--------|-----------------|------------|
| Add handler | ID at click | `lineItemId: ""` until effect (~458–467) |
| Lifted state | `productionMediaLineItems` | Same (+ `productionLineItems` API array, `productionItems` export) |
| Billing key | media type key | `production` (~7375, ~4245) |
| Append / attach | Same pipeline | Same `mediaTypeMap` entry |
| Burst source | Container `onBurstsChange` | `buildBillingBursts(watchedLineItems)` in container (~449–451) |
| ID code | `MEDIA_TYPE_ID_CODES.*` | `"PROD"` string (~437) — separate from enum |

**Conclusion:** Same append architecture; production adds **timing gap** (empty id until next effect) and **PROD** id convention — could affect first append pass if effect order is wrong. Could not confirm race without runtime trace.

---

### F. Save path

#### F16. Billing payload

- **Source:** `workingBillingMonths` via `buildBillingScheduleForSave()` (~4977–4978).
- **Not** recomputed from bursts at save time for the version JSON (bursts sent separately in PUT body ~5017–5027).
- **Transform:** If months lack detailed `lineItems`, `attachLineItemsToMonths` runs on a clone (~4506–4508); then `buildBillingScheduleJSON` + partial approval wrapper (~4510–4513).

#### F17. After successful save

| Item | Behaviour |
|------|-----------|
| Line item identities | Not re-fetched on page (navigation away ~5496) |
| `workingBillingMonths` | Unchanged in memory until unmount |
| `savedBillingMonths` | Deep copy of working (~5045–5047) |
| New / dirty tracking | `billingLineItemsFollowAutoRef = false`; `hasUnsavedChanges` cleared on navigate (~5048, ~5495) |

#### F18. Save failure

- Early exit on billing validation (~4906–4924): no PUT; state unchanged.
- Master fail (~4971–4972): version not attempted.
- Version fail (~5030–5033): throw; **no** `savedBillingMonths` update (only on success ~5045); working unchanged.
- User remains on page with prior working billing (if version fails after master success).

---

### G. Manual override mechanism (existing)

#### G19. MBA edit manual billing entry and commit

| Item | Detail |
|------|--------|
| Entry | “Edit Billing” button ~8518 → `handleManualBillingOpen` ~3423 |
| Draft | Clone `workingBillingMonths` → `manualBillingMonths` (~3426–3427) |
| Modal open merge | Injects generated rows for **missing** ids only (~3498–3518); respects existing rows per media key |
| Commit | `handleManualBillingSave` → full replace `workingBillingMonths` (~4818–4820); `isManualBilling = true` |
| Alter Billing (Finance Hub) | **Not on MBA edit** — `AlterBillingDialog` in `app/finance/FinanceHubPageClient.tsx` only |

#### G20. “User-controlled line item — don’t auto-calculate” pattern

| Pattern | Exists? |
|---------|---------|
| `Set` of locked line item ids | **No** on working schedule |
| Boolean on line items | **No** session-level “manual line” flag |
| `isManualBilling` (campaign-level) | **Yes** — divergence / post-modal; does **not** block append effect |
| `billingLineItemsFollowAutoRef` | **Yes** — after full reset; enables **resync all** lines from template |
| Implicit (working values authoritative) | **Intended** via append-only merge | **Undermined** if id mismatch or resync |
| Modal `preBill` | **Draft only** — not consulted by append pipeline on working |

Per-line reset in modal: `handleManualBillingLineItemResetToAuto` (~4182) pulls one row from auto template.

---

### H. Risks and unknowns

#### H21. Surprises / fragile areas (with confidence)

| Finding | Confidence |
|---------|------------|
| Hydrated billing line `id` vs `billingStableLineItemId` template `id` format mismatch | **90%** code issue; **70%** it explains reported symptom without repro |
| `billingLineItemsLengthFingerprint` is count-only — reorder/duplicate index edge cases not detected | **85%** |
| Append runs when `isManualBilling` true (only resync gated) | **95%** |
| Production new row starts with `lineItemId: ""` | **95%** |
| `"PROD"` not in `MEDIA_TYPE_ID_CODES` | **95%** |
| Comments claim “append-only on main page” but multiple writers (fee seed, follow-auto resync, modal full replace) | **90%** |
| Create vs edit architectural divergence (full recompute vs append) | **95%** |

#### H22. Needs Luke / product clarification

1. Exact saved billing JSON shape for line item ids in production MBAs (prefixed or raw?).
2. Whether reported “re-spread” is **duplicate rows**, **changed amounts on existing rows**, or **month-level fee/tech/production** changes.
3. Whether users had clicked “Reset billing to auto” in session (`billingLineItemsFollowAutoRef`).
4. Whether Finance Hub Alter Billing edits overlap with MBA edit testing (separate surface).
5. Backend: does PUT return new `line_item_id`s or always echo client ids?

#### H23. Out of scope smells (not acted on)

- `handleSaveCampaign` (~5509) PUT without `billingSchedule` — separate/lighter save path vs `handleSaveAll`.
- Navigate away on save prevents validating post-save reload behaviour on edit page.
- `generateBillingLineItems` duplicated (page-local vs `lib/billing/generateBillingLineItems.ts`) with **different** `itemId` strategies.
- Expert TV mode parallel state (`expertTvRows`) — billing uses lifted `*MediaLineItems` only (Domain 4 note pattern).

#### H24. `Object.values(mediaTotals)` and `mp_production` / `mp_fixedfee`

| Check | Result |
|-------|--------|
| `Object.values(mediaTotals)` | **No sightings** in repo (grep entire project) |
| `mp_production` vs `mp_fixedfee` | **De-conflated** on edit: separate form fields (~1135–1140, ~2925–2927); `mp_production` gates Production container section; `shouldEnableProduction` on save also checks `productionMediaLineItems.length` (~5006–5008). `mp_fixedfee` not used in billing append map. |
| `Object.values` elsewhere | e.g. `partialMBAValues.mediaTotals` uses **`Object.entries`** (~5948, ~7178) — not the known double-count trap pattern |

---

### Stage 2 Block 0 Validation

**Date:** 2026-05-27  
**MBA fixture:** `glenda007` (saved billing, prefixed line item ids per Stage 1 / Domain 4 notes)

#### Step 0.1 — Effect map (code review)

| Effect / function | Lines | Dep array | State written | Async boundary |
|-------------------|-------|-----------|---------------|----------------|
| MBA fetch + billing hydrate | `2508–3000` | `[applyClientFees, form, mbaNumber, updateLoadStatus, versionNumber, setContextMbaNumber]` | Resets `saved`/`working`/`autoReference` at `2574–2582`; hydrate `setSavedBillingMonths` + `setWorkingBillingMonths` at `2840–2844` (with data) or clears saved + flag at `2862–2867` (no data); `form.reset` with campaign dates at `2949` **after** billing hydrate in the same `fetch` callback | `await fetch(...)` at `2615`; JSON parse at `2732`; hydrate runs before `form.reset` in callback, but append can still run on an **earlier render** while fetch is in flight |
| `calculateBillingSchedule` | `2399–2505` | All `*Bursts`, fees, `isManualBilling`, `form`, … | `setAutoReferenceBillingMonths`, `setAutoDeliveryMonths`; **conditionally** `setWorkingBillingMonths` when `billingLineItemsFollowAutoRef && !isManualBilling` (`2474–2477`) | Sync; called inside append timeout and burst-only effect `7639–7644` |
| Append (main) | `7355–7494` | `billingHydrationComplete`, `campaignStartDate`, `campaignEndDate`, `billingPlanStructureKey`, `billingLineItemsLengthFingerprint`, `autoReferenceBillingMonths.length`, all `*MediaLineItems`, `calculateBillingSchedule`, `isManualBilling`, `form` | `setWorkingBillingMonths` via `appendAutoReferenceIntoWorkingBilling` (`7451–7452`) | **250ms** `setTimeout` at `7362`; reads `workingBillingMonthsRef.current` at timeout fire time; **pre-fix:** no guard before debounce except campaign dates |

#### Step 0.2 — Log capture

Temporary `[billing-hydrate]` / `[billing-append] effect scheduled` instrumentation was added, then removed in Block 1. Automated Playwright capture was attempted but blocked (browsers not installed locally).

**Luke’s pre-fix console (same MBA, development):**

1. `[billing-append] appendAutoReferenceIntoWorkingBilling` — `workingMonths: 0`, `skeleton: "autoReference"`, `autoRefMonths: 1`
2. `[billing-append] appendAutoReferenceIntoWorkingBilling` — `workingMonths: 2`, `autoRefMonths: 2`, `resyncExistingFromTemplate: false`

**Inferred chronological mechanism (code + logs):**

1. MBA fetch effect starts → synchronously clears `workingBillingMonths` / ref to `[]` (`2574–2582`).
2. Campaign dates remain in form (or become available) while fetch is still in flight → append effect schedules 250ms timeout.
3. Timeout fires before fetch hydrate completes → `workingBillingMonthsRef.current.length === 0` → merge uses auto-reference skeleton → corrupts working.
4. Fetch completes → `setWorkingBillingMonths` with saved months (`2840–2844`) → append runs again with populated working.

This matches the hypothesised ordering: **append before hydrate completion**, not id-format mismatch.

#### Step 0.3 — Interpretation

| Result | **Hypothesis confirmed** |
|--------|--------------------------|
| Proceed to Block 1? | **Yes** |

---

## Domain 5 — Stage 2 Implementation

**Date:** 2026-05-27  
**Branch:** local / uncommitted  
**Scope:** Hydration-ordering gate on MBA edit billing append (Block 1). Block 2 not run.

### 1. Block 0 validation result

**Confirmed.** Append merge ran against empty `workingBillingMonths` while saved billing hydrate was still pending (async fetch + 250ms debounce race). Luke’s logs show `workingMonths: 0` + `skeleton: "autoReference"` before a second append with `workingMonths: 2`.

### 2. Files changed

| File | Change |
|------|--------|
| `app/mediaplans/mba/[mba_number]/edit/page.tsx` | `billingHydrationComplete` state (`1570`); reset `false` on MBA fetch reset (`2577`); set `true` after saved billing hydrate (`2844`) and no-saved-billing path (`2863`); append effect early-return + dep (`7355`, `7463`) |

**Block 0 temporary `console.log` lines:** added for validation, **removed** before Block 1 landed (none remain).

**Pre-existing debug:** `[billing-append]` via `billingAppendDebug` in `appendAutoReferenceIntoWorkingBilling` (`~392–396`, `~758`) — left intact.

### 3. Block 2 outcome

**Skipped** (pending Luke smoke on Block 1).

Reasoning: Stage 1 production `lineItemId: ""` / `"PROD"` issues are secondary compounding factors; root cause is hydrate vs append ordering. Block 2 runs only if post–Block 1 smoke shows production add still misbehaves.

### 4. Design notes / surprises

- Billing hydrate (`setWorkingBillingMonths`) already runs **before** `form.reset` in the fetch callback, but append can still fire on renders where working was cleared at fetch start and dates are already present — the race is **cross-render** (debounce vs `await fetch`), not intra-callback ordering.
- `calculateBillingSchedule` can still write working when `billingLineItemsFollowAutoRef` is true; Luke confirmed Q2 = no session reset — not gated separately.
- Fetch **error** path does not set `billingHydrationComplete` (append stays gated). Acceptable: no dates / no schedule to merge in error UX.

### 5. Smoke readiness (Luke on `localhost`)

| # | Step | Wired path | Expected after Block 1 |
|---|------|------------|-------------------------|
| 1 | Reload MBA with saved billing | Fetch hydrate `2840–2845` → `billingHydrationComplete` → gated append `7357+` | Working matches saved; no duplicate rows |
| 2 | Console on load | `billingAppendDebug` in append merge | No `workingMonths: 0` + `skeleton: "autoReference"` on initial load |
| 3 | Reload MBA without saved billing | No-data path `2862–2867` sets flag; append builds from auto | Schedule from auto; no loop |
| 4 | Add media line item | Append after hydration; merge append-only | Existing rows untouched; new id appended |
| 5 | Edit Billing manual cell | `handleManualBillingSave` `4819+` | Manual edit sticks across subsequent adds |
| 6 | Add production line item | Production container + append (Block 2 not run) | **Observe** — may still have transient `""` id until apiLineItems effect |
| 7 | Edit campaign date | `calculateBillingSchedule` + append merge | Manual amounts on existing ids preserved (`resyncExistingFromTemplate: false` when not follow-auto) |
| 8 | Toggle media off/on | Form flags + `billingPlanStructureKey` | Document round-trip behaviour |
| 9 | Save + reload | `handleSaveAll` `5046+` + fetch hydrate | Persisted billing matches pre-save UI |
| 10 | Domain 4 date warning + billing | Independent effects | No new console errors |

### 6. Follow-up (out of scope)

- Block 2 production identity (`ProductionContainer` `lineItemId: ""`, `"PROD"` ∉ `MEDIA_TYPE_ID_CODES`) if smoke 6 fails.
- Append merge logic itself (if corruption persists with hydration gate) — flag only, do not refactor here.
- `calculateBillingSchedule` follow-auto branch writing working without hydration gate (only if users use “Reset billing to auto” during load).
- Post-save `router.push` prevents in-place reload validation on edit page (Stage 1 H23).

---

## Discovery: MBA edit page version-scoped loading

_Discovery only (Stage 0). No application code changed._

### A. Edit page entry and orchestration

#### 1. Route component

| Item | Value |
|------|-------|
| **Route** | `/mediaplans/mba/[mba_number]/edit` |
| **Page component** | `app/mediaplans/mba/[mba_number]/edit/page.tsx` (`EditMediaPlan`, default export) |
| **Route loading UI** | `app/mediaplans/mba/[mba_number]/edit/loading.tsx` (static spinner; no data fetch) |

#### 2. Mount-time data fetches, hooks, and effects (execution order)

React runs effects in declaration order after each render. On **first mount**, network I/O starts from these effects (others are ref-sync, form-watch, or gated on later state):

| Order | Trigger | What runs | Network? |
|-------|---------|-----------|----------|
| 1 | Mount | Sticky banner `ResizeObserver` (`page.tsx` ~1334) | No |
| 2 | Mount `[]` | `fetch("/api/publishers")` (~1898) | Yes — unscoped |
| 3 | Mount `[]` | `getPublisherKPIs()` → `/api/kpis/publisher` (~1914) | Yes — unscoped |
| 4 | Mount `[]` | `fetch("/api/clients")` (~3009) | Yes — unscoped |
| 5 | `[mbaNumber, versionNumber, …]` | **Primary bootstrap** `fetchMediaPlan` (~2516): `GET /api/mediaplans/mba/{mba}?skipLineItems=true&billingScheduleFull=1[&version=N]` | Yes — see §B |
| 6 | After bootstrap sets `selectedVersionNumber` | `getCampaignKPIs(mba, version)` (~2073) → `/api/kpis/campaign?mbaNumber&versionNumber` | Yes — **version-scoped** |
| 7 | After form reset sets `mp_clientname` | `getClientKPIs(clientName)` (~2060) → `/api/kpis/client?mp_client_name=` | Yes — client-scoped |
| 8 | After bootstrap → `loadPhase === "loadingLineItems"` | Parallel `get*LineItemsByMBA` per enabled media flag (~3194) → `/api/media_plans/{type}?…` | Yes — **intended version-scoped** (see §D) |
| 9 | After `clients` + `mediaPlan` | Client lookup / optional `fetch(/api/clients/{id})` for fees (~3027, ~1486) | Sometimes |

**Not used on this page:** Zustand stores (grep: no `useFinanceStore` / `zustand` in `edit/page.tsx`). `useMediaPlanContext` only calls `setMbaNumber` after bootstrap (~2964).

**Post-ready effects** (not initial load blockers): billing divergence (~7324), billing append (~7395), KPI debounced rebuild (~2096), `setAssistantContext` (~7997), date-warning validation (~2315).

#### 3. Three-phase load state machine

Types at `page.tsx` ~1260–1261:

```typescript
type LoadPhase = "bootstrapping" | "loadingLineItems" | "ready" | "error"
```

| Phase | Set where | What completes | Version data role |
|-------|-----------|----------------|-------------------|
| **`bootstrapping`** | Initial state (~1765); reset on MBA/version change (~2531) | `fetchMediaPlan` (~2516): master + **all** `media_plan_versions` rows (server), form reset, billing hydrate from **one** version’s `billingSchedule` | **Version list + target version row** loaded here; line items **skipped** (`skipLineItems=true`) |
| **`loadingLineItems`** | After successful bootstrap (~2983) | Parallel per-media `get*LineItemsByMBA` (~3194) | Line items for **active version only** (client passes `versionToUse`) |
| **`ready`** | All enabled media loads finish or none enabled (~3238, ~3313) | Editor interactive; divergence check waits for `ready` (~7330) | — |
| **`error`** | Bootstrap failure (~2734, ~2995) | Modal + error state | — |

Per-media status also tracked in `mediaLoadStatus` (`idle` \| `loading` \| `ready` \| `error`) and `lineItemLoadItems` (load modal).

---

### B. `media_plan_versions` loading

#### 4. Endpoints and call sites

| Layer | File | Xano / app endpoint |
|-------|------|---------------------|
| **Bootstrap (edit page)** | `app/mediaplans/mba/[mba_number]/edit/page.tsx` ~2620 | `GET /api/mediaplans/mba/{mba_number}?skipLineItems=true&billingScheduleFull=1[&version=N]` |
| **Bootstrap handler** | `app/api/mediaplans/mba/[mba_number]/route.ts` ~738, ~822–825 | Xano `media_plan_master?mba_number={mba}` then **`media_plan_versions?mba_number={mba}`** (no version filter) |
| **Line-item routes** (per type) | e.g. `app/api/media_plans/television/route.ts` ~125 | `getVersionNumberForMBA` may hit `media_plan_versions?media_plan_master_id={id}&version_number={n}` when version not passed (`lib/api/mediaPlanVersionHelper.ts` ~52–54). **Edit page passes version**, so this path is skipped when `mp_plannumber` / `media_plan_version` query params are present (~18–20 helper). |

#### 5. All versions vs one version

**The MBA bootstrap route fetches ALL version rows for the MBA**, then picks one in memory.

```822:847:app/api/mediaplans/mba/[mba_number]/route.ts
    // Fetch ALL versions for this MBA to derive target and latest
    const versionsResponse = await axios.get(
      `${mediaPlansBaseUrl}/media_plan_versions?mba_number=${encodeURIComponent(mba_number)}`
    )
    // ...
    let targetVersionNumber = requestedVersionNumber ?? latestVersionNumber ?? parseVersion(masterData?.version_number) ?? 1
    let versionData = allVersionsForMBA.find((v: any) => parseVersion(v.version_number) === targetVersionNumber) || null
```

The edit page **does** forward an optional `version` query param to that route (~2618–2620). That scopes which row is **selected** for the response, but **does not** scope the Xano list query — every version row is still downloaded server-side.

The client receives a trimmed list for the switcher only:

```2796:2801:app/mediaplans/mba/[mba_number]/edit/page.tsx
        const versionsFromApi = Array.isArray(data.versions) ? data.versions.map((v: any) => ({
          id: v.id,
          version_number: typeof v.version_number === 'string' ? parseInt(v.version_number, 10) : v.version_number,
          created_at: v.created_at ?? null
        })) : []
        setAvailableVersions(versionsFromApi)
```

(API builds `versions` from `versionsMetadata` at `route.ts` ~1172, not full rows.)

#### 6. Related container / line-item data on version rows

- **Bootstrap path (`skipLineItems=true`):** Line items are **not** loaded in the MBA handler (~883–925 skipped). Billing/delivery JSON and version-level flags come from the **selected** `versionData` row (~930–960).
- **`media_plan_versions` list rows** do not carry per-media line-item tables in the edit flow; finance code documents that list endpoints often omit related rows and hydrate separately (`lib/finance/planLineItemEnrichment.ts` ~5–10, `hydratePlanVersionsForBillingLineEnrichment`).
- **Line items** are fetched in phase 2 via separate `media_plan_*` / `*_line_items` tables through `/api/media_plans/{type}`.

#### 7. Active / correct version resolution

| Priority | Source | Code |
|----------|--------|------|
| 1 | URL query `?version=` | `const versionNumber = searchParams.get('version')` (~1323); appended to bootstrap URL (~2618–2620) |
| 2 | Server MBA handler | `requestedVersionNumber ?? latestVersionNumber ?? masterData.version_number ?? 1` (`route.ts` ~845) |
| 3 | Client after bootstrap | `setSelectedVersionNumber(loadedVersionNumber)` from `data.version_number` (~2795) |
| 4 | Line-item phase | `versionToUse` = URL `versionNumber` if set, else `mediaPlan.version_number` (~3205–3214) |

Version switcher (~7784–7801): selecting another version opens a rollback modal, then `router.push(…/edit?version={n})`, which re-runs bootstrap with `version` param.

---

### C. Reference pattern: media container version filtering

#### 8. Mechanism

**Shared query builder** — `lib/api/mediaPlanLineItemQuery.ts`:

```1:14:lib/api/mediaPlanLineItemQuery.ts
export function lineItemPaginationParams(
  mbaNumber: string,
  versionNumber: string | null | undefined
): Record<string, string> {
  const params: Record<string, string> = { mba_number: mbaNumber }
  if (versionNumber != null && String(versionNumber).trim() !== "") {
    const v = String(versionNumber)
    params.mp_plannumber = v
    params.version_number = v
    params.media_plan_version = v
  }
  return params
}
```

**Media-container helper** — `lib/api/media-containers.ts` `buildMediaContainerUrl` (~8–25): same three param names on container Xano endpoints.

**Browser client** — `lib/api.ts` `fetchLineItemsFromApi` (~1979–1984): adds `media_plan_version`, `mp_plannumber`, `version_number` to `/api/media_plans/{type}`.

**MBA route server-side** — `fetchXanoTableForMediaType` (`route.ts` ~686–698): fallback chain `media_plan_version` (FK id) → `mp_plannumber` → `version_number` → `media_plan_version` (numeric).

**Safety filter** — `filterLineItemsByPlanNumber` / `filterByMbaAndVersion` after fetch.

**Xano `==?` null-safe operator:** Not used anywhere in this repo (grep `==?` / `??` in API layers: zero matches). Filtering uses plain query-string equality params only.

#### 9. Identifier

- **Default:** `mp_plannumber` (plus `version_number` and `media_plan_version` sent together for legacy compatibility).
- **Best (when FK known):** `media_plan_version` / `media_plan_version_id` = `media_plan_versions.id` (`route.ts` ~658–662).
- **Divergence — production:** `media_plan_production` — comment states Xano filters by `mba_number` only; version params are forward-compat; JS filter + MBA-wide fallback (`app/api/media_plans/production/route.ts` ~40–76).

#### 10. Pattern summary (mirror target)

1. Resolve target version number (from URL or master).
2. Pass **`mba_number` + `mp_plannumber` / `version_number` / `media_plan_version`** on every line-item Xano request.
3. Prefer **`media_plan_versions.id`** as `media_plan_version` when available.
4. Paginate via `fetchAllXanoPages` with those params.
5. Apply `filterLineItemsByPlanNumber` as a JS safety net when the server returns extra historic rows.

---

### D. Over-fetch quantification

#### 11. What “all elements” means today

| Category | On edit load? | Scoped to active version? |
|----------|---------------|---------------------------|
| **All `media_plan_versions` rows** (full records: flags, `billingSchedule`, `deliverySchedule`, etc.) | Yes — server fetches every row for MBA | **No** — all versions downloaded; one row used |
| **Version list metadata** (`id`, `version_number`, `created_at`) | Yes — returned as `data.versions` | N/A (list is intentionally all versions) |
| **Per-media line items** (18 tables) | Yes — phase 2, enabled types only | **Intended yes** — version params on every request + JS filter |
| **Production line items** | If `mp_production` enabled | **Partial** — Xano MBA-wide; JS filter; fallback returns all MBA rows if filter empty |
| **Nested line-item arrays on version rows** | Not used on edit path | — |

#### 12. Network-call inventory (single edit-page load)

Assume MBA `X`, active version `V`, `N` enabled media types.

| # | Call | Version-scoped? |
|---|------|-----------------|
| 1 | `GET /api/mediaplans/mba/X?skipLineItems=true&billingScheduleFull=1[&version=V]` | Response uses one version; **Xano `media_plan_versions` query is not scoped** |
| 2 | `GET /api/clients` | No |
| 3 | `GET /api/publishers` | No |
| 4 | `GET /api/kpis/publisher` | No |
| 5 | `GET /api/kpis/campaign?mbaNumber=X&versionNumber=V` | Yes |
| 6 | `GET /api/kpis/client?mp_client_name=…` | Client-scoped |
| 7–(6+N) | `GET /api/media_plans/{type}?mba_number=X&media_plan_version=V&mp_plannumber=V&version_number=V` × N | **Intended yes** (production: see §C.9) |
| Optional | `GET /api/clients/{id}` | No |

**Server-side sub-calls inside (1):** Xano `media_plan_master?mba_number=X`, Xano `media_plan_versions?mba_number=X` (all rows).

**Server-side sub-calls inside (7–):** Xano `media_plan_{type}?mba_number=X&…version params…` per route; `getVersionNumberForMBA` short-circuits when `mp_plannumber` provided.

**Confidence &lt;90%:** Whether each Xano line-item table actually honors version query params server-side (vs returning all MBA rows and relying on JS filter). No runtime trace was captured in this discovery.

---

### E. Endpoint capability (`media_plan_versions`)

Existing filter params **already used elsewhere in the codebase**:

| Param | Example call site |
|-------|-------------------|
| `mba_number` | `app/api/mediaplans/mba/[mba_number]/route.ts` ~824 |
| `media_plan_master_id` | `lib/api/mediaPlanVersionHelper.ts` ~53; `app/api/campaigns/[mba_number]/route.ts` ~569 |
| `version_number` (with `media_plan_master_id`) | `mediaPlanVersionHelper.ts` ~53 |
| `id` | `app/mediaplans/[id]/edit/page.tsx` ~23 |

**Not evidenced in repo:** `media_plan_versions?mba_number=X&version_number=V` as a **combined** filter (only `master_id + version_number` is quoted). A scoped single-version fetch likely needs **client/route change** to add `version_number` (and/or `id`) to the MBA bootstrap query; Xano may already support it via the same mechanism as `mediaPlanVersionHelper`, but that combined shape was **not verified** here (&lt;90% confidence without Xano schema or live probe).

There is **no** evidence of a lightweight “metadata-only” list endpoint — the switcher today piggybacks on the full-row list fetch.

---

### F. Coupling and risk

| Need | Data required | Current fetch | Scoping editor body safely? |
|------|---------------|---------------|---------------------------|
| **Version switcher / rollback modal** | `id`, `version_number`, `created_at` for all versions | `versionsMetadata` from full `media_plan_versions?mba_number=` | Yes — keep a **list** fetch (can remain MBA-wide if cheap metadata) |
| **Latest / next save version** | `max(version_number)`, `nextVersionNumber` | Derived from same full list (~837–841, ~1173–1174) | List metadata only |
| **Editor body** | One `versionData` row (flags, schedules, client) | One row selected from full list | **Can scope** — does not need other versions’ `billingSchedule` / `deliverySchedule` payloads |
| **Line-item containers** | Per-type rows for active version | Phase 2 parallel fetches | Already version-targeted at API layer |
| **KPIs** | Campaign KPIs for active version | `/api/kpis/campaign` with `versionNumber` | Already scoped |

**Critical split:** Scoping **element payloads** (single version row + line items) must **not** remove the **version list** used by `availableVersions` / `handleVersionSelect` (~8143–8150). Those need all `(id, version_number, created_at)` tuples, not full schedule JSON for every version.

---

### Explicit answers

**Where is the single highest-value change point to load only the active version's elements?**

`app/api/mediaplans/mba/[mba_number]/route.ts` ~822–847: replace unconditional `media_plan_versions?mba_number=` with (a) a **single-version** fetch for `versionData` when `version` query param is present (and/or after `targetVersionNumber` is known from master), and (b) a **separate lightweight list** fetch for switcher metadata if the full-row list is still required.

Line items are already phase-split and version-parameterized; the dominant over-fetch in bootstrap is **all version rows’ heavy JSON**, not the phase-2 line-item calls.

**Is the active version resolvable BEFORE the expensive fetch fires?**

- **Yes**, when `?version=V` is in the URL (~1323) — known on first render before `fetchMediaPlan`.
- **Partially**, when `version` is omitted: latest could be inferred from `media_plan_master.version_number` without downloading every version row, but the current handler **always** loads all versions first to compute `latestVersionNumber` (~837–845).

Phase-2 line-item fetches are **gated** on bootstrap completing (`loadPhase === "loadingLineItems"` and `mediaPlan.version_number`, ~3194–3198), so they do not start until after the expensive bootstrap even when URL version is known.

**Does scoping require only client-side change, Xano filter param, or both?**

- **`media_plan_versions` element payload:** Primarily **server route change** in `app/api/mediaplans/mba/[mba_number]/route.ts` to pass `version_number` / `id` on the Xano query; possibly **no Xano schema change** if existing filters work (&lt;90% for `mba_number` + `version_number` combo — see §E).
- **Line items:** Already wired client + API routes; remaining gap is **`media_plan_production`** (documented Xano MBA-wide behaviour) — may need Xano column/filter work.
- **Pure client-only** scoping of version **rows** is not possible today: the over-fetch happens in the **Next API route’s** Xano call, not in the browser.

---

_End of AUDIT.md._
