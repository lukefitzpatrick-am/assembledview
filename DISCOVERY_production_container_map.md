# Production Channel — End-to-End Discovery Map

**Scope:** Read-only audit of how the Production channel works vs standard media containers (Radio/Television as reference).  
**Generated:** 2026-07-06  
**Line counts:** `ProductionContainer.tsx` = **1,174** lines; `ProductionExpertGrid.tsx` = **4,363** lines.

---

## Part 1 — Production-related files (PowerShell hit list + classification)

Search command:

```powershell
Get-ChildItem -Recurse -Include *.ts,*.tsx -Path app,components,lib | Select-String -Pattern "Production" -List | Select-Object Path
```

Every path returned, classified:

| Path | Classification |
|------|----------------|
| `app/api/campaigns/[mba_number]/route.ts` | API route (mentions Production in MBA/campaign payload) |
| `app/api/clients/route.ts` | Shared util / API (incidental mention) |
| `app/api/finance/data/route.ts` | Billing/finance |
| `app/api/mba/generate/route.ts` | Export (MBA generation) |
| `app/api/mediaplans/download/route.ts` | Export |
| `app/api/mediaplans/generate-pdf/route.ts` | Export |
| `app/api/mediaplans/mba/[mba_number]/route.ts` | API route (MBA payload) |
| `app/api/mediaplans/route.ts` | API route |
| **`app/api/media_plans/production/route.ts`** | **API route (Production CRUD proxy to Xano `media_plan_production`)** |
| `app/api/pacing/search/route.ts` | Shared util (incidental) |
| `app/api/publishers/route.ts` | Shared util (incidental) |
| `app/mediaplans/create/page.tsx` | Container parent / save orchestration / partial MBA |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx` | Container parent / save orchestration / partial MBA |
| `app/mediaplans/[id]/page.tsx` | Shared util (display) |
| `app/tools/behavioural-planner/components/AvaNarration.tsx` | Shared util (incidental) |
| `components/billing/AlterBillingDialog.tsx` | Billing/finance |
| `components/dashboard/campaign/mediaPlanChartReshape.ts` | Shared util |
| `components/finance/hub/panels/FinanceReportPanel.tsx` | Billing/finance |
| `components/kpis/KPISection.tsx` | Shared util |
| **`components/media-containers/ProductionContainer.tsx`** | **Container (1,174 lines)** |
| **`components/media-containers/ProductionExpertGrid.tsx`** | **Expert grid (4,363 lines)** |
| `components/mediaplans/FloatingSectionNav.tsx` | Shared util |
| `lib/api/dashboard/shared.ts` | Shared util |
| **`lib/api/media-containers.ts`** | **Channel mapping (`production` → `media_plan_production`)** |
| `lib/billing/__tests__/*.test.ts` (8 files) | Billing tests (Production cases) |
| `lib/billing/buildBillingSchedule.ts` | Billing/finance |
| `lib/billing/buildManualBillingSpreadsheetRegistry.ts` | Billing/finance |
| `lib/billing/compareBillingDivergence.ts` | Billing/finance |
| `lib/billing/computeSchedule.ts` | Billing/finance (Production proration branch) |
| `lib/billing/exportBillingScheduleExcel.ts` | Export |
| `lib/billing/generateBillingLineItems.ts` | Billing/finance |
| `lib/billing/mediaTypeHeaders.ts` | Billing/finance (Production headers) |
| `lib/billing/parsePersistedBillingScheduleToMonths.ts` | Billing/finance |
| `lib/billing/prepareBillingMonthsForLineItemExport.ts` | Export |
| `lib/billing/resetFromAutoReference.ts` | Billing/finance |
| `lib/billing/scheduleHeaders.ts` | Billing/finance |
| `lib/billing/types.ts` | Billing/finance (Production month semantics) |
| `lib/billing/useManualBillingSpreadsheetCallbacks.ts` | Billing/finance |
| `lib/charts/registry.ts` | Shared util |
| `lib/client-dashboard/theme.ts` | Shared util |
| `lib/finance/forecast/mapping/definitions.ts` | Billing/finance |
| `lib/finance/forecast/buildFinanceForecastDataset.ts` | Billing/finance |
| `lib/finance/report/__tests__/*.test.ts` | Billing/finance tests |
| `lib/finance/report/buildReportRows.ts` | Billing/finance |
| `lib/finance/report/groupAndSubtotal.ts` | Billing/finance |
| `lib/finance/report/types.ts` | Billing/finance |
| `lib/finance/__tests__/extractReportLines.test.ts` | Billing/finance tests |
| `lib/finance/accrual.ts` | Billing/finance |
| `lib/finance/deriveReceivableRecords.ts` | Billing/finance |
| `lib/finance/resolveLineDimensions.ts` | Billing/finance |
| `lib/finance/utils.ts` | Billing/finance |
| `lib/kpi/fanOut.ts` | Shared util |
| `lib/kpi/grouping.ts` | Shared util |
| `lib/kpi/matching.ts` | Shared util |
| `lib/kpi/types.ts` | Shared util |
| `lib/media/mediaTypes.ts` | Channel mapping |
| `lib/mediaplan/__tests__/productionDayDetail.test.ts` | Tests (Production expert) |
| `lib/mediaplan/__tests__/productionExpertMapping.test.ts` | Tests (channel mapping) |
| `lib/mediaplan/__tests__/resolveProductionBurstBudget.test.ts` | Tests (burst budget) |
| `lib/mediaplan/advertisingAssociatesExcel.ts` | Export (production bucket separate from gross media) |
| `lib/mediaplan/burstOperations.ts` | Shared util (`productionBurstDefaults`) |
| `lib/mediaplan/burstSectionLayout.ts` | Shared util (Production grid layout constant) |
| `lib/mediaplan/clearVersionChildren.ts` | Shared util (`media_plan_production` table) |
| `lib/mediaplan/deliverableBudget.ts` | Shared util (`buyType: "production"` formula branch) |
| `lib/mediaplan/deriveBursts.ts` | Shared util (`resolveProductionBurstBudget`) |
| **`lib/mediaplan/expertChannelMappings.ts`** | **Channel mapping (Production expert ↔ standard)** |
| `lib/mediaplan/expertModeSwitch.ts` | Channel mapping (`mergeProductionStandardFromExpertWithPrevious`) |
| **`lib/mediaplan/expertModeWeeklySchedule.ts`** | **Channel mapping (`ProductionExpertScheduleRow` type)** |
| `lib/mediaplan/lineItemIds.ts` | Shared util (`MEDIA_TYPE_ID_CODES.production`) |
| `lib/mediaplan/normalizeLineItem.ts` | Shared util (`resolveProductionBurstBudget`) |
| **`lib/mediaplan/partialMba.ts`** | **Partial MBA (Production excluded from gross media; separate total)** |
| **`lib/mediaplan/resolveProductionBurstBudget.ts`** | **Production-specific burst budget/dual-write** |
| `lib/mediaplan/schemas.ts` | Channel mapping (`productionFormSchema`, etc.) |
| `lib/mediaplan/serializeLineItemsForGantt.ts` | Shared util |
| `lib/publisher/publisherKpiMediaOptions.ts` | Shared util |
| `lib/snowflake/pool.ts` | Shared util (incidental) |
| `lib/spend/expectedSpend.ts` | Shared util |
| `lib/spend/monthlyPlanCalendar.ts` | Shared util |
| `lib/utils/__tests__/mediaPlanValidation.test.ts` | Shared util tests |
| `lib/utils/mediaPlanValidation.ts` | Shared util |
| `lib/xano/ava.ts` | Shared util |
| `lib/xano/mediaPlanTables.ts` | Channel mapping |
| **`lib/api.ts`** | **Save/load (`saveProductionLineItems`, `getProductionLineItemsByMBA`)** |
| `lib/bursts.ts` | Shared util |
| `lib/generateBillingSchedulePDF.ts` | Export |
| `lib/generateMBA.ts` | Export |
| `lib/generateMediaPlan.ts` | Export |
| `lib/utils.ts` | Shared util |

---

## Part 2 — Container anatomy (`ProductionContainer.tsx`)

### State shape

**Form schema** (`lib/mediaplan/schemas.ts`):

**Line item** (`productionLineItemSchema`):
- `mediaType` (string, required — “Production type” subcategory, e.g. Print/Audio)
- `publisher` (optional string)
- `description` (optional string)
- `market` (optional string)
- `lineItemId` (optional string)
- `bursts` (array, min 1)

**Burst** (`productionBurstSchema`):
- `cost` (number ≥ 0)
- `amount` (number ≥ 0 — UI label “Quantity”)
- `startDate` (Date)
- `endDate` (Date)

**Runtime-only (not in Zod schema):**
- `_reactKey` on bursts (via `stampBurstReactKeys` / `newBurstReactKey`)
- Hydration/API bridge fields: `line_item_id`, `line_item`, `bursts_json`

**Expert-mapped / persist dual-write burst fields** (via `formatProductionBurstForPersist`, not in form schema):
- `budget`, `buyAmount`, `calculatedValue`, `description`, `market`

**Billing burst projection** (`buildBillingBursts`):
- `mediaAmount` = `cost × amount`
- `feeAmount` = 0, `feePercentage` = 0
- `clientPaysForMedia` = false, `budgetIncludesFees` = false, `noAdserving` = false
- `deliverables` = `amount`
- `buyType` = `"production"`, `mediaType` = `"production"`

### Shared hooks/helpers

| Mechanism | Production |
|-----------|------------|
| `useStableHydration` | **Used** — hydrates from `initialLineItems`; guarded by `productionExpertModalOpenRef` so expert modal does not get overwritten |
| `burstOperations.ts` | **Used** — `appendBurst`, `duplicateBurst`, `removeBurst`, `newBurstReactKey`, `stampBurstReactKeys`, **`productionBurstDefaults`** variant |
| `computeLoadedDeliverables` | **Not used** in ProductionContainer |
| `prorateAcrossMonths` | **Not used** directly in container; billing page uses `computeSchedule` which calls it downstream |
| `extractAndFormatBursts` | **Not used** |
| `serializeBurstsJson` | **Not used** |
| **Production-specific variant** | **`formatProductionBurstForPersist`** (`lib/mediaplan/resolveProductionBurstBudget.ts`) — dual-writes `cost`/`amount` plus standard `budget`/`buyAmount`/`calculatedValue` |

### Deliverables / quantities

Production does **not** use media-style deliverable formulas (CPM/CPC/etc.) in the container.

Instead:
- **Quantity** = burst `amount` (unit count).
- **Line/burst value** = `cost × amount` (shown as “Production Total” / `mediaAmount`).
- Export `LineItem.deliverables` = `burst.amount`; `deliverablesAmount` = `burst.cost` (string); `grossMedia` = `String(cost × amount)`.
- Billing `BillingBurst.deliverables` = `amount` (used for ad-serving proration path, but Production sets `noAdserving: false` and `feeAmount: 0` — ad serving share is effectively zero).

`resolveProductionBurstBudget` is the read-side bridge when bursts may have dual-written `budget` keys.

### Save path

1. **In-container assembly:** `apiLineItems` memo maps `watchedLineItems` → API payload; each burst passed through **`formatProductionBurstForPersist`** (not `extractAndFormatBursts`).
2. **Parent state:** `onMediaLineItemsChange(apiLineItems)` → `productionMediaLineItems` on create/edit pages.
3. **Persist function:** `saveProductionLineItems()` in `lib/api.ts` (lines 2760–2873):
   - Normalizes bursts via local `normalizeBursts` → **`formatProductionBurstForPersist`**
   - Builds `line_item_id` / `line_item` via `buildLineItemMeta(..., 'PROD')`
   - POST each line to **`/api/media_plans/production`** (browser) or Xano **`media_plan_production`** (server)
4. **Xano table:** `media_plan_production` (fields include `media_plan_version`, `mba_number`, `mp_plannumber`, `media_type`, `publisher`, `description`, `market`, `line_item_id`, `bursts`, `bursts_json`, `line_item`)

**Chokepoint:** `formatProductionBurstForPersist` + `saveProductionLineItems.normalizeBursts` — **not** `extractAndFormatBursts`.

### Fee handling (flow only — no formula audit)

| Location | Behaviour |
|----------|-----------|
| `ProductionContainer` UI | Explicit copy: “No agency fees apply.” |
| `buildBillingBursts` | `feeAmount: 0`, `feePercentage: 0` |
| `onTotalMediaChange` | Always passes `totalFee: 0` |
| `saveProductionLineItems` | No `feePct` / fee fields on payload |
| `productionFormSchema` | No fee-related line-item fields |
| Billing schedule | Production dollars roll to `month.production` / `mediaCosts.production`, **not** `feeTotal` |

### `client_pays_for_media`

- **Not** on Production form schema or save payload.
- Hardcoded in `buildBillingBursts`: `clientPaysForMedia: false` (`ProductionContainer.tsx:156`).
- No UI toggle; not read from persisted Production lines in the container.

---

## Part 3 — Expert grid and identity (`ProductionExpertGrid.tsx`)

Production **has** an expert grid (4,363 lines), opened from ProductionContainer in a full-screen dialog (“Production Expert Mode”).

### Identity pattern

**Decoupled identity — yes.** `ProductionExpertScheduleRow` (`expertModeWeeklySchedule.ts:674–697`):

```typescript
export interface ProductionExpertScheduleRow {
  id: string
  sourceLineItemId?: string  // persisted line_item_id at import; cleared on duplicate
  // ...
}
```

- **Import:** `mapStandardProductionLineItemsToExpertRows` sets `id` = new `crypto.randomUUID()` React key, `sourceLineItemId` = persisted `line_item_id` / `lineItemId` (`expertChannelMappings.ts:2137–2139`).
- **Export:** `mapProductionExpertRowsToStandardLineItems` uses **`deriveExpertSourceLineItemId(row, lineNo)`** for `lineItemId` / `line_item_id` (`expertChannelMappings.ts:1960, 2045–2047`).
- **`deriveExpertSourceLineItemId`** (`expertChannelMappings.ts:262–267`):

```typescript
function deriveExpertSourceLineItemId(
  row: ExpertRowWithSourceLineItemId,
  lineNo: number
): string {
  return (row.sourceLineItemId ?? row.id) || String(lineNo)
}
```

Production is covered — same shared helper as Radio/TV expert mappers.

### Duplicate-row handler (verbatim)

`ProductionExpertGrid.tsx:1448–1467`:

```typescript
  const duplicateRow = useCallback(
    (rowIndex: number) => {
      const next = duplicateExpertRow(
        normalizedRows,
        rowIndex,
        () =>
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `radio-expert-${Date.now()}-${rowIndex}`,
        (i) =>
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `sp-${Date.now()}-${i}`
      )
      if (!next) return
      pushRows(next)
      resetTransientWeekUiState()
    },
    [normalizedRows, pushRows, resetTransientWeekUiState]
  )
```

**Behaviour:** Uses shared `duplicateExpertRow` (`expertRowLifecycle.ts`) which:
- Inserts copy after source row
- New `id` via `makeRowId()`
- **`sourceLineItemId: undefined`** on duplicate (new standard identity on apply)
- Regenerates `mergedWeekSpans[].id`

**Does not** reassign `line_item` numbers positionally in the grid — positional `lineNo` is `idx + 1` only at apply time in `mapProductionExpertRowsToStandardLineItems`.

**Comparison to Radio “bug”:** Radio expert `duplicateRow` is **identical in structure** (`RadioExpertGrid.tsx:1639–1658`) — same `duplicateExpertRow`, same fallback prefix `radio-expert-...`. Neither expert grid reassigns line numbers in the duplicate handler itself.

**Standard-mode duplicate (ProductionContainer):** plain spread — `handleDuplicateLineItem` clears `lineItemId` only; does **not** set `line_item` / `lineItem` (`ProductionContainer.tsx:583–591`). Radio standard duplicate **does** assign new `line_item` / IDs (`RadioContainer.tsx:536–544`).

### `expertModeWeeklySchedule.ts` Production entries

- `ProductionExpertMergedWeekSpan` (alias of OOH merge span type) — line 671–672
- `ProductionExpertScheduleRow` interface — lines 674–697
- `createEmptyProductionExpertRow` exported from **`ProductionExpertGrid.tsx`** (not weekly schedule file)

### Edit UI when not in expert mode

Card-based **Standard** entry in `ProductionContainer`: line-item cards with production type combobox, publisher, market, description, and burst rows (cost, quantity, dates). Toggle **Standard / Expert** in container header; expert opens modal with `ProductionExpertGrid`.

---

## Part 4 — Partial MBA interaction (`lib/mediaplan/partialMba.ts` + create/edit pages)

### Full flow

1. **Trigger:** User enables partial MBA on create/edit pages (`isPartialMBA`), selects delivery months and (for media channels) line items.
2. **Read:**
   - **Baseline totals:** `deliveryMonths` / `billingMonths` — per-month `mediaCosts`, `feeTotal`, `adservingTechFees`, **`production`**
   - **Line-item detail:** `month.lineItems` keyed by media type (from synthesized or persisted billing schedule)
3. **Compute:**
   - `computePartialMbaOverridesFromDeliveryMonths` — sums selected months
   - `recomputePartialMbaFromSelections` — scales **assembled fee** and **ad serving** by ratio of selected vs full line-item media; **production is not scaled**
4. **Write:** `appendPartialApprovalToBillingSchedule` attaches `partialApproval` metadata object onto billing schedule entries when `isPartial` is true.
5. **Tables:** Persisted inside **`billing_schedule` JSON** on media plan version (not `media_plan_production`).

### Production branch points (verbatim conditionals)

**Exclude production from gross media sums:**

`partialMba.ts:52–57`:
```typescript
/** Gross media only; excludes `production` — production is tracked separately on each month and in totals. */
function sumMediaTotalsExcludingProduction(mediaTotals: Record<string, number>): number {
  return Object.entries(mediaTotals).reduce(
    (acc, [k, v]) => (k === "production" ? acc : acc + v),
    0,
  )
}
```

**Production total from month rows (not mediaCosts key for partial baseline):**

`partialMba.ts:102`:
```typescript
  const production = selected.reduce((acc, m) => acc + parseCurrency(m.production), 0)
