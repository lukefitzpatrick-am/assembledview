# Pacing + Finance hub consistency (P2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Additive consistency pass — shared `PacingStatusSummary` on Overview + channel tabs (Overview-mapper derivation on filtered rows), tab-scoped finance status/billing-type filters, shared Panel/states chrome, presentation-only pacing table polish — with no data-correctness or refetch-semantics changes.

**Architecture:** Extract proven Overview UI + reuse client-safe `mapOverviewItems` / `summarizeOverviewItems` / search `computeRowKpiStatus`. Thin per-channel pure counters. Finance toolbar gains tab-aware Multiselects. Tables get local column toggles only (no shared visibility hook).

**Tech Stack:** Next.js App Router, React client components, Zustand finance/pacing stores, existing `MultiSelectCombobox` / `Badge` / `Panel` / `states`, `tsx --test` or vitest for pure helpers, `react-dom/server` `renderToStaticMarkup` for counts-row golden HTML.

**Spec:** `docs/superpowers/specs/2026-07-26-pacing-finance-hub-consistency-design.md`

## Global Constraints

- Cosmetic / additive only — no refetch-key, filter-semantics, billing/payables derivation, or finance hero KPI deferred-logic changes.
- No `StatTile`; no `PacingChannelPageShell`; no shared column-visibility hook.
- Never import `buildOverviewPayload` (server-only) from clients.
- Channel table pill is 4-state; six-state counts require Overview mappers on filtered rows.
- Fidelity tests = fixed-row-set derivation equivalence only (not live Overview vs live channel).
- Finance status/billing-type options are tab-scoped to real in-scope values; never expose `draft` in status multiselect; omit controls on Forecast/Xero Queue.
- Default pacing columns always keep client, campaign, status, budget, spend/pacing visible.
- Tokens only (AssembledView design system) — no raw hex / palette colours.
- Branch: `feat/pacing-finance-hub-consistency` (depends on P0/P1 already landed or merge those first).

---

## File map

| File | Responsibility |
|------|----------------|
| `components/pacing/PacingStatusSummary.tsx` | Shared 6-tile status strip |
| `lib/pacing/overview/countChannelOverviewStatus.ts` | Pure per-channel counters |
| `lib/pacing/overview/__tests__/countChannelOverviewStatus.test.ts` | Fixed-row-set fidelity |
| `components/pacing/__tests__/PacingStatusSummary.test.tsx` | Counts-row golden HTML |
| `app/pacing/(shell)/overview/OverviewClient.tsx` | Use shared summary |
| `app/pacing/(shell)/{search,social,programmatic,direct,ad-serving}/*Client.tsx` | Summary + states chrome |
| `components/finance/FinanceFilterToolbar.tsx` | Status + billing-type UI |
| `app/finance/FinanceHubPageClient.tsx` | Pass `activeTab` into toolbar |
| `components/pacing-{search,social,programmatic,direct}/…` + ad-serving table | Table polish |
| `components/finance/hub/panels/*.tsx` | Panel/states chrome only (not hero tiles) |

---

### Task 1: Extract `PacingStatusSummary` (behaviour-preserving)

**Files:**
- Create: `components/pacing/PacingStatusSummary.tsx`
- Create: `components/pacing/__tests__/PacingStatusSummary.test.tsx`
- Modify: `app/pacing/(shell)/overview/OverviewClient.tsx` (replace local `StatusSummary`)

**Interfaces:**
- Produces: `PacingStatusSummary({ counts: OverviewStatusCounts })`
- Consumes: `OverviewStatusCounts` from `@/lib/pacing/overview/types`

- [ ] **Step 1: Capture golden HTML from current Overview markup**

Copy the exact classNames/structure from the local `StatusSummary` in `OverviewClient.tsx` (the 6-across grid). Write a failing test that will assert `renderToStaticMarkup` of the new component matches a frozen golden string for a fixed counts object.

```tsx
/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { PacingStatusSummary } from "@/components/pacing/PacingStatusSummary"
import type { OverviewStatusCounts } from "@/lib/pacing/overview/types"

const SAMPLE: OverviewStatusCounts = {
  behind: 2,
  onTrack: 5,
  ahead: 1,
  overPacing: 3,
  noData: 4,
  kpiPending: 0,
}

// Golden = exact HTML from pre-extract Overview StatusSummary for SAMPLE.
// Fill GOLDEN by rendering the OLD inline component once before deleting it,
// or by pasting the known markup string from OverviewClient.
const GOLDEN = `…paste exact static markup…`

describe("PacingStatusSummary", () => {
  it("matches Overview counts-row markup for fixed counts", () => {
    const html = renderToStaticMarkup(<PacingStatusSummary counts={SAMPLE} />)
    expect(html).toBe(GOLDEN)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

Run: `npx vitest run components/pacing/__tests__/PacingStatusSummary.test.tsx`  
Expected: FAIL — cannot resolve `PacingStatusSummary`

- [ ] **Step 3: Implement extract**

```tsx
// components/pacing/PacingStatusSummary.tsx
"use client"

