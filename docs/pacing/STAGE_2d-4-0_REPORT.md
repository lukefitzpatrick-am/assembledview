# Stage 2d-4-0 — Discovery Report: campaign_kpi Save-Flow Architecture

**Branch:** `pacing-search-rebuild` (verified at report time)  
**Scope:** Read-only inventory for shifting from create-only POST to create-or-PATCH keyed by `(mba_number, version_number, line_item_id)`.  
**Post-2d-3 baseline:** All quotes taken from current workspace files; line numbers refer to that state.

---

## Section 1 — Current save-flow architecture

End-to-end chain: KPI modal `onSave` → page `setKpiRows` → user clicks main **Save campaign** → `handleSaveAll` → `fanOutKpiPayload` → `saveCampaignKpisFromRows` → `saveCampaignKPIs` → `POST /api/kpis/campaign` → `createCampaignKpis` → Xano POST per row.

### 1.1 — `KPIEditModal.tsx` onSave handler

Save button (2d-3: disabled when validation errors present):

```534:547:components/kpis/KPIEditModal.tsx
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={isSaving || Object.keys(fieldErrors).length > 0}
                title={
                  Object.keys(fieldErrors).length > 0
                    ? "Fix validation errors before saving."
                    : "KPIs will be saved to Xano when you save the campaign"
                }
                onClick={() => {
                  onSave(editedRows)
                  onClose()
                }}
              >
```

Field edits set `isManuallyEdited: true` and `source: "manual"` (`components/kpis/KPIEditModal.tsx:117–121`). The modal does **not** call any API; it only passes edited rows to the parent.

### 1.2 — Parent wiring (media-plan edit pages)

All three media-plan editor pages wire `onSave={setKpiRows}` — no additional logic.

MBA edit page:

```8228:8234:app/mediaplans/mba/[mba_number]/edit/page.tsx
                  <KPISection
                    kpiRows={kpiRows}
                    isLoading={isKPILoading}
                    onKPIChange={setKpiRows}
                    onSave={setKpiRows}
                    onReset={handleKPIReset}
                  />
```

`KPISection` forwards modal save to the prop:

```204:211:components/kpis/KPISection.tsx
      <KPIEditModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        kpiRows={kpiRows}
        onSave={(updatedRows) => {
          onSave(updatedRows)
          setIsModalOpen(false)
        }}
```

Same pattern: `app/mediaplans/create/page.tsx:6121–6126`, `app/mediaplans/[id]/edit/page.tsx:3388–3393`.

### 1.3 — `handleSaveAll` KPI persistence (MBA edit page)

KPI block runs **after** media-plan version PUT succeeds. Uses `fanOutKpiPayload` → `saveCampaignKpisFromRows` (POST-only). Version comes from PUT response; metrics pass through as nullable from `ResolvedKPIRow`.

```4915:4961:app/mediaplans/mba/[mba_number]/edit/page.tsx
      const numericSavedVersion = typeof savedVersionNumber === 'string' ? parseInt(savedVersionNumber, 10) : savedVersionNumber

      // --- KPI: save campaign KPIs against the new version (non-blocking) (Stage 2) ---
      if (kpiRows.length > 0 && typeof numericSavedVersion === "number" && Number.isFinite(numericSavedVersion)) {
        updateSaveStatus("Campaign KPIs", "pending")
        const lineItemsByMediaType = buildKpiLineItemsByMediaType({
          search: { media: searchMediaLineItems, export: searchItems },
          ...
        })
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
        saveCampaignKpisFromRows(kpiRows, kpiPayload).then((result) => {
          if (result.status === "skipped") {
            updateSaveStatus("Campaign KPIs", "success")
          } else if (result.status === "success") {
            updateSaveStatus("Campaign KPIs", "success")
          } else {
            updateSaveStatus("Campaign KPIs", "error", result.message)
          }
        })
      }
```

**Confirmed:**
- Still `fanOutKpiPayload` → POST-only via `saveCampaignKpisFromRows`.
- `numericSavedVersion` resolution from PUT response is in place (`4906–4915`).
- Null metrics: `fanOutKpiPayload` copies `row.ctr`, `row.cpv`, etc. directly (`lib/kpi/fanOut.ts:222–226`); no coercion to zero in fan-out.

