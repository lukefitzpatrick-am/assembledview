/**
 * CHARACTERISATION — CURRENT dirty-signal behaviour (Luke 4 Aug safety net).
 *
 * Do NOT "fix" assertions here to match a desired future. The follow-up commit
 * that gates Save on `hasUnsavedChanges` must keep these green (or deliberately
 * update them with an explicit rationale).
 *
 * Mechanisms covered:
 *   A) Page-level `hasUnsavedChanges` (edit + create) — set/clear contracts via source
 *   B) Expert Apply soft badge `expertApplyPendingPageSave` + `expertApplyDirtyBridge`
 *   C) `ExpertApplyDirtyClearOnSave` source contract (runtime edges in vitest sibling)
 *
 * Out of scope here (separate dirty domains, not MBA Save):
 *   PublisherKpiForm / ClientKpiSection dirtyIds, TargetGrid dirtyKeys,
 *   finance SectionScopeBar isDirty(), DebouncedWeekQtyInput local dirtyRef,
 *   billing "unsaved" provenance vocabulary (MB-21 panel labels).
 */
import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  signalMediaPlanPageSaved,
  subscribeMediaPlanPageSaved,
} from "@/lib/mediaplan/expertApplyDirtyBridge"

const root = process.cwd()

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8")
}

/** Bridge no-ops when `window` is undefined — install a minimal EventTarget. */
function withDomWindow(fn: () => void) {
  const g = globalThis as { window?: EventTarget }
  const prev = g.window
  g.window = new EventTarget()
  try {
    fn()
  } finally {
    if (prev === undefined) delete g.window
    else g.window = prev
  }
}

// ─── Mechanism B: bridge ────────────────────────────────────────────────────

test("CHARACTERISATION bridge: subscribe receives signalMediaPlanPageSaved", () => {
  withDomWindow(() => {
    let hits = 0
    const unsub = subscribeMediaPlanPageSaved(() => {
      hits += 1
    })
    signalMediaPlanPageSaved()
    assert.equal(hits, 1)
    unsub()
    signalMediaPlanPageSaved()
    assert.equal(hits, 1, "unsubscribe must stop delivery")
  })
})

test("CHARACTERISATION bridge: multiple subscribers all fire once", () => {
  withDomWindow(() => {
    const counts = [0, 0]
    const u1 = subscribeMediaPlanPageSaved(() => {
      counts[0]! += 1
    })
    const u2 = subscribeMediaPlanPageSaved(() => {
      counts[1]! += 1
    })
    signalMediaPlanPageSaved()
    assert.deepEqual(counts, [1, 1])
    u1()
    u2()
  })
})

test("CHARACTERISATION bridge: no-op when window is undefined (SSR / Node)", () => {
  const g = globalThis as { window?: EventTarget }
  const prev = g.window
  delete g.window
  try {
    let hits = 0
    const unsub = subscribeMediaPlanPageSaved(() => {
      hits += 1
    })
    signalMediaPlanPageSaved()
    assert.equal(hits, 0)
    unsub()
  } finally {
    if (prev !== undefined) g.window = prev
  }
})

// ─── Mechanism B: container Apply → pending badge ───────────────────────────

const CONTAINERS_THAT_SET_PENDING_ON_APPLY = [
  "BVODContainer.tsx",
  "CinemaContainer.tsx",
  "DigitalAudioContainer.tsx",
  "DigitalDisplayContainer.tsx",
  "DigitalVideoContainer.tsx",
  "InfluencersContainer.tsx",
  "IntegrationContainer.tsx",
  "MagazinesContainer.tsx",
  "NewspaperContainer.tsx",
  "ProductionContainer.tsx",
  "RadioContainer.tsx",
  "SocialMediaContainer.tsx",
  "TelevisionContainer.tsx",
] as const

