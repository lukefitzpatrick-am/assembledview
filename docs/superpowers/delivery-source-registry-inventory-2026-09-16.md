# DS-0 — Delivery source registry inventory

Status: complete (input to DS-1)  
Date: 2026-09-16  
Scope: read-only. No source files changed.  
Brain: `docs/brain/MAP.md` §3 Pacing & delivery, §4 Client dashboards; `docs/brain/modules/pacing.md`; `docs/brain/modules/dashboards-charts-exports.md`; `docs/brain/INVARIANTS.md` ZERO-$ LAW + `delivery_source_map`; `docs/brain/BLAST-RADIUS.md` delivery adapters / `deliverySourceMap`.

Campaign delivery mounts twelve `ChannelKey` containers (`types.ts:13–25`) from `CampaignDeliverySection`. This inventory is **source-oriented**: one table per live adapter family the registry must name (social Meta / TikTok / Reddit, search, programmatic DV360 / CM360 / partner file, direct digital, BVOD, plan-only remainder). Display vs video vs OOH tile/deliverable differences are the metric profiles in the closing section.

App fact rows arrive already joined. Warehouse attach (`LINE_ITEM_LABEL_MAP`, `PARTNER_LINE_MAP`) is recorded under **inputs** because the adapter never repeats it.

Campaign-delivery status is `deliveryStatusFromPct` (`behind < 90`, `ahead > 110`) — not the admin `PacingStatus` ladder.

---

## Social – Meta

Entry: `socialMetaAdapter.ts` → `buildSocialChannelSectionForPlatform` (`socialAdapterShared.ts`). Key `social-meta`.

| Field | Record |
|---|---|
| **inputs** | Fact: `MART.SOCIAL_PACING_FACT` via `/api/pacing/bulk` (`pacing-service.ts` social SELECT). Warehouse CHANNEL `Social - Meta`; app filter `channel === "meta"` (`socialAdapterShared.ts:368–377`). Line attach: plan lines classified `meta` by `classifySocialPacingPlatform` (`CampaignDeliverySection.tsx:493–511`) then re-filtered `classifyPlatform` (`socialAdapterShared.ts:371–373`). Fact↔line is `line_item_id` lowercased (`socialChannelCompute.ts:787–798`). Warehouse `LINE_ITEM_LABEL_MAP` coalesces `LINE_ITEM_ID` at `TSK_REFRESH_SOCIAL_PACING_FACT` (`tsk_refresh_social_pacing_fact.sql:46–48`). No `PARTNER_LINE_MAP`. No `delivery_source_map`. |
| **spend mode** | Actual platform spend. Condition: always `AMOUNT_SPENT` → `amountSpent` (`socialChannelCompute.ts:843`). No modelled, no `REPORTED_SPEND`. |
| **deliverable** | `mapDeliverableMetric({ channel: "social", buyType, platform })` (`socialChannelCompute.ts:350–365`). CPV/video → `VIDEO_3S_VIEWS` / `video_3s_views`; CPA/results → `RESULTS` / `results`; CPC/traffic → `CLICKS` / `clicks`; else `IMPRESSIONS` / `impressions`. Reads those columns on the mapped daily row. |
| **KPI tiles** | Always: CPM (`spend/impr×1000`, plan CPM from bursts), CTR (`clicks/impr`, `campaign_kpi.ctr`), CPC (`spend/clicks`, no target), CVR (`results/impr`, `conversion_rate`), CPA (`spend/results`, no target). Video extras when `/\bvideo\b/i` on `buy_type` (`socialAdapterShared.ts:76–78,411`): View rate (`video_3s_views/impr`), CPV (`spend/video_3s_views`). View rate/CPV format `0` when denom is 0 (`socialChannelCompute.ts:738–741`), not `null`. |
| **status ladder** | Spend card: `deliveryStatusFromPct(aggregatePacing.spend.pacingPct)` — actual spend to-date ÷ expected-to-date from bursts. Deliverable card: same helper on `deliverable.pacingPct` (chosen metric to-date ÷ expected). KPI tiles: `compareRateStatus` ±8% (`socialAdapterShared.ts:80–91`). |
| **does not fit** | Video tiles keyed off buy_type regex, not a profile flag (`socialAdapterShared.ts:76–78,411,468`). Entity breakdown is Meta-only noun `{ad set, ad sets}` (`socialAdapterShared.ts:109–116`). Chart is always Spend + Impressions, even on CPV lines (`:521–530`). Empty-fact Meta lines stay in this container (not remainder). |

