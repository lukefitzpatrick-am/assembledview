# Campaign KPI zero-backfill — discovery findings

Read-only discovery for batch-updating `campaign_kpi` rows whose metrics were saved as **0** (or null) with matching `publisher_kpi` benchmark values. No code or data was modified.

---

## Section A — Campaign KPI storage

**Confidence: 95%**

### Xano table and base URL

| Item | Value | Evidence |
|------|-------|----------|
| Table name | `campaign_kpi` | `lib/kpi/campaignKpi.ts:15`, `lib/xano/campaignKpi.ts:61` |
| Xano API group env | `XANO_CLIENTS_BASE_URL` | `lib/kpi/campaignKpi.ts:15`, `lib/api/xano.ts:27-30` |
| List URL | `{XANO_CLIENTS_BASE_URL}/campaign_kpi` | `xanoUrl("campaign_kpi", "XANO_CLIENTS_BASE_URL")` |
| Row URL | `{XANO_CLIENTS_BASE_URL}/campaign_kpi/{id}` | `lib/kpi/campaignKpi.ts:138` |

### Next.js proxy routes

| Route | Methods | Backing | Evidence |
|-------|---------|---------|----------|
| `/api/kpis/campaign` | GET, POST, PATCH, DELETE | `campaign_kpi` on Clients Xano | `app/api/kpis/campaign/route.ts:13-101` |
| `/api/kpis/campaign/sync` | POST | `syncCampaignKpis` → GET + PATCH/POST | `app/api/kpis/campaign/sync/route.ts:7-17`, `lib/kpi/campaignKpi.ts:68-129` |

### GET filters (editor / API)

- Query params: `mba_number`, `version_number` (Next.js exposes as `mbaNumber`, `versionNumber`) — `lib/kpi/campaignKpi.ts:16-19`, `app/api/kpis/campaign/route.ts:15-34`.
- Client-side filter also accepts camelCase aliases on the wire — `lib/kpi/campaignKpi.ts:27-29`.
- **`mp_plannumber` is not a column on `campaign_kpi`.** Plan version is stored as `version_number` (integer). `mp_plannumber` is a media-plan form field only — `app/mediaplans/mba/[mba_number]/edit/page.tsx:1237`.

### Full field list (from types + pacing row mirror)

| Role | Field | Type / notes | Evidence |
|------|-------|--------------|----------|
| PK | `id` | number (optional on create) | `lib/kpi/types.ts:33`, `lib/xano/campaignKpi.ts:13` |
| System | `created_at` | number | `lib/kpi/types.ts:34` |
| Identity | `mp_client_name` | string | `lib/kpi/types.ts:35` |
| Identity | `mba_number` | string | `lib/kpi/types.ts:36` |
| Identity | `version_number` | number | `lib/kpi/types.ts:37` |
| Identity | `campaign_name` | string | `lib/kpi/types.ts:38` |
| Match key | `media_type` | string (resolver/workbook slug, e.g. `digiDisplay`, `socialMedia`) | `lib/kpi/types.ts:39` |
| Match key | `publisher` | string — **line-item display name (lowercase)**, not necessarily `publisherid` | `lib/kpi/types.ts:40`, `lib/kpi/fanOut.ts:147-152`, `lib/kpi/matching.ts:51-54` |
| Match key | `bid_strategy` | string — from line item `bidStrategy` / `bid_strategy` / **`buyType` / `buy_type`** fallback chain | `lib/kpi/types.ts:41`, `lib/kpi/matching.ts:123-131` |
| Natural key (sync) | `line_item_id` | string — required on create/sync | `lib/kpi/types.ts:42-43`, `lib/kpi/campaignKpi.ts:56-61` |
| Metric | `ctr` | `number \| null` | `lib/kpi/types.ts:44` |
| Metric | `cpv` | `number \| null` | `lib/kpi/types.ts:45` |
| Metric | `conversion_rate` | `number \| null` | `lib/kpi/types.ts:46` |
| Metric | `vtr` | `number \| null` | `lib/kpi/types.ts:47` |
| Metric | `frequency` | `number \| null` | `lib/kpi/types.ts:48` |

### Metric set vs `publisher_kpi`

**Same five fields, same names** — not `*_target` suffixes:

`ctr`, `cpv`, `conversion_rate`, `vtr`, `frequency`

Campaign tier allows **null** (unset); publisher tier uses non-null numbers with empty → **0** at Zod boundary — `lib/kpi/types.ts:311-346`.

