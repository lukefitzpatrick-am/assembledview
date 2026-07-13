# PERF-DISCOVERY-LOAD-SPEED

Discovery-only report. Generated 2026-07-06.

---

## SECTION A — Dashboard media plans list

### A1. Page components and data-fetching code

There are **two** admin-facing “media plans list” surfaces:

#### A1a. Global admin dashboard (`/dashboard`)

**App router page:** `app/dashboard/page.tsx` (server component — auth/redirect only; no data fetch)

```6:79:app/dashboard/page.tsx
export default async function DashboardPage() {
  const session = await auth0.getSession()
  const user = session?.user
  // ... auth redirects ...
  return <DashboardOverview returnTo="/dashboard" />
}
```

**List component:** `components/dashboard/DashboardOverview.tsx` (client component). Data fetch in `fetchData`:

```1519:1583:components/dashboard/DashboardOverview.tsx
  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setFetchError(null)

      try {
        const [monthlyPubResp, monthlyClientResp] = await Promise.all([
          fetch("/api/dashboard/global-monthly-publisher-spend"),
          fetch("/api/dashboard/global-monthly-client-spend"),
        ])
        // ... parse monthly responses ...
      } catch (error) {
        console.error("Dashboard: Error fetching monthly breakdowns:", error)
        setMonthlyPublisherSpend([])
        setMonthlyClientSpend([])
        setClientProfileColors({})
      }

      const mediaPlansResponse = await fetch("/api/media_plans").catch((err) => {
        console.error("Dashboard: Error fetching media plans:", err)
        throw new Error("Failed to fetch media plans")
      })

      if (!mediaPlansResponse.ok) {
        const errorText = await mediaPlansResponse.text()
        console.error("Dashboard: Media plans API error:", mediaPlansResponse.status, errorText)
        throw new Error(`Failed to fetch media plans: ${mediaPlansResponse.status}`)
      }

      const mediaPlansRaw = await mediaPlansResponse.json()
      const mediaPlansData = transformMediaPlanData(Array.isArray(mediaPlansRaw) ? mediaPlansRaw : [])

      let scopesData: ScopeOfWork[] = []
      if (showTables || showMetrics) {
        const scopesResponse = await fetch("/api/scopes-of-work").catch((err) => {
          console.error("Dashboard: Error fetching scopes:", err)
          return { ok: false, json: async () => [] }
        })

        if (scopesResponse.ok) {
          const scopesRaw = await scopesResponse.json()
          scopesData = Array.isArray(scopesRaw) ? scopesRaw : []
        }
      }

      setMediaPlans(mediaPlansData)
      setScopes(scopesData)
      // ... metrics derived from mediaPlansData (billingSchedule / deliverySchedule) ...
```

Trigger:

```1718:1725:components/dashboard/DashboardOverview.tsx
  useEffect(() => {
    if (mounted && user && !isClient) {
      fetchData()
    }
    if (mounted && user && isClient) {
      setLoading(false)
    }
  }, [mounted, user, isClient, fetchData])
```

#### A1b. Media Plans index (`/mediaplans`)

**App router page:** `app/mediaplans/page.tsx` (client component — page and list are the same file)

```141:248:app/mediaplans/page.tsx
  // Fetch media plans from the API
  useEffect(() => {
    const fetchMediaPlans = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/mediaplans");
        if (!response.ok) {
          throw new Error("Failed to fetch media plans");
        }
        const data = await response.json();
        // ... normalize booleans, derive Completed status ...
        setMediaPlans(processedPlans as MediaPlan[]);
        setFilteredPlans(processedPlans as MediaPlan[]);
      } catch (err) {
        console.error("Error fetching media plans:", err);
        setError(err instanceof Error ? err.message : "An unknown error occurred");
      } finally {
        setLoading(false);
      }
    };
  
    fetchMediaPlans();
  }, []);
```

---

### A2. API routes the dashboard list calls

#### Route 1: `GET /api/media_plans` — used by `DashboardOverview`

**File:** `app/api/media_plans/route.ts`

```39:64:app/api/media_plans/route.ts
export async function GET() {
  const res = await fetch(
    xanoUrl("media_plan_versions", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
  )
  if (!res.ok) return NextResponse.error()
  const data = await res.json()
  
  // Filter to keep only the highest version for each unique MBA number
  const filteredData = Object.values(
    (Array.isArray(data) ? data : [data]).reduce((acc: Record<string, any>, plan: any) => {
      const mbaNumber = plan.mba_number;
      if (!mbaNumber) {
        return acc;
      }
      const versionNumber = plan.version_number || 0;
      if (!acc[mbaNumber] || (acc[mbaNumber].version_number || 0) < versionNumber) {
        acc[mbaNumber] = plan;
      }
      return acc;
    }, {} as Record<string, any>)
  );
  
  return NextResponse.json(filteredData)
}
```

