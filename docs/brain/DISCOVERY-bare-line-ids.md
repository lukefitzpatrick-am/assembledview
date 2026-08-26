# ON-1 — Why new plans write bare `schedule_months.line_item_id`

Read-only trace. No code change. Does not re-derive the 26 Aug corpus (every `media_plan_version` created since 15 Aug is 100% bare, including qatar003 v1 on 18 Aug and versions written 21 Aug after the HF set on main).

## Verdict (one paragraph)

New plans are bare because **decoration is a live-editor wrapper, not a persist identity**. The deterministic id (`{mba}{CODE}{n}`, e.g. `qatar003SE1`) is minted on the channel snapshot and is what `POST /api/plans/save` sends. `savePlanVersion` feeds that same string into `computeCampaignFinancials` → `attachScheduleLineDetail` (`id: line.lineItemId`) → `explodeScheduleToMonthRows` (writes `li.id` verbatim). **Nothing on the new-plan create write path applies `billing-{mediaType}::`.** The 18 Aug HF (`ensureLine` emitting the input id) is the **read** rebuild; it cannot invent decoration that was never written. qatar003 v1 is explained by this hop, not by round-tripping a corrupted blob.

`ensureLine` in `lib/finance/scheduleMonthsSource.ts` is not on this write path. It only rebuilds `BillingMonth[]` from already-persisted rows.

---

## Hop 0 — Where the id first exists (bare)

| File:line | What happens |
|---|---|
| `lib/mediaplan/lineItemIds.ts:71-79` | `buildLineItemId` mints `{mba}{CODE}{n}`. No `billing-` prefix. |
| `lib/mediaplan/lineItemIds.ts:90-110` | `buildLineItemIdentity` **keeps** an existing `line_item_id` or mints via `buildLineItemId`. Still bare. |
| create `app/mediaplans/create/page.tsx:5317+` / edit `app/mediaplans/mba/[mba_number]/edit/page.tsx:7282+` | Save snapshots run `assignStableLineItemNumbers(...)` then `stampClientFeePctOnLineItems`. The snapshot field is `line_item_id` = bare. |

For a brand-new plan this is the first existence of the id. It is never decorated here.

---

## Hop 1 — Editor hydrate: which endpoint, what shape

### Create (qatar003 v1 shape) — no hydrate

Create does not GET a billing schedule. There is no `workingBillingMonths` state on the create page. In-session billing is `campaignFinancials` from `buildEditorLineItemInputs` (Hop 2a, **decorated**). That object is **not** what Postgres explodes.

### Edit — GET then passthrough

1. Editor calls `GET /api/mediaplans/mba/{mba}?skipLineItems=true&billingScheduleFull=1&version=N`  
   (`app/mediaplans/mba/[mba_number]/edit/page.tsx:3453`).
2. Route: `app/api/mediaplans/mba/[mba_number]/route.ts:801-852` → `readMbaPlanDetailFromPostgres`.
3. Version mapper spreads the blob with **no id rewrite**: `lib/data/readMediaPlans.ts:395` (`billingSchedule: legacy.billingSchedule ?? null`).
4. Assemble copies it onto the response: `lib/mediaplan/mbaGetAssemble.ts:633-639`, `768` (`billingSchedule: filteredBillingSchedule`). Date-range filter may drop months; it does not remap `lineItems[].id`.
5. Edit hydrates working/saved from that payload **verbatim**: `edit/page.tsx:3686-3707` → `parseSavedBillingSchedulePayload` (`edit/page.tsx:1090-1118`) deep-clones months including `lineItems[].id`.

**Returned id shape = whatever `legacy_schedules.billingSchedule` last stored.** After a T4c postgres save that is **bare** (Hop 3). After a historical Xano-era blob that had editor-attached line detail it can be **decorated**. The GET does not decorate and does not strip.

Channel line items (separate GETs, `skipLineItems=true` on the header call) carry `line_item_id` from `line_items` — always the Hop 0 bare id. That is the table contract (C-26).

