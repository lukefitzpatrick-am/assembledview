# MAP — sections and hierarchy

The routing table for the whole app. Find your section, open the files it lists, stop reading. Every path is real and verified on `localhost` @ `39ed2590`.

## Layer hierarchy (what sits on what)

```
L0  PLATFORM      Vercel (project avmediaplan, regions iad1/syd1/sin1) · 13 crons
L1  IDENTITY      Auth0 v4 → middleware.ts (authN only) → lib/rbac.ts (roles) → per-route gates
L2  DATA          Supabase Postgres (Sydney) via Drizzle  db/  ← system of record
                  Snowflake ASSEMBLEDVIEW.MART.*         lib/snowflake/  ← delivery facts, read-only
                  Vercel Blob                            ← exports, creative, reports, sheets
L3  DOMAIN LIB    lib/<domain>/  ← all business rules. Nothing in app/ or components/ may re-derive them.
L4  API           app/api/**/route.ts  (196 handlers) ← own auth + own tenant check, always
L5  UI            app/**/page.tsx (70) → components/<domain>/
L6  ASSISTANT     AVA reads L2–L4 through a tool registry; never bypasses a gate
```

Rule of direction: **L5 never talks to L2.** A page calls an API route or a server helper; the route calls a `lib/` function; the lib function calls `db/`. Any shortcut through that chain is the bug.

## Section index