import type { OverviewStatusCounts } from "@/lib/pacing/overview/types"

export function PacingStatusSummary({ counts }: { counts: OverviewStatusCounts }) {
  const items: Array<{ label: string; value: number; tone: string }> = [
    { label: "Behind", value: counts.behind, tone: "text-status-behind-fg" },
    { label: "On track", value: counts.onTrack, tone: "text-status-on-track-fg" },
    { label: "Ahead", value: counts.ahead, tone: "text-status-ahead-fg" },
    { label: "Over-pacing", value: counts.overPacing, tone: "text-status-critical-fg" },
    { label: "No data", value: counts.noData, tone: "text-muted-foreground" },
    { label: "KPI Pending", value: counts.kpiPending, tone: "text-muted-foreground" },
  ]
  return (
    <div className="grid grid-cols-2 gap-2 rounded-card border border-border bg-card p-3 shadow-e0 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {item.label}
          </span>
          <span className={`num text-lg font-semibold ${item.tone}`}>{item.value}</span>
        </div>
      ))}
    </div>
  )
}
```

Replace Overview local function with:

```tsx
import { PacingStatusSummary } from "@/components/pacing/PacingStatusSummary"
// …
<PacingStatusSummary counts={data.counts} />
```

Delete the local `StatusSummary` function.

- [ ] **Step 4: Freeze GOLDEN from the new component once, then lock**

If Step 1 golden was captured from old markup, run the test and fix any whitespace drift so it passes. Do not change tones/labels/layout.

- [ ] **Step 5: Commit**

```bash
git add components/pacing/PacingStatusSummary.tsx \
  components/pacing/__tests__/PacingStatusSummary.test.tsx \
  app/pacing/\(shell\)/overview/OverviewClient.tsx
git commit -m "refactor(pacing): extract PacingStatusSummary from Overview"
```

---

### Task 2: Pure per-channel counters + fixed-row-set fidelity tests

**Files:**
- Create: `lib/pacing/overview/countChannelOverviewStatus.ts`
- Create: `lib/pacing/overview/__tests__/countChannelOverviewStatus.test.ts`

**Interfaces:**
- Consumes: `mapSpendRowToOverviewItem`, `mapDirectLineToOverviewItem`, `mapAdServingRowToOverviewItem`, `summarizeOverviewItems`, `computeRowKpiStatus`
- Produces:
  - `countSearchOverviewStatus(rows, asOfDate): OverviewStatusCounts`
  - `countSocialOverviewStatus(rows, asOfDate): OverviewStatusCounts`
  - `countProgrammaticOverviewStatus(rows, asOfDate): OverviewStatusCounts`
  - `countDirectOverviewStatus(groups): OverviewStatusCounts`
  - `countAdServingOverviewStatus(rows): OverviewStatusCounts`

Mirror `buildOverviewPayload` branches exactly (search KPI pending; social/programmatic conversions/revenue = 0; direct burst statuses; ad-serving mapper).

- [ ] **Step 1: Write failing fidelity tests**

```ts
import assert from "node:assert/strict"
import { test } from "node:test"
import {
  mapSpendRowToOverviewItem,
  summarizeOverviewItems,
} from "@/lib/pacing/overview/mapOverviewItems"
import { countSearchOverviewStatus } from "@/lib/pacing/overview/countChannelOverviewStatus"
import { computeRowKpiStatus } from "@/lib/pacing/kpi/computeKpiStatus"
// Import or inline minimal SearchPacingCampaignRow fixtures:
// one over-pacing burst, one behind, one kpi-pending (kpiTargets null).

