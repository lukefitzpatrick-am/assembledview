# X7 STOP — flip Snowflake line-item snapshot to Postgres

Status: **flip earned** (2026-08-02, Luke/Claude) — prod `LINE_ITEM_SNAPSHOT_SOURCE=postgres` **only after** the X-series merge ships the new sync code; until then keep **`parity`** (MERGE still Xano).

## What landed (code)

- `lib/snowflake/fetchAllPgLineItems.ts` — PG `line_items` × `media_plan_versions` → same snapshot row shape as Xano crawl
- `lib/snowflake/syncPgLineItems.ts` — `runLineItemSnapshotSync` + MBA parity (row counts + burst spend sums)
- Cron `GET /api/cron/xano-line-item-sync` reads `LINE_ITEM_SNAPSHOT_SOURCE`
- MERGE target unchanged: `ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT`

## Verdict (earned)

Hand-verified in Xano UI against tip PG:

| MBA | Xano UI tip rows | Tip PG rows | Crawl (tip-scoped) |
|-----|-----------------:|------------:|-------------------:|
| `glenda008` | **4** | **4** | 3 (under-count) |
| `CHALLEN004` | **18** | **18** | 16 (under-count) |

**Conclusion:** residual tip×tip mismatches are Xano crawl pagination under-count, not PG inflation. **PG tip is the snapshot source of truth.** Flip is earned; do not waive on crawl row counts.

### Prod flip gate

1. Ship X-series merge that includes tip-scoped PG sync + parity code.
2. Then set Vercel production:

```bash
LINE_ITEM_SNAPSHOT_SOURCE=postgres
```

Until that merge is live in prod, leave **`parity`** (or default `xano` if parity env is not bound). Cron path can keep `/api/cron/xano-line-item-sync` until T7 rename.

### golf022 — closed

Pointer audit `null published_version_id` on master `191`: **zero versions in both stores** (PG + Xano). NULL tip is correct. Author SQL `scripts/fix-golf022-published-pointer.sql` (`a07d1224`) — SELECT only; **UPDATE stays unapplied**. No further action.

`test123001` remains the other null pointer (out of X7 flip scope).

## Parity history (how we earned it)

### First live parity (all-versions PG)

| Metric | Value |
|--------|------:|
| xano_raw / pg_raw | 13,898 / 13,987 |
| xano_deduped / pg_deduped | 2,073 / 2,578 |
| mba_mismatches | **28** |
| spend_delta_abs_sum | ~1.26M |

### Tip-scoped PG re-run

| Metric | Pre (all-versions PG) | Post (tip PG) |
|--------|----------------------:|--------------:|
| pg_raw / pg_deduped | 13,987 / 2,578 | **1,927 / 1,927** |
| mba_mismatches | 28 | **55** |
| spend_delta_abs_sum | ~1.26M | **~451.5k** |
| xano_complete | true (lie) | **false** |

### Tip×tip re-run (v3 — both sides tip)

| Metric | Tip PG vs all-version Xano | Tip×tip |
|--------|---------------------------:|--------:|
| xano tip / pg tip | 2,073 / 1,927 | **1,293 / 1,927** |
| mba_mismatches | 55 | **26** |
| spend_delta_abs_sum | ~451.5k | **~117.2k** |

**Pointer audit:** 178 masters; 176 with pointer; 2 null (`golf022` closed above, `test123001`); 7 stale vs latest booked/approved/completed.

**Reader contract:** warehouse consumers of `MART.XANO_LINE_ITEMS_SNAPSHOT` do not tip-select — ingest must pre-scope tip rows. Live pacing tip-selects from Xano channel tables, not the snapshot.

Author verify: `npm run verify:line-item-snapshot-parity`. Probe: `scripts/verify/probe-xano-line-item-pagination.ts --mba=PENFOLD020`.

## Retire later (T7)

- Rename cron path off `xano-line-item-sync`
- Stop calling `fetchAllXanoLineItems` for this feed
- Update register §3 + `DISPOSITIONS` T6 → done
