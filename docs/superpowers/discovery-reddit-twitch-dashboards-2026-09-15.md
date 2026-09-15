# D4 — Adding Reddit and Twitch as dashboard platforms

Status: discovery  
Date: 2026-09-15  
Scope: read-only. No app code changed.  
Brain: `docs/brain/MAP.md` §1 (20 channels), §3 pacing, §4 client dashboards, §8 clients; `docs/brain/BLAST-RADIUS.md` “Adding a channel” vs “Splitting/renaming a delivery ChannelKey”; `docs/brain/modules/dashboards-charts-exports.md`; `docs/brain/INVARIANTS.md` programmatic `delivery_source_map`; `docs/brain/KNOWN-ISSUES.md` C-90.

Goal: map every registry a **platform** must join to appear on a client dashboard, reconstruct the last platform that actually shipped (Quantcast), say whether Reddit Ads / Twitch have a data source, and name the smallest cut that shows planned spend with delivery pending without breaking pacing.

This is **not** “add a 21st `line_channel`.” Reddit and Twitch sit inside existing containers. The ~12 BLAST-RADIUS maps are for a new **channel**. A platform has a different, overlapping list (§1).

---

## 1. The platform registry

Two different grains:

| Grain | What it is | Reddit / Twitch? |
|---|---|---|
| **Channel** (`line_channel`) | 20 media types. New one = BLAST-RADIUS ~12 maps + twins. | **Do not add.** |
| **Platform** | A buy surface inside a channel (`platform` / `publisher` on the line). | Reddit → **social**. Twitch → **prog video** (Amazon DSP), not digi_video, not social, not a new channel. |

Planner ids: Social `{mba}SM{n}` (`lineItemIds.ts:19`); Prog Video `{mba}PV{n}` (`:30`). Twitch MI library default container is Programmatic (`lib/specs/mi-library/twitch.json:3-4`). KPI best-practice keys already stamp Reddit as `socialMedia` (`scripts/data/kpi-best-practice/normalize-scale-report.json` ~9368).

### 1.1 Maps a **channel** needs (BLAST-RADIUS, not this task)

`BLAST-RADIUS.md:46`: `MEDIA_TYPE_ENDPOINTS/FLAGS/ALIASES`, `CHANNEL_LINE_ITEM_ENDPOINTS`, `MEDIA_PLANS_ALLOWLIST`, `MEDIA_PLAN_TABLES`, `LINE_ITEM_BROWSER_API_PATH`, `MEDIA_CONTAINER_ENDPOINTS`, `LINE_ITEM_SOURCE_TABLES`, `PUBLISH_INTEGRITY_CHANNEL_FLAGS`, `clearVersionChildren.SLUGS`, `reapUnpublishedStagedVersions.STAGED_CHILD_SLUGS`, `MEDIA_TYPE_LABELS/COLORS`, `MEDIA_TYPE_ID_CODES`, `CREATE_MEDIA_TYPE_CATALOG`, `MediaItems`, `CANONICAL_MEDIA_KEYS`, plus container/grid/schema and both mega-pages.

Skip all of that unless someone insists on `line_channel` `reddit` / `twitch`.

### 1.2 Maps a **platform** needs to show on a dashboard

Equivalent list. Star = required for **delivery** tiles/charts. Unstarred = account/config chrome.

