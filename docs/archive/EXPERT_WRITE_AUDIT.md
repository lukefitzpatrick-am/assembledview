# Expert mode save path & Stage 2 bursts contract — discovery audit

**Date:** 2026-05-12  
**Mode:** Read-only codebase review (no application code changes).  
**Context:** Stage 1 (`serializeBurstsJson` + `extractAndFormatBursts`) owns Xano-facing `bursts_json` contract (`mediaAmount` / `feeAmount` as formatted money strings, no legacy `fee`). This document traces expert mode relative to that path.

---

## 1. Expert mode overview

### What “expert mode” is

Expert mode is a **weekly Gantt–style editor** opened from a given media container inside a **modal dialog**. Users switch from **Standard** to **Expert**, edit **per-week cells** (quantities, rates, merged spans, etc.) on a grid, then press **Apply** to fold those edits back into the **same react-hook-form `lineItems` / `televisionlineItems` (etc.)** the standard UI uses. Copy in the UI states that Apply “saves them to the **form**” (not directly to the server). Persistence to **Xano** happens later when the user saves the media plan from the MBA edit/create flow.

`lib/mediaplan/expertModeSwitch.ts` holds **merge helpers** (re-attach standard-only fields after expert generation using stable line-item keys), **JSON baselines** for expert rows and standard line items (string snapshots), and related utilities.

`lib/mediaplan/expertChannelMappings.ts` holds the **heavy mapping**: standard line items ↔ expert schedule rows, burst normalization from stored/API shapes, programmatic burst synthesis (`buildBurstsFromProgExpertLikeRow`), and deliverable/budget math aligned with containers.

### UI surfaces that enter expert mode

Nineteen `*ExpertGrid.tsx` components under `components/media-containers/` (e.g. `ProgDisplayExpertGrid.tsx`, `SearchExpertGrid.tsx`, `TelevisionExpertGrid.tsx`, OOH, Radio, BVOD, digital, social, influencers, integration, newspaper, magazines, prog audio/BVOD/video/OOH). Each is paired with a **parent container** that owns the dialog, **Apply** handler, and form.

### Flow (plain English): expert grid → Xano

1. User opens **Expert** from a container → `open*ExpertModal` maps **current form line items** → expert rows (`mapStandard*LineItemsToExpertRows` in `expertChannelMappings.ts`), optionally seeding an empty row.
2. `*ExpertGrid` calls `onRowsChange` on edits → container keeps **`expert*Rows`** in React state.
3. User clicks **Apply** in the dialog footer (`handle*ExpertApply` in the container) → **`map*ExpertRowsToStandardLineItems`** → **`merge*StandardFromExpertWithPrevious`** → **`form.setValue`** on the standard field array. Expert modal closes; **standard** view shows updated bursts.
4. Container `useEffect` / `useWatch` paths push **transformed API-shaped** line items up to the **edit/create page** (`onMediaLineItemsChange` / similar), which holds arrays like `progDisplayMediaLineItems`, `searchMediaLineItems`, `televisionMediaLineItems`.
5. User triggers **Save** on the plan → `handleSaveAll` (e.g. `app/mediaplans/mba/[mba_number]/edit/page.tsx` ~4657+) → `save*LineItems` in `lib/api.ts` → **`extractAndFormatBursts`** → **`serializeBurstsJson`** → `fetch` to Xano endpoints (e.g. `media_plan_prog_display`, `media_plan_search`, `saveTelevisionData`).

There is **no separate Xano client** inside the expert grids; expert mode is a **projection editor** on top of the same form + save pipeline as standard mode.

---

## 2. Save path trace (three representative grids)

**Important:** The `*ExpertGrid.tsx` files have **no save / Apply button** and **no direct API calls**. The persistence trigger for expert edits is the parent’s **Apply** button; the network save is the page-level **Save** action.

### 2.1 Prog Display

