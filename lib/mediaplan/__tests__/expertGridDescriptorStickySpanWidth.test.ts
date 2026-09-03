/**
 * SF-7 — totals-label sticky width equals the columns it colSpans
 * (billing hidden and shown). Trailing net/actions/Σ are not in the span.
 *
 * Run: npx tsx --test lib/mediaplan/__tests__/expertGridDescriptorStickySpanWidth.test.ts
 */
import assert from "node:assert/strict"
import test from "node:test"

import { expertGridDescriptorStickySpanWidthPx } from "@/components/media-containers/expertGridSticky"
import {
  OOH_EXPERT_CHANNEL_CONFIG,
  expertGridDescriptorColWidths,
  expertGridDescriptorKeys,
} from "@/lib/mediaplan/expertGridChannelConfig"
import {
  EXPERT_GRID_BODY_ROW_HEIGHT_PX,
  assertExpertGridBodyRowHeightPx,
  expertGridVirtualSpacerPaddings,
} from "@/lib/mediaplan/oohExpertVirtualization"

function spannedSum(
  widths: readonly number[],
  keyCount: number
): number {
  return widths.slice(0, keyCount).reduce((s, w) => s + w, 0)
}

test("OOH billing hidden: span width is grid cols only (not trailing 244px)", () => {
  const keys = expertGridDescriptorKeys(OOH_EXPERT_CHANNEL_CONFIG, false)
  const widths = expertGridDescriptorColWidths(OOH_EXPERT_CHANNEL_CONFIG, false)
  const span = expertGridDescriptorStickySpanWidthPx(widths, keys.length)
  const expected = spannedSum(widths, keys.length)
  const trailing = (OOH_EXPERT_CHANNEL_CONFIG.trailingColWidthsPx ?? []).reduce(
    (s, w) => s + w,
    0
  )

  assert.equal(keys.length, 11)
  assert.equal(expected, 1082)
  assert.equal(span, expected)
  assert.equal(trailing, 244)
  assert.equal(
    widths.reduce((s, w) => s + w, 0),
    expected + trailing
  )
})

test("OOH billing shown: span width includes billing flags, still omits trailing", () => {
  const keys = expertGridDescriptorKeys(OOH_EXPERT_CHANNEL_CONFIG, true)
  const widths = expertGridDescriptorColWidths(OOH_EXPERT_CHANNEL_CONFIG, true)
  const span = expertGridDescriptorStickySpanWidthPx(widths, keys.length)
  const expected = spannedSum(widths, keys.length)
  const trailing = (OOH_EXPERT_CHANNEL_CONFIG.trailingColWidthsPx ?? []).reduce(
    (s, w) => s + w,
    0
  )

  assert.equal(keys.length, 14)
  assert.equal(expected, 1082 + 56 * 3)
  assert.equal(span, expected)
  assert.equal(
    widths.reduce((s, w) => s + w, 0),
    expected + trailing
  )
})

test("expertGridVirtualSpacerPaddings unchanged (scrollMargin 48 and 76)", () => {
  const cases = [48, 76]
  for (const margin of cases) {
    const items = [
      { start: margin + 41 * 10, end: margin + 41 * 11 },
      { start: margin + 41 * 11, end: margin + 41 * 12 },
    ]
    const totalSize = 300 * 41
    const { paddingTop, paddingBottom } = expertGridVirtualSpacerPaddings(
      items,
      totalSize,
      margin
    )
    assert.equal(paddingTop, 41 * 10)
    assert.equal(paddingBottom, totalSize + margin - items[1]!.end)
  }
})

test("row-height assertion names channel, shorter direction, and per-row drift", () => {
  const errors: string[] = []
  const orig = console.error
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "))
  }
  try {
    assertExpertGridBodyRowHeightPx(
      {
        getBoundingClientRect: () => ({ height: 39 }),
        tagName: "TR",
        getAttribute: (name: string) =>
          name === "data-search-expert-row-index" ? "0" : null,
        style: { height: "41px" },
      },
      EXPERT_GRID_BODY_ROW_HEIGHT_PX,
      "Radio"
    )
    assert.equal(errors.length, 1)
    assert.match(
      errors[0]!,
      /\[expert-grid\] Radio body row measured 39px, virtualiser assumes 41px \(shorter\)/
    )
    assert.match(errors[0]!, /drift by 2px per row/)
    assert.match(
      errors[0]!,
      /<tr data-search-expert-row-index="0" aria-hidden=null style.height="41px">/
    )
  } finally {
    console.error = orig
  }
})

test("row-height assertion names taller direction", () => {
  const errors: string[] = []
  const orig = console.error
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "))
  }
  try {
    assertExpertGridBodyRowHeightPx(
      { getBoundingClientRect: () => ({ height: 50 }) },
      EXPERT_GRID_BODY_ROW_HEIGHT_PX,
      "OOH"
    )
    assert.equal(errors.length, 1)
    assert.match(
      errors[0]!,
      /\[expert-grid\] OOH body row measured 50px, virtualiser assumes 41px \(taller\)/
    )
    assert.match(errors[0]!, /drift by 9px per row/)
  } finally {
    console.error = orig
  }
})

test("row-height assertion is silent when height matches the virtualiser", () => {
  const errors: string[] = []
  const orig = console.error
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "))
  }
  try {
    assertExpertGridBodyRowHeightPx(
      { getBoundingClientRect: () => ({ height: 41 }) },
      EXPERT_GRID_BODY_ROW_HEIGHT_PX,
      "Radio"
    )
    assert.equal(errors.length, 0)
  } finally {
    console.error = orig
  }
})
