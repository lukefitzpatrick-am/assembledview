# Stage 2e-1-0 — Discovery Report (read-only)

**Branch:** `pacing-search-rebuild`  
**Scope:** Inventory for the KPIEditModal percent-input bug (`3` → `300%` on blur). No design proposals.

---

## Pre-flight

| Step | Command | Result |
|------|---------|--------|
| 1 | `git branch --show-current` | `pacing-search-rebuild` |
| 2 | `git log --oneline \| Select-String "2dfb245"` | `2dfb245 feat(pacing/kpi): wire KPIEditModal into the pacing surface` |
| 3 | `git status --short` | Untracked only: `docs/pacing/*`, `components/charts/ChartExportToolbar.tsx`, `lib/charts/stackedColumnExport.ts`. **No tracked modifications.** |

All pre-flight checks passed.

---

## Section 1 — `parsePercentHeuristic` current implementation

**File:** `lib/kpi/metrics.ts`

```7:13:lib/kpi/metrics.ts
export function parsePercentHeuristic(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.-]/g, "").trim()
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null
  const val = parseFloat(cleaned)
  if (!Number.isFinite(val)) return null
  return val > 1 ? val / 100 : val
}
```

**File header comment (lines 1–5):** documents whole-number percentage heuristic (`8 → 0.08`) and null-for-unset (post-2d-3).

### Helper: string cleaning

| Step | Code | Behaviour |
|------|------|-----------|
| Strip non-numeric | `raw.replace(/[^0-9.-]/g, "").trim()` | Removes `%`, spaces, currency symbols; keeps digits, `.`, `-` |
| Parse | `parseFloat(cleaned)` | Standard JS float parse |

### Conditional branches

| Branch | Input range | Output |
|--------|-------------|--------|
| **A** — empty/invalid token | `cleaned === ""`, `"-"`, or `"."` | `null` |
| **B** — non-finite parse | `parseFloat` yields `NaN` / `±Infinity` | `null` |
| **C** — whole-number percent heuristic | `val > 1` | `val / 100` |
| **D** — decimal-as-stored | `val <= 1` | `val` (unchanged) |

### Worked examples (static evaluation of current code)

| Input | `cleaned` | `val` | Branch | Return |
|-------|-----------|-------|--------|--------|
| `"3"` | `"3"` | `3` | C | **`0.03`** |
| `"0.03"` | `"0.03"` | `0.03` | D | `0.03` |
| `"0.3"` | `"0.3"` | `0.3` | D | `0.3` |
| `"3.5"` | `"3.5"` | `3.5` | C | `0.035` |
| `"300"` | `"300"` | `300` | C | `3` |
| `""` | `""` | — | A | `null` |
| `"3.5%"` | `"3.5"` | `3.5` | C | `0.035` |

**Load-bearing:** `parsePercentHeuristic("3")` returns **`0.03`** per static analysis of the code above.

---

## Section 2 — `formatPercentForInput` current implementation

**File:** `lib/kpi/metrics.ts`

```18:21:lib/kpi/metrics.ts
export function formatPercentForInput(decimal: number | null): string {
  if (decimal === null) return ""
  return `${(decimal * 100).toFixed(2)}%`
}
```

Assumes the argument is a **decimal ratio** (0.03 = 3%). Always multiplies by 100 before formatting. There is **no** branch that skips multiplication when `decimal > 1`.

### Worked examples

| Input | Output | Notes |
|-------|--------|-------|
| `0.03` | `"3.00%"` | Expected 3% display |
| `0.3` | `"30.00%"` | Expected 30% display |
| `3.0` | **`"300.00%"`** | Value already in “percentage-point” form is double-scaled |
| `null` | `""` | Blank input |
| `0` | `"0.00%"` | Zero is formatted (not treated as null) |

**300% display condition:** any stored value of **`3`** produces `"300.00%"` via `(3 * 100).toFixed(2)`.

---

## Section 3 — Which fields use which parser/formatter

**File:** `components/kpis/KPIEditModal.tsx`