| # | Section | Entry route | UI | Domain lib | API prefix | Primary tables |
|---|---|---|---|---|---|---|
| 1 | [Media plans](#1-media-plans) | `/mediaplans` | `components/media-containers/`, `components/mediaplans/` | `lib/mediaplan/`, `lib/mediaplans/`, `lib/data/` | `/api/mediaplans`, `/api/media_plans`, `/api/plans` | `media_plan_masters`, `media_plan_versions`, `line_items`, `schedule_months` |
| 2 | [Finance & billing](#2-finance--billing) | `/finance` | `components/finance/`, `components/billing/` | `lib/finance/`, `lib/billing/`, `lib/xero/` | `/api/finance`, `/api/billing-overrides` | `finance_periods`, `finance_run_items`, `finance_billing_*`, `xero_*` |
| 3 | [Pacing & delivery](#3-pacing--delivery) | `/pacing` | `components/pacing*/` | `lib/pacing/`, `lib/snowflake/`, `lib/delivery/` | `/api/pacing` | Snowflake `MART.*` + `line_items` |
| 4 | [Client dashboards](#4-client-dashboards) | `/dashboard/[slug]` | `components/dashboard/`, `components/charts/` | `lib/dashboard/`, `lib/charts/`, `lib/spend/` | `/api/dashboard`, `/api/campaigns` | `media_plan_*`, `schedule_months`, `campaign_insights` |
| 5 | [KPI](#5-kpi) | (inside plan + pacing) | `components/kpis/` | `lib/kpi/` | `/api/kpis` | `campaign_kpi`, `client_kpi`, `publisher_kpi` |
| 6 | [Trafficking & creative](#6-trafficking--creative) | `/creative`, `/mediaplans/mba/[mba]/trafficking` | `components/creative/`, `components/trafficking/` | `lib/naming/`, `lib/creative/` | `/api/creative-assets`, `/api/naming` | `creative_asset` |
| 7 | [Publishers & specs](#7-publishers-specs--ingest) | `/publishers` | `components/specs/`, `components/ingest/` | `lib/publisher/`, `lib/specs/` | `/api/publishers`, `/api/admin/ingest` | `publishers`, `publisher_profiles`, `publisher_specs`, `ingest_*`, `line_item_panels` |
| 8 | [Clients](#8-clients) | `/client` | `components/client-hub/`, `components/client-dashboard/` | `lib/clients/` | `/api/clients`, `/api/admin/client-hub` | `clients`, `client_domains` |
| 9 | [Codex](#9-codex-tasks-time-meetings) | `/tasks` | `components/tasks/` | `lib/codex/`, `lib/fireflies/`, `lib/myhours/` | `/api/codex` | `tasks`, `client_notes`, `team_members`, `ava_*_proposals`, `time_entries` |
| 10 | [Scopes of work](#10-scopes-of-work) | `/scopes-of-work` | (page-local) | `lib/scopes/` | `/api/scopes-of-work` | `scope_of_work` |
| 11 | [Planning tools](#11-planning--insights) | `/tools/behavioural-planner`, `/insights` | `components/planning/`, `components/insights/` | `lib/planning/`, `lib/insights/` | `/api/planning`, `/api/insights` | `planning_audiences`, `campaign_insights` |
| 12 | [Knowledge hub](#12-knowledge-hub) | `/knowledge` | `components/learning/` | `src/lib/learning/`, `src/data/learning/` | — | none (file-driven) |
| 13 | [AVA](#13-ava) | floating widget | `components/ava/`, `components/ChatWidget.tsx` | `lib/ava/`, `src/ava/` | `/api/chat-v2` | reads most, writes few |
| 14 | [Admin & M365](#14-admin--m365) | `/admin/*` | `components/admin/`, `components/best-practice/` | `lib/m365/`, `lib/ops/` | `/api/admin` | `m365_provisioning_log`, `media_container_best_practice` |

---

## 1. Media plans

The heaviest section in the app. Everything else consumes its output.

**Routes** `/mediaplans` (list) · `/mediaplans/create` · `/mediaplans/mba/[mba_number]/edit` · `.../creative` · `.../trafficking` · legacy `/mediaplans/[id]/edit` (redirects)

**The two big pages are twins.** `app/mediaplans/create/page.tsx` (9,121 lines) and `app/mediaplans/mba/[mba_number]/edit/page.tsx` (13,771 lines). A change to one almost always needs the same change to the other. This is the single most common source of half-shipped features.

**Channel system** — 20 channels, enum `line_channel` in `db/schema/enums.ts`:
`television radio cinema newspaper magazines ooh prog_display prog_video prog_audio prog_bvod prog_ooh digi_display digi_video digi_audio digi_bvod social search influencers integrations production`

Adding or altering a channel touches, at minimum:
- `db/schema/enums.ts` (enum) + a migration
- `db/schema/lineItemAttrs.ts` (per-channel zod for `line_items.attrs`)
- `lib/api/media-containers.ts` (`MEDIA_CONTAINER_ENDPOINTS`)
- `lib/data/planShapes.ts` (`CHANNEL_ENDPOINT_TO_CHANNEL`, `BURSTS_FIELD_AS_BURSTS`)
- `lib/mediaplan/expertChannelMappings.ts` (8,434 lines) + `expertGridChannelConfig.ts` + `containerChannelConfig.ts`
- `components/media-containers/<Channel>Container.tsx` + `ExpertGrid.tsx`
- both twin pages
- naming (`lib/naming/`), KPI (`lib/kpi/`), pacing suffix maps (`lib/pacing/`)

`BLAST-RADIUS.md` carries the full ~12-map list. Complete all of them or the channel half-works.

**Save path** `POST /api/plans/save` → `lib/data/savePlan.ts` → one transaction writing `media_plan_versions` + `line_items` + `schedule_months` + `mba_fee_snapshots`. `WRITE_BACKEND=postgres`. Working drafts live in `plan_working_drafts` behind `NEXT_PUBLIC_PLAN_DRAFTS`.

**Read path** `GET /api/mediaplans/mba/[mba_number]` (1,588 lines) → `lib/data/readMbaPlanDetail.ts`. One query set, no fallback: a failure is a 500 `PLAN_DETAIL_POSTGRES_FAILED`, deliberately.

**Legacy shape shim** — `lib/data/planShapes.ts` reassembles a consolidated `line_items` row back into the old per-channel object so older consumers stay byte-compatible. Do not delete it without retiring every consumer.

→ `modules/media-plans.md`

## 2. Finance & billing

**Routes** `/finance` with section children: `home` `investment` `invoicing` `periods` `costs` (`accruals`, `client-pays`, `invoices`) `forecasting` `xero` (`matches`) · `/finance/forecast/snapshots/variance` · `/finance/receivables`

**Two data access styles live here.** Most of the app uses the Drizzle query builder. Finance periods, run items, notifications and Xero matching are reached with `sql` tagged templates instead — `finance_periods`, `finance_run_items`, `app_notifications`, `xero_contact_links`, `xero_invoice_matches`, `xero_match_month_metrics` (and `plan_working_drafts` in media plans). See `lib/finance/periods/postgresStore.ts`. All of them **are** mirrored in `db/schema/`, so the types are there if you want them; migrating the callers to the query builder is a separate decision, not a gap.

**Money law** — integer cents everywhere in the plan core (`*_cents`). `numeric` in ported finance tables. Fee is a slice of gross, never `net × fee%`, and only `lib/mediaplan/burstAmounts.ts` computes it.

**Crons** `finance-pre-run`, `finance-run` (19:00 and 20:00 UTC), `finance-lock` (12:59/13:59 UTC), `xero-sync` (00:15 UTC), `snapshot-checksum` (Mon 03:00 UTC).

→ `modules/finance-billing.md`

## 3. Pacing & delivery

**Routes** `/pacing/(shell)/` → `overview` `direct` `programmatic` `social` `search` `ad-serving` · `admin/orphans`

**Shape** Snowflake fact tables joined to plan line items on `line_item_id`. Facts: `MART.PACING_FACT`, `MART.SEARCH_PACING_FACT`, `MART.SOCIAL_PACING_FACT`, `MART.FIXED_COST_*_FACT`. The plan side is pushed into `MART.XANO_LINE_ITEMS_SNAPSHOT` nightly by `/api/cron/xano-line-item-sync` (19:00 UTC) — the table keeps its historic name; the source is now Postgres (`lib/snowflake/syncPgLineItems.ts`, `LINE_ITEM_SNAPSHOT_SOURCE`).

**Two laws.** `PacingStatus` ladder order mirrors the Snowflake view — never reorder. ZERO-$ LAW: ad-serving and CM360 surfaces never compute or display spend pacing.

Cached 4h via `unstable_cache` tag `pacing-campaigns`.

→ `modules/pacing.md`

## 4. Client dashboards

**Routes** `/dashboard` (agency overview) · `/dashboard/[slug]` (client portfolio) · `/dashboard/[slug]/[mba_number]` (campaign delivery) · `/dashboard/[slug]/creative`

This is the client-facing surface. Client-role users are confined here by `middleware.ts` and must be scoped by `checkClientMbaAccess` in every handler that serves it. `components/dashboard/DashboardOverview.tsx` is 2,491 lines and is a choke point.

Spend on these pages derives from `schedule_months`, not from live platform data.

→ `modules/dashboards-charts-exports.md`

## 5. KPI

Three-table cascade, most specific wins: `campaign_kpi` (per line item) → `client_kpi` (per client) → `publisher_kpi` (benchmark defaults by publisher + bid strategy + media type).

Fan-out from line items lives in `lib/kpi/`. `campaign_kpi.line_item_id` is the join key to both plan lines and Snowflake facts.

→ `modules/kpi.md`

## 6. Trafficking & creative

Naming/trafficking builder generates platform names from plan lines (`lib/naming/`). Creative assets are a Postgres row (`creative_asset`) plus a Vercel Blob file; previews, frames, live mockups and ad copy hang off `/api/creative-assets/*`.

→ `modules/trafficking-creative.md`

## 7. Publishers, specs & ingest

**Routes** `/publishers`, `/publishers/[publisherId]` · `/admin/publisher-profiles` · `/admin/schedule-ingest`

Three related-but-distinct stores, all joined on `publishers.id` and never on display name:
- `publisher_profiles` — how to parse a publisher's schedule spreadsheet (`detect_signature`, `column_map`, `grid_semantics`, `line_granularity`). Config is jsonb on the row, not TypeScript per publisher.
- `publisher_specs` + `spec_runs` — material specs and deadlines.
- `ingest_stages` → `ingest_runs` — staged review package, then accepted run history. OOH detail lands in `line_item_panels` + `line_item_panel_flights` (no money columns; spend stays on the burst).

## 8. Clients

`clients` is 90+ columns: identity, contacts, per-channel fee percentages, per-channel ad-serving rates, platform account ids, brand colour and logo, `client_brain`, `slug`, M365 identity, `client_name_aliases`.

`slug` **is** tenant identity (`lib/clients/slug.ts`); the `legalsuper → legal_super` override is load-bearing. Pacing uses a different slugifier — do not merge them casually.

## 9. Codex (tasks, time, meetings)

`/tasks`, `/tasks/[id]`, `/admin/fireflies-unattributed`, `/admin/myhours-mapping`.

Flow: Fireflies meeting → `client_notes` (attributed to client / publisher / internal / new business) → AVA proposes → `ava_task_proposals` / `ava_time_entry_proposals` → human accepts → `tasks` / MyHours entry. Crons: `fireflies-sync` and `myhours-sync` every 6h, `codex-recurring` daily, `auth0-roster-sync` every 6h into `team_members`.

Identity here is **email**, not a numeric user id.

→ `modules/codex.md`

## 10. Scopes of work

`/scopes-of-work` list, create, view, edit. One table (`scope_of_work`) with jsonb `cost` and `billing_schedule`; PDF via `lib/generateScopeOfWork.ts`.

## 11. Planning & insights

`/tools/behavioural-planner` is the Behavioural Change Sequence planner with deterministic narration — not the chat widget. `lib/planning/` is the largest lib directory by bytes (30 MB, mostly reference data). Saved audiences in `planning_audiences`; `campaign_insights` is append-and-supersede, never delete.

## 12. Knowledge hub

Client-accessible learning centre. Content is file-driven from `src/data/learning/*` — no database. Sections, guides, platform playbooks, calculators, resources, UTM builder.

## 13. AVA

**Entry** `POST /api/chat-v2`. Widget mounted for admins only via `AdminAssistantGate`; the API 403s non-admins.

- `lib/ava/agentLoop.ts` — the tool loop
- `lib/ava/tools/registry.ts` — the tool surface (~30 tools: `getCampaignContext`, `queryCampaignLines`, `queryScheduleMonths`, `queryFinanceSummary`, `getPacingSnapshot`, `applyFormPatch`, `adjustLineItems`, `acceptIngestProposal`, `saveClientBrain`, `generatePerformanceReport`, …)
- `lib/ava/skills/registry.ts` — skill guidance loaded on demand
- `src/ava/systemPrompt.ts` + `voiceSpec.ts` + `docs/brain/AVA-VOICE.md` — voice
- `db/avaClient.ts` + `AVA_DATABASE_URL` — a **separate connection as role `ava_readonly`**, fail-closed with an explicit per-table `GRANT SELECT` allowlist. Adding a table to AVA is a migration, not a code change.
- Pages publish `PageContext` to `window.__AV_ASSISTANT__` via `lib/assistantBridge.ts`.

→ `modules/ava.md`

## 14. Admin & M365

`/admin/users`, `/admin/users/new` (Auth0 Management API), `/admin/media-container-best-practice`, `/admin/m365-reconciliation`, `/admin/publisher-profiles`, `/admin/schedule-ingest`, `/admin/myhours-mapping`, `/admin/fireflies-unattributed`, `/pacing/(shell)/admin/orphans`.

M365 provisioning (SharePoint sites, Teams groups) is flag-off by default and logs every attempt to `m365_provisioning_log`. Anchor client per `mbaidentifier` group is enforced by a partial unique index.

→ `modules/m365.md` · `modules/admin-misc.md`

---

## Cross-cutting choke points

Touch these and you are touching everything. Check `BLAST-RADIUS.md` first, every time.

| File | Why |
|---|---|
| `lib/utils.ts` | 216 importers. `cn()`, theme, `mediaTypeTheme` (channel colour keys are load-bearing) |
| `lib/rbac.ts` | 53 importers, edge-safe, fail-closed role resolution |
| `lib/mediaplan/burstAmounts.ts` | The only place fee/media split is computed |
| `lib/mediaplan/serializeBurstsJson.ts` + `formatBurstsForPersist.ts` | The `bursts` shape contract |
| `lib/mediaplan/lineItemIds.ts` | The `line_item_id` format contract |
| `lib/data/toApiRow.ts` | Drizzle → API shaping; `IDENTIFIER_TEXT_FIELDS` must never be coerced to numbers |
| `lib/data/planShapes.ts` | Consolidated row → legacy per-channel shape |
| `lib/api.ts` (3,799 lines) | Isomorphic client/server API monolith; imported by client components, so no Node-only deps |
| `lib/nav/routeManifest.ts` | Single source of truth for sidebar, breadcrumbs, command palette |
| `lib/format/money.ts` / `lib/format/date.ts` | en-AU AUD; rounding changes cause reconciliation drift everywhere |
| `middleware.ts` | Authentication only. Never assume it did a tenant check |

## Scale reference

70 pages · 196 API route handlers · ~450 component files · ~1,440 lib files · 78 live Supabase tables · 50 applied migrations · 13 crons · 20 media channels.
