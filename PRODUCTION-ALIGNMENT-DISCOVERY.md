# Production Container Alignment Discovery

**Branch:** `localhost` (confirmed at investigation start)  
**Date:** 2026-05-31  
**Scope:** Read-only inventory. No source changes.  
**Target file:** `components/media-containers/ProductionContainer.tsx`

---

## Prerequisites

| Check | Result |
|-------|--------|
| Current branch | `localhost` |
| ProductionContainer | `components/media-containers/ProductionContainer.tsx` |
| RadioContainer | `components/media-containers/RadioContainer.tsx` |
| DigitalDisplayContainer | `components/media-containers/DigitalDisplayContainer.tsx` |
| `@/lib/mediaplan/schemas` | `lib/mediaplan/schemas.ts` |
| `@/lib/mediaplan/serializeBurstsJson` | `lib/mediaplan/serializeBurstsJson.ts` |
| `@/lib/mediaplan/lineItemIds` | `lib/mediaplan/lineItemIds.ts` |
| `@/lib/billing/types` | `lib/billing/types.ts` |

### All `*Container.tsx` under `components/` (24 files)

**Media plan containers (`components/media-containers/`, 19):**

- `BVODContainer.tsx`
- `CinemaContainer.tsx`
- `DigitalAudioContainer.tsx`
- `DigitalDisplayContainer.tsx`
- `DigitalVideoContainer.tsx`
- `InfluencersContainer.tsx`
- `IntegrationContainer.tsx`
- `MagazinesContainer.tsx`
- `NewspaperContainer.tsx`
- `OOHContainer.tsx`
- `ProductionContainer.tsx`
- `ProgAudioContainer.tsx`
- `ProgBVODContainer.tsx`
- `ProgDisplayContainer.tsx`
- `ProgOOHContainer.tsx`
- `ProgVideoContainer.tsx`
- `RadioContainer.tsx`
- `SearchContainer.tsx`
- `SocialMediaContainer.tsx`
- `TelevisionContainer.tsx`

**Delivery/dashboard containers (out of scope for canonical pattern):**

- `components/dashboard/delivery/DeliveryContainer.tsx`
- `components/dashboard/delivery/programmatic/ProgrammaticDeliveryContainer.tsx`
- `components/dashboard/delivery/search/SearchDeliveryContainer.tsx`
- `components/dashboard/delivery/social/SocialDeliveryContainer.tsx`

**Doc location:** Repo root, alongside `AUDIT.md` and `AUDIT-DOMAIN-4.md`. No dedicated docs folder convention for audit/discovery docs.

---

## 1. Summary

- Production has **intentionally diverged** from the shared media container pattern. `lib/mediaplan/schemas.ts` explicitly excludes it (lines 19–22) because burst and line-item shapes are domain-specific (`cost` × `amount`, not `budget`/`buyAmount` + fees).
- Structural drift is **moderate, not total**: Production already shares burst layout, timeline, date pickers, accents, and billing/export callbacks. Gaps are mainly schema centralisation, hydration robustness, burst grid columns, publisher UX, and save serialisation shape.
- **Main risk:** `apiLineItems` emits placeholder version fields (`media_plan_version: 0`, `mp_plannumber: ""`) at lines 427–430. Parent save fills these at persist time, but any consumer reading `productionMediaLineItems` before save sees empty version metadata.
- **Main risk:** Hydration uses a one-shot `hasHydratedRef` (lines 352–358). It will not re-hydrate if `initialLineItems` changes after first load (e.g. async refetch). Radio uses dedupe + change-key guards (lines 678–735).
- **Main risk:** Xano production fetch is MBA-wide; version filtering is client-side only (`app/api/media_plans/production/route.ts` lines 40–44). Known deferred Domain 4 issue.
- Production is the **only non-fee-bearing** media surface. No other container matches that business model. **Cinema** is the closest structural reference (no expert mode) but is still fee-bearing.

---

## 2. Canonical Pattern (19 media containers)

Derived from all containers under `components/media-containers/`, using Radio and Digital Display as primary exemplars.

