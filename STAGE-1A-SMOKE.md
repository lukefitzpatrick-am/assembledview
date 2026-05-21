# Domain 4 — Stage 1a manual smoke checklist

Run on branch `domain-4-finance-hub` with dev server (`npm run dev`). Set `NEXT_PUBLIC_FINANCE_DEBUG=1` in `.env.local` for hub console logs.

## Prerequisites

- [ ] Branch is `domain-4-finance-hub`
- [ ] `npm run test:finance-filters` passes
- [ ] Logged into finance hub (`/finance`)

## Billing tab — filter → API

1. Open **Billing** tab.
2. Set **Clients** to one client, **Publishers** to one publisher, turn off **Include drafts**, add a **Search** term.
3. Click **Load** (or **Refresh** if already loaded).
4. In DevTools **Network**, open `GET /api/finance/billing?...` for the active month.

Verify query string includes:

- [ ] `clients_id` (comma-separated ids)
- [ ] `publishers_id` (comma-separated ids)
- [ ] `include_drafts=0` when drafts switch is off
- [ ] `search` when search box non-empty
- [ ] `billing_type` when billing-type filters apply (receivable types only)

Verify UI rows match filters (client name, publisher on line items, search substring).

## Billing tab — Search Enter

1. Change **Search** text without clicking Load.
2. Press **Enter**.

Verify:

- [ ] Network shows new billing request(s) (receivables hook bumped)
- [ ] Table updates to match search (not stale pre-Enter data)

## Payables tab — filter → API

1. Open **Payables** tab.
2. Apply same style filters: client, publisher, drafts off, search; click **Load** on toolbar if dirty.
3. Inspect `GET /api/finance/payables?...` per month in range.

Verify query string includes:

- [ ] `clients_id`
- [ ] `publishers_id`
- [ ] `include_drafts=0` when drafts off
- [ ] `search` when set
- [ ] `billing_type=payable` when payable type is in the billing-type filter intersection

Verify payables list shrinks when publisher filter applied (server-side, not only client memo).

## Payables tab — drafts

1. Note payables count with **Include drafts** off.
2. Turn **Include drafts** on, **Load**.

Verify:

- [ ] More rows (or same) when draft campaigns exist in month
- [ ] `include_drafts` omitted or not `0` on payables requests

## Regression — billing route behaviour

1. Billing tab, all filters cleared, **Include drafts** on, single month.
2. Confirm media + SOW + retainer sections still render as before Stage 1a.

## Out of scope (Stage 1b+)

- Payables **status** filter (still not applied on route)
- Month lock / Auth0 / retainer publisher-hide
- Overview / Forecast filter wiring
