# Stage 2 Smoke Test — Billing Divergence Detection

Branch: `domain-4-long-lived`

Stage 2 scope: replace unconditional `setIsManualBilling(true)` on billing hydrate with saved-vs-auto divergence detection; modal (session acknowledgment) + persistent banner.

## Automated checks (Cursor)

- [x] `npm run test:billing-divergence` — 11/11 pass (`lib/billing/__tests__/compareBillingDivergence.test.ts`)
- [x] `npx tsc --noEmit` — exit 0 (full repo)
- [x] Hydrate path uses `compareBillingDivergence(savedBillingMonths, autoReferenceBillingMonths)` once per MBA/version when auto reference is ready
- [x] Working-state effect debounces 500ms, compares `workingBillingMonths` vs `autoReferenceBillingMonths`, does not re-open modal
- [x] `handleResetBillingScheduleToAuto` clears `billingDivergence` immediately

**Luke:** Start the dev server (`npm run dev`) before manual checks below.

## Manual checks (Luke, dev server running)

### 1. Existing manual billing campaign (first visit)

1. Open a campaign known to have manual billing differences from auto
2. Expect: divergence modal on first open this session; banner visible above Billing Schedule

Result: ☐ pass  ☐ fail  Notes:

### 2. Acknowledge modal

1. Click **Acknowledge** on the modal
2. Expect: modal closes; banner remains

Result: ☐ pass  ☐ fail  Notes:

### 3. Reload same tab

1. Reload the page (same tab/session)
2. Expect: no modal (sessionStorage hit); banner still visible

Result: ☐ pass  ☐ fail  Notes:

### 4. New tab same campaign

1. Close tab, open the same campaign in a new tab
2. Expect: modal appears again; banner visible

Result: ☐ pass  ☐ fail  Notes:

### 5. Clean auto campaign

1. Open a campaign with no manual billing divergence from auto
2. Expect: no modal; no banner; not forced into manual mode

Result: ☐ pass  ☐ fail  Notes:

### 6. Auto campaign save without changes (regression)

1. Open auto campaign, save without billing edits, reopen
2. Expect: no modal; no banner

Result: ☐ pass  ☐ fail  Notes:

### 7. Edit Billing → manual divergence

1. Auto campaign → Edit Billing → change a line amount by $50 → save modal → save campaign → reopen
2. Expect: modal with line divergence; banner visible

Result: ☐ pass  ☐ fail  Notes:

### 8. Reset billing to auto

1. From Edit Billing, reset billing to auto
2. Expect: banner disappears immediately (before save)

Result: ☐ pass  ☐ fail  Notes:

### 9. Save after reset

1. Save campaign after reset, reopen
2. Expect: no modal; no banner

Result: ☐ pass  ☐ fail  Notes:

## Sign-off

- [ ] All manual checks pass
- [ ] No regressions found
- [ ] Ready to continue Domain 4 on `domain-4-long-lived`

If any check fails, document the failure and stop. Do not merge until resolved.