---

## Hop 2 — What the editor holds vs what it POST/PUTs

Two parallel identities in the same session:

### 2a. Live billing compute (decorated) — not persisted on create

| File:line | Function | Shape |
|---|---|---|
| `lib/finance/buildEditorLineItemInputs.ts:52-63` | `editorBillingStableLineItemId` | `billing-${mediaType}::${raw}` or `billing-${mediaType}::new-${index}` |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx:401-407` | `billingStableLineItemId` | same (page-local twin) |
| create `page.tsx:1964-1970` / edit `page.tsx:6398-6403` | `billingSaveInputs.lineItems` | decorated `lineItemId` + overrides |
| create `page.tsx:2026-2037` / edit `page.tsx:6466+` | `computeCampaignFinancials(billingSaveInputs.lineItems)` | `attachScheduleLineDetail` stamps `id: line.lineItemId` → **decorated** in the in-memory schedule |

This is the MBA modal / panel / PDF-preview engine. It is **not** the explode input on postgres save.

### 2b. Save body (bare) — what actually lands

| File:line | What |
|---|---|
| `lib/mediaplan/buildPostgresSavePayload.ts:59-64` | `stripBillingPrefix` — used **only** to join decorated `billingSaveInputs` overlays onto snapshot rows. |
| `lib/mediaplan/buildPostgresSavePayload.ts:114-154` | `lineItemId = String(raw.line_item_id ?? raw.lineItemId)` — **bare snapshot id**. |
| create `page.tsx:5430-5433` / edit `page.tsx:7704-7728` | `buildSavePlanLineItemsFromSnapshots(snapshots, billingSaveInputs.lineItems)` |
| `lib/mediaplan/buildPostgresSavePayload.ts:320-329` | `POST /api/plans/save` JSON body |
| `app/api/plans/save/route.ts` | Zod accepts `lineItemId: z.string().min(1)` — no decoration rewrite |
| edit `page.tsx:7790-7791` | `clientBillingSchedulePreview: workingBillingMonths` — **O4 toast only** (`savePlan.ts:944-954`). Not exploded. Create does not send it. |

Edit also hydrates `workingBillingMonths` from the GET blob (Hop 1). After a postgres save those ids are bare, while `campaignFinancials` stays decorated (BUX-1 / C-34 class). Canonical match is how the UI survives that split. Persistence still uses 2b.

Xano `PUT /api/mediaplans/mba/{mba}` (`route.ts:875+`) is the `WRITE_BACKEND=xano` path. It is not what writes Postgres `schedule_months`. Corpus since 15 Aug is the T4c path.

---

## Hop 3 — Where `billing-{mediaType}::` is applied on the write path

**Named functions that apply it:**

- `editorBillingStableLineItemId` (`lib/finance/buildEditorLineItemInputs.ts:52`)
- `billingStableLineItemId` (`edit/page.tsx:401`)
- `computeDerivedCampaignFeeAmount` helper (`lib/billing/computeDerivedCampaignFeeAmount.ts:19`) — fee-seed / derived-fee UI, not `savePlanVersion`

**On the new-plan create write path: nothing applies it.** Explicitly:

| Site | Decorates? |
|---|---|
| `buildSavePlanLineItemsFromSnapshots` | No. Copies bare. Strips only to *look up* overlays. |
| `savePlan.ts:259-261` `toLineItemInputs` | No. `lineItemId: String(l.lineItemId).trim()` |
| `savePlan.ts:773-777` `line_items` insert | No. Same string (correct: `line_items` is the bare join key). |
| `savePlan.ts:746` → `computeCampaignFinancials` | No. Same string. |
| `lib/finance/computeCampaignFinancials.ts:875-877` `toScheduleLineDetailSource` | No. `lineItemId: line.input.lineItemId` |
| `lib/finance/attachScheduleLineDetail.ts:198` | No. `id: line.lineItemId` |
| `scripts/migration/_scheduleTransform.ts:175, 191-193` | No. Verbatim `li.id` |
| `savePlan.ts:1007-1016, 1044-1053` insert `schedule_months` | No. Explode output as-is |

`toBillingOverrideLineItemId` (`lib/finance/manualBillingOverridesUi.ts:47-51`) **strips** `billing-{media}::` for matching. It never wraps.

Secondary write: `patchBillingScheduleOnPostgres` (`lib/data/writeBillingSchedule.ts:138-142`) also explodes whatever the client sent. MBA modal is state-only (MB-23); campaign save is the commit. Create never PATCHes this on first save.

---

## Hop 4 — `explodeScheduleToMonthRows`

`scripts/migration/_scheduleTransform.ts:90-323`

**Receives:** `versionId`, `basis` (`billing` \| `delivery`), `raw` = `financials.billingSchedule` / `deliverySchedule` (already `BillingMonth[]` from `attachScheduleLineDetail`).

**Writes verbatim:** for each `month.lineItems[*].id` → `ScheduleMonthInsert.lineItemId` (`:175`, `:191-193`, fee `:204-211`, adserving `:224-231`). No prefix, no `toBillingOverrideLineItemId`, no media-type wrap. Amounts go through `toCents`; ids do not.

Empty blob → empty rows. Missing `li.id` → hard fail (`line item missing id`). Synthetics `__service__adserving` / `__service__production` / `__service__fees` / `__service__media_total` are the only ids explode *invents*, and only as header fallbacks.

The Plan-C golden (`lib/finance/__tests__/attachScheduleLineDetail.test.ts:234-261`) expects decorated ids (`billing-search::BOSS001SEA001`, …) **because the fixture’s `LineItemInput.lineItemId` values are already decorated**. Explode does not create that shape; it preserves the compute input.

---

## Hop 5 — qatar003 v1 (new plan) — first existence and decoration

```
mint bare snapshot id          buildLineItemId / assignStableLineItemNumbers
        │
        ├─► live MBA compute   editorBillingStableLineItemId  → decorated (RAM only)
        │
        └─► POST /api/plans/save
                buildSavePlanLineItemsFromSnapshots            → bare
                savePlanVersion.toLineItemInputs               → bare
                line_items insert                              → bare   (intended)
                computeCampaignFinancials                      → bare
                attachScheduleLineDetail id                    → bare
                explodeScheduleToMonthRows                     → bare
                schedule_months insert                         → bare   (the symptom)
