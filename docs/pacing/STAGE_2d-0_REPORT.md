# Stage 2d-0 — Discovery Report

**Branch:** `pacing-search-rebuild` (verified)  
**Working tree:** clean (verified)  
**Date:** 2026-05-24  
**Scope:** Read-only discovery for Stages 2d-1 through 2d-5. No source modifications.

**Path note:** The prompt references `/campaigns/mba/[mba_number]/edit`. That route does **not** exist in this repo. The MBA edit page is at `app/mediaplans/mba/[mba_number]/edit/page.tsx`. There is no `app/campaigns/mba/.../edit` directory.

---

## Section 1 — Existing KPI section in the edit page

### 1. Location

The KPI UI is **already extracted** into shared components:

| Piece | Path |
|-------|------|
| Summary + modal trigger | `components/kpis/KPISection.tsx` |
| Editable table modal | `components/kpis/KPIEditModal.tsx` |

**MBA edit page usage:** `app/mediaplans/mba/[mba_number]/edit/page.tsx` (lines 8223–8235).

The same `KPISection` is also used on:

- `app/mediaplans/create/page.tsx` (line 6121)
- `app/mediaplans/[id]/edit/page.tsx` (line 3388)

### 2. Line range

| Location | Lines |
|----------|-------|
| KPI imports | `app/mediaplans/mba/[mba_number]/edit/page.tsx:136–144` |
| KPI state + effects | `app/mediaplans/mba/[mba_number]/edit/page.tsx:1778–2161` |
| KPI reset handler | `app/mediaplans/mba/[mba_number]/edit/page.tsx:4723–4728` |
| KPI save on campaign save | `app/mediaplans/mba/[mba_number]/edit/page.tsx:4917–4961` |
| KPI JSX render | `app/mediaplans/mba/[mba_number]/edit/page.tsx:8223–8235` |
| `KPISection` component | `components/kpis/KPISection.tsx:1–220` |
| `KPIEditModal` component | `components/kpis/KPIEditModal.tsx:1–437` |

### 3. Form wiring

KPI fields are **not** wired through react-hook-form. The edit page uses **local `useState`** for KPI data, separate from the main `useForm<MediaPlanFormValues>` media plan form.

**Page-level KPI state** (`app/mediaplans/mba/[mba_number]/edit/page.tsx:1778–1786`):

```typescript
  const [kpiRows, setKpiRows] = useState<ResolvedKPIRow[]>([])
  const [publisherKPIs, setPublisherKPIs] = useState<PublisherKPI[]>([])
  const [clientKPIs, setClientKPIs] = useState<ClientKPI[]>([])
  const [savedCampaignKPIs, setSavedCampaignKPIs] = useState<CampaignKPI[]>([])
  const [isKPILoading, setIsKPILoading] = useState(false)
  const [kpiTrigger, setKpiTrigger] = useState(0)
  const kpiRebuildTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const kpiRowsRef = useRef<ResolvedKPIRow[]>([])
```

**Main media plan form** (same file, lines 1943–1964) uses react-hook-form; KPI is outside it.

**Modal-level editing** (`components/kpis/KPIEditModal.tsx:96–98, 105–123`):

```typescript
  const [editedRows, setEditedRows] = React.useState<ResolvedKPIRow[]>([])
  const [filterMediaType, setFilterMediaType] = React.useState("all")
  const [showSourceFilter, setShowSourceFilter] = React.useState("all")
```

Client name for KPI waterfall is read from the main form via `useWatch`-style hook:

```typescript
  const kpiClientNameWatch = useWatch({ control: form.control, name: "mp_clientname" })
```

(`app/mediaplans/mba/[mba_number]/edit/page.tsx:2020`)

### 4. Fields rendered

#### Editable fields (in `KPIEditModal`)

| UI label | Input type | Form/state field | Xano `campaign_kpi` column |
|----------|------------|------------------|----------------------------|
| CTR | text (`onBlur` parse) | `row.ctr` on `ResolvedKPIRow` | `ctr` |
| VTR | text (`onBlur` parse) | `row.vtr` | `vtr` |
| Conv Rate | text (`onBlur` parse) | `row.conversion_rate` | `conversion_rate` |
| Freq | text (`onBlur` parse) | `row.frequency` | `frequency` |

Evidence — field change handler only allows four metrics (`components/kpis/KPIEditModal.tsx:105–109`):

```typescript
      field: "ctr" | "vtr" | "conversion_rate" | "frequency",
```

Input bindings (`components/kpis/KPIEditModal.tsx:291–338`).

**CPV** exists on `CampaignKPI` / `CampaignKpiRow` but is **not editable** in the modal; it is derived in resolve/fan-out (`lib/kpi/resolve.ts:148`, `lib/kpi/types.ts:44–48`).

#### Read-only display columns (not persisted directly from modal)

