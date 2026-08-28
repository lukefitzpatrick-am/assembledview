# PLATFORM SURFACING DISCOVERY — PACING_FACT → pacing + dashboard

**Scope:** Read-only map of how `ASSEMBLEDVIEW.MART.PACING_FACT` reaches the pacing shell and the client dashboard delivery section. Snowflake now carries Taboola (`Programmatic - Display`) and CM360 (`Ad Serving - CM360`, spend=0 verification) rows. Decision: CM360 surfaces in **both** pacing and client dashboard delivery.

**Date:** 2026-07-11

---

## 1. Taboola — does it already flow?

**Confidence: 92%**

### 1.1 Channel WHERE clauses (display + video routes)

Both `app/api/pacing/programmatic/display/route.ts` and `video/route.ts` call `queryPacingFact` with a channel key only — no platform/source filter in the route itself.

The real gate is in `lib/snowflake/pacing-fact.ts`:

```93:96:lib/snowflake/pacing-fact.ts
      case "programmatic-display":
        return "LOWER(CHANNEL) LIKE '%programmatic%' AND LOWER(CHANNEL) LIKE '%display%'"
      case "programmatic-video":
        return "LOWER(CHANNEL) LIKE '%programmatic%' AND LOWER(CHANNEL) LIKE '%video%'"
```

Plus:

```119:121:lib/snowflake/pacing-fact.ts
  WHERE ${channelWhere}
    AND LINE_ITEM_ID IN (${placeholders})
    AND CAST(DATE_DAY AS DATE) BETWEEN TO_DATE(?) AND TO_DATE(?)
```

**Verdict:** `Programmatic - Display` (Taboola) **passes the Snowflake channel filter** the same as DV360. There is **no** platform/source predicate. Taboola rows ride along with DV360 **if** their `LINE_ITEM_ID` is in the requested id list.

Bulk delivery path (`lib/snowflake/pacing-service.ts`) uses the same channel pattern:

```213:216:lib/snowflake/pacing-service.ts
    AND (
      (LOWER(CHANNEL) LIKE '%programmatic%' AND LOWER(CHANNEL) LIKE '%display%')
      OR (LOWER(CHANNEL) LIKE '%programmatic%' AND LOWER(CHANNEL) LIKE '%video%')
    )
```

Normalisation CASE maps those rows to app channel `programmatic-display` / `programmatic-video`.

### 1.2 Adapter / compute assumptions that break on Taboola

**Hard DV360 plan-side filter (blocks Taboola on the dashboard):**

```100:107:lib/delivery/programmatic/programmaticCompute.ts
/** DV360 line items only — matches ProgrammaticDeliveryContainer filtering. */
export function normalizeDv360ProgrammaticLineItems(items: unknown[] | undefined): ProgrammaticLineItem[] {
  ...
      return platform === "dv360" || platform === "youtube - dv360" || platform === "youtube-dv360"
```

`programmaticAdapterShared.ts` always runs plan items through this before building a section. A Taboola plan row (`platform` = Taboola / native / etc.) is **dropped** → section returns `null` even if PACING_FACT has matching spend.

**Other assumptions (softer):**

| Assumption | Impact on Taboola |
|---|---|
| Connection pill hardcodes `"DV360 connected"` | Misleading label only |
| `mapCombinedRowToDv360` / `Dv360DailyRow` naming | Cosmetic; fields are generic (spend, imps, clicks, videoViews) |
| Display KPI band: CPM / CTR / CPC / CPA | Fine if metrics populated; videoViews unused on display |
| `insertionOrder` ← `CAMPAIGN_NAME` | Harmless if Taboola campaign name present |
| No DV360-specific IO parsing in match path | Match is id-equality only (see 1.3) |

No code path requires video-views on display rows; `video3sViews` is mapped but display charts use impressions.

### 1.3 Line-item resolution + orphans

**Join rule (programmatic delivery):** exact lowercase equality:

