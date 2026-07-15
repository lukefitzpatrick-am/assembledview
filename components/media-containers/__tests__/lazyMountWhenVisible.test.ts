import assert from "node:assert/strict"
import test from "node:test"

import { shouldMountFromRect } from "@/components/media-containers/LazyMountWhenVisible"

const VIEWPORT_HEIGHT = 900

test("shouldMountFromRect: section already within the viewport mounts immediately", () => {
  assert.equal(shouldMountFromRect({ top: 100, bottom: 400 }, VIEWPORT_HEIGHT, 400), true)
})

test("shouldMountFromRect: section far below the viewport (beyond overscan) stays unmounted", () => {
  assert.equal(shouldMountFromRect({ top: 5000, bottom: 5300 }, VIEWPORT_HEIGHT, 400), false)
})

test("shouldMountFromRect: section just below the fold, inside the overscan margin, mounts", () => {
  // Viewport ends at 900; overscan of 400px extends the mount zone to 1300.
  assert.equal(shouldMountFromRect({ top: 1200, bottom: 1500 }, VIEWPORT_HEIGHT, 400), true)
})

test("shouldMountFromRect: section just past the overscan margin stays unmounted", () => {
  assert.equal(shouldMountFromRect({ top: 1350, bottom: 1600 }, VIEWPORT_HEIGHT, 400), false)
})

test("shouldMountFromRect: section fully above the viewport but within overscan mounts", () => {
  assert.equal(shouldMountFromRect({ top: -500, bottom: -100 }, VIEWPORT_HEIGHT, 400), true)
})

test("shouldMountFromRect: section far above the viewport (beyond overscan) stays unmounted", () => {
  assert.equal(shouldMountFromRect({ top: -900, bottom: -700 }, VIEWPORT_HEIGHT, 400), false)
})

test("shouldMountFromRect: zero margin only mounts strictly-in-viewport sections", () => {
  assert.equal(shouldMountFromRect({ top: 901, bottom: 1000 }, VIEWPORT_HEIGHT, 0), false)
  assert.equal(shouldMountFromRect({ top: 899, bottom: 1000 }, VIEWPORT_HEIGHT, 0), true)
})
