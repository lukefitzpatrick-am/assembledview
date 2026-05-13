# `clientPaysForMedia` — usage and semantics audit

**Scope:** Read-only discovery (repo survey as of audit date). **Application code was not modified** except adding this file.

**Context for bursts_json:** `computeBurstAmounts` returns both `mediaAmount` (agency-invoiced media; **0** when `clientPaysForMedia`) and `deliveryMediaAmount` (planned / net media for tracking). Choosing one for persistence affects whether stored JSON reflects **billing to the agency** vs **planned media value**.

---

## 1. Origin — where `clientPaysForMedia` is set

### Granularity

Across the consulting media plan UI, the flag is **per line item** (each row in a channel container has its own checkbox). It is **not** a single campaign-level or client-level toggle in the editors surveyed. It is persisted on each line item (camelCase in app state; often `client_pays_for_media` on API payloads — see consumers).

### UI — standard (MBA-style) containers

Each channel uses a **checkbox** under an “Options” (or similar) block with the same label text.

| File | Approx. line | Control | Rendered label | Default |
|------|----------------|---------|----------------|---------|
| `components/media-containers/OOHContainer.tsx` | 1637–1647 | `FormField` + `Checkbox` | **Client Pays for Media** | `false` in `defaultValues` / new rows (e.g. ~387) |
| `components/media-containers/ProgDisplayContainer.tsx` | ~1485–1495 | same | **Client Pays for Media** | `false` (~325) |
| `components/media-containers/ProgVideoContainer.tsx` | ~1555–1565 | same | **Client Pays for Media** | `false` |
| `components/media-containers/ProgAudioContainer.tsx` | ~1479–1489 | same | **Client Pays for Media** | `false` |
| `components/media-containers/ProgBVODContainer.tsx` | ~1468–1478 | same | **Client Pays for Media** | `false` |
| `components/media-containers/ProgOOHContainer.tsx` | ~1489–1499 | same | **Client Pays for Media** | `false` |
| `components/media-containers/DigitalDisplayContainer.tsx` | ~1699–1709 | same | **Client Pays for Media** | `false` |
| `components/media-containers/DigitalVideoContainer.tsx` | ~1657–1667 | same | **Client Pays for Media** | `false` |
| `components/media-containers/DigitalAudioContainer.tsx` | ~1666–1676 | same | **Client Pays for Media** | `false` |
| `components/media-containers/SearchContainer.tsx` | ~1579–1589 | same | **Client Pays for Media** | `false` |
| `components/media-containers/SocialMediaContainer.tsx` | ~1633–1643 | same | **Client Pays for Media** | `false` |
| `components/media-containers/BVODContainer.tsx` | ~1774–1784 | same | **Client Pays for Media** | `false` |
| `components/media-containers/IntegrationContainer.tsx` | ~1507–1517 | same | **Client Pays for Media** | `false` |
| `components/media-containers/InfluencersContainer.tsx` | ~1487–1497 | same | **Client Pays for Media** | `false` |
| `components/media-containers/NewspaperContainer.tsx` | ~1865–1875 | same | **Client Pays for Media** | `false` |
| `components/media-containers/MagazinesContainer.tsx` | ~1880–1890 | same | **Client Pays for Media** | `false` |
| `components/media-containers/TelevisionContainer.tsx` | ~1841–1851 | same | **Client Pays for Media** | `false` |
| `components/media-containers/RadioContainer.tsx` | ~1886–1896 | same | **Client Pays for Media** | `false` |
| `components/media-containers/CinemaContainer.tsx` | ~1498–1508 | same | **Client Pays for Media** | `false` |

**Hydration from API / saved line items:** when mapping Xano-shaped rows into form state, containers typically set `clientPaysForMedia: item.client_pays_for_media || false` (or equivalent). Example pattern: `OOHContainer.tsx` ~614, `NewspaperContainer.tsx` ~746, `InfluencersContainer.tsx` ~547, etc.

### UI — Expert weekly grids (18 `*ExpertGrid.tsx` files)

- **Per-row** boolean on each expert schedule row (`clientPaysForMedia`), default **`false`** in `createEmpty*ExpertRow` factories (e.g. `DigitalDisplayExpertGrid.tsx` ~287).
- Column appears only when **“Show billing columns”** is on; header label **“Client Pays for Media”** with short label **“Client pays”** and tooltip full text via `ExpertGridBillingHeaderLabel`.

