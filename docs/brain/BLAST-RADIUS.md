# Blast Radius — "if I touch X, what else breaks?"

**Use this page before every change.** Find the file(s) you plan to touch; the right-hand column is your review-and-test checklist. Import counts verified by grep at commit `ecc948b`.

## Tier 0 — the choke points (ranked by importing files)

| # | File | Importers | What breaks if you change it |
|---|---|---|---|
| 1 | `lib/utils.ts` | **216** (277 incl. subtree) | `cn()` — every component's class merging. `mediaTypeTheme` colour keys — every chart/gantt/legend for that channel silently loses colour |
| 2 | `lib/api/xano.ts` | **106** | Every outbound Xano call. `parseXanoListPayload` returns `[]` silently on unknown shapes; `getRequiredEnv` returns `""` in browser (no error) |
| 3 | `lib/format/money.ts` | **80** | All currency display + `roundMoney2/4` in derived totals → billing/forecast/export reconciliation drift |
| 4 | `lib/mediaplan/expertModeWeeklySchedule` / `weeklyGanttColumns` | 65–68 | Expert-mode week math + gantt columns everywhere |
| 5 | `lib/mediaplan/expertChannelMappings.ts` (8.4k lines) | **63** | Standard↔expert row conversion, all 20 channels |
| 6 | `lib/billing/types.ts` (`BillingMonth`) | **61** | 33+ files across finance and billing |
| 7 | `lib/rbac.ts` | **53** | Sole authority for roles/tenant. Regression = mass lockout or mass elevation. Imported by edge middleware — must stay edge-safe |
| 8 | `lib/auth0.ts` | **52** | **Throws at import** on missing env → takes the whole app down, not one route. `beforeSessionSaved` drops claims silently if changed |
| 9 | `lib/requireRole.ts` | **35** | Gate on all admin + all finance routes; the `"response" in result` discriminant shape is relied on at every call site |
| 10 | `lib/generateMediaPlan.ts` (2.3k lines) | **32** | A **type hub disguised as a generator** — all 20 containers import `LineItem` from it; `MediaItems` feeds KPI grouping + Excel |
| 11 | `lib/clients/slug.ts` | **24** | Slugs ARE tenant identity (URLs, Auth0 claims, cache enrichment). Algorithm change → client users locked out. `legalsuper → legal_super` override is load-bearing |
| 12 | `lib/api/xanoPagination.ts` | **22** | All multi-page reads. Silent truncation at 10,000 rows; dedupe fallback can drop distinct rows on tables without `id` |

## The five highest-consequence contracts

### 1. `bursts_json` shape — `lib/mediaplan/serializeBurstsJson.ts` + `formatBurstsForPersist.ts`
Changing a key or type breaks, simultaneously: pacing (`lib/pacing/burst/parseBursts.ts` → all 5 live-line-item resolvers), delivery compute (social/programmatic/search), billing (`generateBillingLineItems`, `seedLineFees`, `assertPersistedLineFeesMatchBilling`), finance (`computeCampaignFinancials`), dashboard gantt/charts (`normalizeLineItem`), the Snowflake snapshot sync (`fetchAllLineItems`), Excel/AA exports.
**Trap:** `mediaAmount` in the JSON is sourced from `deliveryMediaAmount`, so it is non-zero when `clientPaysForMedia` is true. `fee` history: see INVARIANTS (bursts contract).

### 2. `line_item_id` — `lib/mediaplan/lineItemIds.ts` (`MEDIA_TYPE_ID_CODES`, `buildLineItemId`)
The join key for: KPI fan-out (28 refs in `lib/kpi/fanOut.ts`), billing burst resolution, creative/trafficking pickers, Snowflake dedupe key, search-suffix pacing match, orphan assignment. Legacy `ML` codes still live in the warehouse after the May 2026 ML→DD/IT/PV/PB/PA/PO/OH split — matchers must handle both.

