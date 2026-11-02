import assert from "node:assert/strict"
import test from "node:test"

import { computeBillingOverrideDateBasis } from "../billingOverrideDateBasis.js"
import { findStaleDateBasisOverrides } from "../preservePriorBilling.js"

test("findStaleDateBasisOverrides detects burst date drift", async () => {
  const burstsOld = [{ startDate: "2026-06-01", endDate: "2026-06-30" }]
  const burstsNew = [{ startDate: "2026-07-01", endDate: "2026-07-31" }]
  const oldBasis = await computeBillingOverrideDateBasis(burstsOld)
  const stale = await findStaleDateBasisOverrides({
    overrideRows: [
      {
        line_item_id: "S-1",
        component: "media",
        mode: "manual",
        reason: "prepayment",
        date_basis: oldBasis,
        months: [{ month: "2026-06", amount: 1000 }],
      },
    ],
    incoming: [{ lineItemId: "S-1", label: "Google Brand", bursts: burstsNew }],
  })
  assert.equal(stale.length, 1)
  assert.equal(stale[0]!.lineItemId, "S-1")
  assert.equal(stale[0]!.reason, "prepayment")
  assert.notEqual(stale[0]!.currentDateBasis, oldBasis)
})