| Item | Value |
|------|-------|
| **Full Xano URL** | `{XANO_MEDIA_PLANS_BASE_URL or XANO_MEDIAPLANS_BASE_URL}/media_plan_versions` (no query params) |
| **Query params / filters to Xano** | None — fetches entire `media_plan_versions` table |
| **Pagination / field selection** | None |
| **Response transformation** | In-memory: keep highest `version_number` per `mba_number`; returns full version row objects |
| **Route caching** | No `export const dynamic`, `revalidate`, `fetch` cache options, or `Cache-Control` headers |

`xanoUrl` construction:

```27:31:lib/api/xano.ts
export function xanoUrl(path: string, keys: EnvKey = DEFAULT_ENV_KEYS): string {
  const base = getXanoBaseUrl(keys)
  const trimmedPath = path.replace(/^\//, "")
  return `${base}/${trimmedPath}`
}
```

#### Route 2: `GET /api/mediaplans` — used by `/mediaplans` list page

**File:** `app/api/mediaplans/route.ts`

```7:12:app/api/mediaplans/route.ts
export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

const XANO_TIMEOUT_MS = 15_000
const XANO_LONG_TIMEOUT_MS = 30_000
```

```100:164:app/api/mediaplans/route.ts
export async function GET() {
  try {
    try {
      // Fetch both media_plan_versions and media_plan_master in parallel
      const [versionsResponse, masterResponse] = await Promise.all([
        axios.get(xanoUrl("media_plan_versions", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]), {
          timeout: XANO_LONG_TIMEOUT_MS,
        }),
        axios.get(xanoUrl("media_plan_master", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]), {
          timeout: XANO_TIMEOUT_MS,
        }),
      ])
      
      const versionsData = versionsResponse.data
      const mastersData = Array.isArray(masterResponse.data) ? masterResponse.data : [masterResponse.data]
      
      // ... masterMap by mba_number ...
      // ... reduce to latest version per MBA from versionsData ...
      const mergedData = latestVersionsFromVersions.map((versionPlan: any) => {
        const masterData = masterMap.get(versionPlan.mba_number)
        if (masterData && masterData.version_number !== undefined) {
          return {
            ...versionPlan,
            version_number: masterData.version_number
          }
        }
        return versionPlan
      })

      return NextResponse.json(mergedData)
```

| Item | Value |
|------|-------|
| **Full Xano URLs** | `{base}/media_plan_versions` and `{base}/media_plan_master` (parallel, no query params) |
| **Query params / filters** | None — full-table fetches |
| **Response transformation** | Latest version per MBA from versions; override `version_number` from `media_plan_master` |
| **Fallback** | POST `{base}/get_mediaplan_topline` with `{ version_number: latestVersionId }` if versions fetch fails |
| **Route caching** | `dynamic = "force-dynamic"`, `revalidate = 0`; axios timeouts 15s / 30s; no `Cache-Control` on response |

#### Route 3: `GET /api/dashboard/global-monthly-publisher-spend`

**File:** `app/api/dashboard/global-monthly-publisher-spend/route.ts`

```4:8:app/api/dashboard/global-monthly-publisher-spend/route.ts
export async function GET() {
  try {
    const result = await getGlobalMonthlyPublisherSpend()
    return NextResponse.json(result)
```

**Xano call inside** `lib/api/dashboard/global.ts`:

```94:98:lib/api/dashboard/global.ts
export async function getGlobalMonthlyPublisherSpend(): Promise<GlobalMonthlyPublisherSpend[]> {
  const { start: fyStart, end: fyEnd, months: fyMonths } = getAustralianFinancialYear(new Date())

  const versionsResponse = await apiClient.get(xanoMediaPlansUrl("media_plan_versions"))
  const allVersions = parseXanoListPayload(versionsResponse.data)
```

| Item | Value |
|------|-------|
| **Xano URL** | `{base}/media_plan_versions` (unfiltered fetch-all) |
| **Transformation** | Picks highest booked/approved/completed version per MBA; aggregates `deliverySchedule` / `billingSchedule` JSON for current AU FY |
| **Caching** | No route segment config; `apiClient` axios timeout 10s |

#### Route 4: `GET /api/dashboard/global-monthly-client-spend`

Same pattern as Route 3 (`getGlobalMonthlyClientSpend` → `media_plan_versions` fetch-all).

#### Route 5: `GET /api/scopes-of-work` (conditional)

**File:** `app/api/scopes-of-work/route.ts`