| # | Map | File:line | Reddit | Twitch |
|---|---|---|---|---|
| 1 | Plan container + `platform` field | Social: `SOCIALMEDIA_CONTAINER_CONFIG` (`containerChannelConfig.ts:2080-2084`), publishers via `getPublishersForSocialMedia`. Prog video: same pattern, `fetchPublishers` for prog. `platform` is a string; paste of an unknown label is kept (`expertGridChannelConfig.ts:255-266`). | socialMedia already exists | progVideo already exists |
| 2 | Publisher catalogue `pub_socialmedia` / `pub_progvideo` | `publisherKpiMediaOptions.ts:21-26` | Row with `pub_socialmedia` so the combobox offers “Reddit” | Row with `pub_progvideo` (Twitch / Amazon Ads). Specs slug `twitch` already (`library.ts:136-137`, `0041_publisher_specs.sql:81`) |
| 3 | Social classifier **or** `delivery_source_map` | Social: `classifySocialPacingPlatform` (`resolveLiveSocialLineItems.ts:123-141`) — **meta \| tiktok only**. Duplicate in `CampaignDeliverySection.tsx:37-51`. Prog: `PROGRAMMATIC_DELIVERY_SOURCE_SEED` (`deliverySourceMap.ts:21-30`) | Unclassified social is **dropped** from pacing (`:213-221`) and from delivery (`:353-361`) | Unmapped prog is **dropped** from campaign delivery (`programmaticCompute.ts:113-134`). Pacing still includes the line vs `PACING_FACT` video (`resolveLiveProgrammaticLineItems.ts:53-56`) |
| 4 | Delivery `ChannelKey` + adapter | `types.ts:11-20`: `social-meta` \| `social-tiktok` \| `programmatic-display` \| `programmatic-video` \| four Direct Booked + search. BLAST-RADIUS `ChannelKey` split (`BLAST-RADIUS.md:70`) | Need a new key (e.g. `social-reddit`) **or** a generic pending bucket | Reuse `programmatic-video` **if** mapped |
| 5 | Campaign delivery wiring | `CampaignDeliverySection.tsx:190-224, :353-361` — Meta/TikTok/Display/Video only. No `progOoh`. | Invisible today | Invisible on delivery until mapped |
| 6 | Snapshot groups | `loadDeliverySnapshot.ts:218-240` — social split by classifier; progDisplay/progVideo only | Unclassified social never grouped | In `programmatic_video` group if the line is in progVideo — but dashboard adapters still filter map |
| 7 | Charts registry | `MEDIA_TYPE_REGISTRY` (`lib/charts/registry.ts:36-57`) is **channel** colour/label. No per-platform colour. Reddit inherits `social_media`; Twitch inherits `prog_video`. | No new registry key | No new registry key |
| 8 | `clients.id{platform}` | `db/schema/ported.ts` ~161–167: googleads, meta, cm360, dv360, tiktok, linkedin, pinterest, quantcast, taboola, snapchat, bing, vistar, ga4, merchantcentre, shopify. Writable (`writeClients.ts:63-77`). Forms (`AddClientForm.tsx:764-776`, `EditClientForm.tsx:264-270`). AVA (`summaries.ts:41-46`) | **No `idreddit`** | **No `idtwitch`** |
| 9 | `clientdashboard.id{platform}_dashboard` | Separate table `clientdashboard` (`ported.ts:86-106`): same platform set as (8), Datorama-era embed ids. **No app reader.** ETL only maps `Client_dashboard` → `client_dashboard` (`etl-xano-to-supabase.ts:55`) | No column | No column |
| 10 | Snowflake MART + refresh | Social: `VW_PACING_META` ← `FACEBOOK_ADS.*` (`vw_pacing_meta.sql:43-76`); `VW_PACING_TIKTOK`; MERGE both in `TSK_REFRESH_SOCIAL_PACING_FACT` (`tsk_refresh_social_pacing_fact.sql:10-21`). Prog: `VW_PACING_DV360` ← Fivetran DV360 (`vw_pacing_dv360.sql`); `TSK_REFRESH_PACING_FACT` (`tsk_refresh_pacing_fact.sql:10-27`). App: `queryPacingFact` (`pacing-fact.ts:27, :87-103`) exhaustive `meta` \| `tiktok` \| `programmatic-display` \| `programmatic-video` \| `ad-serving` | Nothing | Nothing (unless bought as DV360, then it already lands as display/video) |
| 11 | PacingStatus source | Ladder is global (`lib/pacing/maths`, BLAST-RADIUS `:39`). Source table: social → `SOCIAL_PACING_FACT`; prog → `PACING_FACT`. Unclassified social **never** calls `computePacing`. Mapped prog with zero facts → `no_delivery` → UI No data after ≥2 days (`maths/index.ts:153`, `status.ts:105-109`) | Safe if left unclassified | Safe zeros on video fact; do **not** add a `queryPacingFact` channel without a `case` (exhaustive `never`) |
| 12 | Naming family | `FAMILY_BY_CHANNEL.socialMedia = "meta"` (`naming/channelTabs.ts:75-87`). Prog video = `dv360` | Reddit names would look Meta unless a family is added | Twitch names would look DV360 — closer to Amazon DSP |
| 13 | Connection pill | `ConnectionPill` (`types.ts:26-30`); Quantcast = `CM360 (Quantcast)` | New pill | New pill or reuse DV360/Amazon |
| 14 | Specs / MI | Reddit: none in `lib/specs/mi-library/`. Twitch: full JSON, Amazon DSP notes (`twitch.json:1-11`) | Optional later | Already there |
| 15 | KPI | Per publisher + media type, not per platform enum. Reddit already appears in KPI best-practice dump as `socialMedia` | Config | Config |

