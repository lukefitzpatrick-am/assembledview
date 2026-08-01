# Finance Costs section — contract + coverage

Status: shipped (sections flag)  
Flag: `NEXT_PUBLIC_FINANCE_SECTIONS=on`

## Endpoint

`GET /api/finance/sections/costs/summary`

Query params (same scope shape as sections summary, plus optional filters):

| Param | Meaning |
|---|---|
| `fy` | AU FY start year |
| `from` / `to` | `YYYY-MM` inclusive range (clamped to FY) |
| `clients` | comma-separated client ids |
| `channels` | comma-separated `line_channel` values |
| `publishers` | comma-separated substring filters on publisher label |

Auth: `requireFinanceAdmin`.

### Response (contract)

- `kpis`: `bookedCostFytdCents`, `apBilledFytdCents`, `unbilledAccrualCents`, `basis`
- `coverage`: identity % + AP-month % (see below)
- `byMonth` / `byPublisher` / `topPublishers` / `publisherMonths` (booked vs AP + expandable `bills`)
- `unattributedBills` (never silently dropped)
- `attributionRule` (human-readable string)
- `_debugSql.bookedByPublisherMonth` (documented SQL)

### Booked cost SQL (delivery / FN3a)

Published tip · `schedule_months` · `basis = delivery` · `component IN (media, fee, adserving)` · exclude media where `client_pays_for_media` · publisher via FN0 per-channel CASE (`publisherIdentitySql`) · join via `SCHEDULE_LINE_JOIN_SQL` (exact id **or** suffix after `::`).

Probe: `npm run probe:finance-costs-summary -- --fy=2025`

## Attribution rule (written down)

1. **`xero_contact_links` is not used for AP→publisher.** That table maps Xero contacts → **clients** (AR / PC6). It has no publisher key; inventing a bridge through clients would be false matching.
2. **Heuristic name match (flagged `heuristic`):** `normalizeContactKey(xero_contacts.name)` equals `normalizeContactKey(publishers.publisher_name)`, else equals a booked publisher identity label in scope.
3. **Else → Unattributed bills** group. Never dropped from totals or the invoices table.

(`publishers.billingagency` is AA vs AM routing, not a Xero contact link — also not used.)

## Live coverage (FY2025 full year, all clients — probe 2026-08-01)

| Metric | Value |
|---|---|
| Booked cost | $8,569,868.95 |
| AP billed | $7,690,358.00 |
| Unbilled accrual (headline) | $879,510.95 |
| % booked $ with publisher identity | **48.4%** |
| % booked $ in months with any AP bill | **100%** |
| Attributed AP bills | 77 |
| Unattributed AP bills | 655 |
| publisher×month rows | 252 |

Remaining Unspecified booked $ is mostly schedule cells that still do not join a line (legacy non-`billing-*::` keys) or fee/adserving without identity fields.

## UI

- `/finance/costs` — KPIs, publisher treemap/bar from this endpoint (not `global-monthly-*`), month trend, top publishers.
- `/finance/costs/invoices` — publisher × month table, expand to AP rows (invoice #, status, due, amount due, PDF URL when `pdf_file.url` present), channel/publisher filters + `useFinanceScope`, Excel export (`exportCostsInvoicesExcel`).

## Screenshots

Local `npm run dev` was not healthy at probe time (prior exit 1), so UI screenshots were not captured in-session. After `NEXT_PUBLIC_FINANCE_SECTIONS=on` and a clean dev boot, capture `/finance/costs` and `/finance/costs/invoices` manually.

## Related debt

- **C-26:** same join-key mismatch still affects `lib/data/dashboardMonthlySpend.ts` (classic hub treemaps) until that path adopts `SCHEDULE_LINE_JOIN_SQL` / FN0 identity.
