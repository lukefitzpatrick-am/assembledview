# Module: Media Plans

The campaign builder. Creates an MBA-numbered plan (`media_plan_master`), cuts immutable version rows (`media_plan_versions`) per save, and writes per-channel line items into 20 Xano tables (`media_plan_television` … `media_plan_influencers`), each row carrying a `bursts_json` array. Generates the MBA PDF + media plan Excel and uploads them to the version row.

## Key files

- `app/mediaplans/create/page.tsx` (~8,100 lines) — new-plan builder. **Near-parallel twin of the edit page**; fixes usually apply to both.
- `app/mediaplans/mba/[mba_number]/edit/page.tsx` (~11,800 lines) — canonical editor; `handleSaveAll` is the save protocol.
- `app/api/mediaplans/mba/[mba_number]/route.ts` — THE media plan API: GET (master + version + 20 parallel channel fetches), PUT (version cut + server billing recompute), PATCH (publish).
- `app/api/media_plans/<channel>/route.ts` ×13 + `[...path]` catch-all — channel table access (allowlisted via `lib/security/proxyAllowlist.ts`).
- `lib/mediaplan/` — the extracted logic: `containerChannelConfig` (20 configs + fieldMap mapping), `expertGridChannelConfig`, `expertChannelMappings` (8.4k lines, standard↔expert per channel), `expertModeSwitch`, `schemas.ts` (all Zod channel schemas), `lineItemIds.ts` (**`line_item_id` = `<MBA><CODE><n>` — universal join key**), `serializeBurstsJson` + `formatBurstsForPersist` (**bursts_json write contract**), `publishedVersionGuard`, `publishVersionIntegrity`, `nextMbaVersionNumber`, `reapUnpublishedStagedVersions`, `burstAmounts.ts` (**canonical fee math**), `deliverableBudget.ts` (**canonical deliverable math**).
- `components/media-containers/` — `ExpertGrid.tsx` (5.2k lines, fully shared spreadsheet grid; all 21 wrappers are ~40-line adapters) + `MediaChannelContainer.tsx` (shared shell used by only 6 channels: ProgDisplay/Video/BVOD/Audio/OOH, Search) + 14 bespoke 1.1–1.9k-line containers.
- `lib/api.ts` — client data layer (`save<Channel>LineItems` ×20, fetch caches). Channel GETs honor `DATA_BACKEND_PLANS` via `fetchChannelLineItemsForMbaGet` → `lib/data/readMediaPlans.ts` (Postgres reassembles from `line_items`).
- `lib/generateMediaPlan.ts` (2.3k lines) — Excel workbook AND the `LineItem`/`MediaItems` type hub (32 importers).
- `lib/data/readMediaPlans.ts` — plans-domain shadow/postgres readers: masters, versions (`legacy_schedules` → top-level billing/delivery blobs + `channel_flags` → `mp_*`), per-channel line-item reassembly (typed commons + attrs zod spread + `bursts`/`bursts_json`).

## Save protocol (verified)

1. Compute `approvalSelectionFingerprint`; approval-set change → `forceIncrement`.
2. `PUT` with `deferMasterVersionPublish: true` → server: reap staged orphans → `nextMbaVersionNumber` → `recomputeAndValidateBillingScheduleOnSave` (authoritative; 409 on $0.01 divergence) → POST new version row (or PATCH in place while `status === "draft"` && !forceIncrement).
3. ~20 conditional per-channel `save*LineItems` writes. Any failure → abort, master NOT advanced.
4. Docs generated + uploaded in parallel.
5. `PATCH` publish (advance `master.version_number`). Failure → Retry-publish button. Xano has no multi-table transactions — stage-then-publish is the closest contract; abandoned failures leave staged rows until the next save reaps them.

## Load

Header via `GET …?skipLineItems=true&billingScheduleFull=1&version=N`, then per-channel line items (60s soft cache + in-flight dedupe). `channelHydrationGate.computeAllChannelsHydrated` gates Save until every enabled container settles. Channel GETs are FK-first (`fetchChannelLineItemsByMba`) with a 5-attempt param-shape fallback for legacy rows.

Empty API payloads settle immediately in the loader; non-empty channels settle when the container publishes via `onMediaLineItemsChange`. `LazyMountWhenVisible` force-mounts once that channel's `mediaLoadStatus` is `ready`/`error` (not only when global `loadPhase === "ready"`), so off-screen Search/etc. still settle. Loader effect cleanup clears `lastLineItemsLoadKeyRef` but does not bump the load generation — a 200 that arrives after cleanup still applies (P1-AMEND late success); only a newer load generation discards results.

## Depends on

Shared core (xano.ts, pagination, caches, auth/RBAC, proxyAllowlist), finance/billing engine (`recomputeBillingScheduleOnSave`, `computeCampaignFinancials` — imported back INTO the mega-pages), KPI (`addKPISheet`, fan-out), money/date/tz utils.

## Consumed by (verified importers)

Billing (8 files: deriveBursts, burstDate, seedLineFees…), finance (4), KPI (5 — `MEDIA_TYPE_ID_CODES` fan-out), pacing (`parseBursts` + 5 live-line-item resolvers), dashboards (7), trafficking/creative, Snowflake sync cron (`fetchAllLineItems` → `XANO_LINE_ITEMS_SNAPSHOT`), delivery compute, AVA autopopulate, planning create-prefill.

## Gotchas (verified)

- Create vs edit mega-pages duplicate xlsx/pdf generation, publisher fetch, MBA numbering, ~20-branch save blocks. Create reads `fv.mp_client_name`; edit reads `fv.mp_clientname`.
- Half-finished container refactor: 6 shared-shell channels vs 14 bespoke; drift is silent. Zod schemas and fieldMaps ARE centralised even for bespoke ones.
- `SearchContainer.getSearchBursts` is a documented escape hatch (hardcodes `deliverables: 0`, omits `lineItemId`) — billing depends on that exact shape.
- Route naming trap: `/api/media_plans` (underscore) = channel tables; `/api/mediaplans` = master/versions.
- `LINE_ITEM_BROWSER_API_PATH` mixes dedicated route segments and raw Xano table names via the catch-all.
- `publishMediaLineItemsIfChanged` fingerprints with `_reactKey` stripped to avoid an infinite render loop — new publish paths must do the same.
- `MEDIA_TYPE_COLORS` is ARGB (`FF` prefix), not CSS hex.
- Env alias: `XANO_MEDIA_PLANS_BASE_URL` / `XANO_MEDIAPLANS_BASE_URL` (both live, inline at ~15 call sites). API group id `RaUx9FOa` hardcoded in `lib/xano/mediaPlanTables.ts`.
- 79 test files cover `lib/mediaplan/` helpers; the mega-pages and 14 bespoke containers have essentially none.
- Adding a channel touches ~12 hardcoded 20-entry maps — full list in BLAST-RADIUS.md.
