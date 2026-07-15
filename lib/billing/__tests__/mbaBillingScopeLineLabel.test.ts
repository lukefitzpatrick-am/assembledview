import assert from "node:assert/strict"
import test from "node:test"

import {
  buildMbaBillingScopeLineLabel,
  mbaBillingScopeLineDescriptorParts,
} from "../mbaBillingScopeLineLabel.js"

test("ooh descriptors join network — market — format", () => {
  const parts = mbaBillingScopeLineDescriptorParts("ooh", {
    network: "Vicinity",
    market: "Retail",
    format: "Panels",
  })
  assert.deepEqual(parts, ["Vicinity", "Retail", "Panels"])
  assert.equal(
    buildMbaBillingScopeLineLabel({
      mediaType: "ooh",
      mediaLabel: "OOH",
      lineItem: { network: "Vicinity", market: "Retail", format: "Panels" },
      lineNumber: 1,
    }).title,
    "Vicinity — Retail — Panels"
  )
})

test("never falls back to billing id", () => {
  const label = buildMbaBillingScopeLineLabel({
    mediaType: "search",
    mediaLabel: "Search",
    lineItem: { line_item_id: "billing-search::abc" },
    lineNumber: 3,
  })
  assert.equal(label.title, "Search line 3")
  assert.ok(!label.title.includes("billing-"))
})

test("search uses platform + targeting", () => {
  const label = buildMbaBillingScopeLineLabel({
    mediaType: "search",
    mediaLabel: "Search",
    lineItem: { platform: "Google", targeting: "Brand" },
    lineNumber: 1,
  })
  assert.equal(label.title, "Google — Brand")
})
