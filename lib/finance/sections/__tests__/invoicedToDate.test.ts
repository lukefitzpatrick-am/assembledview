import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  INVOICED_TO_DATE_BASIS,
  qualifiesForInvoicedToDate,
  sumInvoicedToDateCents,
} from "../invoicedToDate"

describe("invoicedToDate", () => {
  it("ignores a media: billed row and counts a xero: one", () => {
    const media = {
      invoice_key: "media:BICAU003:2026-06",
      billed: true,
      billed_amount_cents: 291667,
    }
    const xero = {
      invoice_key: "xero:INV-FY26-1",
      billed: true,
      billed_amount_cents: 10000,
    }
    assert.equal(qualifiesForInvoicedToDate(media), false)
    assert.equal(qualifiesForInvoicedToDate(xero), true)
    assert.equal(sumInvoicedToDateCents([media, xero]), 10000)
  })

  it("captions the tile as Xero AR ex-GST", () => {
    assert.equal(INVOICED_TO_DATE_BASIS, "Invoiced = Xero AR, ex-GST")
  })
})
