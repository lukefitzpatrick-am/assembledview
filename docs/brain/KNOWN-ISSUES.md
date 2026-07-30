# Known Issues & Tech Debt Register

One register, stable IDs. **Check here before "discovering" a bug** — it may be known. When you fix one, mark it `FIXED (commit)` — don't delete the row. Add new items with the next free ID in the right section.

## Security (SEC-*) — treat as highest priority

| ID | Issue | Status |
|---|---|---|
| SEC-1 | Two catch-all Xano proxies (`/api/media_plans/[...path]`, `/api/media-details/[...path]`) accept any authenticated session and forward with server `XANO_API_KEY`. Allowlist (`proxyAllowlist.ts`) constrains paths/methods but not tenant | Open |
| SEC-2 | `GET /api/mediaplans` returns ALL clients' plans to any admin/manager — no per-caller filter (role-gated only) | Open |
| SEC-3 | `PUT`/`PATCH` on `/api/mediaplans/mba/[mba_number]` skip the `checkClientMbaAccess` that GET enforces | Verify — a WIP-TRIAGE fix was staged; confirm it landed |
| SEC-4 | `GET /api/dashboard/[slug]` has no tenant match for client users | FIXED (SEC-A) — slug must be in caller's `getUserClientSlugs`; admin unscoped (gate landed earlier; register closed in SEC-A) |
| SEC-5 | Finance + client admin APIs are session-only in places; two routes carry literal `// allow access for development` comments (`app/api/clients/route.ts`, `app/api/mba/generate/route.ts`) | Doc-route half FIXED (PC3): `/api/mba/generate` + mediaplans generate-pdf / download / documents + scopes-of-work/generate-pdf now `requireRole(admin\|manager)`; MBA accepts `{mba_number,version_number}` only from persisted rows. Clients-route half remains Open (SEC pack). |
| SEC-6 | Most `/api/kpis/*` write methods have no authz | FIXED (SEC-A) — all writes `requireRole(["admin","manager"])` |
| SEC-7 | `/api/pacing/programmatic/{display,video}` and `/api/pacing/social/{meta,tiktok}` have **no authorization gate** — any authenticated client user can read another tenant's delivery data (compare `/api/pacing/bulk` which checks) | FIXED (SEC-A) — same `checkClientMbaAccess` + line-item prefix gate as `/api/pacing/bulk` |
| SEC-8 | Middleware enforces authentication only on `/api/*`; tenant isolation is per-handler and only ~13 routes check. `/api/cron/*` bypasses middleware entirely (protected only by `assertCronSecret`) | By design — but every new API route must add its own tenant check |
| SEC-9 | `checkClientMbaAccess` fallback uses exact equality `mbaNumber === mbaidentifier` (e.g. `PENFOLD001` vs `PENFOLD`) so it effectively always denies — client users MUST have `app_metadata.mba_numbers`. The working prefix-matcher `mbaNumberMatchesClientIdentifier.ts` exists but is imported only by its own test | Open |

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
| C-11 | `checkPublishLineItemIntegrity` fails open on Xano errors (client-side `shouldBlockEmptyPublish` is the primary gate) | By design — know it |
| C-12 | `filterByMbaAndVersion` treats `media_plan_version` as both FK id and version number depending on row shape; channel GETs try up to 5 param shapes and keep the "best" result heuristically | By design (legacy rows) — fragile |
| C-13 | Payment terms hardcoded "Net 30 days" in 4 places; ad-serving `BASELINE_CTR=0.001` / `BASELINE_VTR=0.25` hardcoded; RAG bands hardcoded; forecast labels say "20%/40%" but rates come from data | Open |
| C-14 | `monthYear` vs `YYYY-MM` normalisation before `isBillingMonthLocked`; UTC vs AU-local lock cutoff; super-admin override contract — all unresolved | FIXED (PC5): keys → `YYYY-MM` via `lib/finance/periods/monthKey.ts`; lock = `finance_periods.status` / Sydney last-day 23:59; admin amend = warning → mandatory reason → before/after audit → `amended_after_lock` + immutable v2 sheet |
| C-15 | Plan-C S1-P1b: `computeCampaignFinancials` / `recomputeBillingScheduleOnSave` emitted month-header schedules with no `lineItems` (fee scalar on `perLine` only) — blocked Postgres `schedule_months` explode + enforce | FIXED (`attachScheduleLineDetail`; `PLANC_SERVER_AUTHORITY=enforce` still OFF) |

