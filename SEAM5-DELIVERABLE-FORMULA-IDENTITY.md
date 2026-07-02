# SEAM5 Deliverable Formula Identity

Read-only discovery report. Scope: deliverable / budget / buy-type arithmetic identity across `lib/mediaplan/deliverableBudget.ts`, `lib/mediaplan/expertChannelMappings.ts`, and stray formula homes in `lib/` and `components/`.

Fee boundary: `computeBurstAmounts` and fee/media split arithmetic are treated as authoritative and out of scope. Fee-related sites are recorded as call sites only.

## A. Canonical Primitives In `deliverableBudget.ts`

### `coerceBuyTypeWithDevWarn` at `lib/mediaplan/deliverableBudget.ts:43`

```ts
export function coerceBuyTypeWithDevWarn(
  buyType: string | undefined | null,
  context: string
): BuyType {
  const bt = String(buyType || "").toLowerCase() as BuyType;
  if (!BUY_TYPE_RUNTIME_SET.has(bt) && process.env.NODE_ENV === "development") {
    console.warn(
      `[deliverableBudget] Unrecognised buyType "${String(buyType)}" in ${context}; using string as BuyType (may default to 0).`
    );
  }
  return bt;
}
```

Buy-type cases: no arithmetic. Runtime set includes `package`, `spots`, `cpt`, `cpp`, `panels`, `insertions`, `cpm`, `cpc`, `screens`, `cpcv`, `cpi`, `cps`, `cpv`, `fixed_cost`, `weekly_rate`, `monthly_rate`, `package_inclusions`, `bonus`.

### `deliverablesFromBudget` at `lib/mediaplan/deliverableBudget.ts:84`

```ts
export function deliverablesFromBudget(
  buyType: BuyType,
  netBudget: number,
  unitRate: number
): number {
  if (buyType === "bonus" || buyType === "package_inclusions") {
    return NaN;
  }
  if (invalidUnitRate(unitRate)) {
    return 0;
  }

  switch (buyType) {
    case "package":
    case "spots":
    case "cpt":
    case "cpp":
    case "panels":
    case "weekly_rate":
    case "monthly_rate":
      return netBudget / unitRate;
    case "cpm":
      return (netBudget / unitRate) * 1000;
    case "cpc":
    case "insertions":
    case "screens":
    case "cpv":
    case "cpcv":
    case "cpi":
    case "cps":
      return netBudget / unitRate;
    case "fixed_cost":
      return 1;
    default:
      return 0;
  }
}
```

Arithmetic by case:

| Buy type(s) | Arithmetic |
|---|---|
| `bonus`, `package_inclusions` | `NaN` before switch |
| invalid / zero `unitRate` | `0` before switch |
| `package`, `spots`, `cpt`, `cpp`, `panels`, `weekly_rate`, `monthly_rate` | `netBudget / unitRate` |
| `cpm` | `(netBudget / unitRate) * 1000` |
| `cpc`, `insertions`, `screens`, `cpv`, `cpcv`, `cpi`, `cps` | `netBudget / unitRate` |
| `fixed_cost` | `1` |
| default | `0` |

### `computeDeliverableFromMedia` at `lib/mediaplan/deliverableBudget.ts:155`

```ts
export function computeDeliverableFromMedia({
  buyType,
  rawBudget,
  buyAmount,
  budgetIncludesFees,
  feePct,
}: ComputeDeliverableInput): number {
  if (buyType === "bonus" || buyType === "package_inclusions") {
    // Manual qty - caller preserves existing calculatedValue. Return NaN to
    // signal "no recompute".
    return NaN;
  }
  const netMedia = netFromGross(rawBudget, budgetIncludesFees, feePct);
  return deliverablesFromBudget(buyType, netMedia, buyAmount);
}
```

Buy-type cases:

| Buy type(s) | Arithmetic |
|---|---|
| `bonus`, `package_inclusions` | `NaN` before fee/media step |
| all others | fee-boundary net media via `netFromGross`, then `deliverablesFromBudget(buyType, netMedia, buyAmount)` |

### `netMediaFromDeliverables` at `lib/mediaplan/deliverableBudget.ts:171`

```ts
export function netMediaFromDeliverables(
  buyType: BuyType,
  deliverables: number,
  unitRate: number
): number {
  if (buyType === "bonus" || buyType === "package_inclusions") {
    return 0;
  }
  if (nonFiniteInputs(deliverables, unitRate)) {
    return 0;
  }

  switch (buyType) {
    case "package":
    case "spots":
    case "cpt":
    case "cpp":
    case "panels":
    case "weekly_rate":
    case "monthly_rate":
    case "cpc":
    case "insertions":
    case "screens":
    case "cpv":
    case "cpcv":
    case "cpi":
    case "cps":
      return deliverables * unitRate;
    case "cpm":
      return (deliverables / 1000) * unitRate;
    case "fixed_cost":
      return unitRate;
    default:
      return 0;
  }
}
```

