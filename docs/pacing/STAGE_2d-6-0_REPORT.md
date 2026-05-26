# Stage 2d-6-0 — Discovery Report: KPIEditModal Host Coupling Inventory

**Branch:** `pacing-search-rebuild`  
**Date:** 2026-05-24  
**Scope:** Post-2d-5 (`fb718f4` CPV editable) + post-2d-4 (`ea370ed` sync save flow). Read-only inventory for Stage 2d-6 host abstraction.

---

## Pre-flight confirmation

| Step | Command / check | Result |
|------|-----------------|--------|
| 1 | `git branch --show-current` | `pacing-search-rebuild` |
| 2 | `git log --oneline \| Select-String "ea370ed"` | `ea370ed feat(kpi): server-side sync save flow for campaign_kpi` |
| 3 | `git log --oneline \| Select-String "fb718f4"` | `fb718f4 feat(kpi): make CPV editable in KPIEditModal` |
| 4 | `git grep -l "syncCampaignKpis"` | `app/api/kpis/campaign/sync/route.ts`, `lib/kpi/__tests__/syncCampaignKpis.test.ts`, `lib/kpi/campaignKpi.ts` |
| 5 | `git grep -n '"cpv"' components/kpis/KPIEditModal.tsx` | 9 hits (fieldErrors union L98, handleFieldChange union L112, CPV input cell L376–416) |
| 6 | `git status --short` | Untracked docs/charts files only; no staged changes |

---

## Section 1 — `KPIEditModal` external interface

### 1.1 Props type definition

```26:33:components/kpis/KPIEditModal.tsx
export interface KPIEditModalProps {
  open: boolean
  onClose: () => void
  kpiRows: ResolvedKPIRow[]
  onSave: (rows: ResolvedKPIRow[]) => void
  onReset: () => void
  isSaving?: boolean
}
```

| Prop | Type | Default |
|------|------|---------|
| `open` | `boolean` | required |
| `onClose` | `() => void` | required |
| `kpiRows` | `ResolvedKPIRow[]` | required |
| `onSave` | `(rows: ResolvedKPIRow[]) => void` | required |
| `onReset` | `() => void` | required |
| `isSaving` | `boolean` | optional; destructured without default (`88:95`) |

### 1.2 Each prop's role

| Prop | Role |
|------|------|
| `open` | Controls `<Dialog open={open}>` visibility (`153:157`). |
| `onClose` | Invoked when dialog closes via overlay/escape (`onOpenChange`), X button, Cancel, and after Save/Reset (`155:157`, `204:208`, `561:564`, `573:574`, `587:589`). |
| `kpiRows` | Source rows for seeding local state and deriving filter options; read when modal opens (`103:107`, `130:132`). Table body renders from local `editedRows`, not `kpiRows` directly. |
| `onSave` | Called with full `editedRows` array on “Save KPIs” click (`587:589`). Does not persist to API inside modal. |
| `onReset` | Called on “Reset to Auto” before close (`561:564`). |
| `isSaving` | Disables Reset/Cancel/Save and shows spinner on Save (`560`, `572`, `581`, `592:596`). |

### 1.3 Internal state that mirrors props

```96:107:components/kpis/KPIEditModal.tsx
  const [editedRows, setEditedRows] = React.useState<ResolvedKPIRow[]>([])
  const [fieldErrors, setFieldErrors] = React.useState<
    Record<number, Partial<Record<"ctr" | "vtr" | "cpv" | "conversion_rate" | "frequency", string>>>
  >({})
  const [filterMediaType, setFilterMediaType] = React.useState("all")
  const [showSourceFilter, setShowSourceFilter] = React.useState("all")

  React.useEffect(() => {
    if (!open) return
    setEditedRows([...kpiRows])
    setFieldErrors({})
  }, [open, kpiRows])
```

- **`editedRows`** — shallow copy of `kpiRows` when modal opens; all field edits mutate this.
- **`fieldErrors`** (2d-3) — per-row-index validation messages; cleared on open; blocks Save when non-empty (`581`).
- **`filterMediaType` / `showSourceFilter`** — modal-only UI filters; not seeded from props.
- **`cpv`** in `fieldErrors` union and `handleFieldChange` field union (2d-5) at `98`, `112`, with CPV input cell at `376:416`.

Field edits via `handleFieldChange` set `isManuallyEdited: true`, `source: "manual"`, and run `recalcRow` (`109:127`).