```

**Line-item ratio excludes production from numerator:**

`partialMba.ts:210–218`:
```typescript
  let grossFullLineItems = 0
  for (const k of mediaKeys) {
    if (k === "production") continue
    if (baselineEnabled[k] === false) continue
    // ...
  }
```

**Production not scaled by partial line-item ratio:**

`partialMba.ts:230–236`:
```typescript
  const values: PartialMbaValues = {
    mediaTotals,
    grossMedia: grossSelected,
    assembledFee: baseline.assembledFee * ratio,
    adServing: baseline.adServing * ratio,
    production: baseline.production,
  }
```

**Partial MBA UI excludes Production channel from line-item picker** (create `page.tsx:3294`, edit `page.tsx:7402`):
```typescript
.filter((m) => m.name !== "mp_production")
```

### Locale divergence (currency formatting)

**Create flow — metadata + modal totals use `en-AU` / AUD:**

`create/page.tsx:1142–1150` (`mbaCurrencyFormatter`):
```typescript
  const mbaCurrencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    []
  )
```

Passed to recompute: `formatCurrency: (n) => mbaCurrencyFormatter.format(n)` (`create/page.tsx:3308`).

Modal display example (`create/page.tsx:6921`):
```typescript
value={mbaCurrencyFormatter.format(partialMBAValues.grossMedia)}
```

**Edit flow — metadata recompute uses `formatAUD` (`en-AU`):**

`edit/page.tsx:7416`:
```typescript
      formatCurrency: formatAUD,