```501:504:lib/delivery/programmatic/programmaticCompute.ts
    const matched = apiRows.filter((row) => {
      if (!targetId) return false
      return row.matchedPostfix === targetId
    })
```

`matchedPostfix` is `String(LINE_ITEM_ID).toLowerCase()` from PACING_FACT (via bulk or dedicated routes). **No suffix match. No `LINE_ITEM_LABEL_MAP`.**

If Taboola’s `LINE_ITEM_ID` is the platform campaign id (fallback) and the plan’s trafficking `line_item_id` is the builder terminal id, the plan line item appears with **zero matched rows** (silent orphan — not surfaced in admin UI).

**Orphan admin tooling:** `SEARCH_PACING_CHANNELS` is Search-only:

```19:23:lib/pacing/admin/orphanDetection.ts
export const SEARCH_PACING_CHANNELS = [
  "Search - Google Ads",
  "Shopping - Google Ads",
  "PMax - Google Ads",
] as const;
```

Queries `SEARCH_PACING_FACT` only. **`Programmatic - Display` is not covered.** There is no PACING_FACT orphan detector.

### 1.4 Future live Taboola campaign (trafficking builder, line_item_id terminal)

For automatic appearance on **client dashboard delivery**:

1. Plan line item must live under prog-display (or equivalent) with a `line_item_id` that **exactly** equals PACING_FACT `LINE_ITEM_ID` (case-insensitive).
2. Trafficking builder already has a native/Taboola template with terminal `line_item_id` (`lib/naming/templates.ts` platform `"native"`).
3. **Must change** `normalizeDv360ProgrammaticLineItems` (or add a parallel normaliser) to accept Taboola/native platform values — otherwise the section never builds.
4. Snowflake channel already OK if CHANNEL ≈ `Programmatic - Display`.
5. Optional: connection pill / title copy; orphan tooling for PACING_FACT if fallback ids are common.

For **pacing shell**: there is **no** programmatic campaigns tab today (only Overview=search, Search, Social). Taboola would not appear on pacing shell without a new surface (see §3).

### Build implication

Taboola **already flows at the PACING_FACT SQL layer** for display. The **dashboard gate is plan-side DV360-only filtering**, not Snowflake. Surgical Taboola work: widen platform allowlist + ensure LINE_ITEM_ID parity with trafficking names. No new channel key required if it stays under Programmatic – Display. Pacing-shell Taboola needs a new programmatic (or shared) campaigns path — not automatic today.

---

## 2. Delivery section architecture (client dashboard)

**Confidence: 94%**

### 2.1 How channel blocks register

Not a plugin registry. **Imperative composition** in `CampaignDeliverySection`:

1. `DeliveryDataProvider` POSTs `/api/pacing/bulk` with id lists per channel family.
2. `CampaignDeliveryBody` builds an array by calling adapters if plan items exist:

```125:213:components/dashboard/delivery/CampaignDeliverySection.tsx
    if (metaItems.length > 0) { out.push(buildSocialMetaSection(...)) }
    if (tiktokItems.length > 0) { out.push(buildSocialTiktokSection(...)) }
    if (includeSearch) { const s = buildSearchSection(...); if (s) out.push(s) }
    if (progDisplayLineItems.length > 0) { const s = buildProgrammaticDisplaySection(...); if (s) out.push(s) }
    if (progVideoLineItems.length > 0) { const s = buildProgrammaticVideoSection(...); if (s) out.push(s) }
```

3. `DeliveryContainer` maps `ChannelSectionData[]` → `ChannelSection`.
4. Identity is `ChannelKey` union in `channels/types.ts`:

```8:13:components/dashboard/delivery/channels/types.ts
export type ChannelKey =
  | "social-meta"
  | "social-tiktok"
  | "search"
  | "programmatic-display"
  | "programmatic-video"
```

Icons: `getChannelIcon(key)` switch — must extend for any new key.

### 2.2 API routes feeding delivery

