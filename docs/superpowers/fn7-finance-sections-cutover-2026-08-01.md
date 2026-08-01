# FN7 — Finance sections cutover (classic hub deleted)

Status: done (2026-08-01)

## Flag

**Kill-switch REMOVED** — classic hub deleted; flag-off was a dead end (section routes showed a disabled panel with no fallback).

Sections IA is always on. `isFinanceSectionsEnabled()` returns `true` unconditionally (export kept for residual callers).

**Rollback:** `git revert 3f894bca` (FN7 cutover commit on `feature/finance-sections`).

**Current state:** FN7 cutover committed as `3f894bca` (`feat(finance)!: FN7 cutover - hub removal + redirects`).

See `docs/brain/modules/finance-billing.md`, `docs/brain/INVARIANTS.md`, `env.local.example`.

## Deletion list → replacements

| Deleted | Replacement |
|---------|-------------|
| `app/finance/FinanceHubPageClient.tsx` | `FinanceSectionsLanding` / `/finance/home` rewrite |
| `components/finance/hub/panels/FinanceOverviewPanel.tsx` | `FinanceSectionsOverview` / landing |
| `components/finance/hub/panels/FinancePayablesPanel.tsx` | `CostsInvoicesClient` |
| `components/finance/hub/FinanceHubPayablesSection.tsx` | same |
| `components/finance/hub/panels/FinanceAccrualPanel.tsx` | `CostsAccrualsClient` |
| `components/finance/hub/panels/FinanceForecastPanel.tsx` | `ForecastingPageClient` |
| `components/finance/hub/panels/forecast/TargetGrid.tsx` | `sections/forecasting/TargetGrid.tsx` |
| `components/finance/hub/panels/forecast/VarianceTargetVsActualView.tsx` | `sections/forecasting/VarianceTargetVsActualView.tsx` |
| `components/finance/hub/panels/FinanceReportPanel.tsx` | `InvestmentExplorerClient` |
| `components/finance/hub/panels/FinanceXeroQueuePanel.tsx` | `XeroExceptionsPanel` |
| `app/finance/receivables/ReceivablesPageClient.tsx` | `InvoicingPageClient` |
| `components/finance/receivables/ReceivablesClientCard.tsx` | `InvoicingClientCard` |
| `components/finance/receivables/ReceivablesMediaPlanSection.tsx` | `InvoicingMediaPlanSection` |
| `components/finance/FinanceFilterToolbar.tsx` | `SectionScopeBar` + local filters |
| `components/finance/FinancePeriodRail.tsx` | `/finance/periods` |
| `components/finance/usePayablesHideClientPaid.ts` | costs local filters |
| empty `components/finance/hub/**` | removed |

**Kept (shared):** `components/finance/receivables/{ReceivablesSummaryStrip,BilledStatusPill,ReceivableNotesButton,ReceivablesLineGroupRow,InlineScheduleAmountCell}`, `EditableFinanceGrid`, `MediaPlanActionBar`, `useFinanceStore`, `useReceivablesData`.

## Redirect matrix — test output

`npm run test:finance-sections` (2026-08-01): **66 pass / 0 fail**, including:

```
✔ isFinanceSectionsEnabled is always true (kill-switch removed, FN7)
✔ tab redirect map covers hub tabs + xero-queue alias (FN1)
✔ legacy path redirects land on sections (no ?tab= hop)
✔ next.config permanent redirects cover FN1 legacy paths + tab query map
✔ sidebar snapshot is always expandable (FN7)
✔ every finance sections page path is in the route manifest as admin-gated
✔ every app/**/page.tsx is covered by the manifest or a documented exclusion
```

| Legacy | Destination |
|--------|-------------|
| `?tab=overview` | `/finance` |
| `?tab=billing` | `/finance/invoicing` |
| `?tab=payables` | `/finance/costs/invoices` |
| `?tab=accrual` | `/finance/costs/accruals` |
| `?tab=forecast` | `/finance/forecasting` |
| `?tab=report` | `/finance/investment` |
| `?tab=queue` / `xero-queue` | `/finance/xero` |
| `/finance/receivables` (+ billing/media/scopes/retainers/sow) | `/finance/invoicing` |
| `/finance/publishers` | `/finance/costs/invoices` |
| `/finance/accrual` | `/finance/costs/accruals` |
| `/finance/forecast` | `/finance/forecasting` |

Enforced by `next.config.mjs` permanent redirects + middleware (admin) for bare `/finance` rewrite and residual `?tab=` handling.

## Sweep

- Sidebar: always expandable Finance children (flag branch removed)
- Bottom nav: `/finance` label **Finance** (`ADMIN_BOTTOM_NAV_PATHS` + manifest) — rewrites to home
- CommandPalette: section paths in manifest; `/finance` palette entry retained
- App-wide `?tab=` hardcoded links in `*.{ts,tsx}`: **none remaining**

## Register diffs

| Register | Change |
|----------|--------|
| `KNOWN-ISSUES.md` | **UX-1** Load-gate, **UX-2** $0 landing, **UX-3** hub treemaps → fixed pending live verification (not FIXED until live smoke); **C-29** Costs payables recon banner |
| `FINANCE-UX-REDESIGN.md` | F5.3 / F10.* / CF1 → fixed pending live verification |
| `finance-billing.md` + `BLAST-RADIUS.md` + `INVARIANTS.md` | sections always on / hub deleted |

## Verification

| Check | Result |
|-------|--------|
| Redirect / tab map unit tests | **PASS** (above) |
| Admin section loads | Manual — `/finance`, invoicing, costs, investment, forecasting |
| Client role fail-closed | Middleware: non-admin → 403 on `/api/finance/sections/*`; clients redirected off `/finance*` to their dashboard (`client-non-dashboard-redirect`) — no new surfaces |
| axe on four landings | **Not automated** (no axe runner in package.json) — Luke: DevTools axe/Lighthouse on `/finance`, `/finance/invoicing`, `/finance/costs`, `/finance/investment`, `/finance/forecasting` |
| Mobile spot-check | Manual — bottom nav Finance → overview rewrite; expandable sidebar sections |

## Ops

Sections IA is always on. Rollback: `git revert 3f894bca` (see Flag section above).

## Process record (Luke, 2026-08-01)

Process record (Luke, 2026-08-01): the FN7 Remove-Item sweep was executed AFTER my explicit approval in-session; the sequencing breach (running before its entry gates) was human error in ordering, not Cursor self-authorization. The author-only rule for Phase D data/cutover steps stands regardless.
