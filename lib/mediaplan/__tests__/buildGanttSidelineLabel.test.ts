import assert from "node:assert/strict"
import test from "node:test"

import { buildGanttSidelineLabel, type NormalisedLineItem } from "../normalizeLineItem.js"

function item(overrides: Partial<NormalisedLineItem> = {}): NormalisedLineItem {
  return {
    lineItemId: "BICAU001TV2",
    mediaType: "television",
    bursts: [],
    ...overrides,
  }
}

test("prefers creative targeting over bid strategy", () => {
  const label = buildGanttSidelineLabel(
    item({
      publisher: "Meta",
      platform: "Meta",
      bidStrategy: "completed_views",
      creativeTargeting: "Women 18-44, MGBs",
    }),
  )
  assert.equal(label, "Meta • Women 18-44, MGBs")
})

test("uses placement when targeting/site empty (TV)", () => {
  const label = buildGanttSidelineLabel(
    item({
      publisher: "Nine",
      network: "Nine",
      placement: "Solus Broadcast Billboards (Premiere & Encore)",
      daypart: "Married At First Sight Program Sponsorship",
    }),
  )
  assert.equal(label, "Nine • Solus Broadcast Billboards (Premiere & Encore)")
})

test("uses site when ≠ left and targeting empty", () => {
  const label = buildGanttSidelineLabel(
    item({
      publisher: "Nine",
      site: "NineNow",
      daypart: "RON",
    }),
  )
  assert.equal(label, "Nine • NineNow")
})

test("skips site when it duplicates left", () => {
  const label = buildGanttSidelineLabel(
    item({
      publisher: "NineNow",
      site: "NineNow",
      placement: "Pre-roll",
    }),
  )
  assert.equal(label, "NineNow • Pre-roll")
})

test("falls back to line item id when descriptive fields empty", () => {
  const label = buildGanttSidelineLabel(
    item({
      publisher: "—",
      bidStrategy: "reach",
    }),
  )
  assert.equal(label, "— • Line item BICAU001TV2")
})

test("uses first line of multi-line creative targeting", () => {
  const label = buildGanttSidelineLabel(
    item({
      platform: "Meta",
      creativeTargeting: "Hotel - Traffic\n\n- detailed interests",
    }),
  )
  assert.equal(label, "Meta • Hotel - Traffic")
})
