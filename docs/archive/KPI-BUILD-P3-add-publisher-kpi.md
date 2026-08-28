# BUILD P3 — Add a publisher KPI from create/edit (on flagged rows)

**Goal:** On rows flagged by P2 (`hasPublisherKpi === false`) inside `KPIEditModal`, offer an "Add publisher KPI" action that creates a `publisher_kpi` row pre-seeded from the line, then refreshes so the resolver re-runs and the flag clears.

**Confidence: 88%.** Two items to confirm before finalising (metric scale + publisher-id resolution) — both noted inline. Don't finalise the form until the metric-scale check is done.

## Confirmed facts (don't re-investigate)
- POST `/api/kpis/publisher` body = `publisherKpiCreateBodySchema`: `{ publisher, media_type, bid_strategy, ctr, cpv, conversion_rate, vtr, frequency }` (metrics coerce to number, default 0).
- **Canonical convention:** `components/PublisherKpiForm.tsx` posts `publisher = String(publisher.publisherid).trim()` — i.e. the Xano **publisher id**, NOT the display name. P3 must match this so the resolver's id→name join (`linePublisherMatchesKpiPublisherField`) works and data stays consistent.
- The page already holds `kpiPublishers: Publisher[]` and refreshes publisher KPIs at create `page.tsx:2830` / edit `page.tsx:2058` via `getPublisherKPIs().then(d => { setPublisherKPIs(d); setKpiTrigger(t=>t+1) })`.
- `KPISection` is rendered at create `6190` / edit `8911` with `host={createMediaPlanKpiHost({...})}`.

## ⚠ Verify first (gates the form)
1. **Metric scale.** Read how `PublisherKpiForm` parses CTR/VTR/conv-rate before POST (percent-point like `1.2` for 1.2%, vs decimal `0.012`). P3's form MUST store in the identical scale or ad-serving + display will drift. Mirror whatever it does. Report the convention back if unsure.
2. **Publisher id resolution.** Confirm `Publisher.publisher_name` normalised (lowercase/trim) equals the flagged row's `row.publisher` (which is the normalised display name from `extractKPIKeys`). If yes, we can map row → Publisher → `publisherid`.

## Changes

### `components/kpis/KPISection.tsx`
Add two optional props and pass them through to `KPIEditModal`:
```ts
publishers?: Publisher[]
onPublisherKpiAdded?: () => void | Promise<void>
```
Thread both into the `<KPIEditModal ... />` it already renders. (Pacing surface omits them → no add button there.)

### `components/kpis/KPIEditModal.tsx`
Accept the two new optional props. On each row where `row.hasPublisherKpi === false` (the P2 marker), render an **"Add publisher KPI"** button near the Source cell. Clicking opens a compact inline form (Dialog/Popover, match existing modal styling) pre-filled:
- `media_type` = `row.media_type` (read-only)
- `bid_strategy` = `row.bid_strategy` (read-only)
- `publisher` (resolved): find `p` in `publishers` where `normalize(p.publisher_name) === row.publisher`; use `String(p.publisherid)`. **Fallback:** if no match, use `row.publisher` (the resolver's exact-name branch still matches) and show a subtle "saved by name" note.
- metric inputs: `ctr, cpv, conversion_rate, vtr, frequency` (use the scale confirmed in Verify step 1; reuse PublisherKpiForm's parser/helpers if exported).

On submit:
```ts
const res = await fetch("/api/kpis/publisher", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ publisher, media_type, bid_strategy, ctr, cpv, conversion_rate, vtr, frequency }),
})
if (!res.ok) { /* toast the error text */ return }
await onPublisherKpiAdded?.()   // refreshes publisherKPIs + bumps kpiTrigger → resolver re-runs → flag clears
// close the inline form
```
Don't optimistically mutate `kpiRows`; the resolver refresh is the source of truth.

### `app/mediaplans/create/page.tsx` (and edit page)
At the `KPISection` call sites, pass:
```tsx
publishers={kpiPublishers}
onPublisherKpiAdded={async () => {
  const data = await getPublisherKPIs()
  setPublisherKPIs(data)
  setKpiTrigger((t) => t + 1)
}}
```
(Edit page: same, mirroring its existing `getPublisherKPIs` block.)

## Gate & smoke
1. `npx tsc --noEmit` → no new errors.
2. Smoke: open a plan with a flagged row (publisher has a client KPI, no publisher KPI) → Edit KPIs → the flagged row shows "Add publisher KPI" → fill metrics → save → toast success → modal/panel flag clears for that row (resolver re-ran, `hasPublisherKpi` now true). Verify in Xano the new `publisher_kpi` row has `publisher` = the publisher **id**.
3. Confirm a non-flagged row shows no button.

## Commits (one logical change; component + wiring cohere)
```powershell
git add "components/kpis/KPISection.tsx"
git add "components/kpis/KPIEditModal.tsx"
git add "app/mediaplans/create/page.tsx"
git add "app/mediaplans/mba/[mba_number]/edit/page.tsx"
git commit -m "feat(kpi): add publisher KPI inline from flagged media-plan rows"
```
Do not push. Report tsc + the metric-scale convention you confirmed.
