# Invariants & Locked Decisions

Laws every change must respect. Present tense, no dates, no branch names. When a decision changes, edit the line — don't append a contradiction.

## Fee math (canonical: `lib/mediaplan/burstAmounts.ts::computeBurstAmounts`)

```
budgetIncludesFees:      fee = budget × pct/100          media = budget × (100−pct)/100
clientPaysForMedia:      fee = budget/(100−pct) × pct    mediaAmount = 0, deliveryMediaAmount = budget
standard (net budget):   fee = budget × pct/(100−pct)
bonus / package_inclusions: all zeros
pct === 100 → fee = 0 (division guard)
```

- Fee is a **slice of gross**, never `net × fee%` stacked on net (the legacy anti-pattern).
- Never round fee% before applying to gross. Never sum net media and apply fee% once at channel level.
- Rounding order: full float per burst → round at burst level (AUD 2dp) → sum rounded burst fees for campaign totals.
- All fee rates are 0–100 percent points, never 0–1. Missing/null → 0 at compute boundaries.
- Client fee columns map 1:1 to channels; Influencers = `feeinfluencers ?? feecontentcreator`; integration has NO fallback; production fee is always 0.
- **`client_pays_for_media` is a media gate only** — agency fees always flow to the agency invoice. Media rollup keeps `effectiveBudget = 0`; fee proration does not.
- Fee seed idempotency is **by value** (skip when equal within $0.01), not by-defined. Agency-fee month-total drift tolerance = **$0.01** (modal save + everywhere else).
- `billingMode?: "auto" | "manual"` lives inside `billingSchedule` JSON (no Xano column). Missing = auto. Sibling-stamp rule: marking a line manual materializes undefined siblings as explicit `auto`. Manual rows are protected from resync/backfill/seeding. Extend `billingMode`; never add a parallel `manuallyEdited` flag. **`billingMode` / `feeBillingMode` / `preBill` on schedule `lineItems` are billing-basis only** — `attachScheduleLineDetail(..., "delivery")` always stamps auto and omits `preBill` even when overrides are attached (MB-12).
- **Prebill scope (MB-8):** each Prebill action chooses Media only (default — fees stay on delivery timing) or Media + fee (`billing_overrides` rows for both `component=media` and `component=fee`, reason `prepayment`). Badge word **Prepaid** only when media AND fee are prepayment; media-only → **Media prepaid** — same string on container pill, line badge, and timing editor. Session memory may skip re-prompt for the same line inside one Adjust-timing draft; do not invent a third badge synonym.
- **Manual billing status (MB-9 / MB-21 / MB-24):** vocabulary is Manual / Media prepaid / Prepaid / Fee adjusted / Client pays (`manualBillingVocabulary.ts`), with provenance axis **· not applied** | **· unsaved** | **· saved** (and **· … · differs from saved** when draft/pending contradicts the fetch-only saved table). Precedence: draft > pending > saved. Mapping: draft→`not applied`, pending→`unsaved`, saved→`saved`. `Matches MBA · unsaved` when pending exists — reconciliation is not persistence. Divergence Acknowledge banner fires only for unintended cases (`isUnintendedBillingDivergence`: line total / adserving total / stranded line) — never for deliberate reconciling month redistribution.
- Billing line identity is bare ↔ `billing-{media}::bare` equivalent — never strict `.id === lineItemId` (use `billingOverrideLineIdsMatch`) and never raw Map/Set membership on a line id (use `toBillingOverrideLineItemId` / `buildCanonicalBillingLineIdSet` / `canonicalBillingLineIdSetHas` on both sides). CI: `npm run check:billing-line-id-equality`.
- **Overlay stacking (MB-29):** root overlay z-index only via the named scale in `lib/ui/stackingLayers.ts` (`chrome` < `assistant` < `modal` < `nested` < `popover` < `tooltip` < `toast`). Any surface opened from inside another must declare a higher layer (`layer="nested"` on Dialog / AlterBillingDialog / BillingDivergenceModal) — never rely on portal DOM order among peers. AlertDialog defaults to nested; Select/Dropdown/Popover/Tooltip/Toast use their tiers. CI: `npm run check:stacking-layers`. ExpertGrid sticky floats use in-surface `z-eg-*`, not overlay values.
- **MBA billing override row precedence (MB-20 / MB-24 / MB-25 / MB-26):** `pendingBillingOverrideRows` (Applied, unsaved) > `savedBillingOverrideRows` (fetch-only table) > computed auto, minus `clearedBillingOverrideLineIds` (Reset tombstone). `savedBillingOverrideRows` is written only by successful fetch and plan-change reset — never optimistic. Load state is three-valued (`unknown` | `loaded` | `failed`) — never treat `[]` as proof of no overrides. Pending is derived only via `layerDraftMonthsOntoOverrideRows` (`buildPendingBillingOverrideRows`). Do not invent a second draft→rows path. Apply is state-only (MB-23) and **terminal** (MB-26): promotes draft → pending, tears draft down, closes the MBA modal — campaign Save commits. Cancel / X / Escape discard pending **and** the Reset tombstone (saved cache untouched). Done is removed (it discarded un-Applied draft while reading like confirmation). Header pill and Edit/Advanced amber dot share one `resolveCampaignBillingTimingProvenance`. Campaign save merges pending over saved excluding cleared — un-Applied draft never reaches the payload. Envelope `billingOverrides.{authoritative,clearedLineIds}`: REPLACE-SET runs only when `authoritative===true` (`loaded`); otherwise leave DB untouched.
- When `NEXT_PUBLIC_BILLING_BALANCER=on`, the timing UI forces exactly one balancing month per line (`lineTotal − Σ(other months)`); non-reconciling shapes are inexpressible client-side. Storage stays `billing_overrides` with `schedule_source` `computed|override` only — no `balancing` enum value. C2 server sum gates remain the law. Collision worksheet pauses postgres publish when manual lines' media totals change; decisions audit to `finance_edits`.
- **C-14 / finance periods:** month keys normalise to `YYYY-MM` at every boundary (`lib/finance/periods/monthKey.ts`). Billing-month lock cutoff is Australia/Sydney wall-clock via `finance_periods.status` (`locked|invoiced|reconciled`), not UTC+60d. Flag `FINANCE_PERIODS=off|shadow|on` (default **off**). Locked month: non-admin read-only + variance queues into the next open period; admin override = mandatory reason → before/after `finance_edits` → `amended_after_lock` → new labelled v2 Blob sheet (original archive never modified). Retainer amount = `clients.monthlyretainer` ($0 stops); optional `retainer_end_month`; changes apply from the next open period.
- Server-generated schedules must carry `month.lineItems` with stable `id`, `monthlyAmounts`, and `feeMonthlyAmounts` that sum to month headers (±$0.01). Fee months reuse `prorateBurstFeesToMonths` / burst `feeAmount` proration — do not invent a second fee-spread. `PLANC_SERVER_AUTHORITY=enforce` stays OFF until explicitly flipped.
- **`mba_fee_snapshots` write rule (`savePlanVersion`):** gated by save **`mode === "publish"` only** — **independent of `campaign_status`**. The publish block still runs BOSS006 / `approved_slice` / checksum / snapshot insert when mode is publish; `resolvePersistedCampaignStatus` writes whatever mapped status the request carries (including `draft`) and does **not** gate the snapshot. Live verified: krusty012 v3 has `campaign_status=draft` **and** an `mba_fee_snapshots` row (publish-mode save carrying draft status). `mode=draft` and `mode=new_version` never insert/update fee snapshots — even though T4c `assemblePlansSaveRequestBody` always sends `feeLoading`/`feeSnapshot` on the request. Default conflict behaviour (`FEE_SNAPSHOT_WRITE_ONCE` unset/`off`) is upsert (`onConflictDoUpdate`). When `FEE_SNAPSHOT_WRITE_ONCE=on`, publish uses `onConflictDoNothing` (write-once per version); overwrite only via `POST /api/admin/fee-snapshots/resnapshot` (reason required, audited to `finance_edits`). Do not flip `FEE_SNAPSHOT_WRITE_ONCE` until this mode-gated rule is intentional product law.
- `schedule_component` includes **`adserving`** — per-line/month adserving explodes into `schedule_months` (I-1 full scope queryable). Production stays `media` on production line_items.
- On publish, `media_plan_versions.approved_slice` is frozen once (`{ totalCents, lines[] }`); never mutate after write. Widened C1 gate (`SAVE_GATE_FULL_SCOPE=off|log|enforce`, default **off**) compares billing `schedule_months` full scope to `approved_slice.totalCents` ± 1¢. Fee-component `billing_overrides` attached at first publish flow into slice `feeCents` via override-aware financials. `mba_fee_snapshots.fees` is fee-rate JSON, not override dollars.
- **A published version's `billing_overrides` and billing-basis `schedule_months` are immutable** (MB-15c). `replaceBillingOverrideLine` / `resetBillingOverrideLine` refuse when `isApprovedOrBeyond(campaign_status)` (`lib/docs/isApprovedOrBeyond.ts`) with `VERSION_PUBLISHED_IMMUTABLE`. Draft/planned stay mutable in place. Retiming a live MBA = publish a new version (Revisions / VC-3 will own draft-side overrides later).
- **Document download/generate is not the billing-immutability question.** `isDownloadableCampaignStatus` (`lib/docs/isApprovedOrBeyond.ts`) is true for every non-empty status except `draft` (planned included). Empty / unknown refuses. `isApprovedOrBeyond` stays billing-only. MBA generate, generate-pdf, version download, `buildMbaFromPersisted`, and `shouldSkipDocsForCampaignStatus` use the download predicate. Edit/create POST live `campaign_status` from the form dropdown with `/api/mba/generate`; the edit download cluster is `canDownloadDocuments` (watched status first). Do not merge the two.
- Unknown schedule media types do **not** inherit search fee % — `normaliseScheduleMediaType` returns null; fee resolution logs a builder-issue warning and uses 0%.
- Postgres plan save (`lib/data/savePlan.ts`) is one transaction: resolve versionId → replace-set `line_items` → (publish/`new_version`: copy tip−1 `billing_overrides` for living line ids) → **MB-22 payload REPLACE-SET gated by MB-25** (`billingOverrides.authoritative===true` only; else skip and leave rows untouched; `clearedLineIds` force-delete Reset lines) → load overrides → `attachOverridesToLineInputs` → `computeCampaignFinancials` → explode `schedule_months` → `reconcileOverrideSources` → `legacy_schedules` mirror (+ publish `mba_fee_snapshots` + `approved_slice`). Billing financials/blob are computed **with** overrides attached so blob months and `schedule_months` agree by construction; delivery stays burst-prorated (override-free). `reconcileOverrideSources` remains the `source='override'` stamp. Publish carry drops overrides whose line was deleted and returns them as `droppedBillingOverrides` (never silent); C2 sum gate blocks media **and** fee months that no longer match AUTO burst-derived totals ±$0.01 (PC4 worksheet is client-only). `line_item_id` is always client-supplied; publish with zero lines aborts inside the txn (BOSS006). `WRITE_BACKEND` default remains `xano` (local overnight may flip to `postgres`). Editor `masterId` is `media_plan_master_id`, never the combined-payload version `id`; `/api/plans/save` returns 422 `MASTER_ID_MISMATCH` when they disagree (no silent mba remap). Save snapshots use `assignStableLineItemNumbers` — never positional re-derive.
- **`resolvePostgresSaveMode` is the only draft/publish/versionNumber rule** (edit footer + PC7 pill share it — never duplicate). Modes:

  | Intent | `mode` | `versionNumber` | UI |
  |---|---|---|---|
  | Stay Draft, tip exists, `!forceIncrement` | `draft` (overwrite in place) | published tip | overwrite |
  | Leave Draft / non-draft / `forceIncrement` | `publish` (increment) | `nextMbaVersionNumber` | increment |
  | Tip present + lazy-empty `versionRowCount=0` | still **increment** on leave-draft | treats tip as proof of rows | never "Will create v1" |

  `new_version` (stage-without-publish) is unused by the editor.