| UI label | State field | Notes |
|----------|-------------|-------|
| Media Type | `row.media_type` | → `media_type` |
| Publisher | `row.publisher` | → `publisher` |
| Creative / Targeting | `row.lineItemLabel` | UI-only label |
| Buy Type | `row.buyType` | UI-only; informs CPV derivation |
| Spend | `row.spend` | UI-only |
| Deliverables | `row.deliverables` | UI-only |
| Est. Clicks | `row.calculatedClicks` | UI-only (recalc) |
| Est. Views | `row.calculatedViews` | UI-only |
| Est. Reach | `row.calculatedReach` | UI-only |
| Source | `row.source` | UI-only (`client` \| `publisher` \| `default` \| `manual` \| `saved`) |

#### Identity fields (on `ResolvedKPIRow` / payload, not shown as inputs)

| Field | State key | Xano column |
|-------|-----------|-------------|
| Line item identity | `lineItemId` (UI) / `line_item_id` (payload) | `line_item_id` |
| MBA | `mba_number` | `mba_number` |
| Version | `version_number` | `version_number` |
| Client | `mp_client_name` | `mp_client_name` |
| Campaign | `campaign_name` | `campaign_name` |
| Bid strategy | `bid_strategy` | `bid_strategy` |

Type definitions: `lib/kpi/types.ts:32–63`, `lib/xano/campaignKpi.ts:13–29`.

### 5. Validation

#### UI validation (`KPIEditModal`)

Percent fields use `parsePercentHeuristic` (`lib/kpi/metrics.ts:1–5`):

```typescript
export function parsePercentHeuristic(raw: string): number {
  const val = parseFloat(raw.replace(/[^0-9.-]/g, "")) || 0
  return val > 1 ? val / 100 : val
}
```

Frequency uses `parseFloat` with `|| 0` fallback (`components/kpis/KPIEditModal.tsx:334–336`):

```typescript
                                  const val =
                                    parseFloat(e.target.value.replace(/[^0-9.-]/g, "")) || 0
```

No Zod/Yup schema in the modal. No positive-only check. No max bounds. Empty input → `0`.

#### API validation (on save to Xano)

`campaignKpiCreateBodySchema` (`lib/kpi/types.ts:357–371`):

```typescript
const campaignKpiItemSchema = z.object({
  mp_client_name: nonEmptyStr,
  mba_number: nonEmptyStr,
  version_number: z.coerce.number(),
  campaign_name: nonEmptyStr,
  media_type: nonEmptyStr,
  publisher: nonEmptyStr,
  bid_strategy: nonEmptyStr,
  line_item_id: z.string().trim().min(1, "line_item_id is required"),
  ctr: kpiMetric.optional().default(0),
  cpv: kpiMetric.optional().default(0),
  conversion_rate: kpiMetric.optional().default(0),
  vtr: kpiMetric.optional().default(0),
  frequency: kpiMetric.optional().default(0),
})
```

Shared metric transform (`lib/kpi/types.ts:306–312`):

```typescript
const kpiMetric = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === "" || v === null || v === undefined) return 0
    const n = typeof v === "number" ? v : Number(String(v).trim())
    return Number.isFinite(n) ? n : 0
  })
```

**Conflicts with locked 2d decisions:**

| Decision | Current behavior |
|----------|------------------|
| Positive only | **Not enforced** (UI or Zod) — negatives allowed via `-` in parse |
| Decimals allowed | **Yes** — no integer constraint |
| No max bounds | **Yes** — no `.max()` in schemas |
| All optional | **Partial mismatch** — identity fields required on POST; metrics default to `0` instead of nullable optional |

`campaignKpiPatchBodySchema` (`lib/kpi/types.ts:375–389`) does **not** include `line_item_id`.

### 6. Save semantics

KPI edits in the modal **do not** call Xano directly. Modal "Save KPIs" updates parent state only:

```typescript
                title="KPIs will be saved to Xano when you save the campaign"
                onClick={() => {
                  onSave(editedRows)
                  onClose()
                }}
```

(`components/kpis/KPIEditModal.tsx:415–418`)

Parent wires `onSave={setKpiRows}` (`app/mediaplans/mba/[mba_number]/edit/page.tsx:8231–8232`).

**Persistence** happens inside the main **`handleSaveAll`** campaign save flow, after version is created (`app/mediaplans/mba/[mba_number]/edit/page.tsx:4917–4960`):

```typescript
      if (kpiRows.length > 0 && typeof numericSavedVersion === "number" && Number.isFinite(numericSavedVersion)) {
        updateSaveStatus("Campaign KPIs", "pending")
        const lineItemsByMediaType = buildKpiLineItemsByMediaType({ ... })
        const kpiPayload: CampaignKPI[] = fanOutKpiPayload(
          kpiRows,
          {
            mp_client_name: formValues.mp_clientname,
            mba_number: mbaNumber,
            version_number: numericSavedVersion,
            campaign_name: formValues.mp_campaignname,
          },
          lineItemsByMediaType,
        )
        saveCampaignKpisFromRows(kpiRows, kpiPayload).then((result) => { ... })
      }
```

Call chain:

1. `saveCampaignKpisFromRows` → `lib/kpi/saveCampaignKpis.ts:12–38`
2. `saveCampaignKPIs` → `lib/api/kpi.ts:52–59` — **POST** `/api/kpis/campaign`
3. `createCampaignKpis` → `lib/kpi/campaignKpi.ts:37–52` — **POST** Xano `campaign_kpi` (one row per array item)

**No PATCH/upsert** is used on save. Each save **creates new rows** via POST only.

PATCH and DELETE exist on `/api/kpis/campaign` but **no client call sites** were found for campaign KPI PATCH/DELETE (grep across repo).

### 7. Entanglement risk

**Extraction of the editor component itself is largely done** (`KPISection` + `KPIEditModal`). Stage 2d-3 likely means extracting/reusing this for pacing with a thinner host, not pulling inline JSX from the edit page.

**The page host is tightly coupled.** KPI rebuild/save depends on:

| Dependency | Evidence |
|------------|----------|
| All media line-item arrays (20+ types) | Rebuild effect deps `app/mediaplans/mba/[mba_number]/edit/page.tsx:2112–2161` |
| `form.getValues()` / `useWatch` for client, MBA, version, campaign name | Lines 2060–2101, 2020 |
| `selectedVersionNumber`, `mbaNumber` | Lines 2034–2049, 2098–2100 |
| `publisherKPIs`, `clientKPIs`, `savedCampaignKPIs` | Loaded in effects 1874–2049 |
| `billingPublishers` | Passed to `resolveAllKPIs` line 2105 |
| `buildKpiLineItemsByMediaType`, `resolveAllKPIs`, `mergeManualKpiOverrides`, `fanOutKpiPayload` | Lines 2074–2107, 4920–4950 |
| Main save handler + `updateSaveStatus` | Lines 4917–4960 |

**Reads from outside KPI scope:** yes — line items, MBA metadata, version, client name, publisher/client KPI tables, billing publishers.

**Writes outside KPI scope:** `setKpiRows` / `setSavedCampaignKPIs` only; no direct writes to line-item state.

**Uses parent callbacks:** `handleKPIReset`, `setKpiRows`, save orchestration inside `handleSaveAll`.

**Assessment:** Reusing the modal/table for pacing is feasible if the host supplies `ResolvedKPIRow[]` and handles persistence. Wiring a pacing-only save path without the full media-plan page will require a **new, smaller host** — extraction is **non-trivial** at the page-integration layer even though components exist.

### 8. Per-line-item or per-MBA?

**Per line item** (grouped by `lineItemId`), not one MBA-level block.

Grouping (`lib/kpi/grouping.ts:33–99`) builds one KPI row per distinct `lineItemId`. Modal renders **one table row per grouped line item** (`components/kpis/KPIEditModal.tsx:253–257`):

```typescript
                      {entries.map(({ row, index: rowIndex }, rowInGroup) => {
                        ...
                          <tr key={row.lineItemId}>
```

Summary section groups by `media_type` for display only (`components/kpis/KPISection.tsx:98–107`).

---

## Section 2 — `campaign_kpi` Xano endpoint surface

### 1. All Next.js files that read or write `campaign_kpi`

Search: `grep -rn "campaign_kpi\|campaignKpi\|CampaignKpi" --include="*.ts" --include="*.tsx" .`

| File | Line(s) | Read / Write |
|------|---------|--------------|
| `lib/kpi/campaignKpi.ts` | 15, 32, 40, 49, 61, 66, 73, 76 | **Read** (GET), **Write** (POST, PATCH, DELETE) — direct Xano |
| `lib/xano/campaignKpi.ts` | 8–118 | **Read** (GET) — pacing server helper |
| `lib/kpi/types.ts` | 42, 65, 357–375 | Types + Zod schemas (no I/O) |
| `lib/kpi/saveCampaignKpis.ts` | 4, 12 | Orchestrates write via `saveCampaignKPIs` |
| `lib/kpi/fanOut.ts` | 168, 187, 196, 205 | Payload builder (log messages only) |
| `lib/api/kpi.ts` | 38–59 | **Read** (GET `/api/kpis/campaign`), **Write** (POST) |
| `app/api/kpis/campaign/route.ts` | 3–85 | **Read/Write** — Next.js API route |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx` | 141, 4952 | **Write** (via save chain) |
| `app/mediaplans/create/page.tsx` | 108, 4549 | **Write** |
| `app/mediaplans/[id]/edit/page.tsx` | 96, 2035 | **Write** |
| `lib/pacing/campaigns/fetchSearchPacingCampaignRows.ts` | 9, 336, 344, 347 | **Read** |
| `lib/pacing/campaigns/types.ts` | 9, 118 | Types/comments |
| `lib/pacing/kpi/computeKpiStatus.ts` | 7, 14, 67, 110 | Comments/logic referencing targets |
| `lib/pacing/campaigns/aggregate.ts` | 94, 96 | Variable name `campaignKpis` (aggregated pacing KPIs, not Xano table) |

### 2. Endpoint paths

Base URL key: `XANO_CLIENTS_BASE_URL` (via `xanoUrl(...)`).

| Method | Path | Where |
|--------|------|-------|
| **GET** | `{XANO_CLIENTS_BASE_URL}/campaign_kpi` | `lib/kpi/campaignKpi.ts:15`, `lib/xano/campaignKpi.ts:64`, `lib/xano/campaignKpi.ts:116` |
| **POST** | `{XANO_CLIENTS_BASE_URL}/campaign_kpi` | `lib/kpi/campaignKpi.ts:40–45` |
| **PATCH** | `{XANO_CLIENTS_BASE_URL}/campaign_kpi/{id}` | `lib/kpi/campaignKpi.ts:60–62` |
| **DELETE** | `{XANO_CLIENTS_BASE_URL}/campaign_kpi/{id}` | `lib/kpi/campaignKpi.ts:73` |

Next.js proxy: `/api/kpis/campaign` — GET, POST, PATCH, DELETE (`app/api/kpis/campaign/route.ts`).

### 3. Request shape (as sent from codebase)

#### GET (editor path) — query params

`lib/kpi/campaignKpi.ts:15–19`:

```typescript
      params: {
        mba_number: mbaNumber,
        version_number: versionNumber,
      },
