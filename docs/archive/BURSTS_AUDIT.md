# Bursts JSON write path — read-only audit

**Scope:** Discovery only. No application source files were modified except this report.

**Context:** MBA line items persist burst schedules to Xano as `bursts_json` (JSON array per line item). Example shape observed in the wild:

`[{"fee":0,"budget":"$1,990.00","endDate":"...","buyAmount":"$8.00","startDate":"...","calculatedValue":223875}]`

**Known symptoms (confirmed by code paths below):**

- `fee` is written as `burst.fee || 0` while form state never populates `burst.fee` from the agency fee percentage; new bursts default `fee: 0`. Result: **stored `fee` is effectively always 0** for the standard MBA container path unless older data already contained a non-zero `fee` in JSON.
- **No `media` (or equivalent) field** is included in the serialized burst object for those containers; media dollars exist only as **derived UI** and in **`get*Bursts` → `BillingBurst`** for billing, not in `bursts_json`.

---

## 1. Write sites

### 1A. Primary pattern — `*Container` → `onMediaLineItemsChange`

Each consulting-style media container builds API-shaped line items in a `useEffect` driven by `useWatch`/`watchedLineItems`. The burst payload is almost always:

```ts
bursts_json: JSON.stringify(
  lineItem.bursts.map((burst) => ({
    budget: burst.budget || "",
    buyAmount: burst.buyAmount || "",
    startDate: /* ISO if Date else string */,
    endDate:   /* ISO if Date else string */,
    calculatedValue: burst.calculatedValue || 0,
    fee: burst.fee || 0,
  }))
)
```

| File | Lines (approx.) | Media type | Notes |
|------|-----------------|------------|--------|
| `components/media-containers/ProgDisplayContainer.tsx` | 642–648 | Programmatic display | Canonical example |
| `components/media-containers/ProgVideoContainer.tsx` | 710–716 | Programmatic video | Same shape |
| `components/media-containers/ProgAudioContainer.tsx` | 633–639 | Programmatic audio | Same |
| `components/media-containers/ProgBVODContainer.tsx` | 625–631 | Programmatic BVOD | Same |
| `components/media-containers/ProgOOHContainer.tsx` | 646–652 | Programmatic OOH | Same |
| `components/media-containers/DigitalDisplayContainer.tsx` | 744–750 | Digital display | Same |
| `components/media-containers/DigitalVideoContainer.tsx` | 704–710 | Digital video | Same |
| `components/media-containers/DigitalAudioContainer.tsx` | 742–748 | Digital audio | Same |
| `components/media-containers/OOHContainer.tsx` | 697–703 | OOH | Same |
| `components/media-containers/IntegrationContainer.tsx` | 609–615 | Integration | Same |
| `components/media-containers/SearchContainer.tsx` | 684–690 | Search | Same |
| `components/media-containers/SocialMediaContainer.tsx` | 781–787 | Social media | Same |
| `components/media-containers/BVODContainer.tsx` | 795–801 | BVOD | Same |
| `components/media-containers/InfluencersContainer.tsx` | 619–625 | Influencers | Uses `lineItem.bursts?.map`; same fields |
| `components/media-containers/TelevisionContainer.tsx` | 1270–1278 | Television | **Adds** `size`, `tarps`; same core + `fee` |
| `components/media-containers/RadioContainer.tsx` | 887–919 | Radio | Same six fields in `formattedBursts`; passes **`bursts`** (array) and **`bursts_json: JSON.stringify(formattedBursts)`** for compatibility with `extractAndFormatBursts` |
| `components/media-containers/CinemaContainer.tsx` | 636–642 | Cinema | Same core |
| `components/media-containers/NewspaperContainer.tsx` | 829–835 | Newspaper | Same core |
| `components/media-containers/MagazinesContainer.tsx` | 856–862 | Magazines | Same core |

**Per-burst object (standard MBA containers):**

| Field | Source expression | `fee` | Media cost field |
|-------|-------------------|-------|------------------|
| `budget` | `burst.budget \|\| ""` | — | **Not present** |
| `buyAmount` | `burst.buyAmount \|\| ""` | — | **Not present** |
| `startDate` | `burst.startDate` → `.toISOString()` if `Date` | — | — |
| `endDate` | `burst.endDate` → `.toISOString()` if `Date` | — | — |
| `calculatedValue` | `burst.calculatedValue \|\| 0` | — | — |
| `fee` | `burst.fee \|\| 0` | **Form field `fee`**, default 0; not synced from fee % | **No separate media $ field** |