- **Campaign status vocabulary** (persisted lowercase via `mapCampaignStatusForPersist`): `draft` \| `planned` \| `approved` \| `booked` \| `completed` \| `cancelled`. Title-case UI labels map to the same set. Empty / unknown → `null`.
- **`MISSING_CAMPAIGN_STATUS`:** publish refuses to invent status — `resolvePersistedCampaignStatus` throws when mapped status is null and mode ≠ draft. Never silent `"Approved"`. Draft mode may default stored status to `draft`.
- **Postgres 23505 → app codes** (`classifySaveUniqueViolation`): `line_items_version_id_line_item_id_key` → `DUPLICATE_LINE_ITEM_ID`; versions `UNIQUE(master_id, version_number)` → `VERSION_ALREADY_EXISTS`; other unique → `UNIQUE_VIOLATION`. Do not collapse version collisions into line-id dupe messaging.
- **T4c fee inputs:** create/edit postgres bodies always assemble via `assemblePlansSaveRequestBody` — `feeLoading` / `feeSnapshot` / `adservaudio` / `adservvideo` / `adservdisplay` / `adservimp` are never wired per draft-vs-publish branch. `buildSavePlanLineItemsFromSnapshots` prefers stamped snapshot `feePct`. `savePlanVersion` logs `[savePlan-fee-zero]` (does not block) when a line resolves non-zero feePct but computed fee total is $0; logs `[savePlan-adserving-zero]` when ad-serving-eligible lines have deliverables but ad-serving total is $0. Server save builds `getRateForMediaType` via `createAdServingRateResolver` (`lib/billing/adServingRateResolver.ts`) — never the `?? (() => 0)` trap.
- After Postgres plan commit, Xano is a non-authoritative mirror (`lib/data/mirrorToXano.ts`): every mirrored version carries the same `legacy_schedules` billing/delivery blobs Postgres stored; failures log to the shadow-diff ring buffer **and** `app_notifications` (`xano_mirror_failed`), surface `{ mirror: "failed" }`, and never roll back or throw into the save caller; repair via `POST /api/admin/xano-mirror/retry` (success marks the notification resolved). Create/edit treat `mirror === "failed"` as a **skipped** save-status row plus a non-destructive toast — not `error`, so SavingModal does not title “Saving with Errors”.
- **O4.6 Postgres version numbers:** `savePlanVersion` resolves `publish`/`new_version` as `max(version_number)+1` inside the txn (client number ignored); draft-overwrite keeps the loaded version. Publish mirrors `PATCH` Xano `media_plan_master` `{ version_number, campaign_status }` to restore the watermark; draft/`new_version` mirrors do not.
- Partial MBA: screen panel and Excel export must both read the same `partialMBAValues`; export must never fall through to `calculateAssembledFee()` while partial approval is active.
- **`mba_number` is always a string** on API rows — byte-identical to Xano/Postgres text (leading zeros preserved: `"001001"` ≠ `1001`). Postgres read shaping must not numerically coerce identifier text fields (`IDENTIFIER_TEXT_FIELDS` in `lib/data/toApiRow.ts`).