## Performance / caching (P-*)

| ID | Issue | Status |
|---|---|---|
| P-1 | Pacing rows cached 4h (`unstable_cache`); ONLY invalidation trigger is orphan-assign. Plan edits/Fivetran refreshes don't bust it. Cache key includes `asOfDate` → guaranteed cold full-crawl every Melbourne midnight | Known trade-off |
| P-2 | `fetchAllMasters` + `fetchCurrentVersionRowsForMasters` = full unpaginated crawls of master + versions tables, invoked ~6× on a cold Overview | Open |
| P-3 | N+1 to Xano per MBA with up to 5 param-shape attempts per channel; cold MBA GET = 20 channels × up to 5 attempts (`maxDuration=60` is load-bearing) | Open |
| P-4 | `getSearchCampaignsPacingData` has no date clamp / LIMIT — one long line item widens the scan for the whole portfolio | Open |
| P-5 | 4 of 7 coalesced caches have no invalidation path (mediaPlanVersions, mediaPlansList, publishers, publisherKpi); writes invisible up to TTL; all per-lambda | Known trade-off |
| P-6 | Two independent clients caches (10min vs 30s) with separate invalidation — client PUT/PATCH invalidates only one | Open |
| P-7 | `getDeliveredTotalsFor{Campaign,Client}` bypass the pacing cache → client dashboard pays full Snowflake cost and can disagree with /pacing/direct mid-TTL | Open |
| P-8 | Every pacing tab refetches on mount (no SWR/react-query); stale-silently caches send `x-warning` headers most consumers ignore | Open |
| P-9 | Four in-memory rate limiters (ava autopopulate, ad copy, search copy, live mockup) are per-instance Maps — ineffective on serverless | Known |
| P-10 | exceljs imported client-side in mega-pages and finance dialogs — large bundle cost | Open |

## Dead / misleading code (D-*)

| ID | Issue |
|---|---|
| D-1 | `lib/avaSnowflake.ts` (219 lines) — zero importers; "repair or retire" |
| D-2 | `lib/cache/ttlCache.ts` — zero importers |
| D-3 | `lib/billing.ts` (legacy) — no importers |
| D-4 | `lib/pacing/calcExpected.ts` — types only, no importers; `lib/pacing/mockMetaPacing.ts` is NOT mock — canonical home of production types |
| D-5 | `lib/delivery/programmatic/_prog_extract.txt` — 780 lines of live-looking TS checked in as .txt |
| D-6 | `lib/auth/mbaNumberMatchesClientIdentifier.ts` — working prefix matcher imported only by its own test (see SEC-9) |
| D-7 | Several channel routes import axios unused; cinema route POSTs to `cinema_line_items` while GET reads `media_plan_cinema` |
| D-8 | `app/management/page.tsx` is a stub; `docs/design-refresh/BASELINE.md` is an unfilled template |
| D-9 | `lib/codex/**` is the Tasks domain, not AVA — naming is misleading |
| D-10 | Stale docs that contradict code: `PERF-DISCOVERY-2-CACHE-DESIGN.md` ("zero unstable_cache usages" — now false), `FINANCE-HUB-STAGES-DISCOVERY.md` (references deleted `components/finance/tabs/`), `README.md` Xano config section (references nonexistent `lib/xano/config.ts`) |

## Open product decisions (needs Luke)

- Rounding unification across the 9 `computeLoadedDeliverables` copies (C-5)
- Excel Column N label vs value (C-1)
- The 3 genuine per-channel deliverable variants for package/package_inclusions/bonus (OOH/newspaper/BVOD return 1 or bonusDeliverables; canonical returns NaN)
- `AUDIT.md` §7's ~30 unanswered Stage 1–6 questions (fold the still-relevant ones here over time)
