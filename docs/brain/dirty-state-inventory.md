# Dirty-state inventory (MBA create/edit)

Living inventory (P2-1). Page dirty owned by `lib/mediaplan/mediaPlanDirtyController.ts` + `useMediaPlanDirtyController` (P2-2). Clear-on-SUCCESS is a **preserved property** pinned by `lib/mediaplan/__tests__/mediaPlanDirtyController.test.ts` (P2-3). Characterisation: `hasUnsavedChanges.characterisation.test.ts`, `ExpertApplyDirtyClearOnSave.characterisation.test.tsx`. Prior diagnosis: `docs/brain/diagnostics/mba-editor-2026-07-31.md` (unsaved section). **C-38** FIXED (OOH Apply lights pending badge).

## Model (two layers)

Page navigation / Save affordance is **not** react-hook-form `formState.isDirty`. Create and edit share `useMediaPlanDirtyController` → `hasUnsavedChanges`.

Expert Mode has a second, softer flag: `expertApplyPendingPageSave` (“Applied earlier — awaiting page Save”). That badge clears only when the page dirty flag falls **true → false**, via `ExpertApplyDirtyClearOnSave` → `signalMediaPlanPageSaved` → container subscribers (`lib/mediaplan/expertApplyDirtyBridge.ts`).

| Layer | State | Sets when | Clears when |
|---|---|---|---|
| Page | `hasUnsavedChanges` (controller) | `markUnsavedChanges` / `markPassiveChannelChange` / `forceDirty` | `clearDirtyOnSaveSuccess` (save only); `clearDirtyForHydration` (load/gate) |
| Expert soft badge | `expertApplyPendingPageSave` | Expert Apply (`setTrue`) — all 14 bespoke + hook | Page-saved window event (driven by page dirty true→false) |

**Clear timing verdict (PROPERTY):** every save-path clear is `clearDirtyOnSaveSuccess` after a successful draft/version/publish step. Failed save / early return / outer catch leave dirty. There is no clear-on-attempt API.

---

## Reference counts (verified)

“~91 edit-page references” is the right ballpark for dirty-signal surface area; exact identifiers:

| Scope | Metric | Count |
|---|---|---|
| Edit | Token hits `hasUnsavedChanges` / `setHasUnsavedChanges` / `markUnsavedChanges` (combined) | **65** |
| Edit | `markUnsavedChanges()` call sites | **25** |
| Edit | `setHasUnsavedChanges(false)` / `(true)` | **6** / **3** |
| Edit | `markPassiveChannelChange()` call sites | **42** |
| Create | Token hits (same three identifiers) | **101** |
| Create | `markUnsavedChanges()` call sites | **58** |
| Create | `setHasUnsavedChanges(false)` / `(true)` | **2** / **3** |

Edit dirty **set** sites are mostly `markUnsavedChanges` / `markPassiveChannelChange`, not direct `setHasUnsavedChanges(true)`.

---

## The 15 Expert dirty sites

Fourteen `*Container.tsx` files hold local `expertApplyPendingPageSave`. The fifteenth is `useMediaChannelContainer` (shared by Prog\* + Search via `MediaChannelContainer`).

| # | Site | Mechanism | Local expert dirty | Sets pending on Apply | Clears pending |
|---|---|---|---|---|---|
| 1 | `TelevisionContainer` | Bespoke | yes | yes | `subscribeMediaPlanPageSaved` → false |
| 2 | `RadioContainer` | Bespoke | yes | yes | same |
| 3 | `NewspaperContainer` | Bespoke | yes | yes | same |
| 4 | `MagazinesContainer` | Bespoke | yes | yes | same |
| 5 | `OOHContainer` | Bespoke | yes | yes (C-38 fixed) | same |
| 6 | `CinemaContainer` | Bespoke | yes | yes | same |
| 7 | `DigitalDisplayContainer` | Bespoke | yes | yes | same |
| 8 | `DigitalAudioContainer` | Bespoke | yes | yes | same |
| 9 | `DigitalVideoContainer` | Bespoke | yes | yes | same |
| 10 | `BVODContainer` | Bespoke | yes | yes | same |
| 11 | `IntegrationContainer` | Bespoke | yes | yes | same |
| 12 | `ProductionContainer` | Bespoke | yes | yes | same |
| 13 | `SocialMediaContainer` | Bespoke | yes | yes | same |
| 14 | `InfluencersContainer` | Bespoke | yes | yes | same |
| 15 | `useMediaChannelContainer` → `MediaChannelContainer` | Shared hook + shell | hook owns state; shell renders | yes (hook) | subscribe in hook |

