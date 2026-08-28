# Stage 2d-7-0 — Discovery Report (read-only)

**Branch:** `pacing-search-rebuild`  
**Scope:** Inventory for wiring the pacing surface to the KPI editor (Stage 2d-7). No design proposals.

---

## Pre-flight

| Step | Command | Result |
|------|---------|--------|
| 1 | `git branch --show-current` | `pacing-search-rebuild` |
| 2 | `git log --oneline \| Select-String "90eccce"` | `90eccce refactor(kpi): introduce KpiHost abstraction for KPIEditModal` |
| 3 | `git status --short` | Untracked only: `docs/pacing/*`, `components/charts/ChartExportToolbar.tsx`, `lib/charts/stackedColumnExport.ts`. **No tracked modifications.** |
| 4 | `git grep -l "KpiHost" components/kpis/` | `components/kpis/kpiHost.ts`, `components/kpis/KPIEditModal.tsx`, `components/kpis/KPISection.tsx` |

All pre-flight checks passed.

---

## Section 1 — The 2c KPI drill-down popover

### 1.1 File path

Grep:

```powershell
git grep -l "Edit targets\|kpi.*popover\|KpiDrillDown\|KpiPopover" components/ -- "*.tsx"
```

**Result:** `components/pacing-search/LineItemPacingTable.tsx` (only match).

There is no separate `KpiPopover` or `KpiDrillDown` component file. The popover is implemented inline as `KpiDrilldownButton`, `KpiDrilldownContent`, and `EmptyKpiState` in that file.

### 1.2 Popover component (relevant sections)

**Trigger — icon button next to KPI Status pill:**

```489:493:components/pacing-search/LineItemPacingTable.tsx
        <td className="p-2 border-b">
          <div className="inline-flex items-center gap-1">
            <KpiStatusPill status={computeRowKpiStatus(row)} />
            <KpiDrilldownButton row={row} />
          </div>
```


**KpiDrilldownButton (trigger + popover shell):**

```754:784:components/pacing-search/LineItemPacingTable.tsx
function KpiDrilldownButton({ row }: { row: SearchPacingCampaignRow }) {
  const comparisons = buildKpiComparisons(row);
  const hasTargets = row.kpiTargets !== null;
  const editorHref = `/mediaplans/mba/${encodeURIComponent(row.mbaNumber)}/edit`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="KPI breakdown"
          onClick={(e) => e.stopPropagation()}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-3"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <KpiDrilldownContent
          row={row}
          comparisons={comparisons}
          hasTargets={hasTargets}
          editorHref={editorHref}
        />
      </PopoverContent>
    </Popover>
  );
}
```

**Popover content body:**

```787:822:components/pacing-search/LineItemPacingTable.tsx
function KpiDrilldownContent({
  row,
  comparisons,
  hasTargets,
  editorHref,
}: {
  row: SearchPacingCampaignRow;
  comparisons: KpiComparison[];
  hasTargets: boolean;
  editorHref: string;
}) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs font-medium">{row.lineItemId}</div>
        <div className="text-[10px] text-muted-foreground">{row.campaignName}</div>
      </div>

      {!hasTargets ? (
        <EmptyKpiState editorHref={editorHref} />
      ) : (
        <>
          <KpiComparisonTable comparisons={comparisons} />
          <div className="border-t pt-2">
            <a
              href={editorHref}
              className="text-[11px] text-blue-600 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Edit targets in media plan →
            </a>
          </div>
        </>
      )}
    </div>
  );
}
```

(Correct source uses `<div>` → `<div>` throughout; line numbers match file content with `div`.)

**Empty state inside popover:**

```825:839:components/pacing-search/LineItemPacingTable.tsx
function EmptyKpiState({ editorHref }: { editorHref: string }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        No KPI targets have been set for this line item yet.
      </p>
      <a
        href={editorHref}
        className="inline-block text-[11px] text-blue-600 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        Set targets in media plan →
      </a>
    </div>
  );
}
```

### 1.3 "Edit targets" affordance

| State | Element | Type | Destination |
|-------|---------|------|-------------|
| Has targets | `Edit targets in media plan →` | Raw `<a href={editorHref}>` | `/mediaplans/mba/${row.mbaNumber}/edit` |
| No targets | `Set targets in media plan →` | Raw `<a href={editorHref}>` | Same |

Not a Next.js `<Link>` or `<Button>`. `editorHref` is built at ```757:757:components/pacing-search/LineItemPacingTable.tsx```.

### 1.4 How the popover is triggered

