# Manual Billing Spreadsheet — Phase 0 verification (D1–D5)

## D1 — Composite cell keys and ordered registry

**Achievable.** Cost rows use one `Input` per `manualBillingMonths.map((month, monthIndex) => …)` for fee, ad serving, and production (`create/page.tsx` ~6301–6384). Line items use `EditableLineItemMonthInput` per month (~6210–6242).

Registry construction (screen order):

1. For each enabled media type in `mediaTypes` render order (excluding `mp_production` / `mp_fixedfee`), if accordion value `manual-billing-${medium.name}` is in `expandedAccordionValues` and `lineItems.length > 0`:
   - For each `lineItem` in `manualBillingMonths[0].lineItems[mediaKey]`
   - For each `monthYear` in `manualBillingMonths` column order → entry `{ tableKey: mediaKey, rowKind: "lineItem", rowId: lineItem.id, monthYear }`
2. If `manual-billing-costs` is expanded: rows `fee`, `adServing`, `production` × each `monthYear` with `tableKey: "cost"`, `rowKind: "cost"`.

Flat `rowIndex` / `colIndex` on each entry enable rectangular drag and arrow navigation in row-major order across tables.

## D2 — Read/write contract

**Achievable.** Line items: read `monthlyAmounts[monthYear]`; write via `syncLineItemMonthlyAmountAcrossAllMonthRows` + `handleManualBillingChange(..., "lineItem", ...)`. Cost: read `parseFloat(field.replace(/[^0-9.-]/g,""))`; write via `handleManualBillingChange(monthIndex, "fee"|"adServing"|"production", raw)`.

## D3 — Read-only exclusions

**Excluded from registry:** Reset, Pre-bill, header1, header2, per-row Total (create), Media Total / Ad Serving Total (edit), footer subtotal cells, grand total label.

## D4 — Collapsed accordions

**Rule:** Only cells under `expandedAccordionValues` are registered. Drag rectangles resolve over visible registry indices only; no auto-expand.

## D5 — Status bar

**Achievable.** Footer area inside modal; sum + count when ≥2 selected cells with numeric read values; `mbaCurrencyFormatter`.

**Confidence: 92%**
