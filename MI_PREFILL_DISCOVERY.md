# MI Prefill Discovery

Discovery only — no code changes. Repo root `c:\Projects\avmediaplan`, 2026-07-12.

**Scope:** Live `media_plan_search` / `media_plan_social` rows for **jayco001 version 7**, typed container shapes behind `MEDIA_CONTAINER_ENDPOINTS`, and whether those fields can answer MI open questions (format, video/static/both, objective, audience).

**Confidence rule:** Anything below 90% is flagged explicitly.

---

## Method

1. Live GET against `XANO_MEDIA_PLANS_BASE_URL` (`xg4h-uyzs-dtex…/api:RaUx9FOa`):
   - `media_plan_search?mba_number=jayco001&version_number=7&mp_plannumber=7&media_plan_version=7` → **HTTP 200, 1 row**
   - `media_plan_social?…` (same qs) → **HTTP 200, 1 row**
2. Typed contracts: `MediaContainerLineItem` in `lib/api/media-containers.ts` + per-channel interfaces in `lib/api.ts`.
3. Resolver behaviour: `flattenPlanLineItems` / `resolveMiPlan` in `lib/specs/resolve.ts`, re-run on the live jayco payloads via `tsx` (throwaway script; not committed).

---

## 0. What `lib/api/media-containers.ts` actually types

`MediaContainerLineItem` is **not** a full per-channel schema. It only declares:

| Field | Type |
|-------|------|
| `id` | `number` |
| `mba_number` | `string` |
| `media_plan_version` | `number` |
| `placement_date?` | `string` |
| `start_date?` | `string` |
| `end_date?` | `string` |
| `budget?` / `cost?` / `spend?` / `investment?` | `number` |
| `[key: string]: any` | catch-all |

Per-channel field truth for search/social comes from **live Xano rows** below. Other containers: TypeScript interfaces in `lib/api.ts` (confidence that TS matches live Xano 1:1: **~80%** — flagged; no jayco001 v7 rows exist for those channels).

`MEDIA_CONTAINER_ENDPOINTS` keys → Xano paths (current tree):

| Key | Endpoint |
|-----|----------|
| `search` | `media_plan_search` |
| `socialMedia` | `media_plan_social` |
| (+ 18 others) | `media_plan_*` / legacy names per map |

---

## 1. Live sample rows (jayco001 v7)

### 1a. `media_plan_search` — full row (id 396)

**Confidence: 95%+** (live response).

| Field | Live value |
|-------|------------|
| `id` | `396` |
| `created_at` | `1780828387983` |
| `media_plan_version` | `831` (version **row id**, not display 7) |
| `mba_number` | `"jayco001"` |
| `mp_client_name` | `"Jayco"` |
| `mp_plannumber` | `"7"` |
| `platform` | `"Google Ads - AM"` |
| `bid_strategy` | `"target_cpa"` |
| `buy_type` | `"cpc"` |
| `creative_targeting` | `"Brand Keywords, Generic Keywords, PMAX"` |
| `creative` | `"Text, Image and Video Assets"` |
| `buying_demo` | `"PPL 35+"` |
| `market` | `"National"` |
| `fixed_cost_media` | `false` |
| `client_pays_for_media` | `false` |
| `budget_includes_fees` | `false` |
| `no_adserving` | `false` |
| `line_item_id` | `"jayco001SE1"` |
| `line_item` | `1` |
| `version_number` | `7` |
| `bursts_json` | array of 12 monthly bursts (see below) |

**Ad format / placement:** no dedicated `format` / `placement` column — closest is `creative` = `"Text, Image and Video Assets"`.  
**Creative type:** encoded inside `creative` (text/image/video assets), not a separate enum.  
**Objective:** **absent**. Closest weak proxy: `bid_strategy` = `"target_cpa"`.  
**Targeting / audience:** `creative_targeting` + `buying_demo`.  
**Bid strategy:** `bid_strategy` = `"target_cpa"`.  
**Dates / budget:** only inside `bursts_json[]` (`startDate`, `endDate`, `budget`, `mediaAmount`, `feeAmount`, `buyAmount`, `calculatedValue`).

