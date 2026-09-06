# CONVENTIONS — how code is written here

Patterns that already hold across the repo. Follow them; do not introduce a second way of doing the same thing.

## Stack

Next.js 15.5 App Router · React 18.3 · TypeScript 5 (`strict: false`, `strictNullChecks: true`) · Tailwind 3.4 + shadcn/Radix · Zustand 5 · react-hook-form 7 + zod 4 · Recharts 2 · Drizzle 0.45 over `postgres` 3.4 · Auth0 4.11 · Anthropic SDK · snowflake-sdk 2.3 · exceljs, jsPDF 4, pptx-automizer · Vercel Blob · vitest 4 + `tsx --test`.

## Directory law

| Put it in | When |
|---|---|
| `lib/<domain>/` | Any business rule, calculation, mapping or contract. **All of them.** |
| `app/api/**/route.ts` | HTTP shape, auth, tenant check, error mapping. Thin |
| `app/**/page.tsx` | Route composition and data fetching. Not calculations |
| `components/<domain>/` | Presentation and local interaction state |
| `db/schema/*.ts` | Drizzle mirror of an applied SQL migration |
| `db/migrations/00NN_*.sql` | The actual schema change (applied by hand) |
| `docs/brain/` | Durable architectural knowledge |
| `docs/superpowers/{plans,specs}/` | Time-bound work with an explicit `Status:` |
| repo root | Nothing new. Ever |

A calculation that appears in a component is a defect even when the numbers are right — the next surface that needs it will re-derive it slightly differently, and that is how the fee bugs happened.

## Data access

- Import `db` from `@/db`. It is a lazy proxy — importing it does not open a connection.
- Reads and writes go through a `lib/data/read*.ts` / `write*.ts` helper where one exists. Do not scatter Drizzle queries through route handlers.
- Shape rows for API responses with `lib/data/toApiRow.ts` (camelCase → snake_case, numeric strings → numbers). `IDENTIFIER_TEXT_FIELDS` (`mba_number`, `po_number`, `abn`, `postcode`, `invoice_number`, `invoice_key`, `client_contact`, `mbaidentifier`, `line_item_id`, `mp_plannumber`) must **never** be coerced to numbers.
- Money in the plan core is integer cents in `*_cents` columns. Convert at the edge, never mid-calculation.
- Some tables are reached with `sql` tagged templates rather than the query builder — finance periods and runs, notifications, Xero matching, working drafts. Match the existing mapper style in `lib/finance/periods/postgresStore.ts` rather than inventing a new one.
- **Mirror the whole index, not just its columns.** When a migration creates an index, the Drizzle mirror must carry the column *order and direction* and the *partial `WHERE` predicate* too. Dropping either has happened across seven migrations and it is what `db:drift` exists to catch. A partial UNIQUE index is an integrity rule; a mirror that loses its `WHERE` has lost the rule.
- `db/index.ts` is `server-only`. Never let it reach an Edge or client bundle. `postgres` is in `serverExternalPackages`; `instrumentation.ts` must not import anything that pulls in `db/`.

## API routes

Every handler does its own work. Assume nothing was done for you.

1. **Authenticate** — `middleware.ts` guarantees a session on `/api/*` (401 JSON otherwise) and nothing else.
2. **Authorise** — `requireAdmin`, `requireFinanceAdmin` (all finance routes), or `requireRole([...])`.
3. **Scope to tenant** — `checkClientMbaAccess` / `resolveClientMbaScope` on anything a client-role user can reach. Only `admin` is unscoped. A non-admin with an empty `mba_numbers` set gets 403, never everything.
4. **Validate** with zod at the boundary.
5. **Fail loudly.** A read failure becomes an error the UI can render (`lib/data/readResult.ts` → `lib/ui/viewState.ts`), never a silent `[]`.

Crons bypass middleware entirely — `/api/cron/*` is protected only by `assertCronSecret`. Check it first in every cron handler.

**Naming trap:** `/api/media_plans` (underscore) is the per-channel line-item surface; `/api/mediaplans` (no underscore) is masters, versions and MBA detail. They are different things.

## Formatting and locale

- Money display: `lib/format/money.ts` — en-AU, AUD, null/NaN renders `—`. Rounding changes cause reconciliation drift across finance, pacing and exports.
- Dates display: `lib/format/date.ts` — en-AU only.
- Date parsing: `parseDateSafe` (local midnight) and `parseDateNativeSafe` (UTC midnight) are **not** interchangeable. Swapping them shifts dates by a day.
- `fy` always means the Australian financial year **ending** year.

## Navigation

`lib/nav/routeManifest.ts` is the single source of truth for sidebar groups, labels, titles, breadcrumbs and command-palette destinations. `AppSidebar`, bottom nav, `CommandPalette` and `DynamicBreadcrumbs` all derive from it. Never build a parallel nav map.

## Caching

Three mechanisms, all per-lambda unless noted. Prefer an existing one over a new one.

1. Coalesced module TTL caches — `clientsCache` (10 min, invalidated on client writes), `publishersCache` (10 min), `mediaPlanVersionsCache` (60 s), `mediaPlansListCache` (60 s), `publisherKpiCache` (10 min), `mediaContainerBestPracticeCache` (10 min). All serve stale on failure.
2. `unstable_cache` (survives lambdas) — pacing rows 4 h under tag `pacing-campaigns`, global spend 300 s.
3. Browser — `coalescedGetJson`, default 60 s TTL; collapses Strict-Mode remounts and parallel same-URL callers.

