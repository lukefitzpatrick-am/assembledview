# Stage 2d-3-0 — Discovery Report: Empty → 0 Coercion Inventory

**Branch:** `pacing-search-rebuild` (verified)  
**Date:** 2026-05-24  
**Scope:** Read-only inventory of every touchpoint where the KPI pipeline coerces empty/missing metric values to `0`. No source modifications.

---

## Branch and status check

```
git branch --show-current  → pacing-search-rebuild
git status --short       → ?? docs/pacing/STAGE_2d-0_REPORT.md
                            ?? docs/pacing/STAGE_2d-3-0_REPORT.md (this file)
```

No modified tracked files. Proceed.

---

## Section 1 — Current `kpiMetric` schema

### 1. File and line range

`lib/kpi/types.ts` lines **306–312** (`kpiMetric` definition).

Related schemas in the same file:
- `campaignKpiItemSchema`: lines **357–371**
- `campaignKpiPatchBodySchema`: lines **375–389**

### 2. Exact code — `kpiMetric`

```typescript
const kpiMetric = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === "" || v === null || v === undefined) return 0
    const n = typeof v === "number" ? v : Number(String(v).trim())
    return Number.isFinite(n) ? n : 0
  })
```

(`lib/kpi/types.ts:306–312`)

### 3. Exact code — `campaignKpiItemSchema` (POST body)

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

(`lib/kpi/types.ts:357–371`)

Wrapped by `campaignKpiCreateBodySchema = z.array(campaignKpiItemSchema)` at line 373.

### 4. Exact code — `campaignKpiPatchBodySchema` (PATCH body)

```typescript
export const campaignKpiPatchBodySchema = z.object({
  id: z.coerce.number(),
  mp_client_name: z.string().trim().min(1).optional(),
  mba_number: z.string().trim().min(1).optional(),
  version_number: z.coerce.number().optional(),
  campaign_name: z.string().trim().min(1).optional(),
  media_type: z.string().trim().min(1).optional(),
  publisher: z.string().trim().min(1).optional(),
  bid_strategy: z.string().trim().min(1).optional(),
  ctr: kpiMetric.optional(),
  cpv: kpiMetric.optional(),
  conversion_rate: kpiMetric.optional(),
  vtr: kpiMetric.optional(),
  frequency: kpiMetric.optional(),
})
```

(`lib/kpi/types.ts:375–389`)

Note: PATCH fields use `kpiMetric.optional()` without `.default(0)`, but any present empty value still passes through the `kpiMetric` transform → `0`.

### 5. All `kpiMetric` references

Command: `grep -n "kpiMetric" --include="*.ts" --include="*.tsx" -r .`

| File | Lines |
|------|-------|
| `lib/kpi/types.ts` | 306, 320–324, 333–337, 366–370, 384–388, 398–402, 413–417 |

Every hit is in `lib/kpi/types.ts`. Additional schemas referencing `kpiMetric`:

**`publisherKpiCreateBodySchema`** (`lib/kpi/types.ts:316–325`) — required metrics, no `.default(0)`:
```typescript
  ctr: kpiMetric,
  cpv: kpiMetric,
  conversion_rate: kpiMetric,
  vtr: kpiMetric,
  frequency: kpiMetric,
```

**`publisherKpiPatchBodySchema`** (`lib/kpi/types.ts:327–338`) — optional metrics via `kpiMetric.optional()`.

**`clientKpiCreateBodySchema`** (`lib/kpi/types.ts:393–403`) — same `.optional().default(0)` pattern as campaign POST.

**`clientKpiPatchBodySchema`** (`lib/kpi/types.ts:405–419`) — optional metrics via `kpiMetric.optional()`.

---

## Section 2 — Every `?? 0`, `|| 0`, and `parseFloat || 0` pattern in KPI files

Command run:
```powershell
grep -nE "(\?\? 0|\|\| 0|parseFloat.*\|\| 0|Number\(.*\) \|\| 0)" lib/kpi/ components/kpis/ lib/pacing/kpi/ lib/xano/ --include="*.ts" --include="*.tsx" -r
```

Additional hits found in `lib/kpi/deliveryTargets.ts` and `lib/kpi/deliveryTargetCurve.ts` (same grep pattern, parent `lib/kpi/` directory).

