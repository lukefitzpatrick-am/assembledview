# Domain 4 — Stage 2 Hotfix: Production Mirror Sync — Smoke Results

**Branch:** `domain-4-long-lived`  
**Hotfix:** Production mirror reconcile on hydrate + working-state sync  
**Discovery commit:** `00a9a25`

## Automated verification (agent session)

| Check | Result | Notes |
|-------|--------|-------|
| `parsePersistedBillingScheduleToMonths` unit tests (5 cases) | **PASS** | `npx tsx --test lib/billing/__tests__/parsePersistedBillingScheduleToMonths.test.ts` — all 5 ok |
| glenda005 April 2026 shape (top-level `$500.00`, no `mediaTypes` Production) | **PASS** | Covered by unit test case 5 |
| Option 2 disagreement (sum wins) | **PASS** | Unit test case 3 |
| Legacy branch reconciliation | **PASS** | Same logic applied in both parser paths (no structural blockers surfaced) |

## Manual localhost smoke (`npm run dev`)

**Status:** Not executed in agent session — requires Auth0 login and live campaign data (glenda005, auto campaigns with billing). Complete the checklist below after pulling the hotfix commit.

**Smoke definition:** No validator blocks, no destructive toasts, Stage 2 divergence modal/banner behaviour preserved.

| # | Scenario | Steps | Expected | Result | Tester / date |
|---|----------|-------|----------|--------|---------------|
| 1 | Clean open + save (glenda005 regression) | Open glenda005 → do not edit → save campaign | Save succeeds; no production mirror validator; modal on first open per session; banner persists | **PENDING** | |
| 2 | Stage 2 smoke step 7 (non-production line item) | Auto campaign (not glenda005) → Edit Billing → change non-production line by $50 → save modal → save campaign → reopen | Save succeeds; divergence modal with line divergence; banner visible; no production validator errors | **PENDING** | |
| 3 | Production line item edit | Campaign with production line items → Edit Billing → change production line by $50 → save modal → save campaign → reopen | Save succeeds; no validator errors; divergence detects change | **PENDING** | |
| 4 | Production footer edit | Campaign with production enabled → Edit Billing → change production footer by $50 → save modal → save campaign → reopen | Save succeeds; no validator errors | **PENDING** | |

## Notes

- Pre-hotfix failure on glenda005: `Production total ($550.00) does not match the production figure under media costs ($0.00)` on hydrate — root cause was `mediaCosts.production` stuck at `$0.00` when only top-level `production` was persisted.
- The $50 delta vs saved `$500` / `$1,500` may still appear if `month.production` was edited in-session without mirror sync; Tasks 3–4 address working-state paths. Re-check after manual smoke if any discrepancy remains.
