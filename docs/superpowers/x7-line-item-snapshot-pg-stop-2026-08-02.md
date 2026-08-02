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
