# Domain 4 Stage 0 — Code verification (Task 2.1)

**Verified against workspace @ `cfd1892265b0d5b15d2ad3f3088b8b91aa363c6f` (2026-05-21).**  
Discovery only — no code was changed.

---

## Summary

Section 0 baseline claims are **mostly accurate**. Several **material deltas** exist in the current tree (notably new dedicated routes, double client-side filtering on the edit page, and `fetchLineItemsFromApi` not sending `version_number`). The pilot Xano fix for `media_plan_search` is **not yet wired** through the Next.js search route (still queries Xano with `mba_number` only).

---

## 2.1 Code verification

### `lib/api.ts` — `LINE_ITEM_BROWSER_API_PATH` (lines 1937–1958)

**Confirmed** — 19 keys map line-item fetch keys to `/api/media_plans/{segment}` path segments:

| Key | Path segment |
|-----|----------------|
| television | `television` |
| radio | `media_plan_radio` |
| newspaper | `newspaper` |
| magazines | `media_plan_magazines` |
| ooh | `media_plan_ooh` |
| cinema | `cinema` |
| digitalDisplay | `media_plan_digi_display` |
| digitalAudio | `digital_audio_line_items` |
| digitalVideo | `digital_video_line_items` |
| bvod | `digi-bvod` |
| integration | `integration` |
| search | `search` |
| socialMedia | `social` |
| progDisplay | `prog-display` |
| progVideo | `prog-video` |
| progBvod | `prog_bvod_line_items` |
| progAudio | `prog_audio_line_items` |
| progOoh | `prog_ooh_line_items` |
| influencers | `influencers` |
| production | `production` |

**Delta vs. section 0:** Section 0 listed ~18 media types; the map has **19 entries** (all loader types except none missing). `prog-display` and `prog-display/route.ts` are **new** relative to the original “catch-all only” list for prog display.

---

### `lib/api.ts` — `fetchLineItemsFromApi` (lines 1960–2001)

**Confirmed** with one important gap:

- Browser fetches: `/api/media_plans/${pathSegment}?mba_number=…`
- When version is set, appends **`media_plan_version`** and **`mp_plannumber` only** — does **not** append `version_number`.
- No `filterLineItemsByPlanNumber` here (filtering happens in route handlers and/or edit page).

**Delta vs. section 0 / `lineItemPaginationParams`:** Route handlers using `lineItemPaginationParams` send **three** version-related params (`mp_plannumber`, `version_number`, `media_plan_version`). Browser `fetchLineItemsFromApi` sends **two** (`media_plan_version`, `mp_plannumber`). This mismatch matters for Stage 2 wiring.

---

### `lib/api.ts` — `getSearchLineItemsByMBA` (lines 2781–2808)

**Confirmed** — browser path uses `fetchLineItemsFromApi(..., "search")`; server-side uses `/api/media_plans/search` with `media_plan_version` + `mp_plannumber` when version provided (still no `version_number` on server-side URL).

---

### `lib/api/mediaPlanLineItemQuery.ts` (full file)

**Confirmed** — `lineItemPaginationParams` sets all three when version present:

```ts
params.mp_plannumber = v
params.version_number = v
params.media_plan_version = v
```

Matches section 0 exactly.

---

### `lib/api/mediaPlanVersionHelper.ts` — `filterLineItemsByPlanNumber`

**Confirmed** — six-field OR version match + `mba_number` match; warning log when `filteredData.length !== data.length`; stable sort by line item number.

Aliases checked: `media_plan_version`, `media_plan_version_number`, `version_number`, `versionNumber`, `mp_plannumber`, `mp_plan_number`.

**Additional finding (not in section 0):** `app/mediaplans/mba/[mba_number]/edit/page.tsx` calls `filterLineItemsByPlanNumber` **again** after every `get*LineItemsByMBA` in `loadSingleMediaTypeLineItems` (lines 3022–3027). Dedicated route handlers already filter → **double filtering** on edit page load today.

---

### `app/api/media_plans/search/route.ts`

**Confirmed** — `A_search_legacy` pattern:

- Resolves display version via `getVersionNumberForMBA`.
- Xano request: **`mba_number` only** (lines 47–50) — does **not** forward `version_number` to Xano despite #207 supporting it.
- `filterLineItemsByPlanNumber` in route (`SEARCH` label).
- `[SEARCH]` logging present (raw count + filtered count).

**Delta vs. section 0:** Xano #207 may now filter when called with `version_number` directly (curl), but **this route still over-fetches** until Stage 2.