| Step | Location | What runs |
|------|----------|-----------|
| Apply click | `components/media-containers/ProgDisplayContainer.tsx` **1871** | `onClick={handleProgDisplayExpertApply}` |
| Handler | **486–521** | `handleProgDisplayExpertApply` → `mapProgDisplayExpertRowsToStandardLineItems` → `mergeProgDisplayStandardFromExpertWithPrevious` → `form.setValue("lineItems", …)` → updates `progdisplayStandardBaselineRef` via `serializeProgDisplayStandardLineItemsBaseline` |
| Grid edits | `ProgDisplayExpertGrid.tsx` | `onRowsChange` → `handleExpertProgDisplayRowsChange` (**422–426**) → `setExpertProgDisplayRows` |
| Push to page | `ProgDisplayContainer.tsx` **604–655** | `useEffect` on `watchedLineItems` → builds `transformedLineItems` with `bursts_json: JSON.stringify(serializeBurstsJson({…}))` → `onMediaLineItemsChange(transformedLineItems)` |
| Page state | `app/mediaplans/mba/[mba_number]/edit/page.tsx` **6376–6379** | `handleProgDisplayMediaLineItemsChange` → `setProgDisplayMediaLineItems` |
| Save | **5148–5152** (same file) | `buildProgDisplayPayload(progDisplayMediaLineItems)` → **`saveProgDisplayLineItems`** |
| API | `lib/api.ts` **3744–3797** | `extractAndFormatBursts(lineItem, …)` per line item → `JSON.stringify(formattedBursts)` → **`fetch(\`${MEDIA_PLANS_BASE_URL}/media_plan_prog_display\`, POST)`** |

**Does save go through `extractAndFormatBursts`?** **Yes.** Even though the container already sets `bursts_json` on the payload object, `saveProgDisplayLineItems` **recomputes** bursts via `extractAndFormatBursts` (which calls `serializeBurstsJson`). Stage 1 contract applies on **write**.

### 2.2 Search

| Step | Location | What runs |
|------|----------|-----------|
| Apply click | `components/media-containers/SearchContainer.tsx` **1951** | `onClick={handleSearchExpertApply}` |
| Handler | **493–525** (approx.; same pattern as Prog Display) | `mapSearchExpertRowsToStandardLineItems` → `mergeSearchStandardFromExpertWithPrevious` → `form.setValue` → `serializeSearchStandardLineItemsBaseline` |
| Grid | `SearchExpertGrid.tsx` | `onRowsChange` → `handleExpertSearchRowsChange` (**429–433**) |
| Push to page | `SearchContainer.tsx` **648–700** | `serializeBurstsJson` in `bursts_json` → `onMediaLineItemsChange` |
| Page | `edit/page.tsx` | `setSearchMediaLineItems` via handler ~**6365** |
| Save | **4994–4997** | **`saveSearchLineItems`** |
| API | `lib/api.ts` **3671–3708** | `extractAndFormatBursts` → **`fetch(\`${MEDIA_PLANS_BASE_URL}/media_plan_search\`, POST)`** |

**Through `extractAndFormatBursts`?** **Yes.**

### 2.3 Television

| Step | Location | What runs |
|------|----------|-----------|
| Apply click | `components/media-containers/TelevisionContainer.tsx` **2262** | `onClick={handleTvExpertApply}` |
| Handler | **624–658** | `mapTvExpertRowsToStandardLineItems` → `mergeTelevisionStandardFromExpertWithPrevious` → `form.setValue("televisionlineItems", …)` → `serializeTelevisionStandardLineItemsBaseline` into `tvStandardBaselineRef` |
| Grid | `TelevisionExpertGrid.tsx` | `onRowsChange` → `handleExpertTvRowsChange` (**561–565**) |
| Push to page | `TelevisionContainer.tsx` **1231–1287** | `useEffect` builds `transformedLineItems` with `bursts_json: JSON.stringify(serializeBurstsJson({…}))` → `onMediaLineItemsChangeRef.current(transformedLineItems)` |
| Page | `edit/page.tsx` **6292–6293** | `handleTelevisionMediaLineItemsChange` → `setTelevisionMediaLineItems` |
| Save | **5016–5019** | **`saveTelevisionLineItems`** |
| API | `lib/api.ts` **1608–1636** | `extractAndFormatBursts` → `bursts_json: formattedBursts` → **`saveTelevisionData`** → `fetch` to `media_plan_television` (see `saveTelevisionData` above in same file) |

