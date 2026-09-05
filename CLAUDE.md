# AssembledView — rules for AI-assisted changes

A media agency operating platform for Assembled Media: media plans (MBAs), delivery pacing, finance and billing, client dashboards, KPIs, trafficking and creative, and an embedded assistant (AVA).

The app is deeply interconnected and uncoordinated changes cause regressions in distant domains. The architecture brain at **`docs/brain/`** exists to prevent that. These rules are mandatory for every session.

## What the system is, in six lines

- **Data:** Supabase Postgres (Sydney) via Drizzle — `db/`. 78 tables, RLS on all of them. **This is the system of record.** Xano is out of the runtime path.
- **Warehouse:** Snowflake `ASSEMBLEDVIEW.MART.*`, read-only, delivery and pacing facts.
- **App:** Next.js 15 App Router, 70 pages, 196 API route handlers, ~450 components, ~1,440 lib files.
- **Auth:** Auth0 v4. `middleware.ts` authenticates; **every route does its own authorisation and tenant check.**
- **Hosting:** Vercel (`avmediaplan`), 13 crons. Files in Vercel Blob.
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
- **ZERO-$ LAW:** CM360 surfaces carry no spend UNLESS the line's `delivery_source_map` row sets `derive_spend_from_plan`, in which case the figure is modelled from the plan rate, capped at the planned total, and labelled as modelled. The flag is OFF for all Direct Booked Digital, so `lib/pacing/ad-serving/*` and `lib/pacing/overview/mapOverviewItems.ts` keep their no-spend row shapes.
- **`NaN`** from deliverable math is a "no recompute" sentinel, not a zero.
- The **`PacingStatus` ladder order** mirrors a Snowflake view — do not reorder.
- **The twin pages:** any change to `app/mediaplans/create/page.tsx` likely needs the same change in `app/mediaplans/mba/[mba_number]/edit/page.tsx`, and vice versa.
- **New API routes implement their own tenant checks.** Middleware only authenticates. Only `admin` is unscoped.
- **Money in the plan core is integer cents.** Convert at the edge.
- **Adding a media channel** means completing ALL ~12 registry maps listed in `BLAST-RADIUS.md`, or the channel half-works.
- **Migrations are authored, never applied, by AI.** Write the SQL into `db/migrations/`, hand it over, then hand-sync `db/schema/*.ts` so `npm run db:generate` is an empty diff. Backfills need a `migration_markers` guard.
- **Names containing `xano` are frozen contracts** (`MART.XANO_LINE_ITEMS_SNAPSHOT`, `/api/cron/xano-line-item-sync`). Do not rename them.

## Working rules on this project

- **No AI edits the repo directly.** Claude proposes; changes go through a Cursor prompt pack. One prompt = one commit = one gate review.
- **State confidence.** Anything under 90% confident is said out loud, with what would raise it. Never guess a schema, a route or a business rule — ask for the file.
- **Branching:** `localhost` is the working trunk; `main` is cherry-pick-only and auto-deploys. No other branches, no direct commits to main, no force-push. Conventional Commits. Full law in `/BRANCHING.md`. On this project, **redeploy is the promote**.
- **Documentation placement:** durable knowledge → `docs/brain/`; human-facing explanation → `docs/handbook/`; time-bound plans and specs → `docs/superpowers/` with an explicit `Status:`. **Nothing new in the repo root.**
- **Tests:** prefer the existing targeted npm scripts (115 of them) over new harnesses. Run `npm run typecheck` and the relevant `lib/**/__tests__` suite for any helper you touch.
