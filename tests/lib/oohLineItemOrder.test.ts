import assert from "node:assert/strict"
import test from "node:test"
import { reassignOohLineItemNumbers } from "../../lib/mediaplan/oohLineItemOrder.js"
import {
  mapOohExpertRowsToStandardLineItems,
  type StandardOohFormLineItem,
} from "../../lib/mediaplan/expertChannelMappings.js"
import { mergeOohStandardFromExpertWithPrevious } from "../../lib/mediaplan/expertModeSwitch.js"
import { buildWeeklyGanttColumnsFromCampaign } from "../../lib/utils/weeklyGanttColumns.js"

test("reassignOohLineItemNumbers sets sequential MBA OH ids from array order", () => {
  const out = reassignOohLineItemNumbers(
    [
      { network: "b", line_item: 9, line_item_id: "MBA1OH9" },
      { network: "a", line_item: 2, line_item_id: "MBA1OH2" },
    ],
    "MBA1",
  )
  assert.equal(out[0].line_item, 1)
  assert.equal(out[0].line_item_id, "MBA1OH1")
  assert.equal(out[1].line_item, 2)
  assert.equal(out[1].line_item_id, "MBA1OH2")
})

test("mergeOohStandardFromExpertWithPrevious keeps expert row order line numbers", () => {
  const campaignStart = new Date(2025, 0, 5)
  const campaignEnd = new Date(2025, 0, 11)
  const cols = buildWeeklyGanttColumnsFromCampaign(campaignStart, campaignEnd)
  const w0 = cols[0]!.weekKey

  const generated = mapOohExpertRowsToStandardLineItems(
    [
      {
        id: "MBA99OH5",
        market: "",
        network: "second",
        format: "",
        type: "",
        placement: "",
        startDate: "2025-01-05",
        endDate: "2025-01-11",
        size: "",
        panels: "",
        buyingDemo: "",
        buyType: "panels",
        fixedCostMedia: false,
        clientPaysForMedia: false,
        budgetIncludesFees: false,
        unitRate: 10,
        grossCost: 0,
        weeklyValues: { [w0]: 1 },
        mergedWeekSpans: [],
      },
      {
        id: "MBA99OH2",
        market: "",
        network: "first",
        format: "",
        type: "",
        placement: "",
        startDate: "2025-01-05",
        endDate: "2025-01-11",
        size: "",
        panels: "",
        buyingDemo: "",
        buyType: "panels",
        fixedCostMedia: false,
        clientPaysForMedia: false,
        budgetIncludesFees: false,
        unitRate: 10,
        grossCost: 0,
        weeklyValues: { [w0]: 1 },
        mergedWeekSpans: [],
      },
    ],
    cols,
    campaignStart,
    campaignEnd,
  )

  const previous: StandardOohFormLineItem[] = [
    {
      network: "second",
      format: "",
      buyType: "panels",
      type: "",
      placement: "",
      size: "",
      buyingDemo: "",
      market: "",
      fixedCostMedia: false,
      clientPaysForMedia: false,
      budgetIncludesFees: false,
      noAdserving: true,
      line_item_id: "MBA99OH5",
      line_item: 5,
      lineItem: 5,
      bursts: [],
    },
    {
      network: "first",
      format: "",
      buyType: "panels",
      type: "",
      placement: "",
      size: "",
      buyingDemo: "",
      market: "",
      fixedCostMedia: false,
      clientPaysForMedia: false,
      budgetIncludesFees: false,
      noAdserving: false,
      line_item_id: "MBA99OH2",
      line_item: 2,
      lineItem: 2,
      bursts: [],
    },
  ]

  const merged = mergeOohStandardFromExpertWithPrevious(generated, previous)
  assert.equal(merged[0].line_item, 1)
  assert.equal(merged[1].line_item, 2)
  assert.equal(merged[0].noAdserving, true)
  assert.equal(merged[1].noAdserving, false)
})
