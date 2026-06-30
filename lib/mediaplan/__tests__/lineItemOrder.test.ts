import assert from "node:assert/strict"
import test from "node:test"

import { MEDIA_TYPE_ID_CODES, buildLineItemId } from "../lineItemIds.js"
import { normalizeLineItemsForSave } from "../lineItemOrder.js"

test("normalizes duplicate and gapped line item identities from positional order", () => {
  const normalized = normalizeLineItemsForSave(
    [
      { line_item: 1, lineItem: 1, line_item_id: "MBA123RA1", lineItemId: "MBA123RA1" },
      { line_item: 2, lineItem: 2, line_item_id: "MBA123RA2", lineItemId: "MBA123RA2" },
      { line_item: 3, lineItem: 3, line_item_id: "MBA123RA3", lineItemId: "MBA123RA3" },
      { line_item: 3, lineItem: 3, line_item_id: "MBA123RA3", lineItemId: "MBA123RA3" },
      { line_item: 5, lineItem: 5, line_item_id: "MBA123RA5", lineItemId: "MBA123RA5" },
    ],
    "MBA123",
    MEDIA_TYPE_ID_CODES.radio,
  )

  assert.deepEqual(
    normalized.map((item) => item.line_item),
    [1, 2, 3, 4, 5],
  )
  assert.deepEqual(
    normalized.map((item) => item.line_item_id),
    [1, 2, 3, 4, 5].map((lineNo) => buildLineItemId("MBA123", MEDIA_TYPE_ID_CODES.radio, lineNo)),
  )
})

test("leaves an already positional plan byte-identical for identity fields", () => {
  const clean = [
    { line_item: 1, lineItem: 1, line_item_id: "MBA123NP1", lineItemId: "MBA123NP1" },
    { line_item: 2, lineItem: 2, line_item_id: "MBA123NP2", lineItemId: "MBA123NP2" },
    { line_item: 3, lineItem: 3, line_item_id: "MBA123NP3", lineItemId: "MBA123NP3" },
  ]

  const normalized = normalizeLineItemsForSave(clean, "MBA123", MEDIA_TYPE_ID_CODES.newspaper)

  assert.deepEqual(
    normalized.map(({ line_item, lineItem, line_item_id, lineItemId }) => ({
      line_item,
      lineItem,
      line_item_id,
      lineItemId,
    })),
    clean,
  )
})
