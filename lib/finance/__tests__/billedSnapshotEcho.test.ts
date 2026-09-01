import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { billedSnapshotAmountEchoOk } from "../billedSnapshotEcho"
import { dollarsToCents } from "@/lib/xero/money"

describe("billedSnapshotAmountEchoOk", () => {
  it("a 3dp total round-trips through cents reconstitution and the echo passes", () => {
    const billedAmount = 10.123
    const storedCents = dollarsToCents(billedAmount)
    const echoedDollars = storedCents / 100
    assert.notEqual(echoedDollars, billedAmount)
    assert.equal(billedSnapshotAmountEchoOk(echoedDollars, billedAmount), true)
    assert.equal(Math.round(billedAmount * 100), Math.round(echoedDollars * 100))
  })

  it("rejects a non-finite echo", () => {
    assert.equal(billedSnapshotAmountEchoOk("nope", 10), false)
  })
})
