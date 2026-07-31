# Module: Media Plans

The campaign builder. Creates an MBA-numbered plan (`media_plan_master`), cuts immutable version rows (`media_plan_versions`) per save, and writes per-channel line items into 20 Xano tables (`media_plan_television` … `media_plan_influencers`), each row carrying a `bursts_json` array. Generates the MBA PDF + media plan Excel and uploads them to the version row.

## Key files

- `app/mediaplans/create/page.tsx` (~8,100 lines) — new-plan builder. **Near-parallel twin of the edit page**; fixes usually apply to both. Required campaign fields + media-channel toggles use `components/ui/field.tsx` (label association, real `required`/`aria-required`, error wiring). `components/ui/switch.tsx` requires `aria-label` or `aria-labelledby` at the type level.
- `app/mediaplans/mba/[mba_number]/edit/page.tsx` (~11,800 lines) — canonical editor; `handleSaveAll` is the save protocol.
- `app/api/mediaplans/mba/[mba_number]/route.ts` — THE media plan API: GET (master + version + 20 parallel channel fetches), PUT (version cut + server billing recompute), PATCH (publish). GET/PUT/PATCH all call `checkClientMbaAccess` (SEC-3 Verified).
- `app/api/mediaplans/route.ts` — list: admin/manager see all; client users get MBA-scoped rows via `resolveClientMbaScope` (SEC-2 FIXED).
- `app/api/media_plans/<channel>/route.ts` ×13 + `[...path]` catch-all — channel table access (allowlisted via `lib/security/proxyAllowlist.ts`; catch-all also `requireRole(admin|manager)` — SEC-1 Constrained).
- `lib/mediaplan/` — the extracted logic: `containerChannelConfig` (20 configs + fieldMap mapping), `expertGridChannelConfig`, `expertChannelMappings` (8.4k lines, standard↔expert per channel), `expertModeSwitch`, `schemas.ts` (all Zod channel schemas), `lineItemIds.ts` (**`line_item_id` = `<MBA><CODE><n>` — universal join key**), `serializeBurstsJson` + `formatBurstsForPersist` (**bursts_json write contract**), `publishedVersionGuard`, `publishVersionIntegrity`, `nextMbaVersionNumber`, `reapUnpublishedStagedVersions`, `burstAmounts.ts` (**canonical fee math**), `deliverableBudget.ts` (**canonical deliverable math**).
- `components/media-containers/` — `ExpertGrid.tsx` (5.2k lines, fully shared spreadsheet grid; all 21 wrappers are ~40-line adapters) + `MediaChannelContainer.tsx` (shared shell used by only 6 channels: ProgDisplay/Video/BVOD/Audio/OOH, Search) + 14 bespoke 1.1–1.9k-line containers.
- `lib/api.ts` — client data layer (`save<Channel>LineItems` ×20, fetch caches). Channel GETs honor `DATA_BACKEND_PLANS` via `fetchChannelLineItemsForMbaGet` → `lib/data/readMediaPlans.ts` (Postgres reassembles from `line_items`).
- `lib/generateMediaPlan.ts` (2.3k lines) — Excel workbook AND the `LineItem`/`MediaItems` type hub (32 importers).
- `lib/data/readMediaPlans.ts` — plans-domain shadow/postgres readers: masters, versions (`legacy_schedules` → top-level billing/delivery blobs + `channel_flags` → `mp_*`), per-channel line-item reassembly (typed commons + attrs zod spread + `bursts`/`bursts_json`).
- `lib/data/savePlan.ts` — T4a Postgres transactional save (`savePlanVersion`): one Drizzle txn over `DATABASE_URL` (version upsert → replace-set `line_items` → server-compute `schedule_months` via `computeCampaignFinancials` + `_scheduleTransform.explodeScheduleToMonthRows` → `billing_overrides` → `source='override'` → `legacy_schedules` mirror → publish BOSS006 + freeze `approved_slice` + optional `SAVE_GATE_FULL_SCOPE` C1 gate + `mba_fee_snapshots`). Gated by `WRITE_BACKEND` (default `xano`); `POST /api/plans/save` returns 501 until flipped. **T4c:** create/edit layouts inject `WRITE_BACKEND` via `WriteBackendProvider`; when `postgres`, `handleSaveAll` / create version save call `/api/plans/save` once (modal: Save plan → Mirror to Xano → KPI sync). Xano fan-out path stays default.
- `lib/mediaplan/resolvePostgresSaveMode.ts` — maps draft/overwrite/publish onto T4a modes (draft in-place ⟺ PUT overwrite; else publish next = today's stage-then-PATCH).
- `lib/mediaplan/drafts/*` + `hooks/usePlanDraftSession.ts` + `components/mediaplan/PlanDraftChrome.tsx` — PC7 three save tiers (IndexedDB soft save, server `plan_working_drafts`, publish via unchanged `savePlanVersion`). Pill text shares `resolvePostgresSaveMode` (do not duplicate mode rules). Flag `NEXT_PUBLIC_PLAN_DRAFTS` (default off). Stale-base publish → 409 `STALE_BASE_VERSION` + compare (no merge).
- `lib/mediaplan/buildPostgresSavePayload.ts` — channel snapshots → `SavePlanLineItem[]` + `postPlansSave` client.
- `lib/data/mirrorToXano.ts` — T4b best-effort Xano write-back after Postgres commit (non-authoritative). Uses existing `save*LineItems` + `replaceChannelLineItems` (insert-before-delete while mirroring; shared `LINE_ITEM_WRITE_CONCURRENCY=4` semaphore). Failure logs + `{ mirror: "failed" }` banner; never rolls back Postgres. Admin retry: `POST /api/admin/xano-mirror/retry`.

## Save protocol (verified)

**Xano path (current default, `WRITE_BACKEND=xano`):**

1. Compute `approvalSelectionFingerprint`; approval-set change → `forceIncrement`.
2. `PUT` with `deferMasterVersionPublish: true` → server: reap staged orphans → `nextMbaVersionNumber` → `recomputeAndValidateBillingScheduleOnSave` (authoritative; 409 on $0.01 divergence) → POST new version row (or PATCH in place while `status === "draft"` && !forceIncrement).
3. ~20 conditional per-channel `save*LineItems` writes. Any failure → abort, master NOT advanced.
4. Docs generated + uploaded in parallel.
5. `PATCH` publish (advance `master.version_number`). Failure → Retry-publish button. Xano has no multi-table transactions — stage-then-publish is the closest contract; abandoned failures leave staged rows until the next save reaps them.

**Postgres path (`WRITE_BACKEND=postgres`, T4c wired):** `POST /api/plans/save` → `savePlanVersion` then best-effort `mirrorPlanToXano` — draft updates `(master_id, version_number)` in place; `new_version`/`publish` insert; line ids are client-stable (never regenerated); publish aborts if `count(line_items)=0` (BOSS006); mid-txn failure rolls back version + lines + schedules (PENFOLD016 kill-shot). Mirror failure leaves Postgres intact and returns `{ mirror: "failed" }` (retry via admin). Create/edit SavingModal steps collapse to transactional save → mirror → KPI sync. **PC7 working drafts** (`plan_working_drafts`, flag `NEXT_PUBLIC_PLAN_DRAFTS`) are orthogonal: autosave never writes a version; publish optionally sends `baseVersionId` and 409s if the tip moved.

### Full MBA GET `!skipLineItems` fan-out (waits for T6)

Create/edit load with `skipLineItems=true` and hydrate channels via `DATA_BACKEND_PLANS` / `readMediaPlans` per-channel readers. The MBA GET path that still fans out ~20 Xano channel tables when `!skipLineItems` is **left on Xano** (T2e). It is not wired through the plans read layer in T4c because: (1) no create/edit consumer needs it, (2) reassembling the exact combined response shape is a cutover concern for remaining dashboard/export callers, and (3) Snowflake `XANO_LINE_ITEMS_SNAPSHOT` + remaining Xano readers flip together in **T6**. Until then, treat that fan-out as intentionally Xano-only.

## Load

Header via `GET …?skipLineItems=true&billingScheduleFull=1&version=N`, then per-channel line items (60s soft cache + in-flight dedupe). `channelHydrationGate.computeAllChannelsHydrated` gates Save until every enabled container settles. Channel GETs are FK-first (`fetchChannelLineItemsByMba`) with a 5-attempt param-shape fallback for legacy rows.

Empty API payloads settle immediately in the loader; non-empty channels settle when the container publishes via `onMediaLineItemsChange`. `LazyMountWhenVisible` force-mounts once that channel's `mediaLoadStatus` is `ready`/`error` (not only when global `loadPhase === "ready"`), so off-screen Search/etc. still settle. Loader effect cleanup clears `lastLineItemsLoadKeyRef` but does not bump the load generation — a 200 that arrives after cleanup still applies (P1-AMEND late success); only a newer load generation discards results.

## Depends on

Shared core (xano.ts, pagination, caches, auth/RBAC, proxyAllowlist), finance/billing engine (`recomputeBillingScheduleOnSave`, `computeCampaignFinancials` — imported back INTO the mega-pages), KPI (`addKPISheet`, fan-out), money/date/tz utils.

## Consumed by (verified importers)

Billing (8 files: deriveBursts, burstDate, seedLineFees…), finance (4), KPI (5 — `MEDIA_TYPE_ID_CODES` fan-out), pacing (`parseBursts` + 5 live-line-item resolvers), dashboards (7), trafficking/creative, Snowflake sync cron (`fetchAllLineItems` → `XANO_LINE_ITEMS_SNAPSHOT`), delivery compute, AVA autopopulate, planning create-prefill.

## Gotchas (verified)

- Create vs edit mega-pages duplicate xlsx/pdf generation, publisher fetch, MBA numbering, ~20-branch save blocks. Create reads `fv.mp_client_name`; edit reads `fv.mp_clientname`.
- DRAFT SUMMARY budget remaining is shared via `lib/mediaplan/campaignBudgetRemaining.ts` against `mbaScopeTotals.nettExGst` (total investment, ex GST) on both create and edit — never media-only `grossMedia`. Caption in `PlanWizardShell`.
- Dirty-on-load: bootstrap `mbaidentifier` / client-fee apply must not open the unsaved dialog — gate waits for `clientBootstrapDone`, bootstrap `setValue` uses `{ shouldDirty: false }` + temporary gate close, channel republishes use `markPassiveChannelChange` with a short quiet window. Save hold copy names outstanding channels via `formatSaveHydrationHoldReason` (gate still blocks). Single Save lives in the floating bar; draft summary is state + Exit only.
- Half-finished container refactor: 6 shared-shell channels vs 14 bespoke; drift is silent. Zod schemas and fieldMaps ARE centralised even for bespoke ones.
- `SearchContainer.getSearchBursts` is a documented escape hatch (hardcodes `deliverables: 0`, omits `lineItemId`) — billing depends on that exact shape.
- Route naming trap: `/api/media_plans` (underscore) = channel tables; `/api/mediaplans` = master/versions.
- `LINE_ITEM_BROWSER_API_PATH` mixes dedicated route segments and raw Xano table names via the catch-all.
- `publishMediaLineItemsIfChanged` fingerprints with `_reactKey` stripped to avoid an infinite render loop — new publish paths must do the same.
- `MEDIA_TYPE_COLORS` is ARGB (`FF` prefix), not CSS hex.
- Env alias: `XANO_MEDIA_PLANS_BASE_URL` / `XANO_MEDIAPLANS_BASE_URL` (both live, inline at ~15 call sites). API group id `RaUx9FOa` hardcoded in `lib/xano/mediaPlanTables.ts`.
- 79 test files cover `lib/mediaplan/` helpers; the mega-pages and 14 bespoke containers have essentially none.
- Adding a channel touches ~12 hardcoded 20-entry maps — full list in BLAST-RADIUS.md.