### 3. Fee math — `lib/mediaplan/burstAmounts.ts::computeBurstAmounts`
**The single widest blast radius in the repo.** 4 branches (see INVARIANTS). Consumed by ~19 container `get*Bursts` + every expert grid via `expertRowFeeSplit` + `computeCampaignFinancials` → every receivable, payable, accrual row, forecast line, snapshot, and export.
Known **former** divergent re-implementations (C-7/C-8 FIXED in PC2): `generateBillingLineItems` and `computeDerivedCampaignFeeAmount` now route through `computeBurstAmounts`; agency fee drift tolerance is $0.01.

### 4. Published-version watermark — `lib/mediaplan/publishedVersionGuard.ts`
7 external call sites (channel GETs, list caches, dashboard client/finance/shared, MBA route, staged-version reaper). Getting it wrong makes **staged, unpublished versions visible as live plans** across dashboards, finance, and every channel read. Published = `master.version_number`, never `max(versions)`.

### 5. Pacing maths — `lib/pacing/maths/index.ts`
Status ladder order deliberately mirrors Snowflake `V_LINE_ITEM_PACING` (`// Order from V_LINE_ITEM_PACING — DO NOT REORDER`). Changing a band changes: all spend-channel composers, the ops digest email bands, Overview tiles, AVA's narrative — and silently diverges from the warehouse view.

## Per-area impact tables

### Media plans
| Touch | Also check |
|---|---|
| Adding a channel | ~12 hardcoded 20-entry maps must all be updated: `MEDIA_TYPE_ENDPOINTS/FLAGS/ALIASES` (MBA route), `CHANNEL_LINE_ITEM_ENDPOINTS`, `MEDIA_PLANS_ALLOWLIST`, `MEDIA_PLAN_TABLES`, `LINE_ITEM_BROWSER_API_PATH`, `MEDIA_CONTAINER_ENDPOINTS`, `LINE_ITEM_SOURCE_TABLES`, `PUBLISH_INTEGRITY_CHANNEL_FLAGS`, `clearVersionChildren.SLUGS`, `reapUnpublishedStagedVersions.STAGED_CHILD_SLUGS`, `MEDIA_TYPE_LABELS/COLORS`, `MEDIA_TYPE_ID_CODES`, `CREATE_MEDIA_TYPE_CATALOG`, `MediaItems`, `CANONICAL_MEDIA_KEYS` — plus container/grid/config/schema quad and ~4 blocks in each mega-page. Also `normaliseScheduleMediaType` returns null for unknown types (fee → 0 + builder-issue warn); do not reintroduce silent search-fee inheritance. |
| `ExpertGrid.tsx` (5.2k lines) or `expertGridChannelConfig` | All 21 channels at once, in create AND edit. Perf contract tests: `expertGridRowPerf.memoContract.test.ts` |
| `containerChannelConfig.fieldMap` | Changes both hydration and API payloads → what Xano stores → what Snowflake/pacing see |
| PUT/PATCH publish contract (`deferMasterVersionPublish`, `forceIncrement`) | Both mega-pages hardcode the semantics; `publishVersionIntegrity` duplicates the guard client+server on purpose |
| Anything in `create/page.tsx` | Probably needs the same fix in `edit/page.tsx` (near-parallel 8k/12k-line implementations: own xlsx/pdf generation, publisher fetch, MBA numbers, ~20-branch save block) — and vice versa. Field-name split: create reads `fv.mp_client_name`, edit reads `fv.mp_clientname` |
| `proxyAllowlist.MEDIA_PLANS_ALLOWLIST` | Catch-all is staff-only (`requireRole`); `clearVersionChildren` needs `{table}/{id}` DELETE allowed; new staff POSTs 403 unless added |

