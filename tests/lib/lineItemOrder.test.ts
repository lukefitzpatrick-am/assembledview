import assert from "node:assert/strict"
import test from "node:test"
import type { LineItemWithIdentity } from "../../lib/mediaplan/lineItemOrder.js"
import {
  reassignDigiDisplayLineItemNumbers,
  reassignOohLineItemNumbers,
} from "../../lib/mediaplan/lineItemOrder.js"

test("reassignDigiDisplayLineItemNumbers uses DD codes in order", () => {
  const out = reassignDigiDisplayLineItemNumbers(
    [{ site: "a" }, { site: "b" }] as unknown as LineItemWithIdentity[],
    "MBA9",
  )
  assert.equal(out[0].line_item_id, "MBA9DD1")
  assert.equal(out[1].line_item_id, "MBA9DD2")
})

test("reassignOohLineItemNumbers remains compatible via lineItemOrder", () => {
  const out = reassignOohLineItemNumbers(
    [{ network: "x" }] as unknown as LineItemWithIdentity[],
    "MBA9",
  )
  assert.equal(out[0].line_item_id, "MBA9OH1")
})
