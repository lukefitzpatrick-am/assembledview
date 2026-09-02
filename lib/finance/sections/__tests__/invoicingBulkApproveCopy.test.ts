import assert from "node:assert/strict"
import test from "node:test"
import { formatAUD } from "../../../format/money.js"
import {
  INVOICING_EXCEL_DISABLED_REASON,
  invoicingBulkApproveButtonLabel,
  invoicingBulkApproveConfirmCopy,
} from "../invoicingBulkApproveCopy.js"

test("bulk approve confirm names the count and the amount", () => {
  const copy = invoicingBulkApproveConfirmCopy({
    count: 51,
    amountDollars: 512_000,
    monthLabel: "July 2026",
  })
  assert.equal(copy.title, "Approve ready invoices?")
  assert.ok(copy.description.includes("51 invoices"))
  assert.ok(copy.description.includes(formatAUD(512_000)))
  assert.ok(copy.description.includes("July 2026"))
  assert.equal(invoicingBulkApproveButtonLabel(51), "Approve ready (51)")
  assert.equal(invoicingBulkApproveButtonLabel(0), "Approve ready")
})

test("Excel disabled reason is the former floating caption", () => {
  assert.equal(INVOICING_EXCEL_DISABLED_REASON, "Only approved invoices export.")
})
