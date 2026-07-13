# Fee Alignment Discovery 2 — Partial MBA (OLIGRV001)

**Date:** 2026-07-06  
**Scope:** Read-only — edit-page MBA Details panel vs Excel MBA summary for a **Partial MBA**  
**Case:** MBA `OLIGRV001` — Excel shows Service Fee **$26,260.00** and Adserving/Tech **$590.31**; screen MBA Details shows Assembled Fee **$24,260.00** and Ad Serving & Tech **$557.95**. Gross Media matches **$140,540.00** on both sides. Fee delta **$2,000.00** exactly; ad serving delta **$32.36**.

---

## Executive summary

| Surface | Assembled / Service fee source | Ad serving source |
|---------|-------------------------------|-------------------|
| **MBA Details panel (screen)** | `isPartialMBA ? partialMBAValues.assembledFee : deliveryMbaTotals.assembledFee` | `isPartialMBA ? partialMBAValues.adServing : deliveryMbaTotals.adServing` |
| **Excel `mbaData.totals` (export)** | `isPartialMBA ? partialMBAValues.assembledFee : calculateAssembledFee()` | `isPartialMBA ? partialMBAValues.adServing : calculateAdServingFees()` |

**Static code:** When `isPartialMBA === true`, screen and export read the **same** `partialMBAValues` numbers. `lib/generateMediaPlan.ts` writes `mbaData.totals.service_fee` and `mbaData.totals.adserving` verbatim (no recomputation).

**Observed mismatch (Excel higher than screen)** is therefore **not explained by two different formulas in source** when partial mode is active at both moments. It matches the pattern:

- **$26,260.00** ≈ `calculateAssembledFee()` — sum of `workingBillingMonths[].feeTotal` (full billing schedule)
- **$24,260.00** ≈ `hydratePartialMbaFromSavedMetadata()` → `parseCurrency(meta.totals.assembledFee)` (persisted partial-approval totals)

**Most plausible runtime explanation:** Export ran on the **non-partial branch** (`isPartialMBA === false` → `calculateAssembledFee()` / `calculateAdServingFees()`), while the panel showed **hydrated partial** `partialMBAValues`. Secondary explanation: **persisted partial metadata** ($24,260 / $557.95) vs **live billing-month rollups** ($26,260 / $590.31) after schedule/burst changes without re-saving partial approval.

---

## Step 1 — Edit page MBA Details panel (screen side)

**File:** `app/mediaplans/mba/[mba_number]/edit/page.tsx`

### Assembled Fee (panel label)

```9097:9101:app/mediaplans/mba/[mba_number]/edit/page.tsx
                        <span className="text-sm font-semibold">Assembled Fee</span>
                        <span className="text-sm font-semibold tabular-nums">
                          {mbaCurrencyFormatter.format(
                            isPartialMBA ? partialMBAValues.assembledFee : deliveryMbaTotals.assembledFee
                          )}
```

### Ad Serving & Tech (panel label)

```9105:9109:app/mediaplans/mba/[mba_number]/edit/page.tsx
                        <span className="text-sm font-semibold">Ad Serving & Tech</span>
                        <span className="text-sm font-semibold tabular-nums">
                          {mbaCurrencyFormatter.format(
                            isPartialMBA ? partialMBAValues.adServing : deliveryMbaTotals.adServing
                          )}
```

### Trace

| Branch | Expression | Ultimate source |
|--------|------------|-----------------|
| **Partial MBA** (`isPartialMBA`) | `partialMBAValues.assembledFee` / `.adServing` | See Step 5 — hydrated from `partialApproval` metadata on load, or recomputed via `recomputePartialMbaFromSelections` after partial-modal interaction |
| **Auto MBA** | `deliveryMbaTotals.assembledFee` / `.adServing` | `getDeliveryMbaTotals()` — sums `feeTotal` and `adservingTechFees` from **delivery** schedule (`deliveryScheduleSnapshotRef` or `autoDeliveryMonths`), **not** container `*FeeTotal` state |

`deliveryMbaTotals` is computed inline in the panel IIFE (`getDeliveryMbaTotals()` at line 9062).

**Partial MBA does not call `calculateAssembledFee()` or `calculateAdServingFees()` for the panel.**

Display formatter: `mbaCurrencyFormatter` — `Intl.NumberFormat("en-AU", { currency: "AUD" })` (lines 1913–1919).

### Related UI (partial modal — same state, editable)

Modal fields also bind to `partialMBAValues` (lines 10610–10634); edits call `handlePartialMBAChange` / direct `setPartialMBAValues`. MBA Details panel and modal share one state object.

---