### Pacing
| Touch | Also check |
|---|---|
| `fetchSearchPacingCampaignRows.ts` | It is the de-facto shared Xano layer: exports `fetchAllMasters` / `fetchCurrentVersionRowsForMasters` used by social, programmatic, ad-serving, direct, overview scope, orphans. Touching the master filter changes all six pacing surfaces at once |
| `pacingRowsCache.ts` | 5 API routes + Overview + AVA `getPacingSnapshot` + ops digest. Cache keys are carefully matched so Overview lands on the tabs' warm entries — changing key shape cold-starts Overview |
| `queryPacingFact` (`lib/snowflake/pacing-fact.ts`) | social + programmatic + ad-serving composers AND 4 standalone POST routes. `CHANNEL LIKE '%…%'` matching — a warehouse channel rename silently yields zero rows, not an error |
| `fetchDirectPacingRows` / `direct/types` | `/pacing/direct`, Overview, ops digest, AND the client dashboard's "delivered" money (`lib/delivery/deliveredTotals`) |
| `slugifyPlanClientName` | Auth scoping in every pacing route; note it is a DIFFERENT slugifier from `lib/clients/slug` — both sides of the auth→plan join |
| Orphan assign | UPDATEs `MART.SEARCH_PACING_FACT` directly (no mapping table) — reverted by any warehouse full refresh |
| Splitting/renaming a delivery `ChannelKey` | `types.ts`, `getChannelIcon`, `channelMediaTypeColour`, `shouldShowChannelAggregate`, the adapter, `CampaignDeliverySection`, `CampaignPageAssembly`, `page.tsx`, `DeliveryDataProvider`, `loadDeliverySnapshot` group strings, and the two group-string consumers (`assembleCampaignReportData` `CHANNEL_LABELS`, `getPacingSnapshot`). This is **not** the "Adding a channel" row — media-plan registry maps are untouched. |
| `DeliveryDailyChart` / `DeliveryDailyChartSeries.format` | Optional per-series ComboChart format. Bars default `dollars`, lines default `number` — every existing caller relies on those defaults. Direct Booked Digital passes `number` / `percent`. Changing a default silently reformats every dual-axis delivery chart that omits `format`. |

### Finance / billing
| Touch | Also check |
|---|---|
| `computeCampaignFinancials.ts` | MBA create + edit pages (3 call sites), `recomputeBillingScheduleOnSave` (→ every schedule PATCH can 409), `computeCampaignFinancialsFromVersion` (→ all receivables) |
| `resolveFeePctFromFeeLoading` / `FEE_FIELD_BY_MEDIA` | Wrong mapping = save-blocking 409s for planners, not just wrong numbers. Special cases: production→0, influencers→`feecontentcreator` fallback, integration→no fallback |
| `monthExGstFromScheduleEntry` | THE definition of a month's ex-GST value: receivable totals, `billableEqualsMba` validation, MBA panel indicators |
| `receivableMergeKey` / `composeInvoiceKey` | Key change orphans existing `finance_billing_records` status rows → billed invoices reappear as unbilled |
| `relevantPlanVersions` | Which version is authoritative per month, across receivables/payables/finance data. Staged-unpublished versions must never become relevant |
| Forecast `line_key`/`group_key` taxonomy | Breaks comparability of **existing persisted snapshots** (variance joins on those keys) and target-row validation |
| `billedDrift` hash functions | Every already-billed record's stored hash mismatches → whole book flags as drifted |
| `lib/billing/balancer.ts` / `collisionWorksheet.ts` | Timing editors + edit postgres save collision pause when `NEXT_PUBLIC_BILLING_BALANCER=on`; C2 gates unchanged |
| `lib/finance/periods/*` / `0010_finance_periods.sql` / crons `finance-pre-run|run|lock` / sections `components/finance/sections/periods/*` + `/finance/periods` | Flag `FINANCE_PERIODS`; publish→stale via `savePlan`; lock sheets immutable Blob; AUTHOR-ONLY migration; sections board exposes run/lock/approve/adjust/hold only (classic hub `FinancePeriodRail` removed FN7); FIN-8 hides Periods tab in Clients billing when flag off |
| `lib/finance/sections/serviceLineBucket.ts` (`CAMPAIGN_LEVEL_NO_LINE_DETAIL`) | Wire key for `__service__*` buckets — Investment cut + Costs publisher charts; FIN-8 display label only (`Campaign totals…`); do not rename the wire string without updating SQL + consumers |

