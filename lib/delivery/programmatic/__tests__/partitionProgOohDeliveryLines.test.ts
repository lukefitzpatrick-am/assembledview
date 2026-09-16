import assert from "node:assert/strict"
import test from "node:test"

import { partitionProgOohDeliveryLines } from "../partitionProgOohDeliveryLines"

const oohLine = { line_item_id: "legal004po1", platform: "Vistar" }

test("Vistar prog_ooh line with OOH fact rows is live, not awaiting", () => {
  const { live, awaiting } = partitionProgOohDeliveryLines(
    [oohLine],
    [{ channel: "programmatic-ooh", lineItemId: "LEGAL004PO1" }],
  )
  assert.equal(live.length, 1)
  assert.equal(live[0]?.line_item_id, "legal004po1")
  assert.deepEqual(awaiting, [])
})

test("mapped prog_ooh line without matching OOH rows goes to awaiting", () => {
  const { live, awaiting } = partitionProgOohDeliveryLines(
    [oohLine],
    [{ channel: "programmatic-video", lineItemId: "legal004po1" }],
  )
  assert.deepEqual(live, [])
  assert.equal(awaiting.length, 1)
  assert.equal(awaiting[0]?.line_item_id, "legal004po1")
})

test("live OOH line is never also in awaiting", () => {
  const { live, awaiting } = partitionProgOohDeliveryLines(
    [oohLine, { line_item_id: "legal004po2", platform: "Vistar" }],
    [{ channel: "programmatic-ooh", lineItemId: "legal004po1" }],
  )
  const liveIds = live.map((item) => item.line_item_id)
  const awaitingIds = awaiting.map((item) => item.line_item_id)
  assert.deepEqual(liveIds, ["legal004po1"])
  assert.deepEqual(awaitingIds, ["legal004po2"])
  assert.equal(liveIds.some((id) => awaitingIds.includes(id)), false)
})
