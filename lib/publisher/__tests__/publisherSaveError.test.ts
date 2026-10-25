import assert from "node:assert/strict"
import test from "node:test"

import { readPublisherSaveError } from "@/lib/publisher/publisherSaveError"

function res(body: unknown, throws = false) {
  return {
    json: async () => {
      if (throws) throw new Error("not json")
      return body
    },
  }
}

test("409 duplicate gives field errors and the API message", async () => {
  const out = await readPublisherSaveError(
    res({
      error: "Publisher name taken.",
      code: "PUBLISHER_IDENTITY_CONFLICT",
      fieldErrors: { publisher_name: "Publisher name taken.", publisherid: "", other: "x" },
    }),
    "Failed",
  )
  assert.equal(out.message, "Publisher name taken.")
  assert.deepEqual(out.fieldErrors, { publisher_name: "Publisher name taken." })
})

test("non-JSON body falls back", async () => {
  const out = await readPublisherSaveError(res(null, true), "Failed to update publisher")
  assert.deepEqual(out, { message: "Failed to update publisher", fieldErrors: {} })
})

test("500 with message only uses the message", async () => {
  const out = await readPublisherSaveError(res({ message: "db down" }), "Failed")
  assert.equal(out.message, "db down")
})
