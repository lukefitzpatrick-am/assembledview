import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { projectXeroArToBillingAmounts } from "../projectBillingAmounts"

describe("projectXeroArToBillingAmounts", () => {
  it("projects sub_total, not total, when the three Xero columns differ", () => {
    // Xero Total is GST-inclusive. Verified: total = sub_total + total_tax.
    const fixture = {
      sub_total: 9574.11,
      total_tax: 957.41,
      total: 10531.52,
    }
    const projected = projectXeroArToBillingAmounts(fixture.sub_total)
    assert.equal(projected.totalDollars, 9574.11)
    assert.equal(projected.billedAmountCents, 957411)
    assert.notEqual(projected.totalDollars, fixture.total)
    assert.notEqual(projected.billedAmountCents, 1053152)
  })
})
