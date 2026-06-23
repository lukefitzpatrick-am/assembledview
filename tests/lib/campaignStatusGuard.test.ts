import assert from "node:assert/strict"
import test from "node:test"
import {
  getDraftReturnRejection,
} from "../../lib/mediaplan/campaignStatusGuard.js"

test("rejects returning a persisted non-Draft campaign to Draft", () => {
  assert.deepEqual(
    getDraftReturnRejection(" Approved ", " draft "),
    {
      error: "A campaign cannot be returned to Draft once it has left Draft.",
      status: 422,
    }
  )
})

test("allows Draft-origin and non-Draft status changes", () => {
  assert.equal(getDraftReturnRejection("Draft", "draft"), null)
  assert.equal(getDraftReturnRejection("approved", "planned"), null)
  assert.equal(getDraftReturnRejection("booked", "cancelled"), null)
  assert.equal(getDraftReturnRejection("completed", undefined), null)
})
