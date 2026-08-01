# `/finance/forecasting` section chrome

Status: done (2026-08-01)

## What shipped

Copied hub `FinanceForecastPanel` + `forecast/TargetGrid` + `VarianceTargetVsActualView` onto sections chrome under `components/finance/sections/forecasting/*`. Hub originals untouched (FN7).

| Mode | Route state | Behaviour |
|------|-------------|-----------|
| Booked | default / no `fmode` | Same `/api/finance/forecast` engine |
| Target | `?fmode=target` | Same PG targets grid |
| Variance | `?fmode=variance` | Phase-1 actual = `billed_amount` (unchanged) |

Scope bar: `variant="fy-only"` — month range + clients **hidden** (not disabled). Apply/Reset preserve `fmode`.

## Defect status

| ID | Status on section copy |
|----|------------------------|
| **F-19** | Fixed — Take snapshot disabled until `configured === true` (probe pending = disabled + “Checking…” title); alert when `configured === false` |
| **F-22** | Already present / kept — `forecastLoadResultDisposition` + `shouldAutoReloadForecast` abort/seq guards; auto-reload only after first success |

## Booked-source finding (report only — not rewired)

`loadFinanceForecastDataset` → `fetchFinanceForecastRawFromXano()` still pages **Xano** `media_plan_versions` (full history) + `get_clients` + `get_publishers`, then may hydrate schedules via `DATA_BACKEND_FINANCE_SCHEDULE` / `hydrateVersionsFinanceScheduleSource`.

**T6 checklist:** rewire booked plan crawl off Xano before decommission — flagged in `docs/brain/modules/finance-billing.md` + `docs/superpowers/supabase-migration-handoff-2026-07-30.md`.

## Phase-2 variance hook (no behaviour)

- Typed `XeroArClientMonthActual` + TODO in `lib/finance/forecast/variance/targetVsActual.ts`
- Assembly TODO in `app/api/finance/forecast/variance/target-vs-actual/route.ts` (FN5c join ready)

## Ops

Flag: `NEXT_PUBLIC_FINANCE_SECTIONS=on` → `/finance/forecasting`.
