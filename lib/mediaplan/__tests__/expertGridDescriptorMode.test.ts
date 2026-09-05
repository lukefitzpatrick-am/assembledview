/**
 * SM-13 — descriptor compact-mode hysteresis, pin/focus resolve, and
 * scrollLeft compensation when sticky widths change.
 *
 * Run: npx tsx --test lib/mediaplan/__tests__/expertGridDescriptorMode.test.ts
 */
import assert from "node:assert/strict"
import test from "node:test"

import { descriptorPinTooltip } from "@/components/media-containers/ExpertGridDescriptorChrome"
import {
  adjustScrollLeftForDescriptorWidthChange,
  nextDescriptorPin,
  nextDescriptorScrollIntent,
  parseDescriptorPin,
  resolveExpertGridDescriptorMode,
} from "@/lib/mediaplan/expertGridDescriptorMode"

test("hysteresis: 200 → compact; 100 → still compact; 30 → expanded; 100 → still expanded", () => {
  let mode = nextDescriptorScrollIntent("expanded", 200)
  assert.equal(mode, "compact")
  mode = nextDescriptorScrollIntent(mode, 100)
  assert.equal(mode, "compact")
  mode = nextDescriptorScrollIntent(mode, 30)
  assert.equal(mode, "expanded")
  mode = nextDescriptorScrollIntent(mode, 100)
  assert.equal(mode, "expanded")
})

test("hysteresis: scrollLeft === 160 stays expanded; === 40 stays compact", () => {
  assert.equal(nextDescriptorScrollIntent("expanded", 160), "expanded")
  assert.equal(nextDescriptorScrollIntent("compact", 40), "compact")
})

test("focusWithin forces expanded regardless of scrollLeft", () => {
  assert.equal(
    resolveExpertGridDescriptorMode({
      focusWithin: true,
      errorWithin: false,
      pinned: false,
      auto: "compact",
    }),
    "expanded"
  )
  assert.equal(
    resolveExpertGridDescriptorMode({
      focusWithin: true,
      errorWithin: false,
      pinned: null,
      auto: "compact",
    }),
    "expanded"
  )
})

test("errorWithin forces expanded the same way focus does", () => {
  assert.equal(
    resolveExpertGridDescriptorMode({
      focusWithin: false,
      errorWithin: true,
      pinned: false,
      auto: "compact",
    }),
    "expanded"
  )
})

test("pinned true forces expanded; pinned false forces compact unless focusWithin", () => {
  assert.equal(
    resolveExpertGridDescriptorMode({
      focusWithin: false,
      errorWithin: false,
      pinned: true,
      auto: "compact",
    }),
    "expanded"
  )
  assert.equal(
    resolveExpertGridDescriptorMode({
      focusWithin: false,
      errorWithin: false,
      pinned: false,
      auto: "expanded",
    }),
    "compact"
  )
  assert.equal(
    resolveExpertGridDescriptorMode({
      focusWithin: true,
      errorWithin: false,
      pinned: false,
      auto: "compact",
    }),
    "expanded"
  )
})

test("pinned null uses auto", () => {
  assert.equal(
    resolveExpertGridDescriptorMode({
      focusWithin: false,
      errorWithin: false,
      pinned: null,
      auto: "compact",
    }),
    "compact"
  )
  assert.equal(
    resolveExpertGridDescriptorMode({
      focusWithin: false,
      errorWithin: false,
      pinned: null,
      auto: "expanded",
    }),
    "expanded"
  )
})

test("pin cycle: auto → expanded → compact → auto", () => {
  assert.equal(nextDescriptorPin(null), true)
  assert.equal(nextDescriptorPin(true), false)
  assert.equal(nextDescriptorPin(false), null)
})

test("parseDescriptorPin reads localStorage strings", () => {
  assert.equal(parseDescriptorPin(null), null)
  assert.equal(parseDescriptorPin(""), null)
  assert.equal(parseDescriptorPin("true"), true)
  assert.equal(parseDescriptorPin("false"), false)
})

test("descriptor pin tooltip reflects pinned state", () => {
  assert.equal(descriptorPinTooltip(null), "Keep descriptors expanded")
  assert.equal(descriptorPinTooltip(true), "Keep descriptors expanded")
  assert.equal(descriptorPinTooltip(false), "Collapse descriptors")
})

test("scrollLeft compensation equals sticky-width delta", () => {
  assert.equal(adjustScrollLeftForDescriptorWidthChange(800, 1400, 400), 800 + (400 - 1400))
  assert.equal(adjustScrollLeftForDescriptorWidthChange(0, 400, 1400), 1000)
  assert.equal(adjustScrollLeftForDescriptorWidthChange(200, 900, 900), 200)
})