### KPI
| Touch | Also check |
|---|---|
| `lib/kpi/types.ts` (`ResolvedKPIRow`) & `deliveryTargets.ts` (`KPITargetValues`) | Treat as frozen public API — 41 importing files across pacing, delivery, dashboards, mediaplans, scripts |
| `lib/kpi/percentUnits.ts` (`normaliseRatioTarget` / `parsePercentHeuristic` / format / cell tint) | UI percentage points ↔ stored decimal for ctr/vtr/conversion_rate/viewability; NEVER cpv. No magnitude heuristic (AV-25 v2). Unset returns null, never 0. Data migration pending Luke — scan via `npm run scan:kpi-percent-units` |
| `lib/kpi/kpiWriteHandlers.ts` + `lib/data/writeKpi.ts` + `app/api/kpis/{campaign,campaign/sync,client,publisher}` writes | Admin write matrix after `requireRole(["admin"])`; validation → named 400; campaign/client PG-first + Xano mirror (X5); publisher still Xano; percent bodies decimal ≤1 (`percentUnits` — no magnitude heuristic) |
| `deliveryTargetCurve.ts` | Contract behind every delivery chart's target line |
| KPI target maps | There are TWO with different keys: `lineItemTargets` (`mba\|version\|line_item_id`) vs `kpiTargets` (`media_type::publisher::bid_strategy`). Fixing one does not fix the other |

### AVA / creative
| Touch | Also check |
|---|---|
| `lib/ava/types.ts` (`PageContext`, `FormPatch`) | 13+ files outside AVA: trafficking, creative, dashboard, finance, planning, both mega-pages |
| `lib/assistantBridge.ts` | 12 provider call sites; `__AV_ASSISTANT__` is a window global — breakage is silent, no compile error |
| Adding an AVA tool | `tools/registry.ts` **throws at module load** if order/names diverge from `AVA_TOOL_NAMES` in `summaries.ts` (same index) → 500s the whole chat route |
| AVA `fy` / `fyToRange.ts` | Ending-year AU FY for all five Postgres tools; responses echo `range`. Finance hub `fyMonthRange` remains start-year — do not unify blindly |
| `lib/ava/anthropic.ts` (`AVA_MODEL`) | NOT AVA-only: ad-copy + search-copy routes and `researchClient` share it |
| `lib/creative/getPrivateBlob.ts` | Shared by three download routes: creative, MI specs, performance reports |
| `lib/naming/templates.ts` | THE law for composed names + trafficking Excel; changes break round-trip parse/validate + 13 tests |

