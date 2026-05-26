import assert from "node:assert/strict"
import test from "node:test"

import type { BillingBurst } from "@/lib/billing/types"
import { computeDerivedCampaignFeeAmount } from "../computeDerivedCampaignFeeAmount.js"
import type { SeedLineFeesMediaConfig } from "../seedLineFees.js"

function line(id: string, bursts: unknown[], clientPays = false) {
  return {
    line_item_id: id,
    client_pays_for_media: clientPays,
    bursts_json: bursts,
  }
}

function containerBurst(feeAmount: number): BillingBurst {
  return {
    startDate: new Date("2026-05-01"),
    endDate: new Date("2026-05-31"),
    mediaAmount: 0,
    feeAmount,
    totalAmount: 0,
    mediaType: "progDisplay",
    noAdserving: false,
    feePercentage: 20,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    deliverables: 0,
    buyType: "cpm",
  }
}

test("single line, single burst → returns that burst's feeAmount", () => {
  const configs: SeedLineFeesMediaConfig[] = [
    {
      billingKey: "progDisplay",
      lineItems: [line("pd1", [{ startDate: "2026-05-01", endDate: "2026-05-31", feeAmount: 2000 }])],
      containerBursts: [containerBurst(2000)],
    },
  ]
  const result = computeDerivedCampaignFeeAmount(configs)
  assert.equal(result.totalFeeAmount, 2000)
  assert.equal(result.perLineBreakdown.length, 1)
  assert.equal(result.perLineBreakdown[0]!.feeAmount, 2000)
})

test("multiple lines, multiple bursts → sums all", () => {
  const configs: SeedLineFeesMediaConfig[] = [
    {
      billingKey: "search",
      lineItems: [
        line("se1", [{ startDate: "2026-05-01", endDate: "2026-05-31", feeAmount: 4500 }]),
        line("se2", [
          { startDate: "2026-05-01", endDate: "2026-05-15", feeAmount: 500 },
          { startDate: "2026-05-16", endDate: "2026-05-31", feeAmount: 300 },
        ]),
      ],
      containerBursts: [containerBurst(4500), containerBurst(500), containerBurst(300)],
    },
  ]
  const result = computeDerivedCampaignFeeAmount(configs)
  assert.equal(result.totalFeeAmount, 5300)
  assert.equal(result.perLineBreakdown.length, 2)
})

test("includes client_pays_for_media line in total", () => {
  const configs: SeedLineFeesMediaConfig[] = [
    {
      billingKey: "progDisplay",
      lineItems: [
        line("pd1", [{ startDate: "2026-05-01", endDate: "2026-05-31", feeAmount: 2000 }], false),
        line("pd2", [{ startDate: "2026-05-12", endDate: "2026-06-30", feeAmount: 2000 }], true),
      ],
      containerBursts: [containerBurst(2000), containerBurst(2000)],
    },
  ]
  const result = computeDerivedCampaignFeeAmount(configs)
  assert.equal(result.totalFeeAmount, 4000)
})

test("empty configs → returns 0", () => {
  const result = computeDerivedCampaignFeeAmount([])
  assert.equal(result.totalFeeAmount, 0)
  assert.equal(result.perLineBreakdown.length, 0)
})

test("disabled media config (empty lineItems) → excluded from total", () => {
  const configs: SeedLineFeesMediaConfig[] = [
    {
      billingKey: "search",
      lineItems: [line("se1", [{ startDate: "2026-05-01", endDate: "2026-05-31", feeAmount: 100 }])],
      containerBursts: [containerBurst(100)],
    },
    {
      billingKey: "progDisplay",
      lineItems: [],
      containerBursts: [containerBurst(9999)],
    },
  ]
  const result = computeDerivedCampaignFeeAmount(configs)
  assert.equal(result.totalFeeAmount, 100)
  assert.equal(result.perLineBreakdown.length, 1)
})

test("per-line breakdown matches input line IDs", () => {
  const configs: SeedLineFeesMediaConfig[] = [
    {
      billingKey: "progDisplay",
      lineItems: [
        line("glendaPD1", [{ startDate: "2026-05-01", endDate: "2026-05-31", feeAmount: 2000 }]),
        line("glendaPD2", [{ startDate: "2026-05-12", endDate: "2026-06-30", feeAmount: 2000 }], true),
      ],
      containerBursts: [containerBurst(2000), containerBurst(2000)],
    },
  ]
  const result = computeDerivedCampaignFeeAmount(configs)
  const ids = result.perLineBreakdown.map((r) => r.billingStableLineItemId).sort()
  assert.deepEqual(ids, [
    "billing-progDisplay::glendaPD1",
    "billing-progDisplay::glendaPD2",
  ])
})
