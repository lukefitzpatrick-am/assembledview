# DISCOVERY: Production Issue Candidates

**Mode:** Read-only discovery. No source files were modified (only this document was created).

**Date:** 2026-07-06

---

## Part A — Production route version scoping

### A.1 Full contents of `app/api/media_plans/production/route.ts`

```typescript
import { NextResponse } from "next/server";
import axios from "axios";
import { getVersionNumberForMBA, filterLineItemsByPlanNumber } from "@/lib/api/mediaPlanVersionHelper";
import { xanoUrl } from "@/lib/api/xano";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mbaNumber = searchParams.get("mba_number");
    const mediaPlanVersion = searchParams.get("media_plan_version");
    const mpPlanNumber = searchParams.get("mp_plannumber");

    if (!mbaNumber) {
      return NextResponse.json({ error: "mba_number is required" }, { status: 400 });
    }

    let versionNumber: string | null = null;

    try {
      versionNumber = await getVersionNumberForMBA(mbaNumber, mpPlanNumber, mediaPlanVersion);
    } catch (versionError) {
      console.error("Error fetching version number from media_plan_versions:", versionError);
      return NextResponse.json(
        { error: "Failed to determine version number. Please provide mp_plannumber or media_plan_version." },
        { status: 400 }
      );
    }

    if (!versionNumber) {
      return NextResponse.json(
        { error: "Could not determine version number. Please provide mp_plannumber or media_plan_version." },
        { status: 400 }
      );
    }

    // NOTE: production's Xano endpoint filters by mba_number only — version_number
    // is sent here for forward-compatibility but Xano ignores it. Production line
    // items render across all versions of a campaign until the schema gains an
    // mp_plannumber column (tracked as Domain 4 deferred work). See
    // AUDIT_DOMAIN_4_KNOWN_ISSUES.md.
    const params = new URLSearchParams();
    params.append("mba_number", mbaNumber);
    if (versionNumber !== undefined && versionNumber !== null && String(versionNumber).trim() !== '') {
      params.append("version_number", String(versionNumber));
      params.append("mp_plannumber", String(versionNumber));
      params.append("media_plan_version", String(versionNumber));
    }

    const url = `${xanoUrl("media_plan_production", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?${params.toString()}`;
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    console.log(`[PRODUCTION] Fetching from media_plan_production table`);
    console.log(`[PRODUCTION] Strategy: MBA-wide at Xano (version_number sent for forward-compat; JS filter + MBA fallback)`);
    console.log(`[PRODUCTION] API URL: ${url}`);

    const response = await axios.get(url, { headers, timeout: 10000 });
    const data = Array.isArray(response.data) ? response.data : [];

    console.log(`[PRODUCTION] Raw response data count:`, data.length);

    const filteredData = filterLineItemsByPlanNumber(data, mbaNumber, versionNumber, "PRODUCTION");

    console.log(`[PRODUCTION] Final filtered data count: ${filteredData.length} (from ${data.length} total items)`);

    // If version metadata is missing in Xano, fall back to returning all rows for the MBA
    if (filteredData.length === 0) {
      const mbaMatches = data.filter((item: any) => String(item?.mba_number || "").trim() === mbaNumber);
      return NextResponse.json(mbaMatches);
    }

    return NextResponse.json(filteredData);
  } catch (error) {
    console.error("Error fetching production line items:", error);
    return NextResponse.json({ error: "Failed to fetch production line items" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();

    const response = await axios.post(
      xanoUrl("media_plan_production", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]),
      data,
      {
      headers: {
        "Content-Type": "application/json",
      },
      }
    );

    return NextResponse.json(response.data);
  } catch (error) {
    console.error("Error creating production line item:", error);
    return NextResponse.json({ error: "Failed to create production line item" }, { status: 500 });
  }
}
```

### A.2 PowerShell `Select-String` results

Commands used (no `&&`, no `grep`):

```powershell
Select-String -Path "c:\Projects\avmediaplan\lib\api.ts" -Pattern "getProductionLineItemsByMBA|saveProductionLineItems"
Select-String -Path "c:\Projects\avmediaplan\app\mediaplans\create\page.tsx" -Pattern "getProductionLineItemsByMBA|saveProductionLineItems"
Select-String -LiteralPath "c:\Projects\avmediaplan\app\mediaplans\mba\[mba_number]\edit\page.tsx" -Pattern "getProductionLineItemsByMBA|saveProductionLineItems"
```

| File | Line | Match |
|------|------|-------|
| `lib/api.ts` | 2730 | `export async function getProductionLineItemsByMBA(...)` |
| `lib/api.ts` | 2760 | `export async function saveProductionLineItems(` |
| `create/page.tsx` | 105 | `saveProductionLineItems` (import) |
| `create/page.tsx` | 5013 | `saveProductionLineItems(` |
| `edit/page.tsx` | 99 | `getProductionLineItemsByMBA,` (import) |
| `edit/page.tsx` | 118 | `saveProductionLineItems,` (import) |
| `edit/page.tsx` | 3306 | `mp_production: { fetchFn: getProductionLineItemsByMBA, setter: setProductionLineItems },` |
| `edit/page.tsx` | 5678 | `saveProductionLineItems(versionId, mbaNumber, clientName, nextVersion.toString(), productionMediaLineItemsForSave)` |
| `edit/page.tsx` | 6042 | `saveProductionLineItems(` |

**`getProductionLineItemsByMBA` has zero call sites in `create/page.tsx`.**

### A.3 Call-site detail

#### `lib/api.ts` — `getProductionLineItemsByMBA` (definition + fetch logic)

```2730:2757:lib/api.ts
export async function getProductionLineItemsByMBA(mbaNumber: string, mediaPlanVersion?: number, timeoutMs?: number): Promise<ProductionLineItem[]> {
  if (isBrowser) {
    return fetchLineItemsFromApi(mbaNumber, mediaPlanVersion, "production", timeoutMs)
  }
  try {
    let url = `/api/media_plans/production?mba_number=${mbaNumber}`;
    if (mediaPlanVersion !== undefined && mediaPlanVersion !== null) {
      url += `&media_plan_version=${mediaPlanVersion}&mp_plannumber=${mediaPlanVersion}`;
      console.log(`[API] Fetching production line items for MBA ${mbaNumber} with version ${mediaPlanVersion}`);
    } else {
      console.log(`[API] Fetching production line items for MBA ${mbaNumber} without version number`);
    }

    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[API] No production line items found for MBA ${mbaNumber} (404)`);
        return [];
      }
      console.warn(`[API] Failed to fetch production line items (${response.status})`);
      return [];
    }

    return response.json();
  } catch (error) {
    console.warn("Error fetching production line items:", error);
    return [];
  }
}
```

- **Parameters:** `mbaNumber`; optional `mediaPlanVersion` appended as both `media_plan_version` and `mp_plannumber` query params.
- **Return handling:** Browser delegates to `fetchLineItemsFromApi` (sorts only). Non-browser returns `response.json()` as-is — **no client-side version filter in this function**.
- **Client-side `mp_plannumber` / `media_plan_version` filtering here:** **No.**

Browser helper `fetchLineItemsFromApi` (used by production fetch):

```1861:1880:lib/api.ts
  const params = new URLSearchParams({ mba_number: mbaNumber })
  if (mediaPlanVersion !== undefined && mediaPlanVersion !== null) {
    params.set("media_plan_version", String(mediaPlanVersion))
    params.set("mp_plannumber", String(mediaPlanVersion))
    params.set("version_number", String(mediaPlanVersion))
  }
  // ...
    const data = await response.json()
    return sortLineItemsByLineItemNumber(Array.isArray(data) ? data : [])
