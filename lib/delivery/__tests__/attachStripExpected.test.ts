import assert from "node:assert/strict"
import { test } from "node:test"

import { resolveCampaignExpectedSpendToDate } from "@/lib/spend/resolveCampaignExpectedSpend"
import { resolveMonthlySpendForPlan } from "@/lib/spend/monthlyPlanCalendar"

import { attachStripExpected } from "../attachStripExpected"

test("campaign-read expected equals the strip resolver for the same inputs", () => {
  const campaignStartISO = "2026-08-01"
  const campaignEndISO = "2026-10-25"
  const deliverySchedule = [
    {
      month: "August 2026",
      mediaCosts: { social: "$20,000.00", "programmatic video": "$30,000.00" },
      mediaTotal: "$50,000.00",
      feeTotal: "$0.00",
      totalAmount: "$50,000.00",
    },
    {
      month: "September 2026",
      mediaCosts: { social: "$20,000.00", "programmatic video": "$20,000.00" },
      mediaTotal: "$40,000.00",
      feeTotal: "$0.00",
      totalAmount: "$40,000.00",
    },
    {
      month: "October 2026",
      mediaCosts: { social: "$6,201.00", "programmatic video": "$6,201.00" },
      mediaTotal: "$12,402.00",
      feeTotal: "$0.00",
      totalAmount: "$12,402.00",
    },
  ]
  const stripInputs = {
    billingSchedule: [],
    deliverySchedule,
    monthlySpend: resolveMonthlySpendForPlan(undefined, undefined, deliverySchedule),
    campaignStartISO,
    campaignEndISO,
    monthlyOpts: { campaignStartISO, campaignEndISO },
  }
  const stripExpected = resolveCampaignExpectedSpendToDate(stripInputs)
  const readExpected = attachStripExpected({
    stripInputs,
    deliveredSpendToDate: 53_785,
    asOf: "2026-09-18",
  })

  assert.equal(readExpected.expectedSpendToDate, stripExpected)
  assert.ok(stripExpected > 0)
  assert.equal(readExpected.daysInCampaign, 86)
  assert.equal(readExpected.daysElapsed, 49)
})
