# KPI Targets Discovery — Delivery Containers vs `campaign_kpi`

Read-only discovery (2026-07-08). Goal: map how Delivery KPIs are rendered and fed in search/social delivery, and how Xano `campaign_kpi` is (or is not) consumed, to inform an "actual vs target" design.

---

## 1. Components rendering the "Delivery KPIs" card row

### Shared presentation layer (search and social both use this)

| File | Role |
|------|------|
| `components/dashboard/delivery/shared/KpiBand.tsx` | Card row wrapper; optional title/subtitle; grid of tiles |
| `components/dashboard/delivery/shared/KpiTile.tsx` | Single metric tile (`value`, optional `expected`, `status`, `progress`) |
| `components/dashboard/delivery/shared/LineItemBlock.tsx` | Per–line-item block; embeds `KpiBand` |
| `components/dashboard/delivery/ChannelSection.tsx` | Channel accordion; renders aggregate `KpiBand` + nested `LineItemBlock` accordions |
| `components/dashboard/delivery/DeliveryContainer.tsx` | Maps `ChannelSectionData[]` → `ChannelSection` |

**Search and social share `KpiBand` / `KpiTile` but use divergent adapter logic** (different files, different metric sets).

There is **no** `SearchDeliveryContainer.tsx` or `SocialDeliveryContainer.tsx` in the repo today. Delivery UI was refactored into channel adapters + `DeliveryContainer`. Pure compute helpers live in `lib/delivery/search/searchCore.ts` and `lib/delivery/social/socialChannelCompute.ts` (extracted from the old containers per `scripts/build-social-channel-compute.mjs`).

### Search-specific adapter

**File:** `components/dashboard/delivery/channels/searchAdapter.ts`

- `buildSearchSection()` builds `aggregate.kpiBand` and per–line-item `kpiBand` inside `buildSearchLineItemBlocks()`.
- Wired from `components/dashboard/delivery/CampaignDeliverySection.tsx` when `includeSearch` is true.

**Important:** Search Delivery KPIs are **not** the CPM / CTR / CPC / CVR / CPA set. Aggregate and line-item bands use:

| Tile label | Aggregate | Per line item |
|------------|-----------|---------------|
| CPC | ✓ | ✓ |
| Conversions | ✓ | ✓ |
| Top Impression Share | ✓ (hard-coded 50% expected) | ✓ |
| Impressions | ✓ | ✓ |

Subtitle: `"CPC, conversions, impression share & volume"`.

```208:241:components/dashboard/delivery/channels/searchAdapter.ts
  const kpiTiles: KpiTileProps[] = [
    {
      label: "CPC",
      value: formatCurrency2dp(totalDerived.actualCpc ?? 0),
      expected: totalDerived.expectedCpc !== null ? formatCurrency2dp(totalDerived.expectedCpc) : undefined,
      status: compareCpcStatus(totalDerived.actualCpc ?? 0, totalDerived.expectedCpc ?? undefined),
      // ...
    },
    {
      label: "Conversions",
      // expected from burst schedule × observed CVR
    },
    {
      label: "Top Impression Share",
      expected: "50.00%",
      // hard-coded TOP_SHARE_TARGET = 0.5
    },
    {
      label: "Impressions",
      // expected from burst clicks / observed CTR
    },
  ]
```

### Social-specific adapter (Meta + TikTok)

**Files:**

- `components/dashboard/delivery/channels/socialAdapterShared.ts` — `buildSocialChannelSectionForPlatform()`, `buildAggregateKpiTiles()`
- `components/dashboard/delivery/channels/socialMetaAdapter.ts` — thin wrapper (`key: "meta"`)
- `components/dashboard/delivery/channels/socialTiktokAdapter.ts` — thin wrapper (`key: "tiktok"`)

Social **does** render CPM / CTR / CPC / CVR / CPA (plus optional video tiles):

```70:129:components/dashboard/delivery/channels/socialAdapterShared.ts
function buildAggregateKpiTiles(
  kpis: ReturnType<typeof summarizeActuals>,
  kpiTargets: KPITargetsMap | undefined,
  publisher: string,
  bidStrategy: string,
  accentColour: string,
  includeVideoMetrics: boolean,
): KpiTileProps[] {
  const tgt = resolveKpiTarget(kpiTargets, publisher, bidStrategy)
  // CPM — value only (no expected)
  // CTR — expected/status/progress from tgt.ctr when > 0
  // CPC — value only
  // CVR — expected from tgt.conversion_rate when > 0
  // CPA — value only
  // optional: View rate (tgt.vtr), CPV
}
```