```

#### `lib/api.ts` — `saveProductionLineItems` (definition)

```2760:2766:lib/api.ts
export async function saveProductionLineItems(
  mediaPlanVersionId: number,
  mbaNumber: string,
  clientName: string,
  planNumber: string,
  productionLineItems: any[]
) {
```

- **No internal call sites** of either function exist elsewhere in `lib/api.ts` (definitions only).

#### `app/mediaplans/create/page.tsx` — `saveProductionLineItems`

```5008:5027:app/mediaplans/create/page.tsx
      // Production / Consulting
      if (shouldEnableProduction && productionMediaLineItems && productionMediaLineItems.length > 0) {
        const displayName = mediaTypeDisplayNames.mp_production;
        updateSaveStatus(displayName, 'pending');
        mediaTypeSavePromises.push(
          saveProductionLineItems(
            version.id,
            fv.mba_number,
            fv.mp_client_name,
            fv.mp_plannumber,
            productionMediaLineItems
          ).then(result => {
            updateSaveStatus(displayName, 'success');
            return result;
          }).catch(error => {
            updateSaveStatus(displayName, 'error', error.message || 'Failed to save');
            return { type: 'production', error };
          })
        );
      }
```

- **Parameters:** `version.id`, `fv.mba_number`, `fv.mp_client_name`, `fv.mp_plannumber`, `productionMediaLineItems` (from `ProductionContainer` via `onMediaLineItemsChange`).
- **Return handling:** Success/error folded into `mediaTypeSavePromises` save-status UI only.
- **Client-side version filtering after fetch:** N/A — **no fetch** of production line items on create page.

#### `app/mediaplans/mba/[mba_number]/edit/page.tsx` — `getProductionLineItemsByMBA` (via loader config)

```3306:3342:app/mediaplans/mba/[mba_number]/edit/page.tsx
        mp_production: { fetchFn: getProductionLineItemsByMBA, setter: setProductionLineItems },
        // ...
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
```

- **Parameters:** `mbaNumber`, `versionToUse` (parsed from `versionNumber` or `mediaPlan.version_number`).
- **Return handling:** Rows passed through `filterLineItemsByPlanNumber`, normalized `bursts_json`, stored in `productionLineItems` state; may auto-enable `mp_production` form flag.
- **Client-side `mp_plannumber` / `media_plan_version` filtering after fetch:** **Yes** — `filterLineItemsByPlanNumber(items, mbaNumber, versionToUse.toString(), flag)` on edit page **in addition to** server-side filtering in the production route.

#### `edit/page.tsx` — `saveProductionLineItems` (version-save path)

```5675:5684:app/mediaplans/mba/[mba_number]/edit/page.tsx
      if (shouldEnableProduction && productionMediaLineItemsForSave.length > 0) {
        updateSaveStatus(mediaTypeDisplayNames.mp_production, 'pending')
        savePromises.push(
          saveProductionLineItems(versionId, mbaNumber, clientName, nextVersion.toString(), productionMediaLineItemsForSave)
            .then(() => updateSaveStatus(mediaTypeDisplayNames.mp_production, 'success'))
            .catch(error => {
              updateSaveStatus(mediaTypeDisplayNames.mp_production, 'error', error.message || String(error))
              return { type: 'production', error }
            })
        )
      }
```

- **Parameters:** `versionId`, `mbaNumber`, `clientName`, `nextVersion.toString()` as `planNumber`, `productionMediaLineItemsForSave`.
- **Return handling:** Save-status UI only.

#### `edit/page.tsx` — `saveProductionLineItems` (alternate save path)

```6039:6052:app/mediaplans/mba/[mba_number]/edit/page.tsx
      // Production / Consulting
      if (shouldEnableProduction && productionMediaLineItems && productionMediaLineItems.length > 0) {
        mediaTypeSavePromises.push(
          saveProductionLineItems(
            data.id,
            formData.mbanumber,
            formData.mp_clientname,
            mediaPlan.version_number + 1,
            productionMediaLineItems
          ).catch(error => {
            console.error('Error saving production data:', error);
            return { type: 'production', error };
          })
        );
      }
```

- **Parameters:** `data.id`, `formData.mbanumber`, `formData.mp_clientname`, `mediaPlan.version_number + 1`, `productionMediaLineItems`.
- **Return handling:** Errors logged; promise collected in `mediaTypeSavePromises`.

### A.4 Client-side filtering summary

| Location | Filters on `mp_plannumber` / version after fetch? |
|----------|---------------------------------------------------|
| `app/api/media_plans/production/route.ts` (server) | Yes — `filterLineItemsByPlanNumber`; MBA-wide fallback if filter yields 0 rows |
| `getProductionLineItemsByMBA` in `lib/api.ts` | **No** |
| `fetchLineItemsFromApi` (browser) | **No** (sort only) |
| `edit/page.tsx` `loadSingleMediaTypeLineItems` | **Yes** — `filterLineItemsByPlanNumber` |
| `create/page.tsx` | N/A (no fetch) |

---

## Part B — Line-item numbering on the Production save path

### B.1 `handleDuplicateLineItem` and surrounding duplicate logic

```583:591:components/media-containers/ProductionContainer.tsx
  const handleDuplicateLineItem = (index: number) => {
    const current = form.getValues(`lineItems.${index}`)
    if (current) {
      insertLineItem(index + 1, {
        ...current,
        lineItemId: "",
        bursts: current.bursts.map((b) => ({ ...b, _reactKey: newBurstReactKey() })),
      })
    }
  }
```

Related: `reorderedRef` is set `true` on drag-reorder (line 1121), **not** on duplicate. Expert-modal apply path:

```437:440:components/media-containers/ProductionContainer.tsx
    const orderedForApply = reorderedRef.current
      ? reassignLineItemNumbers(merged, mbaNumber, MEDIA_TYPE_ID_CODES.production)
      : merged
    reorderedRef.current = false
```

Standard-mode duplicate does **not** go through `reassignLineItemNumbers`; it relies on `assignStableLineItemNumbers` in the `apiLineItems` memo.

### B.2 `assignStableLineItemNumbers` (full) and `apiLineItems` memo

```20:111:lib/mediaplan/lineItemOrder.ts
export function reassignLineItemNumbers<T extends LineItemWithIdentity>(
  items: T[],
  mbaNumber: string,
  mediaTypeCode: MediaCode,
): T[] {
  const mba = (mbaNumber ?? "").trim()
  return items.map((item, index) => {
    const lineNo = index + 1
    const line_item_id = mba
      ? buildLineItemId(mba, mediaTypeCode, lineNo)
      : String(
          item.line_item_id ??
            item.lineItemId ??
            pickLineItemNumber(item, lineNo),
        ).trim()
    return {
      ...item,
      line_item: lineNo,
      lineItem: lineNo,
      line_item_id,
      lineItemId: line_item_id,
    }
  })
}

// ... claimLineNumber helper ...

export function assignStableLineItemNumbers<T extends LineItemWithIdentity>(
  items: T[],
  mbaNumber: string,
  mediaTypeCode: MediaCode,
): T[] {
  const mba = (mbaNumber ?? "").trim()
  const used = new Set<number>()

  const claimed: Array<number | null> = items.map((item) => {
    const n = claimLineNumber(item)
    if (n != null && !used.has(n)) {
      used.add(n)
      return n
    }
    return null
  })

  let next = (used.size ? Math.max(...used) : 0) + 1
  const finalNumbers = claimed.map((n) => {
    if (n !== null) return n
    const assigned = next++
    used.add(assigned)
    return assigned
  })

  return items.map((item, i) => {
    const lineNo = finalNumbers[i]
    const line_item_id = mba
      ? buildLineItemId(mba, mediaTypeCode, lineNo)
      : String(item.line_item_id ?? item.lineItemId ?? lineNo).trim()
    return {
      ...item,
      line_item: lineNo,
      lineItem: lineNo,
      line_item_id,
      lineItemId: line_item_id,
    }
  })
}
```

`MEDIA_TYPE_ID_CODES.production` is `"PROD"` (`lib/mediaplan/lineItemIds.ts` line 36).

`apiLineItems` memo call site:

```535:560:components/media-containers/ProductionContainer.tsx
  const apiLineItems = useMemo(() => {
    const stableProductionItems = assignStableLineItemNumbers<any>(watchedLineItems || [], mbaNumber, MEDIA_TYPE_ID_CODES.production)
    return stableProductionItems.map((lineItem) => ({
      media_plan_version: 0,
      mba_number: mbaNumber || "",
      mp_client_name: "",
      mp_plannumber: "",
      media_type: lineItem.mediaType || "",
      publisher: lineItem.publisher || "",
      market: lineItem.market || "",
      description: lineItem.description || "",
      line_item_id: lineItem.line_item_id,
      bursts: (lineItem.bursts || []).map((burst) =>
        formatProductionBurstForPersist(
          {
            cost: Number(burst.cost) || 0,
            amount: Number(burst.amount) || 0,
            startDate: formatDateString(burst.startDate),
            endDate: formatDateString(burst.endDate),
          },
          lineItem
        )
      ),
      line_item: lineItem.line_item,
    }))
  }, [watchedLineItems, mbaNumber])
```

Effect pushes `apiLineItems` to parent via `mediaLineItemsChangeRef.current?.(apiLineItems)` (line 569).

### B.3 `buildLineItemMeta` in `saveProductionLineItems`

Call site:

```2825:2848:lib/api.ts
    const savePromises = productionLineItems.map(async (lineItem, index) => {
      const formattedBursts = normalizeBursts(lineItem)
      const { line_item_id, line_item } = buildLineItemMeta(lineItem, mbaNumber, index, 'PROD');

      const mediaType = pickField(lineItem, ['media_type', 'mediaType'], '')
      // ...
      const productionData: Partial<ProductionLineItem> = {
        media_plan_version: mediaPlanVersionId,
        version_number: coerceNumber(planNumber) || mediaPlanVersionId,
        mba_number: mbaNumber,
        mp_client_name: clientName,
        mp_plannumber: planNumber,
        // ...
        line_item_id,
        bursts: formattedBursts,
        bursts_json: formattedBursts,
        line_item,
      };
```

Full `buildLineItemMeta` implementation:

```1757:1762:lib/api.ts
function buildLineItemMeta(lineItem: any, mbaNumber: string, index: number, prefix: string) {
  return {
    line_item_id: getField(lineItem, 'line_item_id', 'lineItemId', `${mbaNumber}${prefix}${index + 1}`),
    line_item: getField(lineItem, 'line_item', 'lineItem', index + 1),
  };
}
```

`getField` (lines 1750–1752): returns snake_case or camelCase field if defined; otherwise `defaultValue`.

**`buildLineItemMeta` does not call `pickLineItemNumber`.** It preserves incoming `line_item_id` / `line_item` (or camelCase equivalents) when present; fallbacks use **array `index + 1`**, not stable numbering from `assignStableLineItemNumbers`, only if those fields are absent.

`pickLineItemNumber` is used in `applyDeterministicIdForUpdate` (line 1772), **not** in the production save path.

### B.4 Duplicate-then-save: POST payload `line_item` / `line_item_id`

**Assumptions from code (standard mode, single existing line duplicated once, `mbaNumber` non-empty):**

1. Original row keeps its claimed line number (e.g. `1`) via `assignStableLineItemNumbers` → `claimLineNumber` from existing `lineItemId` / `line_item_id`.
2. Duplicate gets `lineItemId: ""` in `handleDuplicateLineItem` → no claimable number → next number above max → **`2`**.
3. `buildLineItemId(mbaNumber, "PROD", lineNo)` produces deterministic ids (`lib/mediaplan/lineItemIds.ts`).
4. `apiLineItems` includes `line_item_id` and `line_item` on each payload object.
5. `buildLineItemMeta` reads those fields via `getField` and passes them through to POST.

| Row | POST `line_item` | POST `line_item_id` |
|-----|------------------|---------------------|
| Original (index 0) | `1` (preserved stable number) | `{mbaNumber}PROD1` (via `buildLineItemId`) |
| Duplicate (index 1) | `2` (new stable number) | `{mbaNumber}PROD2` |

**UNKNOWN** if: `mbaNumber` is empty (id construction falls back to string of number); original had no pre-existing line number (would still get `1` and `2` by assignment order); or `productionLineItems` passed to save bypasses `apiLineItems` (would use `buildLineItemMeta` index fallbacks `index+1` instead — same `1`/`2` for two rows in order).

**Not used on standard duplicate path:** `reassignLineItemNumbers` (only expert apply when `reorderedRef.current` is true).

---

## Part C — Partial MBA persistence trace

### C.1 `appendPartialApprovalToBillingSchedule` (full)

```331:348:lib/mediaplan/partialMba.ts
export function appendPartialApprovalToBillingSchedule<T extends Record<string, any>>(params: {
  billingSchedule: T[]
  metadata: PartialApprovalMetadata | null
}): T[] {
  const { billingSchedule, metadata } = params
  if (!Array.isArray(billingSchedule) || billingSchedule.length === 0) return billingSchedule
  if (!metadata?.isPartial) {
    return billingSchedule.map((entry) => {
      if (!entry || typeof entry !== "object") return entry
      const { partialApproval, ...rest } = entry as any
      return rest as T
    })
  }
  return billingSchedule.map((entry) => ({
    ...entry,
    partialApproval: metadata,
  }))
}
```

### C.2 `PartialApprovalMetadata` — what gets written

Type definition:

```30:43:lib/mediaplan/partialMba.ts
export type PartialApprovalMetadata = {
  isPartial: boolean
  selectedMonthYears: string[]
  channels: PartialApprovalChannel[]
  totals: {
    grossMedia: string
    assembledFee: string
    adServing: string
    production: string
    totalInvestment: string
  }
  note: string
  updatedAt: string
}
```

Built in `recomputePartialMbaFromSelections`:

```242:257:lib/mediaplan/partialMba.ts
  const metadata: PartialApprovalMetadata = {
    isPartial: true,
    selectedMonthYears: [...selectedMonthYears],
    channels,
    totals: {
      grossMedia: formatCurrency(values.grossMedia),
      assembledFee: formatCurrency(values.assembledFee),
      adServing: formatCurrency(values.adServing),
      production: formatCurrency(values.production),
      totalInvestment: formatCurrency(
        values.grossMedia + values.assembledFee + values.adServing + values.production,
      ),
    },
    note: buildPartialApprovalNote(channels, [...selectedMonthYears]),
    updatedAt: new Date().toISOString(),
  }
```

`channels[].selectedTotal` / `fullChannelTotal` are **pre-formatted currency strings** via `money()` (`en-AU` `Intl.NumberFormat`, lines 107–114).

`values.*` numbers come from `computePartialMbaOverridesFromDeliveryMonths` (raw sums from `month.production`, `month.feeTotal`, etc. via `parseCurrency`) before formatting.

`appendPartialApprovalToBillingSchedule` attaches the **entire `metadata` object** (including formatted `totals` and `channels`) onto **each** billing schedule entry as `partialApproval`.

### C.3 Partial MBA confirm on `edit/page.tsx`

`handlePartialMBASave`:

```7541:7576:app/mediaplans/mba/[mba_number]/edit/page.tsx
  function handlePartialMBASave() {
    const campaignBudget = form.getValues("mp_campaignbudget") || 0;
    const { grossMedia, assembledFee, adServing, production } = partialMBAValues;
    const newTotalInvestment = grossMedia + assembledFee + adServing + production;
    // ... budget mismatch toast uses formatMoney(..., { locale: "en-US", currency: "USD" }) — display only ...
    setPartialMBAError(null)
    setIsPartialMBA(true);
    setIsPartialMBAModalOpen(false);
    if (partialApprovalMetadata) {
      setPartialApprovalMetadata({
        ...partialApprovalMetadata,
        totals: {
          grossMedia: formatAUD(grossMedia),
          assembledFee: formatAUD(assembledFee),
          adServing: formatAUD(adServing),
          production: formatAUD(production),
          totalInvestment: formatAUD(newTotalInvestment),
        },
        updatedAt: new Date().toISOString(),
      })
    }
    toast({ title: "Success", description: "Partial MBA details have been saved." });
  }
```

- **Persisted totals:** Recomputed from **`partialMBAValues` numbers** (raw), then formatted with **`formatAUD`** into `partialApprovalMetadata.totals`.
- **`formatMoney(..., en-US, USD)`** appears only in the budget-mismatch **toast description** — **not** written to metadata.
- Modal display strings (`formatMoney` in JSX around lines 10467+) are **UI only** unless user edits flow back through `partialMBAValues` / `handlePartialMBAValueChange` (which parses numeric input).

`recomputePartialMBAFromLineItems` uses `formatCurrency: formatAUD` (line 7416).

`create/page.tsx` `handlePartialMBASave` mirrors this pattern with `mbaCurrencyFormatter` (`en-AU` / `AUD`, lines 1142–1150) for metadata totals — not `formatMoney` en-US.

### C.4 MBA PDF generation formatters

**`lib/generateMBA.ts`:** All currency in PDF uses **`formatAUD`** (e.g. lines 150, 162, 168, 174, 180, 186, 192, 237). `totals.production` is a **number** in `MBAData`; formatted at render time.

**`app/api/mba/generate/route.ts`:** Maps numeric body fields into `MBAData.totals` (lines 38–44):

```typescript
totals: {
  gross_media: body.grossMediaTotal,
  service_fee: body.calculateAssembledFee,
  production: body.calculateProductionCosts,
  adserving: body.calculateAdServingFees,
  totals_ex_gst: body.totalInvestment,
  total_inc_gst: body.totalInvestment * 1.1,
},
```

No string formatting in the route — PDF layer uses `formatAUD`.

**Edit page `generateMbaPdfBlob` when `isPartialMBA`:** Uses **`partialMBAValues.production`** (raw number) for `finalTotals.production` (lines 6263–6268), not formatted display strings.

---

## Part D — `month.production` consumer sweep

`lib/billing/types.ts` documents the dual representation:

```65:68:lib/billing/types.ts
 * - **`production`** is authoritative — it mirrors `productionTotal` in schedule generators (allocated from production bursts).
 * - **`mediaCosts.production`** duplicates that same allocated amount for the per-media-type breakdown grid (same numeric intent as top-level `production`).
 * Consumers must **not** sum `production` plus `mediaCosts.production` as if they were separate charges...
```

### D.1 `lib/billing/`

| File | Reads | Representation | Sums both into one total? |
|------|-------|----------------|---------------------------|
| `computeSchedule.ts` | Internal `productionTotal` (number); writes `production` and `mediaCosts.production` as **formatted strings** from same numeric source | Both set from same accumulator | **No** — `totalAmount` uses `productionTotal` once; `mediaCosts.production` is parallel breakdown |
| `parsePersistedBillingScheduleToMonths.ts` | `entry.production`; reconciles `mediaCosts.production` to match | Formatted strings | **No** — reconciles to one value |
| `prepareBillingMonthsForLineItemExport.ts` | `month.production` | Initializes to `currencyFormatter.format(0)` if undefined | N/A |
| `resetFromAutoReference.ts` | `month.production`, `month.mediaCosts.production` | Sets both to same `autoVal` | **No** — mirror sync |
| `useManualBillingSpreadsheetCallbacks.ts` | `month.production` for `rowId === "production"` | Formatted string | N/A (display getter) |
| `__tests__/parsePersistedBillingScheduleToMonths.test.ts` | Asserts mirror behavior | Formatted | Test only |

### D.2 `lib/finance/`

**No matches** for `month.production`, `productionTotal`, or `mediaCosts.production`.

### D.3 `lib/mediaplan/partialMba.ts`

| Site | Reads | Notes |
|------|-------|-------|
| `computePartialMbaOverridesFromDeliveryMonths` (line 102) | **`month.production`** via `parseCurrency` | Does **not** read `mediaCosts.production` for production total |
| `computePartialMbaOverridesFromDeliveryMonths` (line 93) | `month.mediaCosts?.[key]` for media keys | Production bucket in `mediaTotals` only if `mediaKeys` includes `"production"` — partial MBA UI **excludes** `mp_production` from enabled media rows |

### D.4 Exports

| File | Reads | Notes |
|------|-------|-------|
| `lib/mediaplan/advertisingAssociatesExcel.ts` | Local `productionTotal` from **line items** (`key === "production"`), not `month.production` | Adds to `totals_ex_gst` separately from `mediaGrossTotal` — **no** `month.production` |

### D.5 `app/mediaplans/create/page.tsx`

| Site | Reads | Both in one calculation? |
|------|-------|--------------------------|
| `calculateProductionCosts` (1287) | `month.production` (manual billing) | **No** |
| `getDeliveryMbaTotals` (1493) | `month.production`; `mediaCosts` loop **skips** `k === "production"` | **No** |
| `handleManualBillingChange` production branch (3845–3864) | Sets **both** `month.production` and `mediaCosts.production`; `totalAmount` uses **`month.production` only**; `mediaTotal` reduce **excludes** `production` key | **No double-count** |
| `setValue` for pre-bill production (4023–4025) | Mirrors to both fields | **No** |
| UI input `month.production` (6711) | Display/edit top-level | Syncs `mediaCosts.production` on change (6719) |

### D.6 `app/mediaplans/mba/[mba_number]/edit/page.tsx`

| Site | Reads | Both in one calculation? |
|------|-------|--------------------------|
| `collectBillingMonthStructuralBlockingIssues` (259–265) | **Compares** `month.production` vs `mediaCosts.production` | **No sum** — equality check |
| `recalculateMonthFromLineItems` (509–520) | Sets both from line-item sum when `mk === "production"`; `totalAmount` uses `row.production` | **No** |
| `parsePersistedBillingScheduleToMonths` local (1045–1104) | Reconciles `production` and `mediaCosts.production` | **No** |
| `calculateProductionCosts` (7271) | `month.production` | **No** |
| `getDeliveryMbaTotals` (7295) | `month.production`; skips `production` in `mediaCosts` loop | **No** |
| Manual billing handlers (3962–3985, 4106–4108) | Mirror edits; total from `month.production` only | **No** |

### D.7 Other consumers (outside strict paths but relevant)

| File | Notes |
|------|-------|
| `lib/spend/expectedSpend.ts` (147) | `parseCurrencyValue(month.production)` in month total — **not** `mediaCosts.production` |
| `components/billing/AlterBillingDialog.tsx` (161) | Sets both when editing production field |

### D.8 Sites where **both** representations appear in one expression

**Integrity check (comparison, not sum):**

```259:266:app/mediaplans/mba/[mba_number]/edit/page.tsx
    const prodTop = parseAudMoney(month.production)
    const mc = month.mediaCosts
    const prodMc = mc ? parseAudMoney(mc.production) : 0

    if (Math.abs(prodTop - prodMc) > BILLING_INTEGRITY_EPS) {
      blocking.push(
        `${my}: Production total (${fmt.format(prodTop)}) does not match the production figure under media costs (${fmt.format(prodMc)}).`
      )
```

**No consumer was found that adds `month.production` and `mediaCosts.production` into the same running total.** Grand-total paths consistently use top-level `month.production` once and exclude `production` from `mediaCosts` aggregation.

---

## Confirmation

- **Source code files:** Not modified.
- **This file:** `DISCOVERY_production_issue_candidates.md` created at repo root as the deliverable.
