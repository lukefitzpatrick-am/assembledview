/**
 * P2-3 — pin MediaPlanDirtyController behaviour (controller + page adapters).
 *
 * PROPERTY TO PRESERVE: dirty clears only on save SUCCESS
 * (`clearDirtyOnSaveSuccess`). There is no clear-on-attempt API; a failed
 * save must leave dirty true. Right behaviour that nothing enforces is one
 * refactor away from being wrong.
 */
import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { createMediaPlanDirtyController } from "@/lib/mediaplan/mediaPlanDirtyController"

const root = process.cwd()

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8")
}

// ─── Pure controller ────────────────────────────────────────────────────────

test("P2-3 controller: gate closed — markUnsavedChanges is a no-op", () => {
  const c = createMediaPlanDirtyController()
  c.markUnsavedChanges()
  assert.equal(c.getHasUnsavedChanges(), false)
  c.markPassiveChannelChange()
  assert.equal(c.getHasUnsavedChanges(), false)
})

test("P2-3 controller: open gate then mark → dirty", () => {
  const c = createMediaPlanDirtyController()
  c.openGate()
  c.markUnsavedChanges()
  assert.equal(c.getHasUnsavedChanges(), true)
})

test("P2-3 PROPERTY: clearDirtyOnSaveSuccess clears; failed-save path that omits it keeps dirty", () => {
  const c = createMediaPlanDirtyController()
  c.openGate()
  c.markUnsavedChanges()
  assert.equal(c.getHasUnsavedChanges(), true)

  // Simulate failed save: early return / catch — never call clearDirtyOnSaveSuccess.
  assert.equal(c.getHasUnsavedChanges(), true, "failed save must leave dirty")

  // Simulate successful save.
  c.clearDirtyOnSaveSuccess()
  assert.equal(c.getHasUnsavedChanges(), false)
})

test("P2-3 PROPERTY: no clear-on-attempt API on the controller surface", () => {
  const c = createMediaPlanDirtyController() as Record<string, unknown>
  assert.equal(
    typeof c.clearDirtyOnSaveAttempt,
    "undefined",
    "clearDirtyOnSaveAttempt must not exist — clear only on success"
  )
  assert.equal(typeof c.clearDirtyOnSaveSuccess, "function")
  assert.equal(typeof c.clearDirtyForHydration, "function")
})

test("P2-3 controller: forceDirty bypasses closed gate", () => {
  const c = createMediaPlanDirtyController()
  assert.equal(c.isGateOpen(), false)
  c.forceDirty()
  assert.equal(c.getHasUnsavedChanges(), true)
})

test("P2-3 controller: passive quiet window suppresses markPassiveChannelChange", () => {
  let t = 1_000
  const c = createMediaPlanDirtyController({ now: () => t })
  c.openGate()
  c.quietPassiveForMs(2_500)
  c.markPassiveChannelChange()
  assert.equal(c.getHasUnsavedChanges(), false)
  t = 1_000 + 2_501
  c.markPassiveChannelChange()
  assert.equal(c.getHasUnsavedChanges(), true)
})

test("P2-3 controller: clearDirtyForHydration clears without implying save success", () => {
  const c = createMediaPlanDirtyController()
  c.forceDirty()
  c.clearDirtyForHydration()
  assert.equal(c.getHasUnsavedChanges(), false)
})

test("P2-3 controller: runWithGateClosed restores prior gate state", () => {
  const c = createMediaPlanDirtyController()
  c.openGate()
  c.runWithGateClosed(() => {
    assert.equal(c.isGateOpen(), false)
    c.markUnsavedChanges()
  })
  assert.equal(c.isGateOpen(), true)
  assert.equal(c.getHasUnsavedChanges(), false)
})

test("P2-3 controller: subscribe fires on dirty transitions", () => {
  const c = createMediaPlanDirtyController()
  let hits = 0
  const unsub = c.subscribe(() => {
    hits += 1
  })
  c.openGate()
  c.markUnsavedChanges()
  assert.equal(hits, 1)
  c.clearDirtyOnSaveSuccess()
  assert.equal(hits, 2)
  c.clearDirtyOnSaveSuccess()
  assert.equal(hits, 2, "idempotent clear must not re-emit")
  unsub()
  c.markUnsavedChanges()
  assert.equal(hits, 2)
})

// ─── Page adapters (source contracts) ───────────────────────────────────────

test("P2-3 adapter: edit + create own dirty via useMediaPlanDirtyController", () => {
  const edit = read("app/mediaplans/mba/[mba_number]/edit/page.tsx")
  const create = read("app/mediaplans/create/page.tsx")
  assert.match(edit, /useMediaPlanDirtyController/)
  assert.match(create, /useMediaPlanDirtyController/)
  assert.doesNotMatch(edit, /const \[hasUnsavedChanges, setHasUnsavedChanges\]/)
  assert.doesNotMatch(create, /const \[hasUnsavedChanges, setHasUnsavedChanges\]/)
})

test("P2-3 PROPERTY adapter: edit save clears only via clearDirtyOnSaveSuccess", () => {
  const edit = read("app/mediaplans/mba/[mba_number]/edit/page.tsx")
  assert.match(edit, /clearDirtyOnSaveSuccess\(\)/)
  assert.doesNotMatch(edit, /setHasUnsavedChanges\(false\)/)
  // Legacy success marker sequence still clears via the success API, not attempt.
  const marker =
    "Navigate to mediaplans page after successful save\n      clearDirtyOnSaveSuccess()\n      router.push('/mediaplans')\n    } catch (error: any) {"
  const idx = edit.indexOf(marker)
  assert.ok(idx >= 0, "expected success-clear → outer catch sequence")
  const catchStart = edit.indexOf("} catch (error: any) {", idx)
  const finallyStart = edit.indexOf("} finally {", catchStart)
  const outerCatch = edit.slice(catchStart, finallyStart)
  assert.doesNotMatch(
    outerCatch,
    /clearDirtyOnSaveSuccess\(\)/,
    "FAILED save must not call clearDirtyOnSaveSuccess"
  )
})

test("P2-3 PROPERTY adapter: create save/publish clears only via clearDirtyOnSaveSuccess", () => {
  const create = read("app/mediaplans/create/page.tsx")
  assert.match(create, /clearDirtyOnSaveSuccess\(\)/)
  assert.doesNotMatch(create, /setHasUnsavedChanges\(false\)/)

  const failStart = create.indexOf("if (!publishResponse.ok) {")
  assert.ok(failStart >= 0)
  const failEnd = create.indexOf('patchPublishStatus("success")', failStart)
  const failBranch = create.slice(failStart, failEnd)
  assert.doesNotMatch(failBranch, /clearDirtyOnSaveSuccess\(\)/)

  const okStart = create.indexOf('patchPublishStatus("success")')
  const okEnd = create.indexOf("} catch (err: any) {", okStart)
  const ok = create.slice(okStart, okEnd)
  assert.match(ok, /clearDirtyOnSaveSuccess\(\)/)
})

test("P2-3 controller module: source has no clear-on-attempt API symbol", () => {
  const src = read("lib/mediaplan/mediaPlanDirtyController.ts")
  // Comments may mention the forbidden name; the exported API must not define it.
  assert.doesNotMatch(
    src,
    /^\s*clearDirtyOnSaveAttempt\s*[:(]/m
  )
  assert.match(src, /clearDirtyOnSaveSuccess/)
  assert.match(src, /PROPERTY/)
  assert.match(src, /SUCCESS only/)
})