POST uses `search_line_items` Xano path (not `media_plan_search`) — oddity for writes only.

---

### `app/api/media_plans/production/route.ts`

**Confirmed** — `B_production_shotgun`:

- Forwards `mba_number`, `mp_plannumber`, `version_number`, `media_plan_version` to Xano.
- `filterLineItemsByPlanNumber` with `PRODUCTION` label.
- **Extra behaviour not in section 0:** if JS filter returns 0 rows, returns **all MBA rows unversioned** (lines 59–62) — safety fallback that can mask Xano/filter bugs.

---

### `app/api/media_plans/[...path]/route.ts`

**Confirmed** — `D_catchall_proxy`:

- Joins path segments → `xanoUrl(path)`.
- Forwards all query params unchanged.
- **No** `filterLineItemsByPlanNumber`.
- Optional `XANO_API_KEY` Authorization header.

Catch-all serves: `media_plan_radio`, `media_plan_magazines`, `media_plan_ooh`, `media_plan_digi_display`, `digital_audio_line_items`, `digital_video_line_items`, `prog_bvod_line_items`, `prog_audio_line_items`, `prog_ooh_line_items`, and any other segment without a dedicated GET handler.

---

### Dedicated routes — pattern inventory (beyond section 0 list)

| Route | Pattern | Xano table | Notes |
|-------|---------|------------|-------|
| `television` | `C_television_modern` | `media_plan_television` | `fetchAllXanoPages` + `lineItemPaginationParams` + JS filter |
| `social` | `C_television_modern` | `media_plan_social` | Same |
| `integration` | `C_television_modern` | `media_plan_integrations` | Inline version resolve (not always `getVersionNumberForMBA`) |
| `influencers` | `C_television_modern` | `media_plan_influencers` | Same as social |
| `prog-display` | `C_television_modern` | `media_plan_prog_display` | **New file** — was catch-all in section 0 narrative |
| `prog-video` | `C_television_modern` | `media_plan_prog_video` | Dedicated route exists |
| `cinema` | `A_search_legacy` | `media_plan_cinema` | MBA-only Xano query + JS filter |
| `newspaper` | `A_search_legacy` | `media_plan_newspaper` | MBA-only Xano query + JS filter |
| `digi-bvod` | POST only | `media_plan_digi_bvod` | **No GET handler** — browser GET `/api/media_plans/digi-bvod` likely **405**; BVOD loads may fail in browser unless another path is used |

---

### `app/mediaplans/mba/[mba_number]/edit/page.tsx` — loader config (lines 2985–3004)

**Confirmed** — 20 `mp_*` keys → `get*LineItemsByMBA` getters (matches `mediaTypes` list lines 1228–1247).

Display labels are in `mediaTypes` (lines 1228–1247), not in `lineItemLoaderConfig` itself.

---

## Discrepancy checklist (section 0 → current tree)

| Claim in §0 | Status |
|-------------|--------|
| Edit page loads via per-table `get*LineItemsByMBA` | ✅ Confirmed |
| Search route queries Xano with MBA only, filters in JS | ✅ Confirmed (route not updated for #207 yet) |
| Production sends 3 version params + JS filter | ✅ Confirmed (+ MBA-only fallback) |
| Catch-all for radio, magazines, ooh, digi-*, prog_* line_items paths | ✅ Mostly confirmed; **prog-display** now has dedicated route |
| `lineItemPaginationParams` sends display version as all three params | ✅ Confirmed |
| `filterLineItemsByPlanNumber` is the defensive 6-field filter | ✅ Confirmed |
| Only route layer filters (no edit-page filter) | ❌ **Incorrect** — edit page filters again client-side |
| `digi-bvod` route filters like search/production | ❌ **POST-only** — no GET/proxy filter |
| Browser `fetchLineItemsFromApi` sends `version_number` | ❌ Sends `media_plan_version` + `mp_plannumber` only |

---

## Implications for Stage 1/2 (informational only)

1. Pilot validation (curl with `version_number`) proves Xano #207; Stage 2 must add `version_number` to search route Xano query and can remove redundant MBA-only fetch strategy.
2. Align `fetchLineItemsFromApi` with `lineItemPaginationParams` when reducing over-fetch.
3. Resolve `digi-bvod` GET gap before relying on browser BVOD loads.
4. Consider removing duplicate edit-page filter only after route+Xano filtering proven (Stage 3 per domain plan).