## Deliverable math (canonical: `lib/mediaplan/deliverableBudget.ts`)

- `bonus` / `package_inclusions` return **`NaN` as a "no recompute" sentinel** — callers preserve the existing value. Never treat that NaN as 0.
- CPM inverse = `(deliverables/1000) × unitRate`; forward = `(netBudget/unitRate) × 1000`.
- `fixed_cost` → 1 deliverable, everywhere.
- 18 runtime buy types: package, spots, cpt, cpp, panels, insertions, cpm, cpc, screens, cpcv, cpi, cps, cpv, fixed_cost, weekly_rate, monthly_rate, package_inclusions, bonus.
- `ProductionContainer` is structurally outside every shared container model — exclude it from "apply to all containers" changes.

## bursts_json contract (`lib/mediaplan/serializeBurstsJson.ts`)

- Money fields are **formatted strings** (`mediaAmount`, `feeAmount`).
- `mediaAmount` = *planned* media, sourced from `deliveryMediaAmount` → non-zero for client-pays lines.
- `lib/pacing/burst/parseBursts.ts` key names are contractually aligned with the serializer — change both or neither.
- Expert grids' `sumFee` reads `expertRowFeeSplit` output, NOT `bursts_json[].fee` — orthogonal paths that look identical.
- Burst money as `z.number()` vs string: `baseBurstShape` in `lib/mediaplan/schemas.ts` is extended by every channel schema — a type change there fans out to all of them.