**Television extra fields:** `size: burst.size || ""`, `tarps: burst.tarps || ""` (same file, same `map`).

**Downstream Xano save (browser → `lib/api.ts`):** Many `save*LineItems` functions call `extractAndFormatBursts(lineItem)` (lines **1779–1843**), which rebuilds objects with the same six keys (`budget`, `buyAmount`, `startDate`, `endDate`, `calculatedValue`, `fee`) and copies **any other** keys from the original burst into the output—still **no media field** unless it was already on the burst object (it is not, for the containers above).

Representative `extractAndFormatBursts` mapping:

```1825:1833:lib/api.ts
  return bursts.map((burst: any) => {
    const formattedBurst: any = {
      budget: burst.budget || "",
      buyAmount: burst.buyAmount || "",
      startDate: formatBurstDate(burst.startDate),
      endDate: formatBurstDate(burst.endDate),
      calculatedValue: burst.calculatedValue || 0,
      fee: burst.fee || 0,
    };
```

Example second-hop stringify for prog display save: **`saveProgDisplayLineItems`** `lib/api.ts` **3697–3721** (`bursts_json: JSON.stringify(formattedBursts)`).

**Inconsistency:** Some saves pass an **array** to Xano as `bursts_json` (e.g. `saveTelevisionLineItems` / `saveNewspaperLineItems` use `bursts_json: formattedBursts` at **1631**, **1694**), while others double-stringify from containers that already used `JSON.stringify`. Behaviour depends on channel; the **semantic** payload for standard bursts remains the same six fields.

---

### 1B. Expert schedule → standard bursts — `lib/mediaplan/expertChannelMappings.ts`

**`buildBurstsFromProgExpertLikeRow`** (starts ~**5384**): pushes `StandardMediaBurst` rows with **`fee: 0` hardcoded** (e.g. **5455–5462**). **`formatBurstBudget`** (**167–171**) formats `budget` / buy-side strings as **plain decimal strings** (`Math.round(n * 100) / 100` then `String(rounded)`), **not** `$` Intl currency.

Many other normalizers in the same file assign **`fee: 0`** when constructing burst-like objects (grep shows dozens of occurrences); expert-derived rows **do not** compute fee or net/gross media columns for JSON.

---

### 1C. Production — different schema

**`components/media-containers/ProductionContainer.tsx`** `apiLineItems` (**425–445**): `bursts` sent as:

- `cost`, `amount`, `startDate`, `endDate` (no `budget` / `buyAmount` / `calculatedValue` / `fee` in this map).

**`lib/api.ts` `saveProductionLineItems`** (**2787–2872**): `normalizeBursts` maps to `{ cost, amount, startDate, endDate, description, market }` for Xano. **Not the same** as consulting `bursts_json`; production has **no agency fee** in this model.

---

### 1D. Other non-standard writers

| Location | Lines | Purpose |
|----------|-------|---------|
| `app/api/campaigns/[mba_number]/route.ts` | 333–344 | Builds minimal `bursts_json: JSON.stringify([{ startDate, endDate, budget, deliverablesAmount, deliverables, ... }])` for a campaign helper — **not** the MBA editor shape |
| `app/pacing/components/PacingPageClient.tsx` | 439–446 | Drawer props: `start_date`, `end_date`, `media_investment`, `deliverables`, etc. — **different** contract than MBA containers |
| `app/api/media_plans/integration/route.ts` | 40–66 | Forwards `bursts_json` from request body to Xano; **does not construct** burst rows (Integration **container** still builds standard six-field JSON in **IntegrationContainer.tsx** ~609) |

---

## 2. Source of truth at write-time

### Standard MBA containers (prog / digital / OOH / search / social / etc.)