First burst (values included):

```json
{
  "budget": "$18,590.40",
  "endDate": "2026-01-30T13:00:00.000Z",
  "buyAmount": "$0.35",
  "feeAmount": "$2,065.60",
  "startDate": "2025-12-31T13:00:00.000Z",
  "mediaAmount": "$18,590.40",
  "calculatedValue": 53115.42857142858
}
```

Quoted live row (bursts truncated to first element for readability; live row had 12):

```json
{
  "id": 396,
  "created_at": 1780828387983,
  "media_plan_version": 831,
  "mba_number": "jayco001",
  "mp_client_name": "Jayco",
  "mp_plannumber": "7",
  "platform": "Google Ads - AM",
  "bid_strategy": "target_cpa",
  "buy_type": "cpc",
  "creative_targeting": "Brand Keywords, Generic Keywords, PMAX",
  "creative": "Text, Image and Video Assets",
  "buying_demo": "PPL 35+",
  "market": "National",
  "fixed_cost_media": false,
  "client_pays_for_media": false,
  "budget_includes_fees": false,
  "no_adserving": false,
  "line_item_id": "jayco001SE1",
  "bursts_json": [ /* 12 monthly bursts */ ],
  "line_item": 1,
  "version_number": 7
}
```

### 1b. `media_plan_social` — full row (id 921)

**Confidence: 95%+** (live response).

| Field | Live value |
|-------|------------|
| `id` | `921` |
| `created_at` | `1780828387979` |
| `media_plan_version` | `831` |
| `mba_number` | `"jayco001"` |
| `mp_client_name` | `"Jayco"` |
| `mp_plannumber` | `"7"` |
| `platform` | `"Meta"` |
| `bid_strategy` | `"leads"` |
| `buy_type` | `"cpm"` |
| `creative_targeting` | `"Adventure/Outdoor interests"` |
| `creative` | `"BAU - Carousel, Static, Video (Feed and Stories)"` |
| `buying_demo` | `"PPL 35+"` |
| `market` | `"National"` |
| `fixed_cost_media` | `false` |
| `client_pays_for_media` | `false` |
| `budget_includes_fees` | `false` |
| `line_item_id` | `"jayco001SM1"` |
| `line_item` | `1` |
| `bursts_json` | 12 monthly bursts |
| `version_number` | **absent** on this row (version carried by `mp_plannumber` / query) |

**Ad format / placement:** again no `format`/`placement` columns — `creative` holds multi-format + placement language (`Carousel, Static, Video`, `Feed and Stories`).  
**Creative type:** inside `creative` (`Static`, `Video`, `Carousel`).  
**Objective:** **absent**. Weak proxy: `bid_strategy` = `"leads"`.  
**Targeting / audience:** `creative_targeting` + `buying_demo`.  
**Bid strategy:** `bid_strategy` = `"leads"`.  
**Dates / budget:** `bursts_json` only.

First burst:

```json
{
  "budget": "$4,200.00",
  "endDate": "2026-01-30T13:00:00.000Z",
  "buyAmount": "$10.00",
  "feeAmount": "$466.67",
  "startDate": "2025-12-31T13:00:00.000Z",
  "mediaAmount": "$4,200.00",
  "calculatedValue": 420000
}
```

Quoted live row (bursts truncated):

```json
{
  "id": 921,
  "created_at": 1780828387979,
  "media_plan_version": 831,
  "mba_number": "jayco001",
  "mp_client_name": "Jayco",
  "mp_plannumber": "7",
  "platform": "Meta",
  "bid_strategy": "leads",
  "buy_type": "cpm",
  "creative_targeting": "Adventure/Outdoor interests",
  "creative": "BAU - Carousel, Static, Video (Feed and Stories)",
  "buying_demo": "PPL 35+",
  "market": "National",
  "fixed_cost_media": false,
  "client_pays_for_media": false,
  "budget_includes_fees": false,
  "line_item_id": "jayco001SM1",
  "bursts_json": [ /* 12 monthly bursts */ ],
  "line_item": 1
}
```