| Dimension | Canonical pattern |
|-----------|-------------------|
| **Schema import** | `@/lib/mediaplan/schemas` — channel-specific `*FormSchema` + types (18/19 containers). Production is the sole exception with inline Zod (ProductionContainer lines 55–73; schemas.ts lines 19–22). |
| **Field-array name** | Media-type-prefixed for legacy AV/print/digital channels: e.g. `radiolineItems` (RadioContainer line 423), `digidisplaylineItems` (DigitalDisplayContainer line 527), `televisionlineItems`, `cinemalineItems`, `bvodlineItems`. Prog/search/social/integration/influencers/OOH use generic `lineItems`. Production uses generic `lineItems` (line 318), not `productionlineItems`. |
| **ID code source** | `MEDIA_TYPE_ID_CODES` from `@/lib/mediaplan/lineItemIds` (lineItemIds.ts lines 16–36). Used via `buildLineItemId(mbaNumber, MEDIA_TYPE_ID_CODES.<key>, lineNumber)`. Production uses literal `"PROD"` (ProductionContainer lines 218, 402, 437). `"PROD"` is **not** in `MEDIA_TYPE_ID_CODES`. |
| **Burst serializer** | `serializeBurstsJson` from `@/lib/mediaplan/serializeBurstsJson` (RadioContainer lines 888–893; DigitalDisplayContainer lines 845–850). Output: `budget`, `buyAmount`, `calculatedValue`, `mediaAmount`, `feeAmount` as strings/numbers. Production hand-rolls `{ cost, amount, startDate, endDate }` in `apiLineItems` (lines 438–443). |
| **Burst data model** | Form: `budget` + `buyAmount` as **strings**, `calculatedValue` optional number (schemas.ts lines 35–44). Billing: `computeBurstAmounts` → `mediaAmount`, `feeAmount`, `deliveryMediaAmount` (RadioContainer lines 164–169). Production: `cost` × `amount` as **numbers** (lines 55–60, 146, 415–417). |
| **Fee handling** | Per-channel fee prop (e.g. `feeradio`), `computeBurstAmounts`, fee columns in grid. All 18 other containers are fee-bearing. Production hardcodes `feeAmount: 0`, `feePercentage: 0` (lines 151–154, 450). |
| **Hydration** | Parse `bursts_json` / `bursts`, map to form shape, `form.reset`. Radio adds: dedupe by `line_item_id`, change-key via `lastProcessedLineItemsRef`, skip if unchanged (lines 678–735). Digital Display adds: expert-modal guard, `sortLineItemsByLineItemNumber` (lines 718–723). Production: one-shot `hasHydratedRef` only (lines 352–358). Cinema: simple map, no dedupe key (CinemaContainer lines 545–594). |
| **Expert mode** | Present in 17/19 containers (ExpertGrid + expertModeSwitch). **Absent:** Production, Cinema. |
| **Publisher/site source** | API-backed: `getPublishersFor*`, `getClientInfo`, Combobox + add dialog (RadioContainer lines 30, 280–281; DigitalDisplayContainer lines 23). Production: free-text `Input` for publisher (lines 711–722). Production type uses static `mediaTypes` prop as Combobox options (lines 647–707), not an API publisher list. |
| **Save/persist path** | Container `useEffect` builds snake_case API payload with `bursts_json: JSON.stringify(serializeBurstsJson(...))`, placeholders `media_plan_version: 0`, `mp_plannumber: ""` filled by parent save (RadioContainer lines 895–921; DigitalDisplayContainer lines 827–853). Parent calls `save*LineItems(versionId, mbaNumber, clientName, nextVersion.toString(), mediaLineItems)`. |
| **Export path** | Separate `onLineItemsChange` → `LineItem[]` for workbook/export (RadioContainer lines 1291–1335). Production: `mapLineItemsForExport` (lines 208–236). |
| **Toast / client info** | `useToast` + `getClientInfo` on 18/19 containers. Production uses neither. |
| **Line item reorder helpers** | `sortLineItemsByLineItemNumber` + channel-specific reassign (DigitalDisplayContainer lines 29–31, 653; OOHContainer lines 35, 77). Production has none. |
| **Burst grid** | `MP_BURST_GRID_7` with Budget, Buy Amount, dates, calculated/deliverables column, Media, Fee (RadioContainer line 51; DigitalDisplayContainer line 50). Production uses `MP_BURST_GRID_5`: Cost, Quantity, dates, Production Total (lines 36, 768–778). |

### Closest reference for Production

