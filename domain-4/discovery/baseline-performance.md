# Domain 4 — Baseline performance capture (Task 2.4)

**Instructions:** Luke fills this in after Section 5 manual testing. Record **median** of 3 runs where noted.

---

## Baseline: BOSS002 v10 edit page load (before Stage 1 changes)

- Date/time:
- Branch: `domain-4-search-pilot` @ `<commit hash>`
- Test conditions: cold cache, dev server, `npm run dev`, localhost
- Network panel observations:
  - Total `/api/media_plans/*` requests:
  - Total bytes received across line-item requests:
  - `/api/media_plans/search` response time (ms):
  - `/api/media_plans/search` response size (KB):
  - Server log: `[SEARCH] Raw response data count:`
  - Server log: `[SEARCH] Kept N items:`
  - Page interactive time (`loadPhase = ready`):
- Repeat 3 times, record median:

### Run log

| Run | Total requests | Total KB (line items) | search ms | search KB | Raw count | Kept | loadPhase ready |
|-----|-------------:|----------------------:|----------:|----------:|----------:|-----:|------------------|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |
| **Median** | | | | | | | |

---

## Baseline: BOSS002 v10 search-only via direct Xano call

- Date/time:
- curl test 1 (mba only): response count + time
- curl test 2 (mba + version): response count + time

| Test | Command summary | Row count | Time (ms) |
|------|-----------------|----------:|----------:|
| Direct A (MBA only) | `media_plan_search?mba_number=BOSS002` | | |
| Direct B (MBA + v10) | `…&version_number=10` | | |

---

## Notes / anomalies

<!-- Optional: VPN, auth token, enabled media flags on BOSS002 v10, etc. -->

---

## Post–Stage 2c: BOSS002 v10 API smoke (2026-05-21)

- Branch: `domain-4-api-fetch-efficiency` @ `f890e59`
- Method: `curl` to `localhost:3000/api/media_plans/*` (not full edit-page Network panel)
- Full log table: [`../stage-2c/integration-smoke.md`](../stage-2c/integration-smoke.md)

| Route tag | Raw | Kept | vs Stage 0 expectation |
|-----------|----:|-----:|------------------------|
| SEARCH | 1 | 1 | ✓ Xano filtered (2b) |
| NEWSPAPER | 174 | 3 | ✗ wire still MBA-wide; URL has `version_number=10` |
| PROG_DISPLAY | 227 | 2 | ✗ wire still MBA-wide |
| PROG_VIDEO | 216 | 0 | ✗ wire still MBA-wide |
| PRODUCTION | 124 | 0 | ≠ known (MBA-wide + fallback) |
| DIGI_BVOD / CINEMA / TV / SOCIAL | 0 | 0 | n/a (empty campaigns) |

**Interpretation:** Next.js forwarding complete (Stage 2c). Payload shrink on newspaper/prog-* awaits Stage-1 Xano deploy per table (D4-K5 in `AUDIT_DOMAIN_4_KNOWN_ISSUES.md`).
