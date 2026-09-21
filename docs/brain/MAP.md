# MAP — sections and hierarchy

The routing table for the whole app. Find your section, open the files it lists, stop reading. Every path is real and verified on `localhost` @ `39ed2590`.

## Layer hierarchy (what sits on what)

```
L0  PLATFORM      Vercel (project avmediaplan, regions iad1/syd1/sin1) · 16 crons
L1  IDENTITY      Auth0 v4 → middleware.ts (authN only) → lib/rbac.ts (roles) → per-route gates
L2  DATA          Supabase Postgres (Sydney) via Drizzle  db/  ← system of record
                  Snowflake ASSEMBLEDVIEW.MART.*         lib/snowflake/  ← delivery facts, read-only
                  Snowflake ASSEMBLEDVIEW.RAW.PARTNER_*  ← partner file ingest writes (no UPDATE)
                  Vercel Blob                            ← exports, creative, reports, sheets, plan documents
L3  DOMAIN LIB    lib/<domain>/  ← all business rules. Nothing in app/ or components/ may re-derive them.
L4  API           app/api/**/route.ts  (197 handlers) ← own auth + own tenant check, always
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
| 4 | [Client dashboards](#4-client-dashboards) | `/dashboard/[slug]` | `components/dashboard/`, `components/charts/` | `lib/dashboard/`, `lib/charts/`, `lib/spend/`, `lib/campaign-read/` | `/api/dashboard`, `/api/campaigns`, `/api/campaign-reads` | `media_plan_*`, `schedule_months`, `campaign_insights`, `campaign_reads` |
| 5 | [KPI](#5-kpi) | (inside plan + pacing) | `components/kpis/` | `lib/kpi/` | `/api/kpis` | `campaign_kpi`, `client_kpi`, `publisher_kpi` |
| 6 | [Trafficking & creative](#6-trafficking--creative) | `/creative`, `/mediaplans/mba/[mba]/trafficking` | `components/creative/`, `components/trafficking/` | `lib/naming/`, `lib/creative/` | `/api/creative-assets`, `/api/naming` | `creative_asset` |
| 7 | [Publishers & specs](#7-publishers-specs--ingest) | `/publishers` | `components/specs/`, `components/ingest/` | `lib/publisher/`, `lib/specs/` | `/api/publishers`, `/api/admin/ingest` | `publishers`, `publisher_profiles`, `publisher_value_synonyms`, `publisher_specs`, `ingest_*`, `line_item_panels` |
| 8 | [Clients](#8-clients) | `/client` | `components/client-hub/`, `components/client-dashboard/` | `lib/clients/` | `/api/clients`, `/api/admin/client-hub` | `clients`, `client_domains` |
| 9 | [Codex](#9-codex-tasks-time-meetings) | `/tasks` | `components/tasks/` | `lib/codex/`, `lib/fireflies/`, `lib/myhours/` | `/api/codex` | `tasks`, `client_notes`, `team_members`, `ava_*_proposals`, `time_entries` |
| 10 | [Scopes of work](#10-scopes-of-work) | `/scopes-of-work` | (page-local) | `lib/scopes/` | `/api/scopes-of-work` | `scope_of_work` |
| 11 | [Planning tools](#11-planning--insights) | `/tools/behavioural-planner`, `/insights` | `components/planning/`, `components/insights/` | `lib/planning/`, `lib/insights/` | `/api/planning`, `/api/insights` | `planning_audiences`, `planning_audience_uploads`, `planning_uploaded_audiences`, `campaign_insights` |
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
- `lib/api/media-containers.ts` (`MEDIA_CONTAINER_ENDPOINTS`; delivery snapshot uses `fetchAllPlanLineItemsForDelivery`)
- `lib/data/planShapes.ts` (`CHANNEL_ENDPOINT_TO_CHANNEL`, `BURSTS_FIELD_AS_BURSTS`)
- `lib/mediaplan/expertChannelMappings.ts` (8,434 lines) + `expertGridChannelConfig.ts` + `containerChannelConfig.ts`
- `components/media-containers/<Channel>Container.tsx` + `ExpertGrid.tsx`
- both twin pages
- naming (`lib/naming/`), KPI (`lib/kpi/`), pacing suffix maps (`lib/pacing/`)

`BLAST-RADIUS.md` carries the full ~12-map list. Complete all of them or the channel half-works.

**Save path** `POST /api/plans/save` (409 `STALE_BASE_VERSION` when `tipVersionIdAtLoad` is set and the published pointer has moved; `baseVersionId` names the fork source and is not in that guard) → `lib/data/savePlan.ts` → one transaction writing `media_plan_versions` + `line_items` + `schedule_months` + `mba_fee_snapshots`. VP-1 (`0069`/`0070` AUTHOR ONLY): `published_version_id` must be NULL or point at `published_at` set; required order is R1 live in production, then 0070, then 0069. CREATE CONSTRAINT TRIGGER does not scan existing rows, so 0070 stamps the 12 C-113 pointers before the constraint is installed. Do not apply 0069 until the stamping writer is live. After that commit, when `ingestStageId` is present, `completeStagedIngestAfterSave` writes panels / `ingest_runs` / retain — never inside `savePlanVersion`. After a **publish** commit, `runPublishDocumentsBestEffort` regenerates MBA PDF / Media Plan / AA (Blob + jsonb) beside `markRunItemsStaleOnPublish`; failure is named on `documents` and the Generate documents modal step and never rolls back. `WRITE_BACKEND=postgres`. Working drafts live in `plan_working_drafts` (unique `(master_id, user_id)`; identity email else `sub`, never `"unknown"`). `NEXT_PUBLIC_PLAN_DRAFTS` gates autosave chrome; persistence + offer are always on. **0071 AUTHOR ONLY** deletes the nine live rows at go-live (no `campaign_status` update); recovery JSON via `npm run drafts:export`. Presence (`plan_presence`, GET/POST `/api/plans/presence`) is who else has the edit page open — information, not a lock; same identity helper; 0064 AUTHOR ONLY. Published MBA / media-plan / AA files are private Vercel Blob objects (`plans/{mba}/v{n}/{kind}/{filename}`) plus jsonb pointers on the version (`mba_pdf_file` / `media_plan_file` / `aa_media_plan_file`); `POST /api/mediaplans/versions/[id]/documents` writes an upload after publish; admin `POST /api/mediaplans/versions/[id]/documents/regenerate` rebuilds from persisted rows (`lib/docs/buildMediaItemsFromPersisted.ts` + `buildMbaFromPersisted`) and writes the same columns with `source: "regenerated"`. `POST /api/mediaplans/draft-documents` is a publish dry-run: the posted save body renders a stamped DRAFT MBA or Media Plan and writes nothing.

**Read path** `GET /api/mediaplans/mba/[mba_number]` (1,588 lines) → `lib/data/readMbaPlanDetail.ts`. One query set, no fallback: a failure is a 500 `PLAN_DETAIL_POSTGRES_FAILED`, deliberately.

**Legacy shape shim** — `lib/data/planShapes.ts` reassembles a consolidated `line_items` row back into the old per-channel object so older consumers stay byte-compatible. Do not delete it without retiring every consumer.

→ `modules/media-plans.md`

## 2. Finance & billing

**Routes** `/finance` with section children: `home` `investment` `invoicing` `owed` `in-xero` `periods` `costs` (`accruals`, `client-pays`, `invoices`) `forecasting` `xero` (`matches`) · `/finance/forecast/snapshots/variance` · `/finance/receivables`

**Two data access styles live here.** Most of the app uses the Drizzle query builder. Finance periods, run items, notifications and Xero matching are reached with `sql` tagged templates instead — `finance_periods`, `finance_run_items`, `app_notifications`, `xero_contact_links`, `xero_invoice_matches`, `xero_match_month_metrics` (and `plan_working_drafts` / `plan_presence` in media plans). See `lib/finance/periods/postgresStore.ts`. All of them **are** mirrored in `db/schema/`, so the types are there if you want them; migrating the callers to the query builder is a separate decision, not a gap. Pre-merge: `npm run db:drift` against the applied database before any `db/schema/*.ts` handover — the mirror is live code (Drizzle selects every named column).

**Money law** — integer cents everywhere in the plan core (`*_cents`). `numeric` in ported finance tables. Fee is a slice of gross, never `net × fee%`, and only `lib/mediaplan/burstAmounts.ts` computes it. Sections SQL published cut is `PUBLISHED_VERSION_JOIN_SQL` (pointer AND stamp); `relevantPlanVersions` is still the watermark family.

**Billing-record writes** go through `lib/data/writeFinance.ts` (Postgres, `invoice_key`, never `xero:`). Approve / unapprove / mark-exported / unmark-exported are the invoicing human writers. PATCH-by-id is field-allowlisted (notes, PO, payment, status, invoice date, campaign name — not `total` / `billed*` / lifecycle stamps). Line-item delete freezes on parent `approved_at` in SQL (`APPROVED_FROZEN`). Unapprove / mark-exported `ok` is `errors.length === 0`. Approve POST is keys + month; the snapshot is composed server-side (same GET path). Mark-exported is the deliberate "Mark as sent to finance" action (approved keys only; Excel download does not stamp). Unmark-exported clears `exported_at` / `exported_by` only. Xero ingest is the only writer of `xero:` keys. `finance_edits` POST still Xano (T1). Internal finance money is **ex-GST**; Xero Total stays on `xero_ar_*` / `xero_ap_*` only.

**Invoice PDFs** `GET /api/finance/invoices/[xeroInvoiceId]/pdf` (AR, `assertClientAccess`) and sibling `GET /api/finance/bills/[xeroInvoiceId]/pdf` (AP, admin) proxy private Blob reads via `getPrivateBlob`. Never href the blob URL.

**Crons** `finance-pre-run`, `finance-run` (19:00 and 20:00 UTC), `finance-lock` (12:59/13:59 UTC), `xero-sync` (00:15 UTC), `snapshot-checksum` (Mon 03:00 UTC).

→ `modules/finance-billing.md`

## 3. Pacing & delivery

**Routes** `/pacing/(shell)/` → `portfolio` (default; `/pacing` redirects here) `overview` `direct` `programmatic` `social` `search` `ad-serving` · `admin/orphans` `admin/unmapped-placements` · `GET /api/pacing/portfolio` (daily snapshot `pacing_portfolio_snapshots`; cards / expandable table UI on `/pacing/portfolio`, layout in `pacing.portfolioLayout`) · `GET /api/pacing/campaign/[mba]` (per-MBA overlay; `?campaign=` reopens; payload includes `scenarioLines`) · `GET|POST /api/pacing/scenarios` (saved planner runs; `pacing_scenarios` 0084 AUTHOR ONLY) · delivery relabel engine `lib/pacing/relabel` (generalises orphan assign across channels; audit `delivery_relabels` 0085 AUTHOR ONLY) · channel tabs share `LinePacingCard` + `pacing.<channel>Layout` (default cards) + `deliveryStatusFromPct` tiles · cron `/api/cron/pacing-portfolio` (`0 21 * * *`, 07:00 Melbourne) · what-if math is `lib/pacing/scenario` (pure; shared by planner UI and AVA) · planner overlay is `ScenarioPlannerPanel` from every card, the detail header, and the AVA Scenario tab · AVA chat is `run_scenario` + `assembled-scenario-planner` (offered on `/pacing/*` and `/dashboard/*`)

**Shape** Snowflake fact tables joined to plan line items on `line_item_id`. Facts: `MART.PACING_FACT`, `MART.SEARCH_PACING_FACT`, `MART.SOCIAL_PACING_FACT`, `MART.FIXED_COST_*_FACT`. Social dashboard and `/pacing/social` read `SOCIAL_PACING_FACT` (Meta / TikTok / Reddit via `classifySocialPacingPlatform`); programmatic + CM360 stay on `PACING_FACT`. The plan side is pushed into `MART.XANO_LINE_ITEMS_SNAPSHOT` nightly by `/api/cron/xano-line-item-sync` (19:00 UTC) — the table keeps its historic name; the source is now Postgres (`lib/snowflake/syncPgLineItems.ts`, `LINE_ITEM_SNAPSHOT_SOURCE`).

**Two laws.** `PacingStatus` ladder order mirrors the Snowflake view — never reorder. Campaign-delivery Ahead / Behind / On track is `lib/pacing/deliveryStatusFromPct.ts` (behind below 90, ahead above 110) — not the admin ladder. ZERO-$ LAW: direct digital and CM360 lines carry no platform spend; fixed-cost lines take REPORTED_SPEND. CM360 otherwise carries no spend UNLESS the line's `delivery_source_map` row sets `derive_spend_from_plan`, in which case the figure is modelled from the plan rate, capped at the planned total, and labelled as modelled. The flag is OFF for all Direct Booked Digital, so `lib/pacing/ad-serving/*` and `lib/pacing/overview/mapOverviewItems.ts` keep their no-spend row shapes. Programmatic Display/Video/OOH keep a line when `delivery_source_map` has an active row (`lib/delivery/deliverySourceMap.ts` until 0063 is applied). `partner_file` + `prog_ooh` consumes PACING_FACT `Programmatic - OOH` (`snowflakeChannelsForDeliverySource`); Vistar/Broadsign are the `0077` seed. `fixedCostMedia` lines (programmatic and Direct Booked Digital) take delivered spend from `FIXED_COST_REPORTED_DAILY_FACT.REPORTED_SPEND` (same Direct reader; `collectFixedCostLineIds` walks prog + digital display/video/audio/BVOD). Programmatic lines are keyed once on Overview under Direct.

Channel tabs cached 4h via `unstable_cache` tag `pacing-campaigns`. Portfolio GET reads `pacing_portfolio_snapshots` (0081 AUTHOR ONLY) for `(as_of_date, scope_key, live_only)`; admin miss/`?refresh=1` builds inline (`maxDuration` 300); non-admin miss is 202 until that scope row exists.

**Partner file ingest** `GET|POST /api/cron/partner-ingest` (`assertCronSecret`, `maxDuration` 300) pulls Channel Factory Datorama workbooks from `snowflake@assembledview.com.au` via Graph client-credentials (`Mail.ReadWrite`), writes `ASSEMBLEDVIEW.RAW.PARTNER_FILE_LINES` first, then range-replaces `PARTNER_DELIVERY_DAILY` in one `withSnowflakeSession` (BEGIN/DELETE/INSERT/COMMIT — never `querySnowflake`/`execWithRetry` for that txn). One Vercel slot: `30 22 * * *` (08:30 Sydney); the old `0 3 * * *` slot is not in `vercel.json`. Lib: `lib/partner-ingest/`. Tests: `npm run test:partner-ingest`. Partner-file money path: `RAW.PARTNER_DELIVERY_DAILY` → `MART.VW_PACING_PARTNER_FILE` (Channel Factory) / `MART.VW_PACING_PARTNER_OOH` (Vistar) → `PACING_FACT` (`TSK_REFRESH_PACING_FACT`) → `SP_REFRESH_FIXED_COST_NIGHTLY` (3-day window, then partner-file / direct-digital backfill) → `SP_REFRESH_FIXED_COST_REPORTED_DAILY` → `FIXED_COST_REPORTED_DAILY_FACT.REPORTED_SPEND`. CALL the daily proc with lowercase ids. Campaign delivery Programmatic OOH reads PACING_FACT `Programmatic - OOH` via `snowflakeChannelsForDeliverySource(partner_file, …, prog_ooh)`.

→ `modules/pacing.md`

## 4. Client dashboards

**Routes** `/dashboard` (agency overview) · `/dashboard/[slug]` (client portfolio) · `/dashboard/[slug]/[mba_number]` (campaign delivery) · `/dashboard/[slug]/creative`

This is the client-facing surface. Client-role users are confined here by `middleware.ts` and must be scoped by `checkClientMbaAccess` in every handler that serves it. `components/dashboard/DashboardOverview.tsx` is 2,491 lines and is a choke point.

Spend on these pages derives from `schedule_months`, not from live platform data. Client-hub Plan committed is elapsed planned in the date window ÷ planned in the window (`computePlannedSpendTotals`) — not the window total ÷ itself.

Campaign MBA compositor is `CampaignPageAssembly`. Layout contract (section order, campaign read, `CampaignStatusStrip`, `ChannelsAtAGlance`, Connecting, null-KPI) lives in the dashboards module. Campaign reads: `GET|POST /api/campaign-reads/**` (`lib/campaign-read/`), table `campaign_reads` (0079/0082 AUTHOR ONLY; generate is 202 + `after()` job; stale `generating` >10m → `failed`).

→ `modules/dashboards-charts-exports.md`

## 5. KPI

Three-table cascade, most specific wins: `campaign_kpi` (per line item) → `client_kpi` (per client) → `publisher_kpi` (benchmark defaults by publisher + bid strategy + media type).

Fan-out from line items lives in `lib/kpi/`. `campaign_kpi.line_item_id` is the join key to both plan lines and Snowflake facts. Writes upsert on `(lower(mba_number), version_number, lower(line_item_id))` — never a second row. The media-plan KPI modal persists `campaign_kpi` immediately when the plan has an identity; plan save still syncs and always writes `cpv` null plus `target_source: "target"`. Industry benchmarks for empty published live/booked/approved lines are `scripts/kpi/backfill-benchmarks.mjs` (`target_source: "benchmark"`; fail-closed on twins). The campaign MBA KPI review is per channel-platform group (`lib/kpi/kpiReview.ts`) and never averages targets across channels. Channel KPI-band tiles use the same group resolver (`lib/kpi/kpiBandTargets.ts`) so the band and the review row show the same target and pill. Entered metrics are CTR / VTR / conversion rate / frequency; CPV on the card is a plan rate or delivery rate. Review rows name `target` vs `benchmark`; clients only see the section when a card has a saved, benchmark, or CPV plan-rate target.

→ `modules/kpi.md`

## 6. Trafficking & creative

Naming/trafficking builder generates platform names from plan lines (`lib/naming/`). Creative assets are a Postgres row (`creative_asset`) plus a Vercel Blob file; previews, frames, live mockups and ad copy hang off `/api/creative-assets/*`.

→ `modules/trafficking-creative.md`

## 7. Publishers, specs & ingest

**Routes** `/publishers`, `/publishers/[publisherId]` · `/admin/schedule-ingest` · `/mediaplans/mba/[mba_number]/ingest/[stageId]` (staff Parse Review)

Three related-but-distinct stores, all joined on `publishers.id` and never on display name:
- `publisher_profiles` — how to parse a publisher's schedule spreadsheet (`detect_signature`, `column_map`, `field_defaults`, `money_rules`, `grid_semantics`, `line_granularity`). Config is jsonb on the row, not TypeScript per publisher.
- `publisher_value_synonyms` — learned publisher prose → AV canonical (`0060` AUTHOR ONLY). `publisher_id` NULL is a global suggestion, never auto-applied.
- `publisher_specs` + `spec_runs` — material specs and deadlines.
- `ingest_stages` → `ingest_runs` → `ingest_eval_runs` — staged review package (`IngestReviewPackage` jsonb, including `line_audit`, nested `parse_review` per-row decisions, and unconfirmed `proposed_profile`) plus `source_file` jsonb (0068 AUTHOR ONLY; private Blob `ingest/{stageId}/{filename}`; null when Blob retain failed — review still stages), then accepted run history, then weekly parser-accuracy scores (`0067` AUTHOR ONLY; overlay until applied). OOH detail lands in `line_item_panels` + `line_item_panel_flights` (no money columns; spend stays on the burst).

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

`/tools/behavioural-planner` is the Behavioural Change Sequence planner with deterministic narration — not the chat widget. `lib/planning/` is the largest lib directory by bytes (30 MB, mostly reference data). Uploaded Roy Morgan workbooks parse through `lib/planning/upload/` into the same `AudienceResponse` as the live Snowflake path, persist via `planning_audience_uploads` / `planning_uploaded_audiences` (0058 AUTHOR ONLY), and enter the five stages as `AudienceDraft.source = "uploaded"` (`POST /api/planning/audience/uploaded`). Stage B upload UI is `UploadAudienceDialog` + `UploadedAudiencePicker` (file POST, never client-side parse). Saved planner audiences live in `planning_audiences` (`definition_json` is additive: `source`, `uploaded_audience_id`, `upload_file_name`, `upload_wave_code`, `upload_filter_label`; missing `source` loads as composed). `campaign_insights` is append-and-supersede, never delete.

## 12. Knowledge hub

Client-accessible learning centre. Content is file-driven from `src/data/learning/*` — no database. Sections, guides, platform playbooks, calculators, resources, UTM builder.

## 13. AVA

**Entry** `POST /api/chat-v2`. Widget mounted for admins only via `AdminAssistantGate`; the API 403s non-admins.

- `lib/ava/agentLoop.ts` — the tool loop
- `lib/ava/tools/registry.ts` — the tool surface (~33 tools: `getCampaignContext`, `queryCampaignLines`, `queryScheduleMonths`, `queryFinanceSummary`, `getPacingSnapshot`, `runScenario`, `applyFormPatch`, `adjustLineItems`, `calculateMediaMath`, `loadIngestIntoForm`, `acceptIngestProposal`, `saveClientBrain`, `generatePerformanceReport`, …). Offer of `accept_ingest_proposal` is surface-aware (`avaToolDefinitionsForPage`); `run_scenario` is offered only on `/pacing/*` and `/dashboard/*`.
- `lib/ava/applyIngestLineItemsLoad.ts` — create/edit `handleSetLineItems`: enable channel flag if off, dual-write hydration on edit, scroll to the section. Partial MBA unions loaded billing-stable ids into the channel selected set (all-in).
- `lib/ava/skills/registry.ts` — skill guidance loaded on demand. `assembled-campaign-read` writes the dashboard six-beat read via `POST /api/campaign-reads/generate` (202 + `after()` job + campaign-scoped tools). `assembled-scenario-planner` pairs `run_scenario` + `get_campaign_context` + `get_delivery_snapshot` and chains the marketing brain.
- `src/ava/systemPrompt.ts` + `voiceSpec.ts` + `docs/brain/AVA-VOICE.md` — voice
- `db/avaClient.ts` + `AVA_DATABASE_URL` — a **separate connection as role `ava_readonly`**, fail-closed with an explicit per-table `GRANT SELECT` allowlist. Adding a table to AVA is a migration, not a code change.
- Pages publish `PageContext` to `window.__AV_ASSISTANT__` via `lib/assistantBridge.ts`.

→ `modules/ava.md`

## 14. Admin & M365

`/admin/users`, `/admin/users/new` (Auth0 Management API), `/admin/media-container-best-practice`, `/admin/m365-reconciliation`, `/admin/schedule-ingest`, `/admin/myhours-mapping`, `/admin/fireflies-unattributed`, `/pacing/(shell)/admin/orphans`, `/pacing/(shell)/admin/unmapped-placements`.

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

71 pages · 197 API route handlers · ~450 component files · ~1,440 lib files · 78 live Supabase tables · 50 applied migrations · 16 crons · 20 media channels.