### Files with no metric-coercion hits (confirmed)

| File | Grep result |
|------|-------------|
| `lib/kpi/campaignKpi.ts` | Nothing found |
| `lib/kpi/saveCampaignKpis.ts` | Nothing found |
| `lib/kpi/fanOut.ts` | Nothing found |
| `lib/kpi/lineItemsForFanOut.ts` | Nothing found |
| `components/kpis/KPISection.tsx` | Nothing found |
| `lib/pacing/kpi/computeKpiStatus.ts` | Nothing found |
| `lib/xano/campaignKpi.ts` | Nothing found |
| `lib/pacing/campaigns/fetchSearchPacingCampaignRows.ts` | Nothing found |

---

### `lib/kpi/types.ts`

#### Hit: `kpiMetric` transform — lines 306–312

```typescript
const kpiMetric = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === "" || v === null || v === undefined) return 0
    const n = typeof v === "number" ? v : Number(String(v).trim())
    return Number.isFinite(n) ? n : 0
  })
```

| Field | Classification | 2d-3 |
|-------|----------------|------|
| Transform | **Payload coercion** | **Must change** — core write-path coercion; empty/null/invalid → `0` today |

#### Hit: `.default(0)` on campaign POST metrics — lines 366–370

```typescript
  ctr: kpiMetric.optional().default(0),
  cpv: kpiMetric.optional().default(0),
  conversion_rate: kpiMetric.optional().default(0),
  vtr: kpiMetric.optional().default(0),
  frequency: kpiMetric.optional().default(0),
```

| Field | Classification | 2d-3 |
|-------|----------------|------|
| All five | **Payload coercion** | **Must change** — omitted metrics become `0` before POST |

#### Hit: `.default(0)` on client POST metrics — lines 398–402

Same pattern as campaign POST. **Payload coercion — must change** if client-tier KPIs share the empty→null decision (same `kpiMetric` helper).

---

### `lib/kpi/metrics.ts`

#### Hit: line 3 — `parsePercentHeuristic`

```typescript
export function parsePercentHeuristic(raw: string): number {
  const val = parseFloat(raw.replace(/[^0-9.-]/g, "")) || 0
  return val > 1 ? val / 100 : val
}
```

| Field | Classification | 2d-3 |
|-------|----------------|------|
| `parseFloat … \|\| 0` | **Default initialization** (UI input parsing) | **Must change** — empty string → `0` today |

#### Hit: `formatPercentForInput` — lines 7–9 (no `\|\| 0`, but coupled)

```typescript
export function formatPercentForInput(decimal: number): string {
  return `${(decimal * 100).toFixed(2)}%`
}
```

| Field | Classification | 2d-3 |
|-------|----------------|------|
| `decimal * 100` | **Display coercion** | **Must change** — `null` input would throw; needs null guard for blank display |

---

### `lib/kpi/resolve.ts`

#### Hit: lines 35–43 — `metricsFromRecordNoCpv`

```typescript
function metricsFromRecordNoCpv(
  r: Pick<PublisherKPI, "ctr" | "conversion_rate" | "vtr" | "frequency">,
): Record<MetricKey, number> {
  return {
    ctr: Number(r.ctr) || 0,
    conversion_rate: Number(r.conversion_rate) || 0,
    vtr: Number(r.vtr) || 0,
    frequency: Number(r.frequency) || 0,
  }
}
```

| Field | Classification | 2d-3 |
|-------|----------------|------|
| All four `Number(…) \|\| 0` | **Math coercion** (read path from DB tiers) | **Must change** — Xano `null` becomes `0`, indistinguishable from explicit zero |

#### Hit: lines 50–61 — `pickMergedMetric`

```typescript
function pickMergedMetric(
  saved: number,
  client: number,
  pub: number | undefined,
): { value: number; layer: Layer | null } {
  if (saved !== 0) return { value: saved, layer: "saved" }
  if (client !== 0) return { value: client, layer: "client" }
  if (pub !== undefined) return { value: pub, layer: "publisher" }
  return { value: 0, layer: null }
}
```

| Field | Classification | 2d-3 |
|-------|----------------|------|
| `saved !== 0` / `client !== 0` | **Math coercion** (tier merge logic) | **Must change** — uses `0` as sentinel for "missing"; conflates null and zero after upstream coercion |
| Final `return { value: 0, … }` | **Default initialization** | **Must change** — should return `null` when no tier supplies a value |

