# Integration Container Save/Load Discovery

Branch: `hotfix/integrations-save-load` (from `origin/main`, commit `d96addd`).  
Scope: read-only inspection of `.ts`/`.tsx` on main-line code (what production users see on `[id]/edit`).

---

## Step 0 result (fix already on localhost?)

**Partial fix exists on `localhost`, but not on the page this hotfix targets.**

| Finding | Detail |
|---------|--------|
| `[id]/edit` on `localhost` | **Integration wiring removed entirely** (0 matches for `mp_integration` / `IntegrationContainer`). Users on localhost who edit via MBA route are unaffected. |
| Fee prop bug on **main** (`[id]/edit`) | `feeintegration={selectedClient?.feesearch \|\| 0}` — uses **search** fee, not integration fee (`app/mediaplans/[id]/edit/page.tsx:3588`). |
| Fee prop on **localhost** (`mba/[mba_number]/edit`) | **Fixed**: `feeintegration={feeIntegration \|\| 0}` where `feeIntegration` is hydrated from `client.feeintegration` (`app/mediaplans/mba/[mba_number]/edit/page.tsx:1407-1408`, `8463`). |
| Hydration slice on main | Correct channel: `initialLineItems={integrationLineItems}` (`[id]/edit/page.tsx:3599`), populated by `getIntegrationLineItemsByMBA` → `setIntegrationLineItems` (`1131`, `1147-1149`). |

**Conclusion:** The `feesearch` → `feeintegration` wiring fix is **already implemented on localhost** for the MBA edit page. For this hotfix (main / `[id]/edit`), it is a **straight port** of the MBA pattern: read `client.feeintegration`, pass it to `IntegrationContainer`. Localhost does **not** fix the deeper save/load field-map mismatches documented below.

---

## Step 1 — Container (`IntegrationContainer.tsx`)

### (a) Local line item type / interface

Zod schema `integrationLineItemSchema` (`lib/mediaplan/schemas.ts:400-417`):

- `platform`, `bidStrategy`, `buyType`, `objective`, `campaign`, `targetingAttribute`
- `creativeTargeting`, `creative`, `buyingDemo`, `market`
- `fixedCostMedia`, `clientPaysForMedia`, `budgetIncludesFees`, `noAdserving`
- `bursts[]` (`integrationBurstSchema` = `baseBurstSchema`: `budget`, `buyAmount`, `startDate`, `endDate`, `calculatedValue`, `fee`)
- Optional totals: `totalMedia`, `totalDeliverables`, `totalFee`

Expert mapping type `StandardIntegrationFormLineItem` (`lib/mediaplan/expertChannelMappings.ts:4347-4367`) mirrors the same camelCase fields plus `bursts: StandardMediaBurst[]`.

### (b) Burst model fields

Per-burst (form + `serializeBurstsJson` output):

| Form field | Serialized `bursts_json` field |
|------------|-------------------------------|
| `budget` | `budget` (money string) |
| `buyAmount` | `buyAmount` |
| `startDate` / `endDate` | ISO date strings |
| `calculatedValue` | `calculatedValue` |
| (derived) | `mediaAmount`, `feeAmount` |

### (c) Expert grid

- **Present:** `IntegrationExpertGrid` + Standard/Expert toggle (`IntegrationContainer.tsx:50-58`, `1857-1930`).
- **Mapping fns** (`lib/mediaplan/expertChannelMappings.ts`):
  - `mapStandardIntegrationLineItemsToExpertRows` (4613+)
  - `mapIntegrationExpertRowsToStandardLineItems` (4483+)
  - `StandardIntegrationFormLineItem` (4347+)
- **Switch helpers:** `lib/mediaplan/expertModeSwitch.ts` (`mergeIntegrationStandardFromExpertWithPrevious`, baseline serializers).

---

## Wiring (edit page props, verbatim)

`IntegrationContainer` render block (`app/mediaplans/[id]/edit/page.tsx:3585-3600`):

```tsx
{medium.name === "mp_integration" && (
  <IntegrationContainer
    clientId={selectedClientId}
    feeintegration={selectedClient?.feesearch || 0}
    onTotalMediaChange={handleIntegrationTotalChange}
    onBurstsChange={handleBurstsChange}
    onInvestmentChange={handleInvestmentChange}
    onLineItemsChange={handleIntegrationItemsChange}
    onMediaLineItemsChange={handleIntegrationMediaLineItemsChange}
    campaignStartDate={campaignStartDate}
    campaignEndDate={campaignEndDate}
    campaignBudget={campaignBudget}
    campaignId={id}
    mediaTypes={["integration"]}
    initialLineItems={integrationLineItems}
  />
)}
```

