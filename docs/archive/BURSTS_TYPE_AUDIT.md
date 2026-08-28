# Bursts `fee` / `media` type-shape audit (read-only)

**Date:** 2026-05-12  
**Scope:** Risk if `bursts_json[].fee` changes from `number` (today effectively `0`) to a **formatted currency string**, and a new **`media`** formatted string is added. No code was modified except this file.

---

## 1. Reads of `burst.fee` (and similar hydration paths)

### 1.1 Arithmetic on `burst.fee` from persisted bursts

**Result: no HIGH-risk sites found.**  
Repo-wide search for operators applied directly to `burst.fee` (e.g. `burst.fee +`, `+= burst.fee`) found **no matches**.  

Totals that accumulate fee use **`burst.feeAmount`** on **`BillingBurst`** objects built in-memory (e.g. `totalFee += burst.feeAmount`), not the `fee` field inside `bursts_json`.

### 1.2 Expert grid `sumFee += split.fee` (not `bursts_json`)

Files such as `ProgDisplayExpertGrid.tsx`, `SearchExpertGrid.tsx`, `TelevisionExpertGrid.tsx`, etc. contain `sumFee += split.fee` where `split` comes from **`expertRowFeeSplit`** in `lib/mediaplan/expertGridShared.ts`, which returns numeric `{ net, fee }` from **`computeBurstAmounts`**. This is **orthogonal** to the serialized `bursts_json[].fee` field.

### 1.3 Non-SAFE classifications (by file)

**Convention:**  
- **MEDIUM** — type or validation mismatch (e.g. Zod `z.number()`, silent drop of non-number).  
- **LOW** — parsing/formatting path that accepts strings.  
- **SAFE** — passthrough / display with money parsing.

#### `lib/mediaplan/schemas.ts` (indirect, all channels sharing `baseBurstShape`)

- **MEDIUM:** `fee: z.number().optional()` in `baseBurstShape` (`lib/mediaplan/schemas.ts` ~41). Any channel using `progDisplayBurstSchema`, `searchBurstSchema`, `televisionBurstSchema` (extends base), etc. will **reject or coerce** a string `fee` on validation depending on resolver behaviour.

#### `lib/mediaplan/expertChannelMappings.ts`

- **MEDIUM:** `normalizeOohBursts` (and `normalizeRadioBursts`, which delegates to it) sets  
  `fee: typeof b.fee === "number" ? b.fee : undefined` (~576). A string `fee` from JSON becomes **`undefined`**, so Expert OOH/Radio normalisation **drops** the value (no parse fallback).

#### `lib/api.ts`

- **MEDIUM (contract):** `extractAndFormatBursts` sets `fee: burst.fee || 0` (~1832). A formatted non-empty string passes through unchanged; **`0` stays numeric**; empty string becomes `0`. Downstream code that still assumes **number-only** is at risk.

#### Media containers (hydration from `bursts_json` / `bursts` into RHF defaults)

The following patterns appear repeatedly when mapping a loaded burst into form state:

- `fee: burst?.fee ?? 0`, `fee: burst.fee || 0`, `fee: lastBurst?.fee ?? 0`

**MEDIUM** for the same reason as Zod: form types expect **number** today.  
**Representative files (non-exhaustive; same pattern exists across the 19-channel set):**  
`ProgDisplayContainer.tsx`, `SearchContainer.tsx`, `TelevisionContainer.tsx`, `DigitalDisplayContainer.tsx`, `RadioContainer.tsx`, `BVODContainer.tsx`, `DigitalVideoContainer.tsx`, `DigitalAudioContainer.tsx`, `CinemaContainer.tsx`, `NewspaperContainer.tsx`, `MagazinesContainer.tsx`, `OOHContainer.tsx`, `IntegrationContainer.tsx`, `SocialMediaContainer.tsx`, `InfluencersContainer.tsx`, `ProgVideoContainer.tsx`, `ProgAudioContainer.tsx`, `ProgBVODContainer.tsx`, `ProgOOHContainer.tsx`.

#### Display: `formatMoney(item.fee, …)` in burst tables

- **LOW / display-SAFE:** `formatMoney` uses `parseMoneyInput`, which accepts **strings** (`lib/format/money.ts`). UI continues to render if `fee` is a formatted currency string (may **double-format** if the value is already `"$199.00"` — product decision, not a runtime type crash).