**Other save entry points (same POST-only pattern):**

| Page | Version used for KPI POST | Lines |
|---|---|---|
| `app/mediaplans/create/page.tsx` | `parseInt(fv.mp_plannumber ?? "1", 10)` | `4539–4557` |
| `app/mediaplans/[id]/edit/page.tsx` | `mediaPlan?.version_number ?? 1` (stale — does not read new version from PUT response) | `2025–2039` |

### 1.4 — `saveCampaignKpisFromRows`

Full current contents:

```1:39:lib/kpi/saveCampaignKpis.ts
import type { CampaignKPI, ResolvedKPIRow } from "./types"
import { saveCampaignKPIs } from "@/lib/api/kpi"

export type CampaignKpiSaveResult =
  | { status: "skipped" }
  | { status: "success" }
  | { status: "error"; message: string }

/**
 * Persist fan-out KPI rows; surfaces match/save failures for save-status UI.
 */
export async function saveCampaignKpisFromRows(
  kpiRows: ResolvedKPIRow[],
  payload: CampaignKPI[],
): Promise<CampaignKpiSaveResult> {
  if (kpiRows.length === 0) {
    return { status: "skipped" }
  }
  if (payload.length === 0) {
    return {
      status: "error",
      message:
        "Could not match KPI rows to line items. Save line items first, then retry.",
    }
  }
  if (payload.length < kpiRows.length) {
    return {
      status: "error",
      message: `Only ${payload.length} of ${kpiRows.length} KPI rows matched line items; save line items first, then retry.`,
    }
  }
  try {
    await saveCampaignKPIs(payload)
    return { status: "success" }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { status: "error", message }
  }
}
```

**Behaviour:** Validates row/payload counts, then calls `saveCampaignKPIs` (POST). No PATCH, no lookup, no `id` handling.

### 1.5 — `saveCampaignKPIs` (`lib/api/kpi.ts`)

```52:60:lib/api/kpi.ts
export async function saveCampaignKPIs(kpis: CampaignKPI[]): Promise<CampaignKPI[]> {
  const response = await fetch("/api/kpis/campaign", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(kpis),
  })
  const data = await jsonOrThrow<CampaignKPI[]>(response)
  return Array.isArray(data) ? data : []
}
```

**Confirmed:** POST-only. No client-side `updateCampaignKpi` / `deleteCampaignKpi` wrappers exist in this file (only `getPublisherKPIs`, `getClientKPIs`, `getCampaignKPIs`, `saveCampaignKPIs`).

### 1.6 — `POST /api/kpis/campaign` route handler