## Step 2 — Edit page Excel export (export side)

**Function:** `generateMediaPlanXlsxBlob` (~line 6362)

### `mbaData.totals` construction (standard variant)

```6472:6481:app/mediaplans/mba/[mba_number]/edit/page.tsx
      mbaData = {
        gross_media: mbaDataGrossMedia,
        totals: {
          gross_media: grossForTotals,
          service_fee: isPartialMBA ? partialMBAValues.assembledFee : calculateAssembledFee(),
          production: productionForTotals,
          adserving: isPartialMBA ? partialMBAValues.adServing : calculateAdServingFees(),
          totals_ex_gst: totalExGstStandard,
          total_inc_gst: totalExGstStandard * 1.1,
        },
      }
```

### Partial vs standard branch

| Field | Partial (`isPartialMBA`) | Standard |
|-------|--------------------------|----------|
| `gross_media` (totals) | `partialMBAValues.grossMedia` | `grossMediaTotal` |
| `service_fee` | `partialMBAValues.assembledFee` | `calculateAssembledFee()` |
| `adserving` | `partialMBAValues.adServing` | `calculateAdServingFees()` |
| `production` | `partialMBAValues.production` | `calculateProductionCosts()` |
| `gross_media` (per-channel list) | `partialMBAValues.mediaTotals` | `calculateMediaTotal(medium.name)` per enabled flag |

`generateMbaPdfBlob` (lines 6249–6272) uses the **same** partial vs delivery split for PDF totals.

### Excel write path

`lib/generateMediaPlan.ts` reads totals without transformation:

```2079:2080:lib/generateMediaPlan.ts
        style(sheet.getCell(currentRow, 14), {
          value: totals.service_fee,
```

```2109:2110:lib/generateMediaPlan.ts
        style(sheet.getCell(currentRow, 14), {
          value: totals.adserving,
```

Monthly Service Fee / Ad Serving rows prorate `mbaData.totals.service_fee` and `.adserving` by gross-media month ratio (lines 1849–1859) — they do not recompute fees from line items.

### `partialMba` / `isPartial` search hits (totals-relevant)

PowerShell:

```powershell
Select-String -Path "app\mediaplans\mba\**\*.tsx","lib\**\*.ts" -Pattern "partialMba|partial_mba|PartialMBA|isPartial" -CaseSensitive:$false
```

**Hits involved in totals construction:**

| Location | Role |
|----------|------|
| `edit/page.tsx:6249–6272` | PDF export — `partialMBAValues.*` when `isPartialMBA` |
| `edit/page.tsx:6429–6451` | Excel — gross / total ex-GST from `partialMBAValues` |
| `edit/page.tsx:6476–6478` | Excel — `service_fee` / `adserving` ternary |
| `edit/page.tsx:9092–9108` | MBA Details panel — same ternary pattern (delivery vs partial) |
| `lib/mediaplan/partialMba.ts` | `computePartialMbaOverridesFromDeliveryMonths`, `recomputePartialMbaFromSelections`, `hydratePartialMbaFromSavedMetadata` |
| `edit/page.tsx:3042–3050` | Load — hydrate partial state from `billingSchedule` entry `partialApproval` |
| `edit/page.tsx:4721–4724` | Save — `appendPartialApprovalToBillingSchedule` attaches metadata |

**Create page note:** `app/mediaplans/create/page.tsx` `generateMediaPlanXlsxBlob` (~2684) **always** uses `calculateAssembledFee()` / `calculateAdServingFees()` — no `isPartialMBA` branch in that export block. OLIGRV001 was exported from **edit** per user context.

---

## Step 3 — Locale / parsing on the partial path

**File:** `lib/mediaplan/partialMba.ts`

### `parseCurrency` (all re-parsing)

```45:50:lib/mediaplan/partialMba.ts
export function parseCurrency(value: string | number | undefined | null): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (!value) return 0
  const numeric = parseFloat(String(value).replace(/[^0-9.-]/g, ""))
  return Number.isFinite(numeric) ? numeric : 0
}
```

### Sites where currency round-trips through formatted strings

| Site | Format out | Parse back |
|------|------------|------------|
| `computePartialMbaOverridesFromDeliveryMonths` L93–102 | Reads `month.mediaCosts`, `feeTotal`, `adservingTechFees`, `production` via `parseCurrency` | Billing/delivery month strings → number |
| `recomputePartialMbaFromSelections` L247–253 | `formatCurrency(values.*)` into metadata | Metadata stored as strings |
| `hydratePartialMbaFromSavedMetadata` L271–277 | — | `parseCurrency(meta.totals.*)` and `parseCurrency(c.selectedTotal)` |
| `computePartialApprovalChannels` L312–313 | `money(selectedTotal)` (`en-AU` Intl) | Later `parseCurrency(channel.selectedTotal)` in recompute |
| `parseSavedBillingSchedulePayload` (edit page L969, L1037, L1044) | — | `parseFloat(str.replace(/[^0-9.]/g,""))` on schedule hydration |

