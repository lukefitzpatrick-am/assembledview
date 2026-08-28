# KPI Allow-Zero Audit

Discovery report for allowing KPI target value `0` on save. Read-only audit — no code changes applied.

---

## 1. Branch + tree state

**Pre-flight commands:**

```powershell
cd C:\Projects\avmediaplan
git branch --show-current
git status --short
```

**Results:**

| Check | Result |
|-------|--------|
| Branch | `localhost` ✓ |
| Tracked modifications | None ✓ |
| Untracked | `?? scripts/debug-mba-identifiers.mjs` |

Tree is clean aside from one untracked debug script. Proceeding with audit.

**Note:** `rg` is not available in the PowerShell environment (`rg : The term 'rg' is not recognized`). Section 3 grep output was produced with the workspace Grep tool (ripgrep-equivalent) from repo root with `--glob "!node_modules"`.

---

## 2. Section 1 — Zod layer

**File:** `lib/kpi/types.ts` (exists at expected path)

### 2.1 `kpiMetric` (client / publisher tier helper)

```306:312:lib/kpi/types.ts
const kpiMetric = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === "" || v === null || v === undefined) return 0
    const n = typeof v === "number" ? v : Number(String(v).trim())
    return Number.isFinite(n) ? n : 0
  })
```

Empty / null / undefined → `0`. Finite numbers (including `0`) pass through. **No positive-only refine.**

### 2.2 `kpiMetricNullable` (campaign tier helper)

```314:328:lib/kpi/types.ts
/**
 * Campaign-tier metric: null for unset, positive number when set.
 * Zero and negatives are rejected — use null to express "no target."
 */
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

- **Predicate:** `v === null || v > 0`
- **Message:** `"Targets must be positive."`
- **`0` is rejected** after transform (not coerced to null).

### 2.3 Schema → helper map

| Schema | Helper per metric field |
|--------|-------------------------|
| `publisherKpiCreateBodySchema` | `kpiMetric` — all five fields |
| `publisherKpiPatchBodySchema` | `kpiMetric.optional()` — all five fields |
| `clientKpiCreateBodySchema` | `kpiMetric.optional().default(0)` — all five fields |
| `clientKpiPatchBodySchema` | `kpiMetric.optional()` — all five fields |
| `campaignKpiItemSchema` (used by `campaignKpiCreateBodySchema`, `campaignKpiSyncBodySchema`) | `kpiMetricNullable.nullable().default(null)` — all five fields |
| `campaignKpiPatchBodySchema` | `kpiMetricNullable.nullable().optional()` — all five fields |

**API routes using campaign schemas:**

- `app/api/kpis/campaign/route.ts` — `campaignKpiCreateBodySchema`, `campaignKpiPatchBodySchema`
- `app/api/kpis/campaign/sync/route.ts` — `campaignKpiSyncBodySchema`

### 2.4 Metric field list (all schemas)

Every schema above validates the same five fields:

- `ctr`
- `cpv`
- `conversion_rate`
- `vtr`
- `frequency`

No other metric keys appear in these Zod bodies.

**Tier summary:** Client and publisher tiers **already accept `0`** via `kpiMetric`. Campaign tier **rejects `0`** via `kpiMetricNullable` refine.

**One-line fix (not applied):** `lib/kpi/types.ts` line 326 — change `v > 0` to `v >= 0` (and update the comment on lines 315–317).

---

## 3. Section 2 — Modal UI validation

**File:** `components/kpis/KPIEditModal.tsx`

### 3.1 Non-positive rejection checks

All five editable metrics use the same pattern on blur: reject when `parsed !== null && parsed <= 0`.

**CTR** (lines 301–309):

```301:309:components/kpis/KPIEditModal.tsx
                                  if (parsed !== null && parsed <= 0) {
                                    setFieldErrors((prev) => ({
                                      ...prev,
                                      [rowIndex]: {
                                        ...prev[rowIndex],
                                        ctr: "Targets must be positive.",
                                      },
                                    }))
                                    return
                                  }
