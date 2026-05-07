import assert from "node:assert/strict"
import test from "node:test"
import {
  isProductionMediaKey,
  recomputePartialMbaFromSelections,
  sumMediaTotalsExcludingProduction,
} from "../../lib/mediaplan/partialMba.js"
import type { BillingMonth } from "../../lib/billing/types.js"

test("sumMediaTotalsExcludingProduction excludes persisted production labels", () => {
  assert.equal(
    sumMediaTotalsExcludingProduction({
      search: 100,
      production: 50,
      Production: 60,
      mp_production: 70,
    }),
    100,
  )
  assert.equal(isProductionMediaKey("Production"), true)
  assert.equal(isProductionMediaKey("mp_production"), true)
})

test("partial MBA totals count labelled Production once", () => {
  const month: BillingMonth = {
    monthYear: "May 2026",
    mediaTotal: "$100.00",
    feeTotal: "$0.00",
    totalAmount: "$150.00",
    adservingTechFees: "$0.00",
    production: "$50.00",
    mediaCosts: {
      search: "$100.00",
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
      production: "$50.00",
    },
    lineItems: {
      Search: [
        {
          id: "search-1",
          header1: "Search",
          header2: "Always on",
          monthlyAmounts: { "May 2026": 100 },
          totalAmount: 100,
        },
      ],
      Production: [
        {
          id: "production-1",
          header1: "Production",
          header2: "Creative",
          monthlyAmounts: { "May 2026": 50 },
          totalAmount: 50,
        },
      ],
    } as BillingMonth["lineItems"],
  }

  const result = recomputePartialMbaFromSelections({
    deliveryMonthsForBaseline: [month],
    deliveryMonthsForLineItems: [month],
    selectedMonthYears: ["May 2026"],
    selectedLineItemIdsByMedia: {
      Search: ["search-1"],
      Production: ["production-1"],
    },
    mediaKeys: ["search"],
    enabledMedia: { search: true },
    mediaLabelByKey: { search: "Search" },
    formatCurrency: (n) => `$${n.toFixed(2)}`,
  })

  assert.equal(result.values.grossMedia, 100)
  assert.equal(result.values.production, 50)
  assert.equal(result.metadata.totals.totalInvestment, "$150.00")
})