`id{platform}` / `id{platform}_dashboard` do **not** gate dashboard rendering. LinkedIn, Pinterest, Snapchat, Vistar already have both column families and still have **no** delivery adapter. Those columns are client CRM / leftover Datorama ids, not the dashboard platform registry.

---

## 2. Template: last platform that actually shipped = Quantcast

Git: Pinterest / Snapchat / Vistar **columns** arrive with the Xano port (`312f0358` schema mirror; `7c3da382` initial commit; `idpinterest` in `0001_ported_tables.sql:146`). There is **no** Pinterest/Snapchat/Vistar delivery commit. Vistar is an empty client-id slot plus D3 partner-ingest notes.

The last **dashboard platform** is Quantcast (programmatic, CM360), 5 Sep 2026:

| Commit | What |
|---|---|
| `946149cb` `feat(delivery): replace the programmatic allowlist with delivery_source_map` | Replaces a hardcoded DSP Set with `delivery_source_map` + TS seed. Adds Quantcast keys `quantcast` and `quantcast - direct` as `cm360` + `derive_spend_from_plan: true`. |
| `5948f35d` `feat(delivery): model spend from plan rate for programmatic cm360 rows` | Spend for those rows from plan rate, not CM360 `$0`. |
| `151e80ae` `fix(dashboard): show CM360 placement clicks on Quantcast lines` | Placement table from original `combinedRows`. |

### Files `946149cb` touched (12)

```
components/dashboard/delivery/channels/__tests__/directDigitalChart.test.ts
components/dashboard/delivery/channels/__tests__/programmaticAdapter.deliverySourceMap.test.ts  (added)
components/dashboard/delivery/channels/programmaticAdapterShared.ts
db/README.md
db/drizzle/0000_baseline.sql
db/drizzle/meta/0000_snapshot.json
db/migrations/0063_delivery_source_map.sql  (added, AUTHOR ONLY)
db/schema/deliverySourceMap.ts  (added)
db/schema/index.ts
lib/delivery/deliverySourceMap.ts  (added)
lib/delivery/programmatic/__tests__/mapCombinedRowToDv360.test.ts
lib/delivery/programmatic/programmaticCompute.ts
```

### Files `5948f35d` touched

```
components/dashboard/delivery/shared/ProgressCard.tsx
lib/delivery/__tests__/deriveSpendFromPlanRate.test.ts
lib/delivery/deriveSpendFromPlanRate.ts
lib/pacing/overview/__tests__/mapOverviewItems.test.ts
package.json  (test script)
```

No new `line_channel`. No `clients.idquantcast` (column already existed). No MART view (CM360 already in `PACING_FACT` as ad-serving). Pattern: **keep the container, add a lookup key, keep unmapped lines off the campaign delivery surface.**

That is the template for Twitch-as-prog-video (map row) and **not** for Reddit (social needs a classifier + ChannelKey; Quantcast did not).

LinkedIn is the closer analog for Reddit: `idlinkedin` + `idlinkedin_dashboard` exist; `classifySocialPacingPlatform` ignores LinkedIn; lines vanish from pacing and delivery the same way Reddit would today.

---

## 3. Data source

Searched repo, `sql/snowflake/mart/**`, partner-ingest, Datorama fixtures.