| Field | `defaultValue` formatter | `onBlur` parser | Line ranges |
|-------|------------------------|-----------------|-------------|
| **CTR** | `defaultValue={formatPercentForInput(row.ctr)}` | `const parsed = parsePercentHeuristic(e.target.value)` | 292–295 |
| **VTR** | `defaultValue={formatPercentForInput(row.vtr)}` | `const parsed = parsePercentHeuristic(e.target.value)` | 332–335 |
| **Conv Rate** | `defaultValue={formatPercentForInput(row.conversion_rate)}` | `const parsed = parsePercentHeuristic(e.target.value)` | 414–417 |
| **CPV** | `defaultValue={row.cpv === null ? "" : row.cpv.toFixed(2)}` | Inline: strip non-numeric → `parseFloat` → `null` if empty/invalid | 372–377 |
| **Frequency** | `defaultValue={row.frequency === null ? "" : row.frequency.toFixed(1)}` | Inline: strip non-numeric → `parseFloat` → `null` if empty/invalid | 454–459 |

All three percent fields (CTR, VTR, Conv Rate) call **`parsePercentHeuristic`** on blur and **`formatPercentForInput`** for display. CPV and Frequency use raw float parsing (no percent heuristic).

---

## Section 4 — `handleFieldChange` flow

```101:120:components/kpis/KPIEditModal.tsx
  const handleFieldChange = React.useCallback(
    (
      rowIndex: number,
      field: "ctr" | "vtr" | "cpv" | "conversion_rate" | "frequency",
      value: number | null,
    ) => {
      setEditedRows((prev) => {
        const copy = [...prev]
        const row = {
          ...copy[rowIndex],
          [field]: value,
          isManuallyEdited: true,
          source: "manual" as const,
        }
        copy[rowIndex] = recalcRow(row)
        return copy
      })
    },
    [],
  )
```

**State init / reset:**

```95:99:components/kpis/KPIEditModal.tsx
  React.useEffect(() => {
    if (!open) return
    setEditedRows([...kpiRows])
    setFieldErrors({})
  }, [open, kpiRows])
```

### CTR blur trace (structural)

| Step | What happens |
|------|----------------|
| 1 | User focuses CTR input. Display = `formatPercentForInput(row.ctr)` where `row` comes from `filteredIndexed` → `editedRows`. |
| 2 | User clears and types `3`. DOM value is `"3"` (uncontrolled input). |
| 3 | User blurs. |
| 4 | `onBlur` fires (lines 294–320): reads `e.target.value` (string `"3"`). |
| 5 | `parsePercentHeuristic("3")` → **`0.03`**. |
| 6 | Validation: `parsed !== null && parsed <= 0` → false; proceeds. |
| 7 | `handleFieldChange(rowIndex, "ctr", 0.03)` — `rowIndex` is the **original index in `editedRows`**, preserved through the filter map (lines 128–129, 250). |
| 8 | `editedRows[i].ctr` becomes **`0.03`** after `setEditedRows`. |
| 9 | Re-render: `row.ctr === 0.03`; input `key={`ctr-${row.lineItemId}-${row.ctr}`}` changes (e.g. from `…-null` to `…-0.03`), forcing remount. |
| 10 | New input `defaultValue={formatPercentForInput(0.03)}` → **`"3.00%"`**. |

### Input element props (CTR example)

```289:320:components/kpis/KPIEditModal.tsx
                              <input
                                type="text"
                                className={inputClass}
                                key={`ctr-${row.lineItemId}-${row.ctr}`}
                                defaultValue={formatPercentForInput(row.ctr)}
                                onBlur={(e) => {
                                  const parsed = parsePercentHeuristic(e.target.value)
                                  // ... validation ...
                                  handleFieldChange(rowIndex, "ctr", parsed)
                                }}
                              />
```

**Uncontrolled pattern:** uses `defaultValue`, not `value`. The `key` includes `row.ctr` so a **changed stored value** remounts the input. If `ctr` is unchanged after blur (same numeric value), the DOM text is **not** updated by React.

**`defaultValue` source:** on first open, `editedRows` is copied from `host.rows` (`kpiRows`). After blur, display reads from **`editedRows[i].ctr`**, not the original host prop (until `useEffect` resets from `kpiRows`).

---

## Section 5 — Defensive: other percent parsers

**Command:**

```powershell
git grep -n "parsePercent\|parseFloat.*100\|/ 100\|\* 100" components/kpis/ lib/kpi/ -- "*.ts" "*.tsx"
```

(PowerShell note: path syntax after `--` failed in this environment; ripgrep equivalent used.)