test("search counter ≡ mapper+summarize on fixed rows", () => {
  const asOfDate = "2026-01-16"
  const rows = [/* fixtures */]

  const expectedItems = rows.map((row) =>
    mapSpendRowToOverviewItem(
      "search",
      {
        clientName: row.clientName,
        campaignName: row.campaignName,
        mbaNumber: row.mbaNumber,
        lineItemId: row.lineItemId,
        currentBurst: row.currentBurst,
        spendToDateCurrentBurst: row.spendToDateCurrentBurst,
        spendYesterday: row.spendYesterday,
        impressions: row.impressions,
        clicks: row.clicks,
        conversions: row.conversions,
        revenue: row.revenue,
      },
      asOfDate
    )
  )
  let kpiPending = 0
  for (const row of rows) {
    if (computeRowKpiStatus(row) === "kpi-pending") kpiPending += 1
  }
  const expected = summarizeOverviewItems(expectedItems, kpiPending).counts
  const actual = countSearchOverviewStatus(rows, asOfDate)
  assert.deepEqual(actual, expected)
})

// Repeat pattern for social (conversions/revenue 0, kpiPending 0),
// programmatic, direct (line items + burstStatuses), ad-serving.
```

- [ ] **Step 2: Run — expect FAIL**

Run: `tsx --test lib/pacing/overview/__tests__/countChannelOverviewStatus.test.ts`  
Expected: FAIL — module not found

- [ ] **Step 3: Implement counters**

```ts
// lib/pacing/overview/countChannelOverviewStatus.ts
import { computeRowKpiStatus } from "@/lib/pacing/kpi/computeKpiStatus"
import {
  mapAdServingRowToOverviewItem,
  mapDirectLineToOverviewItem,
  mapSpendRowToOverviewItem,
  summarizeOverviewItems,
} from "@/lib/pacing/overview/mapOverviewItems"
import type { OverviewStatusCounts } from "@/lib/pacing/overview/types"
import type { SearchPacingCampaignRow } from "@/lib/pacing/campaigns/types"
import type { SocialPacingCampaignRow } from "@/lib/pacing/social/types"
import type { ProgrammaticPacingCampaignRow } from "@/lib/pacing/programmatic/types"
import type { DirectPacingCampaignGroup } from "@/lib/pacing/direct/types"
import type { AdServingPacingCampaignRow } from "@/lib/pacing/ad-serving/types"

export function countSearchOverviewStatus(
  rows: SearchPacingCampaignRow[],
  asOfDate: string
): OverviewStatusCounts {
  const items = rows.map((row) =>
    mapSpendRowToOverviewItem(
      "search",
      {
        clientName: row.clientName,
        campaignName: row.campaignName,
        mbaNumber: row.mbaNumber,
        lineItemId: row.lineItemId,
        currentBurst: row.currentBurst,
        spendToDateCurrentBurst: row.spendToDateCurrentBurst,
        spendYesterday: row.spendYesterday,
        impressions: row.impressions,
        clicks: row.clicks,
        conversions: row.conversions,
        revenue: row.revenue,
      },
      asOfDate
    )
  )
  let kpiPending = 0
  for (const row of rows) {
    if (computeRowKpiStatus(row) === "kpi-pending") kpiPending += 1
  }
  return summarizeOverviewItems(items, kpiPending).counts
}

export function countSocialOverviewStatus(
  rows: SocialPacingCampaignRow[],
  asOfDate: string
): OverviewStatusCounts {
  const items = rows.map((row) =>
    mapSpendRowToOverviewItem(
      "social",
      {
        clientName: row.clientName,
        campaignName: row.campaignName,
        mbaNumber: row.mbaNumber,
        lineItemId: row.lineItemId,
        currentBurst: row.currentBurst,
        spendToDateCurrentBurst: row.spendToDateCurrentBurst,
        spendYesterday: row.spendYesterday,
        impressions: row.impressions,
        clicks: row.clicks,
        conversions: 0,
        revenue: 0,
      },
      asOfDate
    )
  )
  return summarizeOverviewItems(items, 0).counts
}

// countProgrammaticOverviewStatus — same as social with "programmatic"
// countDirectOverviewStatus — flatten groups.lineItems → mapDirectLineToOverviewItem
// countAdServingOverviewStatus — mapAdServingRowToOverviewItem
```

Adjust imported row/group type names to match the repo’s exact exports.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add lib/pacing/overview/countChannelOverviewStatus.ts \
  lib/pacing/overview/__tests__/countChannelOverviewStatus.test.ts
git commit -m "feat(pacing): client-safe channel overview status counters"
```

---

### Task 3: Wire channel tabs — summary + Loading/Error/Empty states