| Path | Used by delivery? | Auth | Shape |
|---|---|---|---|
| `POST /api/pacing/bulk` | **Yes** (primary) | `checkClientMbaAccess`; client role also requires line_item_ids to start with mba prefix | `{ ok, rows: PacingRow[], search? }` — rows from SOCIAL_PACING_FACT + PACING_FACT (programmatic display/video only) |
| `POST /api/pacing/programmatic/display` | Legacy / other consumers; **not** wired through `DeliveryDataProvider` | **None** in route | `{ rows, totals, dateSeries }` daily DV360-shaped rows |
| `POST /api/pacing/programmatic/video` | Same | **None** | Same |
| `GET /api/delivery/meta-adset` | Legacy Meta path; **not** used by current `CampaignDeliverySection` | None obvious | Adset-day rows from a Meta-oriented Snowflake object |

Bulk `PacingRow` fields: `channel`, `dateDay`, `lineItemId`, `amountSpent`, `impressions`, `clicks`, `results`, `video3sViews`, names/ids, sync timestamps.

### 2.3 What a NEW “Ad Serving” block needs end-to-end

| Layer | Work |
|---|---|
| Snowflake query | New channel branch in `pacing-fact.ts` / `pacing-service.ts` for `Ad Serving - CM360` (current LIKE filters **exclude** it; CASE falls to `ELSE LOWER(CHANNEL)` then **ALLOWED_CHANNELS drops it**) |
| API | Either extend `/api/pacing/bulk` non-social SQL + ALLOWED_CHANNELS, or add `app/api/pacing/ad-serving/route.ts` and teach `DeliveryDataProvider` a new id list |
| Types | Add `ChannelKey` e.g. `"ad-serving-cm360"`; icon in `getChannelIcon` |
| Adapter | New `adServingAdapter.ts` (or shared) → `ChannelSectionData`; **do not** reuse spend-pacing ProgressCards without guards (§4) |
| Section entry | Pass CM360/digital plan line items into `CampaignDeliverySection`; call builder in the `useMemo` channel list |
| Plan source | CM360 naming maps to **digital** containers (`digitalDisplay`, `digitalVideo`, …), not prog-display — assembly must supply those line items (today only prog display/video + social + search are wired) |

**Client-role access on delivery data path:** `checkClientMbaAccess` on `/api/pacing/bulk` (not `requirePacingAccess`). Client users: MBA must match assignment; line_item_ids must be prefixed by mba. Channel-agnostic.

`requirePacingAccess` is for pacing-shell list APIs (`/api/pacing/campaigns`, `social-campaigns`, orphans) — tenant client-id scope, not channel-specific.

### 2.4 KPI hooks (`lineItemKpiTargets`)

Programmatic adapters consume:

- `lineItemTargets` via `getLineItemKpiRow` / `aggregateRatioTargetFromLineItems` / `aggregateRateTargetFromLineItems` for CTR/VTR and burst-derived CPM/CPV.
- `kpiTargets` (`KPITargetsMap`) for deliverable **target curves** when deliverable key is clicks or videoViews.

Keyed by `(mba, version, line_item_id)` — **not** inherently display/video-only. An ad-serving block **can** get the same target/actual treatment if:

1. KPI rows exist for those line_item_ids / media_types, and  
2. The adapter calls the same helpers.

Nothing auto-wires a new channel; copy the programmatic/social pattern. Spend-based rate tiles (CPM/CPC) are inappropriate when spend≡0 (§4).

### Build implication

Delivery is a **hardcoded adapter list + ChannelKey union + bulk id buckets**. CM360 needs a **new channel key + adapter + plan-item plumbing + Snowflake allowlist**, not a config flag. Auth for dashboard delivery is `checkClientMbaAccess` on bulk. KPI plumbing is reusable by line_item_id once the adapter opts in.

---

## 3. Pacing surface architecture

**Confidence: 93%**

### 3.1 Shell pages and how sections appear

`components/pacing/PacingShell.tsx` tabs (hardcoded):

