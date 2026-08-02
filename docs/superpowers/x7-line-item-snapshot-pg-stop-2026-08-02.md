# X7 STOP — flip Snowflake line-item snapshot to Postgres

Status: waiting-on-parity (2026-08-02) — **do not flip**; first live report is not clean

## What landed (code)

- `lib/snowflake/fetchAllPgLineItems.ts` — PG `line_items` × `media_plan_versions` → same snapshot row shape as Xano crawl
- `lib/snowflake/syncPgLineItems.ts` — `runLineItemSnapshotSync` + MBA parity (row counts + burst spend sums)
- Cron `GET /api/cron/xano-line-item-sync` reads `LINE_ITEM_SNAPSHOT_SOURCE`
- MERGE target unchanged: `ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT`

## Do not flip yet

Default remains **`xano`** (safe). Warehouse stays Xano-fed until Luke sets env after a clean parity report.

## Parity cycle (Luke)

1. Set Vercel / `.env.local`: `LINE_ITEM_SNAPSHOT_SOURCE=parity`
2. Either wait for the daily cron, or invoke with cron secret:
   `GET /api/cron/xano-line-item-sync`
3. Or author-only (no Snowflake write):
   `npm run verify:line-item-snapshot-parity`
4. Inspect JSON: `parity.mba_mismatches`, `spend_delta_abs_sum`, `sample` / `mismatched`

Clean gate (suggested): `mba_mismatches = 0` and `spend_delta_abs_sum ≤ 0.01` (or Luke-waived known ETL skew MBAs).

### First live parity (2026-08-02, author verify)

| Metric | Value |
|--------|------:|
| xano_raw / pg_raw | 13,898 / 13,987 |
| xano_deduped / pg_deduped | 2,073 / 2,578 |
| mba_count (both) | 173 |
| mba_mismatches | **28** |
| row_delta_abs_sum | 505 |
| spend_delta_abs_sum | ~1.26M |

Largest spend deltas: `PENFOLD020`, `PENFOLD015`, `PENFOLD018` (duplicate-class MBAs in `PLANS_DUPLICATE_CLASS_MBAS`). Many Xano channel tables logged **“Pagination appears unsupported; stopping early after page 2”** while still marking `complete=true` — Xano side under-counts; treat Xano completeness confidence **&lt;70%**. Prefer investigating pagination / tip-version scope before flipping.

## Follow-up (hold flip — earn the conclusion)

1. **Tip-scope PG** — `fetchAllPgLineItems()` defaults to `published_version_id` only (`scope: "all"` diagnostic).
2. **Pagination honesty** — unsupported-pagination early-stop now sets `complete=false` (was wrongly `true`).
3. **Probe one big MBA** — `scripts/verify/probe-xano-line-item-pagination.ts --mba=PENFOLD020`.
4. Set **`LINE_ITEM_SNAPSHOT_SOURCE=parity`** for a cron cycle (MERGE still Xano). Needs a production redeploy for the new env to bind.
5. PENFOLD deltas may resolve to “PG right, Xano always under-counted” — **earn that**, do not waive.

### Tip-scoped re-run (2026-08-02, after fix)

| Metric | Pre (all-versions PG) | Post (tip PG) |
|--------|----------------------:|--------------:|
| pg_raw / pg_deduped | 13,987 / 2,578 | **1,927 / 1,927** |
| xano_deduped | 2,073 | 2,073 |
| xano_complete | true (lie) | **false** |
| mba_mismatches | 28 | **55** |
| spend_delta_abs_sum | ~1.26M | **~451.5k** |

Probe `PENFOLD020`: **16/20** channel tables `complete=false` (early-stop). Tip-scope closed the “PG inflated by history” gap, but mismatches rose — many MBAs now show **Xano rows > tip PG** (missing/wrong `published_version_id`, or Xano channel tables not tip-only). Flip still **held**.

### Tip×tip re-run (2026-08-02, v3 — both sides tip)

Xano crawl filtered to PG `published_version_id` (FK `media_plan_version`, fallback `version_number`). Cron / `LINE_ITEM_SNAPSHOT_SOURCE` unchanged; MERGE still full Xano crawl.

| Metric | Tip PG vs all-version Xano | Tip×tip |
|--------|---------------------------:|--------:|
| xano_raw (scoped) / pg_raw | 2,073 deduped / 1,927 | **1,320 → 1,293 deduped / 1,927** |
| mba_mismatches | 55 | **26** |
| spend_delta_abs_sum | ~451.5k | **~117.2k** |
| xano_complete | false | **false** (pagination early-stop) |

**Pointer audit:** 178 masters; 176 with `published_version_id`; **2 null** (`golf022`, `test123001`); **7 stale vs latest booked/approved/completed** (`BOSS011`, `buxton003`, `candel002`, `cuheal001`, `hartm009`, `jayco004`, `malay001`) — published tip is often newer planned/cancelled than the latest booked row.

**Reader contract (from code, confidence 88%):** Snowflake/mart consumers of `MART.XANO_LINE_ITEMS_SNAPSHOT` do **not** tip-select or version-filter (e.g. `sp_refresh_fixed_cost_reported_daily` selects `WHERE FIXED_COST_MEDIA = TRUE` only). Ingest MERGE keys on `LINE_ITEM_ID` and collapses dupes by newest `xano_created_at` — it does not choose a published tip. Live pacing pages tip-select from Xano channel tables (`filterByMbaAndVersion`), not from the snapshot. Therefore “correct” snapshot contents are **pre-scoped tip rows** (one live plan version per MBA).

Residual mismatches still dominated by Xano pagination under-count (PG > tip Xano on PENFOLD*/krusty001). Flip still **held**.

## Flip (after clean report)

```bash
# Vercel env (production cron)
LINE_ITEM_SNAPSHOT_SOURCE=postgres
```

Cron path `/api/cron/xano-line-item-sync` can keep serving until T7 rename/retire; only the env source changes.

## Retire later (T7)

- Rename cron path off `xano-line-item-sync`
- Stop calling `fetchAllXanoLineItems` for this feed
- Update register §3 + `DISPOSITIONS` T6 → done
