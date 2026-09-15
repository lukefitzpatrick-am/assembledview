/**
 * SM-13 / SM-14 / SM-24 — descriptor compact-mode hysteresis, pin/focus resolve,
 * logical-scroll auto-mode, canCompact, user-initiated vs compensation events,
 * compact-floor compensation, and auto-compact kill-switch branches (off vs on).
 *
 * Run: npx tsx --test lib/mediaplan/__tests__/expertGridDescriptorMode.test.ts
 */
import assert from "node:assert/strict"
import test from "node:test"

import { descriptorPinTooltip } from "@/components/media-containers/ExpertGridDescriptorChrome"
import { expertGridStickyLeftWidthPx } from "@/components/media-containers/expertGridSticky"
import {
  RADIO_EXPERT_CHANNEL_CONFIG,
  expertGridDescriptorColWidths,
  expertGridDescriptorColWidthsForMode,
} from "@/lib/mediaplan/expertGridChannelConfig"
import {
  adjustScrollLeftForDescriptorWidthChange,
  applyDescriptorScrollEvent,
  canCompact,
  descriptorLogicalScrollLeft,
  DESCRIPTOR_COMPACT_SCROLL_PX,
  DESCRIPTOR_EXPAND_SCROLL_PX,
  DESCRIPTOR_SCROLL_SUPPRESS_MS,
  nextDescriptorPin,
  nextDescriptorScrollIntent,
  nextDescriptorScrollSuppressUntil,
  parseDescriptorPin,
  resolveExpertGridDescriptorMode,
  resolveExpertGridDescriptorModeWith,
  shouldSuppressDescriptorScrollEvent,
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

const UNPINNED_AUTO_COMPACT = {
  focusWithin: false,
  errorWithin: false,
  pinned: null,
  auto: "compact" as const,
}

test("auto-compact off: pinned null + auto compact → expanded", () => {
  assert.equal(
    resolveExpertGridDescriptorModeWith(UNPINNED_AUTO_COMPACT, false),
    "expanded"
  )
})

test("auto-compact off: pinned false → compact", () => {
  assert.equal(
    resolveExpertGridDescriptorModeWith(
      {
        focusWithin: false,
        errorWithin: false,
        pinned: false,
        auto: "expanded",
      },
      false
    ),
    "compact"
  )
})

test("pinned null uses auto when auto-compact is on", () => {
  assert.equal(
    resolveExpertGridDescriptorModeWith(UNPINNED_AUTO_COMPACT, true),
    "compact"
  )
  assert.equal(
    resolveExpertGridDescriptorModeWith(
      {
        focusWithin: false,
        errorWithin: false,
        pinned: null,
        auto: "expanded",
      },
      true
    ),
    "expanded"
  )
  assert.equal(resolveExpertGridDescriptorMode(UNPINNED_AUTO_COMPACT), "compact")
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

test("SM-17: radio sticky widths — canCompact at 3000/1400, false when week travel after shrink < 160", () => {
  const radioConfig = RADIO_EXPERT_CHANNEL_CONFIG
  const expandedStickyWidthPx = expertGridStickyLeftWidthPx(
    expertGridDescriptorColWidths(radioConfig, false)
  )
  const compactStickyWidthPx = expertGridStickyLeftWidthPx(
    expertGridDescriptorColWidthsForMode(radioConfig, false, "compact")
  )
  const widths = {
    expandedStickyWidthPx,
    compactStickyWidthPx,
    currentStickyWidthPx: expandedStickyWidthPx,
  }
  assert.equal(
    canCompact({ scrollWidth: 3000, clientWidth: 1400 }, widths),
    true
  )
  const W = expandedStickyWidthPx - compactStickyWidthPx
  const clientWidthTight = 3000 - W - (DESCRIPTOR_COMPACT_SCROLL_PX - 1)
  assert.equal(
    canCompact({ scrollWidth: 3000, clientWidth: clientWidthTight }, widths),
    false
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

test("scrollLeft compensation equals sticky-width delta, clamped to [min, max]", () => {
  assert.equal(adjustScrollLeftForDescriptorWidthChange(0, 400, 1400, 2000), 1000)
  assert.equal(adjustScrollLeftForDescriptorWidthChange(200, 900, 900, 500), 200)
  assert.equal(
    adjustScrollLeftForDescriptorWidthChange(800, 1400, 400, 500),
    DESCRIPTOR_EXPAND_SCROLL_PX
  )
  assert.equal(adjustScrollLeftForDescriptorWidthChange(100, 400, 1400, 500), 500)
})

test("expanded → compact floors at DESCRIPTOR_EXPAND_SCROLL_PX when maxScroll allows it", () => {
  assert.equal(
    adjustScrollLeftForDescriptorWidthChange(300, 1400, 522, 172),
    DESCRIPTOR_EXPAND_SCROLL_PX
  )
})

test("expanded → compact still floors at 0 when maxScroll cannot hold 40px", () => {
  assert.equal(adjustScrollLeftForDescriptorWidthChange(300, 1400, 522, 20), 0)
})

const NARROW_WIDTHS = {
  expandedStickyWidthPx: 1400,
  compactStickyWidthPx: 600,
  currentStickyWidthPx: 1400,
}
const WIDE_WIDTHS = {
  expandedStickyWidthPx: 1400,
  compactStickyWidthPx: 600,
  currentStickyWidthPx: 1400,
}

test("canCompact is false when expanded max 300 and W 800 (narrow right-edge loop)", () => {
  assert.equal(
    canCompact({ scrollWidth: 1300, clientWidth: 1000 }, NARROW_WIDTHS),
    false
  )
})

test("narrow grid: mode stays expanded across 10 simulated frames at the right edge", () => {
  const el = { scrollWidth: 1300, clientWidth: 1000 }
  let mode: "expanded" | "compact" = "expanded"
  let scrollLeft = 300
  let currentW = NARROW_WIDTHS.expandedStickyWidthPx
  let scrollWidth = el.scrollWidth
  for (let i = 0; i < 10; i += 1) {
    const currentStickyWidthPx = currentW
    const step = applyDescriptorScrollEvent({
      current: mode,
      scrollLeft,
      scrollWidth,
      clientWidth: el.clientWidth,
      expandedStickyWidthPx: NARROW_WIDTHS.expandedStickyWidthPx,
      compactStickyWidthPx: NARROW_WIDTHS.compactStickyWidthPx,
      currentStickyWidthPx,
      userInitiated: true,
    })
    assert.equal(step.mode, "expanded")
    if (step.mode !== mode) {
      const nextW =
        step.mode === "compact"
          ? NARROW_WIDTHS.compactStickyWidthPx
          : NARROW_WIDTHS.expandedStickyWidthPx
      scrollWidth += nextW - currentW
      const maxScroll = Math.max(0, scrollWidth - el.clientWidth)
      scrollLeft = adjustScrollLeftForDescriptorWidthChange(
        scrollLeft,
        currentW,
        nextW,
        maxScroll
      )
      currentW = nextW
      mode = step.mode
    }
  }
  assert.equal(mode, "expanded")
})

test("wide grid: canCompact true; hysteresis on logical 200/100/30; compact scrollLeft never negative", () => {
  const W =
    WIDE_WIDTHS.expandedStickyWidthPx - WIDE_WIDTHS.compactStickyWidthPx
  assert.equal(W, 800)
  assert.equal(
    canCompact({ scrollWidth: 4000, clientWidth: 1000 }, WIDE_WIDTHS),
    true
  )

  let mode = nextDescriptorScrollIntent("expanded", 200, true)
  assert.equal(mode, "compact")
  let compactScrollLeft = Math.max(0, 200 - W)
  assert.equal(compactScrollLeft, 0)

  mode = nextDescriptorScrollIntent(mode, 100, true)
  assert.equal(mode, "compact")
  compactScrollLeft = Math.max(0, 100 - W)
  assert.equal(compactScrollLeft, 0)

  mode = nextDescriptorScrollIntent(mode, 30, true)
  assert.equal(mode, "expanded")
  compactScrollLeft = Math.max(0, 30 - W)
  assert.equal(compactScrollLeft, 0)
})

test("logicalScroll equals scrollLeft when expanded and scrollLeft + W when compact", () => {
  assert.equal(descriptorLogicalScrollLeft(200, 1400, 1400), 200)
  assert.equal(descriptorLogicalScrollLeft(50, 1400, 600), 850)
})

test("nextDescriptorScrollIntent stays expanded when compact is not allowed", () => {
  assert.equal(nextDescriptorScrollIntent("expanded", 300, false), "expanded")
  assert.equal(nextDescriptorScrollIntent("compact", 300, false), "expanded")
})

test("dead suppress helpers still encode the 34ms window (knip leftovers)", () => {
  const until = nextDescriptorScrollSuppressUntil(1_000)
  assert.equal(until, 1_000 + DESCRIPTOR_SCROLL_SUPPRESS_MS)
  assert.equal(shouldSuppressDescriptorScrollEvent(1_000, until), true)
  assert.equal(shouldSuppressDescriptorScrollEvent(1_033, until), true)
  assert.equal(shouldSuppressDescriptorScrollEvent(1_034, until), false)
})

const APPLY_BASE = {
  scrollWidth: 3200,
  clientWidth: 1000,
  expandedStickyWidthPx: 1400,
  compactStickyWidthPx: 600,
}

test("a compensation-driven scroll event is ignored; a user-initiated one is not", () => {
  const base = {
    ...APPLY_BASE,
    current: "compact" as const,
    scrollLeft: 2200,
    currentStickyWidthPx: 600,
  }
  const ignored = applyDescriptorScrollEvent({ ...base, userInitiated: false })
  assert.equal(ignored.ignored, true)
  assert.equal(ignored.mode, "compact")

  const after = applyDescriptorScrollEvent({ ...base, userInitiated: true })
  assert.equal(after.ignored, false)
  assert.equal(after.mode, "compact")
})

test("dead band: compensation after compact at scrollLeft 300 / W 878 does not expand", () => {
  const expandedStickyWidthPx = 1400
  const compactStickyWidthPx = 522
  const W = expandedStickyWidthPx - compactStickyWidthPx
  assert.equal(W, 878)
  const clientWidth = 1732
  const expandedScrollWidth = 2782
  const compactScrollWidth = 1904

  const user = applyDescriptorScrollEvent({
    current: "expanded",
    scrollLeft: 300,
    scrollWidth: expandedScrollWidth,
    clientWidth,
    expandedStickyWidthPx,
    compactStickyWidthPx,
    currentStickyWidthPx: expandedStickyWidthPx,
    userInitiated: true,
  })
  assert.equal(user.ignored, false)
  assert.equal(user.mode, "compact")

  const maxScroll = Math.max(0, compactScrollWidth - clientWidth)
  const compensated = adjustScrollLeftForDescriptorWidthChange(
    300,
    expandedStickyWidthPx,
    compactStickyWidthPx,
    maxScroll
  )
  assert.equal(compensated, DESCRIPTOR_EXPAND_SCROLL_PX)

  const compensationEvent = applyDescriptorScrollEvent({
    current: "compact",
    scrollLeft: compensated,
    scrollWidth: compactScrollWidth,
    clientWidth,
    expandedStickyWidthPx,
    compactStickyWidthPx,
    currentStickyWidthPx: compactStickyWidthPx,
    userInitiated: false,
  })
  assert.equal(compensationEvent.ignored, true)
  assert.equal(compensationEvent.mode, "compact")
})

test("compact scroller left edge expands on a user-initiated scroll", () => {
  const expanded = applyDescriptorScrollEvent({
    current: "compact",
    scrollLeft: 30,
    ...APPLY_BASE,
    currentStickyWidthPx: 600,
    userInitiated: true,
  })
  assert.equal(expanded.ignored, false)
  assert.equal(expanded.mode, "expanded")
})