- **Where:** KPI Status column (`<th>KPI Status</th>` at ```259:259:components/pacing-search/LineItemPacingTable.tsx```), line-item row only (platform-campaign and ad-group child rows leave this cell empty at ```622:622:components/pacing-search/LineItemPacingTable.tsx```).
- **Trigger:** `Info` icon button inside `KpiDrilldownButton` (```762:769:components/pacing-search/LineItemPacingTable.tsx```), rendered beside `KpiStatusPill` in an inline flex container (```490:493:components/pacing-search/LineItemPacingTable.tsx```).
- **Visibility:** Popover trigger is always shown (not admin-gated).

### 1.5 Props / data dependencies

`KpiDrilldownButton` receives only `{ row: SearchPacingCampaignRow }`.

Internally it derives:

| Derived | Source |
|---------|--------|
| `comparisons` | `buildKpiComparisons(row)` — uses `row.kpiTargets`, `row.ctr`, `row.clicks`, `row.conversions` |
| `hasTargets` | `row.kpiTargets !== null` |
| `editorHref` | `row.mbaNumber` |

`KpiDrilldownContent` additionally displays `row.lineItemId`, `row.campaignName`. No separate props for MBA version, publisher, or bid strategy in the popover UI.

---

## Section 2 — Pacing row structure

### 2.1 `SearchPacingCampaignRow` type

From `lib/pacing/campaigns/types.ts`:

```60:126:lib/pacing/campaigns/types.ts
export type SearchPacingCampaignRow = {
  // --- Identity ---
  mbaNumber: string;
  mediaPlanVersionId: number; // media_plan_search.media_plan_version (Xano version row id)
  mediaPlanVersionNumber: number; // master.version_number
  lineItemId: string; // e.g. "candel001SE1"
  lineItemNumber: number; // media_plan_search.line_item
  xanoRowId: number; // media_plan_search.id

  // --- Xano scalars (search row + master) ---
  clientName: string; // master.mp_client_name
  campaignName: string; // master.mp_campaignname
  campaignStatus: string; // master.campaign_status (lowercased)
  campaignStartDate: string; // master.campaign_start_date
  campaignEndDate: string; // master.campaign_end_date
  brand: string | null; // versions.brand (if hydrated; may be null)
  platform: string;
  bidStrategy: string;
  buyType: string;
  creativeTargeting: string; // mapped to spreadsheet "Line Item Targeting"
  creative: string;
  buyingDemo: string;
  market: string;
  fixedCostMedia: boolean;
  clientPaysForMedia: boolean;
  budgetIncludesFees: boolean;

  // --- Derived from bursts_json ---
  lineItemStartDate: string | null;
  lineItemEndDate: string | null;
  totalLineItemBudget: number;
  totalBursts: number;
  bursts: NormalisedBurst[];
  currentBurstIndex: number | null;
  currentBurst: NormalisedBurst | null;

  // --- Calculated pacing (Part 2: real values) ---
  lineItemStatus: "on-track" | "ahead" | "behind" | "no-data";
  burstDays: number | null;
  burstDaysRemaining: number | null;
  spendPerDayRemaining: number | null;
  spendRemainingCurrentBurst: number | null;
  spendRemainingLineTotal: number | null;

  // --- Snowflake KPIs (line-item aggregated) ---
  spendToDateLineTotal: number;
  spendToDateCurrentBurst: number;
  spendYesterday: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  cpc: number | null;
  ctr: number | null;
  cpm: number | null;

  // --- KPI targets (Feature 2a) ---
  kpiTargets: KpiTargets | null;

  // --- Three-level breakdown for UI drill-down ---
  platformCampaigns: PlatformCampaignBreakdown[];
};
```

**`KpiTargets` shape:**

```22:31:lib/pacing/campaigns/types.ts
export type KpiTargets = {
  mediaType: string | null;
  publisher: string | null;
  bidStrategy: string | null;
  ctr: number | null;
  cpv: number | null;
  conversionRate: number | null;
  vtr: number | null;
  frequency: number | null;
};
```

**Note:** `SearchPacingCampaignRow` has no top-level `mediaType` field. For Search pacing rows, media type is implicitly `"search"` (page only loads search line items). When joined, `kpiTargets.mediaType` may carry the Xano value.

### 2.2 KPI status pill

Rendered in line-item row KPI Status column:

```729:751:components/pacing-search/LineItemPacingTable.tsx
function KpiStatusPill({ status }: { status: RowKpiStatus }) {
  const copy = copyForRowKpiStatus(status);
  const classes = (() => {
    switch (status) {
      case "kpi-pending":
        return "bg-muted text-muted-foreground";
      case "kpi-no-delivery":
        return "bg-muted text-muted-foreground";
      case "kpi-on-track":
        return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
      case "kpi-mixed":
        return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
      case "kpi-off-target":
        return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
    }
  })();
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${classes}`}
    >
      {copy}
    </span>
  );
}
```

Usage in row JSX:

```489:493:components/pacing-search/LineItemPacingTable.tsx
        <td className="p-2 border-b">
          <div className="inline-flex items-center gap-1">
            <KpiStatusPill status={computeRowKpiStatus(row)} />
            <KpiDrilldownButton row={row} />
          </div>
        </td>
```

(Status computed via `computeRowKpiStatus(row)` from `lib/pacing/kpi/computeKpiStatus.ts`.)

### 2.3 `LineItemPacingTable` structure

**File:** `components/pacing-search/LineItemPacingTable.tsx`  
**Export:** `components/pacing-search/index.ts` re-exports `LineItemPacingTable` and `LineItemPacingTableProps`.

**Props:**

```169:169:components/pacing-search/LineItemPacingTable.tsx
export type LineItemPacingTableProps = { rows: SearchPacingCampaignRow[] };
```

**Row rendering:**

- Maps `rows` to `FragmentForLineItem` (```396:407:components/pacing-search/LineItemPacingTable.tsx```).
- Each line-item row: sticky identity columns + KPI Status (pill + Info popover) + metrics + **Actions** column with `Edit` / `View` `<Link>` buttons (```532:557:components/pacing-search/LineItemPacingTable.tsx```).
- Expandable platform-campaign and ad-group child rows; KPI Status and Actions cells are empty on child rows.

**Internal state:** Only expand/collapse sets (`expandedLineItems`, `expandedCampaigns`) and sticky column offset measurement. **No row data mutation.**

**Consumers:**

- `app/pacing/(shell)/search/CampaignsClient.tsx` — all rows
- `app/pacing/(shell)/overview/OverviewClient.tsx` — filtered `behindRows` subset

### 2.4 State for refresh

**Data flow:**

1. **Server:** `GET /api/pacing/campaigns` → `fetchSearchPacingCampaignRows()` (joins `kpiTargets` at read time).
2. **Client pages:** `CampaignsClient` and `OverviewClient` each hold `useState<ApiShape | null>` with `{ asOfDate, rows }`.
3. **Fetch:** One-shot `useEffect` on mount — ```14:33:app/pacing/(shell)/search/CampaignsClient.tsx``` (Overview identical pattern at ```23:42:app/pacing/(shell)/overview/OverviewClient.tsx```).
4. **Table:** `LineItemPacingTable rows={data.rows}` — read-only props.

**Re-render after `kpiTargets` change:** Nothing in the current stack updates a single row in place. A host `onSave` must either:

- Call `setData` in the page client with an updated `rows` array (optimistic/partial update), or
- Re-fetch `/api/pacing/campaigns` and replace `data`.

`LineItemPacingTable` has no `onRowsChange` callback today; any refresh wiring must be added at the page level, if the modal lives in the table, via a new callback prop from the page.

---

## Section 3 — Single-line-item resolve path

### 3.1 `resolveAllKPIs` signature

```185:215:lib/kpi/resolve.ts
export function resolveAllKPIs(opts: {
  mediaItemsByType: Record<string, any[]>
  clientName: string
  mbaNumber: string
  versionNumber: number
  campaignName: string
  publisherKPIs: PublisherKPI[]
  clientKPIs: ClientKPI[]
  savedCampaignKPIs: CampaignKPI[]
  publishers?: Publisher[]
}): ResolvedKPIRow[] {
  const out: ResolvedKPIRow[] = []
  for (const [mediaType, items] of Object.entries(opts.mediaItemsByType)) {
    if (!items?.length) continue
    out.push(
      ...resolveKPIsForMediaType({
        lineItems: items,
        mediaType,
        clientName: opts.clientName,
        mbaNumber: opts.mbaNumber,
        versionNumber: opts.versionNumber,
        campaignName: opts.campaignName,
        publisherKPIs: opts.publisherKPIs,
        clientKPIs: opts.clientKPIs,
        savedCampaignKPIs: opts.savedCampaignKPIs,
        publishers: opts.publishers,
      }),
    )
  }
  return out
}
```

Per-media-type resolution loop (inside `resolveKPIsForMediaType`):

```85:182:lib/kpi/resolve.ts
export function resolveKPIsForMediaType(opts: ResolveKPIOptions): ResolvedKPIRow[] {
  const { mediaType, clientName, mbaNumber, versionNumber, campaignName } = opts
  const idToNormName = buildPublisherIdToNormNameMap(opts.publishers ?? [])
  const grouped = groupLineItemsForKPI(opts.lineItems, {
    mbaNumber,
    mediaType,
  })

  return grouped.map((item) => {
    const { publisher, bidStrategy, label } = extractKPIKeys(item, mediaType)
    // ... saved / client / publisher tier merge ...
    const row: ResolvedKPIRow = {
      mp_client_name: clientName,
      mba_number: mbaNumber,
      version_number: versionNumber,
      campaign_name: campaignName,
      media_type: mediaType,
      publisher,
      bid_strategy: bidStrategy,
      // metrics ...
      lineItemId,
      lineItemLabel: label,
      spend,
      deliverables,
      buyType,
      source,
      isManuallyEdited: false,
      // calculated* ...
    }
    return recalcRow(row)
  })
}
```

### 3.2 Single-line-item invocation

**Yes — structurally valid.** Passing e.g. `{ search: [singleSyntheticLineItem] }` with one element causes `groupLineItemsForKPI` to return one grouped item and `resolveKPIsForMediaType` to emit **one** `ResolvedKPIRow`.

**Caveats for pacing rows:**

- Line items must expose fields `groupLineItemsForKPI` / `extractKPIKeys` expect: `line_item_id`/`lineItemId`, `platform`, `bidStrategy`/`bid_strategy`, `buyType`/`buy_type`, spend (`grossMedia`/`totalMedia`), `deliverables`/`calculatedValue`.
- `SearchPacingCampaignRow` has `platform`, `bidStrategy`, `buyType`, `lineItemId`, `totalLineItemBudget` but **no `deliverables`**. CPV derivation in resolver uses `deliverables` (```154:154:lib/kpi/resolve.ts```); for Search CPV is typically unused.
- Synthetic item can be built from pacing row fields; media type for Search pacing is `"search"`.

### 3.3 Publisher / client KPI dependencies

**Existing pages load full tier tables:**

```1876:1884:app/mediaplans/mba/[mba_number]/edit/page.tsx
  useEffect(() => {
    getPublisherKPIs()
      .then((data) => {
        setPublisherKPIs(data)
        setKpiTrigger((t) => t + 1)
      })
```

```2024:2024:app/mediaplans/mba/[mba_number]/edit/page.tsx
    getClientKPIs(kpiClientNameWatch)
```

Client wrappers:

```20:35:lib/api/kpi.ts
export async function getPublisherKPIs(): Promise<PublisherKPI[]> {
  const response = await fetch("/api/kpis/publisher", {
```

```28:35:lib/api/kpi.ts
export async function getClientKPIs(clientName: string): Promise<ClientKPI[]> {
  const params = new URLSearchParams()
  params.set("mp_client_name", clientName)
```

**Scoping:** Resolver uses `.find()` on full `publisherKPIs` / `clientKPIs` arrays keyed by `(media_type, publisher, bid_strategy)` (```113:129:lib/kpi/resolve.ts```). There is **no** API to fetch a single `(media_type, publisher, bid_strategy)` slice. Runtime cost of `resolveAllKPIs` with one line item is dominated by **two HTTP fetches** (publisher + client), not the in-memory loop.

**Publishers list:** Media-plan editor also loads billing publishers for id→name mapping (`buildPublisherIdToNormNameMap`). Pacing row uses display-name `platform`; publisher-tier match may still need the map if Xano stores publisher ids.

**Saved tier:** Can be supplied from `row.kpiTargets` (already on row when joined) or `getCampaignKPIs(mba, version)` filtered to one `line_item_id`.

### 3.4 Cost of existing resolver with one line item

| Cost | Assessment |
|------|------------|
| `resolveAllKPIs` CPU loop | Cheap — one grouped item, linear `.find()` over tier arrays |
| `getPublisherKPIs()` | Full table fetch — **heavy** (same as media-plan mount) |
| `getClientKPIs(clientName)` | Full client table — **moderate** |
| `getCampaignKPIs(mba, version)` | Per MBA/version — **moderate**; pacing already bulk-loads KPIs server-side |
| Optional publishers fetch | Additional round trip if publisher id mapping needed |

**Conclusion:** Reusing `resolveAllKPIs` with a one-element map is **feasible and correct** but **not cheap** due to tier fetches. Building `ResolvedKPIRow` directly from `SearchPacingCampaignRow` + `kpiTargets` avoids fetches when saved targets exist; empty-state create still needs publisher/client defaults unless the modal opens with blank fields only.

### 3.5 Row knows vs must fetch

| Available on `SearchPacingCampaignRow` | Not on row (resolver inputs) |
|----------------------------------------|------------------------------|
| `mbaNumber`, `mediaPlanVersionNumber`, `lineItemId` | `publisherKPIs[]` |
| `clientName`, `campaignName` | `clientKPIs[]` |
| `platform`, `bidStrategy`, `buyType` | `savedCampaignKPIs[]` (except via `kpiTargets` partial view) |
| `kpiTargets` (when joined) | `publishers[]` (billing publisher list for id mapping) |
| Actuals: `ctr`, `clicks`, `conversions`, spend fields | Full `CampaignKPI` with Xano `id` |
| `totalLineItemBudget` (spend proxy) | `deliverables` |

**`kpiTargets` vs `CampaignKPI`:** Join maps `conversion_rate` → `conversionRate` (```352:361:lib/pacing/campaigns/fetchSearchPacingCampaignRows.ts```). Reverse mapping needed on sync response refresh.

---

## Section 4 — Admin gating

### 4.1 Canonical admin check

**Server:**

```68:73:lib/requireRole.ts
export async function requireAdmin(
  req: NextRequest,
  options: RequireRoleOptions = {}
): Promise<RequireRoleSuccess | RequireRoleFailure> {
  return requireRole(req, 'admin', options)
}
```

**Client:**

```20:20:contexts/AuthContext.tsx
  isAdmin: boolean;
```

```51:51:contexts/AuthContext.tsx
    isAdmin: userRoles.includes("admin"),
```

### 4.2 Pacing shell admin check

```17:22:app/pacing/(shell)/layout.tsx
  const roles = getUserRoles(user)
  const isAdmin = roles.includes("admin")

  return (
    <PacingFilterProvider initialAssignedClientIds={assignedStr}>
      <PacingShell isAdmin={isAdmin}>{children}</PacingShell>
```

`PacingShell` uses `isAdmin` only to expose Admin nav tab (```20:24:components/pacing/PacingShell.tsx```). **`isAdmin` is not passed to page children or `LineItemPacingTable`.**

### 4.3 Existing UI conditional pattern

Examples elsewhere:

```148:148:components/dashboard/HeroBanner.tsx
        {isAdmin && (
```

Pacing-specific: nav injection in `PacingShell` (```24:24:components/pacing/PacingShell.tsx```).

For KPI edit in pacing, **`useAuthContext().isAdmin`** is the available client pattern (AuthContext wraps the app). No existing pacing KPI UI uses it yet.

### 4.4 Server-side gate on sync endpoint

**`POST /api/kpis/campaign/sync` — no admin check today:**

```7:17:app/api/kpis/campaign/sync/route.ts
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = campaignKpiSyncBodySchema.safeParse(body)
    if (!parsed.success) {
      // ...
    }
    const results = await syncCampaignKpis(parsed.data)
    return NextResponse.json(results, { status: 200 })
```

Grep `requireAdmin` under `app/api/kpis/`: **no matches**.

Compare pacing read API — uses `requirePacingAccess`, not admin (```19:21:app/api/pacing/campaigns/route.ts```).

**Implication:** Any authenticated caller can sync campaign KPIs via this route today. Adding `requireAdmin` globally would also gate media-plan saves that call the same endpoint.

---

## Section 5 — `syncCampaignKPIs` integration for single-row save

### 5.1 Client wrapper

```62:69:lib/api/kpi.ts
export async function syncCampaignKPIs(kpis: CampaignKPI[]): Promise<CampaignKPI[]> {
  const response = await fetch("/api/kpis/campaign/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(kpis),
  })
  const data = await jsonOrThrow<CampaignKPI[]>(response)
  return Array.isArray(data) ? data : []
}
```

### 5.2 Server helper

```68:129:lib/kpi/campaignKpi.ts
export async function syncCampaignKpis(
  inputs: CampaignKpiInput[],
): Promise<CampaignKPI[]> {
  if (inputs.length === 0) return []

  const existingByKey = new Map<string, CampaignKPI>()
  const fetchedPairs = new Set<string>()

  const out: CampaignKPI[] = []

  for (let i = 0; i < inputs.length; i++) {
    const item = inputs[i]!
    const lineItemId = String(item.line_item_id ?? "").trim()
    // ... skip empty line_item_id ...
    const pairKey = `${item.mba_number}|${item.version_number}`
    if (!fetchedPairs.has(pairKey)) {
      const existing = await fetchCampaignKpis(item.mba_number, item.version_number)
      // ... populate existingByKey ...
      fetchedPairs.add(pairKey)
    }
    const naturalKey = `${item.mba_number}|${item.version_number}|${lineItemId.toLowerCase()}`
    const existing = existingByKey.get(naturalKey)
  try {
      if (existing && typeof existing.id === "number") {
        const patched = await updateCampaignKpi(existing.id, item)
        out.push(patched)
      } else {
        const response = await apiClient.post(url, item)
        const created = (response.data ?? null) as CampaignKPI | null
        out.push(created)
      }
    } catch (e) {
      throw new Error(`syncCampaignKpis: row ${i} (line_item_id=${lineItemId}) failed: ${msg}`)
    }
  }
  return out
}
```

### 5.3 Single-row behaviour

**Yes — handles `inputs.length === 1` gracefully.** Same loop body; one fetch of existing rows for the MBA|version pair (if not cached), then PATCH or POST, returns one-element `out`.

Empty array input returns `[]` immediately (```71:71:lib/kpi/campaignKpi.ts```).

### 5.4 Response shape

Wrapper returns **`CampaignKPI[]`**. For one input → **one-element array** (or throws on failure).

Route returns that array as JSON 200 (```17:17:app/api/kpis/campaign/sync/route.ts```).

### 5.5 Field names vs `KpiTargets`

**`CampaignKPI` (sync payload/response):**

```32:49:lib/kpi/types.ts
export interface CampaignKPI {
  id?: number
  mp_client_name: string
  mba_number: string
  version_number: number
  campaign_name: string
  media_type: string
  publisher: string
  bid_strategy: string
  line_item_id?: string
  ctr: number | null
  cpv: number | null
  conversion_rate: number | null
  vtr: number | null
  frequency: number | null
}
```

**Mapping to pacing `KpiTargets`:**

| `CampaignKPI` | `KpiTargets` |
|---------------|--------------|
| `media_type` | `mediaType` |
| `publisher` | `publisher` |
| `bid_strategy` | `bidStrategy` |
| `ctr` | `ctr` |
| `cpv` | `cpv` |
| `conversion_rate` | `conversionRate` |
| `vtr` | `vtr` |
| `frequency` | `frequency` |

Existing join logic in `fetchSearchPacingCampaignRows` is the reference (```352:361:lib/pacing/campaigns/fetchSearchPacingCampaignRows.ts```). Host refresh should mirror that mapping.

**Second save without retaining `id`:** Sync re-fetches existing rows by natural key `(mba_number, version_number, line_item_id)` and PATCHes when match found (```102:112:lib/kpi/campaignKpi.ts```). Per Q8 lock-in, client need not persist returned `id`.

---

## Section 6 — `kpiTargets` refresh after sync

### 6.1 `KpiTargets` type

Quoted in Section 2.1 (`lib/pacing/campaigns/types.ts:22-31`).

**Comment discrepancy:** Type comment says ctr as "percentage points (4.5 = 4.5%)" (```15:17:lib/pacing/campaigns/types.ts```) but `computeKpiStatus.ts` documents decimal ratios (```66:67:lib/pacing/kpi/computeKpiStatus.ts```). Runtime comparisons treat values as decimals (consistent with `campaign_kpi` elsewhere).

### 6.2 Read-time population

```334:367:lib/pacing/campaigns/fetchSearchPacingCampaignRows.ts
  // --- KPI targets (Feature 2a) ---
  const mbaVersionPairs = rows.map((r) => ({
    mbaNumber: r.mbaNumber,
    versionNumber: r.mediaPlanVersionNumber,
  }));
  const campaignKpiRows = await fetchCampaignKpisForMbas({ mbaVersionPairs });

  const kpiTargetsByKey = new Map<string, KpiTargets>();

  function makeKpiKey(mba: string, version: number, lineItemId: string): string {
    return `${mba}|${version}|${lineItemId.toLowerCase().trim()}`;
  }

  for (const ck of campaignKpiRows) {
    const key = makeKpiKey(ck.mba_number, ck.version_number, ck.line_item_id);
    kpiTargetsByKey.set(key, {
      mediaType: ck.media_type ?? null,
      publisher: ck.publisher ?? null,
      bidStrategy: ck.bid_strategy ?? null,
      ctr: ck.ctr,
      cpv: ck.cpv,
      conversionRate: ck.conversion_rate,
      vtr: ck.vtr,
      frequency: ck.frequency,
    });
  }

  for (const row of rows) {
    const key = makeKpiKey(row.mbaNumber, row.mediaPlanVersionNumber, row.lineItemId);
    row.kpiTargets = kpiTargetsByKey.get(key) ?? null;
  }
```

### 6.3 State-mutation point for host

| Layer | Holds rows | Mutation today |
|-------|------------|----------------|
| `CampaignsClient` | `data.rows` via `setData` | Mount fetch only |
| `OverviewClient` | `data.rows` via `setData` | Mount fetch only |
| `LineItemPacingTable` | Props `rows` | None |

Host `onSave` must update **`CampaignsClient` / `OverviewClient` state** (or trigger re-fetch). If modal lives inside `LineItemPacingTable`, table needs e.g. `onRowKpiTargetsUpdated(lineItemId, kpiTargets)` callback supplied by pages.

### 6.4 Two refresh options (inventory only)

| Option | Current fit |
|--------|-------------|
| **(a) Optimistic / in-place update** | Simpler for UX: map sync response → `KpiTargets`, `setData(prev => ({ ...prev, rows: prev.rows.map(...) }))`. No new API route. Overview's filtered subset still updates if same row object key or lineItemId match. |
| **(b) Re-fetch** | Reuses `fetchSearchPacingCampaignRows` join logic verbatim; heavier (Snowflake hydration + full table). Existing clients have no refetch helper — would duplicate fetch `useEffect` body. |

Given one-shot mount fetch and no cache layer, **(a) is simpler** for current data flow; **(b) is more consistent** with server join but costlier.

---

## Section 7 — Empty-state "Create targets" flow

### 7.1 What "empty state" means today

**Popover when `kpiTargets === null`:** Shows message + link to media plan (```805:806:components/pacing-search/LineItemPacingTable.tsx```, ```825:838:components/pacing-search/LineItemPacingTable.tsx```). No modal. Pill shows **"KPI Pending"** (`computeRowKpiStatus` rule 1 at ```120:120:lib/pacing/kpi/computeKpiStatus.ts```).

**KPIEditModal when `host.rows` is empty:** Center message only — no button (```206:211:components/kpis/KPIEditModal.tsx```):

```206:211:components/kpis/KPIEditModal.tsx
            {editedRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16">
                <p className="text-sm text-muted-foreground">
                  No KPI rows yet. Add line items to your media plan to generate KPIs.
                </p>
              </div>
```

**Interpretations (a/b/c from spec) — current codebase matches none of the locked 2d-7 flows; closest is (c) variant where popover empty state is inline link, not modal.**

### 7.2 First save semantics

- No `campaign_kpi` row → `syncCampaignKpis` POST (```114:120:lib/kpi/campaignKpi.ts```).
- Response includes new row with `id`.
- Second save: server fetches existing, matches `line_item_id`, PATCH (```106:112:lib/kpi/campaignKpi.ts```) — **works without client retaining `id`**.

Required sync payload fields (`campaignKpiItemSchema`): `mp_client_name`, `mba_number`, `version_number`, `campaign_name`, `media_type`, `publisher`, `bid_strategy`, `line_item_id` (```373:381:lib/kpi/types.ts```).

### 7.3 Identity fields at first save

| Field | On `SearchPacingCampaignRow`? | Source |
|-------|----------------------------------|--------|
| `mba_number` | Yes | `row.mbaNumber` |
| `version_number` | Yes | `row.mediaPlanVersionNumber` |
| `line_item_id` | Yes | `row.lineItemId` |
| `mp_client_name` | Yes | `row.clientName` |
| `campaign_name` | Yes | `row.campaignName` |
| `media_type` | **No top-level field** | Infer `"search"` for this surface, or `row.kpiTargets?.mediaType ?? "search"` |
| `publisher` | **Partial** | `row.platform` (resolver uses platform as publisher for search) |
| `bid_strategy` | Yes | `row.bidStrategy` |

**Gap:** `media_type` is not a scalar on the row; pacing Search surface can hardcode `"search"`. `publisher` maps from `platform`, not a dedicated `publisher` field.

---

## Section 8 — Refactor risk

### 8.1 Touching the 2c popover

**Smallest change:** In `KpiDrilldownContent` / `EmptyKpiState`, replace `<a href={editorHref}>` with admin-gated `<Button onClick={openModal}>` (or keep popover read-only for non-admin). Popover structure (`Popover`, `Info` trigger, comparison table) can remain.

**Risk:** Medium — popover is smoke-passed; regression on `e.stopPropagation()` vs row expand click, comparison table rendering.

### 8.2 Adding to pacing row

KPI Status column already hosts pill + Info button (```490:493:components/pacing-search/LineItemPacingTable.tsx```). A separate "Create targets" control could share that cell without new column. New column would widen sticky layout (8 sticky columns already).

### 8.3 Shared table — bi-surface

Both `/pacing/search` and `/pacing/overview` use `LineItemPacingTable`. Any popover/modal change affects both.

### 8.4 New endpoint risk

Adding `requireAdmin` to `/api/kpis/campaign/sync` breaks media-plan campaign save path (`saveCampaignKpisFromRows` → same endpoint). Alternatives: pacing-specific sync route with admin gate, or role check conditioned on a header/source flag.

---

## Section 9 — Test coverage

```powershell
grep -rn "pacing.*kpi\|KpiPopover\|kpi.*modal" lib/ components/ app/ --include="*.test.ts" --include="*.test.tsx"
```

**Result:** No matches.

Related but not pacing-KPI UI:

- `lib/pacing/campaigns/__tests__/aggregate.test.ts` — pacing aggregation only
- `lib/kpi/__tests__/` — resolver, fanOut, sync unit tests (not wired to pacing table)

**Conclusion:** No existing tests touch the pacing KPI popover or pacing KPI modal surface.

---

## Section 10 — Open questions for Luke

1. **Empty-state flow design (Section 7):** Pick (a) modal with empty form / button becomes Save, (b) modal shows "Create targets" then reveals form, or (c) inline in popover before modal.

2. **`kpiTargets` refresh (Section 6.4):** Optimistic row update vs full re-fetch of `/api/pacing/campaigns`.

3. **"Create targets" placement:** Inside existing popover (replace empty-state link) vs separate control in KPI Status column when `kpiTargets === null`.

4. **Resolver vs direct build:** Invoke `resolveAllKPIs` with synthetic one-item map (+ tier fetches) for empty-state defaults, or build `ResolvedKPIRow` directly from `SearchPacingCampaignRow` + `kpiTargets` and skip resolver when saved data exists.

5. **Server-side admin gating:** Add `requireAdmin` to shared sync route (breaks media-plan), new pacing-only endpoint, or client-only gate.

6. **`media_type` / `publisher` on save:** Confirm `"search"` + `row.platform` as publisher for sync payload on Search pacing surface.

7. **Domain 5 follow-up (factual):** `[PACING_VERSIONS_CAMPAIGNS]` warning path in `fetchSearchPacingCampaignRows.ts:185` — unrelated to 2d-7 scope.

---

## Executive summary

Stage 2c KPI UI lives entirely inside `LineItemPacingTable.tsx` as an inline `Popover` (`KpiDrilldownButton`) beside `KpiStatusPill`. "Edit targets" and empty-state links are raw `<a>` tags to `/mediaplans/mba/[mba]/edit` — not modal triggers. Row data flows server → `CampaignsClient`/`OverviewClient` `useState` → table props with no per-row mutation hook. `KpiHost` / `KPIEditModal` exist from 2d-6 but are not wired to pacing yet. **`resolveAllKPIs({ search: [oneItem] })` is feasible** and yields one `ResolvedKPIRow`, but tier loads (`getPublisherKPIs`, `getClientKPIs`) are the main cost. **`SearchPacingCampaignRow` has all save identity fields except explicit `media_type`** (infer `"search"`) and uses `platform` for publisher. **`syncCampaignKPIs([oneRow])` works**; response maps to `KpiTargets` via snake_case→camelCase. Sync route has **no admin check**. Estimated **5–8 files** for 2d-7 build.

---

## Load-bearing answers

| Question | Answer |
|----------|--------|
| Single-line-item resolver feasible? | **Yes** — one-element `mediaItemsByType` works; tier fetches are the expense, not the loop. |
| `SearchPacingCampaignRow` has all identity fields for save? | **Mostly yes** — need inferred `media_type: "search"` and `publisher` from `platform`. |
| Estimated file count for 2d-7 | **5–8 files** (table, kpiHost factory, page clients, optional API route, mapping helper) |

---

## Appendix — Grep inventory

```text
git grep -l "Edit targets|KpiDrilldown" components/
  → components/pacing-search/LineItemPacingTable.tsx

git grep -l "KpiHost" components/kpis/
  → kpiHost.ts, KPIEditModal.tsx, KPISection.tsx

grep pacing.*kpi in *.test.ts(x)
  → (no matches)
```