### Shared core
| Touch | Also check |
|---|---|
| Env-key fallback chains in `lib/api/xano.ts` / `xanoClients.ts` | Order matters; `XANO_MEDIA_PLANS_BASE_URL` vs `XANO_MEDIAPLANS_BASE_URL` are live aliases; `XANO_BASE_URL` doubles as the assistant endpoint — see shared-core module page |
| `DATA_BACKEND` / `WRITE_BACKEND` / `DATA_BACKEND_PLAN_DETAIL` / `lib/data/readReferenceMediaDetail.ts` / `readPublishers.ts` / `readClients.ts` / `writeClients.ts` / `writePublishers.ts` / `writeReferenceMediaDetail.ts` / `writeMediaContainerBestPractice.ts` / `writeBillingOverrides.ts` / `writeBillingSchedule.ts` / `readKpi.ts` / `readFinance.ts` / `readPacing.ts` / `readMediaPlans.ts` / `readMbaPlanDetail.ts` / `readApprovals.ts` / `writeApprovals.ts` / `savePlan.ts` / `mirrorToXano.ts` / `WriteBackendContext.tsx` / create+edit layouts / `lib/finance/scheduleMonthsSource.ts` | Shadow must never change response body; `postgres` needs ETL-loaded Supabase; `/api/admin/migration-diffs` is process-local; per-domain env `DATA_BACKEND_PUBLISHERS` / `DATA_BACKEND_CLIENTS` / `DATA_BACKEND_KPI` / `DATA_BACKEND_FINANCE` / `DATA_BACKEND_PACING` / `DATA_BACKEND_PLANS` / `DATA_BACKEND_APPROVALS`; `DATA_BACKEND_PLAN_DETAIL` (default `postgres`, no global fallback) gates MBA GET only — `postgres` → `readMbaPlanDetail` (500 `PLAN_DETAIL_POSTGRES_FAILED`); `xano` → 410 `PLAN_DETAIL_XANO_GONE`; clients writes PG-first via `writeClients` (mirror `xano_client_mirror_failed`); reference writes (X4) PG-first via `writePublishers` / `writeReferenceMediaDetail` / `writeMediaContainerBestPractice` (mirrors until T7; bust publishers/BP/`xanoReferenceCache` + browser 24h media-details TTL on create); `mba_line_approvals` is postgres-authoritative (no Xano write mirror; ETL skips truncate-reload); finance schedule derive source `DATA_BACKEND_FINANCE_SCHEDULE` (`blob` / `shadow` / `rows`, default blob; domain `finance-schedule`; `?probe=finance-schedule`); finance admin summary splits `unexpected` vs `duplicate-class` (PG deduped / Xano duplicated); plans reassembles channel shapes from `line_items` (attrs spread + bursts); plans duplicate-class tags PENFOLD015/013/014 + BOSS001; `mba_line_approvals` absence = all-in (fail-soft); `XANO_LINE_ITEMS_SNAPSHOT` stays Xano until T6; MBA GET Xano fan-out remains default until `DATA_BACKEND_PLAN_DETAIL` flip (create/edit use `skipLineItems=true`); `WRITE_BACKEND` default `xano` — independent of `DATA_BACKEND`; when `postgres`, create/edit call `POST /api/plans/save` (T4b mirror; `mirror: failed` never rolls back); admin retry `POST /api/admin/xano-mirror/retry` |
| `app/api/media-details/[...path]/route.ts` | Allowlist + reference GET dual; POST creates PG-first + Xano mirror (X4) |
| `middleware.ts` | Auth-only for `/api/*`; `/api/cron/*` bypassed entirely (only `assertCronSecret`); client-role tenant confinement logic; Finance sections (FN7/FIN-1): `/finance` → invoicing + `?tab=` redirects; `/api/finance/sections/*` admin 403 fail-closed |
| `app/api/cron/xero-sync` | Writes `xero_*` + `finance_billing_records` (`xero:` keys) + Blob PDFs + PC6 `match_run_items`; Xano task still active until T6 — dual writers; parity via `db:xero-parity` before any `db:etl` |
| `lib/xero/matcher/threeTier.ts` / `0011_xero_invoice_matches.sql` / `POST /api/finance/xero-match` / `GET …/xero-match/list` / sections `components/finance/sections/xero/*` | Extends T5 only; write-off admin+reason; `xero_contact_links` learn-forever; hit-rate feeds PC5 pre-run; sections expose accept/dispute/write-off (not reassign) |
| `GET/POST /api/finance/xero-queue` / `XeroExceptionsPanel` / `lib/finance/sections/xero/pendingIdentity.ts` / `enrichPendingFromXero.ts` | FIN-7 assignment UX only — enrich pending with AR reference/description/contact; MBA catalog for guided assign; do not change matcher or pending-edit rules |
| `lib/finance/sections/costsQuery.ts` / `summaryQuery.ts` / `financeCampaignStatus.ts` / `scheduleLineJoinSql.ts` / `publisherIdentitySql.ts` / `GET /api/finance/sections/costs/summary` / `components/finance/sections/costs/*` | CP-3: media-only booked cost + status `approved\|booked\|completed`; fee/adserving labelled separately; `coverage.excludedByStatusCents` / `orphanLineCents`; FN0 publisher CASE; join must use `SCHEDULE_LINE_JOIN_SQL` (C-26); AP attribution name-heuristic only — unattributed never dropped; do not wire Costs UI to `global-monthly-*` |
| `lib/finance/sections/clientPaysQuery.ts` / `clientPaysCompose.ts` / `GET /api/finance/sections/costs/client-pays` / `/finance/costs/client-pays` / Costs overview `clientPaysExcludedCents` tile | CP-8: inverted CP-3 footprint (client-pays media only); complements payables headline; fee column omitted (C-27 — billing-schedule fee is a future slice); disclose C-29 line-detail limitation; dual-shape join required |
| `components/finance/sections/costs/CostsAccrualsClient.tsx` / `useCostsAccrualData.ts` / `computeAccrualByClient` | Accrual section surface (hub panel deleted FN7); same billing+payables fetch path (M8 blob rule); Investment deep-links must pass client+month |
| `lib/finance/sections/investment/*` / `POST /api/finance/sections/investment/cut` / `components/finance/sections/investment/*` | FN3a billable composition; one basis only; LATERAL LIMIT 1 on line/publisher joins (no sm fanout); fee/billable measures must surface `coverage.fee` (C-27); Actuals measures MBA×month grain only (`cutGrain.ts` / `cutArQuery.ts`) — refuse line dims with 422, never prorate; `coverage.ar` when Actuals requested; agency economics (`agencyEconomics.ts` / `agencyEconomicsAttach.ts`) — current-FY-only while C-27 holds, retainer via forecast mapping, `coverage.agency` caption, seeded presets via `?preset=`; channelGroup map sign-off in `channelGroups.ts`; Unmatched ≠ Costs Unspecified; classic Report tab untouched |
| `lib/mediaplan/drafts/*` / `0012_plan_working_drafts.sql` / `POST /api/plans/drafts` / create+edit draft chrome / `hooks/usePlanDraftSession.ts` | Flag `NEXT_PUBLIC_PLAN_DRAFTS` (default off); pill shares `resolvePostgresSaveMode` (lazy-empty version history must not force v1 on leave-draft); pill effect must memo `modeResolved` + no-op disabled `setPill` (C-32); publish path untouched except optional `baseVersionId` → 409 stale compare; Discard leaves tip byte-identical; docs/pacing keep serving published tip |
| Any cache module | Two independent clients caches (10min vs 30s) with separate invalidation; publishers + mediaContainerBestPractice caches invalidate on X4 writes; remaining coalesced caches may still lack invalidation; caches are per-lambda on Vercel |
| `lib/api.ts` module scope | Throws at import server-side if publisher/client base URLs unset; imported by client components so no Node-only deps (reference reads use dynamic `import(/* webpackIgnore: true */)` of server-only modules — without `webpackIgnore`, `next build` fails on create/edit) |