Aggregate band title: `"Delivery KPIs"`, subtitle: `"Impressions, clicks, conversions & views"`.

### Entry point on campaign dashboard

`app/dashboard/[slug]/[mba_number]/components/CampaignPageAssembly.tsx` loads `campaign_kpi` rows, builds `kpiTargets`, and passes them into `CampaignDeliverySection`.

---

## 2. Data source for each displayed metric

### Fetch path (common to search + social delivery)

```
CampaignPageAssembly
  → CampaignDeliverySection
    → DeliveryDataProvider (client)
      → POST /api/pacing/bulk
        → getCampaignPacingData()     [Snowflake — social/programmatic]
        → getSearchPacingData()       [Snowflake — search, when includeSearch]
```

**Route file:** `app/api/pacing/bulk/route.ts`

| Channel | Snowflake helper | Table / notes |
|---------|------------------|---------------|
| Social (Meta/TikTok), programmatic | `lib/snowflake/pacing-service.ts` → `getCampaignPacingData()` | `SOCIAL_PACING_TABLE` (via `lib/pacing/social-channels`) |
| Search | `lib/snowflake/search-pacing-service.ts` → `getSearchPacingData()` | `ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT` |

`campaign_kpi` is **not** fetched inside `/api/pacing/bulk`. Targets are loaded separately (section 3) and passed as `kpiTargets` prop.

### Social metrics (CPM, CTR, CPC, CVR, CPA)

**Actuals:** client-side from Snowflake rows returned by `/api/pacing/bulk`, aggregated in `lib/delivery/social/socialChannelCompute.ts` → `summarizeActuals()`:

```754:786:lib/delivery/social/socialChannelCompute.ts
export function summarizeActuals(rows: ...): ActualKpis {
  // sums spend, impressions, clicks, results, video_3s_views
  const cpm = totals.impressions ? (totals.spend / totals.impressions) * 1000 : 0
  const ctr = totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0   // percentage points
  const cvr = totals.impressions ? (totals.results / totals.impressions) * 100 : 0 // results/impressions %
  const cpc = totals.clicks ? totals.spend / totals.clicks : 0
  const cost_per_result = totals.results ? totals.spend / totals.results : 0       // labeled "CPA"
  // ...
}
```

| Metric | Source | Computation location | Target source today |
|--------|--------|--------------------|---------------------|
| CPM | Snowflake → client | `summarizeActuals` | **None** in delivery UI |
| CTR | Snowflake → client | `summarizeActuals` | `campaign_kpi.ctr` via `KPITargetsMap` (CTR tile only) |
| CPC | Snowflake → client | `summarizeActuals` | **None** |
| CVR | Snowflake → client | `summarizeActuals` (results/impressions) | `campaign_kpi.conversion_rate` (CVR tile) |
| CPA | Snowflake → client | `summarizeActuals` (`cost_per_result`) | **None** |
| View rate / CPV | Snowflake video fields | `summarizeActuals` | `campaign_kpi.vtr` on View rate tile (video buys only) |

Target lookup key: `kpiTargetKey("socialmedia", publisher, bid_strategy)` → `lib/kpi/deliveryTargets.ts`.

### Search metrics (different set)

**Actuals:** `SearchPacingResponse` from `/api/pacing/bulk` → `searchAdapter.ts` + `lib/delivery/search/searchCore.ts`.

| Metric | Source | Computation | "Expected" in UI |
|--------|--------|-------------|------------------|
| CPC (actual) | Snowflake totals | `safeDiv(totals.cost, totals.clicks)` | Burst schedule: `safeDiv(spendExpected, clicksExpected)` — **not** `campaign_kpi` |
| Conversions | Snowflake | `totals.conversions` | `clicksExpected × observed CVR` |
| Top Impression Share | Snowflake | `totals.topImpressionPct` | Hard-coded **50%** |
| Impressions | Snowflake | `totals.impressions` | `clicksExpected / observed CTR` |

`kpiTargets` is passed into `buildSearchSection` but is **only** used for the cumulative target curve (`buildSearchAggregateTargetCurve` in `searchCore.ts`), **not** for Delivery KPI tiles.

```446:446:lib/delivery/search/searchCore.ts
  if (!kpiTargets || kpiTargets.size === 0) return []
```

(Search pacing grid uses a **different** join — section 5 — keyed by `line_item_id`.)

---

## 3. `campaign_kpi` / `/api/kpis/campaign` surface and consumers

### Xano endpoint

All server reads/writes use:

```
{XANO_CLIENTS_BASE_URL}/campaign_kpi
{XANO_CLIENTS_BASE_URL}/campaign_kpi/{id}   (PATCH, DELETE)
```

Constructed via `xanoUrl("campaign_kpi", "XANO_CLIENTS_BASE_URL")` in:

- `lib/kpi/campaignKpi.ts` — browser-facing CRUD + sync
- `lib/xano/campaignKpi.ts` — server bulk fetch for pacing grids (`fetchCampaignKpisForMbas`)

### Next.js routes

| Route | Methods | Handler / lib |
|-------|---------|---------------|
| `app/api/kpis/campaign/route.ts` | GET, POST, PATCH, DELETE | `fetchCampaignKpis`, `createCampaignKpis`, `updateCampaignKpi`, `deleteCampaignKpi` |
| `app/api/kpis/campaign/sync/route.ts` | POST | `syncCampaignKpis` (PATCH-or-POST by natural key) |

**GET query params (Next.js):** `mbaNumber`, `versionNumber` (required).

**Xano GET params sent server-side:**

```15:19:lib/kpi/campaignKpi.ts
    const response = await apiClient.get(xanoUrl("campaign_kpi", "XANO_CLIENTS_BASE_URL"), {
      params: {
        mba_number: mbaNumber,
        version_number: versionNumber,
      },
```

Client-side filter also re-applies MBA + version match on the returned list (`lib/kpi/campaignKpi.ts:26-30`).

### Response shape

Typed as `CampaignKPI[]` (`lib/kpi/types.ts`):

```32:49:lib/kpi/types.ts
export interface CampaignKPI {
  id?: number
  created_at?: number
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

Server pacing fetch uses the same columns in `lib/xano/campaignKpi.ts` (`CampaignKpiRow`).

GET `/api/kpis/campaign` returns this array as JSON (`app/api/kpis/campaign/route.ts:34-35`). On Xano failure, `fetchCampaignKpis` returns `[]` (errors logged, not thrown).

### `buildKPITargetsMap` (delivery consumption shape)

`app/dashboard/.../CampaignPageAssembly.tsx` maps saved rows to a lookup for delivery adapters:

```34:51:lib/kpi/deliveryTargets.ts
export function buildKPITargetsMap(rows: CampaignKPI[] | null | undefined): KPITargetsMap {
  // Key: `${mediaType}::${publisher}::${bidStrategy}` (all lowercased)
  // Values: { ctr, conversion_rate, vtr, frequency } only
  // line_item_id is NOT part of the delivery lookup key
}
```

**Ambiguity:** Multiple `campaign_kpi` rows with the same `(media_type, publisher, bid_strategy)` but different `line_item_id` will collide; last row in iteration wins.

### Every current consumer of `/api/kpis/campaign`

| Consumer | File | Operation |
|----------|------|-----------|
| Campaign dashboard delivery | `app/dashboard/.../CampaignPageAssembly.tsx` | GET via `getCampaignKPIs()` → `buildKPITargetsMap` → `CampaignDeliverySection` |
| Media plan edit | `app/mediaplans/mba/[mba_number]/edit/page.tsx` | GET via `getCampaignKPIs(mba, selectedVersionNumber)` → KPI editor / resolve |
| Media plan save | `lib/kpi/saveCampaignKpis.ts` → `syncCampaignKPIs()` | POST `/api/kpis/campaign/sync` |
| Search pacing grid (inline edit) | `components/pacing-search/LineItemPacingTable.tsx` | POST `/api/kpis/campaign/sync` on modal save |
| Version-1 cleanup | `lib/mediaplan/clearVersionChildren.ts` | GET + DELETE per row id |
| Client API wrappers | `lib/api/kpi.ts` | `getCampaignKPIs`, `saveCampaignKPIs`, `syncCampaignKPIs` |

**Direct Xano (no Next route):** pacing server loaders use `lib/xano/campaignKpi.ts` → `fetchCampaignKpisForMbas`:

- `lib/pacing/campaigns/fetchSearchPacingCampaignRows.ts`
- `lib/pacing/social/fetchSocialPacingCampaignRows.ts`

POST/PATCH/DELETE on `/api/kpis/campaign` are used from save flows; PATCH/DELETE are not called directly from browser code except DELETE in `clearVersionChildren`.

---

## 4. Delivery container scoping and join keys

### Hierarchy

Each **channel** (Search, Meta, TikTok, etc.) is one `ChannelSection` with:

1. **Aggregate** band — all line items in that channel (optionally date-filtered).
2. **Per–line-item** accordions — one `LineItemBlock` each.

### Search

| Level | Scope | Join fields available |
|-------|--------|------------------------|
| Aggregate | All search line items on plan + Snowflake `searchData.totals` / daily | `mbaNumber` (page), `kpiVersionNumber` (page), no per-line publisher in aggregate KPI band |
| Line item | `SearchPacingLineItemSeries.lineItemId` + burst schedule from plan `searchLineItems` | `line_item_id`, burst `buyType`, platform from schedule |

`campaign_kpi` is **not** joined at delivery layer for search KPI tiles.

### Social (Meta / TikTok)

| Level | Scope | Target lookup |
|-------|--------|---------------|
| Aggregate | All active line items for platform; KPIs from `summarizeActuals(metrics.flatMap(m => m.actualsDaily))` | **First** line item's `platform` + `buy_type` only (`activeItems[0]`) |
| Line item | One `SocialLineItem` + its Snowflake rows | `m.lineItem.platform` + `m.lineItem.buy_type` |

```219:221:components/dashboard/delivery/channels/socialAdapterShared.ts
  const pub = String(activeItems[0]?.platform ?? "meta")
  const bid = String(activeItems[0]?.buy_type ?? "")
