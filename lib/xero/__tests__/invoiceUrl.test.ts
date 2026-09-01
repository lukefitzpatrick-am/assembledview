import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { xeroArInvoiceViewUrl } from "../invoiceUrl"

describe("xero AR deep link", () => {
  it("constructs the classic AccountsReceivable view URL from the invoice GUID", () => {
    const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    assert.equal(
      xeroArInvoiceViewUrl(id),
      `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${id}`
    )
  })

  it("returns null when the id is blank", () => {
    assert.equal(xeroArInvoiceViewUrl(""), null)
    assert.equal(xeroArInvoiceViewUrl("   "), null)
  })
})
