# Read failure register (M7 / ViewState)

Postgres (and any live read path) must not soft-fail catch blocks into `[]`.
A dead backend is a **ViewState error**, not a quiet day. UI already speaks
`ViewState` / `ViewStateBoundary`; `lib/data/readResult.ts` +
`viewStateFromReadResult` are the adapter.

## Converted (this register)

| Domain | Site | Was | Now |
|---|---|---|---|
| Finance | `readFinanceBillingRecords` | catch → `[]` | throws |
| Finance | `fetchBillingOverridesFromXano` | 4xx/throw → `[]` | 404 → `[]`; else throws |
| Finance | `fetchAllPersistedFinanceStatusRows` | catch → `[]` | throws through |
| Approvals | `readMbaLineApprovals` | catch → `{ ok: true, available: false }` | `{ ok: false, error }` (API 503) |
| Plans/dashboard | `getGlobalMonthlyPublisherSpend` / `ClientSpend` | catch → empty months | throws |
| Pacing | social / programmatic / ad-serving Snowflake fact fetch | catch → `[]` | rethrow |

## Dying-at-T6 — do not convert

Xano `fetchAllXanoPages*` discovery / dual-endpoint fallbacks die with the Xano
read layer at T6. Listed so M7 does not “fix” them into ViewState churn:

| Site | Why deferred |
|---|---|
| `fetchPlanMastersFromXano` | Dual endpoint 404 → `[]` discovery |
| `fetchPacingMastersFromXano` | Same |
| `loadFinanceForecastDataset` versions `.catch(() => [])` | `fetchAllXanoPages` |
| Catch-all proxies + MBA GET `!skipLineItems` fan-out | KNOWN-ISSUES C-22 / SEC-1 |
| KPI bulk 404-skip in Xano campaign KPI crawl | Continues per-MBA; other errors already throw |

## Freshness

Where list caches set `x-cache-fetched-at` / `x-warning: served-stale-after-upstream-failure`,
surfaces pass `{ stale, fetchedAt }` into `ViewState.ready.freshness` (derived from
headers — never asserted as truth). Campaigns list (`app/mediaplans/page.tsx`) is
the reference wiring.