### 1c. Other containers — typed field inventory (no jayco001 v7 live rows)

jayco001 v7 only has search + social (KPI snapshot `rowCount: 2`; live fetch confirmed 1+1). Field lists below are from `lib/api.ts` interfaces mapped to `MEDIA_CONTAINER_ENDPOINTS`. **Confidence TS ≡ live schema: ~80%** (flagged).

Highlight fields relevant to format / creative / objective / audience / bid / dates / budget:

| Container key | Publisher-ish | Format / placement / creative | Targeting / demo | Objective | Bid | Dates/budget |
|---------------|---------------|-------------------------------|------------------|-----------|-----|--------------|
| `search` | `platform` | `creative` | `creative_targeting`, `buying_demo` | — | `bid_strategy` | `bursts_json` |
| `socialMedia` | `platform` | `creative` | `creative_targeting`, `buying_demo` | — | `bid_strategy` | `bursts_json` |
| `progDisplay` / `progVideo` / `progAudio` / `progOoh` / `progBvod` | `platform` | `creative` | `creative_targeting`, `buying_demo` | — | `bid_strategy` | `bursts_json` |
| `digitalDisplay` / `digitalVideo` / `digitalAudio` / `bvod` | `publisher`, `site` | `creative` | `creative_targeting`, `buying_demo` | — | — | `bursts_json` |
| `television` | `network`, `station` | `placement`, `creative`, `daypart` | `buying_demo` | — | — | `bursts_json` |
| `radio` | `network`, `station` | `placement`, `format`, `duration` | `buying_demo`, optional `creative_targeting` | — | `bid_strategy` | `bursts` |
| `newspaper` / `magazines` | `network`, `title` | `size`, `format`, `placement` | `buying_demo` | — | — | `bursts_json` |
| `ooh` | `network` | `format`, `type`, `placement`, `size` | `buying_demo` | — | — | `bursts_json` |
| `cinema` | `network`, `station` | `format`, `placement`, `duration` | `buying_demo` | — | `bid_strategy` | `bursts` |
| `integration` | `platform` | `creative?`, `campaign` | `targeting_attribute`, `creative_targeting?`, `buying_demo` | **`objective`** | `bid_strategy` | `bursts_json` |
| `influencers` | `platform` | `campaign` | `targeting_attribute` | **`objective`** | — | `bursts_json` |
| `production` | `publisher` | `media_type`, `description` | — | — | — | `bursts` / `bursts_json` |

Only **`integration`** and **`influencers`** declare a first-class `objective` field in TS.

---

## 2. Diff vs MI open-question set (`lib/specs/resolve.ts`)

### 2a. What open questions actually exist today

`FIELD_ORDER` / emitters in `resolve.ts`:

| `field` | Question text (paraphrase) | Emitted when |
|---------|----------------------------|--------------|
| `placeholder` | include vs skip | ≥2 `"test"` fields |
| `publisher` | which publisher slug | slug miss |
| `custom_specs` | paste specs / per booking | Direct Digital + custom terms |
| `creative_type` | **"Is this video, static or both?"** | Social / YouTube / TikTok **and** creative/placement text lacks `CREATIVE_TERMS` |
| `format` | which library format | publisher known, format score &lt; 2 |
| `variants` | confirm mixed sizes | mixed dimensions detected |
| `dimensions` | typo vs custom size | non-standard WxH |

**Not implemented as open questions:** `objective`, `audience`.  
User-requested set called out in parentheses below; treat objective/audience as **product intent / planned gaps**, not current interview fields. Confidence on “not in resolve.ts today”: **95%+**.