**Through `extractAndFormatBursts`?** **Yes.** `extractAndFormatBursts` accepts either `lineItem.bursts` or parses `lineItem.bursts_json` (**1817–1841** in `lib/api.ts`), so the television payload shape is covered.

### Answer to the key question

For these representative channels, **expert edits do not bypass Stage 1.** They land in the **standard form**, then the **same `save*LineItems` + `extractAndFormatBursts` path** used for standard editing. There is **no separate expert-only Xano writer** found in this trace.

---

## 3. `serialize*StandardLineItemsBaseline` in `expertModeSwitch.ts`

All listed functions share the same pattern: **`export function serializeXStandardLineItemsBaseline(items: StandardXFormLineItem[] | undefined): string`**, returning **`JSON.stringify`** of an array of plain objects: line-item scalar fields + **`bursts`** array with **`budget`, `buyAmount`, `startDate`, `endDate`, `calculatedValue`, and `fee`** (and channel extras such as TV **`size`/`tarps`**, etc.). Programmatic variants delegate burst serialization to **`serializeProgStandardBursts`** (**1325–1335**), which also includes **`fee`**.

**Complete list (19):**

1. `serializeOohStandardLineItemsBaseline` — **384–416**  
2. `serializeTelevisionStandardLineItemsBaseline` — **418–454**  
3. `serializeRadioStandardLineItemsBaseline` — **456–492**  
4. `serializeBvodStandardLineItemsBaseline` — **573+**  
5. `serializeDigiVideoStandardLineItemsBaseline` — **634+**  
6. `serializeDigiDisplayStandardLineItemsBaseline` — **702+**  
7. `serializeDigiAudioStandardLineItemsBaseline` — **766+**  
8. `serializeSocialMediaStandardLineItemsBaseline` — **831+**  
9. `serializeSearchStandardLineItemsBaseline` — **890–921**  
10. `serializeInfluencersStandardLineItemsBaseline` — **949+**  
11. `serializeIntegrationStandardLineItemsBaseline` — **1014–1047**  
12. `serializeNewspaperStandardLineItemsBaseline` — **1079+**  
13. `serializeMagazineStandardLineItemsBaseline` — **1142+**  
14. `serializeProgAudioStandardLineItemsBaseline` — **1338–1365**  
15. `serializeProgBvodStandardLineItemsBaseline` — **1379–1403**  
16. `serializeProgDisplayStandardLineItemsBaseline` — **1417–1445**  
17. `serializeProgVideoStandardLineItemsBaseline` — **1459–1486**  
18. `serializeProgOohStandardLineItemsBaseline` — **1501–1531**  

**What they’re compared against:** In the **expert modal “dirty” flow**, containers compare **`serialize*ExpertRowsBaseline(currentRows)`** to a **ref captured when the modal opened** — not the standard baseline.

For **`serialize*StandardLineItemsBaseline`**, the audited containers (**ProgDisplay**, **Search**, **Television**) **only assign** the ref (`useLayoutEffect` after form init, and **again after Apply**). **No read/compare** of `*StandardBaselineRef` was found in those three files (same “write-only ref” pattern for `searchStandardBaselineRef` / `progdisplayStandardBaselineRef` / `tvStandardBaselineRef`).

**Callers (from repo grep):** each corresponding `*Container.tsx` imports one serializer and stores it in a `*StandardBaselineRef` (and updates it after expert apply where implemented). Examples: `OOHContainer`, `RadioContainer`, `BVODContainer`, `Digital*Container`, `SocialMediaContainer`, `SearchContainer`, `IntegrationContainer`, `InfluencersContainer`, `NewspaperContainer`, `MagazinesContainer`, all **Prog*Container** variants, `TelevisionContainer`, `ProgDisplayContainer`.

**Classification vs Stage 1 Xano contract:** These snapshots are **(b) in-memory canonicalization** of the **form model** (which still uses legacy **`fee`** on bursts). They are **not** the same object as Xano `bursts_json` after Stage 1 (which uses **`mediaAmount` / `feeAmount`**). If a future feature string-compares this baseline to a **server JSON** snapshot, that would be **(a)** and would need contract alignment; **today’s expert dirty detection uses expert-row baselines, not this string.**