Arithmetic by case:

| Buy type(s) | Arithmetic |
|---|---|
| `bonus`, `package_inclusions` | `0` before switch |
| non-finite inputs | `0` before switch |
| `package`, `spots`, `cpt`, `cpp`, `panels`, `weekly_rate`, `monthly_rate`, `cpc`, `insertions`, `screens`, `cpv`, `cpcv`, `cpi`, `cps` | `deliverables * unitRate` |
| `cpm` | `(deliverables / 1000) * unitRate` |
| `fixed_cost` | `unitRate` |
| default | `0` |

### `grossFromNet` at `lib/mediaplan/deliverableBudget.ts:208`

```ts
export function grossFromNet(
  netMedia: number,
  budgetIncludesFees: boolean,
  feePct: number
): number {
  if (!budgetIncludesFees) {
    return netMedia;
  }
  if (feePct >= 100) {
    return 0;
  }
  return netMedia / (1 - feePct / 100);
}
```

Buy-type cases: none. Fee-boundary primitive, quoted as requested but not audited.

### `netFromGross` at `lib/mediaplan/deliverableBudget.ts:222`

```ts
export function netFromGross(
  grossBudget: number,
  budgetIncludesFees: boolean,
  feePct: number
): number {
  if (!budgetIncludesFees) {
    return grossBudget;
  }
  return grossBudget * (1 - feePct / 100);
}
```

Buy-type cases: none. Fee-boundary primitive, quoted as requested but not audited.

### `roundDeliverables` at `lib/mediaplan/deliverableBudget.ts:233`

```ts
export function roundDeliverables(buyType: BuyType, value: number): number {
  switch (buyType) {
    case "cpm":
    case "cpc":
    case "insertions":
    case "screens":
    case "cpv":
    case "cpcv":
    case "cpi":
    case "cps":
      return Math.round(value);
    case "fixed_cost":
      return 1;
    default:
      return Math.round(value * 100) / 100;
  }
}
```

Arithmetic by case:

| Buy type(s) | Arithmetic |
|---|---|
| `cpm`, `cpc`, `insertions`, `screens`, `cpv`, `cpcv`, `cpi`, `cps` | integer `Math.round(value)` |
| `fixed_cost` | `1` |
| default, including `package`, `spots`, `cpt`, `cpp`, `panels`, `weekly_rate`, `monthly_rate`, `bonus`, `package_inclusions` | two decimal places via `Math.round(value * 100) / 100` |

### `addExpertWeekColumnDelta` at `lib/mediaplan/deliverableBudget.ts:259`

```ts
export function addExpertWeekColumnDelta(
  weeklyValues: Record<string, number | "">,
  key: string,
  add: number
): void {
  const prevNum = parseWeekCell(weeklyValues[key]);
  weeklyValues[key] = prevNum + add;
}
```

Buy-type cases: none. Arithmetic: `prevNum + add`.

### `distributeBurstDeliverablesToExpertWeeks` at `lib/mediaplan/deliverableBudget.ts:272`

```ts
export function distributeBurstDeliverablesToExpertWeeks(
  buyType: BuyType,
  total: number,
  overlapKeys: string[],
  weeklyValues: Record<string, number | "">
): void {
  if (overlapKeys.length === 0 || !Number.isFinite(total)) return;

  if (buyType === "fixed_cost") {
    addExpertWeekColumnDelta(weeklyValues, overlapKeys[0]!, 1);
    return;
  }

  const n = overlapKeys.length;
  const each = total / n;
  let allocated = 0;
  for (let i = 0; i < n - 1; i++) {
    const v = roundDeliverables(buyType, each);
    addExpertWeekColumnDelta(weeklyValues, overlapKeys[i]!, v);
    allocated += v;
  }
  addExpertWeekColumnDelta(
    weeklyValues,
    overlapKeys[n - 1]!,
    roundDeliverables(buyType, total - allocated)
  );
}
```

Arithmetic by case:

| Buy type(s) | Arithmetic |
|---|---|
| `fixed_cost` | add `1` into first overlapping week |
| all others | split `total / overlapKeys.length`, round each earlier week with `roundDeliverables`, final week gets rounded remainder `total - allocated` |

## B. Per-Channel-Named Expert Helpers In `expertChannelMappings.ts`

`deliverablesFromBudget` and `grossFromNet` are not locally defined in `expertChannelMappings.ts`; they are imported from `./deliverableBudget` at `lib/mediaplan/expertChannelMappings.ts:6-8`.

### `formatBurstBudget` at `lib/mediaplan/expertChannelMappings.ts:177`