| Mechanism | File | Approx. lines | Label(s) |
|-----------|------|---------------|----------|
| Header strings + checkbox column | `DigitalDisplayExpertGrid.tsx` | ~2033, ~2287–2302 | **Client Pays for Media** (header); short **Client pays** (`ExpertGridBillingHeaderLabel.tsx` ~11) |
| Same pattern | `SearchExpertGrid.tsx`, `SocialMediaExpertGrid.tsx`, `TelevisionExpertGrid.tsx`, `RadioExpertGrid.tsx`, `NewspaperExpertGrid.tsx`, `MagazinesExpertGrid.tsx`, `OohExpertGrid.tsx`, `IntegrationExpertGrid.tsx`, `BVODExpertGrid.tsx`, `DigitalAudioExpertGrid.tsx`, `DigitalVideoExpertGrid.tsx`, `InfluencersExpertGrid.tsx` | billing header arrays include `"Client Pays for Media"` | Same |
| Prog / BVOD / Audio / Video / OOH expert variants | `ProgDisplayExpertGrid.tsx`, `ProgVideoExpertGrid.tsx`, `ProgAudioExpertGrid.tsx`, `ProgBVODExpertGrid.tsx`, `ProgOOHExpertGrid.tsx` | e.g. `ProgDisplayExpertGrid.tsx` ~1983 | **Client Pays for Media** |

### Schemas and API types

- **`lib/mediaplan/schemas.ts`:** multiple line-item schemas include `clientPaysForMedia: z.boolean()` with **`.default(false)`** on many channel shapes (e.g. ~219, ~282, ~305, etc.).
- **`lib/api.ts`:** line item types and normalizers use **`client_pays_for_media`** alongside camelCase in several `getBooleanField(..., 'client_pays_for_media', 'clientPaysForMedia', false)` call sites (e.g. ~1627+).
- **`app/api/media_plans/television/route.ts`:** request typing and mapping include `client_pays_for_media` defaulting with `|| false` (~23, ~57).

### Data import

No dedicated CSV/Excel importer for this flag was identified in the grep pass; primary origins are **form UI**, **API hydration**, and **Zod defaults**.

---

## 2. Consumers — where it is read and what changes

Grouped by behaviour when **`true`** vs **`false`**.

### Billing / invoicing

| Location | Behaviour when `true` | When `false` |
|----------|-------------------------|--------------|
| `lib/mediaplan/burstAmounts.ts` | `mediaAmount` forced to **0** (agency does not invoice media on that burst); fee branch still applies. | `mediaAmount` is net media (or gross-split net) per branch. |
| `lib/billing/computeSchedule.ts` ~129–134 | **Billing** months use `burst.mediaAmount`; **delivery** months use `(burst.deliveryMediaAmount ?? burst.mediaAmount)`. So client-paid: billing media share **0**, delivery share still uses planned media. | Billing and delivery media shares match unless `deliveryMediaAmount` is set differently. |
| `lib/billing/generateBillingLineItems.ts` ~23–25, ~90–99 | Line-level `clientPaysForMedia`; per burst `burstClientPaysForMedia`. **`effectiveBudget` for `mode === "billing"`** uses **0** net media when client pays (`billing` mode zeroes media distribution). **`mode === "delivery"`** uses **`netMedia`** regardless (still allocates planned media). | Billing uses `netMedia` from budget/fee flags. |
| `lib/billing/buildBillingSchedule.ts` ~112 | Passes **`clientPaysForMedia: true`** on serialized billing line items only when set (for schedule JSON). | Property omitted when false. |
| `lib/billing.ts` `calculateDailyBilling` / `calculateMonthlyDistribution` ~78–80, ~231–233 | After splitting gross/net, sets **`dailyMediaAmount = 0`** so accumulated **media** in schedule is zero; **fee** still distributed. | Media distributed from computed `dailyMediaAmount`. |
| `lib/billing.ts` `calculateBurstBilling` ~20–27 | Per-day **media** line is **0**; **totalAmount** per day is fee-only when true. | Media and fee both from split of `totalAmount`. |
| `lib/billing/types.ts` ~5–8, ~27–28 | Documents **`deliveryMediaAmount`** for pacing vs **`mediaAmount`** for billing when client pays. | Same types; amounts usually align. |
| `app/mediaplans/[id]/edit/page.tsx` ~1554–1565 | When building **`BillingLineItem`**, attaches `clientPaysForMedia: true` on the line item aggregate if the media line item has the flag. | Omitted if false. |