---

## Section 2 — Where the modal is invoked today

**Grep:** `KPIEditModal` appears only in `components/kpis/KPISection.tsx` (definition in `components/kpis/KPIEditModal.tsx`). No other render sites.

### 2.1 Call site: `KPISection` (sole render site)

```204:217:components/kpis/KPISection.tsx
      <KPIEditModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        kpiRows={kpiRows}
        onSave={(updatedRows) => {
          onSave(updatedRows)
          setIsModalOpen(false)
        }}
        onReset={() => {
          onReset()
          setIsModalOpen(false)
        }}
        isSaving={false}
      />
```

### 2.2 Prop value origins at call site

| Prop | Source |
|------|--------|
| `open` | `KPISection` local `isModalOpen` (`91`, set `true` at `127`, `170`; set `false` at `206`, `210`, `214`). |
| `onClose` | `() => setIsModalOpen(false)` — local to `KPISection`. |
| `kpiRows` | `KPISection` prop `kpiRows` — passed through unchanged from parent page state. |
| `onSave` | Wrapper calling `KPISection` prop `onSave(updatedRows)` then closing modal. |
| `onReset` | Wrapper calling `KPISection` prop `onReset()` then closing modal. |
| `isSaving` | Hard-coded `false` — never wired to parent save state. |

### 2.3 Outermost `onSave` behaviour

All three editor pages pass **`onSave={setKpiRows}`** — modal save only updates page-level `kpiRows` state in memory; no API call, no `markUnsavedChanges`, no fan-out.

Example (MBA edit):

```8228:8234:app/mediaplans/mba/[mba_number]/edit/page.tsx
                  <KPISection
                    kpiRows={kpiRows}
                    isLoading={isKPILoading}
                    onKPIChange={setKpiRows}
                    onSave={setKpiRows}
                    onReset={handleKPIReset}
                  />
```

**Note:** `onKPIChange={setKpiRows}` is passed but **`KPISection` does not destructure or use `onKPIChange`** (`75:90`) — dead prop at all three call sites.

Persistence to Xano happens later on main campaign save via `saveCampaignKpisFromRows` → `syncCampaignKPIs` (see Section 4).

---

## Section 3 — `KPISection` props and orchestration

### 3.1 Props interface

```75:82:components/kpis/KPISection.tsx
export interface KPISectionProps {
  kpiRows: ResolvedKPIRow[]
  isLoading: boolean
  onKPIChange?: (updatedRows: ResolvedKPIRow[]) => void
  onSave: (rows: ResolvedKPIRow[]) => void
  onReset: () => void
  className?: string
}
```

Destructured props omit `onKPIChange` (`84:90`).

### 3.2 How the modal is opened

Primary trigger — “Edit KPIs” / “KPIs” button:

```123:131:components/kpis/KPISection.tsx
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsModalOpen(true)}
            disabled={isLoading}
          >
            {kpiRows.length === 0 ? "KPIs" : "Edit KPIs"}
          </Button>
```

Secondary trigger — click any summary row:

```167:171:components/kpis/KPISection.tsx
              <div
                key={mediaType}
                className="flex cursor-pointer items-center justify-between rounded px-1 py-0.5 text-[11px] hover:bg-muted/30"
                onClick={() => setIsModalOpen(true)}
              >
```

External “Reset” button (does not open modal):

```132:141:components/kpis/KPISection.tsx
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReset}
            disabled={isLoading || kpiRows.length === 0}
            className="text-xs text-muted-foreground"
          >
            Reset
          </Button>
```

### 3.3 Data between `KPISection` and modal

**To modal:** `kpiRows` passed **unchanged** (`207`).

**For summary UI only (not passed to modal):** `KPISection` transforms `kpiRows` into:

- `channelCount` — unique media types (`93:96`)
- `rowsByMediaType` — group-by map (`98:107`)
- `summariseHeadlineMetric(mediaType, rows)` per channel (`51:73`, `165`)

Modal orchestration owns `isModalOpen` locally; parent pages have no visibility into open/close state.

---

## Section 4 — Parent page coupling

### 4.1 `app/mediaplans/mba/[mba_number]/edit/page.tsx`

#### State variables (KPI-related)

