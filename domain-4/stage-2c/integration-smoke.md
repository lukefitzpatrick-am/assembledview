# Stage 2c — Integration smoke results

**Date:** 2026-05-21  
**Branch:** `domain-4-api-fetch-efficiency` @ `f890e59`  
**Test:** `curl` against `http://localhost:3000` (dev server running)  
**Query:** `mba_number=BOSS002&mp_plannumber=10&media_plan_version=10`

---

## Per-route log summary

| Tag | Raw | Kept | raw == kept? | Notes |
|-----|----:|-----:|:------------:|-------|
| SEARCH | 1 | 1 | ✓ | Stage 2b; Xano #207 filters at source |
| NEWSPAPER | 174 | 3 | ✗ | `version_number=10` on URL; Xano still MBA-wide — Stage 1 not applied on table (D4-K5) |
| CINEMA | 0 | 0 | ✓ | No line items for BOSS002 |
| TELEVISION | 0 | 0 | ✓ | No line items for BOSS002 |
| DIGI_BVOD | 0 | 0 | ✓ | No BVOD line items; GET returns 200 (not 405) |
| PROG_DISPLAY | 227 | 2 | ✗ | `version_number` in paginator params; Xano MBA-wide (D4-K5) |
| PROG_VIDEO | 216 | 0 | ✗ | Same; kept 0 — no v10 prog-video rows |
| SOCIAL | 0 | 0 | ✓ | |
| INTEGRATION | 3 | 0 | ✗ | 3 MBA rows, none match v10 filter |
| INFLUENCERS | 11 | 0 | ✗ | 11 MBA rows, none match v10 filter |
| PRODUCTION | 124 | 0 | ≠ (expected) | MBA-wide at Xano; filter + fallback; known D4-K1 |

---

## Exit criteria checklist

- [x] All four commits on `domain-4-api-fetch-efficiency`
- [x] Per-commit API smoke (no 5xx; newspaper returns 3 kept items)
- [ ] Final raw == kept for **all** non-production routes — **blocked on Stage-1 Xano** for several tables (see D4-K5)
- [x] Production raw > kept documented
- [ ] Edit page visual regression — **not run in this session** (user/browser)
- [x] No new server errors during curl smoke
- [x] `AUDIT_DOMAIN_4_KNOWN_ISSUES.md` populated
- [x] Post-2c baseline section added to `baseline-performance.md`

---

## Catch-all types (manual)

Inspect Network panel on BOSS002 v10 edit load for: radio, magazines, ooh, digi-display, digi-audio, digi-video, prog-bvod, prog-audio, prog-ooh. No `[TAG]` server logs from catch-all proxy (D4-K4).

---

## Sample log lines (newspaper + search)

```
[NEWSPAPER] API URL: …/media_plan_newspaper?mba_number=BOSS002&version_number=10
[NEWSPAPER] Raw response data count: 174
[NEWSPAPER] Final filtered data count: 3 (from 174 total items)

[SEARCH] API URL: …/media_plan_search?mba_number=BOSS002&version_number=10
[SEARCH] Raw response data count: 1
[SEARCH] Final filtered data count: 1 (from 1 total items)
```
