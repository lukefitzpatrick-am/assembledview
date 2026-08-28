# Fee Alignment Discovery

**Date:** 2026-07-06  
**Scope:** Read-only audit — app/screen fee math vs Excel media plan export fee math  
**Rule under test:** Fee = **gross total cost × fee%** (fee is a slice of gross, never stacked on net as `net × fee%`).

---

## Executive summary

The **canonical fee primitive already exists**: `computeBurstAmounts` in `lib/mediaplan/burstAmounts.ts`. Billing bursts, persistence (`serializeBurstsJson` → `extractAndFormatBursts`), and expert grids all route through it (directly or via `expertRowFeeSplit`).

**Excel export does not recompute fees per line.** It writes:

1. **Column N (“Gross Media”)** — net agency media (`mediaAmount` from `computeBurstAmounts`), mislabeled as gross.
2. **MBA summary “Service Fee”** — passed in as `mbaData.totals.service_fee`, built on the create/edit page by `calculateAssembledFee()` (sum of container `overallFee` rollups).

Those two paths **should agree** with on-screen MBA totals when comparing **campaign-level Service Fee**. Per-burst **Fee** columns exist only in the app UI (inline JSX math duplicated ~19×).

The most likely causes of an **observed app vs Excel fee mismatch** are:

| Rank | Cause | Nature |
|------|--------|--------|
| 1 | **No per-line fee in Excel** — user compares burst **Fee** column or `budget − media` to Excel **Gross Media** only | Presentation / expectation, not formula bug |
| 2 | **Deliverable/rate export fix (bf7ebf9…a5e3396)** — `grossMedia / deliverables` rate looks “fee-discounted” when deliverables were still gross-basis | Rate/deliverable column, not Service Fee row |
| 3 | **`clientPaysForMedia` + Excel fallback** — `groupLineItems` substitutes `deliverablesAmount` when `grossMedia === 0`, inflating section media totals vs screen | Gross **base** divergence |
| 4 | **Legacy billing hydration** — `mediaTotal × feePct / 100` on **net** media (search/social only) in persisted-schedule parsers | Fee on wrong base |
| 5 | **Currency rounding order** — `formatMoney` at persist vs raw floats in UI/Excel aggregation | ≤$0.01/line drift |

---

## Step 1 — Fee computation sites

### Search commands run

```powershell
Select-String -Path "lib\**\*.ts","app\**\*.ts","app\**\*.tsx","components\**\*.tsx" `
  -Pattern "fee" -CaseSensitive:$false |
  Where-Object { $_.Line -match "(\*|calc|percent|pct|gross|net|total)" }

Select-String -Path "lib\**\*.ts","components\**\*.tsx" `
  -Pattern "feePercent|fee_pct|feePct|managementFee|agencyFee" -CaseSensitive:$false
```

Broad pass: **~2,018 lines** (see agent tool output `cc156a5e-…`). Narrow pass: concentrated in `lib/mediaplan/*`, `lib/billing/*`, and `components/media-containers/*Container.tsx`.

### (a) App / screen computation sites