```

The id first exists at mint, **bare**. It is decorated only in the live compute that create never explodes. qatar003 v1’s 44 bare rows are this path with a non-empty line set, not a blob round-trip.

---

## Why the 18 Aug HF did not change writes

`ensureLine` (`lib/finance/scheduleMonthsSource.ts:220-237`) Map-keys on `toBillingOverrideLineItemId` (canonical/bare) and emits `id: lineItemId` (the **row’s** id). Byte-identical on origin/main and localhost, as verified. That is the inverse of explode (finance derive). If the row is bare, rebuild is bare. The HF stopped the read path from *stripping* decoration; it cannot *add* it.

---

## Why this is not “money is wrong”

Cents come from burst math (`computeCampaignFinancials` → month maps → `toCents`). The defect is **which string is stored as the schedule cell key**, not the dollar amount. Dual-shape joins (C-26 / `scheduleLineJoinSql`) already treat bare and `billing-{media}::bare` as the same line for finance sections. New T4c rows matching `line_items` on exact equality is actually *easier* for those joins; the mixed corpus (legacy decorated + post-15-Aug bare) is what readers must keep handling.

INVARIANT already in force: billing line identity is bare ↔ decorated equivalent (`docs/brain/INVARIANTS.md`). The write path does not have a corresponding “schedule_months must be decorated” law.

---

## Ranked candidate fixes (recommend only)

| Rank | Candidate | Confidence | Touches money / approved_slice? |
|---|---|---|---|
| **1** | **Treat bare `schedule_months.line_item_id` as the T4c persist contract** (same string as `line_items.line_item_id`). Keep canonical match on every reader. Do not decorate on write. Document this as the post-15-Aug law. Residual work: any reader still assuming 100% decorated (dashboard exact-equality leftover in C-26). | **90%** this is what the code actually does; **75%** it is the right product law | No. Does not change cents or slice ids. |
| 2 | Decorate in `toLineItemInputs` / `attachScheduleLineDetail` for **compute only**, keep `line_items` insert stripped (`stripBillingPrefix` at insert). Explode would then persist decorated schedule ids. Matches the Plan-C golden fixture shape. | **80%** it would write decorated `schedule_months` | **YES — STOP.** `computeApprovedSlice` (`lib/finance/approvedSlice.ts:122-123`) copies `li.id` from `financials.billingSchedule`. Next publish would freeze **decorated** `approved_slice.lines[].lineItemId` while historical slices stay bare. C1 full-scope compare, HF6 derive, MBA PDF, checksum. Needs Luke awake. |
| 3 | Decorate inside `explodeScheduleToMonthRows` from `li.mediaType` when `li.id` is bare. Blob / slice stay bare; rows become decorated. | **75%** rows would look “classic” | **YES — STOP.** Splits `legacy_schedules` vs `schedule_months` vs `approved_slice` identity. `reconcileOverrideSources` (`savePlan.ts:302-343`) exact-matches override id to row id — override `source=` stamping would miss unless explode *and* override keys are changed together. Money cells retagged. Needs Luke awake. |
| 4 | Emit decorated `lineItemId` from `buildSavePlanLineItemsFromSnapshots` (stop using snapshot `line_item_id` as the save identity). | **70%** both tables would decorate | **YES — STOP.** Breaks `line_items.line_item_id` as the warehouse/KPI/pacing join key (`BLAST-RADIUS` contract 2). Do not. |
| 5 | Backfill existing post-15-Aug rows to decorated without changing the writer. | n/a as a writer fix | **STOP** if the backfill is used as `approved_slice` input or as the billed-line set. Identity-only SQL is still a freeze-record change for any version that already published. |

**Recommendation:** Rank 1. The “fix didn’t ship” hypothesis is false; the writer never decorated. Rank 2 is the only surgical way to make *new* `schedule_months` match the Plan-C golden — and it is an approved-slice identity change, not an HF-class patch.

If Luke wants decorated schedule cells **and** bare `line_items`, that is Rank 2: a two-identity persist (table key vs schedule key) that must be designed against `computeApprovedSlice`, HF6 `deriveApprovedSliceFromScheduleRows` (keys the derived slice on the **raw** row id at `deriveApprovedSliceFromSchedule.ts:49`, canonical only for the unapproved filter), C1 gate, override reconcile, and PC3 checksum — not a one-file wrap.

---

## Could not establish (code-only)

- Did not query qatar003 v1 rows or count the 44 cells; corpus facts are taken as given.
- Did not inspect production `WRITE_BACKEND` env; T4c `POST /api/plans/save` is the only path that writes `schedule_months` for new versions, and the 15 Aug+ corpus implies that path was live.
- Did not re-walk the pre-T4c Xano PUT persist of `workingBillingMonths` (that is the likely source of **legacy decorated** schedule cells; irrelevant to qatar003 v1).
- Did not run `drizzle-kit` or any DB migration.
- Ingest accept (`savePlanVersion` after `acceptIngestProposal`) was not line-traced; if it uses the same `SavePlanLineItem.lineItemId` = snapshot id, it is the same hop. Unverified.
- Exact media-type mix on qatar003 (which `CODE`s minted) — not needed once Hop 0 is bare for every channel.

---

## STOP (per brief)

Any fix that retags `BillingLineItem.id` on the `computeCampaignFinancials` output, or retags `schedule_months.line_item_id` independently of `approved_slice.lines[].lineItemId`, **touches approved-slice derivation**. Do not implement Rank 2–4 without Luke. Rank 1 does not.
