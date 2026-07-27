import assert from "node:assert/strict"
import test from "node:test"
import {
  MEDIA_TYPE_ID_CODES,
  assignLineItemIdentities,
  buildLineItemIdentity,
} from "../../lib/mediaplan/lineItemIds.js"

test("buildLineItemIdentity keeps a persisted line_item_id on reorder", () => {
  const item = { line_item_id: "PENFOLD016TV3", line_item: 3, network: "Seven" }
  // Array index 0 must not restamp a persisted id
  const identity = buildLineItemIdentity(item, "PENFOLD016", MEDIA_TYPE_ID_CODES.television, 0)
  assert.equal(identity.line_item_id, "PENFOLD016TV3")
  assert.equal(identity.line_item, 3)
})

test("buildLineItemIdentity keeps camelCase lineItemId", () => {
  const identity = buildLineItemIdentity(
    { lineItemId: "MBA1SM7", lineItem: 7 },
    "MBA1",
    MEDIA_TYPE_ID_CODES.socialMedia,
    99
  )
  assert.equal(identity.line_item_id, "MBA1SM7")
  assert.equal(identity.line_item, 7)
})

test("assignLineItemIdentities mints max+1 for new lines, never array index", () => {
  const items = [
    { line_item_id: "MBA1TV1", line_item: 1 },
    { line_item_id: "MBA1TV5", line_item: 5 },
    { network: "new" }, // no id — must become 6, not index+1=3
  ]
  const ids = assignLineItemIdentities(items, "MBA1", MEDIA_TYPE_ID_CODES.television)
  assert.equal(ids[0].line_item_id, "MBA1TV1")
  assert.equal(ids[1].line_item_id, "MBA1TV5")
  assert.equal(ids[2].line_item_id, "MBA1TV6")
  assert.equal(ids[2].line_item, 6)
})

test("assignLineItemIdentities preserves ids across reorder", () => {
  const items = [
    { line_item_id: "MBA1TV2", line_item: 2 },
    { line_item_id: "MBA1TV1", line_item: 1 },
  ]
  const ids = assignLineItemIdentities(items, "MBA1", MEDIA_TYPE_ID_CODES.television)
  assert.deepEqual(
    ids.map((x) => x.line_item_id),
    ["MBA1TV2", "MBA1TV1"]
  )
})

test("assignLineItemIdentities remints same-id collision (keep first, max+1 second)", () => {
  const warns: string[] = []
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warns.push(args.map(String).join(" "))
  }
  try {
    const items = [
      { line_item_id: "MBA1TV3", line_item: 3, network: "first" },
      { line_item_id: "MBA1TV3", line_item: 3, network: "duplicate" },
      { line_item_id: "MBA1TV1", line_item: 1 },
    ]
    const ids = assignLineItemIdentities(items, "MBA1", MEDIA_TYPE_ID_CODES.television)
    assert.equal(ids[0].line_item_id, "MBA1TV3")
    assert.equal(ids[2].line_item_id, "MBA1TV1")
    // Second shared id must remint to max(used)+1 → 4
    assert.equal(ids[1].line_item_id, "MBA1TV4")
    assert.equal(ids[1].line_item, 4)
    assert.ok(warns.some((w) => /same.*line_item_id|duplicate.*line_item_id|collision/i.test(w)))
  } finally {
    console.warn = originalWarn
  }
})
