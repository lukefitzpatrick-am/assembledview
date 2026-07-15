import assert from "node:assert/strict"
import test from "node:test"

import { computeBillingOverrideDateBasis } from "../billingOverrideDateBasis.js"
import {
  collectPersistedBillingLineIds,
  diffBillingActivity,
  findStaleDateBasisOverrides,
  formatPreservePriorAlert,
} from "../preservePriorBilling.js"
import type { BillingMonth } from "@/lib/billing/types"

test("diffBillingActivity flags additive new lines while preserving prior", () => {
  const diff = diffBillingActivity({
    persistedLineIds: ["S-1", "billing-search::S-2"],
    incoming: [
      { lineItemId: "S-1", label: "Google Brand", bursts: [] },
      { lineItemId: "S-2", label: "Google Generic", bursts: [] },
      { lineItemId: "S-3", label: "Bing Prospecting", bursts: [] },
    ],
  })
  assert.deepEqual(diff.priorLineIds, ["S-1", "S-2"])
  assert.equal(diff.newActivity.length, 1)
  assert.equal(diff.newActivity[0]!.lineItemId, "S-3")
  assert.equal(diff.isAdditivePreserve, true)
  assert.equal(
    formatPreservePriorAlert(diff),
    "Prior billing preserved; new billing added for Bing Prospecting."
  )
})

test("formatPreservePriorAlert joins multiple new labels", () => {
  const msg = formatPreservePriorAlert({
    priorLineIds: ["A"],
    newActivity: [
      { lineItemId: "B", label: "Meta", bursts: [] },
      { lineItemId: "C", label: "TikTok", bursts: [] },
    ],
    removedLineIds: [],
    isAdditivePreserve: true,
  })
  assert.equal(msg, "Prior billing preserved; new billing added for Meta and TikTok.")
})

test("collectPersistedBillingLineIds strips billing- prefix", () => {
  const months: BillingMonth[] = [
    {
      monthYear: "June 2026",
      mediaTotal: "$0",
      feeTotal: "$0",
      totalAmount: "$0",
      adservingTechFees: "$0",
      production: "$0",
      mediaCosts: {} as BillingMonth["mediaCosts"],
      lineItems: {
        search: [
          {
            id: "billing-search::S-9",
            header1: "G",
            header2: "S",
            monthlyAmounts: {},
            totalAmount: 0,
          },
        ],
      },
    },
  ]
  const ids = collectPersistedBillingLineIds(months)
  assert.equal(ids.has("S-9"), true)
})

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