## Campaign budget remaining (create + edit wizard)

- Campaign budget means **total investment including fees** = `mbaScopeTotals.nettExGst` = grossMedia + fee + adServing + production, ex GST.
- `mbaScopeTotals.grossMedia` excludes production lines (`scheduleMediaType` / perLine `mediaType`); production is only the `production` component — never both, or nettExGst double-counts it.
- DRAFT SUMMARY “Budget remaining” = `campaignBudget − nettExGst` on **both** create and edit (`lib/mediaplan/campaignBudgetRemaining.ts`). Never subtract media-only (`grossMedia`).
- Overspend is strict `< 0` on the cent-rounded remaining — no dollar-band tolerance to hide true fee/rounding composition.

## Versioning & plan identity

- Published version = `media_plan_master.version_number` (the watermark). There is no `latest_version_id`. Never use `max(versions)` to find "live".
- Draft saves overwrite the version row in place; leaving draft or changing the approval set increments (stage-then-publish: `deferMasterVersionPublish` → write children → PATCH master). Cannot return to Draft.
- Staged-but-unpublished rows are invisible (`filterPublishedVersions`) and reaped on next save of the same master.
- Clients see the last published version; doc downloads and pacing keep serving the **published tip** while a `plan_working_drafts` row exists (PC7; labelled in the editor). Working drafts never advance `master.version_number` or touch finance/pacing consumers.
- MBA / media-plan doc APIs render from persisted `schedule_months` + `approved_slice` + fee snapshot only (`{mba_number, version_number}`); require admin; 422 unless campaign_status is approved/booked/completed. Footer `v{n} · {hash8}` from `snapshot_checksum` (sha256; written on publish).
- Version filtering accepts 6 column spellings as equivalent (`media_plan_version`, `media_plan_version_number`, `version_number`, `versionNumber`, `mp_plannumber`, `mp_plan_number`) — do not add a 7th.
- `media_plan_production` has no version FK — its MBA-only fallback must stay until Xano gains one (KI D4-K1).
- Forecast snapshots are immutable (INSERT only). Natural comparison key: `client_id + media_plan_version_id + group_key + line_key + month_key`. Forecast month amount priority: billingSchedule → deliverySchedule → bursts.

