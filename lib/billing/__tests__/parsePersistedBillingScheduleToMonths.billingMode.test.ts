import assert from "node:assert/strict"
import test from "node:test"

import { buildBillingScheduleJSON } from "../buildBillingSchedule.js"
import { parsePersistedBillingScheduleToMonths } from "../parsePersistedBillingScheduleToMonths.js"
import type { BillingMonth } from "../types.js"

function emptyMediaCosts(): BillingMonth["mediaCosts"] {
  return {
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
  }
}

test("parsePersistedBillingScheduleToMonths preserves billingMode round-trip", () => {
  const months: BillingMonth[] = [
    {
      monthYear: "May 2026",
      mediaTotal: "$300.00",
      feeTotal: "$0.00",
      totalAmount: "$300.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      mediaCosts: emptyMediaCosts(),
      lineItems: {
        search: [
          {
            id: "billing-search::manual",
            header1: "Google",
            header2: "Manual",
            monthlyAmounts: { "May 2026": 100 },
            totalAmount: 100,
            billingMode: "manual",
          },
          {
            id: "billing-search::auto",
            header1: "Google",
            header2: "Auto",
            monthlyAmounts: { "May 2026": 100 },
            totalAmount: 100,
            billingMode: "auto",
          },
          {
            id: "billing-search::legacy",
            header1: "Google",
            header2: "Legacy",
            monthlyAmounts: { "May 2026": 100 },
            totalAmount: 100,
          },
        ],
      },
    },
  ]

  const serialized = buildBillingScheduleJSON(months)
  const parsed = parsePersistedBillingScheduleToMonths(serialized, { searchFee: 0, socialFee: 0 })
  assert.ok(parsed)

  const items = parsed![0]!.lineItems!.search!
  assert.equal(items.length, 3)
  assert.equal(items[0]!.billingMode, "manual")
  assert.equal(items[1]!.billingMode, "auto")
  assert.equal(Object.hasOwn(items[2]!, "billingMode"), false)
})