```ts
function formatBurstBudget(n: number): string {
  if (!Number.isFinite(n)) return "0"
  const rounded = Math.round(n * 100) / 100
  return String(rounded)
}
```

Buy-type cases: none. Formatting helper only.

### `expertRowRawCost` at `lib/mediaplan/expertChannelMappings.ts:189`

```ts
export function expertRowRawCost(
  buyType: string | undefined | null,
  unitRate: number,
  qty: number
): number {
  const bt = String(buyType || "").toLowerCase()
  const r = Number.isFinite(unitRate) ? unitRate : 0
  const q = Number.isFinite(qty) ? qty : 0
  if (bt === "bonus") return 0
  if (bt === "cpm") return (q / 1000) * r
  return netMediaFromDeliverables(bt as BuyType, q, r)
}
```

Buy-type cases:

| Buy type(s) | Arithmetic |
|---|---|
| `bonus` | `0` |
| `cpm` | `(q / 1000) * r` |
| all others | `netMediaFromDeliverables(bt as BuyType, q, r)` |

### `oohNetBudgetForDeliverables` at `lib/mediaplan/expertChannelMappings.ts:203`

```ts
function oohNetBudgetForDeliverables(
  rawBudget: number,
  budgetIncludesFees: boolean,
  feePct: number
): number {
  return netFromGross(rawBudget, budgetIncludesFees, feePct)
}
```

Buy-type cases: none. Fee-boundary wrapper call.

### `radioNetBudgetForDeliverables` at `lib/mediaplan/expertChannelMappings.ts:212`

```ts
function radioNetBudgetForDeliverables(
  rawBudget: number,
  budgetIncludesFees: boolean,
  feePct: number
): number {
  if (!budgetIncludesFees) return rawBudget
  return (rawBudget * (100 - (feePct || 0))) / 100
}
```

Buy-type cases: none. Fee-boundary helper; arithmetic equivalent to `netFromGross` for normal fee inputs.

### `oohCalculatedDeliverables` at `lib/mediaplan/expertChannelMappings.ts:221`

```ts
function oohCalculatedDeliverables(
  buyType: string,
  netBudget: number,
  buyAmount: number,
  bonusDeliverables?: number
): number {
  const amt = buyAmount || 0
  switch (buyType) {
    case "cpc":
    case "cpv":
    case "panels":
      return amt !== 0 ? netBudget / amt : 0
    case "cpm":
      return amt !== 0 ? (netBudget / amt) * 1000 : 0
    case "fixed_cost":
    case "package":
      return 1
    case "bonus":
      return bonusDeliverables ?? 0
    default:
      return 0
  }
}
```

Buy-type cases:

| Buy type(s) | Arithmetic |
|---|---|
| `cpc`, `cpv`, `panels` | `amt !== 0 ? netBudget / amt : 0` |
| `cpm` | `amt !== 0 ? (netBudget / amt) * 1000 : 0` |
| `fixed_cost`, `package` | `1` |
| `bonus` | `bonusDeliverables ?? 0` |
| default | `0` |

### `newspaperCalculatedDeliverables` at `lib/mediaplan/expertChannelMappings.ts:246`

```ts
function newspaperCalculatedDeliverables(
  buyType: string,
  netBudget: number,
  buyAmount: number,
  bonusDeliverables?: number
): number {
  const bt = String(buyType || "").toLowerCase()
  const amt = buyAmount || 0
  switch (bt) {
    case "cpc":
    case "cpv":
    case "insertions":
      return amt !== 0 ? netBudget / amt : 0
    case "cpm":
      return amt !== 0 ? (netBudget / amt) * 1000 : 0
    case "fixed_cost":
    case "package":
    case "package_inclusions":
      return 1
    case "bonus":
      return bonusDeliverables ?? 0
    default:
      return 0
  }
}
```

Buy-type cases:

| Buy type(s) | Arithmetic |
|---|---|
| `cpc`, `cpv`, `insertions` | `amt !== 0 ? netBudget / amt : 0` |
| `cpm` | `amt !== 0 ? (netBudget / amt) * 1000 : 0` |
| `fixed_cost`, `package`, `package_inclusions` | `1` |
| `bonus` | `bonusDeliverables ?? 0` |
| default | `0` |

### `deriveUnitRateFromBursts` at `lib/mediaplan/expertChannelMappings.ts:1006`

```ts
function deriveUnitRateFromBursts(
  bursts: StandardMediaBurst[],
  buyType?: string
): number {
  for (const b of bursts) {
    if (buyType === "panels") {
      const rate = parseNum(b.buyAmount)
      if (rate > 0) return rate
    }
    const gross = parseNum(b.budget)
    const qty = parseNum(b.buyAmount)
    if (qty > 0 && gross > 0) return gross / qty
  }
  return 0
}
```