No `_name` or other audit fields appear in campaign KPI create/patch schemas — `lib/kpi/types.ts:378-414`.

---

## Section B — What “saved to zero” means

**Confidence: 88%** ⚠️ LOW CONFIDENCE on historical Xano coercion; high confidence on current save path semantics.

### Current campaign save path

1. **Media plan save** (edit/create) builds `kpiPayload` via `fanOutKpiPayload(kpiRows, …)` and calls `saveCampaignKpisFromRows` → `syncCampaignKPIs` → `POST /api/kpis/campaign/sync` — `app/mediaplans/mba/[mba_number]/edit/page.tsx:5328-5374`, `lib/kpi/saveCampaignKpis.ts:14-36`, `lib/kpi/fanOut.ts:155-229`.
2. **KPI modal save** updates in-memory `ResolvedKPIRow[]` then flows through the same campaign save on plan save — `components/kpis/KPIEditModal.tsx:229-247`, `:869`.
3. **Pacing inline edit** uses `buildSyncPayloadFromEditedRow` → `syncCampaignKPIs` — `lib/pacing/kpi/buildSyncPayload.ts:12-27`, `components/pacing-search/LineItemPacingTable.tsx` (grep).

### Zod boundary (campaign tier)

Empty / null / undefined → **`null`** (not 0):

```323:333:lib/kpi/types.ts
const kpiMetricNullable = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v): number | null => {
    if (v === "" || v === null || v === undefined) return null
    ...
  })
  .refine((v) => v === null || v >= 0, {
    message: "Targets cannot be negative.",
  })
```

Used on all five metrics in `campaignKpiItemSchema` / sync — `lib/kpi/types.ts:387-391`.

### UI coercion (modal)

- Percent fields (CTR, VTR, conversion_rate): `parsePercentHeuristic` → **`null` if blank** — `lib/kpi/metrics.ts:7-12`, `components/kpis/KPIEditModal.tsx:471-495`.
- CPV / frequency: blank → **`null`** — `components/kpis/KPIEditModal.tsx:551-553`.
- **`0` is a valid saved value** (explicit zero target); modal rejects only negatives — `components/kpis/KPIEditModal.tsx:472`, `:554`.

### Where literal **0** enters persisted rows today

| Source | Mechanism | Evidence |
|--------|-----------|----------|
| **CPV always derived** | `deriveCpvFromLine`: returns **`0`** when buy type does not include `"cpv"` | `lib/kpi/resolve.ts:70-74`, `:154-165` |
| Fan-out | Passes `row.cpv` (often `0`) into sync payload | `lib/kpi/fanOut.ts:222-226` |
| Resolver merge | Client layer treats **`0` as unset** (`client !== 0`); publisher `0` can still win | `lib/kpi/resolve.ts:64-67`, `:145` |
| Publisher KPI side path only | `parsePercentMetric` → `parsePercentHeuristic(...) ?? 0` (publisher **create**, not campaign save) | `components/kpis/KPIEditModal.tsx:75-77`, `:114-118` |

### Observed Xano data (read-only GET, 2026-07-02)

Pagination: `page` + `page_size=200` works for `campaign_kpi` (20 pages, page 21 empty → **3,817 rows** total).

Sample page 1: **`ctr` stored as literal `0` (157/200), not null (0/200)**; **`cpv` literal `0` on 195/200**, null 0/200.

**Interpretation:** Most “missing target” rows in production appear as **literal `0`**, not SQL null — likely from earlier saves, derived CPV defaults, and/or Xano/storage defaults. Current app code intends **null = unset** for percent metrics.

### Zero-target pacing semantics (cross-ref)

- **`target === null`** → `"no-target"` (skip KPI status comparison) — `lib/pacing/kpi/computeKpiStatus.ts:51-52`, `:78-82`.
- **`target === 0`** is **not** treated as no-target; threshold becomes 0 — `computeKpiStatus.ts:54-55`.
- CTR cell tint skips comparison when **`normalisedTarget <= 0`** — `lib/pacing/kpi/kpiCellColor.ts:45-46` (“KPI zero-target: skip status when target is zero” applies to **cell tint**, not row pill).

---

## Section C — Match rule: campaign KPI → publisher benchmark

**Confidence: 92%**

### Resolver match (same logic backfill should use)

For each line item / saved row, publisher benchmark lookup is:

1. **`mediaTypeMatchesKpiRow(resolverMediaType, kpiRow.media_type)`** — lowercase + aliases (`digitalDisplay` ↔ `digiDisplay`, etc.) — `lib/kpi/matching.ts:7-28`, `lib/kpi/resolve.ts:104`, `:122`.
2. **`linePublisherMatchesKpiPublisherField(linePublisherNorm, kpiPublisherField, idToNormName)`** — match display name **or** map `publisher_kpi.publisher` (often **`publisherid`**) → `publisher_name` via `get_publishers` — `lib/kpi/matching.ts:38-65`, `lib/kpi/resolve.ts:87`, `:105-108`, `:123-127`.
3. **`normStr(k.bid_strategy) === bidStrategy`** where `bidStrategy` comes from **`extractKPIKeys`** — `lib/kpi/resolve.ts:110`, `:128`, `lib/kpi/matching.ts:123-131`.

### buyType → bidStrategy fallback (`extractKPIKeys`)

```123:131:lib/kpi/matching.ts
  const bidStrategy = get(
    "bidStrategy",
    "bid_strategy",
    "buyType",
    "buy_type",
    "targeting",
    "creative_targeting",
    "creativeTargeting",
  )
```

First non-empty field wins; value is **lowercased/trimmed** — `lib/kpi/matching.ts:147-149`.

Publisher field on line items is chosen by **media type** (e.g. search/social → `platform`; digi → `site`; TV → `network`) — `lib/kpi/matching.ts:89-121`.

### Definitive backfill join key

**Recommended composite key** (after normalization):

```
(
  norm(campaign.publisher display name),
  canon(media_type),
  norm(bid_strategy)
)
```

**Join to `publisher_kpi`** using `linePublisherMatchesKpiPublisherField` on the publisher dimension (not raw string equality on `campaign_kpi.publisher` vs `publisher_kpi.publisher`).

**Do not use** `line_item_id` for publisher benchmark lookup — that key is for row identity/sync only.

### Rows that cannot auto-backfill

| Case | Risk | Evidence |
|------|------|----------|
| **No publisher_kpi row** after id-aware match | No benchmark | Resolver `pubMatch` undefined — `lib/kpi/resolve.ts:120-129` |
| **Multiple publisher_kpi rows** same normalized triple | Ambiguous | **126 duplicate keys** in naive `(publisher, media_type, bid_strategy)` index on 900 `publisher_kpi` rows (read-only count); includes `link` / LinkedIn-style collisions if both stored under similar publisher keys |
| **bid_strategy mismatch** | Line saved `manual_cpc` vs benchmark `clicks` etc. | Only exact normalized `bid_strategy` match — no fuzzy map in `resolve.ts` |
| **media_type slug mismatch** beyond aliases | e.g. wrong casing without alias | `mediaTypeMatchesKpiRow` alias set is finite — `lib/kpi/matching.ts:21-27` |
| **campaign.publisher not in publishers map and ≠ publisher_kpi.publisher** | No match | `linePublisherMatchesKpiPublisherField` — `lib/kpi/matching.ts:55-64` |

Naive string key `(publisher, media_type, bid_strategy)` without id→name map matched only **436 / 3,791** zero-field rows; **3,355** had no naive match — publisher id vs display name is the dominant gap.

**Id-aware match (resolver-equivalent join, `get_publishers` map, 61 publishers):**

| Outcome | Rows |
|---------|-----:|
| Unique `publisher_kpi` match | **875** |
| Multiple matches (ambiguous) | **30** |
| No match | **2,912** |
| Backfillable metric cells (campaign 0/null **and** benchmark non-zero, among uniquely matched rows) | **0** |

Interpretation: the **875** resolvable rows already have benchmarks that are also zero wherever campaign is zero — the main backfill blocker is **2,912 rows with no publisher match** (publisher display name / bid_strategy / media_type mismatch), not missing copies among matched rows.

---

## Section D — Scope & counts

**Confidence: 90%** (counts from live GET; match-to-benchmark counts are approximate without full id-aware join script completion).

### Enumerate campaign KPI rows

| Path | Pagination | Notes |
|------|------------|-------|
| **Per plan** | Single GET, no loop | `fetchCampaignKpis(mba, version)` — `lib/kpi/campaignKpi.ts:10-34` |
| **Pacing** | `fetchAllXanoPages` per `(mba_number, version_number)` | `lib/xano/campaignKpi.ts:63-71` |
| **Full table** | `page`/`page_size=200`, dedupe by `id`, stop when page empty or duplicate page | Verified: 20 pages × 200 = **3,817 rows**; page 21 = 0 |