```

**Edit flow — modal UI display uses `en-US` / USD:**

`edit/page.tsx:10600–10605`:
```typescript
                  value={formatMoney(partialMBAValues.grossMedia, {
                    locale: "en-US",
                    currency: "USD",
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
```

(Same `en-US`/`USD` pattern for assembled fee, ad serving, production, and line-item amounts in edit partial MBA modal — e.g. `10641–10646`, `10575–10578`.)

**`partialMba.ts` internal `money()` helper** — always `en-AU` / AUD (`partialMba.ts:107–114`).

### Production amounts vs media in partial MBA

| Aspect | Media lines | Production |
|--------|-------------|------------|
| In `grossMedia` | Included (when selected) | **Excluded** |
| Line-item selection | Per-channel checkboxes | **Not in partial MBA channel list** |
| Partial ratio scaling | Fee + ad serving scale with selected media ratio | **Full `baseline.production`** (all selected months, no line-item ratio) |
| Source field | `month.lineItems[mediaKey]` + `mediaCosts` | **`month.production`** top-level string |

### Data source for partial MBA

- **Month totals:** Persisted / computed **`billing_schedule`** month rows (`deliveryMonths` / `billingMonths`) — includes `production` string per month.
- **Line items:** `month.lineItems` for media keys only in partial UI; production line items exist in schedule (`lineItems.production`) for reconciliation elsewhere but **not** for partial MBA selection UI.
- **Live burst state:** Not read directly by `partialMba.ts`; bursts feed schedule only after billing schedule is built from container `productionBursts`.

---

## Part 5 — Billing schedule and proration for Production

### Proration path

Production uses the **same** `prorateAcrossMonths` as media bursts inside `computeBillingAndDeliveryMonths` (`lib/billing/computeSchedule.ts`).

**Branch point** (`computeSchedule.ts:126–134`):
```typescript
      billingMap[key].mediaCosts[mediaType] += billingMediaShare;
      deliveryMap[key].mediaCosts[mediaType] += deliveryMediaShare;
      if (mediaType === "production") {
        billingMap[key].productionTotal += billingMediaShare;
        deliveryMap[key].productionTotal += deliveryMediaShare;
      } else {
        billingMap[key].totalMedia += billingMediaShare;
        deliveryMap[key].totalMedia += deliveryMediaShare;
      }
```

Production bursts are fed from `burstsByMediaType.production` (`computeSchedule.ts:160`). There is **no** separate milestone/manual proration path in code — date-range proration only.

`prorateAcrossMonths.ts` itself has **no** Production-specific branches.

### Persisted `billingSchedule` JSON — Production fields

Per `BillingMonth` (`lib/billing/types.ts:61–76`):

- **`production`** (string, authoritative month production total)
- **`mediaCosts.production`** (duplicate breakdown for grid — same numeric intent)
- **`lineItems.production`** (array of `BillingLineItem` when line-item breakdown exists)
- Grand total: `totalAmount` = media subtotal (ex production) + `feeTotal` + `adservingTechFees` + **`production`**

Production-only keys: none beyond `production` bucket naming; no extra Production-specific metadata keys on month rows.

### Roll-up vs media

- Production $ **do not** add to `mediaTotal` / `gross_media`.
- They add to top-level **`production`** and appear in **total investment** as a fourth component alongside gross media, assembled fee, and ad serving.
- MBA / AA export: `advertisingAssociatesExcel.ts` reports production separately from `gross_media`.

---

## Part 6 — Difference table

| Mechanism | Standard media (Radio reference) | Production |
|-----------|----------------------------------|------------|
| **Hydration** | `useStableHydration` + burst field mapping + `computeLoadedDeliverables` on load | `useStableHydration` — maps `cost`/`amount`/`bursts_json`; **no** `computeLoadedDeliverables` |
| **Burst ops** | `burstOperations` (generic defaults) | `burstOperations` + **`productionBurstDefaults`** (`cost`/`amount` not `budget`/`buyAmount`) |
| **Deliverables** | `computeLoadedDeliverables` + buy-type formulas | **Quantity** = `amount`; value = **`cost × amount`**; `resolveProductionBurstBudget` on read |
| **Save chokepoint** | Parent → `saveRadioLineItems` → **`extractAndFormatBursts`** | Parent → **`saveProductionLineItems`** → **`formatProductionBurstForPersist`** |
| **Identity pattern (expert)** | `id` UUID + `sourceLineItemId`; `deriveExpertSourceLineItemId` | **Identical pattern** |
| **Duplicate handler (expert)** | `duplicateExpertRow`; clears `sourceLineItemId` | **Identical** (`duplicateExpertRow`) |
| **Duplicate handler (standard)** | Reassigns `line_item`, new `lineItemId` | **Plain spread**; clears `lineItemId` only; **no** `line_item` reassignment |
| **Proration** | `prorateAcrossMonths` → `totalMedia` + `mediaCosts[radio]` | **Same proration** → `productionTotal` + `mediaCosts.production` (not `totalMedia`) |
| **Partial MBA** | Line-item selectable; in `grossMedia`; fee/ads scale with ratio | **Excluded** from partial channel UI and `grossMedia`; **full month `production` sum**; fee/ads still scale |
| **Fee flow** | Line fee %, `feeAmount` on bursts, `feeTotal` in schedule | **Always zero** fee; no fee fields on save |
| **`client_pays_for_media`** | Line-item toggle; affects billing vs delivery media | **Hardcoded false** in billing burst projection only |

---

## Part 7 — Anomalies (observed, no fixes proposed)

1. **Copy-paste naming in Production expert grid** — fallback IDs use `radio-expert-` prefix and debug logs say `[Radio merge]` (`ProductionExpertGrid.tsx:518, 1411, 1425, 1456`).

2. **Xano version filtering for Production GET** — `app/api/media_plans/production/route.ts:40–44` documents that Xano filters by `mba_number` only; version params sent for forward-compat but may be ignored; JS fallback returns all MBA rows if filter empty.

3. **Standard duplicate does not reassign `line_item`** — `ProductionContainer.tsx:583–591` vs Radio’s explicit renumbering (`RadioContainer.tsx:536–544`). New duplicates may get `line_item` assigned only at `assignStableLineItemNumbers` in `apiLineItems` memo.

4. **Partial MBA locale mismatch on edit** — Metadata uses `formatAUD` (`en-AU`) but edit modal displays `formatMoney(..., { locale: "en-US", currency: "USD" })` (`edit/page.tsx:10600+`). Create flow consistently uses `en-AU`.

5. **Dual `production` representation in billing months** — `production` top-level and `mediaCosts.production` must not be double-counted (`lib/billing/types.ts:64–68` documents this).

6. **`clientPaysForMedia: false` hardcoded** — Production billing bursts never participate in client-pays-for-media delivery split (`ProductionContainer.tsx:156`).

7. **Expert apply line numbers** — `reassignLineItemNumbers` only when `reorderedRef.current` is true (`ProductionContainer.tsx:437–439); reorder flag set only from expert grid `onReorder`, not on every apply.

8. **Production subcategory vs export platform** — `mediaType` (Print/Audio/etc.) stored in `media_type`; exports force `platform: "production"` (`ProductionContainer.tsx:180–184`, `mapLineItemsForExport:203`).

9. **Radio standard duplicate line number logic** — uses `(source.line_item ?? source.lineItem ?? lineItemIndex + 1) + 1` which may not match positional index + 1 (`RadioContainer.tsx:536`); Production standard duplicate avoids this differently — inconsistent cross-channel duplicate semantics.

---

## Confirmation

**No source files were modified** during this discovery. Only this report (`DISCOVERY_production_container_map.md`) was written.