test("CHARACTERISATION: 13 bespoke containers + hook + OOH set expertApplyPendingPageSave(true) on Apply", () => {
  for (const file of [
    ...CONTAINERS_THAT_SET_PENDING_ON_APPLY,
    "OOHContainer.tsx",
  ]) {
    const src = read(`components/media-containers/${file}`)
    assert.match(
      src,
      /setExpertApplyPendingPageSave\(true\)/,
      `${file} must light the soft badge on Expert Apply`
    )
    assert.match(
      src,
      /subscribeMediaPlanPageSaved\(\(\) => setExpertApplyPendingPageSave\(false\)\)/,
      `${file} must clear badge on page-saved signal`
    )
  }
  const hook = read("lib/mediaplan/useMediaChannelContainer.ts")
  assert.match(hook, /setExpertApplyPendingPageSave\(true\)/)
  assert.match(
    hook,
    /subscribeMediaPlanPageSaved\(\(\) => setExpertApplyPendingPageSave\(false\)\)/
  )
})

test("CHARACTERISATION (C-38 FIXED): OOHContainer sets expertApplyPendingPageSave(true) on Apply", () => {
  const ooh = read("components/media-containers/OOHContainer.tsx")
  assert.match(
    ooh,
    /subscribeMediaPlanPageSaved\(\(\) => setExpertApplyPendingPageSave\(false\)\)/
  )
  assert.match(ooh, /setExpertApplyPendingPageSave\(true\)/)
})

test("CHARACTERISATION: MediaChannelContainer consumes hook pending flag (does not own setTrue)", () => {
  const shell = read("components/media-containers/MediaChannelContainer.tsx")
  assert.match(shell, /expertApplyPendingPageSave/)
  assert.doesNotMatch(shell, /setExpertApplyPendingPageSave\(true\)/)
  assert.doesNotMatch(shell, /subscribeMediaPlanPageSaved/)
})

test("CHARACTERISATION: Prog*/Search thin containers have no local expertApplyPending state", () => {
  for (const file of [
    "ProgAudioContainer.tsx",
    "ProgBVODContainer.tsx",
    "ProgDisplayContainer.tsx",
    "ProgOOHContainer.tsx",
    "ProgVideoContainer.tsx",
    "SearchContainer.tsx",
  ]) {
    const src = read(`components/media-containers/${file}`)
    assert.doesNotMatch(
      src,
      /expertApplyPendingPageSave/,
      `${file} must delegate dirty badge to useMediaChannelContainer via MediaChannelContainer`
    )
  }
})

// ─── Mechanism A: page hasUnsavedChanges contracts (source) ─────────────────