## Naming / trafficking law

- `lib/naming/templates.ts` is THE law for element orders — not any doc. DV360 templates cover all programmatic channels; CM360 covers other digital.
- `line_item_id` is ALWAYS the last element at each platform's pacing-grain level. `_` inside values, `-` as separator, charset `[a-z0-9_+x]`.
- Search suffix rule: the AV line-item code is the segment after the LAST hyphen in the ad/asset group name; codes are alphanumeric (no internal hyphens). Renaming in Google Ads breaks spend rollup.
- Trafficking builder is deliberately **non-persistent** (a download generator). Don't add a save; future pushes recompose from plan + templates.
- Xano JSON is snake_case; FKs are `clients_id`, `users_id`, `media_plan_id`. `mp_client_name` is the DB column, `client_name` the Xano input alias; create-page form uses `mp_client_name`, edit-page form uses `mp_clientname`.
- Publisher KPI `publisher` field stores the Xano publisher ID string, not the display name.

## Pacing law

- **ZERO-$ LAW (ad-serving / CM360):** delivery counts only. Never run `computePacing`/`computeStatus`, never surface spend/budget/variance, never treat spend=0 as `no_delivery`, exclude from $ rollups. Status vocabulary is only `serving | no-data`.
- The `PacingStatus` ladder order mirrors Snowflake `V_LINE_ITEM_PACING` — do not reorder. Bands: ±5% on track, ±15%.
- Direct pacing: `REPORTED_SPEND` (finance-smoothed) and `ACTUAL_PLATFORM_SPEND` are different ledgers — never mix into one KPI. Direct's status vocab doesn't map 1:1 to ahead/behind pills.
- "As of" is a single Melbourne date (`asOfDate`), not a range.
- `pacing_mappings` writes must write through to `MART_PACING.DIM_PLAN_MAPPING` then refresh facts — refresh order: `FACT_DELIVERY_DAILY` before `FACT_LINE_ITEM_PACING_DAILY`. Snowflake deletes are soft (`IS_ACTIVE = FALSE`).
- Snowflake dynamic tables can't ALTER the query body — adding a platform is `CREATE OR REPLACE`; new stage views must match `V_GOOGLE_ADS_AD_GROUP_DAILY` column list/order/types exactly.
- `MART.XANO_LINE_ITEMS_SNAPSHOT` ingest source is gated by `LINE_ITEM_SNAPSHOT_SOURCE` (`xano` \| `parity` \| `postgres`). X7 flip **earned** (PG tip = source of truth; Xano crawl under-counts) — prod `postgres` only after the X-series merge ships the sync code; until then **`parity`** (still MERGEs Xano). See `docs/superpowers/x7-line-item-snapshot-pg-stop-2026-08-02.md`.
- Snapshot warehouse readers do not tip-select from `XANO_LINE_ITEMS_SNAPSHOT` — ingest/parity must pre-scope to `published_version_id` tip rows.