---

## Social – TikTok

Entry: `socialTiktokAdapter.ts` → same shared builder. Key `social-tiktok`.

| Field | Record |
|---|---|
| **inputs** | Same fact `SOCIAL_PACING_FACT`. Warehouse CHANNEL `Social - TikTok`; app `channel === "tiktok"`. Classifier `tiktok` then `classifyPlatform`. `line_item_id` direct. `LINE_ITEM_LABEL_MAP` at social refresh. No partner map. No `delivery_source_map`. |
| **spend mode** | Actual `AMOUNT_SPENT`. Same as Meta. |
| **deliverable** | Same `mapDeliverableMetric` + fact columns as Meta. |
| **KPI tiles** | Same five + video extras when buy_type matches `/\bvideo\b/i`. Entity noun `{ad group, ad groups}` (`socialAdapterShared.ts:113–115`). |
| **status ladder** | Identical to Meta (`deliveryStatusFromPct` on spend and deliverable pacingPct; ±8% on rate tiles). |
| **does not fit** | Same video-regex and Spend+Impressions chart. Empty-fact TikTok lines stay in this container. |

---

## Social – Reddit

Entry: `socialRedditAdapter.ts` → same shared builder. Key `social-reddit`.

| Field | Record |
|---|---|
| **inputs** | Same fact `SOCIAL_PACING_FACT`. Warehouse CHANNEL `Social - Reddit`; app `channel === "reddit"` (`partitionRedditDeliveryLines.ts:23`, `socialAdapterShared.ts:375–377`). Classifier `reddit`. `line_item_id` direct. `LINE_ITEM_LABEL_MAP` at social refresh. No partner map. No `delivery_source_map`. **Live vs remainder:** `partitionRedditDeliveryLines` keeps a line here only when a reddit fact row exists for that id; otherwise it is appended to plan-only (`CampaignDeliverySection.tsx:186–189,358–360`; `partitionRedditDeliveryLines.ts:17–35`). |
| **spend mode** | Actual `AMOUNT_SPENT`. |
| **deliverable** | Same `mapDeliverableMetric` as Meta/TikTok. |
| **KPI tiles** | Same five. **Video extras always on** (`platform === "reddit"` short-circuit, `socialAdapterShared.ts:411,468`) even when buy_type is not video. |
| **status ladder** | Identical to Meta. |
| **does not fit** | Fact-presence gate into Awaiting delivery (`partitionRedditDeliveryLines.ts:17–35`). Always-on video tiles (`socialAdapterShared.ts:411`). |

---

## Search

Entry: `searchAdapter.ts` `buildSearchSection`. Key `search`.