```1778:1786:app/mediaplans/mba/[mba_number]/edit/page.tsx
  // --- KPI state (Stage 2) ---
  const [kpiRows, setKpiRows] = useState<ResolvedKPIRow[]>([])
  const [publisherKPIs, setPublisherKPIs] = useState<PublisherKPI[]>([])
  const [clientKPIs, setClientKPIs] = useState<ClientKPI[]>([])
  const [savedCampaignKPIs, setSavedCampaignKPIs] = useState<CampaignKPI[]>([])
  const [isKPILoading, setIsKPILoading] = useState(false)
  const [kpiTrigger, setKpiTrigger] = useState(0)
  const kpiRebuildTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const kpiRowsRef = useRef<ResolvedKPIRow[]>([])
```

#### Effects that populate KPI state

| Effect | Lines | Purpose |
|--------|-------|---------|
| Load publisher KPIs on mount | `1874:1884` | `getPublisherKPIs()` → `setPublisherKPIs`, bump `kpiTrigger` |
| Watch client name, load client KPIs | `2019:2031` | `getClientKPIs(kpiClientNameWatch)` → `setClientKPIs`, bump `kpiTrigger` |
| Load saved campaign KPIs when MBA + version known | `2033:2049` | `getCampaignKPIs(mbaNumber, version)` → `setSavedCampaignKPIs`; sets `isKPILoading` |
| Sync `kpiRowsRef` | `2051:2054` | Keeps ref current for merge inside debounced rebuild |
| Debounced rebuild | `2056:2161` | `resolveAllKPIs(...)` → `setKpiRows(mergeManualKpiOverrides(...))` |

Rebuild core (`2074:2107`):

```2074:2107:app/mediaplans/mba/[mba_number]/edit/page.tsx
      const resolved = resolveAllKPIs({
        mediaItemsByType: buildKpiLineItemsByMediaType({ ... }),
        clientName: fv.mp_clientname,
        mbaNumber: fv.mbanumber ?? mbaNumber ?? "",
        versionNumber: selectedVersionNumber ?? parseInt(String(fv.mp_plannumber ?? "1"), 10),
        campaignName: fv.mp_campaignname ?? "",
        publisherKPIs,
        clientKPIs,
        savedCampaignKPIs,
        publishers: billingPublishers,
      })
      setKpiRows(mergeManualKpiOverrides(resolved, kpiRowsRef.current))
```

#### `<KPISection>` usage

```8228:8234:app/mediaplans/mba/[mba_number]/edit/page.tsx
                  <KPISection
                    kpiRows={kpiRows}
                    isLoading={isKPILoading}
                    onKPIChange={setKpiRows}
                    onSave={setKpiRows}
                    onReset={handleKPIReset}
                  />
```

#### Reset handler

```4723:4728:app/mediaplans/mba/[mba_number]/edit/page.tsx
  const handleKPIReset = useCallback(() => {
    setSavedCampaignKPIs([])
    // clearing savedCampaignKPIs triggers the rebuild effect which re-resolves
    // from publisher/client tables only
  }, [])
```

#### Save chain

After media-plan version PUT succeeds in `handleSaveAll`:

```4917:4960:app/mediaplans/mba/[mba_number]/edit/page.tsx
      if (kpiRows.length > 0 && typeof numericSavedVersion === "number" && Number.isFinite(numericSavedVersion)) {
        updateSaveStatus("Campaign KPIs", "pending")
        const lineItemsByMediaType = buildKpiLineItemsByMediaType({ ... })
        const kpiPayload: CampaignKPI[] = fanOutKpiPayload(
          kpiRows,
          { mp_client_name: formValues.mp_clientname, mba_number: mbaNumber, version_number: numericSavedVersion, campaign_name: formValues.mp_campaignname },
          lineItemsByMediaType,
        )
        saveCampaignKpisFromRows(kpiRows, kpiPayload).then((result) => { ... })
      }
```

**2d-4 verification — `saveCampaignKpisFromRows` calls sync:**

```14:40:lib/kpi/saveCampaignKpis.ts
export async function saveCampaignKpisFromRows(
  kpiRows: ResolvedKPIRow[],
  payload: CampaignKPI[],
): Promise<CampaignKpiSaveResult> {
  ...
  try {
    await syncCampaignKPIs(payload)
    return { status: "success" }
  } catch (err) { ... }
}
```

Client wrapper:

```62:69:lib/api/kpi.ts
export async function syncCampaignKPIs(kpis: CampaignKPI[]): Promise<CampaignKPI[]> {
  const response = await fetch("/api/kpis/campaign/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(kpis),
  })
  ...
}
```