#### `lib/mediaplan/expertModeSwitch.ts`

- **SAFE (serialization):** multiple `serialize*StandardLineItemsBaseline` helpers copy `fee: b.fee` into JSON. Strings round-trip as JSON strings without arithmetic.

#### Comparisons

- **MEDIUM (narrow):** only explicit comparison found on a burst-like `fee` is `typeof b.fee === "number"` in `expertChannelMappings.ts` (see above).

---

## 2. Form field type for `burst.fee` (three representatives)

All three channels inherit **`fee: z.number().optional()`** from `baseBurstShape` in `lib/mediaplan/schemas.ts` (`progDisplayBurstSchema`, `searchBurstSchema`, and `televisionBurstSchema` which spreads `baseBurstShape`).

| Container | Zod for `fee` | `defaultValues` for burst `fee` | Coercion on read/write |
|-----------|----------------|-----------------------------------|-------------------------|
| **ProgDisplayContainer** | `z.number().optional()` via `progDisplayBurstSchema` | `fee: 0` on new bursts (~338); resets use `fee: 0` | Load: `fee: burst?.fee ?? 0` / `burst.fee \|\| 0` (~542, ~582, ~648); `fee: lastBurst?.fee ?? 0` (~883) |
| **SearchContainer** | Same via `searchBurstSchema` | `fee: 0` (~365) | Load: `burst?.fee ?? 0`, `burst.fee \|\| 0` (~547, ~609, ~690); `lastBurst?.fee ?? 0` (~931) |
| **TelevisionContainer** | Same via `televisionBurstSchema` (extends base + TV fields) | `fee: 0` (~501) | Load: `burst.fee ?? 0`, `burst?.fee ?? 0`, `burst.fee \|\| 0`, `lastBurst?.fee ?? 0` (~737, ~861, ~1040, ~1278) |

**Explicit coercion:** none dedicated to `fee`; reliance is on Zod + numeric form state.

---

## 3. Existing `media` field / naming collisions

### 3.1 `burst.media` on burst-shaped objects

- **`burst.media`:** **no matches** in `.ts` / `.tsx` under the repo root (burst-level property).

### 3.2 Object literals with `media:` alongside `budget` / `buyAmount` / `calculatedValue`

- **`bursts_json` serialization** (e.g. `JSON.stringify(lineItem.bursts.map(burst => ({ budget, buyAmount, calculatedValue, fee … })))`) does **not** currently include a **`media`** key on each burst object (verified patterns in e.g. `DigitalDisplayContainer.tsx` ~744–751, `SearchContainer.tsx` ~684–691, `TelevisionContainer.tsx` ~1270–1278).

### 3.3 Line-item totals vs burst payload

Many containers build **line-level** summary objects with **`media: lineMedia`** and **`fee: lineFee`** (numeric aggregates), e.g. `ProgDisplayContainer.tsx` ~694–700. That is **not** inside `bursts_json`; it is a **different object shape** (totals for UI / parent callbacks). Adding **`media`** inside each burst could still **confuse humans** reading raw JSON (two different “media” concepts: line aggregate vs burst field) unless names are distinct (see 3.4).

### 3.4 `BillingBurst` and `StandardMediaBurst` naming

| Type | Location | Relevant fields |
|------|----------|-----------------|
| **BillingBurst** | `lib/billing/types.ts` | **`mediaAmount`**, **`feeAmount`**, optional **`deliveryMediaAmount`** — all **numbers**. No `fee` or `media` string fields. |
| **StandardMediaBurst** | `lib/mediaplan/expertChannelMappings.ts` ~45–52 | **`budget`**, **`buyAmount`**, **`calculatedValue`**, **`fee?: number`**. No `media` property. |

**Recommendation from audit:** mirroring **`mediaAmount` / `feeAmount`** (or prefixed serialized names like `mediaAmountFormatted`) avoids collision with line-level **`media`** summaries and matches billing vocabulary. If the product contract insists on `media` + `fee` as strings, treat **line totals `media`** vs **`bursts_json[].media`** as a documentation and code-review hotspot.

### 3.5 Other `media` keys in burst-related code

