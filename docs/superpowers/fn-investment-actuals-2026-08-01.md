# FN — Investment cut Actuals (Xero)

Status: complete (API + explorer grain UI + live coverage probe)

Depends on: FN5a/b (Xero AR ingest + T5 mba_number), FN3d (Investment cut booked spine).

## Measures

| Measure | Meaning |
|---|---|
| `invoiced_cents` | Xero AR `total` × 100 at MBA×month |
| `paid_cents` | Xero AR `amount_paid` × 100 at MBA×month |
| `invoiced_delta_cents` | Booked billable − invoiced (same cut grain) |

**Source join:** `xero_ar_invoices` → `xero_invoice_matches` → `finance_run_items` (+ `finance_periods.period_month`) when a match exists; else `xero_ar_invoices.mba_number` (T5 reference parse) + `issue_date` month. Never prorate across lines.

**API:** `POST /api/finance/sections/investment/cut` — Actuals only when dims/filters ⊆ MBA×month grain; otherwise **422** `{ error: "ACTUALS_GRAIN_UNSUPPORTED", message, blockedDimensions, blockedFilters, measures }`.

**Coverage:** `coverage.ar.matchedPct` = % of booked billable (MBA×month) with any AR link; honesty strip on Investment explorer.

## Grain-rule matrix (dim × Actuals)

Booked measures (`media` / `fee` / `adserving` / `billable`) are allowed for every dim. Actuals:

| Dim | invoiced / paid / Δ |
|---|---|
| client | allowed |
| month | allowed |
| fy | allowed |
| (empty dims / grand total) | allowed |
| channelGroup | **BLOCKED** |
| channel | **BLOCKED** |
| publisher | **BLOCKED** |
| buyType | **BLOCKED** |
| market | **BLOCKED** |
| billingAgency | **BLOCKED** |

Line-level **filters** (channels, channelGroups, publishers, buyTypes, markets, billingAgency) also refuse Actuals. Publisher copy: *“Invoiced actuals aren't available by publisher — Xero invoices don't carry line detail”*.

Explorer picker: measure group **Actuals (Xero)** — invalid combos **disabled with tooltip**, not hidden. Adding a line-level dim while Actuals are selected is likewise disabled+tooltip.

## Live coverage (FY2025 billing, all clients)

Probe: `npm run probe:finance-investment-actuals -- --fy=2025`

| Metric | Value |
|---|---|
| Booked billable | 858,482,942 ¢ |
| Invoiced | 390,197,272 ¢ |
| Paid | 344,975,113 ¢ |
| Invoiced Δ (billable − invoiced) | 468,285,670 ¢ |
| AR matchedPct | **35.6%** (305,304,357 / 858,482,942 ¢ linked) |
| Publisher match (booked) | 48.9% |
| Client rows | 32 |

Notes: live `xero_invoice_matches` / `finance_run_items` are empty — coverage uses the T5 `mba_number` fallback. `xero_ar_invoices` has ~1.3k non-voided rows.

Grain refusal (publisher + `invoiced_cents`) returns typed `ACTUALS_GRAIN_UNSUPPORTED` as above.

## Explorer

- Route: `/finance/investment` (sections flag) → `InvestmentExplorerClient`
- Honesty strip shows `AR matched {pct}%` + AR note when Actuals selected
- Grain error state offers “Drop Actuals measures”
- Classic hub Report tab / `FinanceReportPanel` untouched

## Screenshots

Capture locally with `NEXT_PUBLIC_FINANCE_SECTIONS=1` (admin session):

1. Default cut (channelGroup × publisher) — Actuals chips disabled; hover shows grain explanation.
2. Dims = client only, Actuals enabled — table with Invoiced / Paid / Δ + honesty strip `AR matched 35.6%`.
3. Force publisher + invoiced via URL/API — grain-error card with publisher copy.

## Code map

- `lib/finance/sections/investment/cutGrain.ts` — allow/refuse + matrix
- `lib/finance/sections/investment/cutArQuery.ts` — AR SQL + merge + coverage
- `lib/finance/sections/investment/measureCatalog.ts` — Booked / Actuals (Xero) groups
- `components/finance/sections/investment/InvestmentMeasurePicker.tsx`
- `components/finance/sections/investment/InvestmentExplorerClient.tsx`
- Tests: `cutGrain.test.ts` (+ normalize grain case)
- Probe: `npm run probe:finance-investment-actuals`