Thin adapters with **no** local pending state (delegate to #15): `ProgDisplayContainer`, `ProgVideoContainer`, `ProgBVODContainer`, `ProgAudioContainer`, `ProgOOHContainer`, `SearchContainer`.

Per-channel Expert **grid** dirty (modal exit confirm) is separate: baseline serialize ≠ current rows. Discard / leave-without-Apply closes the modal and does **not** touch `expertApplyPendingPageSave`. Apply writes form with `{ shouldDirty: true }` (trips page `form.watch`) **and** (except OOH) sets pending true.

---

## Page aggregation — edit

File: `app/mediaplans/mba/[mba_number]/edit/page.tsx`

**Gate:** `navigationHydratedRef` + `markUnsavedChanges` / `markPassiveChannelChange` no-op until hydrated. Gate opens after `allChannelsHydrated && clientBootstrapDone`, then `setHasUnsavedChanges(false)` immediately and again after **400ms**, then `navigationHydratedRef = true`.

**Sets dirty when (after gate):**

| Source | Path |
|---|---|
| Any RHF value change | `form.watch(() => markUnsavedChanges())` |
| Pending billing overrides present | `useEffect` → `markUnsavedChanges` |
| Channel totals change | 20× `handle*TotalChange` → `markPassiveChannelChange` |
| Channel media line items re-publish after first settle | 20× `handle*MediaLineItemsChange` → `markPassiveChannelChange` |
| Excel `LineItem[]` snapshots change | 19× `handle*ItemsChange` → `markUnsavedChanges` |
| Manual billing Apply | `markUnsavedChanges` |
| Working-draft resume applies channels | `setHasUnsavedChanges(true)` |
| AVA/tooling `handleSetLineItems` (radio/ooh) | `markUnsavedChanges` |
| Campaign date preset bar | `markUnsavedChanges` |

`markPassiveChannelChange` also respects `ignorePassiveDirtyUntilRef` (post-fee quiet window).

**Consumers of the flag:** `shouldBlockNavigation` → `useUnsavedChangesPrompt` (modal + `beforeunload`); `usePlanDraftSession({ dirty: hasUnsavedChanges })`; Save-draft button gated on dirty; primary Save **not** gated on dirty (pinned by characterisation); `<ExpertApplyDirtyClearOnSave hasUnsavedChanges={…} />`.

---

## Page aggregation — create

File: `app/mediaplans/create/page.tsx`

Same hand-rolled pattern: `markUnsavedChanges` gated by `navigationHydratedRef` (opened on mount; temporarily closed during planner prefill). Dense per-channel total/line/`ItemsChange` handlers call `markUnsavedChanges` (often behind `setIfChanged`). Manual billing Apply and draft resume use `setHasUnsavedChanges(true)`. Same Expert bridge mount. Primary Save not gated on dirty; draft save is.

---

## Dirty-clear inventory (SUCCESS vs ATTEMPT)

| Site | Mechanism | Sets dirty when | Clears dirty when | SUCCESS vs ATTEMPT | Notes |
|---|---|---|---|---|---|
| Edit `handleSaveAll` working_draft branch | `clearDirtyOnSaveSuccess` after `planDraft.saveDraftNow()` | — | After draft save succeeds | **SUCCESS** | Early return on draft failure; dirty kept |
| Edit `handleSaveAll` postgres/path success | clear then `router.push` | — | After save + KPI/approval side paths that reached success toast | **SUCCESS** | |
| Edit `handleSaveAll` legacy Xano success | clear then navigate | — | End of try, after success toast | **SUCCESS** | Outer `catch` does **not** clear (characterisation + P2-3) |
| Edit `handleSaveAll` entry / early returns | none | — | — | **ATTEMPT does not clear** | Hydration hold, clients error, duplicates, billing-overrides block, user cancels overspend confirm |
| Create `handleSaveAll` | `clearDirtyOnSaveSuccess` after version save | — | After `handleSaveMediaPlanVersion` completes (not `publish_pending`) | **SUCCESS** | `publish_pending` returns without clear |
| Create publish-retry | clear on ok | — | After `publishResponse.ok` | **SUCCESS** | `!ok` / catch: no clear |
| Edit hydration gate effect | `clearDirtyForHydration` ×2 | — | When channels + client bootstrap ready (+400ms) | **LOAD / gate** | Not a save; can true→false-fire Expert bridge if dirty was already true |
| Edit form `reset` on plan load | `clearDirtyForHydration` + gate closed | — | Data load | **LOAD** | |
| Expert Apply (14 + hook) | `setExpertApplyPendingPageSave(true)` | Apply | — | n/a (sets soft badge) | Also dirties page via `form.setValue(…, { shouldDirty: true })` + watch |
| Expert badge clear (all subscribers) | `subscribeMediaPlanPageSaved` → false | — | When page dirty true→false | **Coupled to page clear** | Includes accidental clear-if-any; not discard |
| Expert modal discard | close modal | — | Does **not** clear page dirty or pending badge | **DISCARD (modal only)** | Unapplied grid edits only |
| Unsaved dialog Leave | `confirmNavigation` | — | Does not clear flag (navigates away) | **NAVIGATION** | |
| Unsaved dialog Save | calls `handleSaveAll` | — | Only if save succeeds | **SUCCESS** (indirect) | |

---

## ExpertApplyDirtyClearOnSave + bridge

```
Expert Apply
  → form.setValue(..., { shouldDirty: true })  → form.watch → hasUnsavedChanges=true
  → setExpertApplyPendingPageSave(true)         → badge "Applied earlier — awaiting page Save"

Page Save SUCCESS (or any true→false of hasUnsavedChanges)
  → ExpertApplyDirtyClearOnSave effect
  → signalMediaPlanPageSaved()  // window Event "av-mediaplan-page-saved"
  → each container/hook subscribeMediaPlanPageSaved → setExpertApplyPendingPageSave(false)
```

`ExpertApplyDirtyClearOnSave` exists because soft-badge bookkeeping once drifted from page Save: the bridge is a single true→false edge detector so badges clear when the page actually goes clean, without each container listening to Save internals.

**Hazard (characterised):** any accidental `hasUnsavedChanges` true→false (failed-save bug, hydration re-open) also clears Expert badges. Today’s edit outer catch does not clear dirty.

---

## C-38 — OOH gap (FIXED)

`OOHContainer.handleExpertApply` sets `setExpertApplyPendingPageSave(true)` with its 13 bespoke peers + `useMediaChannelContainer`. Characterisation requires the setTrue.

---

## Out of scope (other dirty domains)

PublisherKpiForm / ClientKpiSection `dirtyIds`, TargetGrid `dirtyKeys`, finance `SectionScopeBar.isDirty()`, `DebouncedWeekQtyInput` local `dirtyRef`, billing “unsaved” provenance labels (MB-21). Not MBA page Save.

---

## Related tests & docs

- `lib/mediaplan/__tests__/hasUnsavedChanges.characterisation.test.ts` — bridge, 13+hook Apply setTrue, OOH omission, page contracts, failed-save keeps dirty
- `components/mediaplans/__tests__/ExpertApplyDirtyClearOnSave.characterisation.test.tsx` — true→false edge only
- `docs/brain/KNOWN-ISSUES.md` C-38
- `docs/brain/modules/media-plans.md` — dirty-on-load gate note
- `docs/brain/diagnostics/mba-editor-2026-07-31.md` — Q3 dirty-on-load mechanism