Server implementation:

```68:70:lib/kpi/campaignKpi.ts
export async function syncCampaignKpis(
  inputs: CampaignKpiInput[],
): Promise<CampaignKPI[]> {
```

Route: `app/api/kpis/campaign/sync/route.ts` delegates to `syncCampaignKpis`.

---

### 4.2 `app/mediaplans/create/page.tsx`

#### State variables (KPI-related)

```674:682:app/mediaplans/create/page.tsx
  const [kpiRows, setKpiRows] = useState<ResolvedKPIRow[]>([])
  const [publisherKPIs, setPublisherKPIs] = useState<PublisherKPI[]>([])
  const [clientKPIs, setClientKPIs] = useState<ClientKPI[]>([])
  const [savedCampaignKPIs, setSavedCampaignKPIs] = useState<CampaignKPI[]>([])
  const [kpiPublishers, setKpiPublishers] = useState<Publisher[]>([])
  const [isKPILoading, setIsKPILoading] = useState(false)
  const [kpiTrigger, setKpiTrigger] = useState(0)
  const kpiRebuildTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const kpiRowsRef = useRef<ResolvedKPIRow[]>([])
```

#### Effects that populate KPI state

| Effect | Lines | Purpose |
|--------|-------|---------|
| Sync `kpiRowsRef` | `728:730` | Ref for merge |
| Load publishers list for resolve | `732:745` | `fetch("/api/publishers")` → `setKpiPublishers` |
| Debounced rebuild | `877:992` | Same pattern as MBA edit; uses `mp_client_name`, `kpiPublishers` |
| Load publisher KPIs on mount | `2815:2825` | `getPublisherKPIs()` → `setPublisherKPIs`, bump `kpiTrigger` |
| Load client KPIs on client select | `2928:2934` | `getClientKPIs(selectedClient.mp_client_name)` → `setClientKPIs`, bump `kpiTrigger` |

**Delta vs MBA edit:** Create page **never calls `getCampaignKPIs`** — `savedCampaignKPIs` stays `[]` until user saves a campaign. **`isKPILoading` is never set to `true`** anywhere in file (only declared and passed to `KPISection`).

#### `<KPISection>` usage

```6121:6127:app/mediaplans/create/page.tsx
                  <KPISection
                    kpiRows={kpiRows}
                    isLoading={isKPILoading}
                    onKPIChange={setKpiRows}
                    onSave={setKpiRows}
                    onReset={handleKPIReset}
                  />
```

#### Reset handler

```4240:4244:app/mediaplans/create/page.tsx
  const handleKPIReset = useCallback(() => {
    setSavedCampaignKPIs([])
    // clearing savedCampaignKPIs triggers the rebuild effect which re-resolves
    // from publisher/client tables only
  }, [])
```

#### Save chain

After `createMediaPlanVersion` in `handleSaveMediaPlanVersion`:

```4513:4557:app/mediaplans/create/page.tsx
      if (kpiRows.length > 0) {
        updateSaveStatus("Campaign KPIs", "pending")
        const lineItemsByMediaType = buildKpiLineItemsByMediaType({ ... })
        const kpiPayload: CampaignKPI[] = fanOutKpiPayload(kpiRows, { ... }, lineItemsByMediaType)
        saveCampaignKpisFromRows(kpiRows, kpiPayload).then((result) => { ... })
      }
```

Same `saveCampaignKpisFromRows` → `syncCampaignKPIs` chain as MBA edit.

---

### 4.3 `app/mediaplans/[id]/edit/page.tsx` (deprecated, still in codebase)

#### State variables (KPI-related)

```517:524:app/mediaplans/[id]/edit/page.tsx
  const [kpiRows, setKpiRows] = useState<ResolvedKPIRow[]>([])
  const [publisherKPIs, setPublisherKPIs] = useState<PublisherKPI[]>([])
  const [clientKPIs, setClientKPIs] = useState<ClientKPI[]>([])
  const [savedCampaignKPIs, setSavedCampaignKPIs] = useState<CampaignKPI[]>([])
  const [kpiPublishers, setKpiPublishers] = useState<Publisher[]>([])
  const [isKPILoading, setIsKPILoading] = useState(false)
  const kpiRebuildTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const kpiRowsRef = useRef<ResolvedKPIRow[]>([])
```