### Pacing / delivery

| Location | When `true` | When `false` |
|----------|-------------|----------------|
| `lib/billing/computeSchedule.ts` | Delivery map adds **`deliveryMediaShare`** from `deliveryMediaAmount ?? mediaAmount`, so spend can remain **non-zero** while billing media is zero. | Same formula; usually equal to billing media. |
| `lib/billing/generateBillingLineItems.ts` | **`mode === "delivery"`** keeps **`effectiveBudget = netMedia`** (not zeroed). | Same. |
| `lib/finance/accrual.ts` `buildAccrualDeliveryVsBillingRows` ~708–710 | **Excludes** delivery-schedule lines whose key maps to **`clientPaysForMediaByLineItemId === true`** from the **delivery** side of the accrual reconciliation (comment: client pays for media). | Included in delivery flatten. |
| `app/api/finance/accrual/route.ts` ~247–287 | Builds `clientPaysForMediaByLineItemId` from schedule JSON for the accrual API response and filtering. | Flags default false when absent. |
| `lib/api/dashboard/shared.ts` `sumDeliveryScheduleMonthAgencyMedia` ~254–266 | Skips line items where **`clientPaysForMedia` or `client_pays_for_media`** is strictly true when summing **agency** delivery media for a month. | All lines summed. |

### Display / UI labels

| Location | Role |
|----------|------|
| Container checkboxes | “Client Pays for Media” (see §1). |
| `ExpertGridBillingHeaderLabel.tsx` | Short **“Client pays”**, full **“Client Pays for Media”**. |
| `components/media-containers/*Container.tsx` (many) | Comments state UI **always shows media amounts** for planning; billing schedule excludes media when flag is true (e.g. `OOHContainer.tsx` ~714–715, `ProgBVODContainer.tsx` ~642–643). |
| `lib/finance/payablesReport.ts` ~20, ~60–61 | Documents client-paid lines: excluded from agency payables totals but **can appear in UI**. |
| `components/finance/hub/FinanceHubPayablesSection.tsx` ~49–57 | **`lineIsClientPaid`**: `client_pays_media` **or** `clientPaysForMedia`; used to **hide** client-paid lines from counts when toggle on. |

### Export / reporting

| Location | Behaviour |
|----------|-----------|
| `lib/finance/export.ts` `buildPayablesDetailExportRows` ~74–83 | Uses API field **`client_pays_media`** on billing records: splits amount into **`agencyOwed`** vs **`clientPaidDirect`** columns for CSV/Excel. |
| `lib/finance/aggregatePayablesPublisherGroups.ts` | **`client_pays_media`**: lines skipped for agency subtotals (`sumPayableLineItems`, `aggregatePayablesToPublisherGroups`). Parallel concept to plan editor flag. |
| Snowflake / pacing SQL under `lib/snowflake/` | **No** references to `clientPaysForMedia` or `client_pays_for_media` in surveyed Snowflake sync code; pacing uses other dimensions. Editorial line-item money semantics for this flag flow through **schedules** built in-app, not direct Snowflake columns found here. |

### Form validation

- Grep for **`refine` / conditional validation** tied specifically to `clientPaysForMedia` returned **no hits**.
- Enforcement is effectively **type-level** (`z.boolean()` / defaults) plus downstream **financial** behaviour, not a separate “invalid combination” rule surfaced in schema files searched.

---

## 3. `computeBurstAmounts` — four-branch math

Source: `lib/mediaplan/burstAmounts.ts` (full file read for this audit).

**Inputs:** `rawBudget` → sanitized `budget` = \(B\); `feePct` → `pct` = \(p\) (0 if non-finite); guards: if \(p = 100\) in non–`budgetIncludesFees` branches, `feeAmount = 0` to avoid division by zero.

**Notation:**  
- **Branch A:** `budgetIncludesFees === true`  
- **Branch B:** `budgetIncludesFees === false` && `clientPaysForMedia === true`  
- **Branch C:** both flags false  

When **A** is true, code runs the first block (lines ~81–90). **B** runs only when A is false (lines ~93–100). **C** is the final block (~103–108).

### A + `clientPaysForMedia === true`

- \( \text{feeAmount} = B \cdot (p/100) \)
- \( \text{netMedia} = B \cdot ((100-p)/100) \)
- \( \text{mediaAmount} = 0 \)
- \( \text{deliveryMediaAmount} = \text{netMedia} \)
- \( \text{totalAmount} = \text{feeAmount} \)