```39:53:app/api/scopes-of-work/route.ts
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    
    let url = xanoUrl("scope_of_work", "XANO_SCOPES_BASE_URL");
    if (status) {
      url += `?project_status=${status}`;
    }
    
    const response = await retryApiCall(() => 
      apiClient.get(url)
    );
    
    return NextResponse.json(response.data);
```

Dashboard calls without `status` param → full `scope_of_work` list.

---

### A3. Client vs server fetch; client caching libraries

| Surface | Fetch location | Caching |
|---------|----------------|---------|
| `/dashboard` (`DashboardOverview`) | **Client-side** `useEffect` + `fetch()` | React `useState` only; refetch on mount when admin user loads |
| `/mediaplans` (`MediaPlansPage`) | **Client-side** `useEffect` + `fetch("/api/mediaplans")` | React `useState` only; single fetch on mount |

No SWR, react-query, or TanStack Query for these lists.

**Command:**

```
PS> Select-String -Path "package.json" -Pattern "swr|react-query|tanstack"

package.json:55:    "@tanstack/react-table": "^8.21.3",
package.json:56:    "@tanstack/react-virtual": "^3.13.23",
```

(`@tanstack/react-table` and `@tanstack/react-virtual` are table/virtualization libs, not data-fetch caches.)

---

### A4. Field usage audit (UI renders / filters)

#### `/mediaplans` list (`app/mediaplans/page.tsx`)

**Rendered / sorted / searched fields:**

| Field | Usage |
|-------|-------|
| `id` | Table column, card key |
| `mp_client_name` | Table, search filter, slugify for View link |
| `mba_number` | Table, search filter, edit/view navigation |
| `mp_campaignname` / `campaign_name` | Table, search filter |
| `version_number` | Table, edit URL query |
| `mp_campaignbudget` | Table, sort |
| `campaign_start_date` / `campaign_end_date` | Table, sort, Completed derivation |
| `campaign_status` | Status grouping (Booked/Approved/Planned/Draft/Completed/Cancelled), badge |
| `brand` | Search filter only |
| `mp_television` … `mp_influencers` (19 flags) | Media type tags via `getMediaTypeTags()` |

**Not rendered on list but present on API objects:** `client_contact`, `po_number`, `fixed_fee`, `created_at`, and any other fields on the full `media_plan_versions` row returned by `/api/mediaplans`.

#### `/dashboard` list (`DashboardOverview`)

**`transformMediaPlanData` maps these UI fields:**

```738:789:components/dashboard/DashboardOverview.tsx
const transformMediaPlanData = (apiData: any[]): MediaPlan[] =>
  apiData.map((item: any) => {
    let billingSchedule = item.billingSchedule
    let deliverySchedule = item.deliverySchedule
    // ... JSON.parse if string ...
    return {
      id: item.id || 0,
      mp_clientname: item.mp_client_name || item.mp_clientname || "",
      mp_campaignname: item.campaign_name || item.mp_campaignname || "",
      mp_mba_number: item.mba_number || item.mp_mba_number || "",
      mp_version: item.version_number || item.mp_version || 1,
      mp_brand: item.brand || "",
      mp_campaignstatus: item.campaign_status || item.mp_campaignstatus || "",
      mp_campaigndates_start: item.campaign_start_date || item.mp_campaigndates_start || "",
      mp_campaigndates_end: item.campaign_end_date || item.mp_campaigndates_end || "",
      mp_campaignbudget: item.mp_campaignbudget || 0,
      mp_television: item.mp_television || false,
      // ... all 19 mp_* media flags ...
      billingSchedule: billingSchedule || undefined,
      deliverySchedule: deliverySchedule || undefined,
    }
  })
```

**Additional non-table use:** `billingSchedule` and `deliverySchedule` are parsed and used server-side in the same `fetchData` callback for FY publisher/client spend charts and live-publisher counts — **not** shown as table columns but kept in client state.

**Dashboard filters** (client-side): client name, MBA, campaign name, status, month (via `billingScheduleMatchesMonth` on schedule JSON).

#### Full-record / large JSON from Xano

**Explicit:** Both `GET /api/media_plans` and `GET /api/mediaplans` return **full `media_plan_versions` rows** (highest version per MBA after in-memory filter). There is **no field selection** at the Xano or API layer. Rows typically include large JSON blobs when present on the version record, including:

- `billingSchedule` / `billing_schedule`
- `deliverySchedule` / `delivery_schedule`
- Per-channel burst JSON is on line-item tables, not list rows — but schedule JSON on version rows can be very large.

---

### A5. S4 fetch-all scoping — `GET /api/mediaplans` status

No dedicated `S4-*.md` file exists at repo root. Prior findings live in **`AUDIT.md`** (§E–F, network-call inventory) and **`domain-4/discovery/`** (line-item endpoint truth table, baseline-performance template).

