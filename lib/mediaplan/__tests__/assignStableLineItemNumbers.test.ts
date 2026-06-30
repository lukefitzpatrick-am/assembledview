import assert from "node:assert/strict"
import test from "node:test"

import { MEDIA_TYPE_ID_CODES, buildLineItemId } from "../lineItemIds.js"
import {
  assignStableLineItemNumbers,
  type LineItemWithIdentity,
} from "../lineItemOrder.js"

test("keeps unique existing line numbers and rebuilds deterministic ids", () => {
  const stable = assignStableLineItemNumbers(
    [
      { line_item: 1, lineItem: 1, line_item_id: "old-1", lineItemId: "old-1" },
      { line_item: 2, lineItem: 2, line_item_id: "old-2", lineItemId: "old-2" },
      { line_item: 3, lineItem: 3, line_item_id: "old-3", lineItemId: "old-3" },
    ],
    "MBA123",
    MEDIA_TYPE_ID_CODES.radio
  )

  assert.deepEqual(
    stable.map(({ line_item, lineItem, line_item_id, lineItemId }) => ({
      line_item,
      lineItem,
      line_item_id,
      lineItemId,
    })),
    [1, 2, 3].map((lineNo) => {
      const id = buildLineItemId("MBA123", MEDIA_TYPE_ID_CODES.radio, lineNo)
      return {
        line_item: lineNo,
        lineItem: lineNo,
        line_item_id: id,
        lineItemId: id,
      }
    })
  )
})

test("assigns a missing number above the current max without bumping later valid numbers", () => {
  const items: LineItemWithIdentity[] = [{ line_item: 1 }, {}, { line_item: 2 }]
  const stable = assignStableLineItemNumbers(items, "MBA123", MEDIA_TYPE_ID_CODES.radio)

  assert.deepEqual(
    stable.map((item) => item.line_item),
    [1, 3, 2]
  )
  assert.deepEqual(
    stable.map((item) => item.line_item_id),
    [1, 3, 2].map((lineNo) => buildLineItemId("MBA123", MEDIA_TYPE_ID_CODES.radio, lineNo))
  )
})

test("assigns colliding later rows the next available stable number", () => {
  const items: LineItemWithIdentity[] = [{ line_item: 1 }, { line_item: 1 }]
  const stable = assignStableLineItemNumbers(items, "MBA123", MEDIA_TYPE_ID_CODES.radio)

  assert.deepEqual(
    stable.map((item) => item.line_item),
    [1, 2]
  )
  assert.deepEqual(
    stable.map((item) => item.line_item_id),
    [1, 2].map((lineNo) => buildLineItemId("MBA123", MEDIA_TYPE_ID_CODES.radio, lineNo))
  )
})

test("claims a missing number from deterministic line_item_id", () => {
  const items: LineItemWithIdentity[] = [{ line_item_id: "MBA1DA5" }]
  const stable = assignStableLineItemNumbers(
    items,
    "MBA1",
    MEDIA_TYPE_ID_CODES.digitalAudio
  )

  assert.equal(stable[0].line_item, 5)
  assert.equal(stable[0].lineItem, 5)
  assert.equal(stable[0].line_item_id, "MBA1DA5")
  assert.equal(stable[0].lineItemId, "MBA1DA5")
})

test("fills missing numbers above deterministic line_item_id claims", () => {
  const items: LineItemWithIdentity[] = [{ line_item_id: "MBA1DA5" }, {}]
  const stable = assignStableLineItemNumbers(
    items,
    "MBA1",
    MEDIA_TYPE_ID_CODES.digitalAudio
  )

  assert.deepEqual(
    stable.map((item) => item.line_item),
    [5, 6]
  )
  assert.deepEqual(
    stable.map((item) => item.line_item_id),
    ["MBA1DA5", "MBA1DA6"]
  )
})

test("falls back to existing id or line number string when mbaNumber is empty", () => {
  const stable = assignStableLineItemNumbers(
    [
      { line_item: 1, line_item_id: "existing-1" },
      { line_item: 2, lineItemId: "existing-2" },
      { line_item: 3 },
    ],
    "",
    MEDIA_TYPE_ID_CODES.radio
  )

  assert.deepEqual(
    stable.map((item) => item.line_item_id),
    ["existing-1", "existing-2", "3"]
  )
  assert.deepEqual(
    stable.map((item) => item.lineItemId),
    ["existing-1", "existing-2", "3"]
  )
})
