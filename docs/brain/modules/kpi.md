# Module: KPI

Three-tier KPI target resolution — publisher benchmark → client override → campaign-saved — fanned out to line-item grain, persisted to Xano (`publisher_kpi`, `client_kpi`, `campaign_kpi`), and consumed by the media-plan editor's KPI modal plus every delivery/pacing adapter (target curves, status colours).

## Key files

- `lib/kpi/types.ts` — canonical shapes + zod bodies. **`ResolvedKPIRow` and `deliveryTargets.ts::KPITargetValues` are frozen public API** (41 importing files).
- `lib/kpi/resolve.ts` — the tier-merge engine (in-memory; does not fetch).
- `lib/kpi/fanOut.ts` — group → per-line expansion via `lib/mediaplan/lineItemIds` (28 refs; ships `FANOUT_LINE_ITEM_MAP_ALIASES` to bridge the app's 4 channel-key conventions).
- `lib/kpi/grouping.ts` — groups plan `LineItem`s by (publisher, platform, bidStrategy, buyType, creative).
- `lib/kpi/deliveryTargetCurve.ts` — burst-aware target curve; the contract behind every delivery chart's target line.
- `lib/kpi/lineItemKpiTargets.ts` — cpm/cpv rate targets derived from bursts at render time (not stored).
- `lib/kpi/percentUnits.ts` — **sole** percent-points ↔ decimal conversion (AV-25 v2); `normaliseRatioTarget.ts` + `metrics.ts` + pacing `formatKpi` / `kpiCellColor` import it. `publisherKpiDefaults.ts` null-unset defaults. Scan: `npm run scan:kpi-percent-units` (read-only both stores).
- `lib/kpi/kpiPacing.ts` — **B1-1 display-only** campaign KPI pacing rows (admin strip on campaign page). Maps CTR / conversion_rate to digital `planTotals` clicks·impressions·results; CPV / VTR / frequency → "No delivery feed". Reuses delivery `computeStatus` + `pacingStatus` ladder. Ambiguous / non-decimal percent targets → "—" + "Pending KPI data review" (never guessed). No KPI writes.
- `lib/data/readKpi.ts` — Phase 2 read choke point (`DATA_BACKEND_KPI` / `DATA_BACKEND`); shadow diffs use money cents for `cpv` and rate epsilon `1e-6` for ctr/vtr/conversion_rate/frequency. Writes remain on Xano until T4. Route-handler wrappers (`lib/kpi/{client,campaign,publisher}Kpi.ts` GETs) statically import `readKpi` — no `webpackIgnore` swallow.
- `lib/kpi/kpiWriteHandlers.ts` — admin write matrix (POST/PATCH/DELETE + campaign sync): named validation codes (`KPI_INVALID_JSON` / `KPI_INVALID_ID` / `KPI_VALIDATION_FAILED` → 400); upstream miss → `KPI_UPSTREAM_FAILED` (502). Routes are thin auth + this module. Tests: `npm run test:kpi-writes`.
- `lib/data/writeKpi.ts` — **campaign_kpi / client_kpi PG-first writes + Xano mirror** (X5 / C-18 close); `percentUnits` decimal ≤1 enforced on write (no magnitude heuristic). Publisher KPI writes remain Xano until a follow-up. Tests: `npm run test:write-kpi`.
- `app/api/kpis/{campaign,campaign/sync,client,publisher}` — CRUD; campaign GET uses `checkClientMbaAccess`; client/publisher GET and all writes (`POST`/`PATCH`/`DELETE` + `campaign/sync` POST) are `requireRole(["admin"])` (SEC-6 FIXED). Campaign/client mutate via `writeKpi`; publisher still Xano.
- `components/kpis/{KPIEditModal,KPISection,kpiHost}` — shared modal + the `KpiHost` contract with two deliberately different persistence semantics (media-plan host defers to campaign save; pacing host syncs immediately).
- `components/dashboard/ClientKpiSection` (+ `ClientKpiSlideOver`) — client hub KPI editor; rows nest in collapsible media-type groups via `lib/kpi/clientKpiMediaOrder.ts` (digital first). Display/grouping only — writes via `/api/kpis/client` → `writeKpi` (PG-first).

## Consumed by (41 files)

All 8 dashboard delivery channel adapters, pacing KPI status modules (`compute*KpiStatus`), delivery compute cores (search/social/programmatic), both mega-pages, publisher/client KPI editing surfaces, backfill scripts.

## Gotchas

- **Percent scale (AV-25 v2)**: UI is percentage points; storage is decimal. No `>=1` magnitude heuristic — `1.0` means 100%. Dual-store migration of leftover percentage-point / ambiguous `1.0` cells pending Luke (`KPI_PERCENT_UNIT_CONTRACT`). Never apply to cpv. Historical rescale artefacts under `scripts/data/kpi-best-practice/`.
- Unset returns **null, never 0**. Publisher/client/campaign create+patch schemas use nullable percent metrics with decimal ≤1 refine (C-20); explicit 0 is a real target. Client create no longer coerces empty metrics to 0.
- `publisher_colour` is hex-only (`#rgb`/`#rrggbb`); parse via `lib/publisher/publisherColour.ts` — invalid → documented fallback `null`, never a coerced plausible colour.
- **Two target maps, different keys**: `lineItemTargets` (`mba|version|line_item_id`) vs `kpiTargets` (`media_type::publisher::bid_strategy`). New channels must be added to both paths.
- `matching.ts#normMediaTypeKey` exists because media-type keys differ across the app (`digitalDisplay` vs `digiDisplay`).
- Publisher KPI `publisher` field = Xano publisher ID string, not display name.
- Ad-serving precedence chain is locked — see INVARIANTS.
- `syncCampaignKpis` replace-set pre-read is Xano-only (not postgres) so write-side stays consistent until T4.