```

```65:68:components/dashboard/delivery/channels/socialAdapterShared.ts
function resolveKpiTarget(kpiTargets, publisher, bidStrategy) {
  return kpiTargets.get(kpiTargetKey("socialmedia", publisher.toLowerCase().trim(), bidStrategy.toLowerCase().trim()))
}
```

**Join to `campaign_kpi` for delivery:** `(media_type → "socialmedia", publisher, bid_strategy)` — **not** `line_item_id`, despite `campaign_kpi` storing `line_item_id` per row.

### Props threading (campaign dashboard)

From `CampaignPageAssembly.tsx`:

- `mbaNumber` — route param / campaign record
- `kpiVersionNumber` — derived from `campaign.version_number` ?? `mp_plannumber` ?? `versionNumber`, default `1`
- `kpiTargets` — `buildKPITargetsMap(savedCampaignKPIs)`
- Line items — filtered plan containers (`filteredSocialItems`, `filteredSearchItems`, etc.)
- Snowflake — scoped by line item id lists in `DeliveryDataProvider` POST body

---

## 5. Existing actual vs `campaign_kpi` target UI elsewhere

### Delivery containers (this task's focus)

| Location | Compares to `campaign_kpi`? | Metrics |
|----------|------------------------------|---------|
| Social delivery `buildAggregateKpiTiles` | **Partial** | CTR, CVR (`conversion_rate`), VTR (video View rate) |
| Search delivery KPI band | **No** | Burst-derived / hard-coded expectations only |
| Programmatic delivery (`programmaticAdapterShared.ts`) | **Partial** | CTR, VTR (same pattern as social) |

`frequency` and `cpv` from `campaign_kpi` are **not** shown as expected values on CPM/CPC/CPA tiles in delivery (CPV appears as actual-only on social video tiles).

### Pacing grids (separate UI, same Xano table)

| UI | File | Join | Metrics vs target |
|----|------|------|-------------------|
| Search pacing table | `components/pacing-search/LineItemPacingTable.tsx` | `mba\|version\|line_item_id` (server) | `buildKpiComparisons` — **ctr**, **conversionRate** (`lib/pacing/kpi/computeKpiStatus.ts`) |
| Social pacing table | `components/pacing-social/LineItemPacingTable.tsx` | same grain | `buildSocialKpiComparisons` — ctr, conversionRate, cpv, vtr (`lib/pacing/social/computeSocialKpiStatus.ts`) |

Pacing loaders join `campaign_kpi` by **line item id**:

```343:366:lib/pacing/campaigns/fetchSearchPacingCampaignRows.ts
  function makeKpiKey(mba: string, version: number, lineItemId: string): string {
    return `${mba}|${version}|${lineItemId.toLowerCase().trim()}`;
  }
  // ...
  row.kpiTargets = kpiTargetsByKey.get(key) ?? null;
