# Module: Pacing & Delivery

Tracks actual delivery (Snowflake facts) against plan (Xano media plans) at line-item + burst grain, for live campaigns, "as of" a Melbourne date. Three philosophies coexist: **spend pacing** (search/social/programmatic), **delivery-only verification** (ad-serving — ZERO-$ LAW), **fixed-cost** (direct — pre-computed in warehouse).

## Key files

- `lib/pacing/maths/index.ts` — pacing arithmetic + 7-state `PacingStatus` ladder (order mirrors Snowflake `V_LINE_ITEM_PACING` — DO NOT REORDER; ±5%/±15% bands) + Melbourne date helpers.
- `lib/pacing/campaigns/fetchSearchPacingCampaignRows.ts` — search composer AND the de-facto shared layer: `fetchAllMasters`, `fetchCurrentVersionRowsForMasters` are imported by every other channel. Masters/versions go through `lib/data/readPacing.ts` (`DATA_BACKEND_PACING`).
- `lib/data/readPacing.ts` — pacing-owned Xano reads: `media_plan_master`, `media_plan_versions`, `pacing_orphan_fixes`. Channel `media_plan_*` line GETs remain direct Xano until T2e. Snapshot sync cron gated by `LINE_ITEM_SNAPSHOT_SOURCE` (X7 flip earned — prod `postgres` after X-series merge; until then `parity` / MERGE Xano).
- `lib/pacing/{social,programmatic,ad-serving,direct}/fetch*Rows.ts` — per-channel composers (social/programmatic near-copies of search; direct returns grouped shape).
- `lib/pacing/campaigns/pacingRowsCache.ts` — five `unstable_cache` wrappers, 4h TTL, tag `pacing-campaigns`; the chokepoint for every read path.
- `lib/pacing/overview/buildOverviewPayload.ts` — `Promise.allSettled` fan-out over all 5 channels, 45s per-source timeout, partial-200 with `unavailableSources`.
- `lib/pacing/burst/parseBursts.ts` — bursts_json parser, key-aligned with the serializer.
- `lib/pacing/pacingAuth.ts` + `scope/resolveClientSlugs.ts` — admin unscoped; non-admin fail-closed; client catalog cold path → `clientsCache` / `readClientsList` (T2a); plan-slug join uses `slugifyPlanClientName` (DIFFERENT from `lib/clients/slug`).
- `lib/pacing/admin/{orphanDetection,assignOrphanLineItem}.ts` — orphan `SEARCH_PACING_FACT` rows; assign **UPDATEs the MART table directly** in a txn + Xano audit + `revalidateTag`.
- `lib/snowflake/pacing-fact.ts` (`queryPacingFact` — fuzzy `LOWER(CHANNEL) LIKE` matching; 50k limit with shrinking-window fallback), `search-campaigns-pacing.ts`, `pool.ts` (1.9k lines, serverless/pool modes), `syncXanoLineItems.ts` MERGE + `syncPgLineItems.ts` / `fetchAllPgLineItems.ts` (X7 tip-scoped PG) + `tipScopeLineItems.ts` / `publishedVersionPointerAudit.ts` (parity tip×tip via `published_version_id`) + cron. Snapshot warehouse readers do **not** tip-select — ingest must pre-scope.
- `lib/delivery/**` — plan × delivery join for dashboards/AVA/reports (`loadDeliverySnapshot`, `deliveredTotals` — the client dashboard's "delivered" money).
- `components/pacing-{search,social,programmatic}/LineItemPacingTable.tsx` — ~1.2k lines each, ~90% duplicated.
- `lib/pacing/status.ts` — UI vocabulary: `pacingStatus()` maps maths `PacingStatus` → six spend/KPI bands + label + colour role (`ok` / `attention` / `problem`). Tiles, Status cells, filters, and legend share this helper. Ahead ≠ success green (attention); over-pacing stays distinct from ahead; No delivery (KPI) is problem.
- `components/pacing/StatusLegend.tsx` + `PacingStatusSummary` — six-state definitions (±5% on-track band, ≥15% over-pacing) sit with the summary tiles.
- `components/pacing/pacingTableScroll.ts` — shared `PACING_TABLE_SCROLL_CLASSNAME` (`max-h-[calc(100dvh-36rem)]`) for all five channel tables.

## Snowflake tables

`MART.SEARCH_PACING_FACT` (search + orphans), `MART.PACING_FACT` (programmatic, ad-serving), `MART.SOCIAL_PACING_FACT` (Meta/TikTok), `MART.FIXED_COST_{LINE_ITEM,BURST,REPORTED_DAILY}_FACT` (direct), `MART.XANO_LINE_ITEMS_SNAPSHOT` (cron-merged plan — X7 flip earned, PG tip SoT; prod `postgres` after X-series merge). Join key: `line_item_id` lowercased+trimmed — forget the `.toLowerCase().trim()` and you get silent `no-data` rows, not errors.

## Data flow (search, representative)

Masters (full crawl via `readPacingMasters`) → live filter (status + date window + allowed slugs) → versions (full crawl via `readPacingVersions`) → per-MBA channel line items (**still Xano** until T2e; concurrency 8, 5 param-shape attempts) → parse bursts → current burst by asOfDate → campaign KPIs (`readKpi` / T2b) → Snowflake facts bucketed by line_item_id → `computePacing` on current burst → `pacingStatus()` → 5-band Status pill (on-track / ahead / behind / over-pacing / no-data) + orthogonal KPI Pending tile.

## Consumed by

AVA (`getPacingSnapshot`, `getDeliverySnapshot`), ops digest email (`buildPacingDigest` + banding), ops health checks, campaign dashboard delivery UI (adapters), client dashboard delivered totals, performance reports. Note circular-ish: `lib/snowflake/pacing-fact` imports back from `lib/pacing/social-channels`.

## Gotchas (verified)

- **Caching:** 4h TTL; only invalidation = orphan assign. Key includes `asOfDate` → cold full-crawl each Melbourne midnight. Overview deliberately passes the auth scope (not live-client scope) to hit the tabs' warm cache entries. Three parallel cache mechanisms (unstable_cache, module Map in `pacingCache.ts`, private Map in avaSnowflake) — only the first is tag-invalidatable. `getDeliveredTotalsFor*` bypass the cache entirely.
- **Fuzzy channel matching** in SQL — a warehouse channel rename yields zero rows silently. Social / programmatic / ad-serving Snowflake fact fetches **rethrow** on failure (M7 — outage must not look like "no campaigns"); route/UI boundaries map to ViewState error / HTTP 5xx.
- **Two Snowflake read stacks** with different clamps/semantics: pacing pages vs `/api/pacing/bulk` + campaign dashboard — same MBA can show different numbers.
- **Security:** the 4 per-channel POST routes (prog display/video, social meta/tiktok) use the same `checkClientMbaAccess` + line-item MBA-prefix gate as `/api/pacing/bulk` (SEC-7 FIXED).
- Direct re-implements the warehouse proc's 3-day rolling lock window in TS (`isOutsideRollingWindow`) — drift risk.
- Duplication: `lineItemStatusFromPacing` ×3 thin wrappers over `pacingStatus()`; KPI-target block ×3; `resolveLive*LineItems` ×3; page clients ×5; `count*OverviewStatus` ×5. Aggregators social vs programmatic have drifted (prog computes cpm, social doesn't; social passes 0 conversions/revenue → ROAS/CPA structurally absent).
- Sticky-column freeze patterns diverge sharply across the five channel tables (search densest; ad-serving/direct thinnest) — unify in a later commit; height maths already shared via `pacingTableScroll.ts`.
- `PERF-DISCOVERY-*` docs are stale on caching — trust `pacingRowsCache.ts`, not them.
- Genuine differences — don't unify blindly: direct's grouped shape + `includeHistorical`; ad-serving's ZERO-$ LAW; social's absent revenue.
- Direct channel tab (`DirectCampaignsClient`) maps load/filter outcomes through `ViewState` / `ViewStateBoundary` (error ≠ empty; filter-zero → Clear filters via `resetToDefaults`).
- Client filter fail-closed: when `client_ids` are selected but `clientIdToName` is empty, `applyPacingRowFilters` / `filterDirectCampaignGroups` return zero rows and channel clients show `PacingClientFilterUnavailable` (never silently widen). Client-name Set membership uses `normalizeSearchText` only (exact after normalise); free-text `search` uses `matchText` — scope semantics unchanged.
- Overview / Orphans: `PacingFilterToolbar` disables client/media/status/search (and as-of on Orphans) with an explicit reason; Overview consumes only `as_of_date`.
- **Migration cutover risk:** most pacing *facts* are Snowflake; Xano deps are masters/versions (T2d), channel lines (T2e), clients (T2a), campaign_kpi (T2b), orphan_fixes audit (T2d list / Xano POST).