| | Reddit Ads | Twitch (Amazon DSP / Twitch Ads) |
|---|---|---|
| App / lib | Learning link only (`src/data/learning/resources.ts:50`). KPI dump keys `Reddit\0socialMedia\0…`. | MI library + `publisher_specs` slug `twitch` / alias `amazon ads`. Deadline seed lists twitch as prose-only (`0046_publisher_specs_deadline_seed.sql:19`). |
| Snowflake MART / Fivetran | **Nothing.** Social views are Meta (`FACEBOOK_ADS`) and TikTok only. | **Nothing named Twitch.** DV360 Fivetran can already carry Amazon/Twitch **if** the buy is trafficked in DV360 and the line id matches. |
| Datorama / partner-ingest | **Nothing.** Parser is Channel Factory columns only. | **Nothing.** |
| `clients` / `clientdashboard` | No columns | No columns |

**There is no connector in this repo.** A delivery feed is a Luke decision:

1. **Datorama** (or similar) export into `snowflake@assembledview.com.au` / partner-ingest — needs a new parser (D3).  
2. **Direct API / Fivetran** — new RAW schema + MART view + refresh task + `queryPacingFact` case. Highest cost, real spend.  
3. **Manual / partner-ingest upload** — same as (1) without a vendor connector.  
4. **Plan-only** — no feed; dashboards show planned media and “No delivery reported yet.”

Costs and vendor choice are out of this discovery; put (1)–(4) to Luke.

---

## 4. Client dashboards: what exists, what plan-only can fill

Surfaces a client actually sees (not `/pacing`):

| Surface | Today | From plan only (no Reddit/Twitch feed) |
|---|---|---|
| Client hub tiles | Planned to date + Plan committed from `schedule_months` (`plannedSpendConsistency.ts`). Delivered from Snowflake (`HeroKPIBar.tsx:35-38`, `hasReportedDeliveredSpend`). Empty copy **“No delivery reported yet”**, never $0. | Planned tiles **yes** — Reddit/Twitch dollars roll into **Social** / **Prog Video** slices, not a Reddit/Twitch slice. Delivered tile unchanged unless other channels deliver. |
| Spend donuts / stack | Planned media by **channel** from delivery-schedule months (`spendInsightsCaptions.ts`, `normalizeDeliveryEntryMediaBreakdown`). | **Yes**, same roll-up. No platform breakdown. |
| Campaign Budget & Spend | Budget + expected from monthly plan; Delivered + Remaining only when `hasDelivery` (`CampaignSummaryRow.tsx:75-80, :108`). | Budget / expected **yes**. Delivered caption **“No delivery reported yet”** / **“Campaign not started”** if no other digital facts. |
| Media-mix donut | One donut from delivery schedule (`mediaMixFromDeliverySchedule.ts:1-12`). | **Yes**, Social / Prog Video wedges. |
| Gantt / plan viz | Plan lines by container. | **Yes** if the line is saved on social / prog video. |
| Delivery accordion (tiles, daily charts, spend vs delivered) | Nine containers: Meta, TikTok, Search, Prog Display, Prog Video, four Direct Booked (`dashboards-charts-exports.md:12-14`). Connection pills name the live source. | **No** for unclassified/unmapped lines. They are omitted, not shown as pending. |
| Home media-type pills | Registry labels (`campaignMediaTypeTagLabels`). | **Yes** — Social / Prog Video chips if those containers have lines. |

There is no existing string “delivery pending”. Closest copy is **“No delivery reported yet”** at campaign/hub grain, not per platform.

---

## 5. Minimal first cut

Goal: planner adds a Reddit or Twitch line; client dashboard shows **planned spend**; delivery reads as pending; pacing does not 5xx or mis-attribute.

**Already true with zero code** (if a publisher row exists or the planner types the platform):

- Save on `socialMedia` / `progVideo`.
- Mix donut, hub planned tiles, campaign expected spend, gantt.
- Reddit: pacing **drops** the row (`resolveLiveSocialLineItems.ts:213-221`) — other Meta/TikTok rows unchanged.  
- Twitch on prog video: pacing **includes** the line and hydrates `PACING_FACT` programmatic-video (`fetchProgrammaticPacingCampaignRows.ts:110-128`). No matching facts → zeros / No data. Other DV360 lines join on their own `line_item_id`s.

**Not true today:** a line-level “pending” block on campaign delivery. Unclassified/unmapped lines are invisible there.

### Smallest code change (plan-only pending)

