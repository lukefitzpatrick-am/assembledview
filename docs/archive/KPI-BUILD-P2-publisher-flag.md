# BUILD P2 — Flag line items with no publisher-tier KPI

**Goal:** Surface, per resolved KPI row, whether a `publisher_kpi` row exists for that line (publisher + bid_strategy + media_type), independent of which tier supplied the value. Then flag it in the KPI panel and the edit modal. Semantic confirmed: flag whenever **no publisher-tier row exists**, even if a client/campaign value filled the metric.

**Confidence: 92%.** The resolver already computes the publisher match (`pubMatch`); we only need to expose it. UI is additive.

Split into TWO commits.

---

## Commit 1 — Resolver surfaces `hasPublisherKpi`

### `lib/kpi/types.ts`
On `ResolvedKPIRow`, add an optional field (optional keeps other surfaces — pacing `buildResolvedRow`, tests — compiling without edits):
```ts
/** True when a publisher_kpi row exists for this line's publisher+bid_strategy+media_type,
 *  regardless of which tier won the metric value. UI-only. */
hasPublisherKpi?: boolean
```

### `lib/kpi/resolve.ts`
`pubMatch` is already computed (the `opts.publisherKPIs.find(...)` block). In the `const row: ResolvedKPIRow = { ... }` literal, add:
```ts
hasPublisherKpi: Boolean(pubMatch),
```
`recalcRow` and `mergeManualKpiOverrides` both spread `...row` / `...r`, so the field is preserved through manual-override and recalc paths — verify by reading, no change expected.

### Gate
`npx tsc --noEmit` → no new errors vs the current clean baseline (now 0). Run the KPI unit tests: `npx vitest run lib/kpi` (or the repo's test command) — `resolve.test.ts` builds rows via the resolver so it should pass; if any test asserts on a full row literal, add `hasPublisherKpi` there.

### Commit
```powershell
git add "lib/kpi/types.ts"
git add "lib/kpi/resolve.ts"
git commit -m "feat(kpi): surface hasPublisherKpi on resolved rows"
```

---

## Commit 2 — Flag in the UI

### `components/kpis/KPISection.tsx`
In the `rowsByMediaType` render loop (where `hasDefault`/`allDefault`/`dotColor` are computed), add a publisher-gap count and a badge. Keep the existing source dot unchanged.
```tsx
const missingPublisherCount = rows.filter((r) => r.hasPublisherKpi === false).length
```
Render, next to the media-type label (only when `missingPublisherCount > 0`), a small amber warning pill, e.g.:
```tsx
{missingPublisherCount > 0 && (
  <span
    className="rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-700"
    title={`${missingPublisherCount} line item(s) have no publisher KPI`}
  >
    ⚠ {missingPublisherCount} no pub KPI
  </span>
)}
```
(Match existing class conventions in the file; use `cn(...)` if that's the pattern.)

### `components/kpis/KPIEditModal.tsx`
In the per-row render, where the Source badge is shown, add a marker when `row.hasPublisherKpi === false` — e.g. a small amber dot or "no pub KPI" tag in/next to the Source cell, with a `title`. This is what the P3 "Add publisher KPI" action will hang off, so make the flagged rows visually identifiable per-row.

### Gate & smoke
1. `npx tsc --noEmit` → no new errors.
2. Browser/in-memory smoke: build a plan where a line item's publisher has a client KPI but **no** publisher KPI → that media type shows the amber "no pub KPI" pill in the panel, and the row is marked in the modal. A line with a publisher KPI shows no flag.

### Commit
```powershell
git add "components/kpis/KPISection.tsx"
git add "components/kpis/KPIEditModal.tsx"
git commit -m "feat(kpi): flag line items missing a publisher-tier KPI"
```

Do not push. Report tsc + which rows flagged.

---

## Note for P3 (next)
P3 ("Add publisher KPI from create/edit") will add an action on these flagged rows in `KPIEditModal` that opens a small form → POST `/api/kpis/publisher` → refresh `publisherKPIs` so the resolver re-runs and the flag clears. P2 deliberately leaves the rows visually identifiable so P3 has an anchor.