## KPI law

- Three tiers: publisher benchmark → client override → campaign-saved. Fan-out to line grain via `lib/kpi/fanOut.ts`.
- Percent scale (AV-25 v2): UI enters/displays percentage points for ctr/vtr/conversion_rate/viewability; **storage is decimal everywhere** (`0.45` → `0.0045`, `100` → `1`). Conversion lives only in `lib/kpi/percentUnits.ts` — NEVER infer unit from magnitude (`value >= 1 ? /100` is banned; it is not invertible and breaks 100% targets). CPV is dollars — never pass through percent helpers. Dual-store data migration of legacy percentage-point / ambiguous `1.0` rows is **pending Luke** (`KPI_PERCENT_UNIT_CONTRACT.dataMigration`); `db:etl` truncate-reload will reintroduce ambiguity until Xano is fixed too.
- Register: **percent-unit contract** — code landed (O5 / AV-25 v2); migration pending Luke (C-20; `npm run scan:kpi-percent-units`).
- Unset metric returns **null, never 0** — `?? 0` converts "no target" into "target 0%". Publisher KPI rows default metrics to null; publisher tier ignores null and honours explicit 0.
- Ad-serving precedence (locked): manual `adServingRatePct > 0` → resolved KPI ctr/vtr → hardcoded baseline. `adServingRatePct` stays manual-only; KPI values pass separately into compute. Identity is per-line `lineItemId`.
- The two KPI target maps have different keys (see BLAST-RADIUS) — both must be updated for a new channel.
- `KpiHost` implementations differ on purpose: media-plan host defers persistence to campaign save; pacing host writes to Xano immediately.

## Planning engine law

