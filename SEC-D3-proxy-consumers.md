# SEC-D3 — Catch-all Xano proxy consumer map

**Branch:** localhost  
**Date:** 2026-07-09  
**Scope:** `app/api/media_plans/[...path]/route.ts` and `app/api/media-details/[...path]/route.ts`

---

## Search methodology

Searched the repo excluding `node_modules` and `.next` using:

| Pattern | Purpose |
|---------|---------|
| `"/api/media_plans/"` | Literal browser path prefix |
| `` `/api/media_plans/${` `` | Template-literal dynamic segments |
| `"/api/media-details/"` | Literal media-details prefix |
| `` `/api/media-details/${` `` | Template-literal media-details |
| `MEDIA_PLANS_BASE_URL` | Browser alias `"/api/media_plans"` → indirect catch-all traffic via `` `${MEDIA_PLANS_BASE_URL}/<xano-path>` `` |
| `MEDIA_DETAILS_BASE_URL` | Browser alias `"/api/media-details"` → indirect catch-all traffic |

**PowerShell:** `Get-ChildItem -Recurse -Include *.ts,*.tsx | Where-Object { $_.FullName -notmatch 'node_modules|\.next' } | Select-String -Pattern '<pattern>'`

**Confidence:** **92%** for application-code consumers. All literal and template-literal hits in `*.ts` / `*.tsx` are accounted for below. The remaining 8% reflects: (1) runtime-constructed URLs outside these patterns (none found in app code, but not provably impossible); (2) manual browser DevTools calls; (3) markdown/audit docs excluded from consumer tables.

**Indirect pattern note:** In `lib/api.ts`, `MEDIA_PLANS_BASE_URL` and `MEDIA_DETAILS_BASE_URL` resolve to `/api/media_plans` and `/api/media-details` in the browser (`isBrowser === true`). Dozens of `` fetch(`${MEDIA_*_BASE_URL}/…`) `` calls therefore hit the catch-alls without containing the literal string `/api/media_plans/` or `/api/media-details/`. Those are enumerated in the catch-all sections below.

---

## Dedicated route inventory

### `app/api/media_plans/`

| File | Methods | First URL segment(s) |
|------|---------|-------------------|
| `route.ts` | GET | *(none — `/api/media_plans`)* |
| `cinema/route.ts` | GET, POST | `cinema` |
| `digi-bvod/route.ts` | GET, POST | `digi-bvod` |
| `influencers/route.ts` | GET, POST | `influencers` |
| `integration/route.ts` | GET, POST | `integration` |
| `newspaper/route.ts` | GET, POST | `newspaper` |
| `production/route.ts` | GET, POST | `production` |
| `prog-display/route.ts` | GET | `prog-display` |
| `prog-ooh/route.ts` | GET | `prog-ooh` |
| `prog-video/route.ts` | GET, POST | `prog-video` |
| `search/route.ts` | GET, POST | `search` |
| `social/route.ts` | GET, POST | `social` |
| `television/route.ts` | GET, POST | `television` |
| `television/[id]/route.ts` | PUT, DELETE | `television/<id>` |
| `[...path]/route.ts` | GET, POST, PUT, DELETE | **catch-all** — any other segment |

### `app/api/media-details/`

| File | Methods | First URL segment(s) |
|------|---------|-------------------|
| `[...path]/route.ts` | GET, POST, PUT, PATCH, DELETE | **catch-all only** |

Any path not matching a dedicated first segment above is served by the corresponding `[...path]` handler.

---

## Git history — proxy vs dedicated routes

### `app/api/media_plans/[...path]/route.ts`

| Commit | Date | Message |
|--------|------|---------|
| `941a1d9` | 2026-06-11 | fix(mediaplans): stop returning raw upstream payloads in route errors |
| `d62a3c3` | 2026-05-22 | feat(domain-4): dashboard, billing, mediaplan UX, and API version forwarding |
| `4dabeef` | 2026-02-06 | feat: add pacing workspace and expand plan APIs |
| `d2c4174` | 2026-01-20 | release: v1.3 |

### `app/api/media-details/[...path]/route.ts`

| Commit | Date | Message |
|--------|------|---------|
| `4dabeef` | 2026-02-06 | feat: add pacing workspace and expand plan APIs |
| `9cc62d4` | 2026-01-21 | feat: add bulk pacing endpoint and perf logging |
| `d2c4174` | 2026-01-20 | release: v1.3 |

