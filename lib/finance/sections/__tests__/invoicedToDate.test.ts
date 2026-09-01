import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { INVOICED_TO_DATE_BASIS } from "../invoicedToDate"

describe("invoicedToDate", () => {
  it("captions the tile as Xero AR ex-GST", () => {
    assert.equal(INVOICED_TO_DATE_BASIS, "Invoiced = Xero AR, ex-GST")
  })
})