| File | Line(s) | Function / context | Expression (fee) |
|------|---------|-------------------|------------------|
| `lib/mediaplan/burstAmounts.ts` | 72–109 | **`computeBurstAmounts`** | **Canonical.** `budgetIncludesFees`: `fee = budget × (pct/100)`; `clientPaysForMedia` (net budget): `fee = budget/(100-pct)×pct`; standard (net budget): `fee = budget×pct/(100-pct)` |
| `lib/mediaplan/expertGridShared.ts` | 53–66 | **`expertRowFeeSplit`** | Delegates to `computeBurstAmounts`; returns `{ net: mediaAmount, fee: feeAmount }` |
| `components/media-containers/*Container.tsx` (×19) | e.g. Search 165–170, TV 165–170 | **`get<Channel>Bursts`** | `computeBurstAmounts({ rawBudget, budgetIncludesFees, clientPaysForMedia, feePct })` → `feeAmount` |
| `components/media-containers/*Container.tsx` (×19) | e.g. Search 618–647, ProgDisplay 639–655 | **`overallTotals` useMemo** | Inline duplicate: if `budgetIncludesFees`: `burstFee = budget × pct/100`; else: `burstFee = budget × pct/(100-pct)` |
| `components/media-containers/*Container.tsx` (×19) | e.g. Search 1630–1644, ProgDisplay 1683–1697 | **Read-only burst Fee `<Input>`** | Same inline as `overallTotals` (see Search 1641–1643) |
| `components/media-containers/*Container.tsx` (×19) | e.g. Search 212–214, TV 201–203 | **`calculateInvestmentPerMonth`** | `totalInvestment = lineMedia + (lineMedia/(100-feePct))×feePct` (gross-up on net budget) |
| `components/media-containers/MediaContainerSummarySection.tsx` | via props | Channel summary footer | Displays `overallFee` from container rollup (no local math) |
| `app/mediaplans/create/page.tsx` | 1361–1389 | **`calculateAssembledFee`** | Sum of 18 channel `*FeeTotal` state vars (from `onTotalMediaChange(_, totalFee)`) |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx` | 7150+ | **`calculateAssembledFee`** | Same pattern as create page |

**Per-burst screen Fee (SearchContainer example, lines 1640–1644):**

```tsx
// budgetIncludesFees:
(budget / 100) * feesearch
// else (net budget):
(budget / (100 - feesearch)) * feesearch
```

Equivalent to `computeBurstAmounts` for the two common branches (ignores `clientPaysForMedia` in display rollups — media still shown for planning).

### (b) Save / persistence sites

| File | Line(s) | Function | Expression |
|------|---------|----------|------------|
| `lib/mediaplan/formatBurstsForPersist.ts` | 44–121 | **`extractAndFormatBursts`** | Resolves `effectiveFeePct`, calls `serializeBurstsJson` |
| `lib/mediaplan/serializeBurstsJson.ts` | 51–77 | **`serializeBurstsJson`** | `computeBurstAmounts(...)` → `feeAmount: formatMoney(amounts.feeAmount)` |
| `lib/mediaplan/formatBurstsForPersist.ts` | 12–28 | **`deriveFeePctFromSerializedBursts`** | Inverse: if `budgetIncludesFees`: `pct = feeAmount×100/rawBudget`; else: `pct = feeAmount×100/(rawBudget+feeAmount)` |
| `lib/api.ts` | many (~1624+) | Save handlers | `extractAndFormatBursts(lineItem, lineItem.feePct ?? …)` |

Persisted `bursts_json.feeAmount` is **always** from `computeBurstAmounts`, formatted to AUD strings.

### (c) Excel export sites

| File | Line(s) | Role | Fee-related behaviour |
|------|---------|------|------------------------|
| `app/mediaplans/create/page.tsx` | 2562–2725 | **`generateMediaPlanXlsxBlob`** | Builds `mbaData.totals.service_fee = calculateAssembledFee()`; passes container `LineItem[]` |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx` | 6362–6490 | **`generateMediaPlanXlsxBlob`** | Same |
| `app/api/mediaplans/download/route.ts` | 81–150 | POST download | Calls `generateMediaPlan(header, mediaItems, mbaData)` — fee totals come from request body `mbaData` |
| `lib/generateMediaPlan.ts` | 304+ | **`generateMediaPlan`** | **No fee formula.** Writes `item.grossMedia` to column N; MBA block writes `totals.service_fee` verbatim |
| `components/media-containers/*Container.tsx` | e.g. Search 886–924 | **Excel bridge `useEffect`** | `grossMedia: String(computedBurst.mediaAmount)` — **net media**, not gross; deliverables recomputed via `computeDeliverableFromMedia` (net basis) on Bucket A/B/C containers after bf7ebf9…a5e3396 |

