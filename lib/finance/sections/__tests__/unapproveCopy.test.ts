import assert from "node:assert/strict"
import test from "node:test"

import {
  unapproveConfirmCopy,
  unapproveFailureToast,
} from "../unapproveCopy.js"
import { FinanceHttpError } from "../../api.js"

test("confirm names client, month and amount", () => {
  const copy = unapproveConfirmCopy({
    clientName: "BIC",
    billingMonth: "2026-07",
    amountDollars: 2625,
  })
  assert.match(copy.title, /Un-approve/i)
  assert.match(copy.description, /BIC/)
  assert.match(copy.description, /July 2026/)
  assert.match(copy.description, /\$2,625/)
})

test("already-exported 409 is the reason, not a generic failed toast", () => {
  const fromBody = unapproveFailureToast({
    ok: false,
    errors: [{ invoice_key: "media:BIC001:2026-07", error: "already_exported", status: 409 }],
  })
  assert.notEqual(fromBody.title.toLowerCase(), "failed")
  assert.match(fromBody.title, /sent to finance|exported/i)
  assert.ok(fromBody.description.length > 0)
  assert.equal(fromBody.variant, undefined)

  const fromHttp = unapproveFailureToast(
    new FinanceHttpError(
      409,
      "This invoice has been exported. Amend the schedule and re-approve instead of unapproving.",
      "/api/finance/billing/unapprove"
    )
  )
  assert.match(fromHttp.title, /sent to finance|exported/i)
  assert.match(fromHttp.description, /exported/i)
  assert.doesNotMatch(fromHttp.title, /failed/i)
})
