# BUILD P4b (continue) — remaining channels + page wiring

Done so far: 4a (`8aa8fef`), DigiDisplay (`3947f1f`), ProgDisplay (`2788a04`), ProgVideo (committed). Helper in use: `lib/billing/resolveBillingBurstLineItemId.ts` → `resolveBillingBurstLineItemId(lineItem, mbaNumber, MEDIA_TYPE_ID_CODES.<key>, lineItemIndex)` (stored id wins, else `buildLineItemIdentity`).

This prompt covers **PART A** (the 6 remaining container threadings — one commit each) and **PART B** (the page-side `calculateAdServingFees` wiring — the step that actually turns KPI-based fees on). Do PART A fully, then PART B.

---

## PART A — Thread `lineItemId` onto bursts in the 6 remaining containers

For EACH container below, apply the identical 4-step edit already used in DigiDisplay/ProgVideo:

1. Add `mbaNumber?: string` as the last param of the burst builder.
2. Change the builder's `.flatMap(li =>` to `.flatMap((li, liIndex) =>`.
3. In the returned burst object, add:
   ```ts
   lineItemId: resolveBillingBurstLineItemId(li, mbaNumber, MEDIA_TYPE_ID_CODES.<KEY>, liIndex),
   ```
4. Ensure imports exist in the file: `resolveBillingBurstLineItemId` from `@/lib/billing/resolveBillingBurstLineItemId` and `MEDIA_TYPE_ID_CODES` from `@/lib/mediaplan/lineItemIds`.
5. In the SAME container component, the builder is called inside the component (the `onBurstsChange` effect, and sometimes a `calculatedBursts` line). The component already reads `const { mbaNumber } = useMediaPlanContext()` (as DigiDisplay/ProgVideo do — confirm it's present; add it if missing). Pass `mbaNumber` as the new 3rd arg at **every** call site of the builder in that file (grep `get<X>Bursts(` within the file to find them all).

| Container file | Builder fn (line) | `.flatMap` source | mediaType literal | `MEDIA_TYPE_ID_CODES.<KEY>` |
|---|---|---|---|---|
| `ProgBVODContainer.tsx` | `getProgBvodBursts` (155) | `lineItems` | `"prog bvod"` | `progBVOD` |
| `ProgOOHContainer.tsx` | `getProgOohBursts` (150) | `lineItems` | `"prog ooh"` | `progOOH` |
| `ProgAudioContainer.tsx` | `getProgAudioBursts` (155) | `lineItems` | `"progaudio"` | `progAudio` |
| `DigitalAudioContainer.tsx` | `getDigiAudioBursts` (144) | `digiaudiolineItems` | `"digi audio"` | `digitalAudio` |
| `DigitalVideoContainer.tsx` | `getDigiVideoBursts` (139) | `digivideolineItems` | `"Digi Video"` | `digitalVideo` |
| `BVODContainer.tsx` | `getBVODBursts` (149) | `bvodlineItems` | `"BVOD"` | `bvod` |

**Per channel: tsc gate → smoke (bursts still compute, no console errors) → one commit.** Suggested order: ProgBVOD, ProgOOH, ProgAudio, DigiAudio, DigiVideo, BVOD.

```powershell
git add "components/media-containers/<File>.tsx"
git commit -m "feat(adserving): thread lineItemId onto <channel> bursts for KPI join"
```

After all six, every ad-serving burst in state (`progDisplayBursts`, `bvodBursts`, …) carries `lineItemId`.

---

## PART B — Wire `calculateAdServingFees` to resolved KPIs (create + edit pages)

This is where fees actually change. Do it on BOTH `app/mediaplans/create/page.tsx` (`calculateAdServingFees`, ~line 1282) and the edit page's equivalent.

Inside the `allBursts.reduce(...)`, build a KPI lookup from `kpiRows` and pass normalised ctr/vtr per burst:

```ts
const kpiByLineId = new Map(kpiRows.map((r) => [r.lineItemId, r]));
// CTR/VTR are stored as decimals (confirmed P3), but guard legacy percent-point rows:
const toDecimal = (v: number | null | undefined) =>
  v == null ? null : (v >= 1 ? v / 100 : v);

return allBursts.reduce((sum, b) => {
  if (b.noAdserving) return sum;
  const kpi = b.lineItemId ? kpiByLineId.get(b.lineItemId) : undefined;

  if (process.env.NODE_ENV !== "production") {
    const bt = (b.buyType || "").toLowerCase();
    if ((bt === "cpc" || bt === "cpv") && !kpi) {
      console.warn("[adserving] cpc/cpv burst unmatched to KPI — baseline used", {
        lineItemId: b.lineItemId, mediaType: b.mediaType, buyType: b.buyType,
      });
    }
  }

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
  return sum + cost;
}, 0);
```

Add `kpiRows` to the `useCallback` dependency array. (Edit page: same shape against its `kpiRows` state.)

### Smoke — the money-risk gate (do not skip)
On a real plan that has **cpc and cpv** lines whose publishers have KPIs (publisher/client/campaign tier):
1. Open dev console. Confirm **zero** `[adserving] … unmatched to KPI` warnings for cpc/cpv lines that should match. Any warning = the create-time id join is off → STOP and report the logged `lineItemId` + the corresponding KPI row's `lineItemId` so we can fix alignment before trusting fees.
2. Confirm the Adserving/Tech total moves vs the old baseline in the expected direction (a higher CTR than 0.1% → fewer derived impressions → lower cpc ad-serving fee; a VTR above/below 25% shifts cpv fees accordingly).
3. Confirm a manual per-burst `adServingRatePct > 0` still overrides the KPI (precedence intact).
4. `npx tsc --noEmit` clean.

### Commit (after smoke)
```powershell
git add "app/mediaplans/create/page.tsx"
git add "app/mediaplans/mba/[mba_number]/edit/page.tsx"
git commit -m "feat(adserving): derive cpc/cpv ad-serving fees from resolved KPIs"
```
Leave the dev-only diagnostic `console.warn` in for now (it's gated to non-production); we can remove it after a few real plans confirm clean joins. Do not push. Report the smoke result — especially whether any cpc/cpv bursts logged as unmatched.

---

## Why PART B is the real checkpoint
PART A only makes bursts carry an id. PART B is the first time fees depend on it. The unmatched-burst log converts the one genuine risk (create-time id alignment between `groupLineItemsForKPI` and the burst builders) from a silent fee error into a visible, before-commit signal.