**Excel cells — exact expressions:**

| Cell / row | Source expression | Basis |
|------------|-------------------|--------|
| Data row col N “Gross Media” | `parseFloat(item.grossMedia)` → from bridge `computeBurstAmounts().mediaAmount` | **Net** agency media |
| Data row “Avg. Rate” | `it.grossMedia / it.totalCalculatedDeliverables` | Net media ÷ deliverables (deliverables now net-basis on fixed channels) |
| Section “Total {channel}” col N | `items.reduce((s,x) => s + x.grossMedia, 0)` | Sum of net media |
| Monthly columns (data + totals) | `distributeBurstToMonths(..., parseFloat(item.grossMedia), …)` | Prorated **net** media |
| MBA “Service Fee” row | `mbaData.totals.service_fee` (= `calculateAssembledFee()`) | Sum of container fee rollups |
| MBA “Gross Media” total | `mbaData.totals.gross_media` (= `calculateGrossMediaTotal()`) | Sum of container **media** rollups (net) |
| Grand total col N | `grossMediaMbaTotal + serviceFeeTotal + adServingTotal` | Passed-in totals |

**Fee is not coupled to `computeDeliverableFromMedia` in the export generator.** The deliverable recompute affects rate/deliverable columns only. Fee enters only via the precomputed MBA `service_fee` total.

### (d) Other — billing schedule, finance

| File | Line(s) | Function | Expression | Issue |
|------|---------|----------|------------|-------|
| `lib/billing/generateBillingLineItems.ts` | 37–88 | **`generateBillingLineItems`** | Computes **net media** only; `feePct` used to split gross budget, not to emit fee dollars | No fee amount output |
| `lib/billing/seedLineFees.ts` | 70–115 | **`burstsForLineItem` / seed** | Reads `burst.feeAmount` from JSON or container `BillingBurst.feeAmount` | Downstream of `computeBurstAmounts` |
| `lib/billing/computeDerivedCampaignFeeAmount.ts` | 26–48 | **`computeDerivedCampaignFeeAmount`** | `sum(burst.feeAmount)` | Aggregation only |
| `lib/billing/parsePersistedBillingScheduleToMonths.ts` | 139–143 | Legacy month hydration | **`feeAmount = (mediaTotal × feePercentage) / 100`** | Fee on **net** media — **violates gross×fee%** |
| `app/mediaplans/mba/…/edit/page.tsx` | 977–981 | Duplicate hydration block | Same `mediaTotal × feePct / 100` (search/social only) | Same violation |
| `app/mediaplans/mba/…/edit/page.tsx` | 4241–4315 | **`generateBillingLineItems` (page-local)** | Net media split; line fees from seed (`burst.feeAmount`), not % inference | Comment at 4317 confirms |
| `lib/billing/computeSchedule.ts` | ~114 | Month fee distribution | Uses `burst.feeAmount` | Pass-through |
| `lib/billing/validateAgencyFeeMonthTotalDrift.ts` | 20–36 | Drift check | Compares month `feeTotal` sum vs derived campaign fee | Validation only |
| `lib/mediaplan/deliverableBudget.ts` | 278–301 | **`grossFromNet` / `netFromGross`** | Gross/net conversion for deliverables — not fee, but defines gross base for deliverable math | Related base |
| `lib/finance/*` Excel exports | various | Finance hub / forecast | Separate from media plan fee model | Out of scope |

### Dead / divergent code (not on active path)

Every media container defines **`const getBursts = () => { … }`** with inline fee branches. **`getBursts()` is never called** (repo-wide grep: 0 call sites). In the “standard” (net budget) branch, **14/19 containers** use the **wrong** formula `feeAmount = budget × feePct / 100` (fee on net), while Search/Social/BVOD/Radio/Integration use the correct gross-up. Safe to delete or repoint, but **not** a current runtime divergence.