#### Hit: lines 130–144 — merge loop

```typescript
    const merged: Record<MetricKey, number> = {
      ctr: 0,
      conversion_rate: 0,
      vtr: 0,
      frequency: 0,
    }

    for (const key of METRIC_KEYS) {
      const s = campM?.[key] ?? 0
      const c = cliM?.[key] ?? 0
      const p = pubM ? pubM[key] : undefined
      const { value, layer } = pickMergedMetric(s, c, p)
      merged[key] = value
```

| Field | Classification | 2d-3 |
|-------|----------------|------|
| `merged` init to `0` | **Default initialization** | **Must change** — type should be `number \| null` |
| `campM?.[key] ?? 0` | **Math coercion** | **Must change** — null tier value becomes `0` before merge |
| `cliM?.[key] ?? 0` | **Math coercion** | **Must change** — same |

---

### `lib/kpi/recalc.ts`

#### Hit: lines 10–12 — derived metrics

```typescript
    calculatedClicks: isClick ? row.deliverables : Math.round(row.deliverables * row.ctr),
    calculatedViews: isView ? row.deliverables : Math.round(row.deliverables * row.vtr),
    calculatedReach: row.frequency > 0 ? Math.round(row.deliverables / row.frequency) : 0,
```

| Field | Classification | 2d-3 |
|-------|----------------|------|
| `row.ctr` / `row.vtr` multiply | **Math coercion** | **Must change** — `null * n` → `NaN`; needs null branch (treat as 0 derived clicks/views or skip) |
| `row.frequency > 0` | **Math coercion** | **Can stay with null guard** — `null > 0` is false, same as today for unset; but intent should be explicit |

---

### `lib/kpi/grouping.ts`

#### Hit: lines 54–66 — spend/deliverables parsing

```typescript
    const spend =
      parseFloat(
        String((item as any).grossMedia ?? (item as any).totalMedia ?? "0").replace(
          /[^0-9.-]/g,
          "",
        ),
      ) || 0
    const deliverables =
      parseFloat(
        String(
          (item as any).deliverables ?? (item as any).calculatedValue ?? "0",
        ).replace(/[^0-9.-]/g, ""),
      ) || 0
```

| Field | Classification | 2d-3 |
|-------|----------------|------|
| spend/deliverables | **Math coercion** (line-item totals, not KPI metrics) | **Can stay** — not KPI metric fields |

---

### `lib/kpi/deliveryTargets.ts`

#### Hit: lines 39–44 — `buildKPITargetsMap`

```typescript
    map.set(key, {
      ctr: Number(row.ctr) || 0,
      conversion_rate: Number(row.conversion_rate) || 0,
      vtr: Number(row.vtr) || 0,
      frequency: Number(row.frequency) || 0,
    })
```

| Field | Classification | 2d-3 |
|-------|----------------|------|
| All four | **Math coercion** (delivery dashboard target lookup) | **Must change** — null targets become `0`, downstream uses `tgt.ctr > 0` checks which treat null-as-0 same as explicit zero |

Note: `KPITargetValues` interface (`lib/kpi/deliveryTargets.ts:8–13`) types all metrics as `number`, not `number | null`.

---

### `lib/kpi/deliveryTargetCurve.ts`

#### Hit: lines 85–86 — `rateForMetric`

```typescript
  if (metric === "clicks") return Number(t.ctr) || 0
  if (metric === "views") return Number(t.vtr) || 0
```

| Field | Classification | 2d-3 |
|-------|----------------|------|
| ctr/vtr rates | **Math coercion** | **Must change** (or fix upstream `buildKPITargetsMap`) — null → `0` hides missing target |

Other hits in this file (`deliverables || 0`, `?? 0.15`, daily map `|| 0`) are spend/tolerance/delivery aggregates, not KPI metric coercion — **can stay**.

---

### `components/kpis/KPIEditModal.tsx`

#### Hit: lines 297–300 — CTR onBlur

```typescript
                                onBlur={(e) => {
                                  const parsed = parsePercentHeuristic(e.target.value)
                                  handleFieldChange(rowIndex, "ctr", parsed)
                                }}
```