- **`lib/pacing/syncSearchContainersToPacing.ts`** ~67–68: when summing “budget” from parsed bursts, it considers `b.media_amount` among aliases — **not** `b.media`. A new **`media`** string field would **not** be picked up by that sum unless the code is updated (today: **no collision**).

---

## 4. Helpers that compute fee / media dollars

### 4.1 `computeBurstAmounts`

| | |
|--|--|
| **Path** | `lib/mediaplan/burstAmounts.ts` |
| **Signature** | `computeBurstAmounts({ rawBudget, budgetIncludesFees, clientPaysForMedia, feePct })` → `{ mediaAmount, deliveryMediaAmount, feeAmount, totalAmount }` |
| **Return types** | All **numbers**. |
| **`budget_includes_fees`** | **Yes** — implemented explicitly in branches (see file header comments ~44–66). |
| **Callers today** | **Containers:** `DigitalDisplay`, `Television`, `Search`, `Radio`, `OOH`, `Cinema`, `Newspaper`, `Magazines`, `BVOD`, `DigitalVideo`, `DigitalAudio`, `Integration`, `Influencers`, `SocialMedia`, `ProgDisplay`, `ProgVideo`, `ProgBVOD`, `ProgAudio`, `ProgOOH` (each uses it inside `get<Channel>Bursts` or equivalent burst→`BillingBurst` mapping). **Shared:** `lib/mediaplan/expertGridShared.ts` **`expertRowFeeSplit`**. **Expert import:** `lib/mediaplan/expertChannelMappings.ts`. |

This is the **single primitive** that already matches the three-way fee rules; the new serializer should **delegate dollar math here** (then format for JSON), not re-derive formulas.

### 4.2 `getProgDisplayBursts`

| | |
|--|--|
| **Path** | `components/media-containers/ProgDisplayContainer.tsx` ~154–191 |
| **Input** | `UseFormReturn<ProgDisplayFormValues>`, `feeprogdisplay: number` |
| **Output** | `BillingBurst[]` with numeric **`mediaAmount`**, **`feeAmount`**, etc. |
| **Uses `computeBurstAmounts`** | **Yes** (~166–171). |
| **Call sites** | **Only** inside `ProgDisplayContainer.tsx` (~959, ~999). |

### 4.3 Inline `const getBursts = () => { … }` (local closure, not exported)

| Location | Role | vs `computeBurstAmounts` |
|----------|------|---------------------------|
| `ProgDisplayContainer.tsx` ~1027–1071 | Builds **`BillingBurst[]`** for local `getBursts` / debounced effects | **Diverges in the “standard” branch:** uses `feeAmount = (budget * fee) / 100` (~1052) instead of **`(budget * pct) / (100 - pct)`** from `computeBurstAmounts`. The exported **`getProgDisplayBursts`** above is correct. |
| `SearchContainer.tsx` ~1114–1163 | Same pattern for Search | “Standard” branch uses **gross-up** `feeAmount = (budget * feesearch) / (100 - feesearch)` (~1143) — **aligned** with `computeBurstAmounts` for that branch. |
| `TelevisionContainer.tsx` ~1319–1345 | Same pattern for TV | **Same bug as Prog Display inline:** `feeAmount = (budget * feetelevision) / 100` (~1344) in the else branch instead of gross-up. |

**Implication:** the **authoritative** dollar math for Prog Display billing bursts is **`getProgDisplayBursts` → `computeBurstAmounts`**, not the inner `getBursts` duplicate. Any serializer should **not** copy the inline `getBursts` fee branch for Prog Display / TV without reconciling this first.

---

## 5. `extractAndFormatBursts` coverage (`lib/api.ts`)

