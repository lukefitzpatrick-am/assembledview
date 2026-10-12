import assert from "node:assert/strict"
import test from "node:test"
import { explodeExcelLineItems } from "../../lib/docs/explodeExcelLineItems.js"
import { MEDIA_TYPE_ID_CODES, nextLineFields } from "../../lib/mediaplan/lineItemIds.js"
import {
  keepOohLineIdsOnReorder,
  orderOohLinesForExport,
  prepareOohEditorLines,
} from "../../lib/mediaplan/lineItemOrder.js"
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

test("mergeOohStandardFromExpertWithPrevious preserves expert row order and previous line numbers", () => {
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
  // Expert row order is preserved in the merged array.
  assert.equal(merged[0].network, "second")
  assert.equal(merged[1].network, "first")
  // Merge matches by line_item_id and restores previous line numbers (not positional 1..n).
  assert.equal(merged[0].line_item, 5)
  assert.equal(merged[1].line_item, 2)
  assert.equal(merged[0].noAdserving, true)
  assert.equal(merged[1].noAdserving, false)
})

test("reassignOohLineItemNumbers fixes duplicate ids after a simulated duplicate-line-item insert", () => {
  const items = reassignOohLineItemNumbers(
    [
      { network: "a", line_item: 1, line_item_id: "MBA1OH1", lineItemId: "MBA1OH1" },
      { network: "b", line_item: 2, line_item_id: "MBA1OH2", lineItemId: "MBA1OH2" },
      { network: "a-copy", line_item: 2, line_item_id: "MBA1OH2", lineItemId: "MBA1OH2" },
    ],
    "MBA1",
  )
  assert.equal(items.length, 3)
  assert.equal(items[0].line_item_id, "MBA1OH1")
  assert.equal(items[1].line_item_id, "MBA1OH2")
  assert.equal(items[2].line_item_id, "MBA1OH3")
})

test("OOH reorder keeps minted ids and stamps position from the new order", () => {
  const reordered = keepOohLineIdsOnReorder(
    [
      { network: "George", line_item: 21, lineItem: 21, line_item_id: "PENOH21", lineItemId: "PENOH21" },
      { network: "Epping", line_item: 22, lineItem: 22, line_item_id: "PENOH22", lineItemId: "PENOH22" },
      { network: "Pacific", line_item: 20, lineItem: 20, line_item_id: "PENOH20", lineItemId: "PENOH20" },
    ],
    "PEN",
  )
  assert.deepEqual(
    reordered.map((line) => line.line_item_id),
    ["PENOH21", "PENOH22", "PENOH20"],
  )
  assert.deepEqual(
    reordered.map((line) => line.position),
    [0, 1, 2],
  )
  assert.deepEqual(
    reordered.map((line) => line.line_item),
    [21, 22, 20],
  )
})

test("hydrate from persisted position does not rebuild ids from the display index", () => {
  const loaded = prepareOohEditorLines(
    [
      { network: "George", line_item: 2, line_item_id: "PENOH21", lineItemId: "PENOH21" },
      { network: "Epping", line_item: 0, line_item_id: "PENOH22", lineItemId: "PENOH22" },
      { network: "Pacific", line_item: 1, line_item_id: "PENOH20", lineItemId: "PENOH20" },
    ],
    "PEN",
  )
  assert.deepEqual(
    loaded.map((line) => line.network),
    ["Epping", "Pacific", "George"],
  )
  assert.deepEqual(
    loaded.map((line) => line.line_item_id),
    ["PENOH22", "PENOH20", "PENOH21"],
  )
  assert.deepEqual(
    loaded.map((line) => line.position),
    [0, 1, 2],
  )
})

test("OOH export order and Line N follow position, not the id suffix", () => {
  const burst = {
    budget: "100",
    buyAmount: "10",
    startDate: "2025-01-05",
    endDate: "2025-01-11",
    calculatedValue: 1,
  }
  const ordered = orderOohLinesForExport([
    { placement: "Epping", line_item_id: "PENOH22", lineItemId: "PENOH22", line_item: 22, position: 2, buyType: "fixed_cost", bursts: [burst] },
    { placement: "Pacific", line_item_id: "PENOH20", lineItemId: "PENOH20", line_item: 20, position: 0, buyType: "fixed_cost", bursts: [burst] },
    { placement: "George", line_item_id: "PENOH21", lineItemId: "PENOH21", line_item: 21, position: 1, buyType: "fixed_cost", bursts: [burst] },
  ])
  assert.deepEqual(
    ordered.map((line) => line.placement),
    ["Pacific", "George", "Epping"],
  )
  const rows = ordered.flatMap((line, index) =>
    explodeExcelLineItems("ooh", line, 10, index),
  )
  assert.deepEqual(
    rows.map((row) => row.line_item_id),
    ["PENOH20", "PENOH21", "PENOH22"],
  )
  assert.deepEqual(
    rows.map((row) => row.line_item),
    [1, 2, 3],
  )
})

test("a new OOH line after a reorder is one past the highest suffix", () => {
  const reordered = keepOohLineIdsOnReorder(
    [
      { network: "c", line_item: 22, line_item_id: "PENOH22", lineItemId: "PENOH22" },
      { network: "a", line_item: 20, line_item_id: "PENOH20", lineItemId: "PENOH20" },
      { network: "b", line_item: 21, line_item_id: "PENOH21", lineItemId: "PENOH21" },
    ],
    "PEN",
  )
  const added = nextLineFields(reordered, "PEN", MEDIA_TYPE_ID_CODES.ooh)
  assert.equal(added.line_item, 23)
  assert.equal(added.line_item_id, "PENOH23")
})
