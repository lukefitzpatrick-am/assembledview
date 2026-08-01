import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  readFail,
  readOk,
  toReadResult,
  unwrapReadOrThrow,
} from "../readResult"

describe("ReadResult helpers", () => {
  it("toReadResult maps throw → fail (never empty data)", async () => {
    const result = await toReadResult(async () => {
      throw new Error("connection refused")
    }, "read failed")
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.match(result.error, /connection refused/)
    }
  })

  it("toReadResult maps success → ok with data", async () => {
    const result = await toReadResult(async () => [1, 2])
    assert.equal(result.ok, true)
    if (result.ok) assert.deepEqual(result.data, [1, 2])
  })

  it("unwrapReadOrThrow rethrows failures", () => {
    assert.throws(
      () => unwrapReadOrThrow(readFail("db down")),
      /db down/
    )
    assert.deepEqual(unwrapReadOrThrow(readOk({ a: 1 })), { a: 1 })
  })
})