**Summary:** `GET /api/mediaplans` performs **unscoped fetch-all** of `media_plan_versions` and `media_plan_master` (no `mba_number`, `version_number`, or field-projection query params), then reduces to one row per MBA in Node. `AUDIT.md` documents this as the dominant over-fetch for list/bootstrap paths and recommends scoping at `app/api/mediaplans/mba/[mba_number]/route.ts` (which has since been partially improved — see B2). The `/mediaplans` list page does not use the MBA-scoped bootstrap route; it still hits the fetch-all list endpoint. Domain 4 discovery (`domain-4/discovery/endpoints-truth-table.md`, `baseline-performance.md`) tracks line-item Xano filtering separately; Stage 2c smoke (2026-05-21) showed some tables still return MBA-wide payloads on the wire despite version query params.

---

## SECTION B — Edit pages

### B1. Edit page entry and bootstrap data-loading

**Canonical edit URL:** `/mediaplans/mba/[mba_number]/edit`  
**File:** `app/mediaplans/mba/[mba_number]/edit/page.tsx` (`"use client"`)

**Legacy redirect:** `app/mediaplans/[id]/edit/page.tsx` → resolves version by Xano `id`, redirects to MBA URL.

Primary bootstrap `useEffect`:

```2800:2814:app/mediaplans/mba/[mba_number]/edit/page.tsx
        const timestamp = Date.now()
        const versionParam = versionNumber ? `&version=${encodeURIComponent(versionNumber)}` : ''
        const apiUrl = `/api/mediaplans/mba/${encodeURIComponent(mbaNumber)}?t=${timestamp}&skipLineItems=true&billingScheduleFull=1${versionParam}`
        
        const response = await fetch(apiUrl, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        })
```

On success → `setLoadPhase("loadingLineItems")` (line items load in separate effect).

---

### B2. Fetches on edit-page load (order and parallelism)

| Phase | Call | Parallel? | Xano / notes |
|-------|------|-------------|--------------|
| **Mount (parallel, independent)** | `GET /api/clients` | Own `useEffect` | Xano clients collection |
| **Mount** | `GET /api/publishers` | Own `useEffect` | Xano publishers |
| **Mount** | `GET /api/media-container-best-practice` | Own `useEffect` | Xano |
| **Mount** | `getPublisherKPIs()` | Own `useEffect` | `/api/kpis/publisher` |
| **1 — Bootstrap** | `GET /api/mediaplans/mba/{mba}?skipLineItems=true&billingScheduleFull=1[&version=V]` | **Awaited alone** first | See server sub-calls below |
| **After bootstrap** | `getCampaignKPIs(mba, version)` | When `selectedVersionNumber` known | `/api/kpis/campaign?mbaNumber=&versionNumber=` |
| **After bootstrap** | `getClientKPIs(clientName)` | When `mp_clientname` in form | `/api/kpis/client?mp_client_name=` |
| **2 — Line items** | `GET /api/media_plans/{channel}?mba_number=&media_plan_version=&mp_plannumber=&version_number=` × **N enabled types** | **`Promise.all`** | Per-channel Xano tables |

**Server sub-calls inside bootstrap** (`app/api/mediaplans/mba/[mba_number]/route.ts`):

```733:846:app/api/mediaplans/mba/[mba_number]/route.ts
    const masterQueryUrl = `${mediaPlansBaseUrl}/media_plan_master?mba_number=${encodeURIComponent(mba_number)}`
    const masterResponse = await axios.get(masterQueryUrl, { timeout: XANO_TIMEOUT_MS })

    const trimmedVersionsResponse = await axios.get(
      `${mediaPlansBaseUrl}/media_plan_versions_trimmed?mba_number=${encodeURIComponent(mba_number)}`,
      { timeout: XANO_TIMEOUT_MS }
    )

    const scopedVersionResponse = await axios.get(
      `${mediaPlansBaseUrl}/media_plan_versions?mba_number=${encodeURIComponent(mba_number)}&version_number=${targetVersionNumber}`,
      { timeout: XANO_LONG_TIMEOUT_MS }
    )
```

| Sub-call | Scoped? |
|----------|---------|
| `media_plan_master?mba_number=` | Yes |
| `media_plan_versions_trimmed?mba_number=` | Yes (metadata only) |
| `media_plan_versions?mba_number=&version_number=` | Yes (single version row when param works) |

**Line-item API — `mp_plannumber` / version filtering** (`lib/api.ts` browser path):