## Duplication map (fix must be applied N times)

- Create page ↔ edit page (near-parallel mega-pages)
- 14 bespoke containers ↔ 6 `MediaChannelContainer`-based (half-finished refactor); 9 local `computeLoadedDeliverables` copies with a rounding split (5 rounded / 4 raw)
- Pacing composers: `lineItemStatusFromPacing` ×3 thin wrappers over `lib/pacing/status.ts` `pacingStatus()`; KPI-target block ×3; `resolveLive*LineItems` ×3; per-channel `LineItemPacingTable.tsx` ~1.2k lines each, ~90% identical (Status cells + scroll height now shared via `status.ts` / `pacingTableScroll.ts`); page clients structurally identical ×5; sticky-column freeze still diverges (search densest)
- Channel-key naming: 4 conventions coexist (`progBVOD`/`progBvod`/`digiDisplay`/`mp_*`) — alias tables `FANOUT_LINE_ITEM_MAP_ALIASES` and `MEDIA_TYPE_ALIASES` paper over it
- Two Snowflake read stacks with different semantics: `pacing-fact`/`search-campaigns-pacing` (pacing pages) vs `pacing-service`/`search-pacing-service` (dashboard, `/api/pacing/bulk`) — same MBA can show different numbers on /pacing vs /dashboard
- Two clients caches; duplicate 194-line toast hook (`hooks/use-toast` vs `components/ui/use-toast` — separate module state); three Melbourne-date helpers; two Auth0 client instances (`lib/utils/auth.ts` vs `lib/auth0.ts`); two saved-view stores (localStorage + Xano)
- **Two media-plan list caches** — `lib/api/mediaPlansListCache.ts` (`GET /api/mediaplans`, Campaigns) ↔ `lib/api/mediaPlanVersionsCache.ts` (`GET /api/media_plans`, dashboard). Master-owned list fields (`mp_client_name`) overlay via shared `lib/api/overlayMasterOwnedListFields.ts`. Fixing only one path is DI-9 / DI-9b class drift.
