# Module: Admin, Tasks, Knowledge & Scripts

## Admin & users

- `app/api/admin/users/route.ts` — the real work: `requireAdmin` → zod → Auth0 Management API (create user, assign role by **Role ID** `rol_…` from `AUTH0_ROLE_ADMIN_ID`/`AUTH0_ROLE_CLIENT_ID`, not names) → password ticket → invite email. Rolls back the created user on failure. Rejects numeric `clientSlug` (historical bug guard).
- `app/admin/**` uses client-side `AdminGuard`; server enforcement lives only in the API routes.
- `app/management/page.tsx` is a stub.

## Scopes of work

- List (`app/scopes-of-work/page.tsx`) groups via `lib/scopes/groupScopesByStatus.ts` — known statuses plus **"Other / unrecognised"** so typo'd/new statuses never vanish. Columns: client, scope ID, value, scheduled % (not "Used"); search matches visible fields only (`scopeListHelpers`). Gap label from `summarizeScopeScheduleCoverage`. Read-only view at `/scopes-of-work/[id]`; PDF + Edit from the list.
- Create/edit surface cost/billing array `.min()` errors through AV-9 `<Field>` (`formArrayError`).

## Tasks ("codex")

- `app/tasks/**` + `components/tasks/TaskFormDialog.tsx` + `app/api/codex/{tasks,tasks/[id],client_notes}` — Xano-backed task board. `_shared.ts` has the retry/backoff wrapper (5s timeout, 2 retries, 6s overall).
- **`lib/codex/**` is the Tasks domain, not AVA** — naming is misleading; it's just types.
- List UI uses `ViewState` (`lib/ui/viewState.ts`) via `ViewStateBoundary` so a fetch failure cannot render alongside "no tasks" empty copy; client/status/assignee/search exclusion uses `filtered-empty` + Clear filters.

## Knowledge hub (`src/**`)

- `src/lib/learning/` — Fuse.js search, formula solver/evaluator, UTM builder. `src/data/learning/terms.json` (467KB) is **generated** by `npm run build:learning` from `terms.raw.csv` — formula DSLs live in `KNOWN_FORMULAS` inside `scripts/build-learning-terms.ts` (edit there, then rebuild); do not invent expressions only in the JSON.
- `solveForVariable` inverts via bracketed bisection on a geometric probe ladder (adjacent defined probes only; root verified against the residual). Power-law/monomial fit is gone — margin and ratio formulas reverse-solve correctly. Percent display goes through `formatPercent(..., { decimals: 2 })` so calculator output stays `"40.00%"`.
- Percent calculators multiply by 100 in the expression (not in `formatValue`); currency display uses en-AU/`formatMoney`. Evaluator throws a named error if any non-numeric token remains after substitution.
- Calculator cards (`FormulaCalculator`) auto-calc on input change — no Calculate button; result is `readOnly` (selectable) with a copy control.
- Consumers: `app/knowledge/**` (9 pages) + `components/learning/*`. Nothing else imports `src/**` except `src/ava` (AVA prompt primitives).
- The `src/` vs `lib/` split is historical, not architectural — same `@/` alias, no boundary.

## Demand Flow / behavioural planner

- `app/tools/behavioural-planner/**` + `components/planning/**` + `lib/planning/**`. Audience draft ids are UUID-minted (`nextAudienceId`) so load-saved + add cannot collide. Workflow persists to `sessionStorage` key `av:behavioural-planner:session:v1` (plus beforeunload warn). Export deck brief uses Stage A `campaignName` via `buildExportDeckBrief` — never brand/client as campaign. Insight cards/deck parse `THE HEADLINE` (`summariseInsight`); audience-definition lines are not a headline fallback. Null RM affinity is excluded from BCS A (not invented as 100); Stage E shows how many were excluded. Compare card "Mix-weighted reach %" is allocation-mix × weekly channel reach (rename only — maths unchanged pending Luke). OutcomeCharts syncs audience chip after load so Reach×Index / quadrant are not stuck empty while DFII falls back.

- Taxonomy: KPI backfills/migrations (+ data artifacts under `scripts/data/kpi-best-practice/`), codegen (`gen-*-expert-grid*`, `generate-container-channel-config`), one-shot refactor scripts (`wire-*`/`fix-*`/`finish-*` — **rewrite source in place; unsafe to re-run**), learning build, Snowflake migrations (`npm run snowflake:migrate:pacing`), export/deck validation, Xano diagnostics.
- `scripts/**` is a **knip entry point** — scripts keep otherwise-dead lib exports alive, and they compile against production types (refactors can break them silently).
- Only a few are wired into package.json; the rest are ad-hoc historical artifacts.
- `scripts/x5-1-mba-line-approvals.mjs` contains the only hardcoded Xano host in the repo (script-only fallback). Live path is `/api/mba-line-approvals` → `lib/data/readApprovals.ts` / `writeApprovals.ts` (see finance-billing module).
