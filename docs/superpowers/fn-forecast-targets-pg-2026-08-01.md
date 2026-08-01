# Finance Forecast targets → Supabase

Status: done (2026-08-01)

## Summary

Re-pointed Finance Forecast target storage from Xano to Postgres (`revenue_forecast_lines`). Route contracts for `TargetGrid.tsx` unchanged. Catalog seeded as a mirror of code constants.

## 1. Xano data (FN0 / live probe)

| Source | Rows |
|--------|------|
| Xano `revenue_forecast_lines` (sample 5 clients × FY 2023–2027; prior full probe all 44 clients) | **0** |
| Xano `revenue_line_catalog?active=true` | **0** |
| PG `revenue_forecast_lines` before cutover | **0** |

**Migration:** skipped (no rows). Gated script remains: `npm run db:migrate-forecast-targets` (default samples 5 clients; `--full` forces full crawl). Result:

```json
{
  "scanMode": "sample-empty-skip",
  "xanoRowsScanned": 0,
  "upserted": 0,
  "pgBefore": 0,
  "pgAfter": 0
}
```

## 2. Catalog seed

`npm run db:seed-revenue-line-catalog` → **0 → 10** rows (`FINANCE_FORECAST_LINE_KEYS` / labels).

**PR note:** `revenue_line_catalog` mirrors code constants for future admin editing; **TypeScript constants remain the runtime source of truth this phase.**

## 3. Schema

`0014_revenue_forecast_targets_pg.sql` — unique index `idx_revenue_forecast_lines_natural_key` on `(clients_id, fy, line_key, month)`. Live DB already had the index (IF NOT EXISTS no-op). Apply helper: `scripts/migration/apply-0014-forecast-targets-index.ts`.

## 4. App cutover

| Surface | Change |
|---------|--------|
| `GET/POST/PATCH /api/finance/forecast/targets` | Drizzle on `revenue_forecast_lines`; admin gate + `finance_edits` via `writeStatusChangeEdit` preserved |
| Variance `target-vs-actual` | Targets via `readRevenueForecastTargetLines` → PG only |
| `isTargetStorageConfigured` | `DATABASE_URL` |
| ETL / recon | Both tables postgres-authoritative (no truncate-reload) |

### Contract parity (TargetGrid)

Unchanged response shapes:

| Method | Body |
|--------|------|
| GET | `{ lines, configured, financial_year_start_year, client_id? }` (+ optional `message` when `configured: false`) |
| POST | `{ ok: true, line }` |
| PATCH | `{ ok: true, upserted, lines }` |

Query/body fields unchanged (`fy` / `financial_year_start_year`, `client_id`, `line_key`, `month_key`, `amount`). `client_name` on PG rows is `null` (no column) — grid tolerates.

## 5. Tests

`npm run test:forecast-targets` — **11 pass, 0 fail**:

- Helpers + natural key / normalize
- PG round-trip upsert + idempotent conflict + batch
- TargetGrid response-shape smoke
- Legacy Xano client unit tests (migrate script only)

## 6. Brain / T6–T7

- `docs/brain/modules/finance-billing.md` — PG targets + T6 checklist item closed
- `docs/brain/INVARIANTS.md` — postgres-authoritative targets + catalog mirror
- `docs/superpowers/supabase-migration-handoff-2026-07-30.md` — T6 Xano dependency checklist

## Luke ops

```bash
# already applied if index exists
npx tsx scripts/migration/apply-0014-forecast-targets-index.ts

npm run db:seed-revenue-line-catalog
npm run db:migrate-forecast-targets          # no-op when Xano empty
npm run db:migrate-forecast-targets -- --full  # only if Xano gains rows
npm run test:forecast-targets
```