| Field | Record |
|---|---|
| **inputs** | Fact: `MART.SEARCH_PACING_FACT` via search half of `/api/pacing/bulk` (`search-pacing-service.ts:169–184`). Warehouse CHANNEL values exist (`Search - Google Ads`, `Shopping - Google Ads`, `PMax - Google Ads` in `vw_pacing_google_search_daily.sql:79,142,168`) but the adapter **does not filter CHANNEL**. Match: `LOWER(LINE_ITEM_ID) IN (…)` **OR** `LOWER(LINE_ITEM_NAME) IN (…)` (`search-pacing-service.ts:162–166`). No `LINE_ITEM_LABEL_MAP` in the search reader. No `PARTNER_LINE_MAP`. No `delivery_source_map`. Gated by `mpSearchEnabled` + ids (`CampaignDeliverySection.tsx:607–609`). |
| **spend mode** | Actual platform spend. Condition: always `SUM(AMOUNT_SPENT) AS COST` (`search-pacing-service.ts:174`). |
| **deliverable** | Always **clicks** (`SUM(CLICKS)`). Card title uses `aggregateDeliverableLabel` / `deliverableLabelForBuyType` (`searchAdapter.ts:213–217,536`) so the noun can say Impressions/Clicks while the number is still clicks. |
| **KPI tiles** | CPC (`cost/clicks` vs burst expected CPC), CTR (`clicks/impr` vs `campaign_kpi.ctr`), Conversions (`CONVERSIONS` vs CVR×clicks or expected), Top Impression Share (`TOP_IMPRESSION_PERCENTAGE` weighted; **expected hardcoded 50%**, `searchAdapter.ts:225,288–295,465–466`), Impressions (vs clicksExpected/CTR). Revenue is on the fact payload; no revenue tile is mounted. |
| **status ladder** | Spend: `deliveryStatusFromPct(budgetPacingPct)` — cost ÷ expected-to-date from bursts. Aggregate deliverable: `deliveryStatusFromPct(clicksPacingPct)` (`searchAdapter.ts:175,221`). **Per-line deliverable** uses `searchOnTrackStatus` against a target curve (`searchAdapter.ts:497`), not `deliveryStatusFromPct`. Rate tiles: `compareCpcStatus` / `compareHigherIsBetter` ±8% (`:76–92`). |
| **does not fit** | `LINE_ITEM_NAME` OR-match (`search-pacing-service.ts:162–166`). Hardcoded 50% impression-share target (`searchAdapter.ts:291–292`). Per-line deliverable status from target curve (`:497`). Deliverable units always clicks while the title follows buy type (`:213–217,536–538`). CHANNEL unused. |

---

## Programmatic DV360 (dsp)

Entry: `programmaticDisplayAdapter.ts` / `programmaticVideoAdapter.ts` → `buildProgrammaticChannelSection`. Source row `delivery_source === "dsp"` (`deliverySourceMap.ts:25–30`: `dv360`, `youtube - dv360`, `youtube-dv360`, `taboola`, `native - taboola`, `native`). `derive_spend_from_plan` false on every dsp seed.

| Field | Record |
|---|---|
| **inputs** | Fact: `MART.PACING_FACT` (DV360 ∪ Taboola views). Warehouse CHANNEL `Programmatic - Display` or `Programmatic - Video`; app `programmatic-display` / `programmatic-video` (`pacing-service.ts:180–182`). Membership: active `delivery_source_map` on `(publisher \|\| platform)` (`programmaticCompute.ts:115–136`; unmapped go to plan-only, `CampaignDeliverySection.tsx:513–525`). Fact↔line: `line_item_id` lowercased (`mapCombinedRowToDv360` `matchedPostfix`, `programmaticCompute.ts:321,517–519`). Accepted channels: `snowflakeChannelsForDeliverySource("dsp", container)` → the container only (`deliverySourceMap.ts:95`). Warehouse `LINE_ITEM_LABEL_MAP` on `TSK_REFRESH_PACING_FACT` (`tsk_refresh_pacing_fact.sql:91–94`). No `PARTNER_LINE_MAP` for dsp. |
| **spend mode** | (1) Actual `AMOUNT_SPENT` when not `fixedCostMedia` and not `derive_spend_from_plan` (`programmaticCompute.ts:569–598`). (2) `REPORTED_SPEND` overlay when `fixedCostMedia` — wins and clears modelled (`:572–578`). Dsp seed is never modelled. |
| **deliverable** | Display: `mapDeliverableMetric({ channel: "programmatic", buyType, platform })` → `impressions` / `clicks` / `conversions` (RESULTS) / `videoViews` (`programmaticCompute.ts:407–425`). Video container uses the same map (typically `videoViews` ← `VIDEO_3S_VIEWS` ← `VIDEO_3S_VIEWS` fact). Fact columns: `IMPRESSIONS`, `CLICKS`, `RESULTS`, `VIDEO_3S_VIEWS`. |
| **KPI tiles** | Display: CPM, CTR, CPC, CPA (`programmaticAdapterShared.ts:374–389`). Video: CPM, View rate, CPV, CTR (`:342–371`). View rate/CPV use `0` not `null` when denom is 0 (`programmaticCompute.ts:354–355`). |
| **status ladder** | Spend and deliverable cards: `deliveryStatusFromPct` on each pacingPct (`programmaticAdapterShared.ts:548,559,644,655`). KPI tiles: `compareRateStatus` ±8%. |
| **does not fit** | Display vs video is a **container** (`snowflakeChannel`), not the map row — one dsp source feeds two profiles (`programmaticDisplayAdapter.ts:30–31`, `programmaticVideoAdapter.ts:30–31`). Video chart is Spend + Views; display is Spend + Impressions (`programmaticAdapterShared.ts:609–675`). Connection pill can read `DV360 + Taboola connected` (`:117–129`). `fixedCostMedia` on a dsp line still overlays reported spend. No placement table on dsp (`cm360PlacementBreakdown` requires `source === "cm360"`, `:215–216`). Mixed-deliverable roll-up is computed then hidden (`shouldShowChannelAggregate.ts:40–45`). |