---

## Step 2 — Excel export path (detail)

### Entry points

1. **In-app:** `generateMediaPlanXlsxBlob` on create (`app/mediaplans/create/page.tsx:2562`) and edit (`app/mediaplans/mba/[mba_number]/edit/page.tsx:6362`).
2. **API:** `POST app/api/mediaplans/download/route.ts` — client supplies `mediaItems` + `mbaData`.
3. **Workbook builder:** `lib/generateMediaPlan.ts` (`generateMediaPlan` async, exceljs dynamic import ~320).

### Data flow

```
Container form
  → get*Bursts() → computeBurstAmounts → BillingBurst.feeAmount (billing)
  → overallTotals useMemo → overallFee → onTotalMediaChange → page *FeeTotal state
  → Excel bridge useEffect → LineItem.grossMedia = mediaAmount (net)
  → generateMediaPlanXlsxBlob → mbaData.totals.service_fee = calculateAssembledFee()
  → generateMediaPlan() → writes columns + MBA summary
```

### `computeDeliverableFromMedia` coupling check

Post **bf7ebf9 / e3ac83f / 8b25c71 / a5e3396**, Bucket A/B/C containers recompute export deliverables:

```tsx
const recomputedDeliverable = computeDeliverableFromMedia({
  buyType, rawBudget, buyAmount, budgetIncludesFees, feePct,
});
// grossMedia in same object: String(computedBurst.mediaAmount)  ← net media
```

`computeDeliverableFromMedia` uses **`netFromGross(rawBudget, …)`** internally — deliverables and rates are net-basis. **Fee dollars are not read from this helper.** Commit messages explicitly state **“No new fee math.”**

---

## Step 3 — App / screen path (detail)

### Primary line-item fee display

1. **Burst row read-only Fee column** — inline JSX (19 containers). Matches `computeBurstAmounts` for `budgetIncludesFees` and standard net-budget cases; does not special-case `clientPaysForMedia` (still shows planning media + fee).
2. **`MediaContainerSummarySection`** — line `fee` and `overallFee` from `overallTotals` useMemo (same inline math).
3. **MBA details panel** — `calculateAssembledFee()` / channel fee state from `onTotalMediaChange(overallMedia, overallFee)`.

### Persisted save payload (`extractAndFormatBursts`)

```typescript
// lib/mediaplan/serializeBurstsJson.ts:59-73
const amounts = computeBurstAmounts({ rawBudget, budgetIncludesFees, clientPaysForMedia, feePct });
feeAmount: formatMoney(amounts.feeAmount, …)
```

**Confirms:** persisted fee = `computeBurstAmounts().feeAmount` (gross×fee% when budget includes fees; gross-up when net budget).

### Container-level fee math (`get*Bursts`)

All 19 non-production channels: **`computeBurstAmounts`** — same as persistence.

---

## Step 4 — Divergence analysis

| Fee figure | App expression | Export expression | Verdict | Mathematical difference |
|------------|----------------|-------------------|---------|-------------------------|
| Campaign **Service Fee** (MBA summary) | `calculateAssembledFee()` = Σ channel `overallFee` | `mbaData.totals.service_fee` (same function at export time) | **IDENTICAL** | None when exported from same page state |
| **Per-burst Fee** column | Inline / `overallTotals` | *Not exported* | **N/A** | Excel has no column; comparing to `(budget − Gross Media)` fails when budget not shown |
| **Per-line summary fee** | `lineItemTotals[].fee` | *Not exported* | **N/A** | — |
| **Persisted `feeAmount`** | `computeBurstAmounts` | N/A (not re-read at export) | **IDENTICAL to billing bursts** | Export uses live form state, not JSON |
| **Excel col N “Gross Media”** | `overallMedia` (net) | Σ `mediaAmount` (net) | **IDENTICAL** (label misleading) | Both net, not true gross |
| **Implied fee from Excel** | — | `Service Fee` row only | **IDENTICAL** if user reads MBA block | Inferring fee from media column alone is wrong |
| **Avg Rate × Deliverables vs media** | Screen: net/net | Excel: `grossMedia/deliverables` after deliverable fix | **IDENTICAL post-fix** | Pre-migration: rate looked fee-reduced (deliverable bug, not fee formula) |
| **`clientPaysForMedia` media in Excel** | Screen shows planning media | `groupLineItems`: if `grossMedia===0`, use `deliverablesAmount` | **DIVERGENT (media base)** | Excel section media can exceed screen agency media; **fee row unchanged** |
| **Legacy schedule hydration** | N/A on fresh plans | `mediaTotal × feePct / 100` | **DIVERGENT** | Fee = **net × fee%**, not gross × fee%; search/social legacy paths only |
| **Dead `getBursts` standard branch** | Would be net×fee% | — | **DIVERGENT but unused** | — |