```37:53:app/api/kpis/campaign/route.ts
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = campaignKpiCreateBodySchema.safeParse(body)
    if (!parsed.success) {
      const msg =
        parsed.error.issues.map((i) => i.message).join("; ") || "Validation failed"
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    const results = await createCampaignKpis(parsed.data)
    return NextResponse.json(results, { status: 201 })
  } catch (error) {
    console.error("POST /api/kpis/campaign:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

**Confirmed:**
- Uses `campaignKpiCreateBodySchema` (`lib/kpi/types.ts:389`).
- Returns **201** with the array of created rows (including Xano-assigned `id`s from `createCampaignKpis`).
- Callers (`saveCampaignKpisFromRows`) **discard** the response — created `id`s are not written back to editor state.

### 1.7 — `createCampaignKpis`

```37:53:lib/kpi/campaignKpi.ts
export async function createCampaignKpis(
  inputs: CampaignKpiInput[],
): Promise<CampaignKPI[]> {
  const url = xanoUrl("campaign_kpi", "XANO_CLIENTS_BASE_URL")
  const out: CampaignKPI[] = []
  for (let i = 0; i < inputs.length; i++) {
    const item = inputs[i]!
    try {
      const response = await apiClient.post(url, item)
      out.push((response.data ?? null) as CampaignKPI)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(`createCampaignKpis: row ${i} failed: ${msg}`)
    }
  }
  return out
}
```

**Confirmed:** Sequential POST per input row to Xano `campaign_kpi` collection URL. Accumulates and returns created rows. No upsert, no duplicate check.

---

## Section 2 — Existing PATCH and DELETE infrastructure

### 2.1 — `updateCampaignKpi`

```55:69:lib/kpi/campaignKpi.ts
export async function updateCampaignKpi(
  id: number,
  input: Partial<CampaignKpiInput>,
): Promise<CampaignKPI | null> {
  try {
    const response = await apiClient.patch(
      xanoUrl(`campaign_kpi/${id}`, "XANO_CLIENTS_BASE_URL"),
      input,
    )
    return response.data ?? null
  } catch (e) {
    console.error("updateCampaignKpi", e)
    return null
  }
}
```

**URL:** `campaign_kpi/{id}` on `XANO_CLIENTS_BASE_URL`.  
**Payload:** `Partial<CampaignKpiInput>` — any subset of create fields except `id`/`created_at`.

### 2.2 — `deleteCampaignKpi`

```71:79:lib/kpi/campaignKpi.ts
export async function deleteCampaignKpi(id: number): Promise<boolean> {
  try {
    await apiClient.delete(xanoUrl(`campaign_kpi/${id}`, "XANO_CLIENTS_BASE_URL"))
    return true
  } catch (e) {
    console.error("deleteCampaignKpi", e)
    return false
  }
}
```

**URL:** `DELETE campaign_kpi/{id}`. No body.

### 2.3 — Route PATCH and DELETE handlers

PATCH:

```55:77:app/api/kpis/campaign/route.ts
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = campaignKpiPatchBodySchema.safeParse(body)
    if (!parsed.success) {
      const msg =
        parsed.error.issues.map((i) => i.message).join("; ") || "Validation failed"
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    const { id, ...rest } = parsed.data
    const result = await updateCampaignKpi(id, rest)
    if (result === null) {
      return NextResponse.json(
        { error: "Failed to update campaign KPI" },
        { status: 500 },
      )
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("PATCH /api/kpis/campaign:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
```

DELETE:

```79:97:app/api/kpis/campaign/route.ts
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id")
    if (!id?.trim()) {
      return NextResponse.json({ error: "id is required" }, { status: 400 })
    }
    const ok = await deleteCampaignKpi(Number(id))
    if (!ok) {
      return NextResponse.json(
        { error: "Failed to delete campaign KPI" },
        { status: 500 },
      )
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("DELETE /api/kpis/campaign:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
```

**Input expectations:**
- PATCH: JSON body validated by `campaignKpiPatchBodySchema`; requires `id`, at least one optional field (schema has no `.refine` for “at least one field” — all fields optional except `id`).
- DELETE: query param `id`.

### 2.4 — `campaignKpiPatchBodySchema` (post-2d-3)

```391:405:lib/kpi/types.ts
export const campaignKpiPatchBodySchema = z.object({
  id: z.coerce.number(),
  mp_client_name: z.string().trim().min(1).optional(),
  mba_number: z.string().trim().min(1).optional(),
  version_number: z.coerce.number().optional(),
  campaign_name: z.string().trim().min(1).optional(),
  media_type: z.string().trim().min(1).optional(),
  publisher: z.string().trim().min(1).optional(),
  bid_strategy: z.string().trim().min(1).optional(),
  ctr: kpiMetricNullable.nullable().optional(),
  cpv: kpiMetricNullable.nullable().optional(),
  conversion_rate: kpiMetricNullable.nullable().optional(),
  vtr: kpiMetricNullable.nullable().optional(),
  frequency: kpiMetricNullable.nullable().optional(),
})
```

**Confirmed:** Post-2d-3 schema still **does not** include `line_item_id`. Metrics use `kpiMetricNullable` (null allowed; positive required when set).

### 2.5 — Call sites of `updateCampaignKpi` / `deleteCampaignKpi`

```powershell
git grep -n "updateCampaignKpi\|deleteCampaignKpi" --include="*.ts" --include="*.tsx" -r
```

Results:

| Symbol | Locations |
|---|---|
| `updateCampaignKpi` | `lib/kpi/campaignKpi.ts:55` (definition), `app/api/kpis/campaign/route.ts:6,65` (import + PATCH handler) |
| `deleteCampaignKpi` | `lib/kpi/campaignKpi.ts:71` (definition), `app/api/kpis/campaign/route.ts:4,85` (import + DELETE handler) |

**Confirmed:** No client/editor call sites. Infrastructure exists server-side only; no browser `fetch` PATCH/DELETE wrappers in `lib/api/kpi.ts`.

---

## Section 3 — `fanOutKpiPayload` post-2d-3

### 3.1 — Full function

```155:230:lib/kpi/fanOut.ts
export function fanOutKpiPayload(
  kpiRows: ResolvedKPIRow[],
  base: {
    mp_client_name: string
    mba_number: string
    version_number: number
    campaign_name: string
  },
  lineItemsByMediaType: Record<string, LineItemForKpiFanout[]>,
): CampaignKPI[] {
  return kpiRows.flatMap((row) => {
    const targetId = String(row.lineItemId ?? "").trim()
    if (!targetId) {
      console.warn("[campaign_kpi] Skipping KPI row: missing lineItemId", { ... })
      return []
    }
  ...
    return [
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
    ]
  })
}
```

Output objects **omit** `id`. One `CampaignKPI` per matched `ResolvedKPIRow`.

### 3.2 — Access to existing row IDs?

**No.** Inputs are `kpiRows`, version/base metadata, and line-item maps. `fanOutKpiPayload` does not read `row.id` even if present; it never spreads `id` into the payload.

### 3.3 — `ResolvedKPIRow` shape and ID propagation

```32:63:lib/kpi/types.ts
export interface CampaignKPI {
  id?: number
  ...
  line_item_id?: string
  ctr: number | null
  ...
}

export interface ResolvedKPIRow extends CampaignKPI {
  lineItemId: string
  lineItemLabel: string
  ...
}
```

`ResolvedKPIRow` **inherits optional `id`** from `CampaignKPI`, but the resolver **never sets it**:

```156:179:lib/kpi/resolve.ts
    const row: ResolvedKPIRow = {
      mp_client_name: clientName,
      mba_number: mbaNumber,
      version_number: versionNumber,
      campaign_name: campaignName,
      media_type: mediaType,
      publisher,
      bid_strategy: bidStrategy,
      ctr: merged.ctr,
      cpv,
      conversion_rate: merged.conversion_rate,
      vtr: merged.vtr,
      frequency: merged.frequency,
      lineItemId,
      lineItemLabel: label,
      ...
    }
```

Saved KPI lookup (`102–111`) matches on `media_type` + `publisher` + `bid_strategy` only — **not** `line_item_id`. The matched `saved` record's `id` and `line_item_id` are **not copied** onto `ResolvedKPIRow`.

`mergeManualKpiOverrides` keys by `lineItemId` and preserves metric overrides only — no `id` (`lib/kpi/recalc.ts:28–46`).

**Load path for saved rows:** `getCampaignKPIs` → `setSavedCampaignKPIs` → `resolveAllKPIs` (`app/mediaplans/mba/[mba_number]/edit/page.tsx:2033–2107`). Xano `campaign_kpi.id` values are **not preserved** in editor state today.

### 3.4 — `buildKpiLineItemsByMediaType`

```27:37:lib/kpi/lineItemsForFanOut.ts
export function buildKpiLineItemsByMediaType(
  pairs: Record<string, KpiLineItemsPair>,
): Record<string, LineItemForKpiFanout[]> {
  return Object.fromEntries(
    Object.entries(pairs).map(([key, pair]) => [
      key,
      pickKpiLineItems(pair?.media, pair?.export),
    ]),
  ) as Record<string, LineItemForKpiFanout[]>
}
```

Does **not** touch KPI row `id`. Only selects/sorts line-item rows for fan-out matching.

---

## Section 4 — Existing row lookup keying

### 4.1 — `fetchCampaignKpis(mba, version)`

```10:35:lib/kpi/campaignKpi.ts
export async function fetchCampaignKpis(
  mbaNumber: string,
  versionNumber: number,
): Promise<CampaignKPI[]> {
  try {
    const response = await apiClient.get(xanoUrl("campaign_kpi", "XANO_CLIENTS_BASE_URL"), {
      params: {
        mba_number: mbaNumber,
        version_number: versionNumber,
      },
    })
    ...
    return list.filter((row) => {
      const rowMba = String(row.mba_number ?? row.mbaNumber ?? "")
      const ver = Number(row.version_number ?? row.versionNumber ?? NaN)
      return rowMba === mba && ver === versionNumber
    }) as unknown as CampaignKPI[]
  } catch (e) {
    console.error("fetchCampaignKpis", e)
    return []
  }
}
```

**Confirmed:** GET passes both `mba_number` and `version_number` as query params; client-side filter reinforces both. Matches H2d-1b behaviour.

Pacing bulk fetch uses the same filter pattern via `fetchCampaignKpisForMbas` (`lib/xano/campaignKpi.ts:63–71`).

### 4.2 — Natural key

**Pacing join key (authoritative for duplicate detection):**

```343:345:lib/pacing/campaigns/fetchSearchPacingCampaignRows.ts
  function makeKpiKey(mba: string, version: number, lineItemId: string): string {
    return `${mba}|${version}|${lineItemId.toLowerCase().trim()}`;
  }
```

**Confirmed:** `(mba_number, version_number, line_item_id)` is the pacing natural key.

**Editor saved-tier match (different key):** `(media_type, publisher, bid_strategy)` — `lib/kpi/resolve.ts:102–110`. Does not use `line_item_id`.

**Additional discriminators:** `media_type`, `publisher`, and `bid_strategy` are stored on each row but are **not** part of the pacing duplicate key. Line item IDs embed media-type codes via `buildLineItemIdentity` / `MEDIA_TYPE_ID_CODES` (`lib/kpi/fanOut.ts:87–101`), so `line_item_id` is typically unique per line item within an MBA.

### 4.3 — Multiple `campaign_kpi` rows per `line_item_id`?

**Not legitimate in current fan-out/resolver design:**

- `groupLineItemsForKPI` produces **one grouped row per `lineItemId`** (`lib/kpi/grouping.ts:68–99`).
- `resolveKPIsForMediaType` emits **one `ResolvedKPIRow` per grouped line item** (`lib/kpi/resolve.ts:93–182`).
- `fanOutKpiPayload` emits **one POST payload row per `ResolvedKPIRow`** (`lib/kpi/fanOut.ts:215–228`).

No code path intentionally creates multiple KPI targets per `(mba, version, line_item_id)`. Duplicates are **accidental** (repeated POST to same version/key).

`lib/xano/campaignKpi.ts:41–42` comment mentions grain `(mba_number, version_number, line_item_id, media_type)` but pacing dedupe uses three-part key only.

**Ambiguity:** Two line items sharing the same publisher + bid strategy get the **same** saved-tier match in resolve (no `line_item_id` in match) — a resolver concern, not multi-row-per-line-item by design.

### 4.4 — Behaviour when a row already exists for the natural key

On save, `createCampaignKpis` always **POSTs new rows**. There is no pre-save fetch, no upsert, no delete of prior rows.

Duplicate warning when loading pacing data:

```347:351:lib/pacing/campaigns/fetchSearchPacingCampaignRows.ts
  for (const ck of campaignKpiRows) {
    const key = makeKpiKey(ck.mba_number, ck.version_number, ck.line_item_id);
    if (kpiTargetsByKey.has(key)) {
      console.warn(`[fetchSearchPacingCampaignRows] duplicate campaign_kpi for ${key}`);
    }
```

**Confirmed:** Existing rows are left in place; duplicates accumulate. Last row in iteration wins in the `Map` (non-deterministic ordering if duplicates exist).

**Duplicate source evidence from save paths:**
- MBA edit: each save POSTs to a **new** version (`numericSavedVersion` from PUT) — duplicates within a version require multiple POST batches targeting the **same** version.
- `[id]/edit`: POST uses **stale** `mediaPlan?.version_number` (`2030`) while PUT creates a new version (`1977–1993`) — **repeated saves POST to the same version number**, producing duplicates.
- Create page: POST uses `fv.mp_plannumber` (`4544`) — re-save without plan-number bump would duplicate within that version.

Xano POST does not upsert (plain `apiClient.post` to collection URL).

---

## Section 5 — Empty-`line_item_id` legacy data

Locked decision (2d-0 Q1c): leave empty-id rows; fix forward.

### 5.1 — Will save flow encounter empty-`line_item_id` rows for PATCH vs POST?

**Indirectly, not as save payload rows:**

1. `getCampaignKPIs` / `fetchCampaignKpis` returns **all** rows for MBA+version, including legacy empty `line_item_id`.
2. `savedCampaignKPIs` feeds resolve; match ignores `line_item_id` (`resolve.ts:102–110`).
3. `fanOutKpiPayload` always computes a non-empty `line_item_id` from line items for POST (`fanOut.ts:203–221`); rows with unmatchable line items are **dropped** from payload.
4. Editor `ResolvedKPIRow` uses `lineItemId` from line items, not from saved row's `line_item_id`.

**Save flow will not PATCH legacy empty-id rows** — it only POSTs new rows with computed `line_item_id`. Legacy rows keep their empty `line_item_id` in Xano unless explicitly deleted or patched elsewhere.

**Will save try to PATCH with an `id` from legacy rows?** Not today — `id` is never placed on `ResolvedKPIRow`. After 2d-4, if lookup matches by `(mba, version, line_item_id)`, empty-id legacy rows **won't match** fan-out payloads and won't be selected for PATCH.

### 5.2 — Decision options for build prompt (not chosen here)

| Option | Description |
|---|---|
| **(a) Ignore** | Never PATCH/DELETE legacy empty-id rows; save creates new rows with proper `line_item_id`. |
| **(b) Delete on save** | DELETE empty-id rows for same `(mba, version)` as side effect of save. |
| **(c) Backfill PATCH** | PATCH legacy rows with computed `line_item_id` when publisher/bid_strategy match — risky if ambiguous. |

Listed in Section 10.

### 5.3 — Resolver path for empty-id saved rows

```102:111:lib/kpi/resolve.ts
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

**No filter** on `line_item_id`. Empty-id rows **participate in saved-tier merge** if publisher/bid_strategy align. They are not normalised or excluded. Metrics from matched saved row apply; `id`/`line_item_id` from saved row are discarded when building `ResolvedKPIRow`.

---

## Section 6 — Concurrency and ordering

Locked: last-write-wins, no concurrency check (2d kickoff Q7).

### 6.1 — Per-row save ordering

`createCampaignKpis` uses a **sequential `for` loop** (`lib/kpi/campaignKpi.ts:42–51`). Not `Promise.all`.

`saveCampaignKpisFromRows` awaits a single POST that triggers sequential server-side creates.

### 6.2 — Atomicity / partial failure

- If row `i` fails in `createCampaignKpis`, earlier rows **remain created** in Xano; function throws (`createCampaignKpis: row ${i} failed`).
- POST handler returns **500** with error message; no rollback.
- MBA edit KPI save is **non-blocking** (`.then` on promise, `4917–4960`) — campaign version save can succeed while KPI POST fails or partially completes.
- **Partial saves are possible** across rows and relative to the main campaign save.

### 6.3 — Trade-offs for create-then-PATCH refactor (flag for build)

| Approach | Pros | Cons |
|---|---|---|
| **Sequential PATCH then POST** | Predictable ordering; easier error attribution; matches current create loop | Slower for large campaigns |
| **Parallel PATCH/POST** | Faster | Partial failure harder to reconcile; last-write-wins races if concurrent editors |
| **Lookup fetch once, then sequential writes** | Single read; consistent id map | Extra GET latency before write batch |

No decision in this discovery stage.

---

## Section 7 — API route, schema validation, and error shape

### 7.1 — POST `/api/kpis/campaign`

**Request:** JSON array; each element validated by `campaignKpiItemSchema` (`lib/kpi/types.ts:373–387`):

- Required: `mp_client_name`, `mba_number`, `version_number`, `campaign_name`, `media_type`, `publisher`, `bid_strategy`, `line_item_id` (non-empty).
- Metrics: `kpiMetricNullable`, default `null`.

**Success response:** `201`, JSON array of created `CampaignKPI` rows (with `id`, `created_at` from Xano).

**Error shapes:**
- `400`: `{ error: string }` (Zod messages joined).
- `500`: `{ error: string }` (create failure message or `"Internal server error"`).

**Caller use of per-row results:** None today — response discarded after POST.

### 7.2 — PATCH `/api/kpis/campaign`

**Request:** JSON object with required `id`; optional identity/metric fields per `campaignKpiPatchBodySchema`.

**Success:** `200`, updated row JSON.

**Errors:**
- `400`: validation failure `{ error: string }`.
- `500`: `{ error: "Failed to update campaign KPI" }` or `{ error: "Internal server error" }`.

### 7.3 — DELETE `/api/kpis/campaign?id={n}`

**Success:** `200`, `{ success: true }`.

**Errors:** `400` missing id; `500` delete failure.

### 7.4 — New sync endpoint vs client-orchestrated (trade-offs only)

| Approach | Pros | Cons |
|---|---|---|
| **Client-orchestrated** (fetch existing → split PATCH/POST → call existing routes) | Reuses existing handlers/schemas; thinner API surface | Multiple round trips from browser; logic duplicated if pacing modal + editor both implement split |
| **New `POST /api/kpis/campaign/sync`** (server resolves PATCH vs POST) | Single request; centralised key logic; easier to add DELETE for orphans later | New schema, tests, auth; server must own natural-key rules |
| **Server-only helper** (no new route; called from route handlers pages already use) | Keeps write logic on server | Still need client API change unless bulk POST handler becomes smart |

No decision in this discovery stage.

---

## Section 8 — Pacing modal create-then-PATCH (Q2)

### 8.1 — Pacing modal status

**Confirmed:** No pacing KPI modal in codebase. Grep for `PacingModal`, `Create targets`, pacing KPI edit UI returned no matches. Stage 2d-7 scope. **2d-4 builds shared helpers only.**

### 8.2 — Minimal helper API (trade-offs)

| Option | Description | Trade-offs |
|---|---|---|
| **1: `syncCampaignKpis(rows)`** | Single entry; any array size; internally fetch + PATCH/POST | One API to test; must handle bulk editor + single-row modal; parameterised by `(mba, version)` |
| **2: `bulkSyncCampaignKpis` + `upsertCampaignKpi`** | Split bulk vs single-row | Clearer call sites; shared core still needed to avoid duplication |

**Recommendation for build prompt:** Option 1 with a thin single-row wrapper (e.g. `upsertCampaignKpi(row)` calling the same core) — one natural-key implementation, two ergonomic entry points. Not a locked decision.

### 8.3 — Lookup for single-row pacing-modal save

Likely pattern:

1. If row carries `id` from prior POST → PATCH.
2. Else `fetchCampaignKpis(mba, version)` → find by `(mba, version, line_item_id)` → PATCH if found, else POST.
3. Cache optional for modal session after first fetch — **unknown — requires build-time design** (modal not built).

Current editor never retains `id`, so modal's first "Create targets" POST must **persist returned `id`** client-side for subsequent PATCHes (per Q2 lock-in).

---

## Section 9 — Test coverage

```powershell
grep -rn "saveCampaignKpis\|saveCampaignKPIs\|updateCampaignKpi\|deleteCampaignKpi\|fanOutKpiPayload" lib/kpi/__tests__/ --include="*.ts"
```

| File | What it asserts | Survives create-then-PATCH without changes? |
|---|---|---|
| `lib/kpi/__tests__/fanOut.test.ts` | `lookupLineItemsForKpiFanOut` alias; `fanOutKpiPayload` line-number matching; empty bid_strategy fill | **Partially** — fan-out output shape may gain optional `id`; tests don't cover save orchestration |
| `lib/kpi/__tests__/resolve.test.ts` | Waterfall merge, explicit zero at saved tier, CPV derivation, publisher id mapping | **Yes** — resolver unchanged by save refactor (unless id propagation added) |

**No tests** for `saveCampaignKpisFromRows`, `saveCampaignKPIs`, `updateCampaignKpi`, or `deleteCampaignKpi`.

---

## Section 10 — Open questions for Luke

1. **Empty-id legacy rows during save** — (a) ignore, (b) delete on save, or (c) backfill PATCH? Context: save POSTs new rows with proper `line_item_id`; legacy empty-id rows still match in resolve via publisher/bid_strategy but not in pacing join.

2. **One helper vs two** — `syncCampaignKpis` only vs `bulkSync` + `upsertCampaignKpi`? Context: editor bulk save + future pacing modal single-row save.

3. **New API route vs client-orchestrated** — add `/api/kpis/campaign/sync` or fetch/split in client calling existing POST/PATCH? Context: PATCH/DELETE routes exist but have zero client usage.

4. **Concurrency on per-row writes** — keep sequential (matches `createCampaignKpis`) or parallel PATCH/POST? Context: partial failure already possible; no transaction.

5. **Multi-row-per-line-item natural key** — Section 4.3 finds **one row per `line_item_id` by design**; confirm `(mba, version, line_item_id)` suffices vs adding `media_type`/`publisher`/`bid_strategy`. Context: pacing uses three-part key; resolve uses different match key.

6. **`[id]/edit` version mismatch** — KPI POST uses `mediaPlan?.version_number` while PUT creates new version (`app/mediaplans/[id]/edit/page.tsx:2030`). Is this page still in active use, and should 2d-4 fix it to use the new version from PUT response (like MBA edit)? **Unknown — requires Luke confirmation.**

---

## Change-point inventory (for Stage 2d-4 build)

| # | File | Role today | Likely 2d-4 touch |
|---|---|---|---|
| 1 | `lib/kpi/saveCampaignKpis.ts` | POST-only orchestration | **Core** — sync logic |
| 2 | `lib/api/kpi.ts` | Client POST + GET only | Add PATCH (and maybe DELETE) fetch wrappers |
| 3 | `lib/kpi/campaignKpi.ts` | Server CRUD | Optional bulk sync helper; reuse fetch/PATCH/POST |
| 4 | `lib/kpi/fanOut.ts` | Build payload without `id` | May pass through `id` or accept existing-id map |
| 5 | `lib/kpi/resolve.ts` | No `id` propagation | May map saved row `id` by `line_item_id` |
| 6 | `lib/kpi/types.ts` | Schemas | Possible `line_item_id` on patch schema |
| 7 | `app/api/kpis/campaign/route.ts` | POST/PATCH/DELETE | Optional sync route |
| 8 | `app/mediaplans/mba/[mba_number]/edit/page.tsx` | Bulk save caller | Wire sync helper; optionally store returned ids |
| 9 | `app/mediaplans/create/page.tsx` | Bulk save caller | Same |
| 10 | `app/mediaplans/[id]/edit/page.tsx` | Bulk save + version bug | Same + version resolution |
| 11 | `lib/kpi/__tests__/fanOut.test.ts` | Fan-out tests | Update if payload carries `id` |
| 12 | New test file(s) | — | Sync / save orchestration tests |

**Estimated file count:** 8–12 files (including tests).

---

## Executive summary

1. KPI edits in the modal update local state only (`setKpiRows`); persistence happens on **Save campaign** via POST-only chain.
2. `fanOutKpiPayload` → `saveCampaignKpisFromRows` → `saveCampaignKPIs` → `createCampaignKpis` always **creates new Xano rows**; no upsert.
3. PATCH/DELETE infrastructure exists on server (`updateCampaignKpi`, `deleteCampaignKpi`, route handlers) but **zero client call sites** and no `lib/api/kpi.ts` wrappers.
4. **`id` is not populated on `ResolvedKPIRow`** during load or save; POST responses with new ids are discarded — create-then-PATCH requires new id propagation or a lookup pass keyed by `(mba, version, line_item_id)`.
5. **`campaignKpiPatchBodySchema` still omits `line_item_id`** post-2d-3; metrics are nullable via `kpiMetricNullable`.
6. Pacing duplicate warning uses key `(mba|version|line_item_id)`; repeated POST to the same version accumulates duplicates — notably on `[id]/edit` where KPI version does not follow PUT response.
7. Legacy empty-`line_item_id` rows still affect resolve (publisher/bid match) but not fan-out POST; fix-forward leaves orphans unless 2d-4 adds delete/backfill.
8. Writes are **sequential**; **partial failure** is possible with no rollback.
9. **No pacing KPI modal yet** (2d-7); 2d-4 should deliver shared sync helpers for editor + future modal.
10. **No save-flow tests** today; fan-out and resolve tests exist.

---

*Discovery only — no source modifications. Report not staged or committed.*
