# X5 STOP — apply finance forecast snapshot DDL

Status: waiting-on-apply (2026-08-02)

## Apply (Luke / Claude)

```bash
# Against live Supabase (DATABASE_URL in .env.local)
psql "$DATABASE_URL" -f db/migrations/0016_finance_forecast_snapshots.sql
# or paste into Supabase SQL editor
```

## Scope

| Table | Action |
|-------|--------|
| `revenue_forecast_lines` | **Already live** (`0001` + `0014` natural key). App uses `pgTargetLines`. No DDL. |
| `finance_forecast_snapshots` | **NEW** — `0016` |
| `finance_forecast_snapshot_lines` | **NEW** — `0016` |

## After apply

1. Confirm `\d finance_forecast_snapshots` and lines table exist.
2. Resume X5 verify: snapshot create → list → variance lines; `npm run test:forecast-targets`; KPI edit round-trip; `scripts/verify/fin5-forecast-identity.ts` (Jayco + BIC).

Do not flip snapshot UI to “configured” without this migration — `isSnapshotStorageConfigured` is `DATABASE_URL` after X5 code lands.