### 2b. What the resolver currently reads from a row

`flattenPlanLineItems` maps:

| Resolver input | Source keys (first hit wins) |
|----------------|------------------------------|
| `publisher` | `publisher`, `platform`, `network`, `site` |
| `format` | `placement`, **`creative`**, `format`, `oohFormat`, `ooh_format`, `size`, `ad_size` |
| `placement` | `placement` only |
| `targeting` | `targeting`, `creativeTargeting` — **not** `creative_targeting` |
| dates | `bursts` (not `bursts_json`) → `startDate`/`endDate`… |
| `buyType` | `buy_type` / `buyType` |
| `market` | `market` |

** empirically on jayco live rows** (`resolveMiPlan` re-run):

| Line | Flattened `format` | Flattened `targeting` | Dates | Open Q | Resolved |
|------|--------------------|-----------------------|-------|--------|----------|
| Search `jayco001SE1` | `"Text, Image and Video Assets"` | `""` (snake_case missed) | `""` (`bursts_json` ignored) | **`format`** (Google Ads format choice) | — |
| Social `jayco001SM1` | `"BAU - Carousel, Static, Video (Feed and Stories)"` | `""` | `""` | none | auto → **`Facebook Feed - Video`** (`confidence: "high"`) |

### 2c. Per question: candidate fields + transform

#### Q1 — `format` (“Which {publisher} format applies?”)

| Source field | Search (jayco) | Social (jayco) | Transform needed |
|--------------|----------------|----------------|------------------|
| `creative` | `"Text, Image and Video Assets"` | `"BAU - Carousel, Static, Video (Feed and Stories)"` | Already fed into `line.format`. Need stronger mapping: token score ≥2 against mi-library `format_name`, or NLP/rules (e.g. PMAX / RSA / Feed / Stories / Carousel → library format). |
| `creative_targeting` | contains `"PMAX"` | interests string | **Not used for format today.** Could boost Search → Performance Max (confidence of that heuristic alone: **~70%** — flagged). |
| `placement` / `format` columns | absent on search/social | absent | N/A for these channels |
| Library `formats[].format_name` | choice list | choice list | Current path |

**jayco outcome:** Search still needs the format interview. Social auto-picked one Meta format; that collapse of a multi-format creative string to a single library format is **&lt;90% confidence as a correct prefill** even though the resolver labels it `"high"`.

#### Q2 — `creative_type` / video·static·both

| Source field | Usable? | Transform |
|--------------|---------|-----------|
| `creative` | Yes when it contains `CREATIVE_TERMS` (`video\|static\|image\|carousel\|reel\|story\|stories\|…`) | If both video + static/carousel terms → prefill `"both"`; video-only → `"video"`; static/image-only → `"static"`. Today the resolver **skips the question** when any term matches — it does **not** write an answer of `"both"`. |
| Separate creative-type column | **None** on search/social | — |

**jayco social:** terms match → question suppressed; no explicit `"both"` answer recorded.  
**jayco search:** Search container does not ask `creative_type` (Social/YouTube/TikTok gate only).

Confidence that jayco social *should* be `"both"` from the string: **~85%** (flagged) — carousel + static + video.

#### Q3 — `objective` (not an open question today)

| Source field | Search | Social | Other containers |
|--------------|--------|--------|------------------|
| `objective` | **missing** | **missing** | Present on **integration** / **influencers** only (TS) |
| `bid_strategy` | `"target_cpa"` | `"leads"` | Often present on digital/programmatic |

**Transform if someone tried to derive objective from bid_strategy:** map optimisation goals → funnel objectives (e.g. `leads` → lead-gen, `target_cpa` → conversion). That is **not** a 1:1 objective field and is **&lt;90% confidence** (flagged) — bid strategy ≠ campaign objective.

**Verdict for search/social:** no reliable derivable answer → **stays interview** (or stays unasked until a question is added).