```1861:1868:lib/api.ts
  const params = new URLSearchParams({ mba_number: mbaNumber })
  if (mediaPlanVersion !== undefined && mediaPlanVersion !== null) {
    params.set("media_plan_version", String(mediaPlanVersion))
    params.set("mp_plannumber", String(mediaPlanVersion))
    params.set("version_number", String(mediaPlanVersion))
  }

  const url = `/api/media_plans/${pathSegment}?${params.toString()}`
```

Example television route Xano query:

```144:147:app/api/media_plans/television/route.ts
    const data = await fetchAllXanoPages(
      xanoUrl("media_plan_television", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]),
      lineItemPaginationParams(mbaNumber, versionNumber),
      "TELEVISION"
    )
```

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

**Parallel line-item load on edit page:**

```3438:3443:app/mediaplans/mba/[mba_number]/edit/page.tsx
      console.log(
        `[DATA LOAD] Parallel loading ${enabledInOrder.length} media types (version ${versionToUse})`
      )

      await Promise.all(
        enabledInOrder.map(async ({ flag, label, fetchFn, setter }) => {
```

**Sequential vs parallel summary:**

- Bootstrap: **sequential await** (blocks `loadPhase` transition)
- Clients / publishers / best-practice / publisher KPIs: **parallel to bootstrap** (separate effects, no gating)
- Line items: **parallel** across enabled channels after bootstrap completes
- Campaign/client KPIs: parallel to line items once version/client known

---

### B3. All channels vs enabled channels only

Line items are fetched **only for media types enabled on the plan** (form boolean flags), not all ~20 channels:

```3411:3418:app/mediaplans/mba/[mba_number]/edit/page.tsx
      const formValues = form.getValues()
      const enabledInOrder = mediaTypes
        .filter((medium) => formValues[medium.name])
        .map((medium) => ({
          flag: medium.name,
          label: medium.label,
          ...lineItemLoaderConfig[medium.name],
        }))
```

Server-side (when `skipLineItems` is false) uses the same idea via `deriveEnabledMediaTypes(versionRecord)` before `Promise.all` over enabled types (`app/api/mediaplans/mba/[mba_number]/route.ts` ~900–928). Edit page uses `skipLineItems=true` on bootstrap, so server line-item fetch is skipped; client loads enabled types only in phase 2.

---

### B4. Bundle/render — `next/dynamic` vs `React.lazy`

**PowerShell command output:**

```
PS> Select-String -Path "app\**\*.tsx","components\**\*.tsx" -Pattern "next/dynamic" -List

app\finance\FinanceHubPageClient.tsx:3:import dynamic from "next/dynamic"
```

**Edit page uses `React.lazy` (not `next/dynamic`) for all channel containers:**

```1354:1373:app/mediaplans/mba/[mba_number]/edit/page.tsx
const TelevisionContainer = lazy(() => import("@/components/media-containers/TelevisionContainer"))
const RadioContainer = lazy(() => import("@/components/media-containers/RadioContainer"))
const NewspaperContainer = lazy(() => import("@/components/media-containers/NewspaperContainer"))
const MagazinesContainer = lazy(() => import("@/components/media-containers/MagazinesContainer"))
const OOHContainer = lazy(() => import("@/components/media-containers/OOHContainer"))
const CinemaContainer = lazy(() => import("@/components/media-containers/CinemaContainer"))
const DigitalDisplayContainer = lazy(() => import("@/components/media-containers/DigitalDisplayContainer"))
const DigitalAudioContainer = lazy(() => import("@/components/media-containers/DigitalAudioContainer"))
const DigitalVideoContainer = lazy(() => import("@/components/media-containers/DigitalVideoContainer"))
const BVODContainer = lazy(() => import("@/components/media-containers/BVODContainer"))
const IntegrationContainer = lazy(() => import("@/components/media-containers/IntegrationContainer"))
const SearchContainer = lazy(() => import("@/components/media-containers/SearchContainer"))
const SocialMediaContainer = lazy(() => import("@/components/media-containers/SocialMediaContainer"))
const ProgDisplayContainer = lazy(() => import("@/components/media-containers/ProgDisplayContainer"))
const ProgVideoContainer = lazy(() => import("@/components/media-containers/ProgVideoContainer"))
const ProgBVODContainer = lazy(() => import("@/components/media-containers/ProgBVODContainer"))
const ProgAudioContainer = lazy(() => import("@/components/media-containers/ProgAudioContainer"))
const ProgOOHContainer = lazy(() => import("@/components/media-containers/ProgOOHContainer"))
const InfluencersContainer = lazy(() => import("@/components/media-containers/InfluencersContainer"))
const ProductionContainer = lazy(() => import("@/components/media-containers/ProductionContainer"))
```

---

### B5. `useStableHydration` and load gating / waterfall