Same pattern for VTR (309–312) and conversion_rate (321–324).

#### Hit: lines 333–337 — frequency onBlur

```typescript
                                onBlur={(e) => {
                                  const val =
                                    parseFloat(e.target.value.replace(/[^0-9.-]/g, "")) || 0
                                  handleFieldChange(rowIndex, "frequency", val)
                                }}
```

| Field | Classification | 2d-3 |
|-------|----------------|------|
| CTR/VTR/Conv via `parsePercentHeuristic` | **Default initialization** | **Must change** — empty blur → `0` |
| Frequency `parseFloat \|\| 0` | **Default initialization** | **Must change** — empty blur → `0` |

No `onChange` handlers — inputs are uncontrolled; only `onBlur` persists edits.

`handleFieldChange` (`lines 105–123`) types `value: number` — **must change** to `number | null`.

---

### Summary — Section 2 counts

| Category | Count |
|----------|-------|
| **Must change** coercion sites | **22** |
| **Can stay** (non-metric fields) | **6** (grouping spend/deliverables + deliveryTargetCurve daily/tolerance) |
| **Maybe** (needs product call) | **1** (`pickMergedMetric` treatment of explicit `0` at saved/client tier vs null) |

---

## Section 3 — `parsePercentHeuristic` and other parsers

### Full contents of `lib/kpi/metrics.ts`

Both exported functions:

```typescript
/** Parse user percent input: accept decimals (0.08) or whole percent (8 → 0.08). */
export function parsePercentHeuristic(raw: string): number {
  const val = parseFloat(raw.replace(/[^0-9.-]/g, "")) || 0
  return val > 1 ? val / 100 : val
}

export function formatPercentForInput(decimal: number): string {
  return `${(decimal * 100).toFixed(2)}%`
}
```

No `parseFloatHeuristic` exists in the codebase.

### Function: `parsePercentHeuristic`

| Item | Detail |
|------|--------|
| Signature | `(raw: string) => number` |
| Empty input | Returns **`0`** (`parseFloat("")` is `NaN`; `\|\| 0` coerces) |
| Call sites | 7 total (see below) |
| Return type change needed | **Yes** — should become `number \| null` for 2d-3 |

### Function: `formatPercentForInput`

| Item | Detail |
|------|--------|
| Signature | `(decimal: number) => string` |
| Empty/null input | Not handled — parameter typed `number` only |
| Empty string input N/A | Caller passes `row.ctr` etc. |
| 2d-3 | **Must update** signature to accept `number \| null`; return `""` or placeholder for null |

### Call sites — `parsePercentHeuristic`

Command: `grep -n "parsePercentHeuristic" --include="*.ts" --include="*.tsx" -r .`

#### 1. `components/kpis/KPIEditModal.tsx:298`

```typescript
                                onBlur={(e) => {
                                  const parsed = parsePercentHeuristic(e.target.value)
                                  handleFieldChange(rowIndex, "ctr", parsed)
                                }}
```

Expects `number`; writes to `ResolvedKPIRow.ctr: number`. **Parser + call site + type must change.**

#### 2. `components/kpis/KPIEditModal.tsx:310` — VTR (same pattern)

#### 3. `components/kpis/KPIEditModal.tsx:322` — conversion_rate (same pattern)

#### 4. `components/dashboard/ClientKpiSection.tsx:878`

```typescript
                                [field]: parsePercentHeuristic(e.target.value),
```

Context: client KPI form state update. Field typed as `number` in client KPI shapes. **Must change** if client tier participates in empty→null.

#### 5. `components/dashboard/ClientKpiSection.tsx:1030` — pending row (same pattern)

#### 6. `components/PublisherKpiForm.tsx:643`

```typescript
                                [field]: parsePercentHeuristic(e.target.value),
```

Publisher KPI form. **Must change** if publisher tier participates (publisher tier currently **accepts 0** per `resolve.ts:47–48` comment).

#### 7. `components/PublisherKpiForm.tsx:776` — pending row (same pattern)

---

## Section 4 — `KPIEditModal` input parsing

### 1. Handlers for four editable metrics

**CTR** (`components/kpis/KPIEditModal.tsx:291–301`):

