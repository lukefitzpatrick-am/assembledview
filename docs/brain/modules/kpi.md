# Module: KPI

Three-tier KPI target resolution — publisher benchmark → client override → campaign-saved — fanned out to line-item grain, persisted to Xano (`publisher_kpi`, `client_kpi`, `campaign_kpi`), and consumed by the media-plan editor's KPI modal plus every delivery/pacing adapter (target curves, status colours).

## Key files

- `lib/kpi/types.ts` — canonical shapes + zod bodies. **`ResolvedKPIRow` and `deliveryTargets.ts::KPITargetValues` are frozen public API** (41 importing files).
- `lib/kpi/resolve.ts` — the tier-merge engine (in-memory; does not fetch).
- `lib/kpi/fanOut.ts` — group → per-line expansion via `lib/mediaplan/lineItemIds` (28 refs; ships `FANOUT_LINE_ITEM_MAP_ALIASES` to bridge the app's 4 channel-key conventions).
- `lib/kpi/grouping.ts` — groups plan `LineItem`s by (publisher, platform, bidStrategy, buyType, creative).
- `lib/kpi/deliveryTargetCurve.ts` — burst-aware target curve; the contract behind every delivery chart's target line.
- `lib/kpi/lineItemKpiTargets.ts` — cpm/cpv rate targets derived from bursts at render time (not stored).
- `lib/kpi/normaliseRatioTarget.ts` + `metrics.ts` — UI percentage points ↔ stored decimals; `publisherKpiDefaults.ts` null-unset defaults.
- `lib/data/readKpi.ts` — Phase 2 read choke point (`DATA_BACKEND_KPI` / `DATA_BACKEND`); shadow diffs use money cents for `cpv` and rate epsilon `1e-6` for ctr/vtr/conversion_rate/frequency. Writes remain on Xano until T4. Route-handler wrappers (`lib/kpi/{client,campaign,publisher}Kpi.ts` GETs) statically import `readKpi` — no `webpackIgnore` swallow.
- `app/api/kpis/{campaign,campaign/sync,client,publisher}` — CRUD; campaign GET uses `checkClientMbaAccess`; client/publisher GET and all writes (`POST`/`PATCH`/`DELETE` + `campaign/sync` POST) are `requireRole(["admin"])` (SEC-6 FIXED; PS-1 live-verified — GETs match writes so create/edit via `lib/api/kpi.ts` stay reachable; `manager` removed from UserRole).
- `components/kpis/{KPIEditModal,KPISection,kpiHost}` — shared modal + the `KpiHost` contract with two deliberately different persistence semantics (media-plan host defers to campaign save; pacing host syncs immediately).

## Consumed by (41 files)

All 8 dashboard delivery channel adapters, pacing KPI status modules (`compute*KpiStatus`), delivery compute cores (search/social/programmatic), both mega-pages, publisher/client KPI editing surfaces, backfill scripts.

## Gotchas

- **Percent scale**: UI is percentage points; storage is decimal (`parsePercentHeuristic` always ÷100). Legacy stored `>=1` still treated as percentage points in format/normalise. Never apply to cpv. Migration scripts under `scripts/data/kpi-best-practice/`.
- Unset returns **null, never 0**. Publisher create/patch schemas use nullable metrics; explicit 0 is a real target.
- `publisher_colour` is hex-only (`#rgb`/`#rrggbb`); parse via `lib/publisher/publisherColour.ts` — invalid → documented fallback `null`, never a coerced plausible colour.
- **Two target maps, different keys**: `lineItemTargets` (`mba|version|line_item_id`) vs `kpiTargets` (`media_type::publisher::bid_strategy`). New channels must be added to both paths.
- `matching.ts#normMediaTypeKey` exists because media-type keys differ across the app (`digitalDisplay` vs `digiDisplay`).
- Publisher KPI `publisher` field = Xano publisher ID string, not display name.
- Ad-serving precedence chain is locked — see INVARIANTS.
- `syncCampaignKpis` replace-set pre-read is Xano-only (not postgres) so write-side stays consistent until T4.