**`publisher_kpi`:** Returns **900 rows in one response** (bare array); repo helper `fetchAllXanoPagesWithCompleteness` stops at page 2 with “pagination unsupported” but first page already contains all rows — `scripts/verify-kpi-scale.ts:506-517`.

### Read-only counts (2026-07-02, `XANO_CLIENTS_BASE_URL` / `XANO_PUBLISHERS_BASE_URL`)

| Metric | Count |
|--------|------:|
| Total `campaign_kpi` rows | **3,817** |
| Total `publisher_kpi` rows | **900** |
| Rows with **any** metric 0 or null | **3,791** |
| Rows with **all five** 0 or null | **3,369** |
| Per-metric zero/null cells | ctr **3,370**, cpv **3,791**, conversion_rate **3,371**, vtr **3,373**, frequency **3,374** |
| Zero-field rows with **naive** publisher_kpi key match | **436** |
| Zero-field rows with **no** naive match | **3,355** |
| Zero cells where naive match exists **and** benchmark non-zero | ctr **132**, cpv **21**, conversion_rate **226**, vtr **29**, frequency **218** |

**Id-aware follow-up (same 3,817 rows, resolver-equivalent join):** 875 unique match / 30 multi / 2,912 no match; **0** backfillable cells among uniquely matched rows (when campaign metric is 0/null, benchmark is also 0/null on those rows).

⚠️ Naive key match **overstates** copy opportunity (436 zero-rows matched) because it joins on mismatched publisher string forms. Id-aware join shows most zero rows (**~77%**) have **no** benchmark row at all — backfill spec should prioritize **match diagnostics** (publisher normalization, bid_strategy alignment) before PATCH.

### CPV caveat for counts

**All 3,791 rows** have cpv zero/null because CPV is **derived** and defaults to **0** for non-CPV buy types — `lib/kpi/resolve.ts:70-74`. Backfill should likely **exclude cpv** unless buy type is CPV/CPV-like, or treat cpv=0 as “not a missing benchmark”.

---

## Section E — Write path (for later batch)

**Confidence: 94%**

### Update endpoints

| Operation | Method | URL | Body |
|-----------|--------|-----|------|
| Patch one row | **PATCH** | `{XANO_CLIENTS_BASE_URL}/campaign_kpi/{id}` | Partial fields — `lib/kpi/campaignKpi.ts:132-140` |
| Next.js proxy | **PATCH** | `/api/kpis/campaign` | `{ id, ...optional fields }` — `app/api/kpis/campaign/route.ts:60-77` |
| Sync (upsert) | **POST** | `/api/kpis/campaign/sync` | Full row array; PATCH if `(mba_number, version_number, line_item_id)` exists — `lib/kpi/campaignKpi.ts:68-127` |

### PATCH field whitelist (`campaignKpiPatchBodySchema`)

Required: `id`.

Optional (any subset, at least one required by refine on publisher patch only — campaign patch schema has **no** “at least one field” refine):

- `mp_client_name`, `mba_number`, `version_number`, `campaign_name`
- `media_type`, `publisher`, `bid_strategy`, `line_item_id`
- `ctr`, `cpv`, `conversion_rate`, `vtr`, `frequency` (each `number | null` via `kpiMetricNullable`)

Evidence: `lib/kpi/types.ts:399-414`.

### Full row vs partial patch

- **`updateCampaignKpi`** sends **`Partial<CampaignKpiInput>`** to Xano PATCH — **partial patch is supported** — `lib/kpi/campaignKpi.ts:132-140`.
- **`syncCampaignKpis`** on update passes **full `item` object** from fan-out (all identity + metric fields) — `lib/kpi/campaignKpi.ts:107-108`.

No `_name` audit injection on campaign KPI routes (unlike some publisher BP routes).

---

## Section F — Backfill design recommendation (diagnosis only)

**Confidence: 91%**

### Join in plain English

For each `campaign_kpi` row:

1. Normalize `media_type` (canon aliases).
2. Resolve `campaign_kpi.publisher` (display name) against `publisher_kpi.publisher` (id or name) using **`get_publishers`** map.
3. Match `bid_strategy` (lowercase exact).
4. For each metric in `{ ctr, conversion_rate, vtr, frequency }` (and **cpv only when buy type warrants**), if campaign value is **0 or null** and publisher benchmark is **non-null and non-zero**, copy benchmark → campaign.

