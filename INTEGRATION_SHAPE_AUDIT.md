# Integration `bursts_json` shape change — discovery audit

**Date:** 2026-05-12  
**Scope:** Read-only. Assess risk of Stage 1 adding `calculatedValue`, `mediaAmount`, and `feeAmount` to Integration line items’ `bursts_json` (replacing the historical four-field write: `budget`, `buyAmount`, `startDate`, `endDate` only).  
**Question:** Will that break anything downstream?

---

## 1. Why was Integration different?

### 1.1 When the four-field **write** appeared

Git history (`git log -p -S "bursts_json:" --follow -- components/media-containers/IntegrationContainer.tsx`) shows the Integration **`bursts_json` serialization** (the `JSON.stringify(lineItem.bursts.map(...))` inside the `onMediaLineItemsChange` effect) was introduced in:

| Commit | Date (author) | Message (summary) |
|--------|---------------|-------------------|
| `3493b7fb172b4adbdd1390c63224b9ac945d9c07` | 2025-12-15 | *Release v1.1 updates across dashboard and media plan flows.* |

That change added `initialLineItems` hydration and the effect that pushes transformed line items (including `bursts_json`) upward. The new serializer **only** emitted:

- `budget`, `buyAmount`, `startDate`, `endDate`

There was **no commit message or comment** stating that `calculatedValue` or `fee` were deliberately omitted from persistence.

### 1.2 Hydration vs persistence mismatch (pre–Stage 1)

- **2025-12-15 (`3493b7f`):** Initial load mapped bursts to **four fields only** (no `calculatedValue` / `fee` in the default branch either).
- **2026-01-09 (`400bfb36cb9d692f7954fceaa17d6edb90bf0cc2` — *feat: add meta pacing demo and bonus buy handling*):** Hydration from `bursts_json` was extended to include **`calculatedValue`** and **`fee`** (`burst.calculatedValue ?? 0`, `burst.fee ?? 0`), and default empty bursts gained those keys.
- **Last committed `HEAD` (before Stage 1 serializer):** Hydration still read `calculatedValue` and `fee`, but the **`bursts_json` write path still only serialized the original four fields** (`git show HEAD:...IntegrationContainer.tsx` confirms the mismatch).

**Conclusion:** The four-field persisted shape looks like an **oversight** when the MBA sync effect was first added (copied a “minimal” burst DTO), **not** a documented product decision to exclude fee/deliverables from JSON. The later January 2026 commit partially corrected **read** behaviour but **did not** align the write path—Stage 1 closes that gap and aligns with the shared contract.

---

## 2. Integration-specific readers

### 2.1 Imports / mounts of `IntegrationContainer`