```

Next.js route converts client params (`app/api/kpis/campaign/route.ts:14–15`):

```typescript
    const mbaNumber = request.nextUrl.searchParams.get("mbaNumber")?.trim() ?? ""
    const versionRaw = request.nextUrl.searchParams.get("versionNumber")
```

Client fetch (`lib/api/kpi.ts:42–44`):

```typescript
  params.set("mbaNumber", mbaNumber)
  params.set("versionNumber", String(versionNumber))
```

#### GET (pacing path) — query params

`lib/xano/campaignKpi.ts:68–69`:

```typescript
        params: { mba_number: mba },
```

Fallback full-table fetch: `{}` (`lib/xano/campaignKpi.ts:117`).

#### POST body — array of items

Client (`lib/api/kpi.ts:52–57`):

```typescript
  const response = await fetch("/api/kpis/campaign", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(kpis),
  })
```

After Zod parse, each item matches `campaignKpiItemSchema` (quoted in Section 1.5).

Server posts each item individually (`lib/kpi/campaignKpi.ts:42–46`):

```typescript
      const response = await apiClient.post(url, item)
```

Fan-out payload shape (`lib/kpi/fanOut.ts:215–227`):

```typescript
      {
        ...base,
        media_type: row.media_type,
        publisher,
        bid_strategy,
        line_item_id,
        ctr: row.ctr,
        cpv: row.cpv,
        conversion_rate: row.conversion_rate,
        vtr: row.vtr,
        frequency: row.frequency,
      },
```

Where `base` is `{ mp_client_name, mba_number, version_number, campaign_name }`.

#### PATCH body

`campaignKpiPatchBodySchema` — requires `id`, optional fields for identity + metrics (`lib/kpi/types.ts:375–389`). **No `line_item_id` field.**

#### DELETE

Query param `id` on `/api/kpis/campaign?id=` (`app/api/kpis/campaign/route.ts:81–85`).

### 4. Response shape

#### TypeScript types

**Editor/domain row:** `CampaignKPI` (`lib/kpi/types.ts:32–49`)

**Pacing read row:** `CampaignKpiRow` (`lib/xano/campaignKpi.ts:13–29`):

```typescript
export type CampaignKpiRow = {
  id: number;
  created_at: number;
  mp_client_name: string;
  mba_number: string;
  version_number: number;
  campaign_name: string;
  media_type: string;
  publisher: string;
  bid_strategy: string;
  ctr: number | null;
  cpv: number | null;
  conversion_rate: number | null;
  vtr: number | null;
  frequency: number | null;
  line_item_id: string;
};
```

#### Parsing at call sites

Editor fetch filters client-side (`lib/kpi/campaignKpi.ts:22–30`):

```typescript
    const list: Record<string, unknown>[] = Array.isArray(data)
      ? (data as Record<string, unknown>[])
      : parseXanoListPayload(data)
    const mba = mbaNumber
    return list.filter((row) => {
      const rowMba = String(row.mba_number ?? row.mbaNumber ?? "")
      const ver = Number(row.version_number ?? row.versionNumber ?? NaN)
      return rowMba === mba && ver === versionNumber
    }) as unknown as CampaignKPI[]
```

Pacing per-MBA fetch (`lib/xano/campaignKpi.ts:73–76`):

```typescript
      const list = Array.isArray(response.data)
        ? response.data
        : parseXanoListPayload(response.data);
      const rows = list as CampaignKpiRow[];
```

POST returns created row per item (`lib/kpi/campaignKpi.ts:46`):

```typescript
      out.push((response.data ?? null) as CampaignKPI)