### Matches in scope

| Location | Function / call | On CTR/VTR/Conv blur path? | Context |
|----------|-----------------|---------------------------|---------|
| `lib/kpi/metrics.ts:7` | `parsePercentHeuristic` | **Yes** (via import) | Canonical percent parser |
| `lib/kpi/metrics.ts:12` | `val / 100` inside heuristic | **Yes** | Whole-number branch |
| `lib/kpi/metrics.ts:20` | `decimal * 100` in formatter | **Yes** (display) | Display multiply |
| `components/kpis/KPIEditModal.tsx:295,335,417` | `parsePercentHeuristic(e.target.value)` | **Yes** | CTR, VTR, Conv Rate blur |
| `lib/kpi/deliveryTargetCurve.ts:45` | `MS_PER_DAY` constant | **No** | Unrelated time math |

### Related call sites outside KPIEditModal (same parser/formatter)

| File | Usage |
|------|-------|
| `components/PublisherKpiForm.tsx:639–643, 772–776` | `formatPercentForInput` + `parsePercentHeuristic` on blur |
| `components/dashboard/ClientKpiSection.tsx:874–878, 1026–1030` | Same pattern |

No alternate percent parser exists in `components/kpis/` or `lib/kpi/` beyond `parsePercentHeuristic` and the inline CPV/Frequency float parsers in the modal.

---

## Section 6 — `recalcRow` interaction

```4:25:lib/kpi/recalc.ts
export function recalcRow(row: ResolvedKPIRow): ResolvedKPIRow {
  const bt = (row.buyType ?? "").toLowerCase()
  const isClick = ["cpc", "cpa", "cpl"].some((t) => bt.includes(t))
  const isView = ["cpv", "vtr"].some((t) => bt.includes(t))
  return {
    ...row,
    calculatedClicks: isClick
      ? row.deliverables
      : row.ctr === null
        ? null
        : Math.round(row.deliverables * row.ctr),
    calculatedViews: isView
      ? row.deliverables
      : row.vtr === null
        ? null
        : Math.round(row.deliverables * row.vtr),
    calculatedReach:
      row.frequency === null || row.frequency <= 0
        ? null
        : Math.round(row.deliverables / row.frequency),
  }
}
```

**Finding:** `recalcRow` spreads `...row` and only recomputes `calculatedClicks`, `calculatedViews`, `calculatedReach`. It does **not** read or write `ctr`, `vtr`, or `conversion_rate` except as inputs to derived columns. No multiply-by-100 on metric fields.

---

## Section 7 — Smoke trace: typing `3` into CTR end-to-end

Based on static code (not runtime):

| Step | Code / result |
|------|---------------|
| 1 | Prior `ctr = null` → display `""`. Prior `ctr = 0.05` → `"5.00%"`. |
| 2 | User types `3`; DOM shows `"3"`. |
| 3 | Blur. |
| 4 | Callback: `onBlur={(e) => { const parsed = parsePercentHeuristic(e.target.value); … handleFieldChange(rowIndex, "ctr", parsed) }}` (lines 294–319). |
| 5 | Raw string `"3"` passed to parser. |
| 6 | **`parsePercentHeuristic("3")` → `0.03`**. |
| 7 | `handleFieldChange(rowIndex, "ctr", 0.03)`. |
| 8 | `editedRows[i].ctr === 0.03`. |
| 9 | Re-render: `formatPercentForInput(editedRows[i].ctr)` = `formatPercentForInput(0.03)`. |
| 10 | Display **`"3.00%"`** (not `"300.00%"`). |

**Implication:** If step 6 yields `0.03` but step 10 shows `300%`, the failure is **downstream of parse** (storage units, reset, or display receiving `3`). If step 10 shows `300%`, the stored value at render time must be **`3`**, because `formatPercentForInput(3) = "300.00%"` and `formatPercentForInput(0.03) = "3.00%"`.

**Path to `3` in state without heuristic returning `3` for input `"3"`:**
- Row loaded with `ctr: 3` from host (percentage-point convention) and `useEffect` resets `editedRows` from `kpiRows` after a local edit.
- Row loaded with `ctr: 3` and user does not change stored value (display already `300%` before typing).

---

## Section 8 — Display vs storage units in `ResolvedKPIRow`

### Type definition