**Files:**
- Modify: `app/pacing/(shell)/search/CampaignsClient.tsx`
- Modify: `app/pacing/(shell)/social/SocialCampaignsClient.tsx`
- Modify: `app/pacing/(shell)/programmatic/ProgrammaticCampaignsClient.tsx`
- Modify: `app/pacing/(shell)/direct/DirectCampaignsClient.tsx`
- Modify: `app/pacing/(shell)/ad-serving/AdServingCampaignsClient.tsx`
- Modify: `components/pacing/PacingShell.tsx` and/or `PacingFilterToolbar.tsx` only if needed for presentation-only “updating…” near sticky toolbar (deferred filter apply indicator — no refetch change)

**Interfaces:**
- Consumes: counters from Task 2, `PacingStatusSummary`, `LoadingState` / `ErrorState` / `EmptyState`, existing `PacingFilterEmptyState`

- [ ] **Step 1: Per channel client pattern (example: social)**

After `displayed` is computed from filters:

```tsx
import { PacingStatusSummary } from "@/components/pacing/PacingStatusSummary"
import { countSocialOverviewStatus } from "@/lib/pacing/overview/countChannelOverviewStatus"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/layout/Panel"

const statusCounts = useMemo(
  () => countSocialOverviewStatus(displayed, data?.asOfDate ?? filters.as_of_date),
  [displayed, data?.asOfDate, filters.as_of_date]
)

// loading → <LoadingState rows={6} />
// error → <ErrorState title="Failed to load social pacing" message={error} />
// success:
//   <PacingStatusSummary counts={statusCounts} />
//   filter-empty → <PacingFilterEmptyState />
//   else → table inside optional <Panel>…
```

Repeat for search / programmatic / direct / ad-serving with the matching counter. Sticky toolbar stays in `PacingShell` (outside Panel).

- [ ] **Step 2: “updating…” indicator**

When filter draft ≠ applied store filters (or `useDeferredValue` / transition pending on filter apply), show a small muted “Updating…” near the sticky toolbar or above the summary. **Do not** change fetch effects or in-memory filter logic.

- [ ] **Step 3: Manual smoke** — filter a channel; summary counts move; Over-pacing can be > 0 while table pill still says Ahead for those rows.

- [ ] **Step 4: Commit**

```bash
git add app/pacing/\(shell\)/ components/pacing/
git commit -m "feat(pacing): status summary strip on channel tabs"
```

---

### Task 4: FinanceFilterToolbar — tab-scoped status + billing-type

**Files:**
- Modify: `components/finance/FinanceFilterToolbar.tsx`
- Modify: `app/finance/FinanceHubPageClient.tsx` (pass `activeTab`)
- Modify: `app/finance/receivables/ReceivablesPageClient.tsx` if it mounts its own toolbar — pass `activeTab="billing"`

**Constants (lock to spec):**

```ts
const RECEIVABLE_BILLING_TYPES = ["media", "sow", "retainer"] as const
const RECEIVABLE_STATUSES = ["booked", "approved", "invoiced", "paid"] as const
const PAYABLE_STATUSES = ["expected", "invoiced", "paid"] as const
const OVERVIEW_ACCRUAL_STATUSES = [
  "booked",
  "approved",
  "invoiced",
  "paid",
  "expected",
] as const
```

| Tab | Billing type UI | Status UI |
|-----|-----------------|-------------|
| `billing`, `report` | receivable types | `RECEIVABLE_STATUSES` |
| `overview`, `accrual` | receivable types | `OVERVIEW_ACCRUAL_STATUSES` |
| `payables` | omit | `PAYABLE_STATUSES` |
| `forecast`, `queue` | omit | omit |

Never offer `draft` or `payable` in these controls. `includeDrafts` Switch unchanged.

- [ ] **Step 1: Extend toolbar props**

```tsx
import type { FinanceHubTab } from "@/lib/finance/useFinanceStore"

type FinanceFilterToolbarProps = {
  receivables?: FinanceFilterToolbarReceivablesProps | null
  activeTab: FinanceHubTab
}
```

- [ ] **Step 2: Add Multiselects inside `controls`**

Follow Clients/Publishers pattern (`emptyMeansAll`, labels, `draft` state). On values change:

```tsx
// Billing types (when shown):
setDraft((d) => ({
  ...d,
  billingTypes: values as FinanceFilters["billingTypes"],
}))

// Statuses (when shown) — never re-insert draft:
setDraft((d) => ({
  ...d,
  statuses: values as FinanceFilters["statuses"],
}))
```

Displayed multiselect values = `draft.*` intersected with the tab’s option list.

- [ ] **Step 3: Pass `activeTab` from hub**

```tsx
<FinanceFilterToolbar
  activeTab={activeTab}
  receivables={activeTab === "billing" ? { … } : undefined}
/>
```