```

### 5. Inputs declared on each endpoint (Next.js side)

| Endpoint | Query / body inputs |
|----------|---------------------|
| GET `/api/kpis/campaign` | `mbaNumber`, `versionNumber` (required) |
| GET Xano direct (editor) | `mba_number`, `version_number` |
| GET Xano direct (pacing) | `mba_number` per MBA; fallback paginated GET with `page`, `page_size`, `offset`, `limit` |
| POST `/api/kpis/campaign` | JSON array; each item: see `campaignKpiItemSchema` |
| PATCH `/api/kpis/campaign` | JSON object with `id` + optional update fields |
| DELETE `/api/kpis/campaign` | `id` query param |

**Unknown — requires Xano UI inspection:** whether Xano `campaign_kpi` GET supports `external_paging`, default page size, or additional filters beyond what Next.js sends.

### 6. Existing helper functions

| Helper | File | Purpose |
|--------|------|---------|
| `fetchCampaignKpis(mba, version)` | `lib/kpi/campaignKpi.ts` | Editor read |
| `fetchCampaignKpisForMbas({ mbaNumbers })` | `lib/xano/campaignKpi.ts` | Pacing read |
| `fetchAllCampaignKpisAndFilter` | `lib/xano/campaignKpi.ts` | Private fallback full-table scan |
| `createCampaignKpis` | `lib/kpi/campaignKpi.ts` | POST create (sequential) |
| `updateCampaignKpi` | `lib/kpi/campaignKpi.ts` | PATCH update |
| `deleteCampaignKpi` | `lib/kpi/campaignKpi.ts` | DELETE |
| `getCampaignKPIs` / `saveCampaignKPIs` | `lib/api/kpi.ts` | Browser → Next API |
| `saveCampaignKpisFromRows` | `lib/kpi/saveCampaignKpis.ts` | Pre-save validation + POST |
| `fanOutKpiPayload` | `lib/kpi/fanOut.ts` | Map `ResolvedKPIRow[]` → `CampaignKPI[]` with `line_item_id` |
| `buildKpiLineItemsByMediaType` | `lib/kpi/lineItemsForFanOut.ts` | Line-item maps for fan-out |
| `resolveAllKPIs` / `resolveKPIsForMediaType` | `lib/kpi/resolve.ts` | Build UI rows from line items + layers |
| `fetchAllXanoPages` | `lib/api/xanoPagination.ts` | Generic pagination (used in fallback read) |

Write paths are **centralized** in `lib/kpi/campaignKpi.ts` + `app/api/kpis/campaign/route.ts`; fan-out is centralized in `lib/kpi/fanOut.ts`. No other write call sites found.

---

## Section 3 — Empty `line_item_id` root cause

### 1. All POST/PUT call sites for `campaign_kpi`

**POST only** (no PUT). Call chain:

1. Edit/create pages → `saveCampaignKpisFromRows` → `saveCampaignKPIs` (POST)
2. `app/api/kpis/campaign/route.ts:46` → `createCampaignKpis(parsed.data)`
3. `lib/kpi/campaignKpi.ts:45` → `apiClient.post(url, item)`

**PATCH** exists at `app/api/kpis/campaign/route.ts:55–72` → `updateCampaignKpi` but **no client usage found**.

Payload always goes through `fanOutKpiPayload` before POST from media-plan pages. **`line_item_id` is set in fan-out** (`lib/kpi/fanOut.ts:203–221`):

```typescript
    const line_item_id = lineItemIdForPayload(li, base.mba_number, row.media_type, indexInFullArray)
    if (!line_item_id) {
      console.warn("[campaign_kpi] Skipping matched line item: empty line_item_id", { ... })
      return []
    }
    ...
        line_item_id,
```

If `line_item_id` is empty after fan-out, the row is **dropped** from the payload (not posted).

Current API Zod requires non-empty `line_item_id` (`lib/kpi/types.ts:365`):

```typescript
  line_item_id: z.string().trim().min(1, "line_item_id is required"),
```

### 2. Where `line_item_id` value comes from

Fan-out source (`lib/kpi/fanOut.ts:87–101`):

```typescript
function lineItemIdForPayload(
  li: LineItemForKpiFanout,
  mbaNumber: string,
  mediaType: string,
  indexInFullArray: number,
): string {
  const code = idCodeForKpiMediaType(mediaType)
  if (code) {
    return buildLineItemIdentity(li, mbaNumber, code, indexInFullArray).line_item_id
  }
  if (norm(mediaType) === "production") {
    const fallback = `${mbaNumber}PROD${indexInFullArray + 1}`
    return String(li.line_item_id ?? li.lineItemId ?? fallback).trim()
  }
  return String(li.line_item_id ?? li.lineItemId ?? "").trim()
}
```

Line items for fan-out prefer **media container API rows** over export rows (`lib/kpi/lineItemsForFanOut.ts:13–24`):

```typescript
 * Prefer API/media-container rows (stable `line_item_id`) over export `LineItem[]`
```

UI `lineItemId` on KPI rows comes from grouping (`lib/kpi/grouping.ts:44–52`):

```typescript
    let id = String((item as any).line_item_id ?? (item as any).lineItemId ?? "").trim()
    if (!id && code && mba) {
      id = buildLineItemIdentity(item, mba, code, index).line_item_id
    } else if (!id && isProduction && mba) {
      id = `${mba}PROD${index + 1}`
    }
    if (!id) {
      id = syntheticGroupId(item)
    }
