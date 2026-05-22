import assert from "node:assert/strict"
import test from "node:test"
import {
  parseLineNumberFromLineItemId,
  resolveLineItemSortNumber,
  sortLineItemsByLineItemNumber,
} from "../../lib/mediaplan/lineItemIds.js"

test("parseLineNumberFromLineItemId reads OH and legacy ML suffixes", () => {
  assert.equal(parseLineNumberFromLineItemId("MBA2024OH7"), 7)
  assert.equal(parseLineNumberFromLineItemId("MBA2024OH68"), 68)
  assert.equal(parseLineNumberFromLineItemId("MBA2024OH70"), 70)
  assert.equal(parseLineNumberFromLineItemId("MBA2024ML70"), 70)
})

test("sortLineItemsByLineItemNumber sorts numeric line_item strings past 60", () => {
  const shuffled = [
    { line_item: "70", line_item_id: "MBA2024OH70" },
    { line_item: "7", line_item_id: "MBA2024OH7" },
    { line_item: "68", line_item_id: "MBA2024OH68" },
    { line_item: "61", line_item_id: "MBA2024OH61" },
    { line_item: "9", line_item_id: "MBA2024OH9" },
    { line_item: "100", line_item_id: "MBA2024OH100" },
  ]

  const sorted = sortLineItemsByLineItemNumber(shuffled)
  assert.deepEqual(
    sorted.map((r) => r.line_item),
    ["7", "9", "61", "68", "70", "100"]
  )
})

test("sortLineItemsByLineItemNumber falls back to line_item_id when line_item missing", () => {
  const shuffled = [
    { line_item_id: "MBA99OH72" },
    { line_item_id: "MBA99OH8" },
    { line_item_id: "MBA99OH65" },
  ]

  const sorted = sortLineItemsByLineItemNumber(shuffled)
  assert.deepEqual(
    sorted.map((r) => resolveLineItemSortNumber(r)),
    [8, 65, 72]
  )
})

test("sortLineItemsByLineItemNumber is stable for duplicate line numbers", () => {
  const a = { line_item: 5, network: "first" }
  const b = { line_item: 5, network: "second" }
  const sorted = sortLineItemsByLineItemNumber([b, a])
  assert.equal(sorted[0].network, "second")
  assert.equal(sorted[1].network, "first")
})