### Integration grep summary (`[id]/edit/page.tsx`, case-insensitive)

| Category | Symbols / locations |
|----------|---------------------|
| Imports | `getIntegrationLineItemsByMBA` (56), `saveIntegrationLineItems` (74) |
| Medium flag | `'mp_integration'` (112), `MEDIA_TYPES` entry (225) |
| Client type | `feeintegration?: number` on `Client` (181) — **defined but unused in prop** |
| State | `integrationTotal`, `integrationFeeTotal` (317-318), `integrationLineItems` (349), `integrationMediaLineItems` (369), `integrationItems` (378) |
| Form watch | `mpIntegration` / `mp_integration` (560, 584, 998) |
| Totals / billing | `integrationTotal` in rollups (420, 440, 488-489, 1372, 1393) |
| Load | `mediaTypeMap` entry `{ flag: 'mp_integration', fetchFn: getIntegrationLineItemsByMBA, setter: setIntegrationLineItems }` (1131); fetch uses `mediaPlan.version_number` (1147) |
| Save | `saveIntegrationLineItems(data.id, mbanumber, mp_clientname, "1", integrationMediaLineItems)` (2223-2230) |
| Callbacks | `handleIntegrationTotalChange` (1240), `handleIntegrationMediaLineItemsChange` (2726), `handleIntegrationItemsChange` (2730) |
| Billing map | `'mp_integration': { lineItems: integrationMediaLineItems, key: 'integration' }` (1739) |

**Fee prop:** `feeintegration` name is correct, but value is **`selectedClient?.feesearch`** (wrong channel).  
**Hydration prop:** `integrationLineItems` (correct integration slice, not another channel).

### Version switching

- Initial load fetches once per `mediaPlan.id` (`hasFetchedContainerDataRef`, 1114-1173); ref resets on `mediaPlan?.id` change (1176-1178), **not** on `version_number` alone.
- Save creates a new version (`~1977`) then saves line items with hardcoded `mp_plannumber: "1"` (2229) — same pattern as Radio (2085).

---

## Save path field map + flags

### Flow

1. `IntegrationContainer` `useEffect` builds `integrationMediaLineItems` (`IntegrationContainer.tsx:576-622`) → `onMediaLineItemsChange`.
2. Edit page save calls `saveIntegrationLineItems(..., integrationMediaLineItems)` (`[id]/edit/page.tsx:2225-2230`).
3. `saveIntegrationLineItems` (`lib/api.ts:3664-3712`) maps each item and POSTs to `/api/media_plans/integration` (browser) or Xano `media_plan_integrations`.

### Container → parent payload (`IntegrationContainer.tsx:595-618`)

| Container output field | Source |
|------------------------|--------|
| `media_plan_version` | `0` (placeholder) |
| `mba_number` | context `mbaNumber` |
| `mp_client_name` / `mp_plannumber` | `""` (filled by save fn) |
| `platform` | `lineItem.platform` |
| `objective` | `lineItem.objective` (always `""` — no UI field) |
| `campaign` | `lineItem.campaign` (always `""` — no UI field) |
| `buy_type` | `lineItem.buyType` |
| `targeting_attribute` | `lineItem.targetingAttribute` |
| `fixed_cost_media` | `lineItem.fixedCostMedia` |
| `client_pays_for_media` | `lineItem.clientPaysForMedia` |
| `budget_includes_fees` | `lineItem.budgetIncludesFees` |
| `no_adserving` | `lineItem.noAdserving` |
| `line_item_id` | `buildLineItemId(..., integration, index+1)` |
| `bursts_json` | `JSON.stringify(serializeBurstsJson(...))` |
| `line_item` | `index + 1` |
| `totalMedia` | computed (not sent to Xano) |

**Not emitted by container (but present in form UI):** `bid_strategy`, `creative_targeting`, `creative`, `buying_demo`, `market`.  
**Not emitted:** `bursts` array (Radio includes both `bursts` and `bursts_json` — see Divergence).

### `saveIntegrationLineItems` → Xano (`lib/api.ts:3675-3692`)

