# Billing “Manually Altered” Flag — Discovery

**Scope:** Read-only discovery for a per-line-item flag inside persisted `billingSchedule` JSON.  
**Date:** 2026-07-06  
**Context:** Unflagged lines auto-recalculate from live line items; flagged lines are preserved, trigger a toast when stale, and a confirmation modal on save; save is hard-blocked when billing totals diverge from auto-derived billable totals (fee = gross × fee% on current line items). Missing flag = auto (backwards compatible).

---

## Executive summary

**Build 2 already introduced `billingMode?: "auto" | "manual"`** on `BillingLineItem` and persists it through `buildBillingScheduleJSON` (`finance-review-DECISIONS-LOG.md`). Merge/resync logic in `shouldResyncBillingLineFromAuto`, `appendMissingLineItemsOnly`, and `seedBillingMonthsLineFees` already respects `billingMode === "manual"`.

**Gaps relative to the target design:**

| Requirement | Current state |
|-------------|---------------|
| Per-line persisted flag | **`billingMode`** exists; not auto-set on spreadsheet edit (only explicit Switch) |
| Partial regen on line-item change | **Append-only** merge exists; **no** dedicated “recompute unflagged only” pass when bursts change |
| Toast when flagged line is stale | **No** toast; `buildBillingLineAdjustmentMaps` marks divergent cells visually in modal only |
| Confirmation modal on save (altered lines) | Modal has “Save anyway” for overrides; **campaign save** does not confirm altered lines |
| Hard stop when billable totals diverge | **Partial:** structural orphans block save; **media drift is informational**; fee month-sum drift has separate modal in Edit Billing only |
| Missing flag = auto | **Yes** — `undefined` treated as auto unless plan-level `isManualBilling` affects legacy resync |

**Recommendation:** Extend **`billingMode`** rather than adding `manuallyEdited` (would duplicate semantics). Remaining work is wiring auto-stamp on edit, stale toasts, campaign-save gate, and selective regen.

---

## Step 1 — Billing JSON schema and all writers/readers

### 1.1 Persisted shape (`media_plan_versions.billingSchedule`)

Serialized by `buildBillingScheduleJSON` (`lib/billing/buildBillingSchedule.ts`). Top-level is an **array of month entries** (not `{ months: [...] }` — though `normalizeBillingScheduleToArray` accepts both).

**`BillingScheduleEntry` (one month):**

| Field | Type | Notes |
|-------|------|-------|
| `monthYear` | `string` | e.g. `"January 2026"` |
| `mediaTypes` | `BillingScheduleMediaType[]` | Only months with line items and/or fee/ad/prod |
| `feeTotal` | `string` | Currency string, e.g. `"$1,234.56"` |
| `production` | `string` | Currency string |
| `adservingTechFees` | `string?` | Omitted when zero/empty |

**`BillingScheduleMediaType`:**

| Field | Type |
|-------|------|
| `mediaType` | `string` | Display label, e.g. `"Programmatic Video"` |
| `lineItems` | `BillingScheduleLineItem[]` |

**`BillingScheduleLineItem` (persisted line, one month slice):**

| Field | Type | Notes |
|-------|------|-------|
| `lineItemId` | `string` | Maps to in-memory `BillingLineItem.id` |
| `header1` | `string` | Network / Platform / Publisher |
| `header2` | `string` | Station / Targeting / Site |
| `amount` | `string` | Currency — **this month only** |
| `billingMode` | `"auto" \| "manual"?` | **Only written when present** |
| `mediaType` | `string?` | Dimension |
| `publisher` | `string?` | Dimension |
| `buyType` | `string?` | Dimension |
| `format` | `string?` | Dimension |
| `station` | `string?` | Dimension |
| `mediaAmount` | `number?` | Numeric mirror of `amount` when key exists |
| `feeAmount` | `number?` | Per-month line fee when key exists |
| `clientPaysForMedia` | `boolean?` | When true |

Rows with `amount` and `feeAmount` both ≤ 0 are **filtered out** at serialize time.

**Not persisted:** `legacySaved`, `preBill`, `preBillSnapshot`, `totalAmount`, full `monthlyAmounts` map, `feeMonthlyAmounts`, `adServingMonthlyAmounts`, `totalAdServingAmount`, `totalFeeAmount` (fee may appear only as per-month `feeAmount` on the entry).

### 1.2 In-memory shape (`BillingMonth` / `BillingLineItem`)

Defined in `lib/billing/types.ts`.

