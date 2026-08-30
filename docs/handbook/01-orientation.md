# 01 — What AssembledView is

AssembledView (assembledview.com.au) is Assembled Media's own operating platform. It started as a replacement for Looker Studio client reporting and grew into the system the agency actually runs on.

It does five jobs.

## 1. It builds and versions media plans

A media plan is an **MBA** — identified by a number like `PENFOLD016`. A planner opens the create wizard, switches on the channels the campaign uses, and fills a container per channel: television, radio, cinema, newspaper, magazines, out-of-home, five programmatic channels, four digital channels, social, search, influencers, integrations and production. Twenty in total.

Each line in a container carries **bursts** — dated slices of budget. Bursts are what everything downstream reads: the billing schedule, the delivery schedule, the pacing comparison, the finance forecast, the client dashboard.

Saving cuts a **version**. Editing an existing MBA cuts another. One version at a time is **published**, and publication is an explicit pointer with a wall-clock timestamp — not "the highest number" and not implied by a status field. That distinction is the difference between billing the plan the client approved and billing whatever someone was last editing.

## 2. It tracks whether campaigns are delivering

Delivery data lands in Snowflake from the ad platforms. The plan lands in Snowflake nightly. The two are joined on a **line item ID** — a string like `PENFOLD001SE1` that is generated once when the plan line is created and then carried everywhere: into the platform's own campaign naming, into the KPI targets, into the billing lines, into the warehouse.

That single key is why pacing works at all. It is also why its format is frozen.

Pacing pages show, per channel, what was planned against what was delivered, with a status band. One rule matters: ad-serving and CM360 surfaces never show spend pacing, because their numbers are not spend.

## 3. It runs finance

Billing schedules are derived from the plan and stored as rows — one row per line item, per component (media, fee, ad-serving), per basis (billing or delivery), per month. Not as a JSON blob, which is how it used to be and how several bugs happened.

On top of that sits the finance hub: investment, invoicing, monthly periods that open, run and lock, cost tracking with accruals and client-pays splits, forecasting with immutable snapshots, and a Xero reconciliation surface that matches invoices back to run items.

The rule underneath all of it: **fee is a slice of gross**, computed in exactly one file. Every fee incident in this system's history came from someone computing it somewhere else.

## 4. It gives clients a dashboard

Clients log in and see only their own campaigns. Their access is scoped by a slug on their client record, enforced in the middleware for pages and — this is the important part — **re-checked in every API route**, because the middleware only proves who you are, not what you may see.

The dashboards show delivery, spend to date against schedule, KPI performance and campaign insights.

## 5. It has an assistant

AVA is embedded in the app, available to admin users. It reads campaign context, plan lines, schedules, finance summaries and pacing snapshots through a fixed set of tools, and can write in a few narrow places — patching a form, adjusting line items, accepting an ingest proposal, saving a client brain, drafting copy and reports.

Its database access runs through a separate, read-only role with an explicit table-by-table allowlist. Adding a table to what AVA can see is a database migration, deliberately — not something anyone can do by accident.

## Who uses it

| Role | Sees |
|---|---|
| **Admin** (agency staff) | Everything. Plans, finance, pacing, admin tools, AVA |
| **Client** | Only `/dashboard/<their slug>` and what hangs off it |
| **No role** | `/unauthorized`. The system fails closed — an unrecognised role is never treated as admin |

## Where it runs

Vercel for the app, Supabase Postgres in Sydney for the data, Snowflake for the warehouse, Auth0 for identity, Vercel Blob for generated files. Thirteen scheduled jobs keep the warehouse, Xero, Fireflies, MyHours and the Auth0 roster in step.

## A note on history

Until August 2026 the data lived in Xano. It now lives in Postgres, and the migration collapsed twenty per-channel tables into one and turned schedule JSON blobs into rows.

You will still see the word "xano" in the codebase: a warehouse table called `XANO_LINE_ITEMS_SNAPSHOT`, a cron called `xano-line-item-sync`, a severance register in the brain. Those are frozen names and historical records. Nothing reads Xano at runtime any more.
