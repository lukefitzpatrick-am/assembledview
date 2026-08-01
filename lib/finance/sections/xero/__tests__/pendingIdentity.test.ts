import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  contactSecondaryLine,
  pendingLeadText,
} from "@/lib/finance/sections/xero/pendingIdentity"

describe("pendingLeadText (FIN-7)", () => {
  it("prefers reference over description and invoice number", () => {
    assert.equal(
      pendingLeadText({
        reference: "Hartmann Always On | C25-INCO-0001",
        first_line_description: "YouTube",
        invoice_number: "INV-0930",
      }),
      "Hartmann Always On | C25-INCO-0001"
    )
  })

  it("falls back to first-line description when reference blank", () => {
    assert.equal(
      pendingLeadText({
        reference: "  ",
        first_line_description: "July Meta Ads",
        invoice_number: "INV-1",
      }),
      "July Meta Ads"
    )
  })

  it("falls back to invoice_number when neither reference nor description", () => {
    assert.equal(
      pendingLeadText({
        reference: "",
        first_line_description: null,
        invoice_number: "INV-0947",
      }),
      "INV-0947"
    )
  })

  it("never returns a bare invoice_key — em dash when all blank", () => {
    assert.equal(pendingLeadText({}), "—")
  })
})

describe("contactSecondaryLine (FIN-7)", () => {
  it("shows contact when it differs from billing client_name", () => {
    assert.equal(contactSecondaryLine("Hema Maps", "Hema"), "Hema Maps")
  })

  it("hides contact when same as client_name (case-insensitive)", () => {
    assert.equal(contactSecondaryLine("Jayco Corporation Pty Ltd", "jayco corporation pty ltd"), null)
  })

  it("returns null when contact empty", () => {
    assert.equal(contactSecondaryLine("", "Hema"), null)
  })
})