Buy-type cases: `panels` returns parsed `buyAmount`; other buy types derive `gross / qty`. This is a unit-rate derivation helper, not deliverable calculation.

### `deriveRadioStandardUnitRateFromBursts` at `lib/mediaplan/expertChannelMappings.ts:1023`

```ts
function deriveRadioStandardUnitRateFromBursts(bursts: StandardMediaBurst[]): number {
  for (const b of bursts) {
    const r = parseNum(b.buyAmount)
    if (r > 0) return r
  }
  return 0
}
```

Buy-type cases: none. Unit-rate derivation helper.

### `distributeRadioStandardDeliverablesToWeeks` at `lib/mediaplan/expertChannelMappings.ts:1064`

```ts
function distributeRadioStandardDeliverablesToWeeks(
  buyType: string,
  total: number,
  overlapKeys: string[],
  weeklyValues: Record<string, number | "">
): void {
  const bt = String(buyType || "").toLowerCase() as BuyType
  if (overlapKeys.length === 0 || !Number.isFinite(total)) return

  if (bt === "fixed_cost") {
    addRadioWeeklyDelta(weeklyValues, overlapKeys[0]!, 1)
    return
  }

  const n = overlapKeys.length
  const each = total / n
  let allocated = 0
  for (let i = 0; i < n - 1; i++) {
    const v = roundDeliverables(bt, each)
    addRadioWeeklyDelta(weeklyValues, overlapKeys[i]!, v)
    allocated += v
  }
  addRadioWeeklyDelta(
    weeklyValues,
    overlapKeys[n - 1]!,
    roundDeliverables(bt, total - allocated)
  )
}
```

Buy-type cases: same structure as canonical `distributeBurstDeliverablesToExpertWeeks`, but private to radio and uses local `addRadioWeeklyDelta`.

### `panelsBurstQtyForExpert` at `lib/mediaplan/expertChannelMappings.ts:1094`

```ts
function panelsBurstQtyForExpert(b: StandardMediaBurst): number {
  const ba = parseNum(b.buyAmount)
  const cRaw = b.calculatedValue
  const c =
    typeof cRaw === "number" && Number.isFinite(cRaw)
      ? cRaw
      : parseNum(cRaw)
  if (Number.isFinite(c) && c > 0 && ba > 0 && ba < c) {
    return ba
  }
  if (Number.isFinite(c) && c > 0) {
    return c
  }
  return ba
}
```

Buy-type cases: helper is panel-specific. Chooses `buyAmount` when it is positive and less than calculated value, else calculated value, else `buyAmount`.

### `sumGrossBursts` at `lib/mediaplan/expertChannelMappings.ts:1110`

```ts
function sumGrossBursts(bursts: StandardMediaBurst[]): number {
  return bursts.reduce((s, b) => s + parseNum(b.budget), 0)
}
```

Buy-type cases: none. Sum helper only.

### `deriveOohStandardUnitRateFromBursts` at `lib/mediaplan/expertChannelMappings.ts:1114`

```ts
function deriveOohStandardUnitRateFromBursts(bursts: StandardMediaBurst[]): number {
  for (const b of bursts) {
    const r = parseNum(b.buyAmount)
    if (r > 0) return r
  }
  return 0
}
```

Buy-type cases: none. Unit-rate derivation helper.

### `bvodCalculatedDeliverables` at `lib/mediaplan/expertChannelMappings.ts:1704`

```ts
function bvodCalculatedDeliverables(
  buyType: string,
  netBudget: number,
  buyAmount: number,
  bonusDeliverables?: number
): number {
  const bt = String(buyType || "").toLowerCase()
  const amt = buyAmount || 0
  switch (bt) {
    case "cpc":
    case "cpv":
      return amt !== 0 ? netBudget / amt : 0
    case "cpm":
      return amt !== 0 ? (netBudget / amt) * 1000 : 0
    case "fixed_cost":
    case "package_inclusions":
      return 1
    case "bonus":
      return bonusDeliverables ?? 0
    default:
      return 0
  }
}
```

Buy-type cases:

| Buy type(s) | Arithmetic |
|---|---|
| `cpc`, `cpv` | `amt !== 0 ? netBudget / amt : 0` |
| `cpm` | `amt !== 0 ? (netBudget / amt) * 1000 : 0` |
| `fixed_cost`, `package_inclusions` | `1` |
| `bonus` | `bonusDeliverables ?? 0` |
| default | `0` |

### `magazineCalculatedDeliverables` at `lib/mediaplan/expertChannelMappings.ts:5077`

```ts
function magazineCalculatedDeliverables(
  buyType: string,
  netBudget: number,
  buyAmount: number,
  bonusDeliverables?: number
): number {
  return newspaperCalculatedDeliverables(
    buyType,
    netBudget,
    buyAmount,
    bonusDeliverables
  )
}
```

