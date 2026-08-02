# Known Issues & Tech Debt Register

One register, stable IDs. **Check here before "discovering" a bug** — it may be known. When you fix one, mark it `FIXED (commit)` — don't delete the row. Add new items with the next free ID in the right section.

## Security (SEC-*) — treat as highest priority

| ID | Issue | Status |
|---|---|---|
| SEC-1 | Two catch-all Xano proxies (`/api/media_plans/[...path]`, `/api/media-details/[...path]`) accept any authenticated session and forward with server `XANO_API_KEY`. Allowlist (`proxyAllowlist.ts`) constrains paths/methods but not tenant | Constrained (SEC-D) live-verified (`7f652e42`) — staff-only `requireRole(["admin"])` (`manager` removed); client catch-all → 403 + `[proxy-403]` soak log; dies with Xano reads at T6 |
| SEC-2 | `GET /api/mediaplans` returns ALL clients' plans to any admin/manager — no per-caller filter (role-gated only) | FIXED (SEC-B) live-verified (`7f652e42`) — clients MBA-scoped (`resolveClientMbaScope`); admin full list (probe: client 1 vs admin 189) |
| SEC-3 | `PUT`/`PATCH` on `/api/mediaplans/mba/[mba_number]` skip the `checkClientMbaAccess` that GET enforces | Verified FIXED (`ff648830`) — both PUT and PATCH call `checkClientMbaAccess`; foreign PUT client → 403 live-verified (`7f652e42`) |
| SEC-4 | `GET /api/dashboard/[slug]` has no tenant match for client users | FIXED (SEC-A) live-verified (`7f652e42`) — own slug 200 / foreign slug 403; admin unscoped |
| SEC-5 | Finance + client admin APIs are session-only in places; two routes carry literal `// allow access for development` comments (`app/api/clients/route.ts`, `app/api/mba/generate/route.ts`) | FIXED (SEC-C) live-verified (`7f652e42`) — `/api/clients` + accrual + forecast: unauth 401 / client 403 / admin auth-path; staff gate is `requireRole(["admin"])` after manager removal |
| SEC-6 | Most `/api/kpis/*` write methods have no authz | FIXED (SEC-A) live-verified (`7f652e42`) — writes + client/publisher GETs `requireRole(["admin"])` (same staff gate; create/edit consume GETs via `lib/api/kpi.ts`; `manager` removed from UserRole) |
| SEC-7 | `/api/pacing/programmatic/{display,video}` and `/api/pacing/social/{meta,tiktok}` have **no authorization gate** — any authenticated client user can read another tenant's delivery data (compare `/api/pacing/bulk` which checks) | FIXED (SEC-A) live-verified (`7f652e42`) — client own MBA non-403 / foreign 403 / admin auth-path on all four POSTs |
| SEC-8 | Middleware enforces authentication only on `/api/*`; tenant isolation is per-handler and only ~13 routes check. `/api/cron/*` bypasses middleware entirely (protected only by `assertCronSecret`) | By design — but every new API route must add its own tenant check |
| SEC-9 | `checkClientMbaAccess` fallback uses exact equality `mbaNumber === mbaidentifier` (e.g. `PENFOLD001` vs `PENFOLD`) so it effectively always denies — client users MUST have `app_metadata.mba_numbers`. The working prefix-matcher `mbaNumberMatchesClientIdentifier.ts` exists but is imported only by its own test | FIXED (SEC-B) live-verified (`7f652e42`) — fallback uses `mbaNumberMatchesClientIdentifier`; `mba_numbers` remains primary |
| SEC-10 | Dynamic `[param]` API routes missing the role/tenant gate of their collection sibling (~19 suspected from UX handover; code inventory found **5 clear GAP methods**) | **static complete — live probe pending** (O6 + SEC-G): O6 gates + SEC-G morning answers — publishers/best-practice writes `requireRole(admin)`, television `[id]` PUT/DELETE `requireRole(admin)`, dedicated channel collection POSTs `requireRole(admin)` (SEC-G residual), `clients/[id]` GET intentional split, creative soft-spot via `checkClientMbaAccess` (admin-only unscoped); inventory `docs/brain/API-DYNAMIC-ROUTE-GATES.md` |

