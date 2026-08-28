# DISCOVERY — Production version filter & edit-page hydration

**Scope:** Read-only trace of `filterLineItemsByPlanNumber`, production route fallback, edit-page load chain, and `ProductionContainer` hydration.  
**Located via:** `Select-String` / ripgrep for `filterLineItemsByPlanNumber` and `getVersionNumberForMBA` → `lib/api/mediaPlanVersionHelper.ts`.

---

## 1. Full source — `lib/api/mediaPlanVersionHelper.ts`

```typescript
import axios from 'axios';
import { xanoUrl } from '@/lib/api/xano';
import { sortLineItemsByLineItemNumber } from '@/lib/mediaplan/lineItemIds';

/**
 * Gets the version_number from media_plan_versions table for a given mba_number
 * This ensures we use the correct version_number that matches the mp_plannumber
 */
export async function getVersionNumberForMBA(
  mbaNumber: string,
  mpPlanNumber?: string | null,
  mediaPlanVersion?: string | null
): Promise<string | null> {
  const normalize = (value: any) => String(value ?? '').trim().toLowerCase()
  const requestedNormalized = normalize(mbaNumber)
  
  // If mp_plannumber is provided directly, use it
  if (mpPlanNumber) {
    return mpPlanNumber;
  }
  
  // If media_plan_version is provided, use it
  if (mediaPlanVersion) {
    return mediaPlanVersion;
  }
  
  // Need to fetch the latest version_number from media_plan_versions table
  try {
    // First get the master data to find the latest version number
    const masterResponse = await axios.get(
      `${xanoUrl("media_plan_master", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?mba_number=${encodeURIComponent(mbaNumber)}`
    );
    let masterData: any = null;
    
    if (Array.isArray(masterResponse.data)) {
      masterData = masterResponse.data.find((item: any) => normalize(item?.mba_number) === requestedNormalized) || null;
    } else if (masterResponse.data && typeof masterResponse.data === 'object') {
      masterData = normalize((masterResponse.data as any).mba_number) === requestedNormalized
        ? masterResponse.data
        : null;
    }
    
    if (!masterData) {
      throw new Error(`Media plan master not found for MBA number ${mbaNumber}`);
    }
    
    if (masterData.version_number === undefined || masterData.version_number === null) {
      throw new Error(`Media plan master for MBA ${mbaNumber} is missing version_number`);
    }
    
    // Get the specific version data
    const versionResponse = await axios.get(
      `${xanoUrl("media_plan_versions", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?media_plan_master_id=${masterData.id}&version_number=${masterData.version_number}`
    );
    
    let versionData: any = null;
    if (Array.isArray(versionResponse.data)) {
      versionData = versionResponse.data.find((item: any) => 
        item.media_plan_master_id === masterData.id && 
        item.version_number === masterData.version_number
      );
    } else {
      versionData = versionResponse.data;
    }
    
    if (versionData && versionData.version_number !== undefined && versionData.version_number !== null) {
      return String(versionData.version_number);
    }
    
    // Fallback to the master's version_number if versionData is missing the field
    return String(masterData.version_number);
  } catch (error) {
    console.error(
      "Error fetching version number from media_plan_versions for MBA",
      mbaNumber,
      error
    );
    throw error;
  }
  
  return null;
}

/**
 * Filters line items to ensure they match both mba_number AND (version_number OR mp_plannumber)
 * This ensures we check ALL entries and match items regardless of which version field is used
 */
export function filterLineItemsByPlanNumber(
  data: any[],
  mbaNumber: string,
  versionNumber: string,
  mediaType: string
): any[] {
  const requestedVersion = String(versionNumber ?? "").trim()
  const requestedMba = String(mbaNumber ?? "").trim()

  // Normalize version number for comparison (handle both string and number)
  const filteredData = data.filter((item: any) => {
    const itemMba = String(item.mba_number ?? item.mbaNumber ?? "").trim()

    const versionCandidates = [
      item.media_plan_version,
      item.media_plan_version_number,
      item.version_number,
      item.versionNumber,
      item.mp_plannumber,
      item.mp_plan_number,
    ]

    const versionMatch = versionCandidates.some((value) => String(value ?? "").trim() === requestedVersion)
    const mbaMatch = itemMba === requestedMba

    return versionMatch && mbaMatch
  })

  if (filteredData.length !== data.length) {
    // Avoid per-item log spam when callers accidentally over-fetch many historic versions.
    console.warn(
      `[${mediaType}] Warning: ${data.length - filteredData.length} items were filtered out. Only items matching both mba_number and version are returned.`
    )
    console.log(
      `[${mediaType}] Kept ${filteredData.length} items matching mba_number=${requestedMba} and version=${requestedVersion}`
    )
  }

  return sortLineItemsByLineItemNumber(filteredData);
}
```

---

## 2. `filterLineItemsByPlanNumber` — precise behaviour

### Row fields inspected

| Field | Role |
|-------|------|
| `mba_number` / `mbaNumber` | MBA match (required) |
| `media_plan_version` | Version candidate |
| `media_plan_version_number` | Version candidate |
| `version_number` | Version candidate |
| `versionNumber` | Version candidate |
| `mp_plannumber` | Version candidate |
| `mp_plan_number` | Version candidate |

**Not inspected:** `line_item`, `line_item_id`, or any burst/content fields.

### Match logic

- A row is **kept** only when **both**:
  1. `String(item.mba_number ?? item.mbaNumber ?? "").trim() === String(mbaNumber).trim()`
  2. **At least one** version candidate satisfies `String(value ?? "").trim() === String(versionNumber).trim()`

- Version matching is **OR across the six candidates**, not AND. Any single field equalling the requested version is enough.

### Missing / null / empty version fields

For each candidate, the comparison is `String(value ?? "").trim() === requestedVersion`.

- `null`, `undefined`, or `""` → normalizes to `""`.
- Unless `requestedVersion` is also `""`, **empty version fields never match**.
- Therefore a row with correct `mba_number` but **all six version fields missing/null/empty is dropped** by this filter.

There is **no** “keep rows with missing version metadata” branch inside `filterLineItemsByPlanNumber` itself.

### MBA missing / empty

If `mba_number` and `mbaNumber` are both missing/null, `itemMba` is `""`. The row is kept only if `requestedMba` is also `""` **and** a version field matches — otherwise **dropped**.

### Post-filter behaviour

- Logs a warning when any rows were removed.
- Returns `sortLineItemsByLineItemNumber(filteredData)` (sort by `line_item` / `line_item_id` suffix, not by version).

### Internal fallback inside the helper

**None.** No MBA-wide fallback, no “return all if zero matches”. Callers own that (production route does — see §5).

---

## 3. `getVersionNumberForMBA` — resolution order

1. If `mpPlanNumber` is truthy → return it as-is (string).
2. Else if `mediaPlanVersion` is truthy → return it as-is.
3. Else fetch `media_plan_master` by MBA, then `media_plan_versions` for `masterData.id` + `masterData.version_number`.
4. Return `String(versionData.version_number)` or fallback `String(masterData.version_number)`.
5. On error → **throws** (production route returns 400).

Edit page and browser fetch pass `mp_plannumber` / `media_plan_version` from the active version, so the Xano lookup path is usually skipped on production load.

---

## 4. `claimLineNumber` — full quote (`lib/mediaplan/lineItemOrder.ts`)

`claimLineNumber` is **module-private** (not exported). Full function:

```typescript
/**
 * Resolve a claimable line number: explicit number field first, else the
 * number embedded in the deterministic line_item_id (e.g. "MBA1DA5" -> 5).
 * Returns null when neither yields a positive integer.
 */
function claimLineNumber(item: LineItemWithIdentity): number | null {
  const n = pickLineItemNumber(item, 0)
  if (n > 0) return n
  for (const id of [item.line_item_id, item.lineItemId]) {
    if (id == null) continue
    const parsed = parseLineNumberFromLineItemId(String(id))
    if (parsed && parsed > 0) return parsed
  }
  return null
}
```

### What it extracts from

1. **`pickLineItemNumber(item, 0)`** — first positive finite number among:
   - `line_item`, `lineItem`, `lineitem`, `lineItemNumber`
   - Fallback `0` means “no explicit number” if all are missing/invalid/≤0
2. If that fails, **`line_item_id` / `lineItemId`** → `parseLineNumberFromLineItemId` (media-type suffix or trailing digits).

Returns `null` if nothing yields a positive integer.

### Duplicate numbers (`assignStableLineItemNumbers` consumer)

`claimLineNumber` is used in pass 1 of `assignStableLineItemNumbers`:

```typescript
  const claimed: Array<number | null> = items.map((item) => {
    const n = claimLineNumber(item)
    if (n != null && !used.has(n)) {
      used.add(n)
      return n
    }
    return null
  })
```

- **First occurrence** of a given number **wins** and keeps that number.
- Later items with the **same** claimed number get `null` in pass 1 → pass 2 assigns the **next integer strictly above the current max** (never reuses gaps).

---

## 5. `buildLineItemId` — full quote (`lib/mediaplan/lineItemIds.ts`)

```typescript
/**
 * Build the deterministic line item ID string.
 */
export function buildLineItemId(
  mbaNumber: string | undefined,
  mediaTypeCode: string,
  lineItemNumber: number
): string {
  const base = normalizeMbaNumber(mbaNumber, mediaTypeCode);
  const number = Math.max(1, Math.trunc(lineItemNumber));
  return `${base}${mediaTypeCode}${number}`;
}
```

Production uses `MEDIA_TYPE_ID_CODES.production` → `"PROD"`. Example: MBA `glenda007`, line 3 → `glenda007PROD3`.

Supporting helper used by `claimLineNumber`:

```typescript
export function pickLineItemNumber(candidate: any, fallbackNumber: number): number {
  const possibleNumbers = [
    candidate?.line_item,
    candidate?.lineItem,
    candidate?.lineitem,
    candidate?.lineItemNumber,
  ];

  for (const value of possibleNumbers) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) {
      return num;
    }
  }

  return fallbackNumber;
}
```

---

## 6. Production API route — server filter + MBA fallback

`app/api/media_plans/production/route.ts` (relevant excerpt):

```typescript
    const filteredData = filterLineItemsByPlanNumber(data, mbaNumber, versionNumber, "PRODUCTION");

    console.log(`[PRODUCTION] Final filtered data count: ${filteredData.length} (from ${data.length} total items)`);

    // If version metadata is missing in Xano, fall back to returning all rows for the MBA
    if (filteredData.length === 0) {
      const mbaMatches = data.filter((item: any) => String(item?.mba_number || "").trim() === mbaNumber);
      return NextResponse.json(mbaMatches);
    }

    return NextResponse.json(filteredData);
```

**Note in route:** Xano `media_plan_production` filters by `mba_number` only; version query params are forward-compat. All historic MBA rows can be returned from Xano.

**Server fallback rule:** Only when `filterLineItemsByPlanNumber` returns **0 rows**, return **all** rows whose `mba_number` trims equal `mbaNumber` (version fields **not** re-checked).

---

## 7. Edit-page hydration chain (production)

### 7.1 Fetch — `getProductionLineItemsByMBA` (`lib/api.ts`)

Browser path uses `fetchLineItemsFromApi` → `GET /api/media_plans/production?mba_number=…&media_plan_version=…&mp_plannumber=…&version_number=…`.

Server path (SSR): same query params on `/api/media_plans/production`.

Response is already server-filtered (with MBA fallback above). Browser also runs `sortLineItemsByLineItemNumber` on the JSON array.

### 7.2 `loadSingleMediaTypeLineItems` — sets `productionLineItems`

`app/mediaplans/mba/[mba_number]/edit/page.tsx`:

```typescript
  const [productionLineItems, setProductionLineItems] = useState<any[]>([])

  const lineItemLoaderConfig = useMemo(
    () => ({
        // ...
        mp_production: { fetchFn: getProductionLineItemsByMBA, setter: setProductionLineItems },
        // ...
      }),
    []
  )

  const loadSingleMediaTypeLineItems = useCallback(
    async (flag: MediaTypeKey, versionToUse: number, timeoutMs?: number) => {
      const config = lineItemLoaderConfig[flag]
      if (!config) return

      const { fetchFn, setter } = config
      const items = await fetchFn(mbaNumber, versionToUse, timeoutMs)
      const filteredItems = filterLineItemsByPlanNumber(
        items,
        mbaNumber,
        versionToUse.toString(),
        flag
      )
      const processedItems = filteredItems.map((item: any) => ({
        ...item,
        bursts_json: item.bursts_json || item.bursts || null,
      }))
      setter(processedItems)
      if (flag === "mp_production" && processedItems.length > 0 && !form.getValues("mp_production")) {
        form.setValue("mp_production", true, { shouldDirty: false })
      }
    },
    [form, lineItemLoaderConfig, mbaNumber]
  )
```

Parallel initial load (`useEffect` when `loadPhase === "loadingLineItems"`) duplicates the same pattern: `fetchFn` → `filterLineItemsByPlanNumber` → `bursts_json` normalize → `setter` → optional `mp_production` auto-enable.

**Client-side filter is a second pass** on whatever the API returned (including MBA-fallback payloads).

### 7.3 `ProductionContainer` prop wiring

```typescript
                      {medium.name === "mp_production" && (
                        <Suspense fallback={<MediaContainerSuspenseFallback label="Production" />}>
                          <ProductionContainer
                            clientId={selectedClientId}
                            onTotalMediaChange={handleProductionTotalChange}
                            onBurstsChange={handleProductionBurstsChange}
                            onInvestmentChange={(rows) => handleInvestmentChange("production", rows)}
                            onLineItemsChange={handleProductionItemsChange}
                            onMediaLineItemsChange={handleProductionMediaLineItemsChange}
                            campaignStartDate={campaignStartDate}
                            campaignEndDate={campaignEndDate}
                            campaignBudget={campaignBudget}
                            campaignId={mbaNumber}
                            mediaTypes={mediaTypes.map((m) => ({ value: m.label, label: m.label }))}
                            initialLineItems={productionLineItems}
                          />
                        </Suspense>
                      )}
```

### 7.4 `useStableHydration` → form state

`hooks/useStableHydration.ts`:

```typescript
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

`ProductionContainer` hydrate callback (maps API rows → `lineItems` form shape):

```typescript
  useStableHydration(
    initialLineItems,
    (items) => {
      try {
        const normalized = items.map((item: any, idx: number) => {
          // ... bursts_json / bursts parsing ...

          return {
            mediaType: item.mediaType || item.platform || item.media_type || "",
            publisher: item.publisher || item.network || "",
            description: item.description || item.creative || "",
            market: item.market || "",
            lineItemId:
              item.line_item_id ||
              item.lineItemId ||
              buildLineItemId(mbaNumber, MEDIA_TYPE_ID_CODES.production, idx + 1),
            bursts: bursts.length > 0 ? bursts : [makeDefaultBurst()],
          }
        })
        form.reset({
          lineItems: stampBurstReactKeys(normalized),
        })
      } catch (err) {
        console.warn("[ProductionContainer] Failed to hydrate initial line items", err)
      }
    },
    productionExpertModalOpenRef,
  )

  const watchedLineItems = useWatch({
    control: form.control,
    name: "lineItems",
  })
```

### 7.5 Do persisted `line_item` / `line_item_id` survive into `watchedLineItems`?

| Field | Survives into form `lineItems[]`? | Notes |
|-------|-----------------------------------|-------|
| `line_item_id` / `lineItemId` | **Partially** | Copied to form field **`lineItemId`** only (camelCase). |
| `line_item` / `lineItem` | **No** | Not copied into the normalized hydrate object. |

After hydrate, `watchedLineItems` entries have `lineItemId` but **no** `line_item` property unless something else sets it later.

**Downstream numbering** — `apiLineItems` memo applies stable IDs before persist/export:

```typescript
  const apiLineItems = useMemo(() => {
    const stableProductionItems = assignStableLineItemNumbers<any>(watchedLineItems || [], mbaNumber, MEDIA_TYPE_ID_CODES.production)
    return stableProductionItems.map((lineItem) => ({
      // ...
      line_item_id: lineItem.line_item_id,
      line_item: lineItem.line_item,
    }))
  }, [watchedLineItems, mbaNumber])
```

`assignStableLineItemNumbers` re-derives `line_item` and `line_item_id` from `claimLineNumber` / `buildLineItemId` — it can recover the numeric suffix from `lineItemId` even though hydrate did not set `line_item`.

**Display ID in UI** uses `form.watch(\`lineItems.${i}.lineItemId\`)` — so persisted `line_item_id` **does** show in the container header when hydrate copied it.

**Positional fallback:** If both `line_item_id` and `lineItemId` are missing on a row, hydrate uses `buildLineItemId(mbaNumber, "PROD", idx + 1)` where `idx` is **array index after sort**, not necessarily the persisted line number.

---

## 8. Composite scenario walk-through (quoted behaviour only)

**Setup:** User opens MBA edit page for **version 2**. Xano returns **N rows** spanning version 1 and version 2 history for that MBA. **No row** has any of the six version fields set to a value that string-equals `"2"` (all missing/null/empty, or only tagged `"1"`).

### Step A — Xano → production route

1. Route calls `filterLineItemsByPlanNumber(data, mbaNumber, "2", "PRODUCTION")`.
2. Every row fails `versionMatch` → **`filteredData.length === 0`**.
3. MBA fallback runs: `mbaMatches = data.filter(item => String(item?.mba_number || "").trim() === mbaNumber)`.
4. API responds with **all MBA rows** (v1 + v2 content mixed).

### Step B — Edit page client re-filter

1. `getProductionLineItemsByMBA` returns that full MBA set.
2. `filterLineItemsByPlanNumber(items, mbaNumber, "2", "mp_production")` runs **again**.
3. Same logic → **0 rows** (still no version field equals `"2"`).
4. `processedItems = []` → `setProductionLineItems([])`.
5. `mp_production` auto-enable **does not run** (`processedItems.length > 0` is false).

### Step C — What the user sees

1. `initialLineItems={productionLineItems}` is **`[]`**.
2. `useStableHydration` hits `if (!initialLineItems || initialLineItems.length === 0) return` → **no hydrate**, form stays at **`defaultValues`** (one empty production line with `lineItemId: ""` and a default burst).
3. User does **not** see v1 or v2 persisted production rows — despite the server MBA fallback, the **client filter erases them**.

**Paradox:** Server intentionally returns all MBA rows when version metadata is absent; client unconditionally re-filters without an equivalent fallback → **empty production UI**.

### Step D — Line numbers if rows *had* passed the client filter

Hypothetical: rows survive filter (e.g. `mp_plannumber: "2"` present). Assume two rows after sort:

| Row | Persisted `line_item_id` | Persisted `line_item` |
|-----|--------------------------|------------------------|
| A | `MBA007PROD1` | `1` |
| B | `MBA007PROD1` (duplicate) | `1` |

**Hydrate:**

- Row A: `lineItemId = "MBA007PROD1"` (`line_item` not stored on form).
- Row B: `lineItemId = "MBA007PROD1"`.

**`watchedLineItems`:** two entries, both `lineItemId: "MBA007PROD1"`, no `line_item`.

**`assignStableLineItemNumbers` (in `apiLineItems`):**

- Row A: `claimLineNumber` → `1` (from id suffix), first claim → keeps **1**, id `MBA007PROD1`.
- Row B: `claimLineNumber` → `1`, but `used.has(1)` → pass 1 returns `null` → pass 2 assigns **2** (max 1 + 1), id `MBA007PROD2`.

**Export / persist memo** emits `line_item: 1` and `line_item: 2` with matching `line_item_id`s.

If rows lack both `line_item_id` and `line_item`, hydrate assigns `buildLineItemId(mba, "PROD", idx+1)` → positional **1, 2, 3…** by sorted array order, then `assignStableLineItemNumbers` treats those ids as claims unless colliding.

---

## 9. Summary table

| Layer | Filter | Fallback when 0 matches |
|-------|--------|-------------------------|
| `filterLineItemsByPlanNumber` | MBA + any version field === requested | None |
| Production API route | Same | All MBA rows |
| Edit `loadSingleMediaTypeLineItems` | Same | **None** |
| `useStableHydration` | N/A | Skip hydrate if `[]` |
| `assignStableLineItemNumbers` | N/A | Duplicate numbers → first wins, rest get max+1 |

**Key risk:** Production server MBA fallback is **undone** by the edit page’s second `filterLineItemsByPlanNumber` when Xano rows lack version metadata matching the active edit version.