---

## Programmatic CM360

Same programmatic adapters. Source `delivery_source === "cm360"` (`deliverySourceMap.ts:31–32,40–46`: `quantcast`, `quantcast - direct`, `twitch`). `derive_spend_from_plan` **true** on those seeds.

| Field | Record |
|---|---|
| **inputs** | Fact: `MART.PACING_FACT` from `VW_PACING_CM360`. Warehouse CHANNEL `Ad Serving - CM360`; app `ad-serving` (`pacing-service.ts:183`). Map consult required (`normalizeProgrammaticLineItems`). Accepted set is **only** `ad-serving` (`deliverySourceMap.ts:94`), not the display/video container name. `line_item_id` direct after `LINE_ITEM_LABEL_MAP` at PACING_FACT refresh. No `PARTNER_LINE_MAP`. |
| **spend mode** | (1) Modelled from plan rate when `derive_spend_from_plan === true` and not `fixedCostMedia` (`programmaticCompute.ts:570,579–598`; `deriveSpendFromPlanRate.ts:107–118`). Units: CPM→impressions, CPC/CPA/CPL→clicks, CPV→results, else impressions + warning. Capped at planned media. Label `Delivered spend (modelled from plan rate)` (`programmaticAdapterShared.ts:44–46,506–507`). (2) `REPORTED_SPEND` if `fixedCostMedia` (overrides modelled, `:572–578`). (3) Else actual `AMOUNT_SPENT` (CM360 spend is typically 0). |
| **deliverable** | Same `mapDeliverableMetric` as dsp, still on the **container** (display vs video). Reads CM360 `IMPRESSIONS` / `CLICKS` / `RESULTS` / `VIDEO_3S_VIEWS`. Deliverable pacing is not capped when spend is modelled (`deriveSpendFromPlanRate.ts:5–6`). |
| **KPI tiles** | Same display/video sets as dsp. Placement `EntityBreakdownTable` `columns: "delivery"` from **original** `combinedRows` (mapped Dv360 rows drop `entityId`) (`programmaticAdapterShared.ts:208–231,627–632`). Placement spend is not modelled. |
| **status ladder** | Same `deliveryStatusFromPct` on spend (modelled or reported or actual) and deliverable. |
| **does not fit** | Snowflake channel is `ad-serving` while the UI container is still Programmatic Display/Video (`deliverySourceMap.ts:94`; `programmaticAdapterShared.ts:197–204`). Placement table only on this source (`:215–216`). Modelled spend labelled only when **every** line in the roll-up is modelled (`:502–507`). Twitch is prog-video + this source, not Direct Booked Digital. |

---

## Programmatic partner file

Same programmatic adapters plus `programmaticOohAdapter.ts`. Source `delivery_source === "partner_file"` (`deliverySourceMap.ts:33–60`: `channel factory`, `vistar`, `broadsign`). `derive_spend_from_plan` false.