- [ ] **Step 4: Smoke** — Client Billing: no payable / no draft / no expected. Publisher Invoices: no billing-type control; status has expected. Forecast/Queue: neither control. Apply still uses existing `setFilters`.

- [ ] **Step 5: Commit**

```bash
git add components/finance/FinanceFilterToolbar.tsx \
  app/finance/FinanceHubPageClient.tsx \
  app/finance/receivables/ReceivablesPageClient.tsx
git commit -m "feat(finance): surface tab-scoped status and billing-type filters"
```

---

### Task 5: Finance panel chrome (not hero tiles)

**Files:**
- Modify as needed: `components/finance/hub/panels/FinanceAccrualPanel.tsx`, `FinanceReportPanel.tsx`, `FinanceXeroQueuePanel.tsx`, `FinanceForecastPanel.tsx` (states only), `FinanceOverviewPanel.tsx` (**do not** change hero KPI tile loading/deferred logic)
- Use: `Panel` / `PanelHeader` / `EmptyState` / `LoadingState` / `ErrorState`

- [ ] **Step 1: Audit each panel** for ad-hoc skeleton / `text-destructive` error / empty copy; replace with shared states inside `Panel` where a titled section exists.

- [ ] **Step 2: Explicit non-goals check** — grepping the diff must show **no** changes to Overview hero KPI deferred/loading branches introduced in P0‑2.

- [ ] **Step 3: Commit**

```bash
git add components/finance/hub/panels/
git commit -m "refactor(finance): route hub panels through Panel and shared states"
```

---

### Task 6: Pacing table polish (presentation only)

**Files (per channel, no shared visibility hook):**
- `components/pacing-search/LineItemPacingTable.tsx`
- `components/pacing-social/LineItemPacingTable.tsx`
- `components/pacing-programmatic/LineItemPacingTable.tsx`
- `components/pacing-direct/DirectCampaignsTable.tsx`
- `components/pacing-ad-serving/AdServingLineItemTable.tsx`

**Rules:**
- Quiet cells (no `border-b` at rest on body cells; keep header separation)
- Sticky **Client + Campaign** only (narrow social’s wider sticky set if present)
- Right-aligned `.num` on numerics
- RAG status `Badge` variants unchanged semantically
- Default columns: always include client, campaign, status, budget, spend/pacing; secondary (IDs, dates, targeting, platform) behind local `showMoreColumns` state + “More columns” control
- No persistence

- [ ] **Step 1: Per table — define `DEFAULT_COLUMNS` / `OPTIONAL_COLUMNS` const arrays; toggle controls `visibleOptional`**

```tsx
const [moreColumns, setMoreColumns] = useState(false)
// render th/td only if column is default OR moreColumns
```

- [ ] **Step 2: Sticky left styles for Client + Campaign indices only**

- [ ] **Step 3: Visual pass across all five channel tabs**

- [ ] **Step 4: Commit**

```bash
git add components/pacing-search/ components/pacing-social/ \
  components/pacing-programmatic/ components/pacing-direct/ \
  components/pacing-ad-serving/
git commit -m "style(pacing): quiet tables, sticky identity cols, more-columns"
```

---

### Task 7: Verify + typecheck

- [ ] **Step 1: Run targeted tests**

```bash
npx vitest run components/pacing/__tests__/PacingStatusSummary.test.tsx
tsx --test lib/pacing/overview/__tests__/countChannelOverviewStatus.test.ts
npm run typecheck
```

Expected: all pass.

- [ ] **Step 2: Manual checklist (from spec §5)**

- Overview counts row unchanged visually
- Channel filter → summary tracks filtered rows; Over-pacing ≠ Ahead collapse
- Finance tab-scoped filters honest (no silent empty from dead options)
- Hero KPI tiles behaviour unchanged
- Sticky toolbars still sticky; “Updating…” is cosmetic only

- [ ] **Step 3: Final commit only if verify fixed anything; else done**

---

## Spec coverage (self-review)

| Spec section | Task(s) |
|--------------|---------|
| §1 extract + fidelity wording | 1, 2 |
| §1 channel wiring | 3 |
| §2 tab-scoped filters | 4 |
| §3 Panel chrome | 3 (pacing), 5 (finance) |
| §4 table polish + column guardrail | 6 |
| §5 verify | 7 |
| Out of scope (StatTile, shell, hero tiles) | Global constraints + Task 5 non-goal |

## Placeholder scan

No TBD / “implement later” / “write tests for the above” without code. Type names for Direct/AdServing rows must be matched to repo exports during Task 2 Step 3 if imports fail — that is a lookup, not a design gap.