```typescript
                            <td className="border-b border-border/30 px-2 py-1 text-right">
                              <input
                                type="text"
                                className={inputClass}
                                key={`ctr-${row.lineItemId}-${row.ctr}`}
                                defaultValue={formatPercentForInput(row.ctr)}
                                onBlur={(e) => {
                                  const parsed = parsePercentHeuristic(e.target.value)
                                  handleFieldChange(rowIndex, "ctr", parsed)
                                }}
                              />
                            </td>
```

**VTR** (303–313): identical pattern with `row.vtr`, field `"vtr"`.

**conversion_rate** (315–325): identical pattern with `row.conversion_rate`, field `"conversion_rate"`.

**frequency** (327–338):

```typescript
                            <td className="border-b border-border/30 px-2 py-1 text-right">
                              <input
                                type="text"
                                className={inputClass}
                                key={`freq-${row.lineItemId}-${row.frequency}`}
                                defaultValue={row.frequency.toFixed(1)}
                                onBlur={(e) => {
                                  const val =
                                    parseFloat(e.target.value.replace(/[^0-9.-]/g, "")) || 0
                                  handleFieldChange(rowIndex, "frequency", val)
                                }}
                              />
                            </td>
```

No `onChange` handlers on any of the four inputs.

### 2. State shape written

`handleFieldChange` (`lines 105–123`):

```typescript
  const handleFieldChange = React.useCallback(
    (
      rowIndex: number,
      field: "ctr" | "vtr" | "conversion_rate" | "frequency",
      value: number,
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

Immutable update via `setEditedRows`: shallow-copy array, spread row, assign field, run `recalcRow`, replace index.

Initial state seeded on open (`lines 100–103`): `setEditedRows([...kpiRows])`.

### 3. Render when underlying value is `null`

**Not possible today** — `ResolvedKPIRow` / `CampaignKPI` metric fields are typed `number` (`lib/kpi/types.ts:44–48`). Resolver always produces `number` (coerced to `0`).

If value were `null`:
- Percent fields: `formatPercentForInput(null)` would **throw** (`null * 100`).
- Frequency: `null.toFixed(1)` would **throw**.

### 4. Render when underlying value is `0`

- Percent fields: `formatPercentForInput(0)` → **`"0.00%"`**
- Frequency: `row.frequency.toFixed(1)` → **`"0.0"`**

### 5. Visual distinction null vs 0

**None today.** Everything unset resolves to `0` upstream; modal always shows formatted zero strings. Empty blur also writes `0`. Null and zero would look identical even after type changes unless `formatPercentForInput` / frequency binding are updated to show blank for null.

---

## Section 5 — `ResolvedKPIRow` shape and downstream consumers

### Current type (`lib/kpi/types.ts:32–63`)

```typescript
export interface CampaignKPI {
  id?: number
  created_at?: number
  // ... identity fields ...
  ctr: number
  cpv: number
  conversion_rate: number
  vtr: number
  frequency: number
}

export interface ResolvedKPIRow extends CampaignKPI {
  lineItemId: string
  lineItemLabel: string
  spend: number
  deliverables: number
  buyType: string
  source: "client" | "publisher" | "default" | "manual" | "saved"
  isManuallyEdited: boolean
  calculatedClicks: number
  calculatedViews: number
  calculatedReach: number
}
```

### Per-metric type summary

| Metric | Current TS type | Nullable today? |
|--------|-----------------|-----------------|
| `ctr` | `number` | No (always coerced to number) |
| `cpv` | `number` | No (derived or 0) |
| `conversion_rate` | `number` | No |
| `vtr` | `number` | No |
| `frequency` | `number` | No |

### Consumers of `ResolvedKPIRow` metric fields

Filtered to campaign-KPI pipeline consumers (excluding unrelated Snowflake `.ctr` on pacing rows).

#### `lib/kpi/recalc.ts:10–12`

```typescript
    calculatedClicks: isClick ? row.deliverables : Math.round(row.deliverables * row.ctr),
    calculatedViews: isView ? row.deliverables : Math.round(row.deliverables * row.vtr),
    calculatedReach: row.frequency > 0 ? Math.round(row.deliverables / row.frequency) : 0,