```

**VTR** (lines 341–349): same comparison `parsed <= 0`, same message.

**CPV** (lines 383–391): same comparison after `parseFloat` path.

**Conv. rate** (lines 423–431): same comparison via `parsePercentHeuristic`.

**Frequency** (lines 465–473): same comparison after `parseFloat` path.

There are **no** `> 0` or `!value` checks on metric values elsewhere in this file.

### 3.2 Error message strings

Single string used everywhere:

```
"Targets must be positive."
```

### 3.3 Save-disabled / save-blocked state

```578:583:components/kpis/KPIEditModal.tsx
                disabled={isSaving || Object.keys(fieldErrors).length > 0}
                title={
                  Object.keys(fieldErrors).length > 0
                    ? "Fix validation errors before saving."
                    : "KPIs will be saved to Xano when you save the campaign"
```

Save is blocked when `fieldErrors` has any row keys (set by the `<= 0` blur checks above). No other validation gate on save.

### 3.4 Empty field vs typed `0`

**Percent fields (CTR, VTR, conversion_rate)** — `parsePercentHeuristic`:

```7:13:lib/kpi/metrics.ts
export function parsePercentHeuristic(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.-]/g, "").trim()
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null
  const val = parseFloat(cleaned)
  if (!Number.isFinite(val)) return null
  return val >= 1 ? val / 100 : val
}
```

- Empty / invalid → `null` (clear-to-blank)
- `"0"` → `0` (finite, not `>= 1`) → **rejected** by modal `<= 0` check before `handleFieldChange`

**CPV / frequency** — inline blur in modal:

```380:382:components/kpis/KPIEditModal.tsx
                                  const cleaned = e.target.value.replace(/[^0-9.-]/g, "").trim()
                                  const val = cleaned === "" ? null : parseFloat(cleaned)
                                  const parsed = val !== null && Number.isFinite(val) ? val : null
```

- Empty → `null`
- `"0"` → `0` → **rejected** by `<= 0` check

Display distinguishes null vs number:

```377:378:components/kpis/KPIEditModal.tsx
                                defaultValue={row.cpv === null ? "" : row.cpv.toFixed(2)}
```

```459:460:components/kpis/KPIEditModal.tsx
                                defaultValue={row.frequency === null ? "" : row.frequency.toFixed(1)}