### Comparison — dedicated `television` route (example)

| Commit | Date | Message |
|--------|------|---------|
| `941a1d9` | 2026-06-11 | fix(mediaplans): stop returning raw upstream payloads in route errors |
| `ecd9ec0` | 2026-05-21 | refactor(api): forward version_number to Xano in traditional media routes |
| `9cc62d4` | 2026-01-21 | feat: add bulk pacing endpoint and perf logging |
| `d2c4174` | 2026-01-20 | release: v1.3 |
| `3493b7f` | 2025-12-15 | Release v1.1 updates across dashboard and media plan flows. |

**Timeline:** Per-channel dedicated routes (e.g. `television`) predate the catch-all proxy (Dec 2025 vs Jan 2026). The catch-all was introduced in **v1.3** (`d2c4174`) and remains the fallback for Xano table-name paths that do not match a dedicated segment. Browser save flows still POST to Xano table names (`media_plan_television`, etc.) and therefore use the catch-all even where a dedicated GET route exists (`television`).

---

## Proxy 1: `/api/media_plans/[...path]`

### A. Catch-all consumers (segment does **not** match a dedicated route)

#### Table — consumers per catch-all usage

| # | File | Line | Quoted line (abridged) | Built request | Calling context | Surface |
|---|------|------|------------------------|---------------|-----------------|--------|
| 1 | `lib/api.ts` | 1868 | `` const url = `/api/media_plans/${pathSegment}?${params.toString()}` `` | **GET** — see pathSegment table below; query: `mba_number`, `media_plan_version`, `mp_plannumber`, `version_number` | `fetchLineItemsFromApi` ← `get*LineItemsByMBA` (browser branch) ← `app/mediaplans/mba/[mba_number]/edit/page.tsx` line-item load phase | Staff-only (clients redirected from `/mediaplans/*` by middleware) |
| 2 | `lib/mediaplan/clearVersionChildren.ts` | 122 | `` fetcher(`/api/media_plans/${slug}?${params}`) `` | **GET** — `mba_number`, `version_number=1`; slug = Xano table name (20 slugs) | `clearVersionChildren` ← edit page draft-overwrite (`isOverwriteMode`, ~5521) | Staff-only |
| 3 | `lib/mediaplan/clearVersionChildren.ts` | 143 | `` `/api/media_plans/${slug}/${row.id}` `` | **DELETE** — per row id | Same as #2 | Staff-only |
| 4 | `lib/api.ts` | 1099 | `` `/api/media_plans/media_plan?${q}` `` | **GET** — `mba_number` | `getMediaPlanByMBA` — **no callers found** (dead export) | N/A |
| 5 | `lib/api.ts` | 1107 | `` `/api/media_plans/media_plan_version?${q}` `` | **GET** — `mba_number` | `getMediaPlanVersionByMBA` — **no callers found** (dead export) | N/A |
| 6 | `lib/api.ts` | 935 | `` fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_versions`, { method: 'POST', …}) `` | **POST** — full `MediaPlanVersion` JSON body | `createMediaPlanVersion` ← `app/mediaplans/create/page.tsx` ~4596 | Staff-only |
| 7 | `lib/api.ts` | 1598 | `` fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_television`, { method: 'POST', …}) `` | **POST** — television line-item payload | `saveTelevisionData` ← `saveTelevisionLineItems` ← create + edit pages | Staff-only |
| 8 | `lib/api.ts` | 1662 | `` …/media_plan_newspaper `` | **POST** — newspaper line-item body | `saveNewspaperLineItems` ← create + edit | Staff-only |
| 9 | `lib/api.ts` | 1726 | `` …/media_plan_social `` | **POST** — social line-item body | `saveSocialMediaLineItems` ← create + edit | Staff-only |
| 10 | `lib/api.ts` | 3117 | `` …/media_plan_radio `` | **POST** — radio line-item body | `saveRadioLineItems` ← create + edit | Staff-only |
| 11 | `lib/api.ts` | 3172 | `` …/media_plan_magazines `` | **POST** | `saveMagazinesLineItems` ← create + edit | Staff-only |
| 12 | `lib/api.ts` | 3228 | `` …/media_plan_ooh `` | **POST** | `saveOOHLineItems` ← create + edit | Staff-only |
| 13 | `lib/api.ts` | 3284 | `` …/media_plan_cinema `` | **POST** | `saveCinemaLineItems` ← create + edit | Staff-only |
| 14 | `lib/api.ts` | 3339 | `` …/media_plan_digi_display `` | **POST** | `saveDigitalDisplayLineItems` ← create + edit | Staff-only |
| 15 | `lib/api.ts` | 3394 | `` …/media_plan_digi_audio `` | **POST** | `saveDigitalAudioLineItems` ← create + edit | Staff-only |
| 16 | `lib/api.ts` | 3451 | `` …/media_plan_digi_video `` | **POST** | `saveDigitalVideoLineItems` ← create + edit | Staff-only |
| 17 | `lib/api.ts` | 3633 | `` …/media_plan_search `` | **POST** | `saveSearchLineItems` ← create + edit | Staff-only |
| 18 | `lib/api.ts` | 3689 | `` …/media_plan_prog_display `` | **POST** | `saveProgDisplayLineItems` ← create + edit | Staff-only |
| 19 | `lib/api.ts` | 3806 | `` …/media_plan_prog_bvod `` | **POST** | `saveProgBVODLineItems` ← create + edit | Staff-only |
| 20 | `lib/api.ts` | 3861 | `` …/media_plan_prog_audio `` | **POST** | `saveProgAudioLineItems` ← create + edit | Staff-only |
| 21 | `lib/api.ts` | 3917 | `` …/media_plan_prog_ooh `` | **POST** | `saveProgOOHLineItems` ← create + edit | Staff-only |
| 22 | `lib/api.ts` | 1931–3990+ | `` `${MEDIA_PLANS_BASE_URL}/media_plan_<type>/${id}` `` PUT/DELETE | **PUT/DELETE** — line-item patch/delete bodies | `create/update/delete*LineItem` exports in `lib/api.ts` — **no component callers found**; reachable if imported later | Staff-only (if invoked) |
| 23 | `lib/mediaplan/__tests__/clearVersionChildren.test.ts` | 47–49 | `"/api/media_plans/media_plan_search/1"` | Test mock URLs only | Unit test | Test |

