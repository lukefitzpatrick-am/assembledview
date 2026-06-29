import assert from "node:assert/strict"
import test from "node:test"

import type { BillingMonth } from "@/lib/billing/types"
import { applyBillingLineMode } from "../applyBillingLineMode.js"

function month(lineItems: BillingMonth["lineItems"]): BillingMonth {
  return {
    monthYear: "May 2026",
    mediaTotal: "$0.00",
    feeTotal: "$0.00",
    totalAmount: "$0.00",
    adservingTechFees: "$0.00",
    production: "$0.00",
    mediaCosts: {
      search: "$0.00",
      socialMedia: "$0.00",
      television: "$0.00",
      radio: "$0.00",
      newspaper: "$0.00",
      magazines: "$0.00",
      ooh: "$0.00",
      cinema: "$0.00",
      digiDisplay: "$0.00",
      digiAudio: "$0.00",
      digiVideo: "$0.00",
      bvod: "$0.00",
      integration: "$0.00",
      progDisplay: "$0.00",
      progVideo: "$0.00",
      progBvod: "$0.00",
      progAudio: "$0.00",
      progOoh: "$0.00",
      influencers: "$0.00",
      production: "$0.00",
    },
    lineItems,
  }
}

test("manual mode stamps legacy sibling lines to explicit auto", () => {
  const result = applyBillingLineMode(
    [
      month({
        search: [
          {
            id: "billing-search::manual",
            header1: "Google",
            header2: "Brand",
            monthlyAmounts: { "May 2026": 100 },
            totalAmount: 100,
          },
          {
            id: "billing-search::sibling",
            header1: "Google",
            header2: "Generic",
            monthlyAmounts: { "May 2026": 50 },
            totalAmount: 50,
          },
        ],
      }),
    ],
    "billing-search::manual",
    "manual"
  )

  const items = result[0]!.lineItems!.search!
  assert.equal(items[0]!.billingMode, "manual")
  assert.equal(items[1]!.billingMode, "auto")
})

test("auto mode only sets the target line", () => {
  const result = applyBillingLineMode(
    [
      month({
        search: [
          {
            id: "billing-search::manual",
            header1: "Google",
            header2: "Brand",
            monthlyAmounts: { "May 2026": 100 },
            totalAmount: 100,
            billingMode: "manual",
          },
          {
            id: "billing-search::legacy",
            header1: "Google",
            header2: "Generic",
            monthlyAmounts: { "May 2026": 50 },
            totalAmount: 50,
          },
        ],
      }),
    ],
    "billing-search::manual",
    "auto"
  )

  const items = result[0]!.lineItems!.search!
  assert.equal(items[0]!.billingMode, "auto")
  assert.equal(items[1]!.billingMode, undefined)
})
