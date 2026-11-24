# AssembledView — rules for AI-assisted changes

A media agency operating platform for Assembled Media: media plans (MBAs), delivery pacing, finance and billing, client dashboards, KPIs, trafficking and creative, and an embedded assistant (AVA).

The app is deeply interconnected and uncoordinated changes cause regressions in distant domains. The architecture brain at **`docs/brain/`** exists to prevent that. These rules are mandatory for every session.

## What the system is, in six lines

- **Data:** Supabase Postgres (Sydney) via Drizzle — `db/`. 78 tables, RLS on all of them. **This is the system of record.** Xano is out of the runtime path.
- **Warehouse:** Snowflake `ASSEMBLEDVIEW.MART.*`, read-only, delivery and pacing facts.
- **App:** Next.js 15 App Router, 70 pages, 196 API route handlers, ~450 components, ~1,440 lib files.
- **Auth:** Auth0 v4. `middleware.ts` authenticates; **every route does its own authorisation and tenant check.**
- **Hosting:** Vercel (`avmediaplan`), 32 crons (`vercel.json`). Files in Vercel Blob.
- **AI:** Anthropic SDK. AVA reads through a fail-closed `ava_readonly` role with a per-table grant allowlist.

## Before you change anything

1. `docs/brain/MAP.md` — find the section, note its routes, lib, API prefix and tables. Start here every time.
2. `docs/brain/modules/<section>.md` — the detail page for that area.
3. `docs/brain/BLAST-RADIUS.md` — search **every file you plan to modify**. The listed consumers are your test checklist.
4. `docs/brain/KNOWN-ISSUES.md` — the bug may be recorded already, with constraints on the fix.
5. `docs/brain/INVARIANTS.md` — never violate. If the task requires it, stop and flag it to Luke. That is a decision, not an implementation detail.
6. `docs/brain/AI-DIRECTIONS.md` — context budgets, task-to-file routing, prompt-pack shape.

## After you change anything

7. **Update the brain in the same commit** if the change altered anything it describes: a contract, a dependency edge, a data shape, a gotcha introduced or resolved. Surgical edits — these are reference pages, not changelogs.
8. New decision → one present-tense line in `INVARIANTS.md` (no dates, no branch names). New debt → `KNOWN-ISSUES.md` with the next free ID. Fixed a known issue → mark `FIXED (commit)`, never delete the row.
9. New table or column → row in `DATA-MODEL.md` and `db/README.md` alongside the SQL.

## Hard rules (violations cause production incidents)