| Correct value | Where it lives at save | Path to `bursts_json` write |
|---------------|-------------------------|----------------------------|
| Gross burst **budget** (currency string) | `form` → `lineItems[i].bursts[j].budget` | Mapped verbatim to `budget` |
| **Buy amount** / rate | `lineItems[i].bursts[j].buyAmount` | `buyAmount` |
| **Deliverables** | `lineItems[i].bursts[j].calculatedValue` | `calculatedValue` |
| **Agency fee %** | Parent page prop, e.g. `feeprogdisplay`, `feesearch`, `feetelevision`, … (not on burst row) | **Not written** to burst JSON |
| **Net media $ and fee $** | Computed in memory only: e.g. **`getProgDisplayBursts`** (**154–191**), inline **`getBursts`** (**1027–1071**), `computeBurstAmounts` (**`lib/mediaplan/burstAmounts.ts`** ~**72+**) | Used for **`onBurstsChange` → `BillingBurst[]`**, **not** for `bursts_json` |
| **Line totals** | `totalMedia` computed in same `useEffect` as `bursts_json` (from parsed budgets + fee flags) | Written on **line item**, not per burst |

So the **authoritative dollars** for billing live in **`BillingBurst`** (`mediaAmount`, `feeAmount`, `feePercentage`, … per **`lib/billing/types.ts`**), while **`bursts_json` duplicates only budget string + fee numeric field that stays 0**.

### Production

| Value | Source |
|-------|--------|
| Media cost | `burst.cost * burst.amount` per burst; **`buildBillingBursts`** (**141–162** in `ProductionContainer.tsx`) for billing |
| Xano payload | **`apiLineItems`** `bursts` with `cost` / `amount` / dates — **no** `fee` / `calculatedValue` MBA fields |

---

## 3. Read path (critical)

### 3A. Hydration from Xano → form

On load, containers parse `bursts_json` and map into form state, e.g. **ProgDisplayContainer.tsx** **576–582**:

- `budget`, `buyAmount`, `startDate`, `endDate`, `calculatedValue` from stored JSON  
- `fee: burst.fee || 0` — so **round-tripped `fee` is whatever was stored** (usually 0).

### 3B. Burst table UI (Budget, Buy Amount, dates, Impressions, **Media**, **Fee**)

**Media** and **Fee** columns are **not** bound to `burst.fee` or a stored media field for the CPC/CPM family pattern. Example **ProgDisplayContainer.tsx** **1721–1739**: two read-only `<Input>`s whose `value` is **`formatMoney(...)`** of expressions using:

- `form.getValues(...bursts...budget)` (parsed numeric),  
- `lineItems[i].budgetIncludesFees`,  
- container fee prop **`feeprogdisplay`**.

So the **UI shows correct-looking Media/Fee** while **`bursts_json` still has `fee: 0` and no media** — the bug is **masked in the editor** for users editing in-session.

The same “read-only derived Media/Fee from budget + line flags + fee %” pattern appears across other containers (e.g. **SearchContainer.tsx** ~**1810–1821**, **InfluencersContainer.tsx** ~**1709–1720**, etc.).

### 3C. Billing schedule / MBA aggregation (`app/mediaplans/mba/[mba_number]/edit/page.tsx`)

When distributing burst budgets into months (**~3878+**):

- **`budget`** string is parsed for amount.  
- **`feePct`** prefers `burst.feePercentage` / line item fields; if missing and `budget_includes_fees`, **`inferredLineItemFeePct`** is derived from **`totalMedia` vs sum of raw budgets** (**3850–3872**), **not** from `burst.fee`.  

So downstream **billing can partially compensate** for missing per-burst fee in JSON when `budget_includes_fees` and `totalMedia` are consistent; **`burst.fee` being 0 is not the sole input** for fee math there.

---

## 4. Shared type vs duplication

| Type / interface | Path | Relates to `bursts_json`? |
|------------------|------|---------------------------|
| **`StandardMediaBurst`** | `lib/mediaplan/expertChannelMappings.ts` **45–52** | Declares `budget`, `buyAmount`, `startDate`, `endDate`, optional `calculatedValue`, optional `fee` — **expert / normalisation** pipeline |
| **`BillingBurst`** | `lib/billing/types.ts` **1–18** | **Billing / pacing schedule**; uses `mediaAmount`, `feeAmount`, `feePercentage`, etc. — **different shape** from persisted `bursts_json` |
| **Form burst row** | Implicit per container (`defaultValues` / zod); duplicated | Same six-ish fields repeated in each container file |
| **`NormalizedBurst`** (search delivery) | `lib/delivery/search/searchCore.ts` / `SearchDeliveryContainer.tsx` | For pacing dashboards, not the editor save payload |
| **`NormalisedBurst`** | `lib/mediaplan/normalizeLineItem.ts` **1–7**, `lib/mediaplan/deriveBursts.ts` **1–7** | Gantt / normalisation; different fields |