---

## 4. Expert normalizer call sites (`expertChannelMappings.ts`)

**`normalizeOohBursts`** (**550–579**): Parses **`item.bursts`** or **`bursts_json`** (string or object) into **`StandardMediaBurst[]`**. Preserves legacy **`fee`** only if a number on the parsed object (**576**).

**Delegating `normalize*Bursts`** (all call `normalizeOohBursts` unless noted):  
`normalizeRadioBursts`, `normalizeTelevisionBursts`, `normalizeBvodBursts`, `normalizeDigiVideoBursts`, `normalizeDigiDisplayBursts`, `normalizeDigiAudioBursts`, `normalizeSocialMediaBursts`, `normalizeSearchBursts`, `normalizeInfluencersBursts`, `normalizeIntegrationBursts`, `normalizeNewspaperBursts`, `normalizeMagazineBursts`, `normalizeProgAudioBursts`, `normalizeProgBvodBursts`, `normalizeProgDisplayBursts`, `normalizeProgVideoBursts`, `normalizeProgOohBursts`.

**`buildBurstsFromProgExpertLikeRow`** (**5384–5483**): Builds bursts from expert row + weeks (programmatic-like channels). Used from **`map*ExpertRowsToStandardLineItems`** for prog channels (see **6020**, and parallel sites for prog audio/BVOD/video/OOH).

**Callers (representative):** Each **`mapStandard*LineItemsToExpertRows`** (per channel) invokes the matching **`normalize*Bursts(item)`** on **`form.getValues(...)`** line items when opening expert mode. **Input** is therefore:

- **After load from Xano:** whatever the container mapped from `bursts_json` into **`bursts[]`** (today still often includes legacy **`fee`** and may omit `mediaAmount`/`feeAmount` depending on loader).  
- **After a previous expert Apply:** bursts produced in-memory by **`map*ExpertRowsToStandardLineItems`** / **`buildBurstsFromProgExpertLikeRow`** (**`fee: 0`**, plain budget strings).

**Output use:** Feeds **`progAccumulateWeeklyFromBursts`** (and siblings) to reconstruct **`weeklyValues` / `mergedWeekSpans`** for the expert grid. So normalizers must **tolerate post–Stage 1 stored JSON** (new fields) when users re-open expert after a save — **Stage 2 should extend parsing** to prefer `mediaAmount` / `feeAmount` where relevant, not only `fee`.

---

## 5. `fee: 0` / `fee: undefined` inventory

**`expertModeSwitch.ts`:** **No** matches for `fee: 0` or `fee: undefined`.

**`expertChannelMappings.ts`:** **33** occurrences of **`fee: 0`**. **No** literal **`fee: undefined`** property writes; the only **`undefined`** path is **`fee: typeof b.fee === "number" ? b.fee : undefined`** in **`normalizeOohBursts`** when **reading** parsed JSON.

**Classification (all occurrences fall into these buckets):**

| Category | Meaning |
|----------|---------|
| **Not direct Xano writes** | All are constructing **`Standard*FormLineItem`–style** `bursts[]` held in React form state. Xano writes go through **`save*LineItems` → `extractAndFormatBursts` → `serializeBurstsJson`**. |
| **`empty*LineItem` / default burst templates** | e.g. **610–617** (`emptyOohLineItem`), **5988–6001** (`emptyProgDisplayLineItem`), TV defaults in **`TelevisionContainer`** (**502** — container file, not mappings). **In-memory defaults.** |
| **`buildBurstsFromProgExpertLikeRow`** | **5455–5461** — programmatic expert-derived bursts. **Form state** → later serialized by Stage 1 on save. |
| **Other `map*ExpertRowsToStandardLineItems` burst literals** | Same pattern: **in-memory / form**, re-serialized on save. |

**Reads of `fee`:** **`normalizeOohBursts`** reads **`b.fee`** from parsed stored JSON — **Stage 2 normalizer** concern when stored bursts no longer carry `fee`.

---