### A + `clientPaysForMedia === false`

- \( \text{feeAmount} = B \cdot (p/100) \)
- \( \text{netMedia} = B \cdot ((100-p)/100) \)
- \( \text{mediaAmount} = \text{netMedia} \)
- \( \text{deliveryMediaAmount} = \text{netMedia} \)
- \( \text{totalAmount} = B \) (net + fee = gross budget)

### B (`clientPaysForMedia` only)

- \( \text{feeAmount} = p = 100 ? 0 : (B / (100-p)) \cdot p \)  *(gross-up fee from net budget)*  
- \( \text{mediaAmount} = 0 \)
- \( \text{deliveryMediaAmount} = B \)
- \( \text{totalAmount} = \text{feeAmount} \)

### C (standard)

- \( \text{feeAmount} = p = 100 ? 0 : (B \cdot p) / (100-p) \)
- \( \text{mediaAmount} = B \)
- \( \text{deliveryMediaAmount} = B \)
- \( \text{totalAmount} = B + \text{feeAmount} \)

**Docstring semantics (same file, ~24–25):** *“When true, the publisher invoices the client directly. Agency receives fee only.”*

---

## 4. Current callers of `computeBurstAmounts` — which outputs are used?

### `expertRowFeeSplit` — `lib/mediaplan/expertGridShared.ts`

| Destructured from `computeBurstAmounts` | Used as |
|----------------------------------------|---------|
| `mediaAmount` | Returned as **`net`** (expert “net” = agency-billable media) |
| `feeAmount` | Returned as **`fee`** |
| `deliveryMediaAmount` | **Not read** |
| `totalAmount` | **Not read** (callers using `net + fee` recover the same total as `computeBurstAmounts`’s `totalAmount`) |

### Nineteen `get*Bursts` functions (consulting containers)

Each follows the same idiom as `getProgDisplayBursts` (`ProgDisplayContainer.tsx` ~166–180): destructure **`mediaAmount`**, **`deliveryMediaAmount`**, **`feeAmount`**; assign to **`BillingBurst`**; set **`totalAmount: mediaAmount + feeAmount`** (i.e. **not** the raw `computeBurstAmounts().totalAmount` identifier, but **numerically equal** to it for finite inputs).

| # | Function | File | Export ~lines |
|---|----------|------|----------------|
| 1 | `getProgDisplayBursts` | `ProgDisplayContainer.tsx` | ~154–191 |
| 2 | `getProgVideoBursts` | `ProgVideoContainer.tsx` | ~200+ |
| 3 | `getProgAudioBursts` | `ProgAudioContainer.tsx` | ~154+ |
| 4 | `getProgBvodBursts` | `ProgBVODContainer.tsx` | ~154+ |
| 5 | `getProgOohBursts` | `ProgOOHContainer.tsx` | ~154+ |
| 6 | `getDigiDisplayBursts` | `DigitalDisplayContainer.tsx` | ~155+ |
| 7 | `getDigiVideoBursts` | `DigitalVideoContainer.tsx` | ~143+ |
| 8 | `getDigiAudioBursts` | `DigitalAudioContainer.tsx` | ~181+ |
| 9 | `getSearchBursts` | `SearchContainer.tsx` | ~168+ |
| 10 | `getSocialMediaBursts` | `SocialMediaContainer.tsx` | ~152+ |
| 11 | `getBVODBursts` | `BVODContainer.tsx` | ~186+ |
| 12 | `getIntegrationBursts` | `IntegrationContainer.tsx` | ~160+ |
| 13 | `getInfluencersBursts` | `InfluencersContainer.tsx` | ~161+ |
| 14 | `getOohBursts` | `OOHContainer.tsx` | ~162+ |
| 15 | `getTelevisionBursts` | `TelevisionContainer.tsx` | ~188+ |
| 16 | `getRadioBursts` | `RadioContainer.tsx` | ~151+ |
| 17 | `getNewspapersBursts` | `NewspaperContainer.tsx` | ~169+ |
| 18 | `getMagazinesBursts` | `MagazinesContainer.tsx` | ~167+ |
| 19 | `getCinemaBursts` | `CinemaContainer.tsx` | ~128+ |

**Summary:** All 19 attach **all three** dollar fields to `BillingBurst` and derive **`totalAmount`** as **`mediaAmount + feeAmount`**. Downstream **`computeBillingAndDeliveryMonths`** is where **`deliveryMediaAmount`** becomes authoritative for the **delivery** schedule totals.