| Candidate | Fit |
|-----------|-----|
| **Cinema** | No expert mode (like Production). Still fee-bearing, uses shared schemas, API publishers, `MP_BURST_GRID_7`. Best **UI/structure** reference, not business model. |
| **Integration** | Similar “service” feel but full fee grid, expert mode, shared burst model. |
| **Production** | Unique: only non-fee-bearing surface; cost × quantity economics; separate Xano table. **No canonical peer for business model.** |

---

## 3. Divergence Matrix

| Dimension | Production | Canonical | Refs | Classification |
|-----------|------------|-----------|------|----------------|
| Schema location | Inline Zod in component | `@/lib/mediaplan/schemas` | Prod 55–73; schemas 19–22 | **PRESERVE** burst/line-item shape; optional **ALIGN** file location with documented exclusion |
| Form field-array name | `lineItems` | `<channel>lineItems` (majority) or generic `lineItems` (prog subset) | Prod 318; Radio 423 | **DECISION** — rename to `productionlineItems` for consistency? |
| Burst data model | `cost` × `amount` (numbers) | `budget` + `buyAmount` (strings) + `calculatedValue` + fee splits | Prod 55–60, 146; schemas 35–44 | **PRESERVE** |
| Fee handling | Always zero fee | Per-channel fee via `computeBurstAmounts` | Prod 141–162, 450; Radio 164–169 | **PRESERVE** |
| Line item ID code | Literal `"PROD"` | `MEDIA_TYPE_ID_CODES.<key>` | Prod 218; lineItemIds 16–36 | **DECISION** — add `production: "PROD"` to map? |
| Save/serialize path | Hand-rolled `apiLineItems` with `bursts: [{ cost, amount, ... }]` | `serializeBurstsJson` → `bursts_json` string | Prod 425–446; Radio 888–918 | **PRESERVE** burst shape; **ALIGN** metadata/placeholder conventions |
| Hydration | One-shot `hasHydratedRef` | Dedupe + change-key (Radio) or re-run on `initialLineItems` (Cinema) | Prod 352–412; Radio 678–735 | **ALIGN** |
| Input components | `MoneyInput` + `NumericInput` for cost/quantity | String `budget`/`buyAmount` parsed via `parseMoneyInput` | Prod 809–837; Radio burst fields | **PRESERVE** (matches cost×qty model) |
| Burst grid | `MP_BURST_GRID_5` (5 cols) | `MP_BURST_GRID_7` (7 cols incl. fee/media) | Prod 768–778; Radio ~51 | **PRESERVE** column set; already uses shared layout tokens |
| Expert mode | Absent | Present in 17/19 | Prod (none); Radio 66–78, 2299 | **PRESERVE** |
| Publisher/site | Free-text `Input` | API Combobox + create dialog | Prod 711–722; Radio 30, publishers fetch | **DECISION** — production may not have publisher API |
| Line item reorder helpers | Absent | DD/OOH: `sortLineItemsByLineItemNumber`, reassign helpers | Prod (none); DD 29–31, 653 | **DECISION** — low priority unless ordering bugs appear |
| Toast / client info | Absent | `useToast`, `getClientInfo` on 18/19 | Prod (none); Cinema 18–19, 294 | **ALIGN** only if publisher API added |
| Fee prop wiring | `feesearch?: number` declared, **never used** in component | Channel-specific fee prop used in calculations | Prod 110, 240; parent passes `feeProduction` edit 8888 | **DECISION** — remove dead prop or document intentional ignore |
| `onMediaLineItemsChange` optional | Optional (`?`) | Required on Radio/DigiDisplay | Prod 115; Radio 143 | **ALIGN** — make required if all parents always pass it |

---

## 4. Data Contract Findings

### 4.1 Parent rendering and wiring

| Surface | Path | Production wiring | Radio wiring (comparison) |
|---------|------|-------------------|----------------------------|
| Create | `app/mediaplans/create/page.tsx` | Lazy import line 304; medium def line 1120; render lines 6866–6881 | Same pattern; `initialLineItems` not passed on create |
| Edit | `app/mediaplans/mba/[mba_number]/edit/page.tsx` | Lazy import line 1230; medium def line 1257; render lines 8884–8900 | Radio gets `initialLineItems={radioLineItems}`; Production gets `initialLineItems={productionLineItems}` line 8899 |