### `adServingRatePct` / `adServingImpressions`

- **Agency fee:** not used in fee formulas on either path.
- **Ad serving $:** separate `calculateAdServingFees()` → MBA `totals.adserving` → Excel “Adserving/Tech” row.
- Export bridge passes burst-level override keys through persistence (`serializeBurstsJson.ts:74-75`) but they affect ad serving cost computation, not agency fee %.

---

## Step 5 — Recent history

### `git log --oneline -20 -- "*export*"` (abbreviated)

Recent export work is **subtotals / styling / OOH labels / production double-count fix** — not fee formulas:

- `3791f48` style subtotal rows  
- `6b09937` / `4a18234` / `84e6cd5` / `0297881` network subtotals  
- `301d2e2` fix production double-count in Excel media total  

### `git log --oneline -20 -- "lib/mediaplan"`

Includes burst serialization, expert deliverable fixes, production budget — no changes to `burstAmounts.ts` fee branches in last 20.

### Fee-relevant export deliverable commits (user-flagged)

| Commit | Summary | Fee impact |
|--------|---------|------------|
| **bf7ebf9** | Bucket A: recompute export deliverables via `computeDeliverableFromMedia` (net) | **None** — rate/deliverable only |
| **e3ac83f** | Bucket B-UNIFORM: Radio, Newspaper, Magazines, OOH | **None** |
| **8b25c71** | Integration | **None** |
| **a5e3396** | Cinema (+ `roundDeliverables`) | **None** |

### Ad serving commits (`b689d57…3402a16` region)

- `38f1cb1` / `8ef259c` — ad serving override keys (plumbing)  
- `a480943` — ad serving per 1000 impressions  
- `3402a16` — expert apply resets ad serving overrides  

**Agency fee math untouched.**

---

## Step 6 — Shared helper proposal (no code changes)

### Recommendation

**Do not add a parallel fee formula.** Extend the existing extraction pattern (`lib/billing/prorateAcrossMonths.ts` was extracted once; fee math already lives in `lib/mediaplan/burstAmounts.ts`).

Add a thin facade for call-site ergonomics:

**Path:** `lib/mediaplan/calculateLineItemFee.ts` (or `lib/billing/calculateLineItemFee.ts` — prefer **mediaplan** to sit beside `burstAmounts.ts` and `deliverableBudget.ts`).

**Signature:**

```typescript
import type { ComputeBurstAmountsInput } from "./burstAmounts";

/** Fee dollars for one burst/line — delegates to computeBurstAmounts. */
export function calculateLineItemFee(input: ComputeBurstAmountsInput): number;

/** When caller already has true gross (budget includes fees). */
export function feeFromGross(grossAmount: number, feePct: number): number;

/** Split display values for read-only Media/Fee columns. */
export function splitMediaAndFee(input: ComputeBurstAmountsInput): {
  mediaAmount: number;
  feeAmount: number;
  grossAmount: number; // media + fee (agency invoice total)
};
```