```

**Saved KPI load does not use `line_item_id` for matching** — `resolve.ts:96–105` matches on `media_type`, `publisher`, `bid_strategy` only:

```typescript
    const saved = opts.savedCampaignKPIs.find(
      (k) =>
        mediaTypeMatchesKpiRow(mediaType, k.media_type) &&
        linePublisherMatchesKpiPublisherField(
          publisher,
          k.publisher,
          idToNormName,
        ) &&
        normStr(k.bid_strategy) === bidStrategy,
    )
```

### 3. Default values for `line_item_id` in form state

There is **no** react-hook-form field for `line_item_id`. `ResolvedKPIRow.lineItemId` is computed by `resolveAllKPIs` → `groupLineItemsForKPI` → `buildLineItemIdentity` or synthetic fallback.

No `defaultValues` or `reset` sets `line_item_id` directly. Initial KPI rows come from the debounced rebuild effect (`app/mediaplans/mba/[mba_number]/edit/page.tsx:2056–2107`).

### 4. Hypothesis on root cause

| # | Hypothesis | Confidence | Evidence |
|---|------------|------------|----------|
| H1 | Rows created **before** `line_item_id` was added to the save/fan-out path or Zod schema | **Medium** | Current POST requires `line_item_id`; empty rows still exist in Xano (2c spot check). PATCH schema cannot set `line_item_id`. |
| H2 | Rows created via **direct Xano UI / scripts / manual import** bypassing Next.js validation | **Medium** | unknown — requires Xano UI inspection |
| H3 | Historical saves used a code path that POSTed **without** `line_item_id` before fan-out existed | **Medium** | Fan-out and Zod requirement appear recent; no git history examined in this discovery |
| H4 | Current saves **always POST new rows** without deleting old ones; empty-`line_item_id` rows are **orphaned leftovers** while newer rows may have correct IDs | **High** | No upsert/delete on save; only `createCampaignKpis` POST loop |
| H5 | Fan-out **drops** rows with empty `line_item_id`, so users see KPIs in UI (via publisher/client/saved match without line_item_id) but pacing join fails | **High** | resolve match ignores `line_item_id`; pacing join uses it (`fetchSearchPacingCampaignRows.ts:340–363`) |

**Best combined hypothesis (high confidence):** Empty `line_item_id` rows are predominantly **legacy/orphan rows** from an era before fan-out + validation, compounded by **create-only saves** that never update or remove old rows. The editor still "works" because saved KPI lookup ignores `line_item_id`; pacing fails because it joins on `mba|version|line_item_id`.

### 5. Are existing rows recoverable?

**Partially, in principle:**

- Pacing join key: `mba_number + version_number + line_item_id` (`fetchSearchPacingCampaignRows.ts:340–342`).
- Editor saved-KPI match key: `media_type + publisher + bid_strategy` (no line item).

**Possible backfill join (if unique):** `mba_number` + `version_number` + `media_type` + `publisher` + `bid_strategy` → map to current line item's `line_item_id` from media plan line-item tables.

**Risk:** Multiple line items can share the same publisher + bid strategy within a media type (grouping merges by `lineItemId`, but saved rows without `line_item_id` cannot distinguish them). Rows that cannot be uniquely matched are **orphans** (delete or manual fix).

**Unknown — requires Luke confirmation:** whether `curatif002` empty rows are uniquely matchable on publisher+bid_strategy+media_type per version.

---

## Section 4 — `campaign_kpi` pagination truncation

### 1. Where is `campaign_kpi` fetched with pagination?

**Primary pacing path** — per-MBA GET **without** pagination loop (`lib/xano/campaignKpi.ts:66–89`).

**Fallback full-table path** — paginated (`lib/xano/campaignKpi.ts:114–118`):

```typescript
async function fetchAllCampaignKpisAndFilter(mbaNumbers: string[]): Promise<CampaignKpiRow[]> {
  const mbaSet = new Set(mbaNumbers);
  const url = xanoUrl("campaign_kpi", "XANO_CLIENTS_BASE_URL");
  const all = await fetchAllXanoPages(url, {}, "campaign_kpi_all", 200, 50);
  return (all as CampaignKpiRow[]).filter((r) => mbaSet.has(r.mba_number));
}
```

Triggered when `mbaFilterSupported === false` or Xano ignores `mba_number` filter (`lib/xano/campaignKpi.ts:59–61, 78–86, 92–97`).

Editor path `fetchCampaignKpis` (`lib/kpi/campaignKpi.ts:10–34`) — **single GET**, no pagination.

### 2. Pagination approach

`fetchAllXanoPages` — manual loop sending both `page`/`page_size` and `offset`/`limit` (`lib/api/xanoPagination.ts:7–12, 60–72`).

### 3. Per-page limit

`pageSize = 200`, `maxPages = 50` for campaign_kpi fallback (`lib/xano/campaignKpi.ts:117`).

Defaults in helper: `pageSize = 200`, `maxPages = 50` (`lib/api/xanoPagination.ts:11–12`).

### 4. Truncation symptom

From `fetchAllXanoPages` (`lib/api/xanoPagination.ts:83–98`):

```typescript
      // Some Xano endpoints ignore pagination params and return the same page repeatedly.
      // Dedupe across pages and stop early when we see no new unique items.
      ...
      if (page > 1 && addedThisPage === 0) {
        // We received a page, but nothing new was added => pagination likely ignored.
        // Stop to avoid duplicating the same records over and over.
        console.warn(`[${label}] Pagination appears unsupported; stopping early after page ${page}`)
        break
      }