```32:63:lib/kpi/types.ts
export interface CampaignKPI {
  // ...
  ctr: number | null
  cpv: number | null
  conversion_rate: number | null
  vtr: number | null
  frequency: number | null
}

export interface ResolvedKPIRow extends CampaignKPI {
  lineItemId: string
  lineItemLabel: string
  spend: number
  deliverables: number
  buyType: string
  source: "client" | "publisher" | "default" | "manual" | "saved"
  isManuallyEdited: boolean
  calculatedClicks: number | null
  calculatedViews: number | null
  calculatedReach: number | null
}
```

No inline comment on `CampaignKPI` metric units. Resolver tests treat values as **decimals**:

```41:42:lib/kpi/__tests__/resolve.test.ts
    ctr: 0.05,
    conversion_rate: 0.01,
```

```74:74:lib/kpi/__tests__/resolve.test.ts
  assert.equal(row.ctr, 0.05)
```

### `kpiMetricNullable` (2d-3)

```318:328:lib/kpi/types.ts
const kpiMetricNullable = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v): number | null => {
    if (v === "" || v === null || v === undefined) return null
    const n = typeof v === "number" ? v : Number(String(v).trim())
    if (!Number.isFinite(n)) return null
    return n
  })
  .refine((v) => v === null || v > 0, {
    message: "Targets must be positive.",
  })
```

Passes numbers through **without** percent scaling. Expects whatever number the caller stores (no ÷100 or ×100).

### Pacing layer — conflicting comment

```15:20:lib/pacing/campaigns/types.ts
 * Values are in their natural units:
 *   - ctr: percentage points (4.5 means 4.5%)
 *   - conversionRate: percentage points
 *   - cpv: dollars
 *   - vtr: percentage points
 *   - frequency: count (e.g. 3.5 means avg 3.5 impressions per user)
```

### Pacing read path into modal

```33:37:lib/pacing/kpi/buildResolvedRow.ts
    ctr: targets?.ctr ?? null,
    cpv: targets?.cpv ?? null,
    conversion_rate: targets?.conversionRate ?? null,
    vtr: targets?.vtr ?? null,
    frequency: targets?.frequency ?? null,
```

Values from `campaign_kpi` / `KpiTargets` are passed **without conversion**.

### Pacing compare path — decimal convention

```66:67:lib/pacing/kpi/computeKpiStatus.ts
 * Both kpiTargets and row actuals use decimal ratios (0.045 = 4.5%) — the same
 * convention as campaign_kpi elsewhere in the repo (see lib/kpi/__tests__/resolve.test.ts).
```

### Pacing display helper (non-modal)