- Compose on weighted counts (`wc`), never percentages; `reach% = Σ(channel wc) ÷ Σ(audience wc)`. Segments are single-select non-additive lenses.
- Suppressed cells stored null, excluded, badged. Search + Retail Media are benchmark-sourced and always badged non-RM.
- Roy Morgan waves are append-only by `wave_id`. Loader anchors by labels not indices; unknown channel labels are reported, never guessed.
- Provenance: `PLANNING_CHANNEL_BENCH` carries per-pillar `{value, source}`; carry-through maps to channel-level budget targets only — never fabricate line items.
- Client visibility per audience defaults OFF.

## AVA law

- `/api/chat-v2` only; admin-only (401 unauth / 403 non-admin); `AVA_ENGINE=off` kill switch; missing `ANTHROPIC_API_KEY` → 503.
- Form changes via the `apply_form_patch` tool only — no JSON-in-prose contract.
- Tools enforce scope internally from session roles/slugs/MBAs.
- `attachments` and `questions` are display-only — never write them back into Anthropic message history.
- MI runtime never writes `lib/specs/mi-library/` (vendored) — runtime output is Blob + email only.
- AVA Postgres reads use `AVA_DATABASE_URL` / role `ava_readonly` only — never the owner/`DATABASE_URL` connection.
- AVA tool `fy` = Australian FY **ending** year (`lib/ava/tools/fyToRange.ts`); finance sections `fyMonthRange` stays start-year. Do not conflate.

## UI / design system

- Application roles are `admin` | `client` only (`lib/rbac.ts`). Unknown or removed role strings (including legacy `manager`) normalise to no roles — least privilege, never admin.
- List surfaces map fetch + filter outcomes through `lib/ui/viewState.ts` (`ViewState` / `resolveListViewState` / `viewStateFromReadResult`) and render via `ViewStateBoundary` — loading, error, empty, and filtered-empty are mutually exclusive; never render an empty-state message for a failed load or a "nothing here" copy when filters excluded everything.
- `lib/data` Postgres (and live) reads must not catch-and-return `[]` on failure — typed `ReadResult` / throw, then ViewState error at the boundary. Cache freshness (`x-cache-fetched-at` / stale warning) is optional `ViewState.ready.freshness` (derived). Xano `fetchAllXanoPages*` soft paths are dying-at-T6 — see `docs/brain/READ-FAILURE-REGISTER.md`.

- `Panel`/`PanelRow`/`PanelRowCell` mandatory for new dashboard work; `Card` only for chart wrappers and non-dashboard composables. `bg-dashboard-surface` only for the dashboard backdrop.
- No new hard-coded hex in `app/**` route components (chart palette constants and tenant brand colours excepted). No chart hard-codes a hex — use `lib/chart-theme.ts` / `lib/charts/registry.ts`.
- Interactive charts: tooltip + legend + keyboard alternative; non-interactive: `cursor="default"`. Touch targets ≥24×24 CSS px, ≥44×44 for primary actions.
- (Full normative doc: `docs/design-refresh/SYSTEM_RULES.md`.)

## Workflow

