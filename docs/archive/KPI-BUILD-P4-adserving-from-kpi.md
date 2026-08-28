# BUILD P4 — Ad serving for cpc/cpv driven by resolved KPIs

Decisions (locked): **per-line precise (identity = `lineItemId`)**; precedence **manual `adServingRatePct` > 0 → resolved KPI ctr/vtr → hardcoded baseline**; `adServingRatePct` stays **manual-only**; KPI ctr/vtr passed **separately** into the compute layer (clean provenance). Do NOT use the blended or stamp-into-override approaches.

Split into **4a (safe, build now)** and **4b (the join — confidence-gated)**.

---

## 4a — Compute layer accepts KPI ctr/vtr (inert until 4b). Confidence: 93%.

### `lib/billing/computeAdServingCost.ts`
Add two optional inputs and use them in the precedence chain, keeping baselines as the final fallback. **Keep `adServingRatePct` as manual-only — do not populate it from KPI.**
```ts
export function computeAdServingCost(input: {
  quantity: number;
  buyType: string;
  mediaType: string;
  rate: number;
  adservaudio?: number | null;
  adServingRatePct?: number;     // manual override only (percent)
  adServingImpressions?: number;
  kpiCtr?: number | null;        // NEW: resolved KPI CTR (decimal, e.g. 0.012)
  kpiVtr?: number | null;        // NEW: resolved KPI VTR (decimal)
}): number {
  // ...unchanged up to ctr/vtr derivation...

  // Precedence: manual override (percent → decimal) → resolved KPI → baseline.
  const manualPct = input.adServingRatePct != null && input.adServingRatePct > 0
    ? input.adServingRatePct / 100
    : null;
  const ctrDecimal = manualPct ?? (input.kpiCtr != null && input.kpiCtr > 0 ? input.kpiCtr : BASELINE_CTR);
  const vtrDecimal = manualPct ?? (input.kpiVtr != null && input.kpiVtr > 0 ? input.kpiVtr : BASELINE_VTR);
  // ...rest unchanged...
}
```
**Important — KPI value scale.** Resolved KPI `ctr/vtr` may be stored in legacy percent-point form (e.g. `3` meaning 3%) — see `lib/kpi/metrics.ts::formatPercentForInput` heuristic (`value >= 1 ? value/100`). Apply the SAME heuristic when passing `kpiCtr/kpiVtr` so a stored `1.2` becomes `0.012`, not `1.2`. Normalise at the call site (4b), not inside compute.

### `lib/billing/types.ts`
Add to `BillingBurst`:
```ts
lineItemId?: string   // for KPI join in ad-serving fee derivation
```

### Gate & commit (4a)
`npx tsc --noEmit` (no new errors). No behaviour change yet (new params undefined everywhere → baselines as before). Add a unit test for the precedence in `lib/billing/__tests__` if that folder exists.
```powershell
git add "lib/billing/computeAdServingCost.ts"
git add "lib/billing/types.ts"
git commit -m "feat(adserving): accept resolved KPI ctr/vtr with manual>KPI>baseline precedence"
```

---

## 4b — The burst↔KPI join. Confidence: 80% at create-time → **verify before wiring.**

**The risk:** the resolved KPI row's `lineItemId` comes from `groupLineItemsForKPI` (`lib/kpi/grouping.ts`), which uses the stored `line_item_id` **or recomputes it** via `buildLineItemIdentity(item, mba, code, index)`. At create-time the form line items typically have NO stored id, so threading a raw `li.lineItemId` onto bursts yields empty ids and the join silently misses → fees fall back to baseline. At edit-time stored ids exist and the join is clean.

### Required pre-build verification (do this first, report back)
1. Read `lib/kpi/lineItemsForFanOut.ts::buildKpiLineItemsByMediaType` and confirm the per-media-type array order/identity it feeds to `groupLineItemsForKPI` matches the order of the form line items each container builder iterates (`form.getValues("<x>lineItems")`). The `index` passed to `buildLineItemIdentity` must be identical on both sides for recomputed ids to match.
2. Confirm `buildLineItemIdentity` is deterministic for the same `(item, mba, code, index)`.
3. Decide the canonical join key: stored `line_item_id` when present, else `buildLineItemIdentity(li, mba, code, index)` — computed the SAME way in the container builder as in grouping.

Only once 1–3 are confirmed, proceed.

### Thread identity onto bursts (9 containers)
Each ad-serving container has a `): BillingBurst[]` builder that does `lineItems.flatMap((li, liIndex) => (li.bursts||[]).map(burst => ({ ... })))`. Files:
`ProgDisplayContainer, ProgVideoContainer, ProgBVODContainer, ProgOOHContainer, ProgAudioContainer, DigitalAudioContainer, DigitalDisplayContainer, DigitalVideoContainer, BVODContainer`.

In each builder's returned object add the **computed** id (not the raw field), mirroring grouping:
```ts
// liIndex = index of li in the flatMap; pass mba + code in (see below)
lineItemId:
  String(li.line_item_id ?? li.lineItemId ?? "").trim() ||
  buildLineItemIdentity(li, mbaNumber, code, liIndex).line_item_id,
```
`code = idCodeForKpiMediaType("<media type for this container>")`. The builders need `mbaNumber` — pass it from the page (the page already has `fv.mba_number`). If threading mba into 9 containers is too invasive, the lower-risk alternative is to compute `lineItemId` in the page-side burst-change handlers (`handle*BurstsChange`) where mba is in scope — confirm during verification which site is cleaner. **One channel first (DigiDisplay), smoke, then replicate.**

### Wire `calculateAdServingFees` (create + edit pages)
Build a lookup from `kpiRows` and pass normalised KPI ctr/vtr per burst:
```ts
const kpiByLineId = new Map(kpiRows.map((r) => [r.lineItemId, r]));
const toDecimal = (v: number | null) => v == null ? null : (v >= 1 ? v / 100 : v); // legacy-percent heuristic
// inside the reduce, per burst b:
const kpi = b.lineItemId ? kpiByLineId.get(b.lineItemId) : undefined;
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
});
```
Add `kpiRows` to the `useCallback` deps.

### Diagnostic-first rollout (non-negotiable for a money path)
Before trusting it, add a dev-only log of cpc/cpv bursts whose `lineItemId` did NOT match a KPI row (so silent baseline fallback is visible):
```ts
if (process.env.NODE_ENV !== "production" && (b.buyType==="cpc"||b.buyType==="cpv") && !kpi) {
  console.warn("[adserving] cpc/cpv burst unmatched to KPI — using baseline", { lineItemId: b.lineItemId, mediaType: b.mediaType });
}
```
Smoke a real plan with cpc and cpv lines that HAVE publisher/client KPIs; confirm zero unmatched warnings and that the ad-serving total changes vs baseline in the expected direction. Then remove or gate the log.

### Gate & commits (4b)
tsc clean each step. **One channel per commit** for the container threading (per your chokepoint discipline), then one commit for the page wiring. Smoke before each commit. Do not push.

---

## Why staged this way
4a is a safe, reversible refactor that establishes the precedence without changing any number. 4b carries the only real risk (the create-time id join); the verification step + diagnostic logging convert a potential silent fee error into a visible, testable one before it touches a quote.