## Data integrity (DI-*)

| ID | Issue | Status |
|---|---|---|
| DI-1 | `media_plan_production` has no version FK → production lines render across all versions; MBA-only fallback must be retained (was D4-K1) | Open — needs Xano schema change + backfill |
| DI-2 | Container line items observed missing from saved `billingSchedule` (glenda007 v9: PD2 in Xano, absent from persisted JSON). Save serializer audit + "re-sync containers to billing" action proposed | Open |
| DI-3 | Legacy duplicate billing line-item ID producers can create double-count readers | Open |
| DI-4 | Orphan fix UPDATEs `MART.SEARCH_PACING_FACT` directly (no mapping table) — reverted by any warehouse full refresh; updates all dates for the tuple | Open |
| DI-5 | `fetchAllXanoPagesWithCompleteness` treats wrapped `{items:[…]}` envelopes as `[]` (silent truncation) and ignores `nextPage`. Plain `fetchAllXanoPages` silently caps at 10,000 rows (50 pages × 200) | Open |
| DI-6 | Xano tables in docs but absent from `xano-tables-schema.json` export (`pacing_mappings`, `pacing_thresholds`, `finance_forecast_snapshots*`, …) — export stale or tables never created; reconcile | Open |
| DI-7 | Publisher-ID parity between `XANO_PUBLISHERS_BASE_URL` and `XANO_CLIENTS_BASE_URL/get_publishers` unverified | Open |
| DI-8 | Xano filtering not applied on all line-item tables — raw counts stay MBA-wide on several channels (newspaper 174 raw / 3 kept) with client-side filtering doing the work (was D4-K5) | Open |
| DI-9 | Postgres `GET /api/mediaplans` list dropped master-owned `mp_client_name` (Xano `_latest` had it inline; `mergeLatestVersionsWithMasters` overlaid `version_number` only) → list search crashed on `.toLowerCase()` | FIXED (`58ed536d`) — `overlayMasterOwnedListFields` in `mediaPlansListCache` + fail-closed `matchesMediaPlanSearch` (Campaigns list path only; dashboard twin is DI-9b) |
| DI-9b | Postgres `GET /api/media_plans` (dashboard via `mediaPlanVersionsCache`) same miss as DI-9 — version rows served with no master overlay → empty `mp_client_name` → blank Client Name column, View disabled, client filter/search empty, Total Live Clients counted scopes only | FIXED (`206321cb`) — shared `lib/api/overlayMasterOwnedListFields.ts` + `applyMasterOwnedOverlayByMba` on versions-cache postgres path |
| DI-10 | Postgres read shaping via `coerceNumericStringsToNumbers` turned text identifiers into numbers (`mba_number` `"001001"` → `1001`) → list search threw, routes/scope/mirror keyed on wrong identity | FIXED (`3fc3517e`) — `IDENTIFIER_TEXT_FIELDS` default keep-as-text in `lib/data/toApiRow.ts` + `String(x ?? "")` in `matchesMediaPlanSearch` |
| DI-11 | Residual from 58ed536d (~75%): do list API consumers need Xano-only scalars `inputs_hash` / `rebill_needed` / `latest_version_id` / `temp_version_number`? | VERIFIED unused — sweep of `app/mediaplans`, list cache, and UI consumers finds no reads; safe to omit on postgres list path (finance write path still owns `inputs_hash`/`rebill_needed` on version PATCH) |

## Correctness (C-*)