**Production props (edit page lines 8886–8899):**

- `clientId`, `feesearch={feeProduction || 0}`, `onTotalMediaChange`, `onBurstsChange`, `onInvestmentChange`, `onLineItemsChange`, `onMediaLineItemsChange`
- `campaignStartDate`, `campaignEndDate`, `campaignBudget`, `campaignId={mbaNumber}`
- `mediaTypes={mediaTypes.map(...)}` — client production type labels
- `initialLineItems={productionLineItems}` — loaded via `getProductionLineItemsByMBA` (edit page line 3121)

**State in parent (edit page):**

- `productionLineItems` — raw Xano rows for hydration (line 1835)
- `productionMediaLineItems` — live container output for save (line 1836)
- `productionItems` — export `LineItem[]` (via `handleProductionItemsChange`, line 6648)
- `productionBursts` — billing bursts (via `handleProductionBurstsChange`, line 3396)

### 4.2 Callback trace

#### `onBurstsChange` → Billing

1. ProductionContainer builds `BillingBurst[]` via `buildBillingBursts` (lines 141–162): `mediaType: "production"`, `buyType: "production"`, `mediaAmount = cost × amount`, `feeAmount: 0`.
2. Parent: `handleProductionBurstsChange` → `setProductionBursts` (create 3125–3133; edit 3396–3397).
3. Fed into billing schedule as `burstsByMediaType.production` (create 1214; edit 2444).
4. `lib/billing/computeSchedule.ts` lines 135–137, 170: production bursts increment `productionTotal` and `mediaCosts.production`, **not** `totalMedia`.
5. Manual billing spreadsheet **excludes** production from line-item accordion (`useManualBillingSpreadsheetCallbacks.ts` lines 116–117). Production appears only in month-level `production` column (`lib/billing/types.ts` lines 53–55).

**Expected shape:** `BillingBurst` from `@/lib/billing/types` (lines 1–19). Production omits `deliveryMediaAmount`; billing falls back to `mediaAmount` (computeSchedule line 130).

#### `onLineItemsChange` → Media plan export

1. `mapLineItemsForExport` (ProductionContainer lines 208–236) → `LineItem[]`.
2. Key fields: `platform: "production"` (hardcoded), `network: publisher`, `creative: description`, `deliverables: amount`, `deliverablesAmount: cost as string`, `grossMedia: cost×amount`, `buyType: "production"`.
3. Parent: `handleProductionItemsChange` → `setProductionItems` (create 2122–2124; edit 6648–6651).
4. Export: `assignLineItemIds(validProductionLineItems, "PROD")` (create page line 2605) → `generateMediaPlan` workbook.

**Note:** Production subcategory (`mediaType` / `media_type` e.g. "Print") is **not** in export `LineItem.platform`; comment at lines 196–203 confirms internal-only.

#### `onMediaLineItemsChange` → Save / Xano persist

1. `apiLineItems` useMemo (ProductionContainer lines 425–446).
2. Parent: `handleProductionMediaLineItemsChange` → `setProductionMediaLineItems` (create 2117–2119; edit 6642–6645).
3. Save: `saveProductionLineItems(versionId, mbaNumber, clientName, nextVersion.toString(), productionMediaLineItems)` (edit 5424; create 4967).

### 4.3 Save serializer and Xano contract

| Item | Detail |
|------|--------|
| **Function** | `saveProductionLineItems` — `lib/api.ts` lines 2890–2997 |
| **Endpoint (browser)** | `POST /api/media_plans/production` → proxies to Xano `media_plan_production` (route.ts lines 85–99) |
| **Endpoint (server)** | `${MEDIA_PLANS_BASE_URL}/media_plan_production` (api.ts line 2980) |
| **Target table** | `media_plan_production` (api.ts line 195 comment; route.ts line 59) |
| **Type** | `ProductionLineItem` — api.ts lines 196–212 |

**Payload built at save time (`saveProductionLineItems`):**

- `media_plan_version: mediaPlanVersionId` (line 2963)
- `version_number: coerceNumber(planNumber) \|\| mediaPlanVersionId` (line 2964)
- `mp_plannumber: planNumber` (line 2967)
- `mba_number`, `mp_client_name`, `media_type`, `publisher`, `description`, `market`, `line_item_id`, `line_item`
- `bursts` and `bursts_json`: normalised `{ cost, amount, startDate, endDate, description?, market? }` (lines 2933–2940, 2973–2974)

