import assert from "node:assert/strict"
import test from "node:test"
import {
  mergeOohStandardFromExpertWithPrevious,
  mergeRadioStandardFromExpertWithPrevious,
} from "../../lib/mediaplan/expertModeSwitch.js"
import type { StandardOohFormLineItem, StandardRadioFormLineItem } from "../../lib/mediaplan/expertChannelMappings.js"

test("mergeOohStandardFromExpertWithPrevious matches by line_item_id, not row order", () => {
  const generated: StandardOohFormLineItem[] = [
    {
      network: "B",
      format: "",
      buyType: "cpm",
      type: "",
      placement: "",
      size: "",
      buyingDemo: "",
      market: "",
      fixedCostMedia: false,
      clientPaysForMedia: false,
      budgetIncludesFees: false,
      noAdserving: false,
      lineItemId: "id-b",
      line_item_id: "id-b",
      line_item: 2,
      lineItem: 2,
      bursts: [],
    },
    {
      network: "A",
      format: "",
      buyType: "cpm",
      type: "",
      placement: "",
      size: "",
      buyingDemo: "",
      market: "",
      fixedCostMedia: false,
      clientPaysForMedia: false,
      budgetIncludesFees: false,
      noAdserving: false,
      lineItemId: "id-a",
      line_item_id: "id-a",
      line_item: 1,
      lineItem: 1,
      bursts: [],
    },
  ]

  const previous: StandardOohFormLineItem[] = [
    {
      ...generated[1]!,
      fixedCostMedia: true,
      clientPaysForMedia: true,
      budgetIncludesFees: true,
      noAdserving: true,
      line_item: 10,
      lineItem: 10,
    },
    {
      ...generated[0]!,
      fixedCostMedia: false,
      clientPaysForMedia: false,
      budgetIncludesFees: false,
      noAdserving: false,
      line_item: 20,
      lineItem: 20,
    },
  ]

  const merged = mergeOohStandardFromExpertWithPrevious(generated, previous)
  const byId = Object.fromEntries(
    merged.map((li) => [String(li.line_item_id ?? li.lineItemId), li])
  )

  // Expert-generated line items own billing flags; merge only restores noAdserving + line numbers.
  assert.equal(byId["id-a"]!.fixedCostMedia, false)
  assert.equal(byId["id-a"]!.noAdserving, true)
  assert.equal(byId["id-a"]!.line_item, 10)
  assert.equal(byId["id-b"]!.line_item, 20)
})

test("mergeRadioStandardFromExpertWithPrevious matches by line_item_id", () => {
  const generated: StandardRadioFormLineItem[] = [
    {
      network: "N",
      station: "S",
      buyType: "spots",
      bidStrategy: "",
      placement: "",
      format: "",
      duration: "",
      buyingDemo: "",
      market: "",
      platform: "",
      creativeTargeting: "",
      creative: "",
      fixedCostMedia: false,
      clientPaysForMedia: false,
      budgetIncludesFees: false,
      noadserving: false,
      lineItemId: "r1",
      line_item_id: "r1",
      line_item: 1,
      lineItem: 1,
      bursts: [],
    },
  ]

  const previous: StandardRadioFormLineItem[] = [
    {
      ...generated[0]!,
      bidStrategy: "Reach",
      platform: "X",
      creativeTargeting: "Y",
      creative: "Z",
      line_item: 99,
      lineItem: 99,
    },
  ]

  const [m] = mergeRadioStandardFromExpertWithPrevious(generated, previous)
  assert.equal(m.bidStrategy, "Reach")
  assert.equal(m.platform, "X")
  assert.equal(m.line_item, 99)
})