**`useStableHydration` hook** (per-container; does not gate page-level fetch):

```11:25:hooks/useStableHydration.ts
export function useStableHydration<T>(
  initialLineItems: T[] | undefined | null,
  hydrate: (items: T[]) => void,
  modalOpenRef?: { current: boolean },
): void {
  const lastHydratedRef = useRef<T[] | null>(null)
  const hydrateRef = useRef(hydrate)
  hydrateRef.current = hydrate
  useEffect(() => {
    if (modalOpenRef?.current) return
    if (!initialLineItems || initialLineItems.length === 0) return
    if (lastHydratedRef.current === initialLineItems) return
    lastHydratedRef.current = initialLineItems
    hydrateRef.current(initialLineItems)
  }, [initialLineItems, modalOpenRef])
}
```

**Load phase state machine:**

```1412:1413:app/mediaplans/mba/[mba_number]/edit/page.tsx
type MediaLoadStatus = "idle" | "loading" | "ready" | "error"
type LoadPhase = "bootstrapping" | "loadingLineItems" | "ready" | "error"
```

**Gating — full form blocked until bootstrap completes:**

```8532:8547:app/mediaplans/mba/[mba_number]/edit/page.tsx
  if (loadPhase === "bootstrapping") {
    return (
      <div
        className="w-full min-h-screen"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto w-full max-w-[1920px] px-4 sm:px-5 md:px-6 xl:px-8 2xl:px-10 pt-0 pb-24 space-y-6">
          <MediaPlanEditorHero
            className="mb-2"
            title="Edit Campaign"
            detail={
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                <span>Loading campaign details…</span>
              </div>
            }
          />
          {/* ... skeleton layout ... */}
```

**Bootstrap → line items handoff:**

```3166:3171:app/mediaplans/mba/[mba_number]/edit/page.tsx
        if (!isCancelled) {
          updateLoadStatus("Campaign details", "success")
          setLoadPhase("loadingLineItems")
          setLoading(false)
          setIsLoading(true)
        }
```

**Line-item effect gate:**

```3379:3385:app/mediaplans/mba/[mba_number]/edit/page.tsx
  useEffect(() => {
    if (loadPhase !== "loadingLineItems") {
      return
    }
    if (!mbaNumber || mediaPlan?.version_number == null) {
      return
    }
```

**Billing auto-hydration waits for `loadPhase === "ready"`** (lines ~7643, ~7672) so billing comparison does not run until all parallel line-item fetches finish (or fail).

**Waterfall conclusion:** Yes — the page **blocks the full form on bootstrap** (`loadPhase === "bootstrapping"` early return). After bootstrap, the form shell can render while line items load (`loadingLineItems`); `MediaPlanLoadStatusPill` shows per-channel progress. Line-item containers use `useStableHydration` to hydrate grids when arrays arrive — this is downstream of the fetch waterfall, not an additional fetch gate.

---

## SECTION C — Pacing pages

### C1. Pacing components and API routes

#### Shell and pages

| Route | Component | API on load |
|-------|-----------|-------------|
| `/pacing/overview` | `OverviewClient` | `GET /api/pacing/campaigns` |
| `/pacing/search` | `CampaignsClient` | `GET /api/pacing/campaigns` |
| `/pacing/social` | `SocialCampaignsClient` | `GET /api/pacing/social-campaigns` |
| Campaign dashboard delivery | `DeliveryDataProvider` | `POST /api/pacing/bulk` |

**Overview fetch (refetch every mount):**

```27:46:app/pacing/(shell)/overview/OverviewClient.tsx
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/pacing/campaigns", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as ApiShape;
        if (!cancelled) setData(json);
      })
      // ...
    return () => {
      cancelled = true;
    };
  }, []);
```

#### `GET /api/pacing/campaigns`

```7:38:app/api/pacing/campaigns/route.ts
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const gate = await requirePacingAccess(request);
  // ...
  const rows = await fetchSearchPacingCampaignRows({ asOfDate, allowedClientSlugs });
  return NextResponse.json({ asOfDate, rows });
}
```

| Item | Value |
|------|-------|
| **Data source** | **Xano** (masters, versions, `media_plan_search` line items) + **Snowflake** (search spend/KPI hydration inside `fetchSearchPacingCampaignRows`) |
| **Filters** | Live campaign status; date window vs `asOfDate`; tenant client slug set from auth |
| **Caching** | `dynamic = "force-dynamic"` only; no `revalidate`, no `Cache-Control`, no `unstable_cache` |

#### `GET /api/pacing/social-campaigns`

Same pattern; calls `fetchSocialPacingCampaignRows` (Xano social line items + Snowflake Meta/TikTok facts).

#### `POST /api/pacing/bulk`