Internal `money()` helper (L107–114): `Intl.NumberFormat("en-AU", { currency: "AUD" })`.

### Export path re-parse?

**No.** `generateMediaPlanXlsxBlob` passes **numeric** `partialMBAValues.assembledFee` and `.adServing` directly into `mbaData.totals`. No `formatMoney` → `parseFloat` on the export hot path.

Locale mismatch (edit partial modal uses `formatMoney` with `en-US`/`USD` for display only, L10613–10631) does **not** feed export totals; values remain numbers in React state.

**Parsing risk:** Stale or hand-edited **metadata strings** in `partialApproval.totals` can disagree with live numeric state after `parseCurrency`, but both screen and export read the same `partialMBAValues` numbers after hydration — not separate parse paths.

---

## Step 4 — Ad serving divergence

### Screen (partial MBA)

`partialMBAValues.adServing` from:

1. **Hydrate:** `parseCurrency(meta.totals.adServing)` (`partialMba.ts:273`)
2. **Recompute:** `baseline.adServing * ratio` where `baseline.adServing = Σ parseCurrency(month.adservingTechFees)` over selected delivery/billing months (`partialMba.ts:101, 234`)

Uses **persisted month-level** `adservingTechFees` strings from schedule, scaled by line-item media ratio. **Does not** call `computeAdServingCost` at display time.

### Export (partial MBA)

Same `partialMBAValues.adServing` (line 6478).

### Export (non-partial) — `calculateAdServingFees()`

```7202:7251:app/mediaplans/mba/[mba_number]/edit/page.tsx
  const calculateAdServingFees = useCallback(() => {
    if (workingBillingMonths.length > 0) {
      return workingBillingMonths.reduce((sum, month) => {
        const monthAdServingTotal = parseFloat(month.adservingTechFees.replace(/[^0-9.-]/g, ""))
        return sum + (monthAdServingTotal || 0)
      }, 0)
    }
    const allBursts = [ ...progDisplayBursts, ...progVideoBursts, ... ]
    // ...
    return allBursts.reduce((sum, b) => {
      // ...
      const cost = computeAdServingCost({
        quantity: b.deliverables,
        buyType: b.buyType || "",
        mediaType: b.mediaType,
        rate: getRateForMediaType(b.mediaType),
        adservaudio,
        adServingRatePct: b.adServingRatePct,
        adServingImpressions: b.adServingImpressions,
        kpiCtr: toDecimal(kpi?.ctr ?? null),
        kpiVtr: toDecimal(kpi?.vtr ?? null),
      })
      return sum + cost
    }, 0)
  }, [ ... ])
```

| Path | Behaviour |
|------|-----------|
| Billing months present | Sum saved `adservingTechFees` (same family as partial baseline) |
| No billing months | **Live recompute** from bursts + `computeAdServingCost` + KPI CTR/VTR overrides |

### Screen (non-partial)

`deliveryMbaTotals.adServing` — sum of `adservingTechFees` on **delivery** months only (`getDeliveryMbaTotals`, L7292–7294). Can differ from billing-month sum used in `calculateAdServingFees`.

### OLIGRV001 delta ($32.36)

- **$590.31** matches **full billing-month ad-serving rollup** (`calculateAdServingFees` with `workingBillingMonths`) or post-change schedule totals.
- **$557.95** matches **scaled / saved partial** `partialMBAValues.adServing` (~94.5% of $590.31).

**Conclusion:** Divergence is **persisted/scaled partial total vs full billing (or live burst) rollup**, not Excel recomputing CTR/VTR independently. Partial path does not use `computeAdServingCost` at export; non-partial path may.

---

## Step 5 — Fee state hydration on edit load

### Per-channel `*FeeTotal` state (OOH, Social, Prog Video, etc.)

Initialized **0** (e.g. `oohFeeTotal` L1898, `socialMediaFeeTotal` L1892, `progVideoFeeTotal` L1907).

Updated **after** line items mount via container `onTotalMediaChange` handlers (e.g. `handleOohTotalChange` L6789–6792 → `setOohFeeTotal(totalFee)`).

These feed `calculateAssembledFee()` **only when `workingBillingMonths.length === 0`** (fallback sum L7158–7177). With persisted billing (OLIGRV001), **`calculateAssembledFee` uses billing months**:

```7150:7155:app/mediaplans/mba/[mba_number]/edit/page.tsx
  const calculateAssembledFee = useCallback((): number => {
    if (workingBillingMonths.length > 0) {
      return workingBillingMonths.reduce((sum, month) => {
        const monthFeeTotal = parseFloat(month.feeTotal.replace(/[^0-9.-]/g, ""))
        return sum + (monthFeeTotal || 0)
```

### Persisted schedule hydration (`mediaTotal × feePct / 100`)

In `parseSavedBillingSchedulePayload` (lines 977–981), **only `search` and `socialMedia`** get fee inferred from `mediaTotal × feePct / 100` when rebuilding from legacy `mediaTypes` arrays. **OOH / Prog Video are not in that block.** Saved `entry.feeTotal` wins when present (L1035–1040).

### Partial MBA hydration (on billing load)

```3042:3050:app/mediaplans/mba/[mba_number]/edit/page.tsx
          if (billingHydrated.partial) {
            const h = billingHydrated.partial.hydrate
            setPartialApprovalMetadata(billingHydrated.partial.metadata)
            setIsPartialMBA(true)
            setPartialMBAValues(h.partialMBAValues)
            setPartialMBAMonthYears(h.partialMBAMonthYears)
            setPartialMBASelectedLineItemIds(h.partialMBASelectedLineItemIds)
            setPartialMBAMediaEnabled(h.partialMBAMediaEnabled)
            setOriginalPartialMBAValues(JSON.parse(JSON.stringify(h.partialMBAValues)))
          }
```

`hydratePartialMbaFromSavedMetadata` sets `assembledFee` / `adServing` from **`partialApproval.totals` strings**, not from container `*FeeTotal` or live `calculateAssembledFee()`.

### Recompute triggers (updates `partialMBAValues` away from hydrate)

- `handlePartialMBAOpen` when `isPartialMBA` — **always** calls `recomputePartialMBAFromLineItems` before opening modal (L7426–7428)
- Line-item / month toggles inside partial modal
- `handlePartialMBAReset` — full recompute from delivery months (L7614)

`recomputePartialMbaFromSelections` scales fees:

```230:236:lib/mediaplan/partialMba.ts
  const values: PartialMbaValues = {
    mediaTotals,
    grossMedia: grossSelected,
    assembledFee: baseline.assembledFee * ratio,
    adServing: baseline.adServing * ratio,
    production: baseline.production,
  }
```

### At “Download” click

| Surface | Partial MBA | Source that wins |
|---------|-------------|------------------|
| **MBA Details panel** | Yes | `partialMBAValues` (hydrated or last recompute / manual edit) |
| **Excel export** | Yes | **Same** `partialMBAValues` |
| **MBA Details panel** | No | `getDeliveryMbaTotals()` (delivery schedule) |
| **Excel export** | No | `calculateAssembledFee()` / `calculateAdServingFees()` (**billing** schedule, or burst recompute for ad serving) |

**`*FeeTotal` container rollups do not feed the partial MBA panel or partial export.** They only affect non-partial fallback inside `calculateAssembledFee` when no billing months exist.

`waitForStateFlush` (L8070–8079) awaits one `requestAnimationFrame` before export — does not re-hydrate or recompute partial totals.

---

## Step 6 — The $2,000 search

```powershell
Select-String -Path "app\mediaplans\mba\**\*.tsx","lib\**\*.ts" -Pattern "2000|minimumFee|flatFee|adjustment" -CaseSensitive:$false
```

### Production code

**No** `minimumFee`, `flatFee`, or partial-MBA-specific **$2,000** adjustment in `app/mediaplans` or `lib/mediaplan`.

`adjustment` hits are billing UI indicators (`lib/billing/billingLineAdjustmentIndicators.ts`), finance types, Snowflake timeouts — unrelated to MBA service fee.

### `$2000` in tests only

Examples: `lib/billing/__tests__/seedLineFees.test.ts`, `computeDerivedCampaignFeeAmount.test.ts` — fixture `feeAmount: 2000` for programmatic display line fees. Suggests **$2,000 could be a single line-item or channel fee** excluded or scaled in partial approval, not a global constant.

### Partial scaling (not flat $2,000)

Fee reduction in partial MBA is **`baseline.assembledFee * ratio`** (`partialMba.ts:233`), not a fixed deduction. An exact **$2,000.00** delta is consistent with **one channel’s full assembled fee** (or sum of excluded line-item fees) present in billing `feeTotal` rollups but absent/reduced in saved `partialApproval.totals.assembledFee`.

