# Hotfix H1 — `digi-bvod` GET handler

**Date:** 2026-05-21  
**Branch (intended):** `domain-4-search-pilot`  
**Scope:** Only `app/api/media_plans/digi-bvod/route.ts`

---

## H1.1 — Investigation

| Check | Result |
|-------|--------|
| `digi-bvod/route.ts` exports only `POST`? | **Yes** (pre-fix) |
| Browser `getBVODLineItemsByMBA` uses GET via `fetchLineItemsFromApi`? | **Yes** → `/api/media_plans/digi-bvod?mba_number=…&media_plan_version=…&mp_plannumber=…` |
| SSR path bypasses route? | **Yes** — server calls Xano `media_plan_digi_bvod` directly |

**Root cause:** A dedicated `app/api/media_plans/digi-bvod/route.ts` exists but did not export `GET`. Next.js matches the dedicated route before `[...path]`, so browser GETs returned **405 Method Not Allowed** instead of proxying to Xano.

**References:**
- `lib/api.ts` — `getBVODLineItemsByMBA` → `fetchLineItemsFromApi(..., "bvod")` → path `digi-bvod`
- `domain-4/discovery/code-verification.md` — flagged POST-only

---

## H1.2 — Fix

Added `GET` handler patterned after `app/api/media_plans/production/route.ts`:

- Resolves version via `getVersionNumberForMBA`
- Forwards `mba_number`, `mp_plannumber`, `version_number`, `media_plan_version` to Xano `media_plan_digi_bvod`
- Applies `filterLineItemsByPlanNumber` post-Xano (log prefix `DIGI_BVOD`)
- 404 → empty array (matches prog-display / integration behaviour)
- Existing `POST` unchanged

**Not included:** Production route’s “MBA fallback if filter empty” — intentionally omitted; siblings without that fallback are the norm for digital line items.

---

## H1.3 — Smoke test

| Step | Status | Notes |
|------|--------|-------|
| Dev server running | ⬜ | |
| Open MBA with digital BVOD enabled | ⬜ | |
| Network: `GET /api/media_plans/digi-bvod` → 200 | ⬜ | Was 405 pre-fix |
| BVOD line items render on edit page | ⬜ | |

---

## H1.4 — Commit

```text
fix(api): add missing GET handler to digi-bvod route

The digi-bvod route handler only exported POST, meaning browser-side
GET requests via getDigitalBVODLineItemsByMBA were 405-ing or falling
through silently. SSR path was unaffected as it bypasses the route
handler.

Pattern matches production/route.ts (dedicated digital line-item GET).

Discovered during Domain 4 Stage 0 code verification.
```

**Current workspace branch:** verify with `git branch --show-current` before commit; cherry-pick or switch to `domain-4-search-pilot` if required.