**Container `apiLineItems` vs save normaliser:**

| Field | Container emits | Save expects | Match? |
|-------|-----------------|--------------|--------|
| `bursts` | `[{ cost, amount, startDate, endDate }]` | Same via `normalizeBursts` | Yes |
| `bursts_json` | Not emitted | Built from normalised bursts | OK — save adds it |
| `media_type` | From form `mediaType` | `pickField(['media_type','mediaType'])` | Yes |
| `media_plan_version` | `0` | Overwritten with `versionId` | OK at save |
| `mp_plannumber` | `""` | Overwritten with `planNumber` | OK at save |
| Burst shape in JSON | cost/amount | cost/amount (not budget/buyAmount) | Yes — production-specific |

**Version identifier:**

- Authoritative at save: `mp_plannumber` set to `nextVersion.toString()` (edit 5424).
- Container placeholders: `media_plan_version: 0`, `mp_plannumber: ""` (ProductionContainer lines 427–430). Same placeholder pattern as Radio (RadioContainer lines 896–899).
- **GET caveat:** Xano filters production by `mba_number` only; version params sent for forward-compat but ignored server-side (route.ts lines 40–44). Client filters via `filterLineItemsByPlanNumber` (route.ts line 68).

### 4.4 Billing integration map

```
ProductionContainer
  ├─ onBurstsChange → productionBursts → computeSchedule (productionTotal)
  ├─ onLineItemsChange → productionItems → generateMediaPlan export
  ├─ onMediaLineItemsChange → productionMediaLineItems → saveProductionLineItems → Xano
  └─ onTotalMediaChange → productionTotal / productionFeeTotal (fee always 0)
```

Production is included in billing month totals but excluded from manual billing line-item drill-down (spreadsheet callbacks filter, line 117).

---

## 5. Intentional Differences to Preserve

Confirmed in code:

| Rule | Evidence |
|------|----------|
| No agency fee on production | `buildBillingBursts` lines 151–154; totals effect line 450 passes `0` fee; UI copy line 549 |
| Platform forced to `"production"` for export | `mapLineItemsForExport` line 222; comment lines 196–206 |
| Production subcategory internal-only | Stored in `apiLineItems.media_type` / form `mediaType`; not exported as `platform` (lines 196–203, 431) |
| Cost × quantity economics | Burst schema lines 55–60; grid columns Cost/Quantity (lines 772–773) |
| Separate Xano table | `media_plan_production`, not shared media line item tables |
| Production billing bucket | Separate `production` / `productionTotal` in schedule, not mixed into media totals (computeSchedule 135–137) |
| No expert mode | No ExpertGrid import or modal |
| `serializeBurstsJson` incompatible | Requires budget/buyAmount/fee pipeline (serializeBurstsJson.ts lines 47–71) |

Additional domain-correct items:

- `buyType: "production"` on billing bursts (line 159)
- `clientPaysForMedia: false`, `budgetIncludesFees: false`, `noAdserving: false` hardcoded (lines 155–157)
- Production type dropdown sourced from client `mediaTypes` labels, not channel publisher APIs (parent passes mapped labels, edit 8898)
- `mp_production` flag independent of `mp_fixedfee` (api.ts comment lines 570–576)

**Do not align away:** burst cost×amount model, zero fees, export platform lock, separate persist table, 5-column grid, absence of expert mode.

---

## 6. Already Aligned

Production already uses these shared utilities correctly:

| Utility | Usage |
|---------|--------|
| `burstSectionLayout` | `MP_BURST_*` tokens (ProductionContainer lines 32–44, 761–786) |
| `mediaTypeAccents` | `getMediaTypeThemeHex`, stripe, badge, accent text (lines 46–50, 531, 542, 579) |
| `MediaContainerTimelineCollapsible` | Lines 551–556 |
| `SingleDatePicker` | Burst date fields with `calendarContext="media-burst"` (lines 851–887) |
| `date-picker-anchor` | `defaultMediaBurstStartDate`, `defaultMediaBurstEndDate`, `hasCampaignDateWindow` (lines 26–30, 257–265) |
| `formatBurstLabel` | Burst row headings (lines 796–798) |
| `buildLineItemId` | ID generation with `"PROD"` code (lines 51, 218, 402, 437) |
| `useMediaPlanContext` | `mbaNumber` for IDs (lines 23, 253) |
| `BillingBurst` type | Import and shape compliance (lines 20, 141–162) |
| `LineItem` type | Export mapping (lines 22, 211) |
| `formatCurrencyFull` / `formatMoney` | Summary and read-only total (lines 18–19, 544, 899) |
| `MoneyInput` / `NumericInput` | Appropriate for numeric cost/qty (lines 10–11, 809–837) |
| Parent callback contract | Same five callbacks as other containers (props lines 111–115) |
| Collapse/duplicate/add burst/line item UX | Matches general container interaction patterns (lines 323–526, 944–970) |

---

## 7. Open Questions for Luke

1. **`MEDIA_TYPE_ID_CODES`:** Should `production: "PROD"` be added to `lineItemIds.ts`, or keep `"PROD"` as a special case outside the map?
2. **Field-array rename:** Should form field become `productionlineItems` for consistency with `radiolineItems` / `digidisplaylineItems`?
3. **Schema centralisation:** Move production schemas into `schemas.ts` as a documented exception block, or keep inline?
4. **`feesearch` prop:** Parent passes `feeProduction` (from `feecontentcreator`, edit page 1437) but Production ignores it. Remove prop, rename, or wire up for future use?
5. **Publisher field:** Should production publisher stay free-text, or is there (or will there be) a production publisher API like radio/display?
6. **Xano version scoping:** When will `media_plan_production` gain reliable `mp_plannumber` filtering? Until then, is MBA-wide fetch acceptable?
7. **Hydration strategy:** Prefer Radio-style dedupe + change-key, or Cinema-style re-hydrate on every `initialLineItems` change?
8. **Manual billing exclusion:** Production is excluded from manual billing line-item accordion (spreadsheet callbacks). Is that permanent?
9. **`onMediaLineItemsChange` optional:** Make required to match other containers?

---

## 8. Proposed Alignment Scope (staged)

No implementation in this doc. Smallest safe changes first.

### Stage 1 — Low risk, no domain change

- Align hydration with Radio pattern: dedupe `initialLineItems`, change-key guard, allow safe re-hydration when fetch completes (ProductionContainer 352–412).
- Make `onMediaLineItemsChange` required in props if all call sites already pass it.
- Remove or rename unused `feesearch` prop; document that production is fee-free.
- Ensure `apiLineItems` includes `bursts_json` mirror for consumers that expect it (optional parity with other containers).

### Stage 2 — Metadata and ID consistency

- Add `production: "PROD"` to `MEDIA_TYPE_ID_CODES` (or document why not).
- Consider renaming field array to `productionlineItems` with form migration in one PR.
- Add production schemas to `schemas.ts` as an explicitly excluded/variant section (preserving cost×amount types).

### Stage 3 — UX parity (decision-dependent)

- If approved: publisher Combobox backed by API (would need endpoint spec).
- If approved: `sortLineItemsByLineItemNumber` on hydration.
- Toast feedback for duplicate/add failures (match Cinema/Radio).

### Stage 4 — Platform / Xano (blocked on Domain 4)

- Server-side version filtering on `media_plan_production`.
- Revisit manual billing production line-item visibility if product wants editable production rows in spreadsheet.

### Out of scope (preserve)

- Burst model (cost×amount), fee-free billing, 5-column grid, no expert mode, export platform lock, separate save table, `serializeBurstsJson` adoption.

---

## Appendix: Field-array naming across 19 containers

| Field-array name | Containers |
|------------------|------------|
| `televisionlineItems` | Television |
| `radiolineItems` | Radio |
| `newspaperlineItems` | Newspaper |
| `magazineslineItems` | Magazines |
| `cinemalineItems` | Cinema |
| `digidisplaylineItems` | Digital Display |
| `digiaudiolineItems` | Digital Audio |
| `digivideolineItems` | Digital Video |
| `bvodlineItems` | BVOD |
| `lineItems` | Search, Social, Integration, Influencers, OOH, ProgDisplay, ProgVideo, ProgBVOD, ProgAudio, ProgOOH, **Production** |
