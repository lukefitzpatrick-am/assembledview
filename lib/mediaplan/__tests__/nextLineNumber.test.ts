import assert from "node:assert/strict"
import test from "node:test"

import { MEDIA_TYPE_ID_CODES, buildLineItemId, nextLineNumber } from "../lineItemIds.js"

test("ids 1 and 3 give 4", () => {
  const ids = [
    buildLineItemId("krusty002", MEDIA_TYPE_ID_CODES.radio, 1),
    buildLineItemId("krusty002", MEDIA_TYPE_ID_CODES.radio, 3),
  ]
  assert.equal(nextLineNumber(ids), 4)
})

test("an empty list gives 1", () => {
  assert.equal(nextLineNumber([]), 1)
  assert.equal(nextLineNumber([null, undefined, ""]), 1)
})

test("mixed prefixes are scored by suffix, and each channel list is separate", () => {
  const radio = [
    buildLineItemId("krusty002", MEDIA_TYPE_ID_CODES.radio, 1),
    buildLineItemId("krusty002", MEDIA_TYPE_ID_CODES.television, 3),
  ]
  assert.equal(nextLineNumber(radio), 4)

  const onlyTelevision = [
    buildLineItemId("krusty002", MEDIA_TYPE_ID_CODES.television, 2),
  ]
  assert.equal(nextLineNumber(onlyTelevision), 3)

  const legacy = [
    "MBA2024ML7",
    buildLineItemId("MBA2024", MEDIA_TYPE_ID_CODES.ooh, 68),
  ]
  assert.equal(nextLineNumber(legacy), 69)
})
