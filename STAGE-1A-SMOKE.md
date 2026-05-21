# Stage 1a Smoke Test

Branch: `domain-4-finance-hub`
Commits under test:
- `b7b6cb8` refactor(domain-4): extract shared finance list filter helpers
- `81e10c5` fix(domain-4): apply publishers_id, billing_type, include_drafts on payables route
- `d3689ff` fix(domain-4): bump receivables on billing tab when Enter pressed in search

Stage 0 discovery: `c8848d2` docs(domain-4): stage 0 discovery — finance hub audit map

## Automated checks (Cursor)

- [x] `npx tsc --noEmit` — no errors in Stage 1a paths (`lib/finance/filterBillingRecords.ts`, `lib/finance/__tests__/filterBillingRecords.test.ts`, `app/api/finance/billing/route.ts`, `app/api/finance/payables/route.ts`, `components/finance/FinanceFilterToolbar.tsx`). Full-repo `tsc` still fails on pre-existing `components/media-containers/DigitalDisplayContainer.tsx` (unrelated).
- [x] `npm run test:finance-filters` — 13/13 pass (project has no top-level `npm test` script).
- [x] Stage 1a scoped diff vs `main` — only Stage 1a files (see `git diff main --stat` for the six paths below). Note: comparing the whole branch to `main` may list other in-flight work on this branch; review the scoped stat before merge.

```
 STAGE-1A-SMOKE.md                                  |  73 +++++++++++
 app/api/finance/billing/route.ts                   |  76 ++---------
 app/api/finance/payables/route.ts                  |  72 +++++-----
 components/finance/FinanceFilterToolbar.tsx        |   5 +
 lib/finance/__tests__/filterBillingRecords.test.ts | 146 +++++++++++++++++++++
 lib/finance/filterBillingRecords.ts                | 116 ++++++++++++++++
```

**Luke:** Start the dev server (`npm run dev`) before manual checks below.

## Manual checks (Luke, dev server running)

For each check, open browser DevTools Network tab before clicking.

### Payables tab — publisher filter

1. Navigate to Finance Hub → Payables tab
2. Open filter bar, select a single publisher, click **Load**
3. Verify in Network tab:
   - Request to `/api/finance/payables?...` includes `publishers_id=<id>` in the query string
   - Response only contains records where the selected publisher appears in line items
4. Visual check: only that publisher's invoice cards appear

Result: ☐ pass  ☐ fail  Notes:

### Payables tab — include drafts toggle

1. On Payables tab, toggle "Include drafts" off, click **Load**
2. Verify Network: request includes `include_drafts=0`
3. Toggle on, click **Load**
4. Verify Network: request does NOT include `include_drafts` param (or it's truthy)

Result: ☐ pass  ☐ fail  Notes:

### Payables tab — billing type

(Stage 1a only added the `billing_type` param plumbing — payables only emit `"payable"` rows, so this is a passthrough check.)

1. Verify Network: request includes `billing_type=payable` (the client filters down to allowed payable types)
2. Verify the response is non-empty when there are payables for the month

Result: ☐ pass  ☐ fail  Notes:

### Payables tab — status (Stage 1b territory)

(Negative check — `status` filter must NOT be applied on payables until Stage 1b.)

1. With "Booked" deselected in the status filter, click **Load**
2. Confirm payable rows still appear (because derived payables are `status: "expected"`)
3. This is intentional Stage 1a behaviour — Stage 1b will fix the status filter on payables

Result: ☐ pass (rows visible)  ☐ fail (rows hidden — regression)  Notes:

### Billing tab — Search Enter bump

1. Navigate to Finance Hub → Billing tab
2. Click **Load** to get baseline data
3. In the Search box, type a client name or campaign substring
4. Press **Enter** (don't click Load)
5. Verify Network: a new request to `/api/finance/billing?...` fires immediately after Enter
6. Verify the visible results update to match the search

Result: ☐ pass  ☐ fail  Notes:

### Billing tab — Search Enter on non-billing tab does NOT bump

1. Navigate to Payables tab
2. Type in Search, press Enter
3. Verify: no extra request fires beyond the normal Payables refetch (which is auto on filter change)
4. This confirms the bump is scoped to the billing tab only

Result: ☐ pass  ☐ fail  Notes:

### Existing behaviour — no regression on billing tab

1. Navigate to Billing tab
2. Change a filter (e.g. select a client), click **Load**
3. Verify it still works as before

Result: ☐ pass  ☐ fail  Notes:

## Sign-off

- [ ] All manual checks pass
- [ ] No regressions found
- [ ] Ready to merge `domain-4-finance-hub` → `main` for Stage 1a

If any check fails, document the failure and stop. Do not merge.