test("CHARACTERISATION edit page: dirty sources and clear sites", () => {
  const edit = read("app/mediaplans/mba/[mba_number]/edit/page.tsx")

  assert.match(edit, /useMediaPlanDirtyController/)
  assert.match(edit, /openGate\(/)
  assert.match(edit, /markUnsavedChanges/)
  assert.match(edit, /markPassiveChannelChange/)
  assert.match(edit, /form\.watch\(\(\) => \{\s*markUnsavedChanges\(\)/s)
  assert.match(
    edit,
    /pendingBillingOverrideRows\.length > 0[\s\S]{0,80}markUnsavedChanges\(\)/
  )
  assert.match(
    edit,
    /<ExpertApplyDirtyClearOnSave\s+hasUnsavedChanges=\{hasUnsavedChanges\}\s*\/>/
  )
  assert.match(
    edit,
    /shouldBlockNavigation = hasUnsavedChanges && !isSaving && !isLoading/
  )

  const saveBtn = edit.match(
    /onClick=\{\(\) => void handleSaveAll\(\)\}[\s\S]{0,280}disabled=\{([\s\S]*?)\}/
  )
  assert.ok(saveBtn, "main Save button disabled expression must exist")
  assert.doesNotMatch(
    saveBtn![1]!,
    /hasUnsavedChanges/,
    "CURRENT: primary Save ignores hasUnsavedChanges — gating is a separate commit"
  )

  assert.match(
    edit,
    /onClick=\{\(\) => void planDraft\.saveDraftNow\(\)\}[\s\S]{0,120}!hasUnsavedChanges/s
  )
})

test("CHARACTERISATION edit page: outer handleSaveAll catch does NOT clear dirty (failed save stays dirty)", () => {
  const edit = read("app/mediaplans/mba/[mba_number]/edit/page.tsx")
  const marker =
    "Navigate to mediaplans page after successful save\n      clearDirtyOnSaveSuccess()\n      router.push('/mediaplans')\n    } catch (error: any) {"
  const idx = edit.indexOf(marker)
  assert.ok(idx >= 0, "expected success-clear → outer catch sequence")
  const catchStart = edit.indexOf("} catch (error: any) {", idx)
  const finallyStart = edit.indexOf("} finally {", catchStart)
  assert.ok(catchStart >= 0 && finallyStart > catchStart)
  const outerCatch = edit.slice(catchStart, finallyStart)
  assert.match(outerCatch, /Error saving/)
  assert.doesNotMatch(
    outerCatch,
    /clearDirtyOnSaveSuccess\(\)/,
    "FAILED save must leave hasUnsavedChanges dirty (PROPERTY — clear only on success)"
  )
})

test("CHARACTERISATION create page: Save not gated; draft gated; ExpertApplyDirtyClearOnSave present", () => {
  const create = read("app/mediaplans/create/page.tsx")
  assert.match(create, /useMediaPlanDirtyController/)
  assert.match(
    create,
    /<ExpertApplyDirtyClearOnSave\s+hasUnsavedChanges=\{hasUnsavedChanges\}\s*\/>/
  )
  assert.match(
    create,
    /shouldBlockNavigation = hasUnsavedChanges && !isPlanSaving && !isVersionSaving && !isLoading/
  )

  const primarySave = create.match(
    /onClick=\{\(\) => void handleSaveAll\(\)\}[\s\S]{0,200}disabled=\{([^}]+)\}/
  )
  assert.ok(primarySave)
  assert.doesNotMatch(
    primarySave![1]!,
    /hasUnsavedChanges/,
    "CURRENT create primary Save not gated on dirty"
  )
  assert.match(
    create,
    /planDraft\.saveDraftNow\(\)[\s\S]{0,120}!hasUnsavedChanges/s
  )
})

test("CHARACTERISATION create page: failed publish-retry (!ok) returns without clearing dirty", () => {
  const create = read("app/mediaplans/create/page.tsx")
  const start = create.indexOf("if (!publishResponse.ok) {")
  assert.ok(start >= 0)
  const end = create.indexOf('patchPublishStatus("success")', start)
  assert.ok(end > start)
  const branch = create.slice(start, end)
  assert.match(branch, /Publish retry failed/)
  assert.match(branch, /return/)
  assert.doesNotMatch(branch, /clearDirtyOnSaveSuccess\(\)/)
})

test("CHARACTERISATION create page: successful publish-retry DOES clear dirty then navigate (CURRENT)", () => {
  const create = read("app/mediaplans/create/page.tsx")
  const start = create.indexOf('patchPublishStatus("success")')
  const end = create.indexOf("} catch (err: any) {", start)
  assert.ok(start >= 0 && end > start)
  const ok = create.slice(start, end)
  assert.match(ok, /clearDirtyOnSaveSuccess\(\)/)
  assert.match(ok, /router\.push\("\/mediaplans"\)/)
})

test("CHARACTERISATION ExpertApplyDirtyClearOnSave: only true→false edge signals save", () => {
  const src = read("components/mediaplans/ExpertApplyDirtyClearOnSave.tsx")
  assert.match(src, /prev\.current === true && hasUnsavedChanges === false/)
  assert.match(src, /signalMediaPlanPageSaved\(\)/)
  assert.doesNotMatch(
    src,
    /hasUnsavedChanges === true/,
    "must not signal on dirtying — only on successful clear of page dirty"
  )
})

test("CHARACTERISATION: UnsavedChangesDialog does not own dirty state", () => {
  const dlg = read("components/mediaplans/UnsavedChangesDialog.tsx")
  assert.doesNotMatch(dlg, /useState/)
  assert.match(dlg, /onStay/)
  assert.match(dlg, /onSave/)
  assert.match(dlg, /onLeave/)
})
