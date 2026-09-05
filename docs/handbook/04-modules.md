# 04 — The sections, one by one

Fourteen sections. For each: what it does, where it lives, and what to be careful of. The machine-readable version of this page is `docs/brain/MAP.md`.

## Media plans

The heart of the product, and the heaviest code in the repo.

Lives at `/mediaplans` — a list, a create wizard, and a versioned editor per MBA. Twenty channel containers, an expert grid mode for bulk entry, bursts, a billing schedule, and a review-and-files step.

**Be careful of:** the create page and the edit page are twins — 9,121 and 13,771 lines — and a change to one almost always needs the same change to the other. Half-shipped features in this repo are nearly always a change made to only one of them. Adding a channel touches around twelve separate registry maps; complete all of them or the channel half-works.

Code: `app/mediaplans/`, `components/media-containers/`, `lib/mediaplan/`, `lib/data/savePlan.ts`.

## Finance and billing

The finance hub at `/finance` with sections for home, investment, invoicing, monthly periods, costs (accruals, client-pays, invoices), forecasting and Xero matching. Plus a forecast snapshot variance report.

**Be careful of:** fee is a slice of gross and is computed in exactly one file. Money in the plan core is integer cents. Several tables in this section are queried with raw SQL rather than the query builder, so check `lib/finance/periods/postgresStore.ts` for the house style before adding a query.

Code: `app/finance/`, `components/finance/`, `lib/finance/`, `lib/billing/`, `lib/xero/`.

## Pacing and delivery

Six channel views under `/pacing` — overview, direct, programmatic, social, search, ad-serving — plus an admin tool for reassigning platform line items that failed to match a plan line.

**Be careful of:** the status ladder order mirrors a Snowflake view and must not be reordered. CM360 surfaces carry no spend unless `derive_spend_from_plan` is on (modelled from the plan rate, capped, labelled modelled). The flag is off for Direct Booked Digital, so ad-serving and overview stay no-spend. Results are cached for four hours, so a change may not appear immediately.

Code: `app/pacing/`, `lib/pacing/`, `lib/snowflake/`.

## Client dashboards

`/dashboard` for the agency overview, `/dashboard/<client>` for a client's portfolio, `/dashboard/<client>/<mba>` for a single campaign.

**Be careful of:** this is the surface clients actually see. Assume a client-role user is looking at every route under it, and scope every query. The overview component is 2,491 lines and is a choke point.

Code: `app/dashboard/`, `components/dashboard/`, `components/charts/`.

## KPI

Not a standalone page — targets are set inside the plan and read on pacing and dashboards. Three tiers: campaign, client, publisher benchmark.

Code: `lib/kpi/`, `components/kpis/`, `/api/kpis`.

## Trafficking and creative

The naming builder turns plan lines into platform campaign names, which is what makes delivery data match back to the plan later. Creative assets are uploaded per MBA with previews, frames, live mockups and AI-drafted ad copy.

Code: `lib/naming/`, `lib/creative/`, `components/creative/`, `components/trafficking/`.

## Publishers, specs and ingest

The publisher directory, per-publisher analytics and market share, the ingest profile admin, and the schedule upload pipeline where a publisher's spreadsheet is parsed, reviewed by a human and accepted into a plan.

**Be careful of:** everything here joins on the publisher's numeric ID, never on their display name.

Code: `app/publishers/`, `app/admin/publisher-profiles/`, `app/admin/schedule-ingest/`, `lib/specs/`, `lib/publisher/`.

## Clients

The client hub at `/client` and per-client detail. Around ninety columns of client configuration — fees, ad-serving rates, platform IDs, branding, the client brain.

**Be careful of:** the slug is tenant identity. One override in the slug function (`legalsuper` → `legal_super`) is load-bearing. Pacing uses a different slugifier — do not merge them casually.

## Codex — tasks, time and meetings

`/tasks` for the board, plus admin surfaces for unattributed meetings and MyHours mapping. Meetings flow in from Fireflies, get attributed, and generate task and time-entry proposals that a human accepts.

**Be careful of:** identity here is email, not a numeric ID. Tasks have no foreign key to clients — a deliberate hangover from the migration.

Code: `app/tasks/`, `lib/codex/`, `lib/fireflies/`, `lib/myhours/`.

## Scopes of work

List, create, view and edit scopes with deliverables, timelines, costed lines and a billing schedule; generates a PDF. One table.

## Planning and insights

The Behavioural Change Sequence planner at `/tools/behavioural-planner` — a deterministic planning tool with its own narration, not the chat assistant. Saved audiences, insight capture, deck export.

**Be careful of:** `lib/planning/` is 30 MB, mostly reference data. Do not grep it casually.

## Knowledge hub

A client-accessible learning centre: definitions, guides, platform playbooks, calculators, curated resources and a UTM builder. Entirely file-driven from `src/data/learning/` — no database.

## AVA

The assistant. A floating widget for admins, backed by a tool loop with around thirty tools covering campaign context, plan lines, schedules, finance summaries, pacing snapshots, best practice, specs and client brains, plus a few narrow write tools.

**Be careful of:** AVA's database access is a separate read-only role with an explicit per-table allowlist. Letting AVA read a new table is a migration, not a code change. Its voice is specified — lead with the answer, no apology, numbers unhedged, no internals in chat.

Code: `lib/ava/`, `src/ava/`, `/api/chat-v2`, `components/ChatWidget.tsx`.

## Admin and Microsoft 365

User enrolment through the Auth0 Management API, the media container best-practice editor, pacing orphan assignment, Microsoft 365 reconciliation, publisher profile and ingest admin.

Microsoft 365 provisioning creates SharePoint sites and Teams groups for clients. It is off by default and every attempt is logged.