| Field | Record |
|---|---|
| **inputs** | Fact: `MART.PACING_FACT` from `VW_PACING_PARTNER_FILE` (Channel Factory) or `VW_PACING_PARTNER_OOH` (Vistar/Broadsign). Channel Factory: container CHANNEL (`Programmatic - Display` / `Video`) via `snowflakeChannelsForDeliverySource("partner_file", dspChannel, lineFamily)` (`deliverySourceMap.ts:96–104`). Prog OOH: warehouse `Programmatic - OOH`; app `programmatic-ooh` (`:101–102`; `partitionProgOohDeliveryLines.ts:22–25`). Warehouse `PARTNER_LINE_MAP` resolves partner campaign → `AV_LINE_ITEM_ID` in those views (not in the adapter). `LINE_ITEM_LABEL_MAP` still runs on PACING_FACT refresh. Adapter match is `line_item_id` direct. Map consult required. **OOH live vs remainder:** mapped `prog_ooh` with no `programmatic-ooh` rows go to plan-only (`CampaignDeliverySection.tsx:264–270,358`; `partitionProgOohDeliveryLines.ts:12–35`). |
| **spend mode** | (1) `REPORTED_SPEND` when `fixedCostMedia` (`programmaticCompute.ts:569–578`) — Channel Factory / Vistar platform cost is 0; label `Reported spend (fixed cost)` (`programmaticAdapterShared.ts:47,508–509`). (2) Else actual `AMOUNT_SPENT` (Vistar Revenue on OOH). Never modelled on this source (seed flag false). |
| **deliverable** | Channel Factory display/video: `mapDeliverableMetric` as dsp. **OOH forced `impressions`** regardless of buy type (`programmaticCompute.ts:412–413`). KPI Plays reads `RESULTS` (`summarizeDv360Actuals` `conversions`, `programmaticAdapterShared.ts:323–338`). Fact: OOH `IMPRESSIONS` + `RESULTS` (plays). |
| **KPI tiles** | Display/video: same as dsp. OOH: CPM, Plays, Cost per play only — no CTR/CPC/CVR/CPA (`programmaticAdapterShared.ts:323–339`). OOH chips: Planned, Impressions, Plays, spend title, Pacing (`:520–527`). Chart: Spend + Impressions (C-128) (`:667–675`). |
| **status ladder** | Same `deliveryStatusFromPct` on spend and (impressions) deliverable. `curveMetric: "plays"` is passed (`programmaticOohAdapter.ts:32`) but the progress card unit is impressions. |
| **does not fit** | `partner_file` Snowflake channel depends on **line family** (`deliverySourceMap.ts:96–104`). OOH fact-presence partition (`partitionProgOohDeliveryLines.ts:16–35`). OOH deliverable ≠ plays KPI ≠ `curveMetric`. Connection pills name Channel Factory / Vistar / Broadsign (`programmaticAdapterShared.ts:138–145`). |

---

## Direct digital

Entries: `digitalDisplayAdapter.ts`, `digitalVideoAdapter.ts`, `digitalAudioAdapter.ts` → `buildDirectDigitalChannelSection`. Keys `digital-display` / `digital-video` / `digital-audio`. Plan containers `digi_display` / `digi_video` / `digi_audio`.

