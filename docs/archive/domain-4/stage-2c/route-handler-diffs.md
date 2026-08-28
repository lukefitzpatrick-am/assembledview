# Stage 2c — Route handler diffs

Branch: `domain-4-api-fetch-efficiency`  
Commits: `ecd9ec0`, `71ae353`, `5c32a29`, `f890e59`

---

## Commit 1 — Traditional (`ecd9ec0`)

### `app/api/media_plans/newspaper/route.ts`
- **Pattern:** Full Stage 2b treatment (`A_search_legacy`)
- **Change:** After `params.append('mba_number', …)`, conditional `version_number` append; strategy log updated.
- **Note:** `export const dynamic/revalidate/maxDuration` included (were unstaged from prior work).

### `app/api/media_plans/cinema/route.ts`
- **Pattern:** Full Stage 2b treatment (`A_search_legacy`)
- **Change:** Same as newspaper.

### `app/api/media_plans/television/route.ts`
- **Pattern:** Log-only (`C_television_modern`)
- **Pre-existing:** `fetchAllXanoPages` + `lineItemPaginationParams(mbaNumber, versionNumber)` already forwards `version_number`.
- **Change:** Strategy log line only.

---

## Commit 2 — Digital direct (`71ae353`)

### `app/api/media_plans/digi-bvod/route.ts`
- **Pattern:** Log-only (H1 GET handler from Stage 1)
- **Pre-existing:** GET handler appends `mba_number`, `mp_plannumber`, `version_number`, `media_plan_version`.
- **Change:** Strategy log line added; full GET handler committed (was unstaged from H1).

---

## Commit 3 — Programmatic (`5c32a29`)

### `app/api/media_plans/prog-display/route.ts`
- **Pattern:** Log-only (`C_television_modern` + pagination)
- **Pre-existing:** `lineItemPaginationParams` on `fetchAllXanoPages`.
- **Change:** Strategy log; file added to repo (new dedicated route).

### `app/api/media_plans/prog-video/route.ts`
- **Pattern:** Log-only
- **Pre-existing:** `lineItemPaginationParams` + `fetchAllXanoPages`; also picked up `dynamic/revalidate/maxDuration` from unstaged work.

---

## Commit 4 — Social / search-adjacent (`f890e59`)

### `app/api/media_plans/social/route.ts`
- **Pattern:** Log-only
- **Pre-existing:** `lineItemPaginationParams` on `fetchAllXanoPages`.
- **Change:** Strategy log (replaced “query all records…” message).

### `app/api/media_plans/integration/route.ts`
- **Pattern:** Log-only
- **Pre-existing:** Switched from `{ mba_number }` to `lineItemPaginationParams` in unstaged work.
- **Change:** Strategy log.

### `app/api/media_plans/influencers/route.ts`
- **Pattern:** Log-only
- **Pre-existing:** Same as integration.
- **Change:** Strategy log.

### `app/api/media_plans/production/route.ts`
- **Pattern:** Cosmetic + comment (`B_production_shotgun` special case)
- **Change:** `AUDIT_DOMAIN_4_KNOWN_ISSUES` comment block; conditional `version_number` append uses Stage 2b guard; strategy/fetch/raw/kept logs; MBA fallback **unchanged**.
- **Also:** Removed erroneous `"use server"` directive; added `dynamic/revalidate/maxDuration`.