#### Effects that populate KPI state

| Effect | Lines | Purpose |
|--------|-------|---------|
| Sync `kpiRowsRef` | `617:619` | Ref for merge |
| Load publishers | `621:634` | `fetch("/api/publishers")` → `setKpiPublishers` |
| Debounced rebuild | `683:724+` | `resolveAllKPIs` with raw media line item arrays (no export wrapper) |
| Load publisher KPIs | `1075:1077` | `getPublisherKPIs().then(setPublisherKPIs)` |
| Load client KPIs on client select | `1097:1103` | `getClientKPIs(clientKpiKey)` |
| Load saved campaign KPIs inside container fetch | `1159:1165` | `getCampaignKPIs(mediaPlan.mba_number, mediaPlan.version_number)` → `setSavedCampaignKPIs` (no `setIsKPILoading`) |

#### `<KPISection>` usage

```3388:3394:app/mediaplans/[id]/edit/page.tsx
                    <KPISection
                      kpiRows={kpiRows}
                      isLoading={isKPILoading}
                      onKPIChange={setKpiRows}
                      onSave={setKpiRows}
                      onReset={handleKPIReset}
                    />
```

#### Reset handler

```1196:1198:app/mediaplans/[id]/edit/page.tsx
  const handleKPIReset = useCallback(() => {
    setSavedCampaignKPIs([])
  }, [])
```

#### Save chain

After campaign PUT succeeds:

```2001:2039:app/mediaplans/[id]/edit/page.tsx
      if (kpiRows.length > 0) {
        const fv = form.getValues()
        const lineItemsByMediaType = buildKpiLineItemsByMediaType({ ... })
        const kpiPayload: CampaignKPI[] = fanOutKpiPayload(
          kpiRows,
          { mp_client_name: fv.mp_clientname, mba_number: fv.mbanumber, version_number: mediaPlan?.version_number ?? 1, campaign_name: fv.mp_campaignname },
          lineItemsByMediaType,
        )
        saveCampaignKpisFromRows(kpiRows, kpiPayload).then((result) => { ... })
      }
```

**Caveat:** KPI save uses `mediaPlan?.version_number` from pre-PUT state, not the new version from PUT response (unlike MBA edit which uses `numericSavedVersion` from response).

---

## Section 5 — Data flow when user opens the modal

1. **User clicks “Edit KPIs”** (`KPISection.tsx:127`) or a summary row (`170`) → `setIsModalOpen(true)`.

2. **Modal opens.** Seeding effect runs:

```103:107:components/kpis/KPIEditModal.tsx
  React.useEffect(() => {
    if (!open) return
    setEditedRows([...kpiRows])
    setFieldErrors({})
  }, [open, kpiRows])
```

   Page `kpiRows` were previously built by debounced `resolveAllKPIs` waterfall (publisher → client → saved → default) with `mergeManualKpiOverrides` preserving prior manual edits by `lineItemId`.

3. **User edits a field** (blur on CTR/VTR/CPV/Conv/Freq). Local `editedRows` updates; `handleFieldChange` sets `isManuallyEdited: true`, `source: "manual"`, runs `recalcRow` (`109:127`). Parent `kpiRows` unchanged until Save.

4. **Validation (2d-3).** Blur handlers set `fieldErrors` for non-positive values; Save disabled when `Object.keys(fieldErrors).length > 0` (`581`). CPV uses currency parse (`382:409`); percent fields use `parsePercentHeuristic`.

5. **User clicks “Save KPIs”.** Modal calls `onSave(editedRows)` then `onClose()` (`587:589`). `KPISection` wrapper also calls `setIsModalOpen(false)` (`208:210`) — redundant second close. Outermost handler is `setKpiRows` on the page — **in-memory only**, no Xano.

6. **Modal closes.** Page `kpiRows` now holds edited rows. Debounced rebuild may re-run if line items or KPI layers change; `mergeManualKpiOverrides` preserves manual metric values by `lineItemId` (`lib/kpi/recalc.ts:28:46`).

7. **User clicks Save Campaign (main button).** Page builds `fanOutKpiPayload` from current `kpiRows` + line items, then `saveCampaignKpisFromRows` → `syncCampaignKPIs` (2d-4 PATCH-or-POST by `mba_number|version_number|line_item_id`). KPI persistence is **non-blocking** (`.then` on promise; errors surfaced in save-status UI on MBA/create, console.warn only on `[id]/edit`).

