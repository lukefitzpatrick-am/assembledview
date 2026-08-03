import assert from "node:assert/strict"
import test from "node:test"

import { resolveManualBillingLineItemAmount } from "../resolveManualBillingLineItemAmount.js"
import type { BillingMonth } from "../types.js"

const emptyMediaCosts = (): BillingMonth["mediaCosts"] => ({
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
  progBvod: "$10,163.93",
  progAudio: "$0.00",
  progOoh: "$0.00",
  influencers: "$0.00",
  production: "$0.00",
})

test("getLineItemAmount matches bare persisted id when scope uses billing- prefix", () => {
  const months: BillingMonth[] = [
    {
      monthYear: "August 2026",
      mediaTotal: "$10,163.93",
      feeTotal: "$2,540.98",
      totalAmount: "$12,704.91",
      adservingTechFees: "$0.00",
      production: "$0.00",
      mediaCosts: emptyMediaCosts(),
      lineItems: {
        progBvod: [
          {
            id: "supabase001PB1",
            header1: "progBvod",
            header2: "supabase001PB1",
            monthlyAmounts: { "August 2026": 10163.93, "September 2026": 9836.07 },
            totalAmount: 20000,
          },
        ],
      },
    },
  ]

  const amount = resolveManualBillingLineItemAmount(
    months,
    "progBvod",
    "billing-progBvod::supabase001PB1",
    "August 2026"
  )
  assert.equal(amount, 10163.93)
})

test("getLineItemAmount prefers non-zero bare row over injected $0 decorated duplicate", () => {
  const months: BillingMonth[] = [
    {
      monthYear: "August 2026",
      mediaTotal: "$10,163.93",
      feeTotal: "$2,540.98",
      totalAmount: "$12,704.91",
      adservingTechFees: "$0.00",
      production: "$0.00",
      mediaCosts: emptyMediaCosts(),
      lineItems: {
        progBvod: [
          {
            id: "billing-progBvod::supabase001PB1",
            header1: "progBvod",
            header2: "supabase001PB1",
            monthlyAmounts: { "August 2026": 0, "September 2026": 0 },
            totalAmount: 0,
          },
          {
            id: "supabase001PB1",
            header1: "progBvod",
            header2: "supabase001PB1",
            monthlyAmounts: { "August 2026": 10163.93, "September 2026": 9836.07 },
            totalAmount: 20000,
          },
        ],
      },
    },
  ]

  const amount = resolveManualBillingLineItemAmount(
    months,
    "progBvod",
    "billing-progBvod::supabase001PB1",
    "August 2026"
  )
  assert.equal(amount, 10163.93)
})
