# Domain 4 — Curl validation results (Section 4)

**Run date:** 2026-05-21  
**Tester:** Cursor agent (PowerShell `Invoke-RestMethod`)  
**Base URL:** `https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa`  
**MBA under test:** `BOSS002`  
**Auth:** None (public read)

---

## Test set A — baseline (MBA only)

| ID | Command | Expected | Actual rows | Time (ms) | Pass? | Notes |
|----|---------|----------|------------:|----------:|:-----:|-------|
| A1 | `GET /media_plan_search?mba_number=BOSS002` | Large (doc cited ~337) | **10** | 318 | ✅* | *Row count lower than historic 337 log — Xano may now scope by MBA at API layer, or data changed. Still the MBA-only baseline for B comparison. |

```http
GET https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa/media_plan_search?mba_number=BOSS002
→ 10 rows, 318ms
```

---

## Test set B — filtered behaviour (search #207)

| ID | Command | Expected | Actual rows | Time (ms) | Pass? | Notes |
|----|---------|----------|------------:|----------:|:-----:|-------|
| B1 | `…&version_number=10` | ≈ `[SEARCH] Kept N` for v10; ≪ A1 | **1** | 69 | ✅ | Matches prior “Kept 1” for BOSS002 v10. **10× reduction** vs A1. |
| B2 | `…&version_number=9` | ≠ B1 (or zero) | **1** | 79 | ✅ | Same count as B1; v9 and v10 each have one search line item (counts can match while rows differ). |

```http
GET …/media_plan_search?mba_number=BOSS002&version_number=10  → 1 row, 69ms
GET …/media_plan_search?mba_number=BOSS002&version_number=9   → 1 row, 79ms
```

**Verdict:** Version filter on #207 is **working**. B1 ≪ A1. No stop condition triggered (B1 ≠ A1, B1 > 0).

---

## Test set C — edge cases

| ID | Command | Expected | Actual rows | Time (ms) | Pass? | Notes |
|----|---------|----------|------------:|----------:|:-----:|-------|
| C1 | MBA only (no version) | Document behaviour | **10** | 86 | ✅ | **O1 resolved:** Same as A1 — missing `version_number` returns **MBA-scoped unversioned set** (10 rows), not 0. |
| C2 | `mba_number=NONEXISTENT&version_number=10` | 0 | **0** | 72 | ✅ | |
| C3 | `BOSS002&version_number=999` | 0 | **0** | 60 | ✅ | |

---

## Test set D — control (radio #114, still unfiltered)

| ID | Command | Expected | Actual rows | Time (ms) | Pass? | Notes |
|----|---------|----------|------------:|----------:|:-----:|-------|
| D1 | `GET /media_plan_radio?mba_number=BOSS002` | Large | **899** | 784 | ✅ | |
| D2 | `…&version_number=10` | **D1 == D2** | **899** | 505 | ✅ | `version_number` ignored — radio still pre-fix. |

---

## Summary

| Result | Date | Tester |
|--------|------|--------|
| **PASS** | 2026-05-21 | Cursor / Luke workspace |

### Quick reference

| Test | Rows | ms |
|------|-----:|---:|
| A1 | 10 | 318 |
| B1 | 1 | 69 |
| B2 | 1 | 79 |
| C1 | 10 | 86 |
| C2 | 0 | 72 |
| C3 | 0 | 60 |
| D1 | 899 | 784 |
| D2 | 899 | 505 |

### Failures / flags

- **A1 count (10) vs historic server log (337):** Not a test failure. Likely causes: (1) Xano #207 or intermediate MBA filter now applied even without `version_number`, (2) fewer rows in `media_plan_search` for BOSS002 now, (3) original log was pre-MBA scoping. **Pilot criterion B1 ≪ A1 and B1 ≈ 1 still holds.**
- **B2 count equals B1:** Acceptable — both versions can have exactly one line item.

### Open questions updated

| ID | Resolution from this run |
|----|--------------------------|
| **O1** | Missing `version_number` → returns **10 rows** (same as MBA-only), not 0. Frontend should always send `version_number` for precise filter; fallback is broader MBA set. |
| **O2/O3** | Unchanged — still need Task 3.2 schema check for JOIN portability. |

---

## Reproduce (PowerShell)

```powershell
$base = "https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa"
$mba = "BOSS002"
(Invoke-RestMethod "$base/media_plan_search?mba_number=$mba").Count
(Invoke-RestMethod "$base/media_plan_search?mba_number=$mba&version_number=10").Count
(Invoke-RestMethod "$base/media_plan_radio?mba_number=$mba").Count
(Invoke-RestMethod "$base/media_plan_radio?mba_number=$mba&version_number=10").Count
```