Buy-type cases: none locally. Wrapper around `newspaperCalculatedDeliverables`.

## C. Formula Identity Table

Decisive classification for expert deliverable/budget helpers:

| Helper | Classification | A primitive mapped to | Differing lines if GENUINE VARIANT |
|---|---|---|---|
| `expertRowRawCost` | WRAPPER | `netMediaFromDeliverables` | n/a. Explicit `bonus` and `cpm` match canonical inverse arithmetic; all other buy types call `netMediaFromDeliverables`. |
| `oohNetBudgetForDeliverables` | WRAPPER | `netFromGross` | n/a. Fee-boundary wrapper only. |
| `radioNetBudgetForDeliverables` | IDENTICAL | `netFromGross` | n/a. Equivalent fee-boundary net-from-gross arithmetic; not audited further. |
| `oohCalculatedDeliverables` | GENUINE VARIANT | none | `lib/mediaplan/expertChannelMappings.ts:235-239`: `fixed_cost` and `package` return `1`; `bonus` returns `bonusDeliverables ?? 0`. Canonical `deliverablesFromBudget` returns `netBudget / unitRate` for `package`, `NaN` for `bonus`, and does not preserve manual bonus quantity. |
| `newspaperCalculatedDeliverables` | GENUINE VARIANT | none | `lib/mediaplan/expertChannelMappings.ts:261-266`: `fixed_cost`, `package`, and `package_inclusions` return `1`; `bonus` returns `bonusDeliverables ?? 0`. Canonical returns `netBudget / unitRate` for `package`, `NaN` for `package_inclusions` and `bonus`. |
| `bvodCalculatedDeliverables` | GENUINE VARIANT | none | `lib/mediaplan/expertChannelMappings.ts:1718-1722`: `fixed_cost` and `package_inclusions` return `1`; `bonus` returns `bonusDeliverables ?? 0`. Canonical returns `NaN` for `package_inclusions` and `bonus`. |
| `magazineCalculatedDeliverables` | WRAPPER | none, wraps B helper `newspaperCalculatedDeliverables` | n/a. It inherits the newspaper genuine variant. |
| `distributeRadioStandardDeliverablesToWeeks` | IDENTICAL | `distributeBurstDeliverablesToExpertWeeks` | n/a. Same fixed-cost first-week behavior, same rounded split/remainder behavior, different local weekly delta helper. |
| `deriveUnitRateFromBursts` | GENUINE VARIANT | none | `lib/mediaplan/expertChannelMappings.ts:1011-1017`: `panels` returns parsed `buyAmount`; otherwise derives `gross / qty`. This is unit-rate derivation, not deliverables-from-budget math. |
| `panelsBurstQtyForExpert` | GENUINE VARIANT | none | `lib/mediaplan/expertChannelMappings.ts:1101-1107`: panel-specific selection between `buyAmount` and `calculatedValue`; no A primitive equivalent. |

Counts for expert helpers that directly compute deliverables / net budget / gross/raw cost:

| Bucket | Count |
|---|---:|
| IDENTICAL | 1 |
| WRAPPER | 3 |
| DIRECTIONAL INVERSE | 0 |
| GENUINE VARIANT | 3 |

Counts if radio distribution and unit-rate/panel conversion helpers are also included:

| Bucket | Count |
|---|---:|
| IDENTICAL | 2 |
| WRAPPER | 3 |
| DIRECTIONAL INVERSE | 0 |
| GENUINE VARIANT | 5 |

STOP flag: Most direct expert deliverable/budget helpers are IDENTICAL/WRAPPER/Genuine split 4 to 3. CPC/CPV/CPM rate math is shared. The genuine variants are concentrated in `package`, `package_inclusions`, `bonus`, and panel/unit-rate conversion behavior.

## D. Buy-Type Coverage Matrix

Legend: `Y` = handled directly; `via A` = handled by calling canonical primitive; `-` = not handled / default; `NaN` = canonical no-recompute sentinel; `0` = explicit zero; `1` = fixed/manual one; `round` = rounding-only coverage.

