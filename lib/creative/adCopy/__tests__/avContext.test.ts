import assert from "node:assert/strict"
import test from "node:test"

/**
 * Lightweight shaping checks for AV context helpers.
 * Networked buildAdCopyAvContext is covered manually / integration.
 */

function matchLineItemId(item: Record<string, unknown>, want: string): boolean {
  const candidates = [item.line_item_id, item.lineItemId, item.LINE_ITEM_ID, item.id]
  const normalized = want.trim().toLowerCase()
  return candidates.some((c) => c != null && String(c).trim().toLowerCase() === normalized)
}

test("matchLineItemId accepts common id field aliases", () => {
  assert.equal(matchLineItemId({ line_item_id: "LI-1" }, "li-1"), true)
  assert.equal(matchLineItemId({ lineItemId: "42" }, "42"), true)
  assert.equal(matchLineItemId({ id: 99 }, "99"), true)
  assert.equal(matchLineItemId({ line_item_id: "A" }, "B"), false)
})