Copy is **same field name** (no `_target` rename). No scale conversion needed if both sides use decimal-fraction convention (see below).

### Safe update rule

```
FOR each campaign_kpi row R:
  FIND publisher_kpi P using resolver match (id-aware publisher + canon media + norm bid_strategy)
  IF P is not unique: SKIP row (log)
  FOR each metric M in {ctr, conversion_rate, vtr, frequency} [+ cpv if CPV buy]:
    IF (R.M is null OR R.M === 0) AND (P.M is not null AND P.M !== 0):
      PATCH R.id SET M = P.M
    ELSE:
      leave unchanged
```

Never overwrite **non-zero** campaign values. Never overwrite when user intentionally set **0** unless product confirms 0 means “unset” in DB (recommended: treat **0 as unset** for backfill given observed data).

Idempotency: second run is no-op if benchmarks unchanged.

Prefer **PATCH by `id`** with only changed metrics over full sync POST (less blast radius).

### Edge cases

| Edge case | Handling |
|-----------|----------|
| No publisher match | Skip; manual review queue |
| Multiple `publisher_kpi` matches | Skip; dedupe `publisher_kpi` first or disambiguate by publisher id |
| Publisher benchmark also 0/null | Skip metric (nothing to copy) |
| **`link` / LinkedIn / Linkby** duplicate publisher ids | 126 duplicate naive keys in `publisher_kpi`; resolve with publisher catalog before join |
| `bid_strategy` mismatch (buyType saved vs benchmark key) | No match — may need buyType→bidStrategy remap table beyond `extractKPIKeys` |
| Legacy percent-scale campaign rows (`ctr >= 1`) | Rare; `formatPercentForInput` / `normaliseCtrTarget` handle display — verify before copy |
| **CPV = 0** on CPC/CPM lines | Expected derived default — **do not backfill cpv** unless line is CPV buy |
| Rows missing `line_item_id` | Legacy; sync ignores them — `lib/kpi/campaignKpi.ts:63-64`, `:94-95` |

### Scale alignment (critical)

| Layer | Convention | Evidence |
|-------|------------|----------|
| **`publisher_kpi`** (current) | **Decimal fraction** for percent metrics (e.g. `0.045` = 4.5%) after normalization project | User anchor; `scripts/verify-kpi-scale.ts`, `lib/kpi/__tests__/resolve.test.ts:41-42` |
| **`campaign_kpi`** (intended) | **Decimal fraction** — tests use `0.05`, `0.02`; pacing comment: `0.045 = 4.5%` | `lib/kpi/__tests__/resolve.test.ts:41`, `lib/pacing/kpi/computeKpiStatus.ts:66-67` |
| **Legacy heuristic** | Values **≥ 1** treated as percentage points in UI (`formatPercentForInput`, `normaliseCtrTarget`) | `lib/kpi/metrics.ts:18-28`, `lib/pacing/kpi/kpiCellColor.ts:25-27` |

**Conclusion:** Publisher benchmark → campaign copy should be **direct numeric copy** when both are post-normalization decimal fractions. Run spot-check on rows with `ctr >= 1` before batch; convert with `/100` if legacy percent-point storage is detected.

**Publisher tier empty → 0** at API (`kpiMetric`); campaign tier empty → **null**. Do not confuse publisher’s stored `0` (meaning “no benchmark”) with a copyable value — skip when benchmark is 0.

---

## Appendix — File index

| Topic | Path |
|-------|------|
| Types / Zod | `lib/kpi/types.ts` |
| Matching | `lib/kpi/matching.ts` |
| Resolve / merge | `lib/kpi/resolve.ts` |
| Campaign CRUD | `lib/kpi/campaignKpi.ts` |
| Pacing fetch | `lib/xano/campaignKpi.ts` |
| Fan-out save shape | `lib/kpi/fanOut.ts` |
| API routes | `app/api/kpis/campaign/route.ts`, `sync/route.ts` |
| Modal / save UI | `components/kpis/KPIEditModal.tsx` |
| Plan save hook | `app/mediaplans/mba/[mba_number]/edit/page.tsx:5328-5374` |
| Pagination helper | `lib/api/xanoPagination.ts` |
| Publisher KPI fetch | `lib/kpi/publisherKpi.ts` |

---

*Generated read-only. Live counts from authenticated GET to Xano Clients/Publishers APIs, 2026-07-02.*
