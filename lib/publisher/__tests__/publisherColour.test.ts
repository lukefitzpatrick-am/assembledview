import assert from "node:assert/strict"
import test from "node:test"
import {
  PUBLISHER_COLOUR_INVALID_FALLBACK,
  parsePublisherColour,
} from "../publisherColour.js"

test("parsePublisherColour accepts #rgb and #rrggbb only", () => {
  assert.deepEqual(parsePublisherColour("#abc"), {
    ok: true,
    hex: "#aabbcc",
  })
  assert.deepEqual(parsePublisherColour("#FF0000"), {
    ok: true,
    hex: "#ff0000",
  })
})

test("parsePublisherColour returns documented fallback for invalid or empty input (never coerces)", () => {
  assert.deepEqual(parsePublisherColour(null), {
    ok: false,
    reason: "empty",
    fallback: PUBLISHER_COLOUR_INVALID_FALLBACK,
  })
  assert.deepEqual(parsePublisherColour(""), {
    ok: false,
    reason: "empty",
    fallback: PUBLISHER_COLOUR_INVALID_FALLBACK,
  })
  assert.deepEqual(parsePublisherColour("olive"), {
    ok: false,
    reason: "invalid",
    fallback: PUBLISHER_COLOUR_INVALID_FALLBACK,
  })
  assert.deepEqual(parsePublisherColour("not-a-hex"), {
    ok: false,
    reason: "invalid",
    fallback: PUBLISHER_COLOUR_INVALID_FALLBACK,
  })
  assert.deepEqual(parsePublisherColour("ff0000"), {
    ok: false,
    reason: "invalid",
    fallback: PUBLISHER_COLOUR_INVALID_FALLBACK,
  })
  assert.equal(PUBLISHER_COLOUR_INVALID_FALLBACK, null)
})
