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
Known **divergent re-implementations** that will NOT pick up your change (fix or migrate them deliberately): `lib/billing/generateBillingLineItems.ts:89` (only the budgetIncludesFees branch, no gross-up, no bonus-zeroing) and `lib/billing/computeDerivedCampaignFeeAmount.ts` (independent fee total, reconciled only within $10).

### 4. Published-version watermark — `lib/mediaplan/publishedVersionGuard.ts`
7 external call sites (channel GETs, list caches, dashboard client/finance/shared, MBA route, staged-version reaper). Getting it wrong makes **staged, unpublished versions visible as live plans** across dashboards, finance, and every channel read. Published = `master.version_number`, never `max(versions)`.

### 5. Pacing maths — `lib/pacing/maths/index.ts`
Status ladder order deliberately mirrors Snowflake `V_LINE_ITEM_PACING` (`// Order from V_LINE_ITEM_PACING — DO NOT REORDER`). Changing a band changes: all spend-channel composers, the ops digest email bands, Overview tiles, AVA's narrative — and silently diverges from the warehouse view.

## Per-area impact tables

### Media plans
| Touch | Also check |
|---|---|
| Adding a channel | ~12 hardcoded 20-entry maps must all be updated: `MEDIA_TYPE_ENDPOINTS/FLAGS/ALIASES` (MBA route), `CHANNEL_LINE_ITEM_ENDPOINTS`, `MEDIA_PLANS_ALLOWLIST`, `MEDIA_PLAN_TABLES`, `LINE_ITEM_BROWSER_API_PATH`, `MEDIA_CONTAINER_ENDPOINTS`, `LINE_ITEM_SOURCE_TABLES`, `PUBLISH_INTEGRITY_CHANNEL_FLAGS`, `clearVersionChildren.SLUGS`, `reapUnpublishedStagedVersions.STAGED_CHILD_SLUGS`, `MEDIA_TYPE_LABELS/COLORS`, `MEDIA_TYPE_ID_CODES`, `CREATE_MEDIA_TYPE_CATALOG`, `MediaItems`, `CANONICAL_MEDIA_KEYS` — plus container/grid/config/schema quad and ~4 blocks in each mega-page. Also `normaliseScheduleMediaType` defaults unknown types to `"search"` fees silently |
| `ExpertGrid.tsx` (5.2k lines) or `expertGridChannelConfig` | All 21 channels at once, in create AND edit. Perf contract tests: `expertGridRowPerf.memoContract.test.ts` |
| `containerChannelConfig.fieldMap` | Changes both hydration and API payloads → what Xano stores → what Snowflake/pacing see |
| PUT/PATCH publish contract (`deferMasterVersionPublish`, `forceIncrement`) | Both mega-pages hardcode the semantics; `publishVersionIntegrity` duplicates the guard client+server on purpose |
| Anything in `create/page.tsx` | Probably needs the same fix in `edit/page.tsx` (near-parallel 8k/12k-line implementations: own xlsx/pdf generation, publisher fetch, MBA numbers, ~20-branch save block) — and vice versa. Field-name split: create reads `fv.mp_client_name`, edit reads `fv.mp_clientname` |
| `proxyAllowlist.MEDIA_PLANS_ALLOWLIST` | `clearVersionChildren` needs `{table}/{id}` DELETE allowed; new client-side POSTs 403 unless added |

### Pacing
| Touch | Also check |
|---|---|
| `fetchSearchPacingCampaignRows.ts` | It is the de-facto shared Xano layer: exports `fetchAllMasters` / `fetchCurrentVersionRowsForMasters` used by social, programmatic, ad-serving, direct, overview scope, orphans. Touching the master filter changes all six pacing surfaces at once |
| `pacingRowsCache.ts` | 5 API routes + Overview + AVA `getPacingSnapshot` + ops digest. Cache keys are carefully matched so Overview lands on the tabs' warm entries — changing key shape cold-starts Overview |
| `queryPacingFact` (`lib/snowflake/pacing-fact.ts`) | social + programmatic + ad-serving composers AND 4 standalone POST routes. `CHANNEL LIKE '%…%'` matching — a warehouse channel rename silently yields zero rows, not an error |
| `fetchDirectPacingRows` / `direct/types` | `/pacing/direct`, Overview, ops digest, AND the client dashboard's "delivered" money (`lib/delivery/deliveredTotals`) |
| `slugifyPlanClientName` | Auth scoping in every pacing route; note it is a DIFFERENT slugifier from `lib/clients/slug` — both sides of the auth→plan join |
| Orphan assign | UPDATEs `MART.SEARCH_PACING_FACT` directly (no mapping table) — reverted by any warehouse full refresh |

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
| `parsePersistedBillingScheduleToMonths` | Legacy-shape inference — silently rewrites historic campaign months for hydrate paths |