---

## Step 7 — Conclusion

### Fee delta ($2,000.00) — Assembled / Service fee

| Hypothesis | Confidence | Rationale |
|------------|------------|-----------|
| Export used **non-partial branch** (`calculateAssembledFee()` = **$26,260** from `workingBillingMonths.feeTotal`) while screen showed **hydrated** `partialMBAValues.assembledFee` = **$24,260** (`isPartialMBA` true on screen, false or not yet true at export — e.g. pre-hydration download, or “Reset to Auto” / version reload race) | **72%** | Matches exact magnitudes; only non-partial export path reads full billing fee sum. Static code uses identical `partialMBAValues` when `isPartialMBA` is true — mismatch implies flag/timing or user compared different sessions. |
| **Persisted `partialApproval.totals`** ($24,260) **stale vs live billing `feeTotal` sum** ($26,260); screen/export both use `partialMBAValues` but user compared screen **before** a silent recompute or **Excel from an earlier non-partial export** | **55%** | Explains round $2k if one channel fee was added to billing after partial save. Cannot confirm without saved JSON. |
| Single **excluded line-item / channel fee ≈ $2,000** in partial selection; gross media unchanged because excluded lines had fee but negligible media | **48%** | Consistent with partial ratio logic and test fixtures; needs line-item fee breakdown. |

**Below 90% gap:** Need **`partialApproval` object from OLIGRV001 `billing_schedule`** (totals + channels + `selectedLineItemIds`), **`workingBillingMonths[].feeTotal` per month**, and confirmation **`isPartialMBA` at export time** (e.g. log or breakpoint). Per-channel `oohFeeTotal` / `socialMediaFeeTotal` / `progVideoFeeTotal` at download would confirm whether container rollups equal $26,260.

### Ad serving delta ($32.36)

| Hypothesis | Confidence | Rationale |
|------------|------------|-----------|
| **Partial scaled / saved** `partialMBAValues.adServing` (**$557.95**) vs **full billing-month sum** `calculateAdServingFees()` (**$590.31**) — same `isPartialMBA` / timing split as fee | **78%** | Ratio ~94.5%; partial uses `baseline.adServing * ratio` from persisted `adservingTechFees`; non-partial export sums full billing months. |
| **Delivery vs billing** month `adservingTechFees` mismatch (screen non-partial uses delivery; less relevant if partial flag true) | **35%** | Applies to auto MBA panel path only. |
| **Live `computeAdServingCost` burst recompute** (KPI CTR/VTR) vs persisted month strings | **25%** | Only when `workingBillingMonths.length === 0` in `calculateAdServingFees`; OLIGRV001 likely has persisted billing. |

**Below 90% gap:** Month-level **`adservingTechFees`** from billing schedule vs **`partialApproval.totals.adServing`**, selected **month years**, and **line-item ratio** from `recomputePartialMbaFromSelections`. If bursts drive schedule, compare **`bursts_json`** ad-serving fields and KPI rows for prog video / social.

### Code invariant (important)

For **Partial MBA on the edit page**, screen and export are **designed to use the same `partialMBAValues`**. The OLIGRV001 observation implies a **runtime state / branch mismatch**, not two intentional formulas in `generateMediaPlanXlsxBlob`. Fixing alignment likely requires ensuring export cannot fall through to `calculateAssembledFee()` / `calculateAdServingFees()` when partial approval is active, and/or **reconciling `partialApproval.totals` with billing months on load** before display and export.

---

## Appendix — Key function map

```
partialApproval in billing_schedule
        │
        ▼
hydratePartialMbaFromSavedMetadata ──► partialMBAValues ──┬──► MBA Details panel (isPartialMBA)
        │                                                  └──► generateMediaPlanXlsxBlob totals (isPartialMBA)

workingBillingMonths[].feeTotal ──► calculateAssembledFee() ──► Excel totals (NOT isPartialMBA)
workingBillingMonths[].adservingTechFees ──► calculateAdServingFees() ──► Excel adserving (NOT isPartialMBA)

delivery months ──► getDeliveryMbaTotals() ──► MBA Details panel (NOT isPartialMBA)

recomputePartialMbaFromSelections ──► baseline (delivery/billing months) × line-item ratio ──► partialMBAValues
```

---

## Files reviewed

- `app/mediaplans/mba/[mba_number]/edit/page.tsx` (panel, export, hydration, fee helpers)
- `lib/mediaplan/partialMba.ts`
- `lib/generateMediaPlan.ts` (MBA summary write)
- `DISCOVERY_production_container_map.md` (partial MBA cross-reference)