```

**Observed pattern elsewhere in repo:** Domain 4 audit documents pagination stopping **after page 2** with log `"Pagination appears unsupported"` (`domain-4/AUDIT_DOMAIN_4_KNOWN_ISSUES.md:14–19`):

```markdown
- Impact: ~negligible — pagination short-circuits after page 2 with
  "Pagination appears unsupported" log
```

**Effect for campaign_kpi fallback:** If Xano returns the **same first page** (up to 200 rows) for every page request, dedupe adds zero items on page 2 → loop stops → **at most 200 rows total** from entire table, regardless of true row count.

**Separate risk:** Per-MBA GET (no pagination) may truncate if Xano applies a default limit server-side — **unknown — requires Xano UI inspection**.

No campaign_kpi-specific log strings beyond `[campaignKpi]` filter fallback warnings were found in code.

### 5. Compare with a working endpoint

#### Working pattern — `media_plan_prog_display`

`app/api/media_plans/prog-display/route.ts:45–49`:

```typescript
    const data = await fetchAllXanoPages(
      xanoUrl("media_plan_prog_display", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]),
      lineItemPaginationParams(mbaNumber, versionNumber),
      "PROG_DISPLAY"
    )
```

`lineItemPaginationParams` (`lib/api/mediaPlanLineItemQuery.ts:1–14`):

```typescript
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

Uses **MBA + version filter params** so responses are small; pagination often completes in one page. Post-fetch JS filter as safety net.

#### Equivalent — `campaign_kpi`

| Aspect | prog-display | campaign_kpi (pacing) |
|--------|--------------|------------------------|
| Base URL env | `XANO_MEDIA_PLANS_BASE_URL` | `XANO_CLIENTS_BASE_URL` |
| Filter params | `mba_number`, `version_number`, etc. | Per-MBA: `mba_number` only; fallback: **none** |
| Pagination | `fetchAllXanoPages` with filters | Per-MBA: **no loop**; fallback: `fetchAllXanoPages({}, ...)` |
| Response parsing | Uses paginator raw array | Per-MBA: `parseXanoListPayload`; paginator: **array only** (`xanoPagination.ts:78`) — does **not** call `parseXanoListPayload` |
| Post-filter | `filterLineItemsByPlanNumber` | MBA set filter in TS (fallback only) |

**Key differences:**

1. Fallback fetch scans **entire table** with no MBA param.
2. Paginator treats non-array wrapped responses as `[]` (would stop at page 1, not page 2).
3. Page-2 stop = **duplicate-page detection**, consistent with Xano ignoring pagination params.

### 6. Hypothesis on root cause

**Best hypothesis (medium-high confidence):** When `fetchAllCampaignKpisAndFilter` runs, Xano returns the same first chunk (~200 rows) for page 1 and page 2. Dedupe sees zero new items on page 2 and logs `[campaign_kpi_all] Pagination appears unsupported; stopping early after page 2`. Result: **silent truncation** of all campaign_kpi rows beyond the first page of duplicates (max ~200 unique rows table-wide).

**Secondary hypothesis (medium confidence):** Per-MBA GET works for most MBAs but if `mba_number` filter is unsupported/ignored, code falls back to truncated full scan.

**Unknown — requires Xano UI inspection:** `external_paging` flag, true row count vs returned count, whether per-MBA GET is paginated server-side.

---

## Section 5 — Admin role check pattern

### 1. Where is admin status checked?

Canonical pattern: **`getUserRoles(user)` then `roles.includes("admin")`**.

Sources found:

| Location | Pattern |
|----------|---------|
| `contexts/AuthContext.tsx:51` | `isAdmin: userRoles.includes("admin")` |
| `lib/rbac.ts:392–394` | `isAdminRole(role) => role === 'admin'` |
| `app/pacing/(shell)/layout.tsx:17–18` | `roles.includes("admin")` |
| `lib/requireRole.ts:68–72` | `requireAdmin` → `requireRole(req, 'admin')` |

### 2. Canonical helper or hook

| Context | Helper |
|---------|--------|
| **Client UI** | `useAuthContext().isAdmin` (`contexts/AuthContext.tsx:20, 51`) |
| **Server Components** | `getUserRoles(session.user)` + `roles.includes("admin")` |
| **API routes** | `requireAdmin(request)` from `lib/requireRole.ts:68–72` |
| **Server actions** | `requireAdminUser(user)` (`lib/requireRole.ts:76–83`) |