| Buy type | `deliverablesFromBudget` | `computeDeliverableFromMedia` | `netMediaFromDeliverables` | `roundDeliverables` | `expertRowRawCost` | `oohCalculatedDeliverables` | `newspaperCalculatedDeliverables` | `bvodCalculatedDeliverables` | `magazineCalculatedDeliverables` |
|---|---|---|---|---|---|---|---|---|---|
| `cpc` | `net/rate` | via A | `qty*rate` | integer round | via A | `net/rate` | `net/rate` | `net/rate` | via newspaper |
| `cpv` | `net/rate` | via A | `qty*rate` | integer round | via A | `net/rate` | `net/rate` | `net/rate` | via newspaper |
| `cpm` | `(net/rate)*1000` | via A | `(qty/1000)*rate` | integer round | `(qty/1000)*rate` | `(net/rate)*1000` | `(net/rate)*1000` | `(net/rate)*1000` | via newspaper |
| `cpcv` | `net/rate` | via A | `qty*rate` | integer round | via A | - | - | - | - |
| `cpi` | `net/rate` | via A | `qty*rate` | integer round | via A | - | - | - | - |
| `cps` | `net/rate` | via A | `qty*rate` | integer round | via A | - | - | - | - |
| `insertions` | `net/rate` | via A | `qty*rate` | integer round | via A | - | `net/rate` | - | via newspaper |
| `screens` | `net/rate` | via A | `qty*rate` | integer round | via A | - | - | - | - |
| `panels` | `net/rate` | via A | `qty*rate` | 2dp default | via A | `net/rate` | - | - | - |
| `spots` | `net/rate` | via A | `qty*rate` | 2dp default | via A | - | - | - | - |
| `cpt` | `net/rate` | via A | `qty*rate` | 2dp default | via A | - | - | - | - |
| `cpp` | `net/rate` | via A | `qty*rate` | 2dp default | via A | - | - | - | - |
| `weekly_rate` | `net/rate` | via A | `qty*rate` | 2dp default | via A | - | - | - | - |
| `monthly_rate` | `net/rate` | via A | `qty*rate` | 2dp default | via A | - | - | - | - |
| `fixed_cost` | `1` | via A | `unitRate` | `1` | via A | `1` | `1` | `1` | via newspaper |
| `package` | `net/rate` | via A | `qty*rate` | 2dp default | via A | `1` | `1` | - | via newspaper |
| `package_inclusions` | `NaN` | `NaN` | `0` | 2dp default | via A -> `0` | - | `1` | `1` | via newspaper |
| `bonus` | `NaN` | `NaN` | `0` | 2dp default | `0` | manual `bonusDeliverables ?? 0` | manual `bonusDeliverables ?? 0` | manual `bonusDeliverables ?? 0` | via newspaper |
| unknown/default | `0` | via A default | `0` | 2dp default | via A default | `0` | `0` | `0` | via newspaper |

Handled differently between helpers, correctness questions for Luke:

| Buy type | Difference |
|---|---|
| `package` | Canonical `deliverablesFromBudget` uses `netBudget / unitRate`; `oohCalculatedDeliverables` and `newspaperCalculatedDeliverables` return `1`. |
| `package_inclusions` | Canonical `computeDeliverableFromMedia` / `deliverablesFromBudget` returns `NaN`; `netMediaFromDeliverables` returns `0`; `newspaperCalculatedDeliverables` and `bvodCalculatedDeliverables` return `1`. |
| `bonus` | Canonical `computeDeliverableFromMedia` / `deliverablesFromBudget` returns `NaN`; `netMediaFromDeliverables` and `expertRowRawCost` return `0`; channel calculated helpers return `bonusDeliverables ?? 0`. |
| `cpm` in OOH expert grid display | `components/media-containers/OohExpertGrid.tsx:229` uses `q * r`, while canonical inverse CPM is `(deliverables / 1000) * unitRate`; tooltip at `components/media-containers/OohExpertGrid.tsx:267` says `/ 1000`, conflicting with the actual OOH grid function body. |
| rounding | Standard UI call paths commonly call `roundDeliverables` after `computeDeliverableFromMedia`; expert `*CalculatedDeliverables` helpers return raw values and do not round internally. |

## E. Other Formula Homes Outside The Two Named Files

### Stray deliverable / budget arithmetic definitions

#### `components/media-containers/SocialMediaContainer.tsx:658`

```ts
let calculatedValue = 0;
switch (buyType) {
  case "cpc":
  case "cpv":
    calculatedValue = buyAmount !== 0 ? budget / buyAmount : 0;
    break;
  case "cpm":
    calculatedValue = buyAmount !== 0 ? (budget / buyAmount) * 1000 : 0;
    break;
  case "fixed_cost":
    calculatedValue = 1;
    break;
  default:
    calculatedValue = burst.calculatedValue || 0;
}
```

Classification: stray formula definition. It duplicates subset standard CPC/CPV/CPM/fixed arithmetic in a load-time transform path, using raw `budget` rather than visibly calling `computeDeliverableFromMedia` in this block.

#### `components/media-containers/SocialMediaContainer.tsx:723`

```ts
let calculatedValue = 0;
switch (buyType) {
  case "cpc":
  case "cpv":
    calculatedValue = buyAmount !== 0 ? budget / buyAmount : 0;
    break;
  case "cpm":
    calculatedValue = buyAmount !== 0 ? (budget / buyAmount) * 1000 : 0;
    break;
  case "fixed_cost":
    calculatedValue = 1;
    break;
  default:
    calculatedValue = burst.calculatedValue || 0;
}
```