## 6. `formatBurstBudget` usage

**Definition:** `lib/mediaplan/expertChannelMappings.ts` **167–171** — rounds to 2 decimals, returns **plain numeric string** (not `formatMoney` / `$`).

**Call sites:** All usages are **within `expertChannelMappings.ts`** on the grep list: burst construction in **`map*ExpertRowsToStandardLineItems`** paths (multiple channels) and **`buildBurstsFromProgExpertLikeRow`** (**5436**, **5456**, etc.) — assigning **`budget`** and **`buyAmount`** strings on **form-bound bursts**.

**Persistence vs display:**

- **Persisted `budget` / `buyAmount` in `bursts_json`:** **`serializeBurstsJson`** passes strings through **`formatStringOrMoney`** (`lib/mediaplan/serializeBurstsJson.ts` **27–30**, **62–64**) — **plain decimal strings from expert remain plain** in the stored JSON, while **`mediaAmount` / `feeAmount`** use **AUD `formatMoney`**. This is a **format consistency** topic (expert-originated bursts vs Stage 1 money fields), not a bypass of Stage 1 math (amounts are still derived via **`parseMoneyInput` + `computeBurstAmounts`** on save).

- **In-memory / UI:** Same strings feed standard grids and totals until save; expert grid totals use **`expertRowFeeSplit`** / billing paths separately from serialized `fee`.

---

## 7. Unused import: `computeBurstAmounts`

**Fresh search in `lib/mediaplan/expertChannelMappings.ts`:** the **only** hit is the **import** at **line 18**. **No call sites** in that file.

**Conclusion:** Confirmed **unused import** — safe **cleanup opportunity**, not a Stage 2 blocker.

---

## 8. Stage 2 scope recommendation

**Recommended scope: (A) MINIMAL**, with explicit follow-ups:

1. **Persistence:** Expert mode **does not** use a separate Xano save path for the traced channels; it **round-trips through standard line items** and **`save*LineItems` → `extractAndFormatBursts`**, so **Stage 1 already governs `bursts_json` on save** for this path. **Not (C).**

2. **Still in scope for Stage 2 (consistency / read path):**  
   - **Normalizers** (`normalizeOohBursts` and downstream): should **read new contract fields** from loaded `bursts_json` when present, and not rely on legacy **`fee`** alone.  
   - **`serialize*StandardLineItemsBaseline`**: remains **form-local (b)**; update **if** you want burst snapshots to reflect new fields or to avoid confusion — **not required for Xano parity** unless something compares them to server JSON.  
   - **`fee: 0` in expert-generated bursts:** **cosmetic / model cleanliness** relative to Xano, since save recomputes contract fields — still worth cleaning for **single source of truth** in the form model.  
   - **`formatBurstBudget`:** optional alignment of **`budget` / `buyAmount`** string formatting with product-wide money display — **secondary** to normalizer correctness.

3. **Why not (B) or (C):** No second persistence pipeline was found for expert. The only “dual” serialization is **container preview `bursts_json`** (e.g. TV **`serializeBurstsJson`** in `useEffect`) **plus** **`extractAndFormatBursts` on save**, both using **`serializeBurstsJson`** — redundant but **not** a competing contract writer.

---

## File reference index (primary)

| Artifact | Role |
|----------|------|
| `components/media-containers/*ExpertGrid.tsx` | Editing UI; `onRowsChange` only |
| `components/media-containers/*Container.tsx` | Expert dialog, **Apply**, form, `serializeBurstsJson` → parent |
| `lib/mediaplan/expertChannelMappings.ts` | Mappings, **`normalize*Bursts`**, **`buildBurstsFromProgExpertLikeRow`**, **`formatBurstBudget`**, **`fee: 0`** |
| `lib/mediaplan/expertModeSwitch.ts` | Merges + **baseline serializers** |
| `lib/api.ts` | **`extractAndFormatBursts`**, **`save*LineItems`**, Xano `fetch` |
| `lib/mediaplan/serializeBurstsJson.ts` | Stage 1 burst JSON contract |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx` | **`handleSaveAll`**, `save*` orchestration |

---

*End of audit.*
