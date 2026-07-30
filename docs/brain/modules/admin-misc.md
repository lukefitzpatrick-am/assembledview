# Module: Admin, Tasks, Knowledge & Scripts

## Admin & users

- `app/api/admin/users/route.ts` — the real work: `requireAdmin` → zod → Auth0 Management API (create user, assign role by **Role ID** `rol_…` from `AUTH0_ROLE_ADMIN_ID`/`AUTH0_ROLE_CLIENT_ID`, not names) → password ticket → invite email. Rolls back the created user on failure. Rejects numeric `clientSlug` (historical bug guard).
- `app/admin/**` uses client-side `AdminGuard`; server enforcement lives only in the API routes.
- `app/management/page.tsx` is a stub.

## Tasks ("codex")

- `app/tasks/**` + `components/tasks/TaskFormDialog.tsx` + `app/api/codex/{tasks,tasks/[id],client_notes}` — Xano-backed task board. `_shared.ts` has the retry/backoff wrapper (5s timeout, 2 retries, 6s overall).
- **`lib/codex/**` is the Tasks domain, not AVA** — naming is misleading; it's just types.

## Knowledge hub (`src/**`)

- `src/lib/learning/` — Fuse.js search, formula solver/evaluator, UTM builder. `src/data/learning/terms.json` (467KB) is **generated** by `npm run build:learning` from `terms.raw.csv` — formula DSLs live in `KNOWN_FORMULAS` inside `scripts/build-learning-terms.ts` (edit there, then rebuild); do not invent expressions only in the JSON.
- `solveForVariable` inverts via bracketed bisection on a geometric probe ladder (adjacent defined probes only; root verified against the residual). Power-law/monomial fit is gone — margin and ratio formulas reverse-solve correctly. Percent display goes through `formatPercent(..., { decimals: 2 })` so calculator output stays `"40.00%"`.
- Percent calculators multiply by 100 in the expression (not in `formatValue`); currency display uses en-AU/`formatMoney`. Evaluator throws a named error if any non-numeric token remains after substitution.
- Calculator cards (`FormulaCalculator`) auto-calc on input change — no Calculate button; result is `readOnly` (selectable) with a copy control.
- Consumers: `app/knowledge/**` (9 pages) + `components/learning/*`. Nothing else imports `src/**` except `src/ava` (AVA prompt primitives).
- The `src/` vs `lib/` split is historical, not architectural — same `@/` alias, no boundary.

## Scripts (`scripts/**`, 56 files)

- Taxonomy: KPI backfills/migrations (+ data artifacts under `scripts/data/kpi-best-practice/`), codegen (`gen-*-expert-grid*`, `generate-container-channel-config`), one-shot refactor scripts (`wire-*`/`fix-*`/`finish-*` — **rewrite source in place; unsafe to re-run**), learning build, Snowflake migrations (`npm run snowflake:migrate:pacing`), export/deck validation, Xano diagnostics.
- `scripts/**` is a **knip entry point** — scripts keep otherwise-dead lib exports alive, and they compile against production types (refactors can break them silently).
- Only a few are wired into package.json; the rest are ad-hoc historical artifacts.
- `scripts/x5-1-mba-line-approvals.mjs` contains the only hardcoded Xano host in the repo (script-only fallback). Live path is `/api/mba-line-approvals` → `lib/data/readApprovals.ts` / `writeApprovals.ts` (see finance-billing module).