| Field | Record |
|---|---|
| **inputs** | Fact: `MART.PACING_FACT` CM360. Warehouse CHANNEL `Ad Serving - CM360`; app `channel === "ad-serving"` (`directDigitalAdapterShared.ts:310–314`). Partitioned by **plan container**, not warehouse channel. Match: `line_item_id` lowercased against `idSet`. `LINE_ITEM_LABEL_MAP` at PACING_FACT refresh. No `PARTNER_LINE_MAP`. **`delivery_source_map` is not consulted** (`derive_spend_from_plan` is OFF for all Direct Booked Digital). No CM360 rows → adapter returns `null` (block hidden); lines do **not** move to plan-only (`:315–316,372–374`). `filterRange` is voided (`:302–303`). |
| **spend mode** | Zero-$ by default (ZERO-$ LAW). Condition for overlay: `fixedCostMedia === true` **and** `reportedSpendByLineDate` has entries for the id (`:356–368,485–500`) → `FIXED_COST_REPORTED_DAILY_FACT.REPORTED_SPEND` via Direct `queryDailyFacts`. Never modelled. |
| **deliverable** | Two booked totals, not one: CPM/default → planned impressions; `cpc`/`cpa`/`cpl` → planned clicks (`directDigitalAdapterShared.ts:168–178`). Actuals: `IMPRESSIONS`, `CLICKS`. Video completes: `VIDEO_3S_VIEWS`. Results: `RESULTS`. |
| **KPI tiles** | Verification set: Served impressions, Clicks, CTR (`clicks/impr`; target only if every line shares one `campaign_kpi.ctr`), Video completes, Completion rate **iff** rollup `videoCompletes > 0`, Results (`:416–456`). Band title `Verification KPIs`. |
| **status ladder** | No spend pacing unless overlay. Impressions/clicks cards: `deliveryStatusFromPct(actual/planned×100)` or `no-data` when planned is 0 (`:206–229`). Overlay spend uses the same helper vs booked media (`:232–256`). CTR tile uses `deliveryStatusFromPct(ctr/target×100)` (`:431–434`), not ±8% `compareRateStatus`. |
| **does not fit** | Progress pair **swaps**: overlay → `[Reported spend, Impressions]`; else `[Impressions, Clicks]` (`:501–503,547`). Chart right axis from rollup `videoCompletes > 0`, not `ChannelKey` (`:395–401`). Hide-if-no-rows (`:315–316`). `filterRange` unused (`:302–303`). Placement table `columns: "delivery"` (`:599–607`). Display/video/audio share one tile set. |

---

## BVOD

Entry: `bvodAdapter.ts` → **same** `buildDirectDigitalChannelSection`. Key `bvod`. Plan aliases `bvod` / `digiBvod` / `digi_bvod`.

| Field | Record |
|---|---|
| **inputs** | Identical to Direct digital: `PACING_FACT` `Ad Serving - CM360` / `ad-serving`, `line_item_id` direct, `LINE_ITEM_LABEL_MAP` at refresh, no map consult, hide if no rows. Only `key`/`title` differ (`bvodAdapter.ts:20–24`). |
| **spend mode** | Same zero-$ / `fixedCostMedia` `REPORTED_SPEND` overlay. |
| **deliverable** | Same impressions-vs-clicks booked split. Completes still `VIDEO_3S_VIEWS`. |
| **KPI tiles** | Same verification set as Direct digital (no BVOD-only tiles). Completion rate appears only when completes > 0. |
| **status ladder** | Same as Direct digital. |
| **does not fit** | ChannelKey `bvod` exists and is coverage/glance-distinct, but the adapter does not specialise tiles, deliverable, or chart (`bvodAdapter.ts:20–24`). Everything in the Direct digital “does not fit” row applies. |

---

## Plan-only remainder (Awaiting delivery)

Entry: `planOnlyAdapter.ts` `buildPlanOnlyRemainderSection`. Key `plan-only`.

| Field | Record |
|---|---|
| **inputs** | **No fact.** Members: unclassified social (`classifySocialPacingPlatform` → null, `CampaignDeliverySection.tsx:498–509`); programmatic with no active map row (`:513–525`); Reddit classified-but-no-rows (`:186–189,358`); mapped prog OOH with no OOH rows (`:264–270,358`). No CHANNEL filter. No `LINE_ITEM_LABEL_MAP` / `PARTNER_LINE_MAP` at this layer. |
| **spend mode** | None. Shows planned budget from bursts (`budget_number` / `media_investment` / `buy_amount_number` / `mediaAmount`, else `total_budget`) (`planOnlyAdapter.ts:14–37`). Never invents delivery. |
| **deliverable** | None. Second card is `Delivery` / `—` / `No delivery data yet` (`:40–48,84–87`). |
| **KPI tiles** | Empty `tiles: []` (`:88,109`). |
| **status ladder** | Both cards `status: "no-data"`, `progress: 0`, `variance: 0` (`:40–48`). No pacingPct. |
| **does not fit** | Not a source: it is the leftover bucket. No fact, no spend mode, no profile. Aggregate is computed then usually hidden when lines exist (`shouldShowChannelAggregate.ts:40–45`). |

---

## Proposed metric profiles

Each profile is the tile set + deliverable the current adapters already emit. Spend mode is **not** part of the profile (it is a source-row field).