| `save*LineItems` | Uses `extractAndFormatBursts`? |
|------------------|-------------------------------|
| `saveTelevisionLineItems` | **YES** (~1612) |
| `saveNewspaperLineItems` | **YES** (~1674) |
| `saveSocialMediaLineItems` | **YES** (~1850) |
| `saveProductionLineItems` | **NO** — uses **local `normalizeBursts`** + `JSON.parse` only for production-shaped payloads (~2806–2837); different burst schema (`cost` / `amount` / dates). |
| `saveRadioLineItems` | **YES** (~3103) |
| `saveMagazinesLineItems` | **YES** (~3169) |
| `saveOOHLineItems` | **YES** (~3224) |
| `saveCinemaLineItems` | **YES** (~3280) |
| `saveDigitalDisplayLineItems` | **YES** (~3335) |
| `saveDigitalAudioLineItems` | **YES** (~3390) |
| `saveDigitalVideoLineItems` | **YES** (~3445) |
| `saveBVODLineItems` | **YES** (~3502) |
| `saveIntegrationLineItems` | **YES** (~3564) |
| `saveSearchLineItems` | **YES** (~3624) |
| `saveProgDisplayLineItems` | **YES** (~3697) |
| `saveProgVideoLineItems` | **YES** (~3753) |
| `saveProgBVODLineItems` | **YES** (~3814) |
| `saveProgAudioLineItems` | **YES** (~3870) |
| `saveProgOOHLineItems` | **YES** (~3925) |
| `saveInfluencersLineItems` | **YES** (~3981) |

**Chokepoint gap:** **`saveProductionLineItems`** is the only bulk save in this list that **bypasses** `extractAndFormatBursts` (by design).

**Note:** Containers often **`JSON.stringify`** bursts before the API layer; `extractAndFormatBursts` still re-normalises from `lineItem.bursts` or `bursts_json` on save. Any container or path that **never** hits these `save*` functions would bypass the chokepoint (out of scope unless identified per flow).

---

## 6. `JSON.parse` read sites for `bursts_json` (and burst strings)

For each site: **what happens after parse** (focus on risk if `fee` / new `media` are strings).

| Location | After parse |
|----------|-------------|
| **`lib/api.ts`** `extractAndFormatBursts` (~1792–1796) | Maps bursts; copies **`fee`** to output object (~1832). |
| **`lib/api.ts`** `saveProductionLineItems` `normalizeBursts` (~2815) | Production-specific shape; **ignores** media-plan `fee`. |
| **`lib/mediaplan/deriveBursts.ts`** `parseBurstArray` (~36–39) | Returns raw array for normalisers; **`fee` not read** in `normaliseBurst` (uses budget-like fields for spend). |
| **`lib/mediaplan/normalizeCampaignLineItems.ts`** | Uses `parseBurstArray` on `bursts_json` / `bursts` (~60). |
| **`lib/mediaplan/expertChannelMappings.ts`** (e.g. `normalizeOohBursts` ~553–556) | Parses string `bursts_json`; reads **`fee`** only if `typeof === "number"` (~576). |
| **`lib/billing/generateBillingLineItems.ts`** (~33–40) | Parses bursts; monthly distribution from **budget / buyAmount / flags**; **does not use `burst.fee`**. |
| **`lib/utils/mediaPlanValidation.ts`** (~78–85) | Parses for validation logic on dates / structure (see file). |
| **`lib/finance/utils.ts`** `calculateMonthlyAmountFromBursts` (~248–298) | Parses generic `bursts` string; amounts from **budget / cost / spend** aliases; **strip-currency parsing** for string amounts; **does not reference `fee`**. |
| **`lib/xano/fetchAllLineItems.ts`** `parseBurstsJson` (~28–34) | Parses for Snowflake snapshot payload; **opaque** array stored / stringified in `syncXanoLineItems.ts`. |
| **`lib/snowflake/syncXanoLineItems.ts`** (~112–115) | `JSON.stringify(item.bursts_json)` into **`PARSE_JSON`** — string `fee` / `media` are **valid JSON**; consumers in Snowflake/SQL may assume numeric types (**downstream risk**). |
| **`lib/pacing/plan/normalisePlan.ts`** `parseBursts` (~65–78) | Builds **`PlannedBurst`** with **`budgetNumber`** via `parseNumber` (~80+); **fee field unused** in type. |
| **`lib/pacing/syncSearchContainersToPacing.ts`** `parseBurstsRecords` (~45–55) | Sums date span / budget aliases; **`num()`** on raw values — formatted **`media`** string would not match current keys unless extended. |
| **`lib/delivery/social/socialChannelCompute.ts`** `parseBursts` (~292–304) | Normalises to numeric budget / deliverables; **no `fee` field** on normalised burst. |
| **`lib/delivery/programmatic/programmaticCompute.ts`** `parseBursts` (~175–188) | Same idea as social; **parseCurrency** on budget / deliverables; **no `fee`**. |
| **`components/dashboard/delivery/programmatic/ProgrammaticDeliveryContainer.tsx`** (~211–224) | Duplicate of programmatic parse pattern. |
| **`components/dashboard/delivery/social/SocialDeliveryContainer.tsx`** | Same pattern as `socialChannelCompute` (parse → normalise). |
| **`app/mediaplans/mba/[mba_number]/edit/page.tsx`** (~265, ~3840, ~4266) | Clone source bursts; billing schedule generation walks bursts (budget / flags); **4266** only uses `.length`. |
| **`app/mediaplans/create/page.tsx`** (~3574) | Clone / default line items from source `bursts_json`. |
| **`lib/delivery/search/searchCore.ts`** | Uses **`normalizeBursts`** on row data (not always `JSON.parse` in-file — depends on helper). |
| **API routes:** `app/api/media_plans/integration/route.ts` (~43), `app/api/media_plans/influencers/route.ts` (~43) | `JSON.parse(data.bursts_json)` — server persistence helpers; return **parsed** structures to caller. |
| **Media containers** (many files) | Inline `typeof x === 'string' ? JSON.parse(x) : x` then **`.map` into form** including **`fee: burst.fee …`** (see section 1). |
| **`components/media-containers/ProductionContainer.tsx`** (~365) | Parses **`bursts_json`** for production cost/amount semantics. |
| **`components/media-containers/ProgVideoContainer.tsx`** (~628) | Parses `bursts_json` when hydrating line items. |