Do not reintroduce background/fire-and-forget refresh. It was removed on purpose: serverless suspension caused phantom timeouts.

## Testing

- Unit and contract tests live beside the code in `lib/**/__tests__/`.
- `npm run typecheck` (`tsc --noEmit`) and `npm run lint` before any handover.
- 115 npm scripts exist — check for a targeted one (`test:line-item-attrs`, `test:approvals`, `test:shadow-diff`, `test:save-plan`) before writing a new harness.
- Suites that import `db/` preload `scripts/test-shims/register-server-only.mjs` so `import "server-only"` is a no-op outside Next. Copy that pattern rather than removing the import.
- Two different schema checks, and they answer different questions. `npm run db:generate` must produce an **empty diff** — that proves nobody edited `db/schema/*.ts` without regenerating the snapshot. It does **not** prove the mirror matches Postgres, because the baseline is generated from the TypeScript. For that, run `npm run db:drift` against the applied database before any handover that edits the mirror. Mirror-ahead columns are a deploy blocker (FATAL banner, exit 1). Never apply the file `generate` produces. Fixture coverage: `npm run test:db-drift` (CI).

## Git

`localhost` is the working trunk. `main` is the deploy target and is **cherry-pick only** — it auto-deploys to Vercel. No other branches, no direct commits to main, no force-push. Conventional Commits. Full law in `/BRANCHING.md`.

On this project **redeploy is the promote** — a Vercel env var set after a build does not reach that build.

## Finance row action grammar

On every finance row, controls follow a locked three-way split. Do not add a fourth kind.

| Kind | What it is | Rule |
|---|---|---|
| **Pill** | A state | Never clickable. Always first on the action line. Invoicing uses `BillingStateBadge` (seven values: `ready` \| `approved` \| `sent_to_finance` \| `drafted` \| `issued` \| `paid` \| `overdue`). In Xero uses the match outcome (`Differs` \| `Missing` \| `Extra` \| `Agrees`) in the same slot — not a second billing-lifecycle palette. |
| **Button** | The one action that moves this row forward | Labelled as the next step. Everything else goes in the overflow menu. |
| **Icon / document control** | Opens a file or opens the menu | Never changes state. The invoice download is labelled `📄 Invoice` and renders only when a PDF exists — never disabled, never "coming soon". |

Layout is `RowActionLine`: pill → optional context text → spacer → primary button → document control → ⋯. Callers do not choose the order. Overflow is `RowActionMenu`; disabled items stay visible and expose `disabledReason` on hover — a missing action is confusing, a disabled one with a reason is informative.

**Three-way test:** if it is a state, it is the pill; if it moves the row forward, it is the button; if it opens a file or a menu, it is the document control or the ⋯. If none of those fit, stop — do not invent a fourth control.

Primitives: `components/finance/RowActionLine.tsx`, `RowActionMenu.tsx`, `InvoiceDocumentButton.tsx`. Mounted callers: Clients billing `/finance/invoicing` (one line per `invoice_key`), In Xero `/finance/in-xero` (one line per match row), and Owed `/finance/owed` (same primitives in **table cells**, never cards, never a primary). Do not wire a parallel chrome. Invoicing funnel tiles use the same vocabulary as the pills (Ready to approve · Approved · Sent to finance) so the tiles and the rows teach each other. Approved rows also mount Un-approve as a Button (confirm; reverse of Approve) — not a fourth chrome kind.

## Twin wizard headers

Create (`/mediaplans/create`) and edit (`/mediaplans/mba/[mba_number]/edit`) share `PlanWizardHeader` inside `PlanWizardShell`. Do not rebuild breadcrumb + hero on either mega-page.

| Row | Create | Edit |
|---|---|---|
| Primary | Title + subtitle only (no actions slot) | Same title row |
| Secondary | omitted | Version pill · trail (`describeVersionHeaderTrail`) + version picker |
| Rail | steps · Draft Summary · status panel | steps · Campaign tools (edit only: Creative, Trafficking) · Draft Summary · status panel |
| Campaign Details card | Heading + date presets; Campaign Status field is the only status control | Same |

Never a third hero row. Long client / campaign names wrap (`break-words`, `min-w-0`); do not clip under the hero `overflow-hidden`.

Step 01 `#campaign-setup` on both pages uses the same frame (`rounded-frame … shadow-e1 sm:p-5`), inner `#builder-section-campaign` card (`overflow-visible rounded-card … bg-surface-panel`), and field grid (`md:grid-cols-2 xl:grid-cols-4`). Create may carry `data-create-step` (no consumer); edit must not. Edit keeps `mp_plannumber` in the field grid and does not mount `PlannerCreateTargetsStrip`. Edit bootstrapping paints that same `#campaign-setup` frame inside `PlanWizardShell` (rail placeholder + content column) so xl swap does not shift width. Pin: `lib/mediaplan/__tests__/postgresSavePayload.integration.test.ts`. Do not rebuild this chrome as a second shared component unless both pages are extracted together.

## Change protocol

One prompt = one commit = one gate review. Claude and Cursor propose; a human applies. Anything ambiguous is reported, not guessed.