### video

**Used by:** programmatic-video (dsp/cm360/partner_file); social lines whose buy_type matches `/\bvideo\b/i`; Reddit (always).

| Surface | Implied |
|---|---|
| Deliverable | `VIDEO_3S_VIEWS` → `videoViews` / `video_3s_views` |
| Progress cards | Spend (source spend-mode) + Views |
| KPI tiles | CPM, View rate (`views/impr`), CPV (`spend/views`), CTR |
| Chart | Spend + Views on programmatic-video; social still charts Spend + Impressions |

### display

**Used by:** programmatic-display (all three sources).

| Surface | Implied |
|---|---|
| Deliverable | `mapDeliverableMetric` (IMPRESSIONS default; CLICKS on CPC; RESULTS on CPA) |
| Progress cards | Spend + that deliverable |
| KPI tiles | CPM, CTR, CPC, CPA |
| Chart | Spend + Impressions |

### social

**Used by:** social-meta, social-tiktok, social-reddit.

| Surface | Implied |
|---|---|
| Deliverable | `mapDeliverableMetric({ channel: "social" })` |
| Progress cards | Spend (always actual) + that deliverable |
| KPI tiles | CPM, CTR, CPC, CVR (`results/impr`), CPA (`spend/results`); plus video extras when the video rule fires |
| Chart | Spend + Impressions |
| Entity | Meta ad sets / TikTok+Reddit ad groups, `columns: "spend"` |

### search

**Used by:** search.

| Surface | Implied |
|---|---|
| Deliverable | Clicks (`SEARCH_PACING_FACT.CLICKS`) |
| Progress cards | Spend + Clicks |
| KPI tiles | CPC, CTR, Conversions, Top Impression Share, Impressions |
| Chart | Cost + Clicks |
| Entity | Ad groups, `columns: "spend"` |

### ooh

**Used by:** programmatic-ooh (partner_file Vistar/Broadsign).

| Surface | Implied |
|---|---|
| Deliverable | Impressions (forced) |
| Progress cards | Spend + Impressions |
| KPI tiles | CPM, Plays (`RESULTS`), Cost per play |
| Chart | Spend + Impressions |
| Chips | Planned, Impressions, Plays, spend title, Pacing |

### bvod

**Used by:** intended for `bvod` (and today also digital-display / digital-video / digital-audio, because they share the adapter).

| Surface | Implied |
|---|---|
| Deliverable | Impressions (CPM/default) and/or Clicks (CPC/CPA/CPL) on **separate** cards |
| Progress cards | `[Impressions, Clicks]` or `[Reported spend, Impressions]` if overlay |
| KPI tiles | Served impressions, Clicks, CTR, Video completes, Completion rate (if completes > 0), Results |
| Chart | Impressions + (completion rate if completes > 0 else clicks) |
| Entity | Placements, `columns: "delivery"` |

---

## Adapter behaviours that fit no profile

A generic registry row is `fact + channel + spend mode + metric profile`. The following need extra fields or stay exceptions. No recommendations.