```

| Metric | Breaks on null? |
|--------|---------------|
| ctr, vtr | **Yes** — `NaN` from multiply |
| frequency | **Maybe** — `null > 0` is false (safe), but division path never taken |

#### `lib/kpi/recalc.ts:27–31` — `mergeManualKpiOverrides`

Copies `p.ctr`, `p.cpv`, etc. **Maybe** — assignment only; breaks if downstream expects number.

#### `lib/kpi/fanOut.ts:222–226`

```typescript
        ctr: row.ctr,
        cpv: row.cpv,
        conversion_rate: row.conversion_rate,
        vtr: row.vtr,
        frequency: row.frequency,
```

**No** runtime break — passes null through if typed. **Must change** `CampaignKPI` type + Zod schema to accept null.

#### `lib/kpi/resolve.ts:158–162`

Assigns merged metrics to row. **Must change** upstream merge to produce null.

#### `components/kpis/KPIEditModal.tsx:296,308,320,332`

`formatPercentForInput(row.ctr)` / `row.frequency.toFixed(1)`. **Yes** — throws on null.

#### `components/kpis/KPISection.tsx`

... 

Uses `calculatedClicks/Views/Reach` only in summary — not raw metrics. **No** direct metric read; indirect via recalc.

#### `lib/generateMediaPlan.ts:2219–2223` — KPI Excel export

```typescript
      numFmt(ws.getCell(r, 7),  '0.00%',     row.ctr)
      numFmt(ws.getCell(r, 8),  '0.00%',     row.vtr)
      numFmt(ws.getCell(r, 9),  '$#,##0.00##', row.cpv)
      numFmt(ws.getCell(r, 10), '0.00%',     row.conversion_rate)
      numFmt(ws.getCell(r, 11), '0.0',       row.frequency)
```

**Maybe** — depends on ExcelJS `numFmt` behavior with null (likely blank cell or error).

#### `app/mediaplans/mba/[mba_number]/edit/page.tsx:6049–6053`

Maps `ctr: r.ctr`, etc. into KPI sheet rows. **Maybe** — same as Excel path.

#### `lib/kpi/deliveryTargets.ts` + delivery adapters

Reads `CampaignKPI[]` via `buildKPITargetsMap`, not `ResolvedKPIRow` directly. Coerces with `Number() || 0`. **Yes** for null semantics — already covered in Section 2.

#### Pacing path — `lib/pacing/campaigns/fetchSearchPacingCampaignRows.ts:356–360`

```typescript
      ctr: ck.ctr,
      cpv: ck.cpv,
      conversionRate: ck.conversion_rate,
      vtr: ck.vtr,
      frequency: ck.frequency,
```

**No** coercion — preserves Xano nulls into `KpiTargets`. Already compatible with empty→null write path.

---

## Section 6 — Pacing-side `computeKpiStatus` verification

### 1. Function signatures

```typescript
function statusForHigherIsBetter(target: number | null, actual: number | null): SingleKpiStatus

export function buildKpiComparisons(row: SearchPacingCampaignRow): KpiComparison[]

export function computeRowKpiStatus(row: SearchPacingCampaignRow): RowKpiStatus
```

(`lib/pacing/kpi/computeKpiStatus.ts:51, 69, 119`)

### 2. Null vs zero branches

```typescript
function statusForHigherIsBetter(target: number | null, actual: number | null): SingleKpiStatus {
  if (target === null || target === undefined) return "no-target";
  if (actual === null || actual === undefined) return "no-delivery";
  const threshold = target * (1 - KPI_TOLERANCE);
  return actual >= threshold ? "on-track" : "off-target";
}
```

(`lib/pacing/kpi/computeKpiStatus.ts:51–56`)

Target extraction:

```typescript
  const targetCtr = targets?.ctr ?? null;
  const actualCtr = row.ctr ?? null;
```

(`lib/pacing/kpi/computeKpiStatus.ts:72–73`)

Conversion rate target:

```typescript
  const targetConvRate = targets?.conversionRate ?? null;
```

(`lib/pacing/kpi/computeKpiStatus.ts:85`)

Row-level pending when all metrics lack targets:

```typescript
  const hasAnyTarget = comparisons.some((c) => c.status !== "no-target");
  if (!hasAnyTarget) return "kpi-pending";