### KPI
| Touch | Also check |
|---|---|
| `lib/kpi/types.ts` (`ResolvedKPIRow`) & `deliveryTargets.ts` (`KPITargetValues`) | Treat as frozen public API — 41 importing files across pacing, delivery, dashboards, mediaplans, scripts |
| `normaliseRatioTarget` / percent-scale logic | Recurring live bug class. `>=1` = percent points applies to ctr/vtr/conversion_rate, NEVER cpv (dollars). Unset returns null, never 0 |
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
| `DATA_BACKEND` / `lib/data/readReferenceMediaDetail.ts` / `readPublishers.ts` / `readClients.ts` / `readKpi.ts` / `readFinance.ts` / `readPacing.ts` / `readMediaPlans.ts` | Shadow must never change response body; `postgres` needs ETL-loaded Supabase; `/api/admin/migration-diffs` is process-local; per-domain env `DATA_BACKEND_PUBLISHERS` / `DATA_BACKEND_CLIENTS` / `DATA_BACKEND_KPI` / `DATA_BACKEND_FINANCE` / `DATA_BACKEND_PACING` / `DATA_BACKEND_PLANS`; finance admin summary splits `unexpected` vs `duplicate-class` (PG deduped / Xano duplicated); plans reassembles channel shapes from `line_items` (attrs spread + bursts); plans duplicate-class tags PENFOLD015/013/014 + BOSS001; `XANO_LINE_ITEMS_SNAPSHOT` stays Xano until T6; full MBA GET `!skipLineItems` fan-out stays Xano |
| `app/api/media-details/[...path]/route.ts` | Allowlist + reference read path; POST create endpoints still Xano-only |
| `middleware.ts` | Auth-only for `/api/*`; `/api/cron/*` bypassed entirely (only `assertCronSecret`); client-role tenant confinement logic |
| Any cache module | Two independent clients caches (10min vs 30s) with separate invalidation; 4 of 7 coalesced caches have NO invalidation path; caches are per-lambda on Vercel |
| `lib/api.ts` module scope | Throws at import server-side if publisher/client base URLs unset; imported by client components so no Node-only deps (reference reads use dynamic `import(/* webpackIgnore: true */)` of server-only modules — without `webpackIgnore`, `next build` fails on create/edit) |

## Duplication map (fix must be applied N times)

- Create page ↔ edit page (near-parallel mega-pages)
- 14 bespoke containers ↔ 6 `MediaChannelContainer`-based (half-finished refactor); 9 local `computeLoadedDeliverables` copies with a rounding split (5 rounded / 4 raw)
- Pacing composers: `lineItemStatusFromPacing` ×3 identical copies; KPI-target block ×3; `resolveLive*LineItems` ×3; per-channel `LineItemPacingTable.tsx` ~1.2k lines each, ~90% identical; page clients structurally identical ×5
- Channel-key naming: 4 conventions coexist (`progBVOD`/`progBvod`/`digiDisplay`/`mp_*`) — alias tables `FANOUT_LINE_ITEM_MAP_ALIASES` and `MEDIA_TYPE_ALIASES` paper over it
- Two Snowflake read stacks with different semantics: `pacing-fact`/`search-campaigns-pacing` (pacing pages) vs `pacing-service`/`search-pacing-service` (dashboard, `/api/pacing/bulk`) — same MBA can show different numbers on /pacing vs /dashboard
- Two clients caches; duplicate 194-line toast hook (`hooks/use-toast` vs `components/ui/use-toast` — separate module state); three Melbourne-date helpers; two Auth0 client instances (`lib/utils/auth.ts` vs `lib/auth0.ts`); two saved-view stores (localStorage + Xano)