**Summary risk:** Most **delivery / pacing / finance** parsers **ignore** `bursts_json.fee` today. The **primary break** from string `fee` is **form validation (`z.number`)** and **Expert normalisation** (`typeof === "number"`). **Snowflake / external analytics** are the main **unknown** if they cast JSON fields to numbers.

---

## 7. References (code anchors)

```35:42:lib/mediaplan/schemas.ts
const baseBurstShape = {
  budget: z.string().min(1, "Budget is required"),
  buyAmount: z.string().min(1, "Buy Amount is required"),
  startDate: z.date(),
  endDate: z.date(),
  calculatedValue: z.number().optional(),
  fee: z.number().optional(),
} as const
```

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

```565:577:lib/mediaplan/expertChannelMappings.ts
    out.push({
      budget: String(b.budget ?? ""),
      buyAmount: String(b.buyAmount ?? b.buy_amount ?? ""),
      startDate: sd,
      endDate: ed,
      calculatedValue:
        typeof b.calculatedValue === "number"
          ? b.calculatedValue
          : typeof b.calculated_value === "number"
            ? b.calculated_value
            : undefined,
      fee: typeof b.fee === "number" ? b.fee : undefined,
    })
```

```72:109:lib/mediaplan/burstAmounts.ts
export function computeBurstAmounts({
  rawBudget,
  budgetIncludesFees,
  clientPaysForMedia,
  feePct,
}: ComputeBurstAmountsInput): ComputeBurstAmountsOutput {
  const budget = Number.isFinite(rawBudget) ? rawBudget : 0
  const pct = Number.isFinite(feePct) ? feePct : 0

  if (budgetIncludesFees) {
    const feeAmount = budget * (pct / 100)
    const netMedia = budget * ((100 - pct) / 100)
    const mediaAmount = clientPaysForMedia ? 0 : netMedia
    return {
      mediaAmount,
      deliveryMediaAmount: netMedia,
      feeAmount,
      totalAmount: mediaAmount + feeAmount,
    }
  }
  // ... clientPaysForMedia + standard branches ...
}
```

---

## 8. Conclusion (contract decision support)

1. **No arithmetic** today on **`burst.fee`** from JSON; risk is **typing / validation / expert normalisation / downstream JSON consumers**, not `+=` on fee.  
2. **Zod** and **`typeof b.fee === "number"`** are the tightest gates for a string contract.  
3. **`computeBurstAmounts`** is the correct **numeric** source before formatting for `bursts_json`.  
4. Naming: **`mediaAmount` / `feeAmount`** already exist on **`BillingBurst`**; adding literal **`media`** on bursts overlaps conceptually with **line-level `media:` totals** in containers — prefer **disambiguated** names for the serialized contract if possible.  
5. **`saveProductionLineItems`** will **not** pick up changes confined to `extractAndFormatBursts` alone.
