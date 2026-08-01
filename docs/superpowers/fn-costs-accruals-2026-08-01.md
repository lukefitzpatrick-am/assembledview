# Finance Costs Accruals — parity checklist

Status: shipped (sections flag)  
Route: `/finance/costs/accruals`  
Flag: `NEXT_PUBLIC_FINANCE_SECTIONS=on`

## Engine + source

| Item | Value |
|---|---|
| Engine | `computeAccrualByClient` (same as hub `FinanceAccrualPanel`) |
| Formula | receivable − payable − SOW/retainer service fees |
| Receivable statuses | booked, approved, invoiced, paid |
| Fetch | `/api/finance/billing` + `/api/finance/payables` via `useCostsAccrualData` |
| Schedule source | `DATA_BACKEND_FINANCE_SCHEDULE` blob\|shadow\|rows (**default blob until M8** — same rule as FN3b invoicing) |
| Hub original | `components/finance/hub/panels/FinanceAccrualPanel.tsx` **untouched** |

Primary grid = **client × month** (hub parity). MBA compare is a rollup of the same row’s contributors in the detail sheet (not a second engine). Separate legacy `GET /api/finance/accrual` + `lib/finance/accrual.ts` line flatten is **not** used here.

## Parity checklist

- [x] Same `computeAccrualByClient` inputs (billing receivables + payables records + month range + reconcile map from `finance_edits`)
- [x] Client × month grid with client subtotals + grand total
- [x] Reconcile checkbox → `postAccrualReconcileEdit`
- [x] Detail sheet: receivable + payable contributors (MBA/campaign)
- [x] Excel export via `exportAccrualWorkbook`
- [x] Scope via `useFinanceScope` (FY / months / clients) + Apply
- [x] Four-state tiles (loading / error / empty / ready) for receivable, payable, fees, net accrual
- [x] Basis + source captions on page and tiles
- [x] Investment link per month row: `/finance/investment?client&clients&from&to&month`
- [x] Costs subnav: Overview / Invoices / Accruals
- [ ] Live visual parity vs hub tab (screenshot) — blocked if local `npm run dev` unhealthy

## Screenshots

Not captured in-session (`npm run dev` previously exited 1). After enabling the sections flag and a clean boot, capture:

1. `/finance/costs/accruals` — tiles + grid  
2. Row detail sheet — MBA breakdown + Investment link  
3. Side-by-side with classic hub `?tab=accrual` for the same month range (flag off or separate session)

## Files

- `components/finance/sections/costs/CostsAccrualsClient.tsx`
- `components/finance/sections/costs/CostsSubNav.tsx`
- `lib/finance/sections/useCostsAccrualData.ts`
- `app/finance/(sections)/costs/accruals/page.tsx`