---

## Section 6 — What the modal reads vs writes

| Name | Classification | Notes |
|------|----------------|-------|
| `open` | Read-only input | Host/`KPISection` controls visibility |
| `kpiRows` | Read-only input (seed) | Copied to `editedRows` on open |
| `isSaving` | Read-only input | Currently always `false` from `KPISection` |
| `onClose` | Callback (write to host open state) | Host closes dialog |
| `onSave` | Callback (write edited data out) | Passes full `editedRows` array |
| `onReset` | Callback (write to host saved layer) | Clears saved tier in pages via `setSavedCampaignKPIs([])` |
| `editedRows` | Modal-only state | Working copy of all rows |
| `fieldErrors` | Modal-only state (2d-3) | Per-row validation; includes `cpv` (2d-5) |
| `filterMediaType` | Modal-only state | UI filter |
| `showSourceFilter` | Modal-only state | UI filter |

**Read-only display fields in table (not directly edited):** `media_type`, `publisher`, `lineItemLabel`, `buyType`, `spend`, `deliverables`, `calculatedClicks`, `calculatedViews`, `calculatedReach`, `source` badge.

**Read-write via blur inputs:** `ctr`, `vtr`, `cpv`, `conversion_rate`, `frequency`.

---

## Section 7 — Hidden dependencies

**Grep command:**

```powershell
Select-String -Path components/kpis/KPIEditModal.tsx -Pattern 'from "@/lib/kpi|from "@/lib/api|from "@/lib/xano|import.*resolve|import.*fanOut|import.*sync'
```

**Matches:**

```4:7:components/kpis/KPIEditModal.tsx
import type { ResolvedKPIRow } from "@/lib/kpi/types"
import { MEDIA_TYPE_LABELS } from "@/lib/media/mediaTypes"
import { recalcRow } from "@/lib/kpi/recalc"
import { formatPercentForInput, parsePercentHeuristic } from "@/lib/kpi/metrics"
```

Also imports UI primitives (`@/components/ui/*`), `cn` from `@/lib/utils`, `lucide-react`.

| Import | Use | Pure / stateful |
|--------|-----|-----------------|
| `ResolvedKPIRow` (type) | Props and local state typing | Pure (type only) |
| `MEDIA_TYPE_LABELS` | Group headers and filter labels | Pure lookup |
| `recalcRow` | Recompute derived columns after metric edit | Pure function |
| `formatPercentForInput` / `parsePercentHeuristic` | Percent input display/parse + validation | Pure functions |

**No `@/lib/api`, `@/lib/xano`, `resolve`, `fanOut`, or `sync` imports.**

**Conclusion:** `KPIEditModal` has **no load-bearing direct Xano/API calls**. Save tooltip defers persistence: “KPIs will be saved to Xano when you save the campaign” (`582:586`).

---

## Section 8 — What the pacing host needs that doesn't exist yet

| Need | Already exists? | Evidence | Minimal addition for pacing host |
|------|-----------------|----------|----------------------------------|
| **Loading KPIs for one line item** | **Partial** | Pacing grid loads all `campaign_kpi` for MBA\|version pairs in bulk (`fetchSearchPacingCampaignRows.ts:334:367`), joins to rows by `mba\|version\|lineItemId`. Editor loads all via `getCampaignKPIs(mba, version)` then resolves all line items. **No dedicated single-line-item fetch or resolve.** | Host method: given `(mba, version, lineItemId)`, filter fetched/synced rows or call `getCampaignKPIs` and pick one; optionally run resolve waterfall for a single line item. |
| **Empty state with “Create targets” button** | **No (wrong copy)** | Modal: “No KPI rows yet. Add line items…” (`214:218`). `KPISection`: “Add line items to generate KPIs” (`151:154`). No “Create targets” CTA anywhere. | Pacing host empty state + button that opens modal with one synthetic/resolved row and triggers immediate sync on save. |
| **Direct save via `syncCampaignKpis`** | **Yes (2d-4)** | Server: `syncCampaignKpis` (`lib/kpi/campaignKpi.ts:68:70`). Client: `syncCampaignKPIs` (`lib/api/kpi.ts:62:69`). Wrapped by `saveCampaignKpisFromRows` (`lib/kpi/saveCampaignKpis.ts:35`). Route: `app/api/kpis/campaign/sync/route.ts`. | Pacing host calls `syncCampaignKPIs` (or thin wrapper) on modal save instead of deferring to campaign save. Must fan-out single row to `CampaignKPI` payload with `line_item_id`. |
| **Admin gating** | **No in KPI UI** | No admin check in `KPIEditModal` or `KPISection`. Admin role available in pacing shell (`app/pacing/(shell)/layout.tsx:18:22`, `PacingShell` `isAdmin` prop). | Pacing host wraps edit entry with admin check; media-plan editor remains ungated. |