```6:12:app/api/pacing/bulk/route.ts
export const dynamic = "force-dynamic"
export const revalidate = 0
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]
export const maxDuration = 60
```

```130:164:app/api/pacing/bulk/route.ts
      const rowsPromise =
        normalizedLineItemIds.length > 0
          ? getCampaignPacingData(
              mbaNumber,
              normalizedLineItemIds,
              { startDate, endDate },
              { requestId, signal: ac.signal }
            )
          : Promise.resolve([])

      const searchPromise = includeSearch
        ? getSearchPacingData({ lineItemIds: searchLineItemIds, startDate, endDate, ... })
        : Promise.resolve(null)

      const results = await Promise.all([rowsPromise, searchPromise])
```

| Item | Value |
|------|-------|
| **Data source** | **Snowflake** (`getCampaignPacingData`, `getSearchPacingData`) |
| **Filters** | `mbaNumber`, normalized `lineItemIds`, optional date range; max 50k rows |
| **Caching** | `force-dynamic`, `revalidate = 0`; 55s internal abort; **no result cache** |
| **Snowflake connection** | `querySnowflake` → `execWithRetry` from `lib/snowflake/pool.ts`; mode `serverless` in production (connect-per-request), `pool` in dev; **no cross-request cache of query results** |

```38:39:lib/snowflake/pool.ts
const MODE: SnowflakeMode = (process.env.SNOWFLAKE_MODE as SnowflakeMode | undefined) ?? (IS_PRODUCTION ? "serverless" : "pool")
```

#### `POST /api/pacing/search`

```6:11:app/api/pacing/search/route.ts
export const dynamic = "force-dynamic"
export const revalidate = 0
export const runtime = "nodejs"
export const preferredRegion = ["syd1"]
export const maxDuration = 60
```

```64:65:app/api/pacing/search/route.ts
    const response = NextResponse.json(data)
    response.headers.set("Cache-Control", "no-store, max-age=0")
```

Snowflake-only search pacing payload via `getSearchPacingData`.

#### Other pacing routes (per-channel)

- `app/api/pacing/programmatic/display/route.ts` — Snowflake; `Cache-Control: no-store`
- `app/api/pacing/programmatic/video/route.ts` — same
- `app/api/pacing/social/meta/route.ts`, `social/tiktok/route.ts` — Snowflake; `Cache-Control: no-store`
- `app/api/pacing/admin/orphans/*` — Xano orphan fixes

**`unstable_cache`:** not used anywhere in the repo.

---

### C2. Refetch vs client state; staleness / TTL

| Data | Storage | Refetch behaviour | TTL |
|------|---------|-------------------|-----|
| Overview / Search / Social campaign lists | React `useState` in page clients | **Refetch on every page mount** (`useEffect` deps `[]`) | None |
| Pacing filter toolbar | **Zustand** (`lib/pacing/usePacingFilterStore.tsx`) | Filters persist in provider for session; **not** pacing metrics | None for metrics |
| Campaign delivery bulk pacing | `DeliveryDataProvider` local state | Refetch when `mbaNumber`, line-item IDs, or date deps change | None |

**Zustand filter store (filters only):**

```48:50:lib/pacing/usePacingFilterStore.tsx
  return createStore<PacingFilterStoreState>((set) => ({
    filters: defaults,
    assignedClientIds: initialAssignedClientIds,
```

**Delivery bulk refetch deps:**

```203:216:components/dashboard/delivery/DeliveryDataProvider.tsx
  }, [
    mbaNumber,
    allIdsKey,
    searchKey,
    campaignStart,
    campaignEnd,
    fromDate,
    toDate,
    allLineItemIds,
    includeSearch,
    normalizedSearchLineItemIds,
    normalizedBulkStart,
    normalizedBulkEnd,
  ])
```

Tab switch between `/pacing/overview`, `/pacing/search`, `/pacing/social` **remounts** each client → **new fetch** each visit. No SWR stale-while-revalidate.

---

### C3. Pacing response shape and grain

#### `POST /api/pacing/bulk` — Snowflake rows (`PacingRow`)

```12:29:lib/snowflake/pacing-service.ts
export type PacingRow = {
  channel: Channel
  dateDay: string
  adsetName: string | null
  entityName: string | null
  campaignId: string | null
  campaignName: string | null
  adsetId: string | null
  entityId: string | null
  lineItemId: string | null
  amountSpent: number
  impressions: number
  clicks: number
  results: number
  video3sViews: number
  maxFivetranSyncedAt: string | null
  updatedAt: string | null
}
```

**Grain:** **Daily** (`dateDay`) per line item / adset — up to `QUERY_ROW_LIMIT = 50000` rows. UI aggregates in containers; bulk endpoint returns daily-grain rows even when UI shows aggregates.