Implementation: **one line** delegating to `computeBurstAmounts`; `feeFromGross(g, p) => g * p / 100`; `grossAmount = mediaAmount + feeAmount` (respecting `clientPaysForMedia`).

### Repoint inventory (estimated)

| Area | Call sites | Notes |
|------|------------|-------|
| Container `overallTotals` useMemo | **19** | Replace inline `burstFee` blocks |
| Container read-only Fee `<Input>` | **19** | Replace inline `formatMoney(...)` |
| Container dead `getBursts` | **19** | Delete or repoint (dead code) |
| `parsePersistedBillingScheduleToMonths.ts` | **1** | Replace `mediaTotal×feePct/100` with sum of parsed `feeAmount` or `calculateLineItemFee` |
| Edit page duplicate hydration (~980) | **1** | Same fix |
| **Already canonical** | `burstAmounts`, `serializeBurstsJson`, `get*Bursts`, `expertRowFeeSplit` | No change |

**Total active repoints:** ~40 UI/hydration sites + optional 19 deletions.

### Rounding order (decide once)

1. **Compute fee in full precision** (IEEE float) per burst via `computeBurstAmounts`.
2. **Round for display/persist** at burst level with `formatMoney` / `parseMoneyInput` (existing AUD 2dp).
3. **Sum rounded burst fees** for campaign totals (matches current persistence).
4. Excel reads string `grossMedia` → `parseFloat` — align with (2) when writing bridge values.

Document: *never* round fee% before applying to gross; *never* sum net media and apply fee% once at channel level (legacy hydration anti-pattern).

### Gross base divergence (fix scope flag)

If mismatch is **media dollars** not fee dollars, fix **`groupLineItems` clientPaysForMedia fallback** (`lib/generateMediaPlan.ts:391-395`) and/or align Excel column label (“Gross Media” → “Media (net)”) separately from fee helper work.

---

## Step 7 — Confidence & open questions

### Confidence: **72%**

That the documented paths explain a **campaign-level Service Fee** mismatch between screen MBA summary and Excel MBA summary when both are exported from the same session without manual billing overrides.

**Higher confidence (90%+)** if the user’s symptom is:

- Per-burst **Fee column vs Excel** (Excel doesn’t export it).
- **Rate or deliverables** look fee-discounted (deliverable export fix territory).
- **`clientPaysForMedia`** lines where Excel media column uses budget fallback.

**Lower confidence** if:

- Manual billing mode (`isManualBilling`) — fees come from edited month rows, not containers.
- Partial MBA / Advertising Associates variant — different `mbaData` builders.
- Comparing **billing schedule line fees** (seeded from JSON) vs **container rollups** on stale plans.

### Open questions

1. **Exact compared figures?** Per-burst Fee, line summary, channel Service Fee, or billing schedule month `feeTotal`?
2. **`budgetIncludesFees` and `clientPaysForMedia` flags** on failing lines?
3. **Manual billing** enabled on the plan?
4. **Export source:** create page, edit page, or download API with client-supplied `mbaData`?
5. **Pre-migration `bursts_json`** without recomputed `feeAmount` — does mismatch clear after save/reserialize?
6. Should Excel gain an explicit **Fee column** (and/or rename “Gross Media”) to remove inferential comparisons?

---

## Quick reference — canonical fee formulas (`computeBurstAmounts`)

```
budgetIncludesFees:
  feeAmount = rawBudget × (feePct / 100)          // fee = gross × fee%
  mediaAmount = rawBudget × ((100 - feePct) / 100)

clientPaysForMedia (net budget):
  feeAmount = rawBudget / (100 - feePct) × feePct // gross-up; fee = gross × fee%

standard (net budget):
  feeAmount = rawBudget × feePct / (100 - feePct) // gross-up; fee = gross × fee%
```

`feePct === 100` → `feeAmount = 0` (division guard) in client-pays and standard branches.