```4:9:lib/pacing/kpi/formatKpi.ts
 * Formats a decimal ratio (0.014) as a percentage string ("1.40%").
export function formatRatioAsPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(2)}%`;
}
```

**Summary:** The **modal formatter/parser pair** assumes **decimal storage** (0.03 = 3%). The **resolver tests** and **computeKpiStatus** comments agree. The **`KpiTargets` type comment** in `lib/pacing/campaigns/types.ts` documents **percentage points** (4.5 = 4.5%), which contradicts the modal/resolver decimal convention. If persisted or loaded values are **`3` (meaning 3%)** rather than **`0.03`**, `formatPercentForInput` renders **`300.00%`**.

---

## Section 9 — Test coverage

**Command:**

```powershell
git grep -l "parsePercentHeuristic\|formatPercentForInput" lib/ components/ -- "*.test.ts" "*.test.tsx"
```

**Result:** Nothing found.

No unit tests cover `parsePercentHeuristic` or `formatPercentForInput`. The case `parsePercentHeuristic("3") === 0.03` is **not** locked by tests.

Related KPI tests exist (`lib/kpi/__tests__/resolve.test.ts`, `syncCampaignKpis.test.ts`, etc.) but use decimal fixtures only; they do not exercise the modal input round-trip.

---

## Section 10 — Hypothesis matrix

| Hypothesis | Evidence for | Evidence against | Likelihood |
|------------|--------------|------------------|------------|
| **(H1)** Heuristic returns wrong value for `"3"` | User symptom (`300%`) | Code branch `val > 1 ? val / 100 : val` returns **`0.03`** for `"3"` (Section 1) | **Low** |
| **(H2)** Heuristic isn't called — different parser on CTR blur | — | Grep: lines 295, 335, 417 all call `parsePercentHeuristic`; no alternate parser in path (Section 3, 5) | **Low** |
| **(H3)** Heuristic correct, but `formatPercentForInput` double-multiplies | `formatPercentForInput(3) === "300.00%"` (Section 2); always `decimal * 100` with no `> 1` guard | For correctly stored `0.03`, formatter shows `3.00%`; heuristic path produces `0.03` for input `"3"` | **High** (as display mechanism when stored value is `3`) |
| **(H4)** Heuristic correct, but row state stored in wrong units | `KpiTargets` comment: percentage points; `buildResolvedRow` passes values through unchanged; `fetchSearchPacingCampaignRows` assigns `ctr: ck.ctr` with no scaling (Section 8) | Resolver tests + `computeKpiStatus` comment expect decimals; fresh blur from empty field should write `0.03` | **High** |
| **(H5)** Heuristic correct, but `defaultValue` uncontrolled / stale | Inputs use `defaultValue` not `value` (Section 4) | `key` includes `row.ctr` → remount on value change; same-value blur leaves DOM as typed `"3"`, not `"300%"` | **Medium** (stale DOM for unchanged numeric value; does not explain `300%` from `"3"` alone) |
| **(H6)** `recalcRow` multiplies metric value | — | `recalcRow` only updates derived columns; spreads metric fields unchanged (Section 6) | **Low** |
| **(H7)** Something else — unit comment split + no conversion at pacing boundary | `types.ts` percentage-point comment vs `metrics.ts` decimal multiply; `buildResolvedRow` / sync payload pass values as-is (`buildSyncPayload.ts:22–25`) | Static blur trace from empty field should still land on `0.03` / `3.00%` | **High** (convention mismatch across layers) |

### Top-ranked hypothesis

**Primary: H4 + H3 (unit convention mismatch between storage/load and modal formatters).**  
Confidence: **High** for explaining **`300%` display when stored value is `3`**.  
Confidence: **Medium** for explaining **blur-after-typing-`3`** specifically — static trace predicts **`3.00%`**, not `300%`, unless host data or reset supplies `3`.

**Secondary: H5** if the report conflates “still shows what I typed” with formatted percent (does not produce `300%` string without formatter receiving `3`).

---

## Open questions

1. **Runtime DB values:** What unit does Xano `campaign_kpi.ctr` actually store for a known row (e.g. `3` vs `0.03`)? This confirms or rules out H4 without code changes.
2. **Repro context:** Does Luke reproduce on **empty** targets (`kpiTargets: null`) or on rows that **already display** an inflated percent before edit?
3. **Does `useEffect([open, kpiRows])` fire during editing? If `host.rows` gets a new reference while the modal is open (parent re-render), local edits reset to host values.
4. **Media-plan vs pacing surface:** Same modal/host pattern; is the bug pacing-only or also in `PublisherKpiForm` / `ClientKpiSection` (same parsers)?

---

## Estimated file count for Stage 2e-1 build

| File | Likely touch |
|------|----------------|
| `lib/kpi/metrics.ts` | Parser and/or formatter alignment |
| `lib/pacing/kpi/buildResolvedRow.ts` | Possible read-side unit normalization |
| `lib/pacing/kpi/buildSyncPayload.ts` | Possible write-side unit normalization |
| `lib/pacing/campaigns/types.ts` | Comment / type doc correction |
| `lib/kpi/__tests__/metrics.test.ts` (new) | Round-trip tests |
| `components/kpis/KPIEditModal.tsx` | Possible only if input control pattern changes |

**Estimate: 2–4 files** (minimum: `metrics.ts` + new tests; maximum: metrics + pacing bridge + tests + modal).

---

## Discovery summary (load-bearing)

| Item | Finding |
|------|---------|
| **`parsePercentHeuristic("3")`** | **`0.03`** (static) |
| **CTR / VTR / Conv Rate blur parser** | All use **`parsePercentHeuristic`** |
| **Top hypothesis** | **H4 + H3:** values in percentage-point form (`3`) displayed through decimal-oriented `formatPercentForInput` → **`300%`**; typing `3` into an empty field should store `0.03` per code — symptom may involve preloaded `3` or reset, not heuristic failure |
| **Tests** | **None** for parser/formatter |