Optional `search` payload (`SearchPacingResponse`):

```33:39:lib/snowflake/search-pacing-service.ts
export type SearchPacingResponse = {
  totals: SearchPacingTotals
  daily: SearchPacingDailyRow[]
  lineItems: SearchPacingLineItemSeries[]
  keywords: any[]
  error?: string
}
```

Includes **`daily`** arrays per line item when search pacing requested.

#### `GET /api/pacing/campaigns` — composed rows

Returns `{ asOfDate, rows: SearchPacingCampaignRow[] }` — one row per live search line item with **pre-aggregated** KPI fields (`spendToDateLineTotal`, `ctr`, etc.) and optional `platformCampaigns` breakdown. Snowflake daily facts are aggregated server-side before JSON serialization; **not** daily-grain in this list response.

---

## SECTION D — Cross-cutting

### D1. API route caching patterns (PowerShell)

```
PS> Select-String -Path "app\api\**\*.ts" -Pattern "revalidate|no-store|force-cache|unstable_cache|Cache-Control" -List

app\api\mediaplans\route.ts:8:export const revalidate = 0
```

Note: `-List` emits **one match per file** (first hit only). A full ripgrep pass shows `dynamic = "force-dynamic"` and/or `revalidate = 0` on most hot paths (`mediaplans/mba`, `pacing/bulk`, `pacing/search`, `media_plans/*`, finance routes). Explicit `Cache-Control: no-store` appears on `api/pacing/search`, `api/pacing/programmatic/*`, `api/pacing/social/*`, and several finance routes. **`unstable_cache`:** zero usages in codebase. **`force-cache`:** zero usages in `app/api`.

---

### D2. Next.js version and middleware

**package.json:**

```76:76:package.json
    "next": "^15.5.14",
```

**Installed (lockfile):** `node_modules/next` → `15.5.20`

**Middleware** (`middleware.ts`) runs on all non-static routes including `/dashboard`, `/mediaplans`, `/pacing`, and `/api/*`:

```17:59:middleware.ts
export async function middleware(request: NextRequest) {
  const authResponse = await auth0.middleware(request);
  // ...
  const isApiRoute = pathname.startsWith('/api');
  // ...
  if (isApiRoute) {
    if (!session) {
      return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
    }
    // client slug checks for client role ...
    return continueResponse;
  }
```

Client users are redirected away from `/mediaplans` and non-tenant `/dashboard` paths; pacing and API routes require session (JSON 401 for API).

---

### D3. Xano timeout / retry wrappers

#### `GET/POST /api/mediaplans` (list + create)

```11:12:app/api/mediaplans/route.ts
const XANO_TIMEOUT_MS = 15_000
const XANO_LONG_TIMEOUT_MS = 30_000
```

Used on axios calls to `media_plan_versions`, `media_plan_master`, `get_mediaplan_topline`.

#### `GET /api/mediaplans/mba/[mba_number]`

```22:23:app/api/mediaplans/mba/[mba_number]/route.ts
const XANO_TIMEOUT_MS = 15_000
const XANO_LONG_TIMEOUT_MS = 30_000
```

#### Dashboard server axios

```11:17:lib/api/dashboard/shared.ts
// Create axios instance with timeout
export const apiClient = axios.create({
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  }
})
```

#### Scopes API retry wrapper

```14:37:app/api/scopes-of-work/route.ts
async function retryApiCall<T>(
  apiCall: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      lastError = error;
      console.error(`API call attempt ${attempt} failed:`, error);
      
      if (attempt < maxRetries) {
        console.log(`Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  throw lastError;
}
```

#### Xano pagination (line items)

```130:145:lib/api/xanoPagination.ts
export async function fetchAllXanoPages(
  baseUrl: string,
  baseParams: Record<string, string | number | boolean | null | undefined> = {},
  label = "xano",
  pageSize = 200,
  maxPages = 50
): Promise<any[]> {
  const result = await fetchAllXanoPagesWithCompleteness(
    baseUrl,
    baseParams,
    label,
    pageSize,
    maxPages
  )
  return result.items
}
```

#### Browser line-item fetch timeout

```1869:1870:lib/api.ts
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
```

Default 30s; edit page uses `LINE_ITEM_TIMEOUT_INITIAL_MS` / `LINE_ITEM_TIMEOUT_AUTO_RETRY_MS` with retry.

**Instrumentation:** `console.log` / `console.info` with `[API]`, `[FETCH]`, `[DATA LOAD]`, `[api/pacing/bulk] timing` prefixes; no centralized latency metrics exporter beyond logs.

---

_End of discovery._