- `localhost` = working trunk; `main` = cherry-pick-only deploy target; no other branches; no direct commits to main; no force-push; no history rewrites on pushed commits. Conventional Commits. Smoke before cherry-picking feat/fix/refactor. If practice diverges from `BRANCHING.md`, fix the doc in the same commit.
- Tests run via `tsx --test` (node:test) + vitest config exists; check `package.json` scripts before assuming a runner. TS7/tsgo trialled and NOT adopted (baseline typescript@5.9.x).
- Xano-side changes that can't live in code (function-stack scripts) are documented in `XANO_SCRIPT_REFERENCE.md` — keep it current when touching Xano function stacks. Xano `input{}` blocks must declare fields explicitly; a `dblink` input block breaks JSON body parsing.
- `DATA_BACKEND` defaults to `xano`. Per-domain `DATA_BACKEND_<DOMAIN>` overrides when set. `shadow` serves Xano and must not alter user-visible payloads; `postgres` serves Supabase for wired domains only (reference → publishers/clients → kpi → …). KPI reads go through `lib/data/readKpi.ts`; campaign/client KPI writes are PG-first + Xano mirror (`writeKpi`, X5). New domains opt in one PR at a time.
- **Clients writes are postgres-authoritative** (`lib/data/writeClients.ts`): `POST/PUT/PATCH /api/clients` insert/update PG first (identity id from sequence — no per-insert `setval`), invalidate both clients caches (`clientsCache` + `xanoReferenceCache`), then best-effort mirror to Xano with the same `id`. Mirror failure → `app_notifications` (`kind=xano_client_mirror_failed`), never rolls back PG. `media_plan_masters.client_id` is resolved from PG clients at create (`resolveClientIdForMaster`). `syncClientsIdSequence` is no-rewind (`GREATEST(MAX(id), last_value)`) for post-ETL only.
- **`media_plan_masters` identity is postgres-authoritative (X9 / X9.1):** `POST /api/mediaplans` inserts via `createMediaPlanMasterPostgresFirst` (sequence-owned id → PG insert → best-effort Xano POST with the same explicit `id`). MBA uniqueness pre-check is Postgres. Mirror failure → `app_notifications` (`kind=xano_master_mirror_failed`), never rolls back PG. `/api/plans/save` `ensureMaster` is a logged safety net only — not the create path. Never `setval(seq, MAX(id))` alone — that rewinds; use `GREATEST(MAX(id), last_value)` and only after ETL/migration.
- `DATA_BACKEND_PLAN_DETAIL` defaults to `postgres` and must not fall back to global `DATA_BACKEND`. Postgres is the only implemented MBA GET branch (`readMbaPlanDetail`); errors return 500 with code `PLAN_DETAIL_POSTGRES_FAILED`. Setting `xano` returns 410 `PLAN_DETAIL_XANO_GONE` — never reintroduce the channel fan-out.
- User-facing free-text search/filter uses `lib/search/matchText.ts` (or a thin wrapper). Access-scoped filters keep exact membership semantics; only string normalisation may be shared.
- `mba_line_approvals` is **postgres-authoritative** once writes follow `WRITE_BACKEND=postgres` (no Xano mirror). `db:etl` must not truncate-reload it; recon count mismatch is informational, never a hard fail.
- Finance Forecast **targets** (`revenue_forecast_lines`) and **snapshots** (`finance_forecast_snapshots` + `_lines`, migration `0016`) are postgres-authoritative; `XANO_FINANCE_FORECAST_SNAPSHOTS_*` is author-only for data-move. Booked forecast plan crawl (`fetchFinanceForecastRawFromXano`) remains Xano-shaped until T6 rewire.
- **Finance product IA is sections** (FIN-1): sidebar group **Finance** = Clients billing (`/finance/invoicing` + Periods/Xero tabs) · Publishers (`/finance/costs/*`) · Forecasting · Investment. Overview `/finance` home retired — redirects to invoicing. Classic hub deleted (FN7). Legacy `?tab=` and path aliases permanently redirect (FN1 map; `overview` → invoicing). `/api/finance/sections/*` is admin-only fail-closed in middleware.
- Xero → Postgres sync (`/api/cron/xero-sync`) is additive/parity-only until T6: it must not disable Xano `daily_xero_sync`, must upsert only `xero:*` `invoice_key` rows, and must not migrate legacy Xano-hosted PDF blobs (re-fetch from Xero into Vercel Blob).
- **PC6 Xero↔run-item match:** extend T5 `xero-sync` with `match_run_items` (never fork). Tier-1 reference + ≤$0.01 auto-matches silently; write-off is **admin-only** with mandatory reason. Manual reassign permanently upserts `xero_contact_links`. Day-10 open-card escalation is **one notification per periodMonth** (never re-notify daily). Dispute pre-creates an expected credit-note card; matching negative AR / ACCRECCREDIT (same contact, ≤$0.01) auto-reconciles the dispute.