```11:13:components/pacing/PacingShell.tsx
  { href: "/pacing/overview", label: "Overview" },
  { href: "/pacing/search", label: "Search" },
  { href: "/pacing/social", label: "Social" },
```

(+ Admin orphans for admins.)

| Route | Data | Fact table |
|---|---|---|
| `/pacing/overview` | `GET /api/pacing/campaigns` → `getCachedSearchPacingRows` | **SEARCH_PACING_FACT** only (behind line items) |
| `/pacing/search` | Same campaigns API family | SEARCH_PACING_FACT |
| `/pacing/social` | `GET /api/pacing/social-campaigns` | SOCIAL_PACING_FACT |
| `/pacing/admin/orphans` | Search orphans | SEARCH_PACING_FACT |

**There is no programmatic / PACING_FACT campaigns page in the shell.**

**Social pattern to copy for “Ad Serving”:**

1. `app/pacing/(shell)/social/page.tsx` + `SocialCampaignsClient.tsx`
2. `GET /api/pacing/social-campaigns` with `requirePacingAccess` + `resolveClientSlugs`
3. Service: resolve live Xano line items → hydrate from Snowflake → `computePacing`
4. Add tab href in `PacingShell`

Overview is **not** a multi-channel rollup of PACING_FACT; it is search-behind only. Putting CM360 only on overview would be a new product shape; the established pattern is a **dedicated tab** (like Social).

### 3.2 Service-layer channel filters (PACING_FACT)

`queryPacingFact` Channel type: `"meta" | "tiktok" | "programmatic-display" | "programmatic-video"` — no ad-serving.

`getCampaignPacingData` non-social WHERE: programmatic display **or** video only (quoted in §1.1).

Post-query allowlist:

```52:52:lib/snowflake/pacing-service.ts
const ALLOWED_CHANNELS: Channel[] = ["meta", "tiktok", "programmatic-display", "programmatic-video", "search"]
```

A row with CHANNEL `Ad Serving - CM360` normalises to something like `ad serving - cm360` via ELSE, then is **filtered out** as unknown.

### 3.3 Client-scope on pacing routes

`requirePacingAccess`: Auth0 session; admin / empty tenant claims → unscoped; else Xano client ids from slugs. **Not channel-specific.** Downstream row builders filter by `allowedClientSlugs` against plan client names.

### Build implication

CM360 on pacing = **new shell tab + API + live-line-item resolver + PACING_FACT query branch**, mirroring Social — not a filter tweak on Overview. Extend `pacing-fact` / `pacing-service` channel types and SQL; Overview will not show CM360 unless explicitly redesigned.

---

## 4. Zero-spend semantics

**Confidence: 90%**

CM360 verification rows: spend=0, delivery metrics (impressions/clicks/etc.) may be non-zero. Flag places that divide by spend, compare spend to budget, or treat spend=0 as “no delivery.”

### Safe (guarded) patterns

| Location | Behaviour |
|---|---|
| `lib/pacing/maths/div0.ts` | Returns `0` when denominator is 0/NaN — used by `computePacing` KPIs (cpc, cpa, roas, variance %) |
| Programmatic `pacingPct` | `shouldSpend > 0 ? actual/shouldSpend*100 : 0` — no Infinity |
| `summarizeDv360Actuals` CPM/CPC/CPA/CPV | Denominator checks on **impressions/clicks/conversions/views**, not spend — spend=0 → rates **0**, not NaN |
| Progress `spendRatio` | `booked.spend > 0 ? actual/booked : 0` |
| `ProgressCard` `clamp01` | NaN progress → 0 |

### Problematic / nonsense for CM360 (guard requirements)

