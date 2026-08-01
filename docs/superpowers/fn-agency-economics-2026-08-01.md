# FN — Agency economics presets (Investment cut)

Status: complete (API + explorer presets + historic FY gate)

Depends on: FN5a (Investment cut booked spine), FN0 fee-coverage verdict / C-27.

## Historic-coverage decision (BLOCKED → current-FY-only)

FN0 / cut fee probe (C-27): published-tip `schedule_months` fee line-month coverage on FY2025 is ~0% (billing ~0.1%, delivery 0%). Agency revenue includes `fee_cents`; shipping historic FYs would understate fee and distort margin.

**Ship decision:** agency-economics measures and both seeded presets are **current Australian FY only**. Historic FY + agency measures/preset → **422** `AGENCY_ECONOMICS_HISTORIC_FY_BLOCKED` with an explicit caption. Explorer shows the same gate client-side and offers “Switch to FY{current}”.

## Measure sources (file evidence)

| Measure | Source | Evidence |
|---|---|---|
| `fee_cents` | Booked cut — `schedule_months` component=`fee` | `cutQuery.ts` `measureSelectFragments` |
| `billable_cents` | FN3a composition (media+fee+adserving on basis) | `cutQuery.ts` / summaryQuery twin |
| `retainer_cents` | `clients.monthlyretainer` × months in cut range | Forecast mapping `CLIENT_FIELD_MONTHLY_RETAINER` + `buildClientLevelRevenueLines#client_monthlyretainer` (`lib/finance/forecast/mapping/definitions.ts`); attach in `agencyEconomicsAttach.ts` `loadRetainerCentsByClientName` |
| `sow_cents` | Forecast `project_scope_prip` placeholder | Always **0** — `FORECAST_MAPPING_SCHEMA_GAPS.projectScopePrip` / `buildFinanceForecastDataset` zeros; caption in `coverage.agency.sowNote` |
| `revenue_cents` | `fee + retainer + sow` (+ adserving **only if** Luke confirms) | `composeAgencyRevenueCents` — `INCLUDE_ADSERVING_IN_AGENCY_REVENUE = false` default |
| `margin_pct` | `revenue / billable × 100` | `marginPct` — returns `null` when billable=0 (omitted from row); **neutral** formatting (`AGENCY_MARGIN_RAG_THRESHOLDS = null`) |

Adserving open: forecast books `adservingTechFees` inside `service_fee_digital`, which is **not** the same as cut `adserving_cents`. Do not assume — confirm with Luke (C-28).

Grain for agency revenue measures: **client / month / fy only**. `billingAgency` / publisher / channel refused (`AGENCY_REVENUE_GRAIN_UNSUPPORTED`) — retainer is client-level; inventing a split would double-count. (Prompt asked for billingAgency grouping; refused honestly — Luke open C-28.)

## Seeded presets

Code-seeded (PG `finance_saved_views` has no cut-config column; hub saved views are localStorage report configs):

| Id | Name | Cut |
|---|---|---|
| `client-profitability-fytd` | Client profitability FYTD | dims=`client`; measures=fee, retainer, sow, revenue, billable, margin |
| `where-the-money-is` | Where the money is | dims=`channelGroup`; measures=billable, fee (still historic-gated via `presetId`) |

URL: `/finance/investment?preset=client-profitability-fytd` (plus scope params). Applying a preset on a historic scope FY auto-switches draft+apply to current FY.

## API / UI

- `POST /api/finance/sections/investment/cut` accepts optional `presetId`
- Response `coverage.agency` when agency measures requested (caption + retainer mapping ref + adserving/SOW notes)
- Explorer: Presets panel, Agency economics measure group, current-FY caption strip, margin shown as `%`

## Screenshots (capture locally)

With `NEXT_PUBLIC_FINANCE_SECTIONS=1` + admin session, current FY:

1. Preset **Client profitability FYTD** — client rows with fee / retainer / SOW / revenue / billable / margin%; caption “Current FY only”; fee coverage caveat if fee months low.
2. Preset **Where the money is** — channelGroup × billable vs fee; same current-FY caption.
3. Scope set to FY2025 + either preset or `revenue_cents` — blocked card “Agency economics — current FY only” with Switch to current FY.

## Code map

- `lib/finance/sections/investment/agencyEconomics.ts` — gates, margin, presets, captions
- `lib/finance/sections/investment/agencyEconomicsAttach.ts` — retainer load + attach
- `lib/finance/sections/investment/cutQuery.ts` — normalize gates + fetch attach
- `lib/finance/sections/investment/measureCatalog.ts` — Agency economics group
- `components/finance/sections/investment/InvestmentExplorerClient.tsx`
- Tests: `lib/finance/sections/investment/__tests__/agencyEconomics.test.ts` (via `npm run test:finance-sections`)

## Luke opens (do not assume)

1. Include schedule `adserving_cents` in agency revenue?
2. Margin RAG thresholds?
3. Allow billingAgency grain for fee-only slices vs keep revenue client-only?
