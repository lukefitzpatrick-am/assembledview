import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  costsDeltaCents,
  xeroApExGstCents,
} from "../costsApAmount"

describe("costs AP billed vs booked delta", () => {
  it("computes Delta on sub_total when AP total and sub_total differ", () => {
    const bookedCents = 10000
    const bill = { total: 110, sub_total: 100, total_tax: 10 }
    const apOnTotal = xeroApExGstCents(bill.total)
    const apOnSubTotal = xeroApExGstCents(bill.sub_total)
    assert.equal(apOnSubTotal, 10000)
    assert.equal(apOnTotal, 11000)
    assert.equal(costsDeltaCents(bookedCents, apOnSubTotal), 0)
    assert.equal(costsDeltaCents(bookedCents, apOnTotal), -1000)
  })
})