**Conclusion:** There is **no single shared TypeScript type** for the exact Xano `bursts_json` row used by all MBA containers. **`StandardMediaBurst`** is the closest for expert + some normalisers; **containers duplicate** the serialize literal inline.

---

## 5. Formatting helpers

| Helper | Location | Signature / behaviour | Used for MBA burst `budget` in UI |
|--------|----------|------------------------|-----------------------------------|
| **`formatMoney`** | `lib/format/money.ts` **97–101** | `formatMoney(value: MoneyInput, options?: MoneyFormatOptions): string` — **Intl currency** (default 2 dp) | **Yes** — blur/format handlers on budget & buy amount fields (e.g. ProgDisplay **1600–1603**, **1636–1639**) |
| **`formatCurrencyFull`** | `lib/format/currency.ts` **44–57** | `formatCurrencyFull(value: number, options?: FormatCurrencyFullOptions): string` | Production totals, charts, expert grids — **not** the standard burst TextField initial format in all paths |
| **`formatBurstBudget`** | `lib/mediaplan/expertChannelMappings.ts` **167–171** | `formatBurstBudget(n: number): string` → **plain numeric string**, not `$1,990.00` | Expert-generated **`budget`** / `buyAmount` strings only |
| **`parseMoneyInput`** | `lib/format/money.ts` **78–91** | Parses currency strings for `formatMoney` | Paired with `formatMoney` on blur |

**Recommendation for a fix aligned with current UI:** use **`formatMoney`** (same options as containers: typically `{ locale: "en-AU", currency: "AUD" }`) for any new persisted **fee** / **media** string fields so they match **budget** display. **`formatCurrencyFull`** is equivalent for numeric inputs if you prefer the shared currency module namespace.

---

## 6. Container coverage

### Writes standard `{ budget, buyAmount, startDate, endDate, calculatedValue, fee }` JSON (via `JSON.stringify` in container)

All of the following share the **same structural bug** ( **`fee` from form defaults / 0**, **no media field** ), except where noted:

- Programmatic: **ProgDisplay**, **ProgVideo**, **ProgAudio**, **ProgBVOD**, **ProgOOH**  
- Digital: **DigitalDisplay**, **DigitalVideo**, **DigitalAudio**  
- **OOH**, **Integration**, **Search**, **SocialMedia**, **BVOD**, **Influencers**  
- **Television** (+ `size`, `tarps`)  
- **Radio** (also sets `bursts` array for API)  
- **Cinema**, **Newspaper**, **Magazines**

**Expert mode** (`buildBurstsFromProgExpertLikeRow` and related): **`fee: 0` hardcoded**; budgets via **`formatBurstBudget`** (non-currency string).

**Production:** **Different** burst shape (`cost` / `amount` / dates); **no** MBA-style `fee` / `calculatedValue` / currency `budget` in that payload.

### None of the standard MBA containers were found to persist per-burst **media** dollars or a **non-zero fee** in `bursts_json` through the analysed paths.

---

## Appendix: tracing value to Xano (call chain)

1. Container `useEffect` → **`onMediaLineItemsChange(transformedLineItems)`** with `bursts_json` string (and `totalMedia`, flags, etc.).  
2. Parent (e.g. **`app/mediaplans/mba/[mba_number]/edit/page.tsx`**) merges into save payload.  
3. **`lib/api.ts`** `save*LineItems` → **`extractAndFormatBursts`** → **`JSON.stringify(formattedBursts)`** (or raw array for some channels) → POST to Xano media plan endpoints.

Radio additionally sets **`bursts: formattedBursts`** so `extractAndFormatBursts` can read **`lineItem.bursts`** first (**1782–1800** in `lib/api.ts`).

---

*End of audit.*