**`BillingMonth`:** `monthYear`, `mediaTotal`, `feeTotal`, `totalAmount`, `adservingTechFees`, `production`, `mediaCosts` (per-channel strings), optional `lineItems` keyed by internal media keys (`search`, `progVideo`, …).

**`BillingLineItem`:** `id`, `header1`, `header2`, `monthlyAmounts: Record<string, number>`, `totalAmount`, optional `billingMode`, `preBill`, `preBillSnapshot`, `feeMonthlyAmounts`, `totalFeeAmount`, `adServingMonthlyAmounts`, `totalAdServingAmount`, `legacySaved`, dimensions, `clientPaysForMedia`.

### 1.3 Site whitelist (construct / mutate / parse / serialize / consume)

Grouped by role. Paths from `Select-String` on `lib/**`, `app/**` for `mediaTypes|feeTotal|adservingTechFees|lineItems`.

#### Generators (initial build from bursts / line items)

| Location | Role |
|----------|------|
| `lib/billing/computeSchedule.ts` — `computeBillingAndDeliveryMonths` | Month-level burst aggregation → `autoReferenceBillingMonths` (no line items) |
| `lib/billing/generateBillingLineItems.ts` | **Lib** line items; IDs = `{mediaType}-{header1}-{header2}-{index}` (**legacy**) |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx` — `generateBillingLineItems` (page-local) | **MBA** line items; IDs = `billing-{media}::{line_item_id}` via `billingStableLineItemId` |
| `app/mediaplans/mba/.../edit/page.tsx` — `attachLineItemsToMonths` | Merges generated lines into month skeleton |
| `app/mediaplans/create/page.tsx` | Uses lib `generateBillingLineItems` + `computeBillingAndDeliveryMonths` |
| `lib/billing/prepareBillingMonthsForLineItemExport.ts` | Attach lib generator for export when months lack detail |
| `lib/billing/seedLineFees.ts` — `seedBillingMonthsLineFees` | Injects `feeMonthlyAmounts` / `totalFeeAmount` from `burst.feeAmount`; skips `billingMode === "manual"` |

#### Editors (Edit Billing UI mutations)

| Location | Role |
|----------|------|
| `app/mediaplans/mba/.../edit/page.tsx` — `handleManualBillingChange` | Line amounts, month fee/ad/prod, media bucket strings |
| `.../handleManualBillingLineItemPreBillToggle` | Pre-bill distribution |
| `.../handleManualBillingCostPreBillToggle` | Pre-bill fee/ad/prod buckets |
| `.../handleManualBillingLineItemResetToAuto` | Per-line reset from auto template + `applyBillingLineMode(..., "auto")` |
| `.../setManualBillingLineMode` → `applyBillingLineMode` | Manual/Follow auto switch |
| `lib/billing/useManualBillingSpreadsheetCallbacks.ts` | Paste/clear delegates to `handleManualBillingChange` |
| `lib/billing/syncLineItemAmountAcrossMonthRows.ts` | Syncs amount across all month rows for same `lineItemId` |
| `components/billing/AlterBillingDialog.tsx` | Finance hub alter-billing grid |
| `components/finance/MediaPlanActionBar.tsx` | Loads/saves altered billing via API |
| `app/mediaplans/create/page.tsx` | Legacy `components/billing/BillingSchedule.tsx` manual billing (create flow) |

#### Parsers (hydration)

| Location | Role |
|----------|------|
| `app/mediaplans/mba/.../edit/page.tsx` — `parseSavedBillingSchedulePayload` | MBA edit hydrate → `savedBillingMonths` / `workingBillingMonths`; reads `billingMode` |
| `lib/billing/parsePersistedBillingScheduleToMonths.ts` | Finance hub / shared parse; **does not read `billingMode`** |
| `normalizeBillingScheduleToArray` (edit page + lib) | Unwrap string / `{ months }` / array |

#### Serializers (save payload)

| Location | Role |
|----------|------|
| `lib/billing/buildBillingSchedule.ts` — `buildBillingScheduleJSON` | **Canonical** month → `mediaTypes[]` JSON |
| `app/mediaplans/mba/.../edit/page.tsx` — `buildBillingScheduleForSave` | `workingBillingMonths` → `buildBillingScheduleJSON` (+ partial approval wrapper) |
| `app/mediaplans/create/page.tsx` | Same builder on create save |
| `components/finance/MediaPlanActionBar.tsx` | Finance alter save: `buildBillingScheduleJSON(newMonths)` |

#### Consumers (display, export, finance, seeds)

| Location | Role |
|----------|------|
| MBA edit page — summary grid, sticky banner, exports | Reads `workingBillingMonths` |
| `lib/billing/compareBillingDivergence.ts` | Saved/working vs auto reference |
| `lib/billing/billingLineAdjustmentIndicators.ts` | Manual/divergent cell maps for modal UI |
| `lib/billing/validateAgencyFeeMonthTotalDrift.ts` | Month `feeTotal` sum vs derived campaign fee |
| `lib/billing/exportBillingScheduleExcel.ts` | Excel export |
| `lib/finance/report/*`, `lib/finance/__tests__/extractReportLines.test.ts` | Report line extraction from persisted JSON |
| `app/api/campaigns/[mba_number]/route.ts` | `summarizeBillingSchedule`, spend-to-date |
| `app/api/finance/billing/route.ts` | Finance billing reads version JSON |
| `components/billing/BillingDivergenceBanner.tsx` | Divergence detail UI |

#### Merge / append (mutate working without full replace)

| Location | Role |
|----------|------|
| `appendMissingLineItemsOnly`, `mergeAppendIntoExistingMonth`, `appendAutoReferenceIntoWorkingBilling` (edit `page.tsx`) | Append-only + optional resync; respects `shouldResyncBillingLineFromAuto` |
| `lib/billing/resetFromAutoReference.ts` | Full reset + per-line copy from template |
| `lib/billing/applyBillingLineMode.ts` | Stamp / toggle `billingMode` |
| `lib/billing/mergeInvestmentMonths.ts` | Investment month merge (adjacent domain) |

### 1.4 Spread/clone sites where `billingMode` can be dropped

| Site | Risk |
|------|------|
| `seedLineItemMonthKeysFromTemplate` | Clones template; does not strip `billingMode` if on template |
| `resyncExistingLineItemFromTemplate` | **Preserves** `billingMode` explicitly (`preserveBillingMode`) |
| `parsePersistedBillingScheduleToMonths` | **Drops `billingMode`** — finance alter path loses flag on reload |
| `buildBillingScheduleJSON` | Only emits `billingMode` when set — OK |
| `syncLineItemAmountAcrossMonthRows` | Amounts only; does not touch `billingMode` |
| `JSON.parse(JSON.stringify(...))` deep clones | Preserves `billingMode` if present on source |
| `attachLineItemsToMonths` | Shallow month copy; appends new generated rows without copying modes onto existing |
| Lib `generateBillingLineItems` | Never sets `billingMode` |

---

## Step 2 — Edit Billing UI

### 2.1 Components

| Piece | Path |
|-------|------|
| Modal shell | `app/mediaplans/mba/[mba_number]/edit/page.tsx` — `Dialog` `isManualBillingModalOpen` (~9810+) |
| Spreadsheet provider | `ManualBillingSpreadsheetProvider` + `ManualBillingSpreadsheetLineItemInput` |
| Registry | `lib/billing/buildManualBillingSpreadsheetRegistry.ts` |
| Callbacks | `lib/billing/useManualBillingSpreadsheetCallbacks.ts` |
| Divergence (hydrate) | `components/billing/BillingDivergenceModal.tsx` |
| Divergence (inline) | `components/billing/BillingDivergenceBanner.tsx` |
| Finance alter | `components/billing/AlterBillingDialog.tsx` via `MediaPlanActionBar` |

### 2.2 User-editable values

| Target | Handler | State |
|--------|---------|-------|
| Per-line **month media amounts** | `handleManualBillingChange(..., "lineItem", ...)` / spreadsheet `onCommit` | `manualBillingMonths` |
| Per-line **pre-bill** checkbox | `handleManualBillingLineItemPreBillToggle` | `manualBillingMonths` |
| **Follow auto / Manual** switch per line | `setManualBillingLineMode` → `applyBillingLineMode` | `manualBillingMonths[].lineItems[][].billingMode` |
| Per-line **Reset** | `handleManualBillingLineItemResetToAuto` | Copies from auto template; sets `billingMode: "auto"` |
| Month **agency fee** (`feeTotal`) | `handleManualBillingChange(..., "fee", ...)` | Month row |
| Month **ad serving** (`adservingTechFees`) | `handleManualBillingChange(..., "adServing", ...)` | Month row |
| Month **production** | `handleManualBillingChange(..., "production", ...)` | Month row + `mediaCosts.production` |
| Fee/ad/prod **pre-bill** | `handleManualBillingCostPreBillToggle` | `manualBillingCostPreBill` |
| Bucket **reset** (fee/ad/prod) | `applyCostBucketFromAutoReferenceAggregates` | Month strings from auto ref |
| **Full reset** | `runConfirmedFullBillingResetToAuto` → `handleResetBillingScheduleToAuto` | Replaces `workingBillingMonths`; stamps all lines `auto` |

**Read-only in modal:** Line-derived agency fee rollup (`sumDerivedLineFeesForMonth`), ad serving totals per line (from generation), subtotals.

### 2.3 Where to detect “user touched this line”

| Event | Current behavior | Suggested hook for flag |
|-------|------------------|-------------------------|
| Line cell commit | `handleManualBillingChange` type `lineItem` | **Does not** set `billingMode` today — add `applyBillingLineMode(id, "manual")` here |
| Spreadsheet paste | `onLineItemPaste` → `handleManualBillingChange` | Same |
| Pre-bill toggle | `handleManualBillingLineItemPreBillToggle` | Should stamp manual (**not today**) |
| Manual switch ON | `setManualBillingLineMode(..., "manual")` | Already sets flag |
| Manual switch OFF / Reset | `auto` | Clears protection |
| Month fee/ad/prod edit | Month-level only | **No per-line flag** — separate concern (month bucket manual) |

### 2.4 Plan-level `isManualBilling`

| Aspect | Behavior |
|--------|----------|
| State | `useState(false)` + `isManualBillingRef` mirror (`edit/page.tsx` ~1768) |
| Set `true` | Edit Billing save; `compareBillingDivergence` hydrate/debounce when divergent |
| Set `false` | Full reset to auto; fresh fetch reset |
| Effect on append | Append **still runs** when `isManualBilling`; only `billingLineItemsFollowAutoRef` enables full resync |
| `shouldResyncBillingLineFromAuto` | `billingMode === "manual"` → never resync; `billingMode === "auto"` → always resync; `undefined` → resync only when `!isManualBilling` |
| Sticky banner `hasBillingMismatch` | Requires `isManualBilling` + `validateBillingBeforeSave` issues |

**Interaction:** Plan-level manual is a **coarse** legacy signal; per-line `billingMode` is the **fine-grained** control introduced in Build 2. Divergence detection now drives `isManualBilling`, which can be true even when all lines are `auto`/`undefined`.

---

## Step 3 — Auto-recalculation paths

### 3.1 Inventory

| Path | Trigger | Inputs | Overwrite vs merge |
|------|---------|--------|-------------------|
| **`computeBillingAndDeliveryMonths`** | `calculateBillingSchedule` | Container `*Bursts` arrays, campaign dates, fee/ad rates | Replaces **`autoReferenceBillingMonths`** only |
| **`calculateBillingSchedule`** | Dates, burst deps, manual flag | Above + optional follow-auto merge into **working** | Working: merge via `appendAutoReferenceIntoWorkingBilling` **only if** `billingLineItemsFollowAutoRef` |
| **Append effect** (~7692) | `billingPlanStructureKey`, line-item fingerprint, hydration | `working` + `autoReference` + `attachLineItemsToMonths` | **Append-only** merge; resync all lines if `followAuto` |
| **`attachLineItemsToMonths`** | Called from append, save, export, divergence attach | Live `*MediaLineItems` | Adds **new ids** only to existing months; does not update amounts for existing ids |
| **`seedBillingMonthsLineFees`** | Effect on working/saved when bursts ready | `*Bursts` + line items | Updates fee fields on non-manual lines |
| **Full reset** | Edit Billing confirmed | `buildWorkingMonthsFromAutoReference` | **Full replace** working |
| **Per-line reset** | Modal Reset button | `copySingleLineItemFromAutoTemplate` | Single line amounts/fees; buckets recalc |
| **Create page** | `calculateBillingSchedule` when `!isManualBilling` | Same lib compute | Can replace `billingMonths` entirely |

### 3.2 Hook point for “line-item change → recompute unflagged only”

**Partial infrastructure exists:**

- `appendMissingLineItemsOnly` + `shouldResyncBillingLineFromAuto` already skip `billingMode === "manual"` and can resync others when `resyncExistingFromTemplate: true`.
- **Missing:** A dedicated pass that, on burst/line-item edit, **regenerates template** via `attachLineItemsToMonths(autoRef)` and **merges by `lineItemId`** into `workingBillingMonths` for all non-manual lines (including fee/ad seed), without relying on append-only “new id” semantics.

**Best insertion point:** After `calculateBillingSchedule` updates `autoReferenceBillingMonths`, or inside the append effect **before** `appendAutoReferenceIntoWorkingBilling`, add:

```
template = attachLineItemsToMonths(clone(autoRef), "billing")
working = mergeRegenerateUnflaggedLines(working, template, { respectBillingMode: true })
```

**`mergeRegenerateUnflaggedLines` does not exist today** — closest is `resyncExistingFromTemplate` branch inside `mergeAppendIntoExistingMonth` when `resyncExistingFromTemplate: true` (full follow-auto mode only).

**Single-line scheme drift** (`appendMissingLineItemsOnly` lines 397–444): Reconciles one legacy id to one template id when bucket has exactly one row each — mitigates duplication but does not generalize to multi-line buckets.

---

## Step 4 — Drift detection and the banner

### 4.1 Sticky footer warning

**Text:** `"Billing schedule has differences from line items — open Edit Billing to review or run a full reset"`  
**Location:** `app/mediaplans/mba/[mba_number]/edit/page.tsx` ~8369–8375  

**Driver:**

```typescript
const hasBillingMismatch = useMemo(() => {
  if (!isManualBilling) return false
  if (!workingBillingMonths.length) return false
  if (!billingMonthsHaveDetailedLineItems(source)) return false
  const v = validateBillingBeforeSave(source, { feeCheck: false })
  return v.hasAnyIssue
}, [isManualBilling, workingBillingMonths, validateBillingBeforeSave])
```

This is **`validateBillingBeforeSave`**, not `compareBillingDivergence`. It compares **working line totals** vs **page-local `generateBillingLineItems`** per media type.

### 4.2 `validateBillingBeforeSave` comparison logic

- **Structural blocking** (`collectBillingMonthStructuralBlockingIssues`): month rollups vs line sums, production duplication, grand total arithmetic.
- **Per line (media):** `sum(monthlyAmounts)` vs burst-derived `exp.totalAmount` → `preservedManualOverrides` if \|diff\| > $0.01.
- **Orphan rows:** Stable id not in containers → **blocking** unless `legacySaved` or non-stable id.
- **Fee check:** `feeCheck` param exists but line-level fee comparison **removed** (comment B1).

### 4.3 `compareBillingDivergence`

**File:** `lib/billing/compareBillingDivergence.ts`

| Granularity | Compares |
|-------------|----------|
| **Line** | `totalAmount`, `totalAdServingAmount` by `lineItemId` (union of saved + computed ids) |
| **Month** | `mediaTotal`, `feeTotal`, `adservingTechFees`, `production` strings |
| Tolerance | `$0.01` |

Used for: hydrate modal, debounced `billingDivergence` state, save-time **informational toast** (not blocking).

### 4.4 `validateAgencyFeeMonthTotalDrift`

```typescript
const sumOfMonthFeeTotals = months.reduce((sum, m) => sum + parseMoney(m.feeTotal), 0)
const diff = sumOfMonthFeeTotals - derivedCampaignFee
const withinTolerance = Math.abs(diff) < (options?.tolerance ?? 10) // default $10
```

- **`derivedCampaignFee`:** `computeDerivedCampaignFeeAmount` — sum of `burst.feeAmount` across enabled media (`lib/billing/computeDerivedCampaignFeeAmount.ts`).
- **Granularity:** **Campaign-level** month fee sum vs burst-derived fee; not per-line.
- **Used in:** Edit Billing `handleManualBillingSave` only (confirmation modal, not campaign save block).

### 4.5 Extensibility for hard-stop gate

| Comparator | Per-line billable vs billing | Campaign billable total |
|------------|------------------------------|-------------------------|
| `validateBillingBeforeSave` | **Yes** (media totals) | No single total — lists overrides |
| `compareBillingDivergence` | **Yes** (line + month) | No |
| `validateAgencyFeeMonthTotalDrift` | No | **Fee only**, $10 tolerance |

**For hard-stop:** Extend `validateBillingBeforeSave` or add `validateBillableTotalsBeforeSave` that sums **media + derived fees + ad serving + production** from containers vs `workingBillingMonths` at **campaign** granularity (and optionally per-line for flagged rows). `computeDerivedCampaignFeeAmount` is the authoritative fee side.

---

## Step 5 — Save flow gate points

### 5.1 Campaign save pipeline (`handleSaveAll`)

1. **Pre-check** (lines 5153–5179): If `isManualBilling` && line items present && !partial MBA → `validateBillingBeforeSave(..., { feeCheck: true })`. **Blocks only on `blockingErrors`**, not overrides.
2. **Informational:** `compareBillingDivergence` → toast if divergent (5182–5191).
3. **PATCH** `/api/mediaplans/mba/${mbaNumber}` — campaign fields only.
4. **`buildBillingScheduleForSave(lineItemSnapshots)`** → `billingScheduleJSON`.
5. **PUT** `/api/mediaplans/mba/${mbaNumber}` — body includes `billingSchedule`, `deliverySchedule`, bursts, form values.
6. Post-save: `savedBillingMonths` ← clone of `workingBillingMonths`; `billingLineItemsFollowAutoRef = false`.

**`extractAndFormatBursts`:** Used in **`lib/api.ts` line-item saves**, not in billing JSON assembly. Billing save is **`workingBillingMonths` → `buildBillingScheduleJSON`** only.

### 5.2 Edit Billing modal save (`handleManualBillingSave`)

1. `validateBillingBeforeSave` — blocks UI unless `forceIgnoreMismatch`.
2. `validateAgencyFeeMonthTotalDrift` — `AlertDialog` confirm unless override.
3. Applies `manualBillingMonths` → `workingBillingMonths`; sets `isManualBilling true`.

### 5.3 Single chokepoint recommendation

| Gate | Recommended location |
|------|---------------------|
| **Confirmation modal** (altered lines present) | Start of `handleSaveAll`, before PATCH/PUT — inspect `workingBillingMonths` for `billingMode === "manual"` or stale manual lines |
| **Hard stop** (billable vs billing total mismatch) | Same function, after user confirms (or if no manual lines) — must run **before** PUT |

Placing gates only on the Save button **covers** `handleSaveAndDownloadAll` (calls `handleSaveAll` at end). **Does not cover:**

| Path | Writes `billingSchedule`? | Bypasses button gate? |
|------|---------------------------|------------------------|
| `handleSaveAll` / Save & Download All | Yes | **No** (target) |
| `MediaPlanActionBar` finance alter save | Yes (direct API) | **Yes** — separate entry |
| `app/mediaplans/create/page.tsx` save | Yes | **Yes** — create flow |
| PUT overwrite draft v1 (`mode === "overwrite"`) | Yes, same `handleSaveAll` body | **No** if gated in `handleSaveAll` |
| `handleGenerateMBA` | No (PDF only) | N/A |
| Excel billing export | No persist | N/A |

---

## Step 6 — Legacy / duplicate line-item entries

### 6.1 Legacy ID producer (can still run)

**`lib/billing/generateBillingLineItems.ts` line 25:**

```typescript
const itemId = `${mediaType}-${header1 || "Item"}-${header2 || "Details"}-${index}`
```

**Still invoked from:**

- `app/mediaplans/create/page.tsx` (create flow)
- `lib/billing/prepareBillingMonthsForLineItemExport.ts`
- Any code path using **lib** generator instead of page-local `billingStableLineItemId`

**MBA edit** page-local generator uses `billing-{mediaType}::{line_item_id}` — stable.

### 6.2 Hydrate fallback ID

`parseSavedBillingSchedulePayload` / `parsePersistedBillingScheduleToMonths`:

```typescript
id: rawLiId != null ? String(rawLiId) : `${mediaKey}-${header1}-${header2}`
```

Persisted legacy rows keep whatever `lineItemId` was saved (including `progVideo-Publisher-Desc-0` style).

### 6.3 Double-count readers

Any code that **sums all rows in `mediaTypes[].lineItems`** without deduping by stable identity:

| Consumer | Double-count risk |
|----------|-------------------|
| Edit Billing modal subtotals / `mediaCosts` | **Yes** — sums every row in bucket |
| `parseSavedBillingSchedulePayload` media total | **Yes** — reduces all `lineItems` amounts |
| `buildBillingScheduleJSON` | **Yes** — emits all non-zero rows |
| `collectBillingMonthStructuralBlockingIssues` | **Yes** — line sum vs `mediaCosts` may fail if duplicates |
| `validateBillingBeforeSave` | May flag overrides; orphan logic uses stable id |
| `compareBillingDivergence` | Treats legacy + stable as **two lines** (`missing_in_*` / line_total) |
| Finance reports | Depends on enrichment path |

**`appendMissingLineItemsOnly`:** If legacy and stable ids differ, template row is **appended** as new id → **duplication** until scheme-drift reconcile (single-line bucket only).

### 6.4 Proposal: purge / ignore on regeneration (no code)

1. **Normalize id** when matching: map legacy `{mediaKey}-{h1}-{h2}-{index}` to stable via header match + container `line_item_id` lookup.
2. On full reset / selective regen: **drop** rows where `!isStableBillingLineItemId(id)` when a stable row exists for same headers.
3. Mark irreducible legacy rows `legacySaved: true` (persist if we add to JSON) or delete when amount = 0.
4. **Persist stable `lineItemId`** on next save so JSON only contains `billing-*::` ids.

### 6.5 Other channels

Any media type that went through **create flow** or old saves before stable ids may have `{mediaKey}-*-{index}` rows. **Prog video** is not unique — all channels using lib generator or header fallback are affected. **Single-line buckets** get automatic reconcile today; **multi-line** buckets do not.

---

## Step 7 — Toast / modal infrastructure

### 7.1 Toast

- **Mechanism:** shadcn **`useToast`** from `@/components/ui/use-toast` (Radix-based Toaster in app layout).
- **MBA edit import:** `import { toast } from "@/components/ui/use-toast"` (`edit/page.tsx` line 71).
- **Not sonner** in this app (no `sonner` usage found on edit page).

**Existing billing toasts:** billing applied, reset, export, save blocked (destructive), divergence on save (informational), paste layout.

### 7.2 Confirmation modals (reuse patterns)

| Pattern | File | Use |
|---------|------|-----|
| `AlertDialog` + `AlertDialogAction/Cancel` | `edit/page.tsx` ~9716–9808 | **Full billing reset**, **fee drift override** |
| `Dialog` + `DialogFooter` | Edit Billing modal ~9810+ | Primary modal shell |
| `billingError` inline panel | ~10376–10420 | “Save anyway” for validation overrides |
| `BillingDivergenceModal` | `components/billing/BillingDivergenceModal.tsx` | Hydrate acknowledgment (session storage) |
| `OutcomeModal` / `SavingModal` | edit page | Save progress |

**Recommended:** New campaign-save `AlertDialog` alongside `feeDriftConfirmOpen` pattern; stale-line toast via existing `toast({ title, description, variant })`.

---

## Step 8 — Proposed design (no code)

### 8.1 Flag field

| Option | Recommendation |
|--------|----------------|
| `manuallyEdited?: boolean` | **Do not add** — duplicates Build 2 |
| **`billingMode?: "auto" \| "manual"`** | **Use existing** field on `BillingLineItem` / persisted `BillingScheduleLineItem` |
| Missing / undefined | Treat as **auto** (backwards compatible); `shouldResyncBillingLineFromAuto` already implements this |

**Also fix:** `parsePersistedBillingScheduleToMonths` should read/write `billingMode` for finance alter parity (**confidence 95%**).

### 8.2 Merge algorithm (partial regen by `lineItemId`)

```
For each mediaKey, each month:
  templateLines = attachLineItemsToMonths(autoRef).lineItems[mediaKey]
  For each templateLine T:
    W = working line where id matches T.id OR singleLineSchemeDrift reconcile
    If W.billingMode === "manual": skip
    Else: resyncExistingLineItemFromTemplate(W, T)  // preserves billingMode
  Append template ids not in working (existing appendMissingLineItemsOnly)
  Recompute mediaCosts[mediaKey] from line sums for touched keys
  Optionally re-run seedLineFees for non-manual lines
```

**Legacy normalization:** Before id match, if `!isStableBillingLineId(W.id)` and headers match exactly one stable T, adopt `T.id` and drop legacy W (**confidence 85%** — needs tests on OLIGRV001-shaped data).

### 8.3 Set / clear flag

| Action | Set manual | Clear to auto |
|--------|------------|---------------|
| User edits line cell | **Add** auto-stamp in `handleManualBillingChange` | — |
| User toggles Switch | Already | Already |
| Per-line Reset | — | Already |
| Full reset | — | `stampAllBillingLineModes(..., "auto")` |
| Pre-bill toggle | **Recommend** stamp manual (**confidence 80%**) | — |

**Affordance:** Per-line Reset + Follow auto switch **exist**. Month-level fee/ad/prod edits have bucket reset but **no** `billingMode` analogue at month level (**confidence 90%** — month edits are intentionally separate).

### 8.4 Stale toast

When burst/line-item change causes `compareBillingDivergence` or per-line template diff for a **`billingMode === "manual"`** line:

```
toast({ title: "Manual billing line may be stale", description: "{header1} / {header2} — auto amount changed" })
```

**Hook:** debounced effect after `calculateBillingSchedule` + selective merge (**confidence 75%** — avoid toast spam; debounce per line id).

### 8.5 Hard-stop comparison

**Billable total (derived):** For campaign save gate:

```
billableMedia = sum(page-local generateBillingLineItems(...).totalAmount per enabled media)
billableFee   = computeDerivedCampaignFeeAmount(configs).totalFeeAmount
billableAd    = sum(autoReference month adservingTechFees) OR recompute from bursts
billableProd  = sum(production bursts / line items)
billableTotal = billableMedia + billableFee + billableAd + billableProd
```

```
billingTotal  = sum(parseMoney(workingMonth.totalAmount)) across months
```

**Block save if** `|billingTotal - billableTotal| > tolerance` (suggest **$0.01** media/fee, **$10** fee-only if matching existing drift policy — **confidence 70%** on fee tolerance; product decision).

**Granularity:** Campaign-level for hard-stop; per-line detail in modal message (**confidence 90%**).

**Partial MBA:** Exclude or use partial approval totals (**confidence 60%** — needs product rule).

### 8.6 Save confirmation modal

When any line has `billingMode === "manual"` **or** `validateBillingBeforeSave.preservedManualOverrides.length > 0`:

- Show `AlertDialog` listing count + sample lines before PUT.
- Distinct from fee drift modal (month fee sum).

**Chokepoint:** `handleSaveAll` after structural block, before PATCH (**confidence 95%**).

### 8.7 Commit sequence (smokeable)

1. **Parse parity:** `parsePersistedBillingScheduleToMonths` reads `billingMode`; test round-trip.
2. **Auto-stamp on edit:** `handleManualBillingChange` / pre-bill → `applyBillingLineMode(manual)`.
3. **Selective regen helper:** `mergeRegenerateUnflaggedLines` + wire into append effect / post-`calculateBillingSchedule`.
4. **Legacy dedup:** Normalize ids in merge + optional one-time purge on full reset.
5. **Stale toast:** Effect on manual lines vs template after regen.
6. **Campaign save modal:** Confirm manual lines in `handleSaveAll`.
7. **Hard-stop validator:** `validateBillableTotalsBeforeSave` in `handleSaveAll` (block PUT).
8. **Finance alter path:** Same validation in `MediaPlanActionBar` save if required (**confidence 75%**).

### 8.8 Confidence register (<90%)

| Decision | % | Evidence to raise |
|----------|---|-------------------|
| Reuse `billingMode` vs new `manuallyEdited` | 95% | Product sign-off on Build 2 scope |
| Hard-stop uses campaign `totalAmount` sum | 90% | Confirm vs MBA Details “Total Investment” formula |
| Fee tolerance $0.01 vs $10 on hard-stop | 70% | Align with `validateAgencyFeeMonthTotalDrift` policy |
| Partial MBA excluded from hard-stop | 60% | Inspect `partialApproval` billing paths |
| Month-level fee edits should not set line manual | 80% | UX review |
| Legacy dedup via header-only match safe for multi-line buckets | 65% | OLIGRV001 v2 JSON + UI totals |
| Finance alter must share save gates | 75% | Finance team workflow |
| Stale toast debounce 500ms sufficient | 75% | UX pass on burst edit spam |

---

## Appendix A — Key function references

| Symbol | File |
|--------|------|
| `billingStableLineItemId` | `edit/page.tsx` ~211 |
| `shouldResyncBillingLineFromAuto` | `lib/billing/applyBillingLineMode.ts` |
| `buildBillingScheduleJSON` | `lib/billing/buildBillingSchedule.ts` |
| `computeDerivedCampaignFeeAmount` | `lib/billing/computeDerivedCampaignFeeAmount.ts` |
| `validateAgencyFeeMonthTotalDrift` | `lib/billing/validateAgencyFeeMonthTotalDrift.ts` |
| `compareBillingDivergence` | `lib/billing/compareBillingDivergence.ts` |
| `buildBillingLineAdjustmentMaps` | `lib/billing/billingLineAdjustmentIndicators.ts` |

## Appendix B — Related docs

- `finance-review-DECISIONS-LOG.md` — Build 2 `billingMode` decisions
- `FEE_ALIGNMENT_DISCOVERY.md` / `FEE_ALIGNMENT_DISCOVERY_2.md` — fee derivation paths
- `AUDIT-DOMAIN-4.md` — billing state machine audit
- `STAGE-2-SMOKE.md` — divergence feature flag / smoke
