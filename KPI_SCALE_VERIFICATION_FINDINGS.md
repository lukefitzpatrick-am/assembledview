# KPI scale verification findings
Generated: 2026-07-01T22:04:48.764Z
## Step 1 — Fetch diagnosis
### Scripts using `fetchAllXanoPagesWithCompleteness`
| Script | Line | Filter | Page size | Max pages | Termination |
|--------|------|--------|-----------|-----------|-------------|
| `scripts/normalize-kpi-percent-scale.ts` | 494–496 | Global list (no `publisher` filter) | 200 | 50 | `lib/api/xanoPagination.ts`: empty page, short page (`data.length < pageSize`), or **dedupe early-stop** when page > 1 adds zero new unique `id`s (lines 100–105) |
| `scripts/bulk-import-kpi-best-practice.ts` | 350–351 | Global list (no `publisher` filter) | 200 | 50 | Same as above |
### `fetchAllXanoPagesWithCompleteness` pagination contract gap
At `lib/api/xanoPagination.ts:84` the helper treats `response.data` as a list **only when it is a bare array**. Wrapped envelopes (`{ items: [...] }`) become `[]`, which can truncate or zero out fetches. It also does not read `nextPage` metadata.
### Raw first-page GET envelope (page=1, page_size=200)
```json
{
  "isArray": true,
  "topKeys": [
    "(bare array)"
  ],
  "pageSize": 200,
  "firstPageItemCount": 900,
  "meta": {}
}
```
- Response is a **bare array** (no paging metadata in envelope).
- First page item count (via `parseXanoListPayload`): **900**.
- Default page size used: **200**.
## Step 2 — Full fetch comparison
| Path | Rows fetched | Pages | Notes |
|------|-------------|-------|-------|
| OLD (`fetchAllXanoPagesWithCompleteness`) | 900 | ≤2 typical if dedupe stops | `complete=true` |
| FULL (metadata-aware pagination) | 900 | 2 | itemsTotal=n/a |
OLD and FULL paths fetched the same row count (pagination cap may not be hiding rows at current dataset size, or both paths hit the same limit).
Duplicate composite keys in live data (first row wins): **8**
  - `link/social/manual_cpc`
  - `link/social/completed_views`
  - `link/social/conversion_value`
  - `link/social/landing_page_views`
  - `link/social/leads`
  - `link/social/maximize_conversions`
  - `link/social/reach`
  - `dav360/progDisplay/clicks`
## In-scope key set
- Source: **normalize-scale-report.json rows[] (460 keys, inScopeRowCount=460)**
- In-scope row keys: **460**
- last-run-report.json kpi.create=0, kpi.patch=0
## Step 3 — Migration map classification (1,119 metric entries)
Tolerance: `|stored − target| ≤ |target|×1e-6 + 1e-12`.
### All entries
| Classification | Count |
|----------------|-------|
| DONE | 911 |
| STILL-PERCENT | 0 |
| NOT-FOUND | 0 |
| UNEXPECTED | 208 |
### In-scope only
| Classification | Count |
|----------------|-------|
| DONE | 820 |
| STILL-PERCENT | 0 |
| NOT-FOUND | 0 |
| UNEXPECTED | 0 |
### Out-of-scope only
| Classification | Count |
|----------------|-------|
| DONE | 91 |
| STILL-PERCENT | 0 |
| NOT-FOUND | 0 |
| UNEXPECTED | 208 |
## Headline
- **In-scope STILL-PERCENT (Y): 0** (target: 0)
- **In-scope NOT-FOUND: 0** (target: 0)
- Out-of-scope STILL-PERCENT (expected pre-existing / import-skipped): **0**
- 212 remainder accounting: **0 STILL-PERCENT** + **208 UNEXPECTED** (0 empty, 208 value_mismatch vs map) — all **out-of-scope**; **0 in-scope stragglers**
- In-scope metrics normalized (DONE): **820** (normalize-scale-report rescale count was 820)
- No in-scope stragglers — `kpi_scale_stragglers.csv` not written.
## Confidence
- **High** on fetch-path diagnosis (code cites `lib/api/xanoPagination.ts:66–105`, scripts at lines above).
- **High** on per-metric classification when live row is found (deterministic tolerance).
- **Medium–high** on in-scope boundary (`normalize-scale-report.json` keys from `--apply`; last-run-report lacks `inScopeKeys` / create+patch=0).
