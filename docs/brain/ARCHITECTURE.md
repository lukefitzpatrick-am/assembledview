# Architecture Overview

## What AssembledView is

A media agency operating platform (assembledview.com.au) for Assembled Media: media plan creation and approval (MBAs), campaign delivery pacing, finance/billing, client dashboards, KPI management, trafficking/naming, creative assets, and an embedded AI assistant (AVA).

## Stack

| Layer | Technology |
|---|---|
| Frontend + API | Next.js 15 App Router, React 18, TypeScript (strict: false, strictNullChecks: true), Tailwind + shadcn/Radix, Zustand, react-hook-form + zod, Recharts |
| Primary datastore | **Xano** (system of record until Phase 4) + **Supabase/Postgres** via Drizzle (`db/`) for migration shadow/cutover (`DATA_BACKEND`) |
| Warehouse | **Snowflake** `ASSEMBLEDVIEW.MART.*` — delivery/pacing facts (Fivetran-fed), planning data. Read via `snowflake-sdk` |
| Auth | Auth0 v4 (`@auth0/nextjs-auth0`), roles admin/manager/client via namespaced ID-token claims |
| Hosting | Vercel (project `avmediaplan`), regions iad1/syd1/sin1. 4 crons in `vercel.json` |
| Files | Vercel Blob (private) for exports, creative assets, reports |
| AI | Anthropic SDK — AVA assistant, ad copy, plan autopopulate |
| Email | SendGrid (nodemailer SMTP fallback) |
| Docs generation | exceljs (workbooks), jsPDF (MBA/SoW/billing PDFs), pptx-automizer + raw JSZip (decks) |

## Domain map

```
                      ┌─────────────────────────────────────────────┐
                      │              SHARED CORE                     │
                      │  lib/api/xano.ts · lib/api.ts (monolith)    │
                      │  Auth0/RBAC · middleware · caches · money/   │
                      │  dates · lib/utils (216 importers)           │
                      └──────────────┬──────────────────────────────┘
        ┌───────────────┬────────────┼────────────┬─────────────────┐
        ▼               ▼            ▼            ▼                 ▼
  MEDIA PLANS ───► FINANCE/BILLING  KPI      PACING/DELIVERY   AVA (AI)
  create/edit      finance hub    3-tier    Snowflake facts    reads all
  20 channel       fee engine     targets   × Xano plans       domains via
  tables, MBA      forecast       fan-out   6 surfaces         21 tools
  versioning       snapshots         │            │                │
        │               ▲            ▼            ▼                ▼
        │               │      DASHBOARDS/CHARTS ◄── delivery   TRAFFICKING/
        └── bursts_json─┘      client dashboards, exports,      CREATIVE
            line_item_id       document generation, email      naming builder
```

**The two universal join keys:**
- `mba_number` + `version_number` — plan identity (Xano `media_plan_master.version_number` is the published watermark)
- `line_item_id` (`<MBA><CODE><n>`, e.g. `PENFOLD001SE1`) — joins plan line items to Snowflake delivery facts, KPI fan-out, billing bursts, trafficking names. Built by `lib/mediaplan/lineItemIds.ts`.

**The one universal data shape:** `bursts_json` — the array of dated budget bursts on every channel line-item row. Its write contract is `lib/mediaplan/serializeBurstsJson.ts` + `formatBurstsForPersist.ts`; a dozen domains parse it (pacing, billing, finance, dashboards, Snowflake sync, delivery, exports). **Changing its shape is the widest-reaching change possible in this app** — see BLAST-RADIUS.md.

## Primary data flows

1. **Plan → Xano**: create/edit pages → `PUT /api/mediaplans/mba/{mba}` (version cut, server-side billing recompute + $0.01 gate) → per-channel line-item writes → `PATCH` publish (stage-then-publish; Xano has no transactions).
2. **Xano → Snowflake**: nightly cron `xano-line-item-sync` MERGEs all line items into `MART.XANO_LINE_ITEMS_SNAPSHOT` keyed on `line_item_id`; that's how the warehouse knows the plan.
3. **Snowflake → Pacing**: pacing pages join live Xano plans (masters → versions → channel line items → bursts) to `MART.*_PACING_FACT` tables on `line_item_id`, compute pacing in TS (`lib/pacing/maths` mirrors `V_LINE_ITEM_PACING` band order), cached 4h via `unstable_cache`.
4. **Plan → Finance**: finance hub rows are **derived live** from `media_plan_versions.billingSchedule`/`deliverySchedule` JSON — amounts from schedule JSON, only status overlaid from `finance_billing_records`.
5. **Everything → AVA**: page shells publish `PageContext` to `window.__AV_ASSISTANT__` (lib/assistantBridge.ts); `/api/chat-v2` runs a Claude tool loop over 21 read/write tools.

## Route surface

- `app/mediaplans/**` — plan list, create (8.1k-line page), MBA edit (11.8k-line page), trafficking, creative
- `app/pacing/(shell)/**` — overview, search, social, programmatic, ad-serving, direct, admin/orphans
- `app/finance/**` — hub (7 tabs), receivables, forecast + snapshots + variance
- `app/dashboard/[slug]/**` — client-facing dashboards (tenant-scoped)
- `app/admin/**`, `app/tasks`, `app/account`, `app/profile`, `app/knowledge/**`
- `app/api/**` — 126 route handlers. Two catch-all Xano proxies (`/api/media_plans/[...path]`, `/api/media-details/[...path]`) gated by `lib/security/proxyAllowlist.ts` + staff `requireRole(admin|manager)` (SEC-1 Constrained). NB the naming trap: `/api/media_plans` (underscore = channel tables) vs `/api/mediaplans` (no underscore = master/versions/MBA).

## Deploy & branching

- `localhost` = working trunk; `main` = deploy target, **cherry-pick only**, auto-deploys to Vercel. No other branches. Conventional Commits. Smoke before cherry-picking feat/fix/refactor. (Full law: `/BRANCHING.md`.)
- Middleware enforces **authentication only** on `/api/*`; tenant isolation is per-handler (only ~13 routes check `checkClientMbaAccess`) — see KNOWN-ISSUES security section before touching any API route.