| Location | Failure mode when spend=0 |
|---|---|
| `computeStatus` in `lib/pacing/maths/index.ts` | `spendToDate === 0 && daysPassed >= 2` → **`no_delivery`** even if impressions exist — **wrong for verification data** |
| Delivery ProgressCard “Spend delivery” | Shows $0 vs planned budget, pacingPct 0 or −100% variance via `pctVarianceFromPacingPct` — **fake pacing-vs-budget** |
| `compareRateStatus` + CPM tile progress in `programmaticAdapterShared.ts` | `target / actual` when actual CPM=0 → Infinity → status **behind**; `cpmExpected / kpis.cpm` clamped to 1 — **misleading efficiency UI** |
| Connection of spend sparkline / “Total spend” chips | Dominates narrative with $0 |
| Any future use of `computePacing` for CM360 campaigns table | Status + projection variance assume media spend budget |

### Not NaN but product-wrong

- Spend pacing % = 0 when `shouldSpend > 0` and actual=0 → VarianceRibbon **−100%**.
- When `shouldSpend === 0` (no booked media), spend pacingPct forced to 0 → still rendered as a spend ProgressCard unless the adapter omits it.

### Build implication

For CM360: **show delivery metrics (imps/clicks/results); suppress or relabel spend-pacing ProgressCards; do not run `computeStatus` spend=0 → no_delivery; skip CPM/CPC/CPA tiles or mark N/A when spend≡0.** Prefer impression/click-based progress vs planned deliverables if plan has goals. Treat zero-spend as a first-class mode in the adapter, not an edge case of DV360 maths.

---

## Verdict table

| Surface | What exists today | What CM360 / Taboola build must add | Est. size |
|---|---|---|---|
| **PACING_FACT SQL (display)** | Channel LIKE programmatic+display; id + date filters; no platform filter | Taboola: nothing at SQL. CM360: new channel WHERE + type in `pacing-fact` / bulk non-social SQL + ALLOWED_CHANNELS | Taboola **S** / CM360 **S–M** |
| **Dashboard Programmatic – Display** | Bulk rows + DV360-only plan filter + exact LINE_ITEM_ID match | Taboola: widen `normalizeDv360ProgrammaticLineItems` (+ pill copy); ensure trafficking id parity. CM360: **do not** shoehorn into this block | Taboola **S** / CM360 n/a here |
| **Dashboard Ad Serving block** | None (`ChannelKey` / adapters / plan wiring absent) | New ChannelKey, adapter (zero-spend-safe), section entry, plan digital/CM360 line items, DeliveryDataProvider id bucket, bulk/API allowlist | **M–L** |
| **Pacing shell Overview** | Search-behind only (`SEARCH_PACING_FACT`) | Do not rely on Overview for CM360 unless product changes; optional later rollup | — (avoid) / **L** if redesigned |
| **Pacing shell Ad Serving tab** | Pattern exists (Social); no PACING_FACT campaigns UI | New tab + page + `requirePacingAccess` API + live Xano resolver + hydrate from PACING_FACT + UI; zero-spend status guards | **L** |
| **Orphan admin** | Search channels / SEARCH_PACING_FACT only | Optional PACING_FACT orphan tool including `Programmatic - Display` (and CM360) if fallback platform ids are expected | **M** |
| **Auth** | Delivery bulk: `checkClientMbaAccess`. Shell lists: `requirePacingAccess`. Channel-agnostic | Reuse same gates; no channel-specific auth | **S** |
| **KPI targets** | line_item_id keyed; programmatic/social adapters opt in | Wire in new adapter; avoid spend-rate KPIs when spend=0 | **S** (with Ad Serving block) |

### Bottom line

- **Taboola:** Snowflake display path already accepts it; **dashboard still filters plan items to DV360**. Fix platform allowlist + LINE_ITEM_ID alignment for automatic surfacing under existing Programmatic – Display.
- **CM360:** Excluded everywhere (SQL channel filters, ALLOWED_CHANNELS, ChannelKey, shell tabs, plan wiring). Needs **dedicated Ad Serving surfaces** on both dashboard and pacing, with **explicit zero-spend guards** so verification delivery never masquerades as budget pacing.

---

*STOP — discovery only; no code edits beyond this file.*
