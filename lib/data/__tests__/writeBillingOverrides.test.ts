import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { BillingOverrideWriteError } from "../writeBillingOverrides"

describe("BillingOverrideWriteError", () => {
  it("carries NOT_FOUND / BAD_REQUEST codes for route mapping", () => {
    const missing = new BillingOverrideWriteError("NOT_FOUND", "gone")
    assert.equal(missing.code, "NOT_FOUND")
    assert.equal(missing.message, "gone")

    const bad = new BillingOverrideWriteError("BAD_REQUEST", "need months")
    assert.equal(bad.code, "BAD_REQUEST")
  })
})