Do **not** add `line_channel`, MART, Fivetran, `idreddit`, or `queryPacingFact` cases (exhaustive union would fail compile or silently LIKE-match).

Files, in order:

1. **Decide container in the plan** (ops, not a PR): Reddit = Social, platform `Reddit`. Twitch = Prog Video, platform `Twitch` or `Amazon Ads` (match `delivery_source_map` keys exactly, lowercased).
2. **Publisher catalogue** (admin): Reddit `pub_socialmedia`; Twitch/Amazon `pub_progvideo`. Combobox only.
3. `lib/pacing/social/resolveLiveSocialLineItems.ts` — keep Reddit **unclassified** (continue to `return null`) so social pacing does not invent Meta/TikTok facts. Optional `console.warn` already fires.
4. `components/dashboard/delivery/CampaignDeliverySection.tsx` — remainder bucket: social lines with `classify === null` → a plan-only section (title e.g. Social – other, chips from bursts, **no** `/api/pacing/bulk` ids, caption reused from `CampaignSummaryRow`: “No delivery reported yet”). Duplicate classify lives here (`:37-51`); change both or extract once.
5. `components/dashboard/delivery/channels/types.ts` — new `ChannelKey` (e.g. `social-other`) **or** overload an existing adapter with `connections: []`. Then BLAST-RADIUS ChannelKey list: `getChannelIcon`, `channelMediaTypeColour`, `shouldShowChannelAggregate`, `CampaignPageAssembly` / `DeliveryDataProvider` only if new ids are fetched (they should not be).
6. Twitch visibility on **Programmatic – Video**: `lib/delivery/deliverySourceMap.ts` seed keys (`twitch`, `amazon ads`, `amazon dsp` — confirm live `platform` strings first). `delivery_source: "dsp"`, `derive_spend_from_plan: false` (no spend to model). Mirror in `0063` when applied. That **keeps** the line in `normalizeProgrammaticLineItems`; daily actuals stay 0; spend card is empty/No data — that is pending. Do **not** set `partner_file` (`snowflakeChannelsForDeliverySource` returns `∅`, `deliverySourceMap.ts:58-65`).
7. Tests: `programmaticAdapter.deliverySourceMap.test.ts` (Twitch kept, zeros); social remainder not classified as meta; `shouldShowChannelAggregate` for the new key.
8. Brain: `BLAST-RADIUS.md` ChannelKey row + `dashboards-charts-exports.md` one line that unmapped social can render plan-only. Same commit if this ships.

**Explicitly out of the first cut:** MART views, refresh tasks, `PacingStatus` warehouse order, charts registry keys, `clients.idreddit` / `idtwitch`, `clientdashboard.*`, naming family, partner-ingest, AVA tool list.

**Do not** classify Reddit as Meta or Twitch as DV360 in the social/DV360 LIKE clauses — that would steal or hide the wrong facts.

---

## 6. Anything below 90%

| Item | Confidence | Why |
|---|---|---|
| Live `clients.platform` / publisher strings planners would type | ~70% | Combobox is catalogue-driven; paste keeps unknown text. Need a real plan row. |
| Whether any Twitch buy already lands in DV360 `PACING_FACT` | ~60% | Possible if trafficked in DV360; no repo evidence. |
| `clientdashboard.id*_dashboard` purpose | ~80% Datorama embeds | No reader in app; Xano port columns. Could be unused. |
| Exact Quantcast “series” vs later modelled-spend commit | ~95% those three commits are the dashboard platform add | Same morning, 5 Sep 2026. |
| Hub donut grouping label for social (`Social` vs `socialMedia`) | ~85% | Parser emits schedule media-type strings; aliases exist in the charts registry. |
| Whether a plan-only delivery section is acceptable UX vs waiting for a feed | product, not code | Luke. |
| Reddit Ads API / Amazon DSP / Datorama connector cost | not in repo | Decision list in §3. |

≥90%: they are platforms inside Social / Prog Video; Quantcast is the delivery-platform template; no Snowflake/Datorama feed exists; planned money already rolls up by channel; campaign delivery hides them until classifier/map; first cut is a remainder section + optional `delivery_source_map` keys, not a 21st channel.