```

Percent fields use `formatPercentForInput(row.ctr)` which returns `""` for `null`.

**One-line fix (not applied):** Five modal sites — change `parsed <= 0` to `parsed < 0` to allow zero while still rejecting negatives.

### 3.5 `KPISection.tsx`

**No KPI value validation.** Component only renders summary counts and opens `KPIEditModal`. Closest numeric check is display-only headline total (`headline.total > 0`) at line 177 — not a save gate.

---

## 4. Section 3 — All rejection sites

### 4.1 Raw grep: `"Targets must be positive"`

```
lib/kpi/types.ts:327:    message: "Targets must be positive.",
components/kpis/KPIEditModal.tsx:306:                                        ctr: "Targets must be positive.",
components/kpis/KPIEditModal.tsx:346:                                        vtr: "Targets must be positive.",
components/kpis/KPIEditModal.tsx:388:                                        cpv: "Targets must be positive.",
components/kpis/KPIEditModal.tsx:428:                                        conversion_rate: "Targets must be positive.",
components/kpis/KPIEditModal.tsx:470:                                        frequency: "Targets must be positive.",
docs/pacing/STAGE_2e-1-0_REPORT.md:321:    message: "Targets must be positive.",
```

(Plus doc copy in `docs/pacing/STAGE_2e-1-0_REPORT.md` — not runtime.)

### 4.2 Raw grep: `"must be positive"`

Same hits as 4.1 (message string is always the full phrase `"Targets must be positive."`).

### 4.3 Raw grep: `> 0` in `lib/kpi` and `components/kpis`

**lib/kpi:**

```
lib/kpi/resolve.ts:73:  return deliverables > 0 ? spend / deliverables : 0
lib/kpi/types.ts:326:  .refine((v) => v === null || v > 0, {
lib/kpi/lineItemsForFanOut.ts:23:  const source = asFanoutLineItems(media.length > 0 ? media : exported)
lib/kpi/__tests__/resolve.test.ts:198: (test description — CPV derive)
lib/kpi/deliveryTargetCurve.ts:109:    return rate != null && rate > 0 ? deliverables * rate : 0
lib/kpi/deliveryTargetCurve.ts:116:    return rate != null && rate > 0 ? deliverables * rate : 0
```

**components/kpis:**

```
components/kpis/KPISection.tsx:109:          {kpiRows.length > 0 && (
components/kpis/KPISection.tsx:177:                  ) : headline.total > 0 ? (
components/kpis/KPIEditModal.tsx:578:                disabled={isSaving || Object.keys(fieldErrors).length > 0
components/kpis/KPIEditModal.tsx:580:                  Object.keys(fieldErrors).length > 0
```

### 4.4 Raw grep: `<= 0|< 0|=== 0|!== 0` in `lib/kpi` and `components/kpis`

**lib/kpi:**

```
lib/kpi/resolve.ts:65:  if (client !== 0) return { value: client, layer: "client" }
lib/kpi/saveCampaignKpis.ts:18:  if (kpiRows.length === 0) {
lib/kpi/saveCampaignKpis.ts:21:  if (payload.length === 0) {
lib/kpi/fanOut.ts:186:    if (matches.length === 0) {
lib/kpi/deliveryTargetCurve.ts:102:  if (deliverables <= 0) return 0
lib/kpi/deliveryTargetCurve.ts:137:  if (days.length === 0) return []
lib/kpi/deliveryTargetCurve.ts:145:    if (total <= 0) continue
lib/kpi/deliveryTargetCurve.ts:161:    if (effDays <= 0) continue
lib/kpi/deliveryTargetCurve.ts:179:  if (totalAll <= 0) return []
lib/kpi/recalc.ts:21:      row.frequency === null || row.frequency <= 0
lib/kpi/campaignKpi.ts:71:  if (inputs.length === 0) return []
```

**components/kpis:**

```
components/kpis/KPIEditModal.tsx:301:  if (parsed !== null && parsed <= 0) {  (ctr)
components/kpis/KPIEditModal.tsx:341:  if (parsed !== null && parsed <= 0) {  (vtr)
components/kpis/KPIEditModal.tsx:383:  if (parsed !== null && parsed <= 0) {  (cpv)
components/kpis/KPIEditModal.tsx:423:  if (parsed !== null && parsed <= 0) {  (conv rate)
components/kpis/KPIEditModal.tsx:465:  if (parsed !== null && parsed <= 0) {  (frequency)
(+ row-length / fieldErrors length checks — not metric gates)
components/kpis/KPISection.tsx: (row count checks only)
```

### 4.5 Curated list — gates that must agree for `0` to save cleanly

| # | File | Line(s) | What it gates |
|---|------|---------|---------------|
| 1 | `lib/kpi/types.ts` | 326–328 | **Campaign API Zod** — rejects `0` on sync/create/patch |
| 2 | `components/kpis/KPIEditModal.tsx` | 301, 341, 383, 423, 465 | **Modal blur** — blocks edit + sets `fieldErrors` |
| 3 | `components/kpis/KPIEditModal.tsx` | 578 | **Save button** — disabled while `fieldErrors` non-empty |

**Not save blockers (already allow or different tier):**

| File | Line | Notes |
|------|------|-------|
| `lib/kpi/types.ts` | 306–312 | `kpiMetric` — client/publisher already allow `0` |
| `components/PublisherKpiForm.tsx` | — | No positive check; `min={0}` on frequency input |
| `components/dashboard/ClientKpiSection.tsx` | — | No positive check on metrics |

**Downstream `> 0` / `<= 0` on metric values (post-save behavior, not save rejection):**

| File | Line | What it gates |
|------|------|---------------|
| `lib/kpi/deliveryTargetCurve.ts` | 109, 116 | CTR/VTR rate must be `> 0` to contribute target curve |
| `lib/kpi/recalc.ts` | 21 | `frequency <= 0` → `calculatedReach = null` |
| `lib/kpi/resolve.ts` | 65 | `client !== 0` — client-layer `0` skipped in merge |
| `lib/pacing/kpi/kpiCellColor.ts` | 47 | `normalisedTarget <= 0` → no comparison tint |
| `lib/pacing/kpi/computeKpiStatus.ts` | 79, 95 | `target !== 0` — variance % only; status still computed |

---

## 5. Section 4 — Zero-safety (downstream)

### 5.1 `lib/kpi/recalc.ts` — derived metrics

```10:23:lib/kpi/recalc.ts
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
```

| Metric set to `0` | Result |
|-------------------|--------|
| `ctr = 0` | `calculatedClicks = 0` (multiply, not divide) |
| `vtr = 0` | `calculatedViews = 0` |
| `conversion_rate = 0` | Not used in recalc |
| `cpv = 0` | Not used in recalc |
| `frequency = 0` | `calculatedReach = null` (same as negative; **guards divide-by-zero**) |

**Verdict:** **SAFE for 0** on ctr/vtr/cpv/conversion_rate (produces `0`, not NaN/Infinity). **NEEDS-GUARD** for frequency — `0` intentionally treated like unset for reach (no `Infinity`).

### 5.2 `lib/kpi/deliveryTargets.ts` — target map

```39:49:lib/kpi/deliveryTargets.ts
    const norm = (v: unknown): number | null => {
      if (v === null || v === undefined || v === "") return null
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    map.set(key, {
      ctr: norm(row.ctr),
      conversion_rate: norm(row.conversion_rate),
      vtr: norm(row.vtr),
      frequency: norm(row.frequency),
    })
```

`0` is finite → stored as **`0`**, not coerced to null. No falsy check on numeric zero.

**Verdict:** **SAFE for 0**

### 5.3 `lib/kpi/deliveryTargetCurve.ts` — curve generation

```108:116:lib/kpi/deliveryTargetCurve.ts
    const rate = rateForMetric(item, kpiTargets, metric)
    return rate != null && rate > 0 ? deliverables * rate : 0
  ...
    const rate = rateForMetric(item, kpiTargets, metric)
    return rate != null && rate > 0 ? deliverables * rate : 0
```

Division in curve is by **day count** (`perDay = total / effDays`), not by KPI rate. A stored rate of `0` yields `total = 0` → line skipped → empty curve if all lines zero.

**Verdict:** **SAFE for 0** (no divide-by-zero; zero rate = zero contribution). Semantically equivalent to “no target band” for that metric.

### 5.4 `lib/generateMediaPlan.ts` — Excel export

```2173:2178:lib/generateMediaPlan.ts
  const writeMetric = (cell: ExcelJS.Cell, format: string, value: number | null) => {
    if (value === null) {
      cell.value = ""
    } else {
      numFmt(cell, format, value)
    }
  }
```

```2227:2231:lib/generateMediaPlan.ts
      writeMetric(ws.getCell(r, 7),  '0.00%',     row.ctr)
      writeMetric(ws.getCell(r, 8),  '0.00%',     row.vtr)
      writeMetric(ws.getCell(r, 9),  '$#,##0.00##', row.cpv)
      writeMetric(ws.getCell(r, 10), '0.00%',     row.conversion_rate)
      writeMetric(ws.getCell(r, 11), '0.0',       row.frequency)
```

- `null` → blank cell
- `0` → formatted numeric **`0`** cell (e.g. `0.00%`)

**Verdict:** **SAFE for 0**

### 5.5 Pacing KPI status logic

**Located in:** `lib/pacing/kpi/computeKpiStatus.ts` (primary), `lib/pacing/kpi/kpiCellColor.ts` (CTR cell tint).

Also searched: `lib/pacing/**`, `components/pacing-search/**` via pattern `kpi|target|status` — files listed included `buildResolvedRow.ts`, `formatKpi.ts`, `applySyncedTargets.ts`, `buildSyncPayload.ts`, `LineItemPacingTable.tsx`.

**Single-metric status** (`statusForHigherIsBetter`):

```51:55:lib/pacing/kpi/computeKpiStatus.ts
function statusForHigherIsBetter(target: number | null, actual: number | null): SingleKpiStatus {
  if (target === null || target === undefined) return "no-target";
  if (actual === null || actual === undefined) return "no-delivery";
  const threshold = target * (1 - KPI_TOLERANCE);
  return actual >= threshold ? "on-track" : "off-target";
}
```

For **target = 0**:

- Not `"no-target"` (only null/undefined are)
- `threshold = 0 * 0.9 = 0`
- Any `actual >= 0` → **"on-track"**; negative actual → **"off-target"**
- No division by target in status path

**Variance percent** (display only):

```78:81:lib/pacing/kpi/computeKpiStatus.ts
    variancePercent:
      targetCtr !== null && actualCtr !== null && targetCtr !== 0
        ? ((actualCtr - targetCtr) / targetCtr) * 100
        : null,
```

Guarded — **no divide-by-zero**; variance shows `"—"`.

**CTR cell tint:**

```45:49:lib/pacing/kpi/kpiCellColor.ts
  if (actual === null || target === null) return TINT_NO_COMPARISON;
  const normalisedTarget = normaliseCtrTarget(target);
  if (normalisedTarget <= 0) return TINT_NO_COMPARISON;
  const threshold = normalisedTarget * (1 - KPI_TOLERANCE);
  return actual >= threshold ? TINT_ON_TRACK : TINT_OFF_TARGET;
```

Target `0` → **no comparison tint** (sky), while row pill may still show on-track/off-target from `computeKpiStatus`.

**Pacing verdict:** **NEEDS-GUARD** — no crash/NaN, but **semantic mismatch**: target `0` is a “real” benchmark in status (threshold 0) yet CTR cell treats `<= 0` as no comparison. Product decision needed if zero target should mean “no benchmark” (`no-target`) vs “zero is the goal”.

---

## 6. Section 5 — Null vs zero collision

Grep for `!ctr|!cpv|!vtr|!conversion_rate|!frequency|!metric|!value` in `lib/kpi` and `components/kpis`: **no matches**.

Falsy / sentinel patterns that **would treat `0` differently from `null`**:

### 6.1 `lib/kpi/resolve.ts` — client merge layer

```64:67:lib/kpi/resolve.ts
  if (saved !== null) return { value: saved, layer: "saved" }
  if (client !== 0) return { value: client, layer: "client" }
  if (pub !== undefined && pub !== null) return { value: pub, layer: "publisher" }
  return { value: null, layer: null }
```

**Client KPI `0` is treated as “unset”** — falls through to publisher/default instead of persisting client zero. Saved campaign `0` is fine (`saved !== null`). **Collision risk** for client tier defaults, not campaign modal save path.

### 6.2 `lib/kpi/types.ts` — `kpiMetric` (client/publisher only)

```309:309:lib/kpi/types.ts
    if (v === "" || v === null || v === undefined) return 0
```

Empty → `0`, not null. Client/publisher tier conflates blank with zero at API boundary (pre-existing; campaign tier uses `kpiMetricNullable` for null).

### 6.3 `components/PublisherKpiForm.tsx` / `ClientKpiSection.tsx` — CPV parse

```657:658:components/PublisherKpiForm.tsx
                                cpv:
                                  parseFloat(e.target.value.replace(/[^0-9.-]/g, "")) || 0,
```

Empty CPV blur → `0` via `|| 0` (not null). Same pattern in client section.

### 6.4 `lib/kpi/deliveryTargetCurve.ts`

```109:109:lib/kpi/deliveryTargetCurve.ts
    return rate != null && rate > 0 ? deliverables * rate : 0
```

Stored `0` rate behaves like “no rate” for curve totals (same outcome as null for contribution).

### 6.5 `lib/kpi/recalc.ts`

```21:21:lib/kpi/recalc.ts
      row.frequency === null || row.frequency <= 0
```

`frequency = 0` → null reach (same as unset for display).

---

## 7. Confidence assessment

| Question | Assessment |
|----------|------------|
| Is this a pure validation flip? | **Mostly, for campaign save** — two primary blockers: `kpiMetricNullable` refine + modal `<= 0` checks (6 sites total). |
| Are downstream crash guards required? | **No** — no divide-by-zero or NaN found on save/read paths for ctr/vtr/cpv/conversion_rate at zero. |
| Are semantic guards required? | **Yes, possibly** — pacing status vs cell tint, frequency/reach, delivery curve ignoring zero rate, client merge `client !== 0`. |

**Confidence: 75%** that enabling campaign KPI zero is **primarily a validation-layer change** (Zod + modal). **25%** reserved for product decisions on downstream semantics (pacing “on-track” at target 0, reach at frequency 0, curve bands) — not hard failures.

If the scope includes **client-tier zero as distinct from unset**, `pickMergedMetric` (`client !== 0`) is an additional required change beyond validation.

---

## 8. Anything unexpected

1. **Client/publisher tiers already allow `0`** at Zod and UI — only **campaign tier** (`kpiMetricNullable` + `KPIEditModal`) enforces positive-only on save.

2. **`parsePercentHeuristic("0")` returns numeric `0`**, not null — empty-vs-zero distinction works in the parser; the modal is what blocks zero after parse.

3. **Pacing split behavior:** `computeKpiStatus` treats `target = 0` as a real benchmark; `ctrCellTint` treats `target <= 0` as no comparison — inconsistent UX if zero is allowed without follow-up.

4. **`rg` unavailable in shell** — audit greps run via IDE Grep tool instead; results should match repo content at audit time.

5. **No unit tests** assert `"Targets must be positive"` or `kpiMetricNullable` rejection — safe to change validation without test breakage (none found).

6. **Publisher/client forms** use `parsePercentHeuristic` without positive rejection — user can already save `0` on those tiers today.

---

*Report generated on branch `localhost`. File left untracked per instructions.*