### Other references

- **`lib/mediaplan/expertChannelMappings.ts`:** imports `computeBurstAmounts` at **line 18** but has **no call sites** in that file (likely dead import or reserved for future work).
- **`app/mediaplans/create/page.tsx` ~2941–2960:** when normalizing bursts, reads **`mediaAmount`**, **`feeAmount`**, optional **`deliveryMediaAmount`** from burst objects for schedule-style data.

---

## 5. Prevalence (`clientPaysForMedia === true`)

| Source | Finding |
|--------|---------|
| **Tests / fixtures** | Almost all explicit fixtures use **`false`**: e.g. `tests/finance/fixtures/realisticMediaPlanVersion.ts` ~41, `tests/finance/buildFinanceForecastDataset.test.ts`, `tests/media-containers/bonus.test.ts`, `tests/lib/expertChannelMappings.test.ts`. **`tests/lib/expertModeSwitch.test.ts`** uses **`true`** on a **merged previous** OOH line item (~55) to assert merge behaviour, not production prevalence. |
| **Repo grep** | **`clientPaysForMedia: true`** / **`client_pays_for_media: true`** literals are **rare** outside conditional spreads (`...(flag ? { clientPaysForMedia: true } : {})`). |
| **Seed data** | No seed SQL/JSON files with this flag were found via glob/grep. |

**Interpretation:** In-repo data suggests the flag is **optional and uncommon** in fixtures; real-world prevalence would require DB analytics (not available here).

---

## 6. Product intent (evidence-based)

**Most defensible plain-English meaning:** *The **client pays the media supplier (publisher / vendor) directly**; the **agency’s invoiceable media amount to the client is zero**, while **fees** may still be invoiced by the agency. **Planned media value** remains real and is tracked for **delivery / pacing**, separate from **billing media**.*

**Evidence:**

1. **Code comment + docstring:** `burstAmounts.ts` ~24–25 (“publisher invoices the client directly… Agency receives fee only”); `lib/billing/types.ts` ~6–8 (delivery vs billing media).
2. **MBA container comments:** e.g. “billing schedule will handle excluding media when `clientPaysForMedia` is true” (`OOHContainer.tsx` ~714–715).
3. **`generateBillingLineItems`:** billing mode zeroes effective media budget; delivery mode keeps net media (~98–99).
4. **`lib/finance/payablesReport.ts`:** “publisher invoices the client directly”.
5. **UI label:** “**Client Pays for Media**” — natural reading is pass-through / direct client–vendor settlement, not “client reimburses the agency.”

**Not** the strongest reading alone, but consistent: reimbursement flows would more often still route media through agency AP; this model explicitly **zeros agency-billed media** while preserving **delivery** numbers.

---

## 7. Recommendation framing (bursts_json field choice)

No decision here — trade-offs only.

### Option A — Persist **`mediaAmount`** (billing semantics)

- **Pro:** Serialized JSON aligns with **what the agency invoices**; matches **`BillingBurst.mediaAmount`** and **`generateBillingLineItems`** billing-mode intuition (zero agency media when client pays direct).
- **Con:** Readers that expect “budget string = planned media value” may see **`0`** or a separate field would be needed for **planned media** unless they also read `budget` / `calculatedValue` / fee flags and re-derive net media.

### Option B — Persist **`deliveryMediaAmount`** (planning / delivery semantics)

- **Pro:** JSON always carries **planned net media dollars** for the burst, matching **pacing / delivery** and avoiding ambiguity when `mediaAmount` is zero by contract.
- **Con:** Misleading if a consumer treats the field as “amount client owes agency for media”; would need clear naming or paired metadata (`clientPaysForMedia` on the line item is required context).

### Option C — Persist **both** as separate fields

- **Pro:** **No information loss**; billing vs delivery consumers pick the column they need; aligns with `BillingBurst` already carrying both concepts.
- **Con:** Larger payload; Xano / legacy readers must be updated to tolerate new keys; need stable naming (`mediaAmount` vs `billingMediaAmount`, etc.) and migration rules for old rows.

---

## Appendix: related snake_case and payables API

- Schedule / API layers often use **`client_pays_for_media`** on line items and **`client_pays_media`** on some finance billing records (`export.ts`, `aggregatePayablesPublisherGroups.ts`). Treat strict **`=== true`** checks as intentional (see `deliverySchedulePayables.ts`).

---

*End of audit.*