| Location | Role |
|----------|------|
| `app/mediaplans/create/page.tsx` | Lazy import; passes `feeintegration` from client (`selectedClient.feeintegration`). |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx` | Lazy import; `feeintegration={feeIntegration \|\| 0}` from loaded client. |
| `app/mediaplans/[id]/edit/page.tsx` | Lazy import; **`feeintegration={selectedClient?.feesearch \|\| 0}`** — appears to wire **Search** fee into Integration (possible long-standing bug; separate from burst shape but affects serialized fee math if uncorrected). |

No other components import `IntegrationContainer` for burst parsing.

### 2.2 Paths with `integration` + `bursts_json` / burst parsing

| File | Behaviour | Fields read from each burst |
|------|-------------|-----------------------------|
| **`components/media-containers/IntegrationContainer.tsx`** | `JSON.parse(item.bursts_json)` when hydrating `initialLineItems`. | `budget`, `buyAmount`, `startDate`, `endDate`, `calculatedValue` (default 0), `fee` (default 0). Does **not** read `mediaAmount` / `feeAmount` today; adding them is **additive** and ignored unless code is later extended to prefer them. |
| **`app/api/media_plans/integration/route.ts`** | `JSON.parse(data.bursts_json)` on POST; stores parsed array on `integrationData.bursts_json`. | No per-field access—**opaque** pass-through to Xano. |
| **`lib/api.ts`** — `saveIntegrationLineItems` | Parses or uses `lineItem.bursts` / `bursts_json`, then **`extractAndFormatBursts`** → `serializeBurstsJson` → `JSON.stringify(formattedBursts)` for the save payload. | Save path **recomputes** `mediaAmount` / `feeAmount` from budget + line flags + fee %; it does not require Integration’s prior JSON to have omitted or included those keys. |
| **`lib/mediaplan/expertChannelMappings.ts`** — `normalizeIntegrationBursts` | Delegates to **`normalizeOohBursts`** (same as OOH/Radio normalisation). | Reads: `budget`, `buyAmount` (aliases), `startDate` / `endDate`, **`calculatedValue`** (number or `calculated_value`), **`fee` only if `typeof b.fee === "number"`**. Does **not** read `feeAmount` / `mediaAmount`. Persisted Integration rows historically had **no numeric `fee`** in JSON → `fee` was always `undefined` after normalise; **`feeAmount` as a formatted string does not change that** (still no numeric `fee`). |
| **`lib/mediaplan/expertModeSwitch.ts`** — `serializeIntegrationStandardLineItemsBaseline` | Dirty-check baseline JSON of standard line items (not the same as Xano `bursts_json`). | Bursts: `budget`, `buyAmount`, `startDate`, `endDate`, `calculatedValue`, **`fee`** — used for equality baselines, not for Xano burst persistence. |

### 2.3 `calculatedValue` — any “Integration has no calculatedValue” assumption?

Repo-wide search for patterns like `if (burst.calculatedValue)` used as a discriminator for Integration **found no matches** in `.ts` / `.tsx`. Integration totals already use `burst.calculatedValue \|\| 0` in multiple places; presence of a numeric `0` vs absence is already normalised at hydrate time.

### 2.4 `fee` vs `feeAmount`

- Legacy **`fee`** on persisted Integration bursts: **effectively absent** (never written in the four-field era). Hydration used `burst.fee ?? 0`, so the form always saw **`0`** for `fee` when re-opening plans.
- Stage 1 contract uses **`feeAmount`** (formatted string) and **`mediaAmount`**, not `fee`. Code that only checks **`typeof b.fee === "number"`** (expert normalisation) **continues** to see no numeric `fee` unless something else writes it.
- No reader was found that branches on “**burst has no `fee` key**” specifically for Integration.

---

## 3. Generic readers that also touch Integration rows

Cross-check with **`BURSTS_TYPE_AUDIT.md` §6** (`JSON.parse` / burst string read sites). For each, whether Integration line items typically flow through it, and sensitivity to **`calculatedValue`** / new money fields:

| Site | Sees Integration? | `calculatedValue` / new fields |
|------|-------------------|--------------------------------|
| **`lib/api.ts`** `extractAndFormatBursts` | **Yes** (`saveIntegrationLineItems`). | Re-serializes via `serializeBurstsJson`; can derive fee % from existing `feeAmount` on bursts when line-item fee props are missing (`deriveFeePctFromSerializedBursts`). **Adding** `feeAmount` / `mediaAmount` on Integration **improves** consistency with this path. |
| **`lib/mediaplan/deriveBursts.ts`** / **`normalizeCampaignLineItems.ts`** | Yes, if integration items are in the normalised campaign snapshot. | `normaliseBurst` uses spend/deliverable **aliases**, not `calculatedValue` or `fee` / `feeAmount`. Extra keys are ignored. |
| **`lib/mediaplan/expertChannelMappings.ts`** `normalizeOohBursts` | Yes (Integration delegates here). | See §2.2; `calculatedValue` optional; `fee` only if number. |
| **`lib/billing/generateBillingLineItems.ts`** | If integration rows included in billing build. | Uses budget / buyAmount / flags; **not** `burst.fee` from JSON per prior audit. |
| **`lib/utils/mediaPlanValidation.ts`** | `integrationMediaLineItems` included in burst date checks. | Only **`startDate` / `endDate`** after parse. |
| **`lib/finance/utils.ts`** `calculateMonthlyAmountFromBursts` | Possible if called with integration bursts. | Budget / cost aliases; no dependency on absence of `calculatedValue` / `feeAmount`. |
| **`lib/xano/fetchAllLineItems.ts`** / **`lib/snowflake/syncXanoLineItems.ts`** | Yes for snapshots. | **Opaque** JSON; **unknown** whether external SQL/models assume a fixed column set or numeric types—**low–medium** operational risk if downstream casts fields. |
| **`lib/pacing/plan/normalisePlan.ts`**, **`lib/pacing/syncSearchContainersToPacing.ts`** | Integration not Search-specific; pacing may still see generic burst arrays in some flows. | Budget aliases; no Integration-specific branch found. |
| **`lib/delivery/social/...`**, **`lib/delivery/programmatic/...`** | Not Integration-specific. | N/A. |
| **`app/mediaplans/mba/.../edit/page.tsx`**, **`create/page.tsx`** (clone / billing helpers) | Yes. | Prior audit: budget / flags / length; no logic found that treats missing Integration `calculatedValue` as invariant. |

**Net:** In-repo consumers are overwhelmingly **tolerant of extra keys** or **ignore** fee/calculated fields for dollar logic. The main residual risk class is **external** consumers of raw JSON (Snowflake / Xano views / ad-hoc exports), not TypeScript branches that detect Integration by missing `calculatedValue`.

---

## 4. Product intent — fees and deliverables on Integration

From **`IntegrationContainer.tsx`** UI and helpers:

| Concern | Present? |
|---------|----------|
| **Deliverables / “calculated” column** | **Yes.** `CpcFamilyBurstCalculatedField` bound to `bursts.*.calculatedValue` (`variant="cpcCpvCpm"`), with `computeDeliverableFromMedia` in `handleValueChange` (buy-type–aware). Deliverables contribute to line totals (`lineDeliverables += burst.calculatedValue \|\| 0`) and the summary stripe (`getDeliverablesLabel` / `totalCalculatedValue`). |
| **Fee percentage** | **Yes, at line / plan level:** `feeintegration` prop (client’s Integration fee %) drives read-only Media/Fee dollar displays, `getIntegrationBursts` → `computeBurstAmounts`, and serialized **`feeAmount`** / **`mediaAmount`**. There is **no separate per-burst fee %** field in the burst editor—consistent with other channels that pass a single fee % into `serializeBurstsJson`. |
| **Client Pays for Media** | **Yes.** `FormField` `lineItems.*.clientPaysForMedia` with label **“Client Pays for Media”** (~1511–1517 in current file). |

**Semantic note:** `calculatedValue` is **not** universally “0” or noise—it can be non-zero for CPC/CPM/CPV-style buy types and is user-meaningful for deliverable totals. **`mediaAmount` / `feeAmount`** in `bursts_json` mirror **`computeBurstAmounts`** (same as other Stage 1 channels) and are **not** meaningless when `feeintegration` and budgets are non-zero.

---

## 5. Stage 1 output check (`serializeBurstsJson` call site)

In **`IntegrationContainer.tsx`** (~610–615 in the current working tree), `bursts_json` is built as:

```ts
JSON.stringify(
  serializeBurstsJson({
    bursts: lineItem.bursts,
    feePct: feeintegration || 0,
    budgetIncludesFees: lineItem.budgetIncludesFees || false,
    clientPaysForMedia: lineItem.clientPaysForMedia || false,
  })
)
```

- **`feePct`** is the real **`feeintegration`** container prop (client-level Integration fee %), **not** a hard-coded `0`.
- Flags **`budgetIncludesFees`** and **`clientPaysForMedia`** are taken from each line item, matching `computeBurstAmounts` semantics used elsewhere.

---

## 6. Will the new fields break anything downstream?

### 6.1 In-application

| Risk area | Assessment |
|-----------|------------|
| **Hydration** | Already expects `calculatedValue` and legacy `fee`; optional new keys **`mediaAmount` / `feeAmount`** are ignored unless explicitly read later. |
| **Expert normalise** | Still ignores string `feeAmount`; numeric `fee` still absent unless added elsewhere—**same as before** for Integration. |
| **`extractAndFormatBursts`** | Aligns Integration saves with the shared serializer; **reduces** fee-% ambiguity when line-item props are sparse (via `deriveFeePctFromSerializedBursts`). |
| **Validation** | `mediaPlanValidation` date checks unchanged. Zod `baseBurstSchema` (current tree) already allows optional **`mediaAmount`** / **`feeAmount`** types alongside legacy `fee`. |

### 6.2 External / analytics

| Risk area | Assessment |
|-----------|------------|
| **Snowflake / SQL / strict JSON consumers** | **Unknown.** Adding string `feeAmount` / `mediaAmount` and numeric `calculatedValue` is valid JSON; risk is only if a downstream pipeline assumes **exactly four keys** or **numeric** types for all values. No in-repo proof of such a pipeline. |

---

## 7. Recommendation framing (no decision)

1. **Accept as-is (Integration writes full Stage 1 contract)**  
   Strong alignment with `saveIntegrationLineItems` → `extractAndFormatBursts`, expert hydrate patterns, and billing math primitives. In-repo breakage risk is **low**. Residual uncertainty is **external** JSON consumers.

2. **Roll Integration back to a “partial” persisted shape**  
   Would **reintroduce** the historical mismatch (rich form state, thin JSON) and diverge from the chokepoint serializer used on save—**not** recommended unless product explicitly wants Integration excluded from the contract.

3. **Treat Integration as out of scope and restore four-field writes**  
   Same drawbacks as (2), plus undermines Stage 1’s goal of a single burst JSON contract across consulting channels. Only sensible if Integration were officially deprecated or stored in a different table/shape (it is not).

---

## 8. References (anchors in current tree)

- `IntegrationContainer.tsx` — `serializeBurstsJson` / `feeintegration` (~576–622).  
- `IntegrationContainer.tsx` — hydrate from `bursts_json` (~552–566).  
- `lib/mediaplan/serializeBurstsJson.ts` — contract + `deliveryMediaAmount` comment (~39–70).  
- `lib/mediaplan/expertChannelMappings.ts` — `normalizeIntegrationBursts` → `normalizeOohBursts` (~4333–4337, ~550–577).  
- `lib/api.ts` — `extractAndFormatBursts` / `deriveFeePctFromSerializedBursts` (~1790–1893).  
- `lib/mediaplan/expertModeSwitch.ts` — `serializeIntegrationStandardLineItemsBaseline` (~1014–1047).  
- Git: `3493b7f` (four-field write introduced), `400bfb3` (hydrate gained `calculatedValue` / `fee`).
