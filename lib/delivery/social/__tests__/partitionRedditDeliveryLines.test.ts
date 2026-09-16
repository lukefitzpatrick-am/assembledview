import assert from "node:assert/strict"
import test from "node:test"

import { partitionRedditDeliveryLines } from "../partitionRedditDeliveryLines"

const redditLine = { line_item_id: "bicau006sm2", platform: "Reddit" }

test("Reddit line with reddit fact rows is live, not awaiting", () => {
  const { live, awaiting } = partitionRedditDeliveryLines(
    [redditLine],
    [{ channel: "reddit", lineItemId: "BICAU006SM2" }],
  )
  assert.equal(live.length, 1)
  assert.equal(live[0]?.line_item_id, "bicau006sm2")
  assert.deepEqual(awaiting, [])
})

test("Reddit line without matching reddit rows goes to awaiting", () => {
  const { live, awaiting } = partitionRedditDeliveryLines(
    [redditLine],
    [{ channel: "tiktok", lineItemId: "bicau006sm2" }],
  )
  assert.deepEqual(live, [])
  assert.equal(awaiting.length, 1)
  assert.equal(awaiting[0]?.line_item_id, "bicau006sm2")
})

test("live Reddit line is never also in awaiting", () => {
  const { live, awaiting } = partitionRedditDeliveryLines(
    [redditLine, { line_item_id: "bicau006sm1", platform: "Reddit" }],
    [{ channel: "reddit", lineItemId: "bicau006sm2" }],
  )
  const liveIds = live.map((item) => item.line_item_id)
  const awaitingIds = awaiting.map((item) => item.line_item_id)
  assert.deepEqual(liveIds, ["bicau006sm2"])
  assert.deepEqual(awaitingIds, ["bicau006sm1"])
  assert.equal(liveIds.some((id) => awaitingIds.includes(id)), false)
})