Classification: second stray formula definition in the same social load/reset flow.

#### `components/media-containers/OohExpertGrid.tsx:221`

```ts
function oohExpertRowGrossMedia(
  buyType: BuyType,
  qty: number,
  unitRate: number
): number {
  if (buyType === "cpm") {
    const q = Number.isFinite(qty) ? qty : 0
    const r = Number.isFinite(unitRate) ? unitRate : 0
    return q * r
  }
  return netMediaFromDeliverables(buyType, qty, unitRate)
}
```

Classification: genuine stray variant. `cpm` uses `q * r` for OOH expert grid thousand-block cells. This differs from canonical `netMediaFromDeliverables` CPM `(deliverables / 1000) * unitRate`.

#### `lib/billing/computeSchedule.ts:206`

```ts
const share = burst.deliverables * (daysInMonth / daysTotal);

const rate = getRateForMediaType(mediaType);
const buyType = burst.buyType?.toLowerCase?.() || "";
const isCpm = buyType === "cpm";
const isBonus = buyType === "bonus";
const isDigiAudio =
  typeof mediaType === "string" && mediaType.toLowerCase().replace(/\s+/g, "") === "digiaudio";
const isCpmOrBonusForDigiAudio = isDigiAudio && (isCpm || isBonus);
const effectiveRate = isCpmOrBonusForDigiAudio ? adservaudio ?? rate : rate;
const cost = isCpmOrBonusForDigiAudio
  ? (share / 1000) * effectiveRate
  : isCpm
    ? (share / 1000) * rate
    : share * rate;
```

Classification: stray rate arithmetic outside the two named files. It computes billing/delivery ad-serving cost from deliverables, with CPM `/ 1000` handling and a Digital Audio bonus/CPM special path. This is not a standard media deliverable resolver, but it is physical CPV/CPC/CPM-style rate arithmetic in `lib/`.

### Formula wrapper/call-site homes outside the two named files

These are not new arithmetic definitions; they call A or B primitives:

| File / lines | Formula use |
|---|---|
| `components/media-containers/burst-calculated-fields.tsx:228`, `:323`, `:464` | `computeDeliverableFromMedia` |
| `components/media-containers/BVODContainer.tsx:121`, `:948` | `computeDeliverableFromMedia` |
| `components/media-containers/CinemaContainer.tsx:528` | `computeDeliverableFromMedia` |
| `components/media-containers/DigitalAudioContainer.tsx:121`, `:892` | `computeDeliverableFromMedia` |
| `components/media-containers/DigitalDisplayContainer.tsx:997` | `computeDeliverableFromMedia` |
| `components/media-containers/DigitalVideoContainer.tsx:854` | `computeDeliverableFromMedia` |
| `components/media-containers/InfluencersContainer.tsx:765` | `computeDeliverableFromMedia` |
| `components/media-containers/IntegrationContainer.tsx:151`, `:918` | `computeDeliverableFromMedia` |
| `components/media-containers/MagazinesContainer.tsx:324`, `:1006` | `computeDeliverableFromMedia` |
| `components/media-containers/NewspaperContainer.tsx:326`, `:1018` | `computeDeliverableFromMedia` |
| `components/media-containers/OOHContainer.tsx:320`, `:858` | `computeDeliverableFromMedia` |
| `components/media-containers/ProgAudioContainer.tsx:787` | `computeDeliverableFromMedia` |
| `components/media-containers/ProgBVODContainer.tsx:778` | `computeDeliverableFromMedia` |
| `components/media-containers/ProgDisplayContainer.tsx:795` | `computeDeliverableFromMedia` |
| `components/media-containers/ProgOOHContainer.tsx:794` | `computeDeliverableFromMedia` |
| `components/media-containers/ProgVideoContainer.tsx:111`, `:857` | `computeDeliverableFromMedia` |
| `components/media-containers/RadioContainer.tsx:309`, `:1060` | `computeDeliverableFromMedia` |
| `components/media-containers/SearchContainer.tsx:840` | `computeDeliverableFromMedia` |
| `components/media-containers/SocialMediaContainer.tsx:876` | `computeDeliverableFromMedia` |
| `components/media-containers/TelevisionContainer.tsx:146` | `computeDeliverableFromMedia` |
| `components/media-containers/BVODExpertGrid.tsx:235` | `netMediaFromDeliverables` |
| `components/media-containers/DigitalAudioExpertGrid.tsx:235` | `netMediaFromDeliverables` |
| `components/media-containers/RadioExpertGrid.tsx:235` | `netMediaFromDeliverables` |
| `components/media-containers/TelevisionExpertGrid.tsx:233` | `netMediaFromDeliverables` |
| `components/media-containers/DigitalDisplayExpertGrid.tsx:234` | `expertRowRawCost` |
| `components/media-containers/DigitalVideoExpertGrid.tsx:232` | `expertRowRawCost` |
| `components/media-containers/InfluencersExpertGrid.tsx:243` | `expertRowRawCost` |
| `components/media-containers/IntegrationExpertGrid.tsx:244` | `expertRowRawCost` |
| `components/media-containers/MagazinesExpertGrid.tsx:215` | `expertRowRawCost` |
| `components/media-containers/NewspaperExpertGrid.tsx:215` | `expertRowRawCost` |
| `components/media-containers/ProgAudioExpertGrid.tsx:237` | `expertRowRawCost` |
| `components/media-containers/ProgBVODExpertGrid.tsx:235` | `expertRowRawCost` |
| `components/media-containers/ProgDisplayExpertGrid.tsx:235` | `expertRowRawCost` |
| `components/media-containers/ProgOOHExpertGrid.tsx:235` | `expertRowRawCost` |
| `components/media-containers/ProgVideoExpertGrid.tsx:237` | `expertRowRawCost` |
| `components/media-containers/SearchExpertGrid.tsx:244` | `expertRowRawCost` |
| `components/media-containers/SocialMediaExpertGrid.tsx:234` | `expertRowRawCost` |