1. Reddit live/awaiting split: classified Reddit with no `SOCIAL_PACING_FACT` reddit rows leaves the social-reddit container (`lib/delivery/social/partitionRedditDeliveryLines.ts:17–35`; `CampaignDeliverySection.tsx:186–189,358`).
2. Prog OOH live/awaiting split: mapped `partner_file` `prog_ooh` with no `programmatic-ooh` rows leaves the OOH container (`lib/delivery/programmatic/partitionProgOohDeliveryLines.ts:16–35`; `CampaignDeliverySection.tsx:264–270,358`).
3. Meta and TikTok keep no-fact lines in their containers; Reddit does not (`CampaignDeliverySection.tsx:150–185` vs `:186–189`).
4. Direct digital / BVOD hide the whole section when no `ad-serving` rows; those lines do not join plan-only (`directDigitalAdapterShared.ts:315–316,372–374`).
5. Plan-only is a leftover bucket with no fact, no spend mode, no tiles (`planOnlyAdapter.ts:51–113`; remainder assembly `CampaignDeliverySection.tsx:358–360`).
6. `partner_file` Snowflake channel is a function of line family (`prog_ooh` → `programmatic-ooh`, else the container) (`lib/delivery/deliverySourceMap.ts:96–104`).
7. Programmatic CM360 consumes `ad-serving` while the UI container stays Programmatic Display/Video (`deliverySourceMap.ts:94`; `programmaticAdapterShared.ts:197–204`).
8. `fixedCostMedia` overrides `derive_spend_from_plan` on the same line (`lib/delivery/programmatic/programmaticCompute.ts:572–578`).
9. Mixed spend modes in one programmatic container; spend title is all-modelled / all-reported / else default (`programmaticAdapterShared.ts:502–512`).
10. OOH deliverable is impressions, Plays KPI is `RESULTS`, and `curveMetric` is `"plays"` (`programmaticCompute.ts:412–413`; `programmaticAdapterShared.ts:323–338`; `programmaticOohAdapter.ts:32`).
11. Programmatic-video chart series is Views; social video lines still chart Impressions (`programmaticAdapterShared.ts:667–675`; `socialAdapterShared.ts:521–530`).
12. Social video tiles: Reddit always on; Meta/TikTok only when `/\bvideo\b/i` on buy_type (`socialAdapterShared.ts:76–78,411,468`).
13. Search matches `LINE_ITEM_ID` **or** `LINE_ITEM_NAME` (`lib/snowflake/search-pacing-service.ts:162–166`) and never filters CHANNEL.
14. Search deliverable units are always clicks while the card title uses buy-type noun (`searchAdapter.ts:213–217,536–538`).
15. Search Top Impression Share expected is hardcoded `50%` (`searchAdapter.ts:225,288–295,465–466`).
16. Search per-line deliverable status is `searchOnTrackStatus` (target curve), not `deliveryStatusFromPct` (`searchAdapter.ts:497`).
17. Direct digital progress-card pair swaps when `fixedCostMedia` overlay is present (`directDigitalAdapterShared.ts:501–503,547`).
18. Direct digital / BVOD chart right-axis is chosen from rollup `videoCompletes > 0`, not ChannelKey (`directDigitalAdapterShared.ts:395–401`).
19. Direct digital `filterRange` is unused (`directDigitalAdapterShared.ts:302–303`).
20. Direct digital CTR status uses `deliveryStatusFromPct(actual/target×100)`, not the ±8% rate helper (`directDigitalAdapterShared.ts:431–434`).
21. CM360 placement breakdown reads original `combinedRows` because `mapCombinedRowToDv360` drops `entityId` (`programmaticAdapterShared.ts:208–231,627–632`; `programmaticCompute.ts:303–322`).
22. Placement / ad-set / ad-group grain and `columns: "spend" | "delivery"` differ by source (`socialAdapterShared.ts:163–176`; `searchAdapter.ts:603–611`; `directDigitalAdapterShared.ts:599–607`).
23. Connection pill text is composed from platforms on the line (DV360+Taboola, `CM360 (Quantcast)`, partner-file names) (`programmaticAdapterShared.ts:117–170`).
24. Programmatic and plan-only compute an aggregate that presentation refuses when lines exist (`shouldShowChannelAggregate.ts:40–45`).
25. Social View rate / CPV and programmatic View rate / CPV emit `0` on a zero denominator; CPM/CTR/CPC/CPA emit `null` (`socialChannelCompute.ts:733–741`; `programmaticCompute.ts:349–355`).
26. BVOD is a distinct ChannelKey and coverage group but mounts the Direct digital tile set with no BVOD-specific metric (`bvodAdapter.ts:20–24`).
27. Warehouse `LINE_ITEM_LABEL_MAP` (PACING_FACT + SOCIAL_PACING_FACT refresh) and `PARTNER_LINE_MAP` (partner views) resolve ids before any adapter; no adapter repeats those joins (`tsk_refresh_pacing_fact.sql:91–94`; `tsk_refresh_social_pacing_fact.sql:46–48`).

Confirm-then-fix backlog (do not edit the 27 items above): `docs/superpowers/delivery-source-registry-backlog-2026-09-16.md`.