| Xano field | Save mapping | Flag |
|------------|--------------|------|
| `id` | (server-generated) | — |
| `media_plan_version` | `mediaPlanVersionId` arg | OK |
| `mba_number` | arg | OK |
| `mp_client_name` | arg | OK |
| `mp_plannumber` | arg (`"1"` hardcoded from edit page) | ⚠️ Same as Radio; may not match real version on MBA edit |
| `platform` | `getField(..., 'platform')` | OK |
| `objective` | `getField(..., 'objective')` | ⚠️ Always empty from UI |
| `campaign` | `getField(..., 'campaign')` | ⚠️ Always empty from UI |
| `buy_type` | `getField(..., 'buyType')` | OK |
| `targeting_attribute` | `getField(..., 'targetingAttribute')` | OK (UI label "Creative Targeting") |
| `fixed_cost_media` | `getBooleanField` | OK |
| `client_pays_for_media` | `getBooleanField` | OK |
| `budget_includes_fees` | `getBooleanField` | OK |
| `no_adserving` | `getBooleanField(..., 'noadserving')` | ⚠️ Container uses `noAdserving` camelCase; `getBooleanField` checks `no_adserving` + `noadserving` only — **`noAdserving` fallback missing** |
| `line_item_id` | `buildLineItemIdentity` | OK |
| `bursts_json` | `JSON.stringify(extractAndFormatBursts(...))` | OK — uses `serializeBurstsJson` inside `extractAndFormatBursts` (`lib/api.ts:1873-1884`) |
| `line_item` | `buildLineItemIdentity` | OK |
| `created_at` | (server) | — |

**Endpoint:** `POST /api/media_plans/integration` → Xano table `media_plan_integrations` (`app/api/media_plans/integration/route.ts:74-76`).

**`IntegrationLineItem` TS interface mismatch** (`lib/api.ts:472-493`): documents `bid_strategy`, `creative_targeting`, `buying_demo`, `market` but **omits** `objective`, `campaign`, `targeting_attribute` that Xano and the save fn actually use.

---

## Load path field map + flags

### Fetch

- `getIntegrationLineItemsByMBA(mba_number, version_number)` (`lib/api.ts:3143-3169`)
- Browser: `fetchLineItemsFromApi(..., "integration")` → `GET /api/media_plans/integration?mba_number=...&version_number=...`
- Raw rows stored in `integrationLineItems` unchanged, passed as `initialLineItems`.

### Container hydration mapper (`IntegrationContainer.tsx:537-567`)

| Xano row field | Container form field | Flag |
|----------------|---------------------|------|
| `platform` | `platform` | OK |
| `bid_strategy` | `bidStrategy` | ⚠️ **Never saved** — load expects field Xano table does not store (per API route schema) |
| `objective` | *(not mapped)* | ❌ **Lost on load** — saved but not hydrated |
| `campaign` | *(not mapped)* | ❌ **Lost on load** |
| `buy_type` | `buyType` | OK |
| `creative_targeting` | `creativeTargeting` | ⚠️ **Never saved** — UI "Placement" field |
| `creative` | `creative` | ⚠️ **Never saved** |
| `buying_demo` | `buyingDemo` | ⚠️ **Never saved** |
| `market` | `market` | ⚠️ **Never saved** |
| `targeting_attribute` | `targetingAttribute` | OK (UI label "Creative Targeting") |
| `fixed_cost_media` | `fixedCostMedia` | OK (`\|\| false`) |
| `client_pays_for_media` | `clientPaysForMedia` | OK |
| `budget_includes_fees` | `budgetIncludesFees` | OK |
| `no_adserving` | `noAdserving` | OK |
| `bursts_json` | `bursts[]` | ⚠️ Parses JSON only; **no** `item.bursts` fallback (Radio checks `bursts` first). **No** `computeLoadedDeliverables` recompute (Radio:793-803). `calculatedValue` falls back to `0` if missing. |
| `line_item_id` | *(not mapped to form)* | IDs regenerated on save |

---

## Divergence from Radio