`requireAdmin` implementation (`lib/requireRole.ts:42–45, 61–62`):

```typescript
  const roles = getUserRoles(session.user);
  ...
  const hasRequiredRole = required.some((role) => roles.includes(role));
  ...
  if (!hasRequiredRole && !grantedByAllowlist) {
    return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
```

### 3. Example — `/pacing/admin/orphans`

**Server page gate** (`app/pacing/(shell)/admin/orphans/page.tsx:6–14`):

```typescript
  const session = await auth0.getSession();
  if (!session?.user) {
    redirect("/auth/login?returnTo=/pacing/admin/orphans");
  }
  const roles = getUserRoles(session.user);
  if (!roles.includes("admin")) {
    redirect("/unauthorized");
  }
```

**API gate** (`app/api/pacing/admin/orphans/route.ts:8–10`):

```typescript
  const admin = await requireAdmin(request);
  if ("response" in admin) return admin.response;
```

**Nav exposure** — admin link injected in shell (`components/pacing/PacingShell.tsx:20–24`):

```typescript
    ...(isAdmin ? [{ href: "/pacing/admin/orphans", label: "Admin" as const }] : []),
```

**Client guard alternative:** `components/guards/AdminGuard.tsx:33–34` redirects non-admin to `/dashboard`.

### 4. Client-side vs server-side

| Layer | Mechanism |
|-------|-----------|
| UI hide/show | `useAuthContext().isAdmin`, `PacingShell isAdmin` prop |
| Page access | Server redirect in `page.tsx` (orphans) or `AdminGuard` (client) |
| Write/read APIs | `requireAdmin(request)` → 401/403 JSON |

**For Stage 2d pacing KPI modal:** mirror **both** — client gate on trigger (like PacingShell nav) **and** server gate on any new write API route (`requireAdmin`).

---

## Section 6 — Existing KPI fields vs locked decisions cross-check

Locked decisions: **all positive numbers**, **decimals allowed**, **no max bounds**, **all fields optional**.

| Decision | Enforced? | Evidence |
|----------|-----------|----------|
| All positive numbers | **N** | `parsePercentHeuristic` and frequency parse allow `-`; `kpiMetric` Zod has no `.min(0)` |
| Decimal precision allowed | **Y** | `parseFloat`, `toFixed(1)` on frequency; no integer coercion |
| No max bounds | **Y** | No `.max()` in UI or Zod for metrics |
| All fields optional | **N** | POST requires `mp_client_name`, `mba_number`, `version_number`, `campaign_name`, `media_type`, `publisher`, `bid_strategy`, `line_item_id`; metrics default to `0` not null |

**Mismatches for Stage 2d-3 extraction:**

1. Add **positive-only** validation (UI + Zod) if locked decision stands.
2. Change metric schema from **default 0** to **optional/nullable** if empty should mean "no target" (pacing `computeKpiStatus.ts` already distinguishes null targets — `lib/pacing/kpi/computeKpiStatus.ts:7`).
3. POST identity fields may remain required for create; pacing modal updates may need PATCH path with optional metrics only.
4. **CPV** is in Xano row but not in modal — confirm whether pacing editor should expose it (see Section 7).

---

## Section 7 — Open questions for Luke

1. **Route naming:** Stage prompts reference `/campaigns/mba/.../edit`; production path is `/mediaplans/mba/[mba_number]/edit`. Confirm pacing modal should reuse components built for mediaplans path.

2. **Save semantics for pacing modal:** Media-plan editor defers Xano write until full campaign save and uses POST-create-only (no upsert). Should pacing admin modal **PATCH existing rows**, **POST new**, or **replace per version**? Current API supports PATCH but nothing calls it.

3. **`line_item_id` backfill:** For `curatif002` empty rows, is `mba + version + media_type + publisher + bid_strategy` unique enough to backfill, or will some rows need manual deletion?

4. **Null vs zero for metrics:** Locked "all optional" conflicts with current `kpiMetric` defaulting empty → `0`. Should unset KPI fields persist as `null` in Xano (for pacing `no-target` status)?

5. **CPV in editor:** Column exists in Xano and fan-out payload but is not editable in `KPIEditModal`. Should Stage 2d include CPV editing?

6. **Pagination fix scope:** Should 2d-2 fix only the fallback full-table scan, or also add pagination to per-MBA GET if Xano paginates filtered results?

7. **Unknown — requires Xano UI inspection:** `campaign_kpi` endpoint pagination config, total row count, whether GET supports `mba_number` + `version_number` together, and whether historical POST accepted missing `line_item_id`.

8. **Duplicate rows on each save:** Create-only POST without delete may accumulate multiple `campaign_kpi` rows per logical line item. Is deduplication in scope for 2d-1/2d-2 or a separate hygiene task?

---

## Appendix — Preflight checks

```
git branch --show-current  → pacing-search-rebuild
git status --short         → (empty — clean tree)
```

No source files modified except this report. No dev server, build, lint, or typecheck run.
