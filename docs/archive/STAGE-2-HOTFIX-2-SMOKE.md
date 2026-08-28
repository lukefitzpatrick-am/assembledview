# Domain 4 — Stage 2 Hotfix 2: Divergence Operand Shape — Smoke Results

**Branch:** `domain-4-long-lived`  
**Hotfix:** `compareBillingDivergence` attach-computed-line-items + fallback skip when computed has no line items  
**Discovery commit:** `0dba200c`

## Automated verification (agent session)

| Check | Result | Notes |
|-------|--------|-------|
| Existing comparator tests (11 cases) | **PASS** | Unchanged behaviour when both operands have `lineItems` |
| New tests 12–15 (production shape) | **PASS** | `npm run test:billing-divergence` — 15/15 ok |
| glenda007 May/June 2026 fixture (test 15) | **PASS** | Saved with line items vs computed month-only → `isDivergent: false`, no `divergentLines` |
| No-attach fallback (test 12) | **PASS** | No false `missing_in_computed` when computed lacks line items |
| Attach callback path (tests 13–14) | **PASS** | Match → not divergent; extra computed line → `missing_in_saved` |

## Manual localhost smoke (`npm run dev`)

**Status:** Not executed in agent session — requires Auth0 login and live campaign UI. Complete the checklist below after pulling the hotfix commit.

**Smoke definition:** No four-line `missing_in_computed` false positive on glenda007; glenda005 save regression preserved; legitimate divergence still surfaces when expected.

| # | Scenario | Steps | Expected | Result | Tester / date |
|---|----------|-------|----------|--------|---------------|
| 1 | glenda007 regression | Open `/mediaplans/mba/glenda007/edit` (v9) | **Not** four lines as `missing_in_computed`. Either no banner (PD2 not in working yet) **or** banner with PD2 as `missing_in_saved` only | **PENDING** | |
| 2 | glenda005 production mirror regression | Open glenda005 → save without changes | Save succeeds; no validator block; no false divergence banner | **PENDING** | |
| 3 | Clean auto campaign | Open another auto campaign with no container/billing drift | No modal, no banner, no validator block on save | **PENDING** | |
| 4 | Edit-then-save legitimate divergence | Auto campaign → Edit Billing → change line by $50 → save → reopen | Divergence flagged (line or month); not false `missing_in_computed` storm | **PENDING** | |

## Failure stop condition

If glenda007 still shows **four** `missing_in_computed` lines after this hotfix, **stop** — the operand-shape fix did not land at the call sites or attach callback is not running.

## Notes

- Pre-hotfix: `compareBillingDivergence(saved, autoReferenceBillingMonths)` compared saved line items against computed months with **no** `lineItems` → every saved id reported `missing_in_computed`.
- Post-hotfix hydrate/debounced paths pass `attachComputedLineItems: (months, mode) => attachLineItemsToMonths(months, mode)` so computed operand is shape-compatible before id comparison.
- PD2 (`glenda007PD2`) missing from persisted `billingSchedule` is documented in `AUDIT-DOMAIN-4.md` — legitimate `missing_in_saved` after append-merge is expected, not a hotfix target.