| Aspect | Radio (known good) | Integration | Severity |
|--------|-------------------|-------------|----------|
| **Edit page fee prop** | `feeradio={selectedClient?.feesearch \|\| 0}` (`3434`) — also uses search fee on `[id]/edit` | `feeintegration={selectedClient?.feesearch \|\| 0}` (`3588`) | Integration should use `feeintegration`; localhost MBA edit uses dedicated state |
| **initialLineItems** | `radioLineItems` from `getRadioLineItemsByMBA` | `integrationLineItems` from `getIntegrationLineItemsByMBA` | Same pattern ✓ |
| **Container save shape** | Includes `bursts` array **and** `bursts_json` (`RadioContainer.tsx:917-918`) | Only `bursts_json` string (`IntegrationContainer.tsx:610-615`) | `extractAndFormatBursts` can still parse `bursts_json` ✓ |
| **Load burst source** | `item.bursts` first, then `bursts_json` (`RadioContainer.tsx:752-787`) | `bursts_json` only (`IntegrationContainer.tsx:552`) | ⚠️ If Xano returns parsed `bursts` object, Integration ignores it |
| **Load deliverables** | `computeLoadedDeliverables(...)` on each burst | `burst.calculatedValue ?? 0` | ⚠️ Round-trip deliverables may zero out |
| **Dedup / idempotent load** | `hasProcessedInitialLineItemsRef` + dedupe (`RadioContainer.tsx:677-735`) | Simple `useEffect`, no dedupe | ⚠️ Possible duplicate hydration on re-renders |
| **Xano field alignment** | Save sends same fields load expects (`bid_strategy`, `creative_targeting`, `market`, etc.) (`saveRadioLineItems` 3216-3241) | Save sends `objective`/`campaign`/`targeting_attribute`; load expects `bid_strategy`/`creative_targeting`/etc. | ❌ **Fundamental schema drift** |
| **API route schema** | Radio table fields align with container | `app/api/media_plans/integration/route.ts:13-32` matches **save** shape (`objective`, `campaign`, `targeting_attribute`), **not** container load mapper | ❌ Load mapper written for wrong schema |
| **no_adserving boolean** | `noadserving` in form, `no_adserving` in save (`RadioContainer` 840, 915) | `noAdserving` in form; save `getBooleanField` misses `noAdserving` alias | ⚠️ May default false on save |

---

## Candidate root causes, ranked

1. **Wrong fee source on `[id]/edit` (high confidence, one-line port)**  
   `feeintegration={selectedClient?.feesearch || 0}` at `app/mediaplans/[id]/edit/page.tsx:3588` should be `selectedClient?.feeintegration` (pattern: `app/mediaplans/mba/[mba_number]/edit/page.tsx:8463` + client hydration `1407-1408`). Causes wrong fee % in burst math, `serializeBurstsJson`, and totals. **Fix already on localhost MBA route.**

2. **Save/load field schema mismatch (high confidence, structural)**  
   Xano + `saveIntegrationLineItems` + API route use `objective`, `campaign`, `targeting_attribute` (`lib/api.ts:3680-3684`, `app/api/media_plans/integration/route.ts:20-24`). Container UI edits `bidStrategy`, `creativeTargeting` (placement), `buyingDemo`, `market`, `creative` — but save path **drops** them (`IntegrationContainer.tsx:595-618`). Load mapper reads `bid_strategy`, `creative_targeting`, etc. (`537-547`) that are **never persisted**. Users see empty fields after reload for most inputs.

3. **`objective` / `campaign` never hydrated (medium confidence)**  
   Saved (as empty strings today) but load mapper omits them (`IntegrationContainer.tsx:537-567`). If populated later, still lost on load.

4. **`noAdserving` → `no_adserving` save gap (medium confidence)**  
   `getBooleanField(lineItem, 'no_adserving', 'noadserving', false)` at `lib/api.ts:3688` does not check `noAdserving` camelCase used by Integration container. Checkbox state may not persist.

5. **Burst load weaker than Radio (medium confidence)**  
   No `computeLoadedDeliverables` on load (`IntegrationContainer.tsx:552-558` vs `RadioContainer.tsx:798-803`); deliverables may show 0 after reload even when `bursts_json` has data.

6. **`bursts_json`-only load path (low–medium)**  
   Integration ignores `item.bursts` if API returns array field (Radio handles both). API POST stores `bursts_json` as parsed array in Xano (`route.ts:70`).

7. **`IntegrationLineItem` interface stale (low, typing/docs)**  
   `lib/api.ts:472-493` does not match actual Xano row or save payload — misleads future changes.

8. **Hardcoded `mp_plannumber: "1"` on save (low for this hotfix)**  
   `[id]/edit/page.tsx:2229` — shared with Radio; version filtering relies on `media_plan_version` id primarily.

---

## Recommended hotfix scope (for implementers)

**Minimal (port from localhost):** Fix fee prop on `[id]/edit` to `selectedClient?.feeintegration ?? 0`.

**Full save/load fix (separate effort):** Align container field map with `media_plan_integrations` Xano schema — decide whether integration rows store social-style (`objective`/`campaign`/`targeting_attribute`) or radio-style (`bid_strategy`/`creative_targeting`/…) fields, then make container save, load, and `IntegrationLineItem` interface consistent. Add `noAdserving` to `getBooleanField` call or normalize casing in container output. Port Radio load improvements (`bursts` fallback, `computeLoadedDeliverables`).
