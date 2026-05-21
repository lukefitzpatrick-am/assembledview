# PR: Domain 4 — Finance hub Stage 1a (filter wiring)

**Base:** `main`  
**Head:** `domain-4-finance-hub`

## Summary

- Extract shared hub billing record filters from `GET /api/finance/billing` into `lib/finance/filterBillingRecords.ts` with unit tests (behaviour-preserving refactor).
- Wire `GET /api/finance/payables` to honour `publishers_id`, `billing_type`, `include_drafts`, plus existing `clients_id` / `search` (status deferred to Stage 1b).
- Fix finance toolbar **Search + Enter** on the Billing tab to apply draft filters and bump receivables fetch (same as **Load**).

## Test plan

- [ ] `npm run test:finance-filters`
- [ ] Manual checklist: [STAGE-1A-SMOKE.md](./STAGE-1A-SMOKE.md)

## Notes

- Payables `status` query param is still ignored until Stage 1b (hub statuses vs synthetic `expected`).
- Overview / Forecast filter wiring unchanged per audit Section 8.