| ID | Issue | Status |
|---|---|---|
| C-1 | Excel media plan Column N labelled "Gross Media" but contains **net** `mediaAmount`; no per-line Fee column in Excel | Open — decide + fix labels or values |
| C-2 | 14 of 20 channels share the `buyAmountStr` bonus-only bug: manual-qty buy types other than `bonus` lose quantity on expert→standard mapping (`docs/expert-grid-bug-sweep.md` has the per-channel matrix) | Open |
| C-3 | `OohExpertGrid` CPM function body (`q * r`) contradicts its own tooltip (`/1000`); canonical inverse CPM is `(deliverables/1000) × unitRate` | Open |
| C-4 | `SocialMediaContainer` computes deliverables inline in 2 places, bypassing the shared primitive; also `lib/billing/computeSchedule.ts:206-220` | Open |
| C-5 | Rounding split across 9 local `computeLoadedDeliverables` copies (rounded on 5 channels, raw on 4) — unifying changes displayed numbers; explicit Luke decision required | Open — decision pending |
| C-6 | Pacing Overview claims "all clients across all channels" but several summaries load search-scope only; not fully rewired after new tabs | Verify current state |
| C-7 | `generateBillingLineItems.ts:89` re-implements only 1 of 4 fee branches (no gross-up, no bonus zeroing) | FIXED (PC2) |
| C-8 | `computeDerivedCampaignFeeAmount` is a second campaign-fee total reconciled only within $10 (vs $0.01 everywhere else) | FIXED (PC2) |
| C-9 | `normaliseScheduleMediaType` defaults unknown media types to `"search"` — misspelled channel silently inherits search fee % | FIXED (PC2) |
| C-10 | Search (and other non-empty channels) could stall at hydration: loader effect discarded 200s on `cancelled` while `loadKey` blocked re-run, and `LazyMountWhenVisible` only force-mounted after global `loadPhase === "ready"` so off-screen Search never published settle → watchdog "did not finish loading" | FIXED (edit loader generation + clear loadKey on cleanup; forceMount once past section loader) |
| C-16 | `deriveReceivableRecords` falls back to a djb2 hash of client name as synthetic client ID (100000–999999) flowing into grouping/filters/exports | Open |
| C-17 | Knowledge calculators: four percent formulas missing `* 100` (100× low), CPV/LTV variable mismatch made evaluator fail silently, Calculate button was a no-op beside auto-calc | FIXED (evaluator harden + terms/KNOWN_FORMULAS; copyable auto-calc result) |
| C-11 | `checkPublishLineItemIntegrity` fails open on Xano errors (client-side `shouldBlockEmptyPublish` is the primary gate) | By design — know it |
| C-12 | `filterByMbaAndVersion` treats `media_plan_version` as both FK id and version number depending on row shape; channel GETs try up to 5 param shapes and keep the "best" result heuristically | By design (legacy rows) — fragile |
| C-13 | Payment terms hardcoded "Net 30 days" in 4 places; ad-serving `BASELINE_CTR=0.001` / `BASELINE_VTR=0.25` hardcoded; RAG bands hardcoded; forecast labels say "20%/40%" but rates come from data | Open |
| C-14 | `monthYear` vs `YYYY-MM` normalisation before `isBillingMonthLocked`; UTC vs AU-local lock cutoff; super-admin override contract — all unresolved | FIXED (PC5): keys → `YYYY-MM` via `lib/finance/periods/monthKey.ts`; lock = `finance_periods.status` / Sydney last-day 23:59; admin amend = warning → mandatory reason → before/after audit → `amended_after_lock` + immutable v2 sheet |
| C-15 | Plan-C S1-P1b: `computeCampaignFinancials` / `recomputeBillingScheduleOnSave` emitted month-header schedules with no `lineItems` (fee scalar on `perLine` only) — blocked Postgres `schedule_months` explode + enforce | FIXED (`attachScheduleLineDetail`; `PLANC_SERVER_AUTHORITY=enforce` still OFF) |
| C-18 | Admin KPI write paths can return **500** after authz clears (PS-1 live matrix: admin KPI writes ×10 expected auth-path, observed `400/500/200` — gate cleared, body/handler still throws on some methods) | FIXED (`0e34fc13` / S7) — handler defects: bad JSON/`Number(id)` NaN → opaque 500; campaign/client schemas lacked decimal ≤1 gate (C-20); null upstream → generic 500. Now named 400 (`KPI_INVALID_JSON` / `KPI_INVALID_ID` / `KPI_VALIDATION_FAILED`) and 502 `KPI_UPSTREAM_FAILED` for Xano miss. Writes still Xano-only until T4; live Xano 502s are residual, not handler 500s. Matrix: `npm run test:kpi-writes` |
| C-19 | Spurious **auto-drift billing gate** — auto/`undefined` billingMode lines flag divergent (or block save) when amount noise / rematerialisation is expected, not a true manual override | FIXED (O4) — root cause: hydrate set `isManualBilling` from ANY `compareBillingDivergence` (incl. fee/header drift vs burst `autoReference`), so `shouldResyncBillingLineFromAuto` froze legacy-auto rows; postgres pre-save no longer blocks AUTO-only drift (server recomputes + correction toast); Xano `recomputeAndValidate` 409 path unchanged; explicit `billingMode=manual` + C2 sum still block |
| C-20 | **KPI percent-unit contract** — code assumes decimal storage (AV-25 v2 / O5); leftover percentage-point cells + ambiguous exact-`1.0` rows in Xano and Postgres still need per-row migration; `db:etl` reload reintroduces Xano ambiguity until Xano is fixed | Open — code landed; migration pending Luke (`npm run scan:kpi-percent-units`) |
| C-21 | **Publish/status-change fee wipe** — postgres save could persist media-only `schedule_months` when stamped snapshot `feePct` was dropped at `buildSavePlanLineItemsFromSnapshots` (`meta?.feePct` only) and/or feeLoading omitted from a non-shared body path (krusty015 v3: $40k media, $0 fee; v2 had +$10k fee) | FIXED (`53c4029f` / O4.5) — `assemblePlansSaveRequestBody` + stamped `feePct` prefer; `[savePlan-fee-zero]` tripwire; evidence: Luke re-publish krusty015 → **v4** must carry media+fee (v3 wipe) |
| C-22 | **MBA GET dual read path** (`/api/mediaplans/mba/[mba_number]`) — X2 closeout: default `DATA_BACKEND_PLAN_DETAIL=postgres` serves `readMbaPlanDetail` only; `xano` → 410 `PLAN_DETAIL_XANO_GONE` (fan-out deleted). `nextVersionNumber` = tip+1 (O4.6). Postgres errors return 500 `PLAN_DETAIL_POSTGRES_FAILED` with no silent Xano fallback | FIXED (X2) — postgres-only GET; flag kept for explicit 410 |
| C-23 | **Xano mirror dropped schedule blobs** — `mirrorInputFromSave` omitted `legacySchedules` so mirrored versions were line-items-only (krusty015 recon); failures lived only in the in-memory shadow-diff ring buffer and vanished on restart | FIXED (`9eccdd51` / S2) — return blobs from `savePlanVersion`, pass through `mirrorInputFromSave`; durable `app_notifications` (`xano_mirror_failed`) + resolve on retry |
| C-24 | **Draft doc-step skip** — SavingModal treated below-approved MBA PDF / Media Plan file skips as errors (“Saving with Errors”) | FIXED (`231fc295` / S3) — `lib/docs/saveDocSteps.ts` marks skips; modal does not enter error state for skips alone |
| C-25 | **Dashboard monthly treemap** still hit Xano custom endpoints under `DATA_BACKEND=postgres` | FIXED (`73fd1bbe` / S1) — `getGlobalMonthly{Publisher,Client}Spend` postgres path via `schedule_months` aggregates |
| C-26 | **`schedule_months.line_item_id` vs `line_items.line_item_id` join key mismatch** — schedule cells often store `billing-{mediaType}::{lineId}` while `line_items` stores bare `{lineId}`; exact-equality joins miss all rows → Unspecified publishers + client-pays filter never applies | FN-FIX-1: dual-shape join + fixture-proven client-pays exclusion in sections (`scheduleLineJoinSql` + `scheduleLineJoinClientPays.test.ts`); `__service__*` → campaign-level bucket + `coverage.lineDetailPct`. Residual: `lib/data/dashboardMonthlySpend.ts` still exact-equality |
| C-27 | **Investment cut fee line-month coverage near zero** — published-tip `schedule_months` often media-only for legacy/ETL tips (O4.5/C-21 class); FY2025 probe: billing 2/1686 media months have fee rows (~0.1%), delivery 0/1773 | Open — cut surfaces `coverage.fee` + caveat; UI shows human `FEE_COVERAGE_USER_NOTICE` (FIN-8) with technical caveat in tooltip; margin view must join `mba_fee_snapshots` / recompute feePct×media; do not treat `fee_cents` as complete; **agency-economics presets are current-FY-only** until this is fixed (422 `AGENCY_ECONOMICS_HISTORIC_FY_BLOCKED`) |
| C-28 | **Agency economics Luke opens** — (1) whether cut `adserving_cents` counts as agency revenue (forecast maps `adservingTechFees` into `service_fee_digital`, not 1:1 with schedule adserving); (2) margin_pct RAG thresholds; (3) billingAgency grain for revenue (retainer is client-level — currently refused) | Open — defaults: adserving excluded, margin neutral, billingAgency blocked for revenue measures |
| C-29 | **Costs payables under reconciliation** — after FN7, Costs is the only payables surface; legacy hub composition (version pool / production / month-header fee+adserving / status filters) diverged from sections published tip | Amended (CP-3) — status scope signed: `approved`+`booked`+`completed` included, `draft`/`planned`/`cancelled` excluded with `coverage.excludedByStatusCents`; payables headline = media only (fee/adserving labelled separately); D1 published tip + `schedule_months` is version-pool authority; orphan non-service media in `coverage.orphanLineCents`. Banner removed when FY2026 Jul–Aug verify targets hit. Residual: orphan join cleanup + FN7 UX register still pending live smoke. **CP-8:** client-pays detail page discloses the same line-detail limit (`__service__*` cannot carry `client_pays_for_media`) so the two views stay honest complements |
| C-30 | `getHighestBookedApprovedCompletedVersionPerMba` (DashboardOverview) reaches past newer non-live statuses to find booked/approved/completed — correct for Draft, wrong for **Cancelled**. A cancelled newest version should hide older live rows (`candel002`, `cuheal001`). Harmless today only because `/api/media_plans` pre-collapses to latest-per-MBA so older live rows never arrive | Open — exclude when a newer terminal status (cancelled) exists; do not treat all non-live as ignorable |
| C-31 | **MBA edit "Maximum update depth exceeded"** — `@radix-ui/react-switch` Root composes node-into-`useState` (`setButton` / 1.3.7 `setControl`) via `useComposedRefs`; React 19 ref detach/attach during channel-enable Switch remount churn calls setState in commitMutationEffects (HAR: 0 failed requests, edit document fetched 3×). Latent upstream (radix-ui/primitives#3963); #3967 stabilized other packages but **not** Switch — 1.2.6→1.3.7 still `useComposedRefs(forwardedRef, setControl)` + BubbleInput. Reproduced path-independent (`DATA_BACKEND_PLAN_DETAIL` unset and postgres) | FIXED — native `components/ui/switch.tsx` (no Radix Root); stable ref callback, no node-in-useState; consumers all use `onCheckedChange` / RHF (no BubbleInput `name`/`form`); commit `fix(ui): stop Switch remount loop… (C-31)` |
| C-32 | **BUG-2 — create/edit max update depth via `usePlanDraftSession`** — pill effect depended on `modeResolved` (new object every render from `resolvePostgresSaveMode`) and called `setPill(null)` on the `!enabled` path (flag default off → runs for everyone). Driver = unstable `modeResolved` identity, not non-null pill init (`useState(null)`). | FIXED — `useMemo` on primitive mode inputs; disabled path `setPill(prev => prev == null ? prev : null)`; hook test in `hooks/__tests__/usePlanDraftSession.test.tsx` |
| C-33 | **PC6 class-(c) completed MBAs with line items but empty `schedule_months`** — named non-zero cohort: `golf021` (candidate INV-1135), `golf020` ($90,010), plus remaining `PGAAUS005`, `PENFOLD008` / `PENFOLD010` / `PENFOLD011` (~$100k combined). Probe script: `scripts/pc6-class-c-verdict.ts` | **Standing manual invoice-matching** (Luke 2026-08-02) — remain in the human match process; **not a launch gate**. Do not block cutover/flip on auto-match for this class |

## Finance hub UX (UX-*) — FN7 sections cutover (pending live verification)

| ID | Issue | Status |
|---|---|---|
| UX-1 | **Load-gate** — classic hub toolbar required explicit Load after filter Apply; easy to stare at stale/empty data | fixed pending live verification — classic hub deleted; sections use Apply → auto-load (`useFinanceScope` / section data hooks); not FIXED until live smoke passes |
| UX-2 | **$0 / empty landing** — hub Overview KPI hero + empty month range looked “all zeros” before Load | FIXED (FIN-1) — Overview retired; `/finance` → `/finance/invoicing` (Clients billing) |
| UX-3 | **Dead treemaps on hub Overview** — `global-monthly-*` / exact schedule join → black empty charts (related C-26 on dashboard path) | fixed pending live verification for hub surface — Overview treemaps deleted with hub; sections costs/investment use `scheduleLineJoinSql` (C-26 residual remains on `dashboardMonthlySpend.ts` only) |

## Build / tooling (B-*)

| ID | Issue | Status |
|---|---|---|
| B-1 | `npm run build` failed: Edge instrumentation traced `instrumentation.ts` → `clientsCache` → `readClients` → `db/index.ts` → `postgres` (Module not found: crypto/stream/tls/net). Latent follow-ons once that cleared: client `edit/page.tsx` imported `publishVersionIntegrity` → `readMediaPlans` (`server-only`); `lib/finance/c1FullScopeGate.ts` UTF-16 LE → ESLint "File appears to be binary"; WIP `scripts/live-*` / `_s1p1b-*` pulled into `tsc` via `**/*.ts` | FIXED — Node warmers in `instrumentation.node.ts` via `webpackIgnore`; `serverExternalPackages: ["postgres"]`; `db/index.ts` is `server-only`; client helpers in `publishVersionIntegrityClient.ts`; `c1FullScopeGate.ts` re-encoded UTF-8; WIP probes excluded from `tsconfig.json` |

## Performance / caching (P-*)

| ID | Issue | Status |
|---|---|---|
| P-1 | Pacing rows cached 4h (`unstable_cache`); ONLY invalidation trigger is orphan-assign. Plan edits/Fivetran refreshes don't bust it. Cache key includes `asOfDate` → guaranteed cold full-crawl every Melbourne midnight | Known trade-off |
| P-2 | `fetchAllMasters` + `fetchCurrentVersionRowsForMasters` = full unpaginated crawls of master + versions tables, invoked ~6× on a cold Overview. **S8 soak:** finance hub `relevantPlanVersions` still Xano-crawls masters+all versions (~4.5s for 2026-08) even when `DATA_BACKEND=postgres` — dominates hub load vs shadow | Open |
| P-3 | N+1 to Xano per MBA with up to 5 param-shape attempts per channel; cold MBA GET = 20 channels × up to 5 attempts (`maxDuration=60` is load-bearing). Mitigated when `DATA_BACKEND_PLAN_DETAIL=postgres` (one `line_items` query set; C-22 / `6f1f0323`) | FIXED (X2) — PLAN_DETAIL default postgres; Xano fan-out removed from MBA GET |
| P-4 | `getSearchCampaignsPacingData` has no date clamp / LIMIT — one long line item widens the scan for the whole portfolio | Open |
| P-5 | 4 of 7 coalesced caches have no invalidation path (mediaPlanVersions, mediaPlansList, publishers, publisherKpi); writes invisible up to TTL; all per-lambda | Known trade-off |
| P-6 | Two independent clients caches (10min vs 30s) with separate invalidation — client PUT/PATCH invalidates only one | FIXED (X1) — `invalidateAllClientsCaches()` on create/update/patch via `writeClients` |
| C-32 | **Clients split-brain** — `POST /api/clients` wrote Xano only while `DATA_BACKEND_CLIENTS=postgres` GET served PG; new client invisible to campaign create; `ensureMaster` omitted `client_id` (NULL on new masters); `clients_id_seq` lagged after ETL (`last_value` &lt; `max(id)`) | FIXED (X1) — PG-first writes + Xano mirror + seq sync + `ensureMaster.clientId` + `resolveClientIdForMaster` |
| P-7 | `getDeliveredTotalsFor{Campaign,Client}` bypass the pacing cache → client dashboard pays full Snowflake cost and can disagree with /pacing/direct mid-TTL | Open |
| P-8 | Every pacing tab refetches on mount (no SWR/react-query); stale-silently caches send `x-warning` headers most consumers ignore. **S8:** campaigns list server TTL warm ≈0ms; client remount still re-fetches `/api/mediaplans` (not measured in soak script) | Open |
| P-9 | Four in-memory rate limiters (ava autopopulate, ad copy, search copy, live mockup) are per-instance Maps — ineffective on serverless | Known |
| P-10 | exceljs imported client-side in mega-pages and finance dialogs — large bundle cost | Open |

## Dead / misleading code (D-*)

| ID | Issue |
|---|---|
| D-1 | `lib/avaSnowflake.ts` (219 lines) — zero importers; "repair or retire" |
| D-2 | `lib/cache/ttlCache.ts` — zero importers | FIXED (S8) — deleted |
| D-3 | `lib/billing.ts` (legacy) — no importers | FIXED (S8) — already absent from tree; register closed |
| D-4 | `lib/pacing/calcExpected.ts` — types only, no importers; `lib/pacing/mockMetaPacing.ts` is NOT mock — canonical home of production types |
| D-5 | `lib/delivery/programmatic/_prog_extract.txt` — 780 lines of live-looking TS checked in as .txt | FIXED (S8) — deleted |
| D-6 | `lib/auth/mbaNumberMatchesClientIdentifier.ts` — FIXED (SEC-B): wired into `checkClientMbaAccess` / `resolveClientMbaScope` (was test-only; see SEC-9) | FIXED (SEC-B) — wired into `checkClientMbaAccess` / `resolveClientMbaScope` |
| D-7 | Several channel routes import axios unused; cinema route POSTs to `cinema_line_items` while GET reads `media_plan_cinema` | PARTIAL (S8) — unused axios stripped from television/social/newspaper/influencers/integration/prog-display/prog-ooh; **cinema table mismatch left open** (verify separately) |
| D-8 | `app/management/page.tsx` is a stub (inert date-range picker removed — read-only placeholder only); `docs/design-refresh/BASELINE.md` is an unfilled template | FIXED (management route + stub removed; User Management stays at `/admin/users/new`) — BASELINE.md template still unfilled |
| D-9 | `lib/codex/**` is the Tasks domain, not AVA — naming is misleading |
| D-10 | Stale docs that contradict code: `PERF-DISCOVERY-2-CACHE-DESIGN.md` ("zero unstable_cache usages" — now false), `FINANCE-HUB-STAGES-DISCOVERY.md` (references deleted `components/finance/tabs/`), `README.md` Xano config section (references nonexistent `lib/xano/config.ts`) |

## Features / integrations (F-*)

| ID | Issue | Status |
|---|---|---|
| F-27 | Xano `codex` API group (`XANO_CODEX_BASE_URL` + `lib/api/codex.ts` proxy) backs `/api/codex/*` | FIXED (`6772069b` / C0-2) — Postgres-native Codex (`lib/codex/repo.ts`); flag `CODEX_V2=on`; Xano path deleted |
| F-28 | **FIN-6 legal name / ABN blanks** — Simmone Logue + Olive Grove `legalbusinessname` / ABN intentionally blank; bookkeeper Excel falls back to display name + toast for missing set (`62fefc03`). Internal billing buckets for those clients also stay blank | By decision (Luke) — human updates via Clients admin in due course; not an export defect |

## Open product decisions (needs Luke)

- Rounding unification across the 9 `computeLoadedDeliverables` copies (C-5)
- Excel Column N label vs value (C-1)
- The 3 genuine per-channel deliverable variants for package/package_inclusions/bonus (OOH/newspaper/BVOD return 1 or bonusDeliverables; canonical returns NaN)
- `AUDIT.md` §7's ~30 unanswered Stage 1–6 questions (fold the still-relevant ones here over time)
- **Percent-unit contract (AV-25 v2 / C-20):** code landed (`lib/kpi/percentUnits.ts`); dual-store data migration pending — classify via scan CSV; never auto-decide ambiguous `1.0` rows; fix Xano before next `db:etl` truncate-reload