### Fee boundary call sites only

Not audited:

| File / line | Fee boundary call/site |
|---|---|
| `components/media-containers/BVODContainer.tsx:201` | `computeBurstAmounts` |
| `components/media-containers/CinemaContainer.tsx:143` | `computeBurstAmounts` |
| `components/media-containers/DigitalAudioContainer.tsx:196` | `computeBurstAmounts` |
| `components/media-containers/DigitalDisplayContainer.tsx:247` | `computeBurstAmounts` |
| `components/media-containers/DigitalVideoContainer.tsx:158` | `computeBurstAmounts` |
| `components/media-containers/InfluencersContainer.tsx:176` | `computeBurstAmounts` |
| `components/media-containers/IntegrationContainer.tsx:216` | `computeBurstAmounts` |
| `components/media-containers/MagazinesContainer.tsx:182` | `computeBurstAmounts` |
| `components/media-containers/NewspaperContainer.tsx:184` | `computeBurstAmounts` |
| `components/media-containers/OOHContainer.tsx:183` | `computeBurstAmounts` |
| `components/media-containers/ProgAudioContainer.tsx:174` | `computeBurstAmounts` |
| `components/media-containers/ProgBVODContainer.tsx:174` | `computeBurstAmounts` |
| `components/media-containers/ProgDisplayContainer.tsx:174` | `computeBurstAmounts` |
| `components/media-containers/ProgOOHContainer.tsx:169` | `computeBurstAmounts` |
| `components/media-containers/ProgVideoContainer.tsx:215` | `computeBurstAmounts` |
| `components/media-containers/RadioContainer.tsx:166` | `computeBurstAmounts` |
| `components/media-containers/SearchContainer.tsx:183` | `computeBurstAmounts` |
| `components/media-containers/SocialMediaContainer.tsx:169` | `computeBurstAmounts` |
| `components/media-containers/TelevisionContainer.tsx:209` | `computeBurstAmounts` |
| `lib/billing/generateBillingLineItems.ts:98` | local fee/net media split, out of scope |
| `components/media-containers/*ExpertGrid.tsx` row net helpers | call `expertRowFeeSplit(...).net`, out of scope |

## Formula Consolidation Readiness

- Canonical primitives in `deliverableBudget.ts`: `coerceBuyTypeWithDevWarn`, `deliverablesFromBudget`, `computeDeliverableFromMedia`, `netMediaFromDeliverables`, `grossFromNet`, `netFromGross`, `roundDeliverables`, `addExpertWeekColumnDelta`, `distributeBurstDeliverablesToExpertWeeks`.
- Expert helpers: 1 identical / 3 wrapper / 0 directional-inverse / 3 genuine-variant for direct deliverable/budget helpers.
- Buy types handled inconsistently between helpers: `package`, `package_inclusions`, `bonus`, OOH expert-grid `cpm`, rounding between standard rounded call paths and expert raw helper returns.
- Stray formula homes outside the two files: `components/media-containers/SocialMediaContainer.tsx:658-672`, `components/media-containers/SocialMediaContainer.tsx:723-737`, `components/media-containers/OohExpertGrid.tsx:221-232`, `lib/billing/computeSchedule.ts:206-220`.
- Can deliverable math become ONE buy-type-keyed resolver, or are there N genuine variants that must stay separate? CPC/CPV/CPM base rate math already reduces to the shared primitives, but the current code contains 3 direct expert genuine variants plus 1 OOH expert-grid CPM stray variant that must be explicitly decided before claiming one resolver covers all behavior.