- **Fee math** goes through `lib/mediaplan/burstAmounts.ts` only. Never a local media/fee split. Fee is a slice of gross, never `net × fee%`.
- **`bursts` shape** (`serializeBurstsJson.ts` / `formatBurstsForPersist.ts`) and **`line_item_id`** (`lineItemIds.ts`) are cross-domain contracts — pacing, billing, finance, Snowflake, dashboards and exports all parse them. Change every consumer or none.
- **Published version = `media_plan_masters.published_version_id`** and `media_plan_versions.published_at`. Never `max(version_number)`, never inferred from `campaign_status`.
- **`approved_slice` is frozen at publish.** Never mutate it afterwards.
- **Direct digital estimated spend:** CM360 direct digital (display, video, audio, BVOD) uses `estimateDirectDigitalSpend`, which wraps `deriveSpendFromPlanRate` (planned media ÷ planned deliverables, capped at planned media). A fee-inclusive budget with no media amount is gross: `netFromGross` uses the channel fee percent from `mba_fee_snapshots.fees` for that version, and the cap is planned net media. No snapshot, and no client fee loading already loaded, keeps the gross budget and logs it. `budget_includes_fees` false is unchanged. The UI label comes from `spendMode` (`estimated` | `actual` | `reported`). Fixed-cost reported spend replaces the estimate. Programmatic CM360 is modelled only when `derive_spend_from_plan` is on (Quantcast, Twitch). `lib/pacing/ad-serving/*` and `lib/pacing/overview/mapOverviewItems.ts` hold delivery counts, never spend: CM360 verification counts, plus partner-reported delivery for Channel Factory Digital Video Direct Booked lines only (`isDirectDigitalPartnerFileLine`), marked as partner-sourced (`deliverySource`).
- **`NaN`** from deliverable math is a "no recompute" sentinel, not a zero.
- The **`PacingStatus` ladder order** mirrors a Snowflake view — do not reorder.
- **The twin pages:** plan form behaviour shared by `app/mediaplans/create/page.tsx` and `app/mediaplans/mba/[mba_number]/edit/page.tsx` lives once in `app/mediaplans/_form/`; change it there. Code still in one page needs the same change in the other: move it to `_form` first.
- **New API routes implement their own tenant checks.** Middleware only authenticates. Only `admin` is unscoped.
- **Money in the plan core is integer cents.** Convert at the edge.
- **Adding a media channel** means completing ALL ~12 registry maps listed in `BLAST-RADIUS.md`, or the channel half-works.
- **Migrations are authored, never applied, by AI.** Write the SQL into `db/migrations/`, hand it over, then hand-sync `db/schema/*.ts` so `npm run db:generate` is an empty diff. Backfills need a `migration_markers` guard.
- **Names containing `xano` are frozen contracts** (`MART.XANO_LINE_ITEMS_SNAPSHOT`, `/api/cron/xano-line-item-sync`). Do not rename them.

## Working rules on this project

- **No AI edits the repo directly.** Claude proposes; changes ship as `.mbox` packs (or a Cursor prompt pack) that Luke applies himself. One commit = one gate review.
- **State confidence.** Every diagnosis and recommendation carries a confidence percentage. Under 90%, stop and ask, saying what would raise it. Never guess a schema, a route or a business rule: ask for the file, or verify table and column names by schema inspection.
- **Discovery before build.** New features start with a read-only discovery file in `docs/superpowers/` (plan, options, confidence). No build until Luke approves it.
- **Decision gates are explicit.** Present the options with a recommendation and wait. Never accept a default on Luke's behalf.
- **Phase reviews.** At the end of each phase an independent reviewer checks goals against outcomes, and the full review goes to Luke before the next phase starts. `npm run test:all` runs once per phase; each step runs only its small, specific tests plus typecheck and lint.
- **Commits.** One logical change per commit. `git add` by explicit file path only, never `git add .`. `npx tsc --noEmit` exits with zero errors on every commit.
- **Commands for Luke are PowerShell.** No `&&` chaining, no `grep`, no `jq`. Every command runs on its own.
- **No browser smoke by AI.** Luke smokes UI by hand. No commit command for UI work until he confirms the smoke.
- **Machine-to-machine calls** reuse the shared signing secret (`APP_SIGNING_SECRET` with a new `SigningPurpose`, `lib/security/signingSecret.ts`). Env vars are for real secrets only; feature switches go on the Admin Features page.
- **UI** uses the shared design source (`/design-system`, `components/layout/*`, `lib/design/*`). No one-off styles.
- **Branching:** `localhost` is the working trunk; `main` is cherry-pick-only and auto-deploys. No other branches, no direct commits to main, no force-push. Conventional Commits. Full law in `/BRANCHING.md`. On this project, **redeploy is the promote**.
- **Documentation placement:** durable knowledge → `docs/brain/`; human-facing explanation → `docs/handbook/`; time-bound plans and specs → `docs/superpowers/` with an explicit `Status:`. **Nothing new in the repo root.**
- **Tests:** `npm test` runs every test file (found by name, `scripts/run-tests.mjs`). The named `test:*` scripts are file-stem prefixes of it; `node scripts/run-tests.mjs <folder>` runs one area. A new test file needs no list entry. Run `npm run typecheck` and the relevant `lib/**/__tests__` folder for any helper you touch.