#### Q4 — `audience` (not an open question today)

| Source field | Live jayco values | Ingested by resolver? | Transform |
|--------------|-------------------|----------------------|-----------|
| `creative_targeting` | Search: keyword themes; Social: `"Adventure/Outdoor interests"` | **No** — keys are `targeting` / `creativeTargeting` only | Map snake_case → `line.targeting`; then either prefill free-text audience or match saved audiences |
| `buying_demo` | `"PPL 35+"` both rows | **No** | Could append as demo overlay (“PPL 35+ · Adventure/Outdoor interests”) |
| Dedicated `audience` column | **None** on search/social | — | — |

**Data exists on the row** but is invisible to MI resolve today. Even after a key-fix, there is still **no audience open question** to prefill.

Confidence that `creative_targeting` is the right audience signal for Social: **~90%**.  
Confidence for Search (keywords/PMAX themes as “audience”): **~75%** (flagged) — closer to targeting construct than demographic audience.

---

## 3. Questions with no derivable answer → stay interview

| Question | Stay interview? | Why |
|----------|-----------------|-----|
| **`objective`** | **Yes** (search/social) | No `objective` field; `bid_strategy` is a weak proxy (&lt;90%). Not even asked by `resolve.ts` today. |
| **`audience`** | **Yes as interview product**, with a caveat | Row has `creative_targeting` + `buying_demo`, but resolver does not ingest them and no audience question exists. Until both exist, cannot auto-answer. |
| **`format` (Search jayco)** | **Yes** | Live `creative` does not score ≥2 against Google Ads library formats; `PMAX` hint sits in `creative_targeting` unused. |
| **`format` (Social jayco)** | **Arguably still yes for multi-format rows** | Auto-resolve picked a single Meta format; creative text implies multiple placements/types. Prefill correctness **&lt;90%**. |
| **`creative_type` (Social when terms present)** | **Often auto-skipped, not answered** | Question does not fire; no stored `"video"|"static"|"both"`. Ambiguous multi-term strings still need a deliberate `"both"` prefill rule if interview should stay silent. |
| **`creative_type` (Social when terms absent)** | **Yes** | No other field carries video/static. |
| **`publisher`** (jayco) | No (resolved) | `platform` → aliases / slugify → `google-ads` / `meta`. |
| **Dates / budget** | N/A to open-Q set | Live data in `bursts_json`; flatten looks at `bursts` only — dates empty in flattened plan. Out of the four asked questions, but relevant to prefill completeness. |

### Hard stop summary

1. **Live field truth for jayco001 v7 search + social is complete** (95%+).
2. Of the four named concerns: **format** can partially prefill from `creative` (works poorly for Search; over-confident single pick for Social multi-format). **video/static/both** can be inferred from `creative` text with an explicit both-rule (not implemented). **objective** cannot be derived safely from search/social. **audience** has source fields but is unused and has no open question.
3. **Stay as interview (or unasked):** objective (search/social); audience until ingest + question exist; Search format for this sample; Social format when creative lists multiple units.

---

## Confidence ledger

| Finding | Confidence |
|---------|------------|
| Live search/social field lists + quoted values | **95%+** |
| Open-Q inventory in `resolve.ts` (no objective/audience Q) | **95%+** |
| `creative_targeting` / `bursts_json` not ingested by flatten | **95%+** (verified by flatten output) |
| jayco Search still opens `format` Q; Social auto-resolves | **95%+** (verified `resolveMiPlan`) |
| Social auto-format `"Facebook Feed - Video"` is the *correct* single MI format | **&lt;90%** — flagged |
| Inferring `creative_type: "both"` from jayco social creative | **~85%** — flagged |
| Inferring objective from `bid_strategy` | **&lt;90%** — flagged |
| TS interfaces for non-jayco containers match live Xano | **~80%** — flagged |
| Using Search `creative_targeting` “PMAX” to prefill Performance Max | **~70%** — flagged |