**Additional gap (from 2d-4):** Editor state does not retain Xano `campaign_kpi.id` on `ResolvedKPIRow`. Sync still works via natural key PATCH, but pacing “Create targets” flow may need to store returned `id` after first POST for subsequent edits.

---

## Section 9 — Refactor risk surface

| Change | Risk | Complexity |
|--------|------|------------|
| **1. Changing `KPIEditModal` prop interface** | **High** — single render site (`KPISection`), but three page consumers depend on `KPISection` props chain. Altering `onSave`/`onReset` semantics breaks manual-override merge and reset waterfall. Adding row-scoping props affects “open with all rows” assumption. | Medium — modal + section + up to 3 pages |
| **2. Adding `MediaPlanKpiHost` (and pacing host)** | **Medium** — must encapsulate ~150 lines of duplicated KPI state/effects per page without breaking debounced rebuild, merge, and deferred save. | Medium–high — new host module(s) + page wiring |
| **3. Touching `KPISection`** | **Low–medium** — summary transforms are local; modal gets passthrough rows. Risk if host replaces props without updating hard-coded `isSaving={false}` and local modal open state. Dead `onKPIChange` prop adds confusion. | Low for passthrough; medium if host owns modal |
| **4. `ResolvedKPIRow` shape changes** | **Low** — likely unnecessary for host abstraction; type already includes CPV and manual flags. Wider blast radius if `line_item_id` / `id` retention added. | Low unless persistence metadata added |

---

## Section 10 — Open questions for Luke

1. **Host interface shape** — class, plain object with methods, or React context provider? Each affects where `kpiRows` state lives and how pacing row actions obtain save/reset/load.

2. **Single host or two?** — One shared `KpiHost` for media-plan + pacing, or separate `MediaPlanKpiHost` / `PacingKpiHost` implementations behind a common interface?

3. **State synchronisation** — Media-plan host currently must update page `kpiRows` on modal save (`setKpiRows`) so campaign save and `mergeManualKpiOverrides` see edits. Pacing host would likely persist immediately via `syncCampaignKPIs`. Does media-plan host need any extra post-save step beyond `setKpiRows` (e.g. refresh `savedCampaignKPIs`, mark unsaved)?

4. **Modal opening semantics** — Current: open with **all** resolved rows for the campaign. Pacing: open with **one** line item’s row (or empty create flow). Should `KPIEditModal` accept a filtered `kpiRows` subset, or should the host pre-filter and the modal stay agnostic?

5. **Should `isSaving` be wired?** — `KPISection` hard-codes `isSaving={false}` (`216`). Should the host pass through save-in-flight state (especially for pacing immediate sync)?

6. **Dead `onKPIChange` prop** — Remove from `KPISectionProps` and all three pages, or wire it for host callback duplication with `onSave`?

7. **`[id]/edit` inclusion** — Deprecated page still has KPI wiring with version mismatch on save (`2030` uses stale `mediaPlan.version_number`). Include in 2d-6 host extraction or leave as-is?

8. **Retaining `campaign_kpi.id` after sync** — Pacing direct-save may need PATCH on subsequent edits. Should host/update path merge sync response IDs back into local row state?

---

## Appendix — Grep inventory

```text
git grep KPIEditModal -- '*.tsx' '*.ts'
  → components/kpis/KPIEditModal.tsx (definition)
  → components/kpis/KPISection.tsx (sole render)

git grep KPISection -- '*.tsx' '*.ts'
  → app/mediaplans/mba/[mba_number]/edit/page.tsx
  → app/mediaplans/create/page.tsx
  → app/mediaplans/[id]/edit/page.tsx
  → components/kpis/KPISection.tsx

git grep -l syncCampaignKpis
  → app/api/kpis/campaign/sync/route.ts
  → lib/kpi/__tests__/syncCampaignKpis.test.ts
  → lib/kpi/campaignKpi.ts
```