```

### KPI editor (targets only, not delivery actuals)

`components/kpis/KPIEditModal.tsx` edits `ctr`, `cpv`, `conversion_rate`, `vtr`, `frequency` on `ResolvedKPIRow` before sync to Xano.

### Scale handling inconsistency (relevant to comparisons)

- **Pacing social** (`computeSocialKpiStatus.ts`): normalises ratio targets when `>= 1` (legacy percentage points).
- **Delivery social/programmatic** (`socialAdapterShared.ts`, `programmaticAdapterShared.ts`): compares `tgt.ctr` directly to actuals on **0–100** percentage scale **without** that normalisation.
- **Pacing search** (`computeKpiStatus.ts`): documents decimal ratios (0.045 = 4.5%) for both target and Snowflake actuals.

---

## 6. Version-scoping for `campaign_kpi`

### Campaign dashboard (`CampaignPageAssembly.tsx`)

```260:285:app/dashboard/[slug]/[mba_number]/components/CampaignPageAssembly.tsx
  const kpiVersionNumber: number = (() => {
    const raw =
      (campaign?.version_number as number | string | undefined) ??
      (campaign?.mp_plannumber as number | string | undefined) ??
      (campaign?.versionNumber as number | string | undefined)
    const n = typeof raw === "number" ? raw : Number(raw)
    return Number.isFinite(n) && n > 0 ? n : 1
  })()

  useEffect(() => {
    if (!mbaNumber) return
    getCampaignKPIs(mbaNumber, kpiVersionNumber)
      .then((data) => { setSavedCampaignKPIs(data) })
  }, [mbaNumber, kpiVersionNumber])
```

**Current version** = fields on the loaded campaign object for the dashboard MBA page. No separate version picker in this snippet.

### Media plan edit

`getCampaignKPIs(mbaNumber, selectedVersionNumber)` when `selectedVersionNumber` is set (`edit/page.tsx:2254-2269`). Version comes from the plan version selector in the editor.

### Server fetch (`lib/kpi/campaignKpi.ts` / `lib/xano/campaignKpi.ts`)

- Query/filter: `mba_number` + `version_number` on every GET.
- `fetchCampaignKpisForMbas` fans out one paginated GET per unique `(mbaNumber, versionNumber)` pair (`page_size=200`, max 50 pages).

### Fan-out on save

`lib/kpi/fanOut.ts` writes one `campaign_kpi` row per matched line item with `version_number` from the save payload (media plan version being saved).

---

## Open questions

1. **Metric set mismatch:** User expectation of CPM/CTR/CPC/CVR/CPA on **search** delivery does not match implementation (search uses CPC / Conversions / Top Impression Share / Impressions). Is the goal to align search with social's tile set, or only extend social/programmatic comparisons?

2. **Join grain mismatch:** `campaign_kpi` is stored per `line_item_id` (fan-out on save), but delivery `buildKPITargetsMap` keys only `(media_type, publisher, bid_strategy)`. Pacing grids use line-item grain. Which grain should "actual vs target" use on the delivery dashboard?

3. **Social aggregate target lookup:** Aggregate social KPIs use `activeItems[0]` for publisher/bid_strategy. Multi–bid-strategy channels may show wrong targets on the aggregate row. Is aggregate comparison required, or only per line item?

4. **Percent scale:** Delivery adapters compare Snowflake actuals on 0–100 scale to raw `campaign_kpi` values without `normaliseRatioTarget` (unlike `computeSocialKpiStatus`). What unit does Xano actually store for a given campaign row — decimal (0.03) or points (3)? Needs spot-check on live data before trusting delivery comparisons.

5. **CVR definition:** Social delivery `cvr` = `results / impressions` (`socialChannelCompute.ts`), while search pacing `conversionRate` actual is click-based in `computeKpiStatus`. Does `campaign_kpi.conversion_rate` mean the same thing across media types?

6. **Unmapped targets:** `campaign_kpi` has `cpv` and `frequency`; delivery shows neither as expected on CPA/CPM tiles. Should CPA target be derived (spend/deliverables from plan) or stored explicitly in Xano (no column today)?

7. **Search delivery + `campaign_kpi`:** `kpiTargets` is already loaded on the campaign page but unused for search KPI tiles. Should search adopt pacing-grid join (`line_item_id`) or publisher/bid_strategy map like social?

8. **Search-only Snowflake vs pacing grid:** Delivery uses `getSearchPacingData` (`SEARCH_PACING_FACT` daily aggregates); pacing grid uses `getSearchCampaignsPacingData` (ad-group grain). Are totals guaranteed aligned for the same filters?

9. **Pagination / truncation:** `fetchCampaignKpisForMbas` may truncate if Xano pagination misbehaves (documented in `docs/pacing/STAGE_2d-0_REPORT.md`). Could delivery targets be missing silently for large plans?

10. **Auth on write routes:** GET `/api/kpis/campaign` uses `checkClientMbaAccess`; POST/PATCH/DELETE/sync do not (see `SEC-D2-api-surface-audit.md`). Out of scope for display logic but relevant if delivery UI ever writes targets inline.