**`fetchLineItemsFromApi` pathSegment values that hit catch-all (row #1):**

| Internal key | `pathSegment` (URL) | Upstream Xano path |
|--------------|---------------------|-------------------|
| `radio` | `media_plan_radio` | `media_plan_radio` |
| `magazines` | `media_plan_magazines` | `media_plan_magazines` |
| `ooh` | `media_plan_ooh` | `media_plan_ooh` |
| `digitalDisplay` | `media_plan_digi_display` | `media_plan_digi_display` |
| `digitalAudio` | `digital_audio_line_items` | `digital_audio_line_items` |
| `digitalVideo` | `media_plan_digi_video` | `media_plan_digi_video` |
| `progBvod` | `prog_bvod_line_items` | `prog_bvod_line_items` |
| `progAudio` | `prog_audio_line_items` | `prog_audio_line_items` |

**`clearVersionChildren` slugs (rows #2–3) — all catch-all:**

`media_plan_television`, `media_plan_newspaper`, `media_plan_social`, `media_plan_radio`, `media_plan_magazines`, `media_plan_ooh`, `media_plan_cinema`, `media_plan_digi_display`, `media_plan_digi_audio`, `media_plan_digi_video`, `media_plan_digi_bvod`, `media_plan_integrations`, `media_plan_search`, `media_plan_prog_display`, `media_plan_prog_video`, `media_plan_prog_bvod`, `media_plan_prog_audio`, `media_plan_prog_ooh`, `media_plan_influencers`, `media_plan_production`

### B. Dedicated-route consumers (same search hits — **not** catch-all)

| File | Line | Request | Resolves to |
|------|------|---------|-------------|
| `lib/api.ts` | 1868 | GET `` `/api/media_plans/${pathSegment}?…` `` when pathSegment ∈ {`television`,`newspaper`,`cinema`,`digi-bvod`,`integration`,`search`,`social`,`prog-display`,`prog-video`,`prog-ooh`,`influencers`,`production`} | Dedicated per-channel route |
| `lib/api.ts` | 2675, 2735, 2886, 2954 | GET with dedicated segment | Server-side-only branches (`isBrowser === false`) |
| `lib/api.ts` | 2851, 3509, 3574, 3746, 3973 | POST to dedicated segment | Browser save for production, BVOD, integration, prog-video, influencers |
| `lib/api.ts` | 2988, 2998, 3008 | POST/PUT/DELETE `/api/media_plans/television[/${id}]` | Dedicated television routes — **no external callers found** |
| `components/dashboard/DashboardOverview.tsx` | 1555 | GET `/api/media_plans` | `app/api/media_plans/route.ts` (root), **not** catch-all |

---

## Proxy 2: `/api/media-details/[...path]`

All browser traffic flows through `lib/api.ts` via `MEDIA_DETAILS_BASE_URL === "/api/media-details"` or `fetchMediaDetail(path)`.

### Table — consumers per catch-all usage

| # | File | Line | Quoted line | Built request | Calling context | Surface |
|---|------|------|-------------|---------------|-----------------|--------|
| 1 | `lib/api.ts` | 1113 | `` isBrowser ? `/api/media-details/${path}` : … `` | **GET** — path arg | `fetchMediaDetail` | See getters below |
| 2 | `lib/api.ts` | 1122 | `fetchMediaDetail("tv_stations")` | GET `/api/media-details/tv_stations` | `getTVStations` ← `TelevisionContainer.tsx` | Staff-only (media plan create/edit containers) |
| 3 | `lib/api.ts` | 1126 | `fetchMediaDetail("radio_stations")` | GET `…/radio_stations` | `getRadioStations` ← `RadioContainer.tsx` | Staff-only |
| 4 | `lib/api.ts` | 1130 | `fetchMediaDetail("newspapers")` | GET `…/newspapers` | `getNewspapers` ← `NewspaperContainer.tsx`, `MagazinesContainer.tsx` | Staff-only |
| 5 | `lib/api.ts` | 1134 | `fetchMediaDetail("newspaper_adsizes")` | GET `…/newspaper_adsizes` | `getNewspapersAdSizes` ← `NewspaperContainer.tsx`, `MagazinesContainer.tsx` | Staff-only |
| 6 | `lib/api.ts` | 1138 | `fetchMediaDetail("magazines")` | GET `…/magazines` | `getMagazines` ← `MagazinesContainer.tsx` | Staff-only |
| 7 | `lib/api.ts` | 1143 | `fetchMediaDetail("magazines_adsizes")` | GET `…/magazines_adsizes` | `getMagazinesAdSizes` ← `MagazinesContainer.tsx` | Staff-only |
| 8 | `lib/api.ts` | 1147 | `fetchMediaDetail("audio_site")` | GET `…/audio_site` | `getAudioSites` ← `DigitalAudioContainer.tsx` | Staff-only |
| 9 | `lib/api.ts` | 1151 | `fetchMediaDetail("video_site")` | GET `…/video_site` | `getVideoSites` ← `DigitalVideoContainer.tsx` | Staff-only |
| 10 | `lib/api.ts` | 1155 | `fetchMediaDetail("display_site")` | GET `…/display_site` | `getDisplaySites` ← `DigitalDisplayContainer.tsx` | Staff-only |
| 11 | `lib/api.ts` | 1159 | `` fetch(`${MEDIA_DETAILS_BASE_URL}/bvod_site`) `` | GET `…/bvod_site` | `getBVODSites` ← `BVODContainer.tsx` | Staff-only |
| 12 | `lib/api.ts` | 1169 | `` POST `${MEDIA_DETAILS_BASE_URL}/POST_tv_stations` `` | POST `{ station, network }` | `createTVStation` ← `TelevisionContainer.tsx` | Staff-only |
| 13 | `lib/api.ts` | 1183 | `` POST …/POST_radio_stations `` | POST `{ station, network }` | `createRadioStation` ← `RadioContainer.tsx` | Staff-only |
| 14 | `lib/api.ts` | 1197 | `` POST …/POST_newspapers `` | POST `{ title, network }` | `createNewspaper` ← `NewspaperContainer.tsx`, `MagazinesContainer.tsx` | Staff-only |
| 15 | `lib/api.ts` | 1211 | `` POST …/POST_newspaper_adsizes `` | POST `{ adsize }` | `createNewspaperAdSize` ← containers | Staff-only |
| 16 | `lib/api.ts` | 1225 | `` POST …/POST_magazines `` | POST `{ title, network }` | `createMagazine` ← `MagazinesContainer.tsx` | Staff-only |
| 17 | `lib/api.ts` | 1240 | `` POST …/POST_magazines_adsizes `` | POST `{ adsize }` | `createMagazineAdSize` ← `MagazinesContainer.tsx` | Staff-only |
| 18 | `lib/api.ts` | 1254 | `` POST …/audio_site `` | POST `{ platform, site }` | `createAudioSite` ← `DigitalAudioContainer.tsx` | Staff-only |
| 19 | `lib/api.ts` | 1268 | `` POST …/video_site `` | POST `{ platform, site }` | `createVideoSite` ← `DigitalVideoContainer.tsx` | Staff-only |
| 20 | `lib/api.ts` | 1282 | `` POST …/display_site `` | POST `{ platform, site }` | `createDisplaySite` ← `DigitalDisplayContainer.tsx` | Staff-only |
| 21 | `lib/api.ts` | 1296 | `` POST …/bvod_site `` | POST `{ platform, site }` | `createBVODSite` ← `BVODContainer.tsx` | Staff-only |

**No dedicated `media-details` per-resource routes exist** — every path above uses the catch-all.

---

## Distinct upstream Xano paths in practice (catch-all only)

### `media_plans` catch-all

| Upstream path | Methods | Triggered by |
|---------------|---------|--------------|
| `media_plan_radio` | GET, POST | Line-item load (radio); save radio; clear v1 children |
| `media_plan_magazines` | GET, POST, DELETE | Line-item load; save; clear v1 |
| `media_plan_ooh` | GET, POST, DELETE | Line-item load; save; clear v1 |
| `media_plan_digi_display` | GET, POST, DELETE | Line-item load; save; clear v1 |
| `digital_audio_line_items` | GET | Line-item load (digital audio) |
| `media_plan_digi_audio` | POST, DELETE | Save digital audio; clear v1 |
| `media_plan_digi_video` | GET, POST, DELETE | Line-item load; save; clear v1 |
| `prog_bvod_line_items` | GET | Line-item load (prog BVOD) |
| `prog_audio_line_items` | GET | Line-item load (prog audio) |
| `media_plan_television` | POST, DELETE | Save TV; clear v1 |
| `media_plan_newspaper` | POST, DELETE | Save newspaper; clear v1 |
| `media_plan_social` | POST, DELETE | Save social; clear v1 |
| `media_plan_cinema` | POST, DELETE | Save cinema; clear v1 |
| `media_plan_digi_bvod` | DELETE | Clear v1 only (save uses dedicated `digi-bvod`) |
| `media_plan_integrations` | DELETE | Clear v1 only (save uses dedicated `integration`) |
| `media_plan_search` | POST, DELETE | Save search; clear v1 |
| `media_plan_prog_display` | POST, DELETE | Save prog display; clear v1 |
| `media_plan_prog_video` | DELETE | Clear v1 only (save uses dedicated `prog-video`) |
| `media_plan_prog_bvod` | POST, DELETE | Save prog BVOD; clear v1 |
| `media_plan_prog_audio` | POST, DELETE | Save prog audio; clear v1 |
| `media_plan_prog_ooh` | POST, DELETE | Save prog OOH; clear v1 |
| `media_plan_influencers` | DELETE | Clear v1 only (save uses dedicated `influencers`) |
| `media_plan_production` | DELETE | Clear v1 only (save uses dedicated `production`) |
| `media_plan_versions` | POST | Create plan version (create flow) |
| `media_plan` | GET | Dead code (`getMediaPlanByMBA`) |
| `media_plan_version` | GET | Dead code (`getMediaPlanVersionByMBA`) |

### `media-details` catch-all

| Upstream path | Methods | Triggered by |
|---------------|---------|--------------|
| `tv_stations` | GET | TV station picker |
| `radio_stations` | GET | Radio station picker |
| `newspapers` | GET | Newspaper picker |
| `newspaper_adsizes` | GET | Newspaper ad sizes |
| `magazines` | GET | Magazine picker |
| `magazines_adsizes` | GET | Magazine ad sizes |
| `audio_site` | GET, POST | Digital audio site list + create |
| `video_site` | GET, POST | Digital video site list + create |
| `display_site` | GET, POST | Digital display site list + create |
| `bvod_site` | GET, POST | BVOD site list + create |
| `POST_tv_stations` | POST | Create TV station |
| `POST_radio_stations` | POST | Create radio station |
| `POST_newspapers` | POST | Create newspaper |
| `POST_newspaper_adsizes` | POST | Create newspaper ad size |
| `POST_magazines` | POST | Create magazine |
| `POST_magazines_adsizes` | POST | Create magazine ad size |

---

## UNRESOLVED / dynamic construction

| File | Reason |
|------|--------|
| `lib/api.ts` — `` `${MEDIA_PLANS_BASE_URL}/${pathSegment}` `` | `pathSegment` is statically bounded by `LINE_ITEM_BROWSER_API_PATH` keys (18 entries). All resolved at compile-time from object literal — **not marked UNRESOLVED**. |
| `lib/mediaplan/clearVersionChildren.ts` — `` `${slug}` `` | `slug` iterates const `SLUGS` array (20 fixed table names). **Not UNRESOLVED**. |
| `lib/api.ts` — `fetchMediaDetail(path)` | `path` is a string parameter, but every call site passes a string literal. **Not UNRESOLVED**. |

No application call sites were found where the catch-all target path cannot be determined statically.

---

## Impact if each proxy returned 403 today

### `/api/media_plans/[...path]` → 403

| Area | What breaks |
|------|-------------|
| **MBA edit — line-item load** | Radio, magazines, OOH, digital display/audio/video, prog BVOD, prog audio channels fail to load (empty or error); other channels unaffected (dedicated GET routes). |
| **MBA edit / create — save** | POST fails for: television, newspaper, social, radio, magazines, OOH, cinema, all digital (non-BVOD), search, prog display, prog BVOD/audio/OOH (channels that POST to `media_plan_*` table names). Saves for production, BVOD, integration, prog-video, influencers continue via dedicated routes. |
| **MBA edit — draft overwrite** | `clearVersionChildren` fails: cannot list or DELETE version-1 child rows across all 20 media tables. Overwrite flow aborts. |
| **Create mediaplan — version** | `createMediaPlanVersion` POST to `media_plan_versions` fails; new plan version cannot be created after master record. |
| **Dead exports** | `getMediaPlanByMBA` / `getMediaPlanVersionByMBA` would fail if called; currently unused. |
| **Dedicated routes** | Unaffected — television GET, search GET, etc. keep working. |
| **Dashboard** | Unaffected — uses `/api/media_plans` root route, not catch-all. |
| **Client users** | No UI exposure today; middleware blocks `/mediaplans/*` pages. API is session-only (no role gate), so a client session could theoretically call these URLs directly — same 403 behavior. |

### `/api/media-details/[...path]` → 403

| Area | What breaks |
|------|-------------|
| **Media containers on create/edit** | All station/site/newspaper/magazine lookup dropdowns fail to populate (TV, radio, newspaper, magazines, digital audio/video/display, BVOD). |
| **Inline “add new station/site” actions** | All `create*Station` / `create*Site` / `createNewspaper*` / `createMagazine*` POSTs fail; users cannot add reference data from containers. |
| **Line-item save/load** | Unaffected — uses `media_plans` routes, not `media-details`. |
| **Client users** | Same as above: no client UI path to these containers; API lacks role gate. |

---

## Summary

- **Single browser module** (`lib/api.ts`) plus **`clearVersionChildren.ts`** account for essentially all catch-all `media_plans` traffic; media containers + `lib/api.ts` account for all `media-details` traffic.
- Dedicated per-channel routes cover **GET** (and some **POST**) for 12 channel aliases, but **most browser POST saves still target Xano table names** and therefore the catch-all.
- **`clearVersionChildren`** is entirely catch-all (uses Xano table names, not friendly route segments).
- Catch-all proxies were added in **v1.3**; dedicated channel routes **predate** them but did not replace table-name POST paths.
- Gating catch-alls with 403 would **not** stop dedicated-route traffic or `/api/media_plans` root GET used by the staff dashboard.