```

(`lib/pacing/kpi/computeKpiStatus.ts:124–125`)

Comment at lines 108–111 explicitly documents: row exists but all Search-relevant fields empty → `'kpi-pending'`.

### 3. Coercion check

**No `?? 0` or `\|\| 0` on KPI targets** in this file. Uses `?? null` only.

Variance guard treats `targetCtr !== 0` before division (`lines 79–80, 95–96`) — explicit zero target skips variance calc; null target already filtered by `statusForHigherIsBetter`.

**Conclusion:** `lib/pacing/kpi/computeKpiStatus.ts` is **already correct** for null targets. **2d-3 does not need to touch this file** unless product wants explicit `0` targets to behave differently from null (see Section 10).

---

## Section 7 — Existing rows in Xano

### 1. Wire-level expectation

**Pacing reader** — `CampaignKpiRow` (`lib/xano/campaignKpi.ts:22–26`):

```typescript
  ctr: number | null;
  cpv: number | null;
  conversion_rate: number | null;
  vtr: number | null;
  frequency: number | null;
```

**Editor/domain type** — `CampaignKPI` (`lib/kpi/types.ts:44–48`) declares metrics as **`number`** (non-null). Mismatch: editor type does not reflect wire nullability.

**Read path coercion:** Editor fetch casts raw JSON to `CampaignKPI[]` without normalisation (`lib/kpi/campaignKpi.ts:26–30`). Resolver then runs `Number(r.ctr) || 0` (`lib/kpi/resolve.ts:39`), so wire `null` becomes `0` in UI.

**Write path coercion:** `kpiMetric` Zod transform + `.default(0)` ensures POST body never sends null today.

Empty string `""` on wire: transformed to `0` by `kpiMetric` if ever PATCH/POST'd through API.

Omitted field on POST: `.default(0)` supplies `0`.

### 2. What Xano actually returns (curatif002 / PENFOLD015)

**Unknown — requires sample of current data.**

No H2d-1 curl response bodies with `campaign_kpi` metric values were found in the repo. References to `curatif002` exist in smoke scripts and 2d-0 report (line-item / Snowflake context) but not as archived `campaign_kpi` JSON.

**Expectation (inferred from write path, medium confidence):** Historical saves through the editor likely 중 certainly persisted **`0`** for unset metrics because:
1. Modal empty blur → `0`
2. Resolver default tier → `0`
3. Zod `kpiMetric` + `.default(0)` on POST

Post-2d-3, existing rows with stored `0` will **display as `"0.00%"` / `"0.0"`**, not blank, until manually cleared or migrated. Rows that somehow have wire `null` (if Xano ever stored them) would currently display as zero anyway due to read coercion.

---

## Section 8 — `fanOutKpiPayload` and save path

### Full metric assignment (`lib/kpi/fanOut.ts:215–228`)

```typescript
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
```

### Per-field trace

| Field | Source | Coercion in fanOut? | If `row.ctr` is `null` |
|-------|--------|---------------------|-------------------------|
| `ctr` | `row.ctr` | **None** | Passes `null` through to payload object |
| `cpv` | `row.cpv` | **None** | Passes `null` |
| `conversion_rate` | `row.conversion_rate` | **None** | Passes `null` |
| `vtr` | `row.vtr` | **None** | Passes `null` |
| `frequency` | `row.frequency` | **None** | Passes `null` |

**Downstream save chain:**
1. `fanOutKpiPayload` → `CampaignKPI[]`
2. `saveCampaignKpisFromRows` (`lib/kpi/saveCampaignKpis.ts:33`) → `saveCampaignKPIs(payload)`
3. `lib/api/kpi.ts:52–58` → POST `/api/kpis/campaign`
4. `app/api/kpis/campaign/route.ts:40` → `campaignKpiCreateBodySchema.safeParse(body)` — **coercion happens here today**
5. `createCampaignKpis` → Xano POST per row

**2d-3 change split:** fanOut already forwards values faithfully; the **Zod schema** (Section 1) is the write-side gate that must allow and preserve `null`. Resolver/modal must stop producing `0` for unset before fanOut runs.

---

## Section 9 — Test coverage

Command:
```powershell
grep -rn "kpiMetric|parsePercentHeuristic|fanOutKpiPayload|computeKpiStatus" tests/ __tests__/ test/ --include="*.ts" --include="*.tsx" 2>nul
```

No matches under `tests/`, `__tests__/`, or `test/` at repo root.

**Existing tests (under `lib/kpi/__tests__/`):**

| File | What it tests | Empty→0 locked? |
|------|---------------|-----------------|
| `lib/kpi/__tests__/resolve.test.ts` | Tier merge precedence, CPV derivation, publisher id mapping, media aliases | **Yes** — test 5 `"All missing … CTR 0"`, test 2 `"Campaign CTR 0 falls through to client"`, test 4 `"Publisher tier accepts CTR 0"` |
| `lib/kpi/__tests__/fanOut.test.ts` | Line-item id matching, alias lookup, bid_strategy fallback | Partial — fixture rows use `ctr: 0` defaults; no null payload assertion |

**No tests** for `computeKpiStatus`, `parsePercentHeuristic`, `kpiMetric` Zod, or `KPIEditModal`.

Per audit methodology, 2d-3 won't add new tests, but **`resolve.test.ts` will need updates** when merge semantics change (null vs 0).

---

## Section 10 — Open questions for Luke

1. **Explicit zero vs unset at campaign/client tier:** `pickMergedMetric` (`lib/kpi/resolve.ts:58–59`) treats saved/client `0` as "missing" and falls through. After 2d-3, unset becomes `null`. Should an **explicit user-entered `0`** remain `0` and display as `"0.00%"`, or also be storable/distinct from null? This affects whether merge logic uses `null` only vs `null || 0` fall-through.

2. **Publisher tier still accepts zero:** Comment at `lib/kpi/resolve.ts:47–48`: "Publisher tier: accept 0." If publisher KPI defaults stay `number` with `0`, resolver may still surface `0` from publisher when campaign/client are null — is that intended?

3. **Modal UX for null:** Should unset metrics show **blank input**, **"—"**, or a placeholder like `"(not set)"`? Today both null (hypothetical) and zero show `"0.00%"` / `"0.0"`.

4. **Clearing a field:** Blurring an emptied percent input currently writes `0`. Should blur-to-empty write **`null`** (and require a dedicated "clear" action)?

5. **Historical Xano data:** Unknown whether any rows have wire `null` vs all zeros (Section 7). Need a sample GET for `curatif002` / `PENFOLD015` to confirm migration/communication scope.

6. **Client/publisher KPI schemas:** Shared `kpiMetric` also powers `clientKpiCreateBodySchema` and `publisherKpiCreateBodySchema`. Is empty→null **campaign-only**, or all three tiers?

7. **`computeKpiStatus` + explicit zero target:** If target is **`0`** (not null), `statusForHigherIsBetter` compares actual against threshold `0`. Should explicit zero targets be impossible (validation), or treated as `no-target`?

---

## Executive summary

The KPI pipeline coerces empty/missing metrics to **`0` at every layer**: Zod `kpiMetric` transform + POST `.default(0)`, UI parsers (`parsePercentHeuristic`, frequency blur), resolver read/merge (`Number() || 0`, `?? 0`, `pickMergedMetric` zero-sentinel), and delivery target maps. **Pacing read path** (`fetchSearchPacingCampaignRows`, `computeKpiStatus`) already preserves and respects **null** — the gap is almost entirely on the **editor write/resolver side**.

**Totals:**
- **Must-change coercion sites:** 22
- **Unknown items:** 1 (actual Xano field values for sample campaigns); 7 open product questions
- **Estimated files for Stage 2d-3:** **~14** (`lib/kpi/types.ts`, `metrics.ts`, `resolve.ts`, `recalc.ts`, `deliveryTargets.ts`, `deliveryTargetCurve.ts`, `components/kpis/KPIEditModal.tsx`, `lib/kpi/__tests__/resolve.test.ts`, plus possibly `ClientKpiSection.tsx`, `PublisherKpiForm.tsx`, `lib/generateMediaPlan.ts`, `CampaignKPI`/`ResolvedKPIRow` consumers in edit pages)

**Safe to leave untouched:** `lib/pacing/kpi/computeKpiStatus.ts`, `lib/kpi/fanOut.ts` (pass-through only), `lib/xano/campaignKpi.ts`, `lib/pacing/campaigns/fetchSearchPacingCampaignRows.ts` (already null-safe on read).
