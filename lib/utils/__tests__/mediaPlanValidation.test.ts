import assert from "node:assert/strict"
import test from "node:test"

import { checkLineItemDatesOutsideCampaign } from "@/lib/utils/mediaPlanValidation"

/** Campaign window: 2 Jul – 30 Sep 2026 (matches reported production false positive). */
const CAMPAIGN_START = new Date(2026, 6, 2)
const CAMPAIGN_END = new Date(2026, 8, 30)

/**
 * Shape emitted by ProductionContainer.apiLineItems → productionMediaLineItems:
 * bursts[] with YYYY-MM-DD strings from formatDateString + formatProductionBurstForPersist.
 */
function productionApiLineItem(startDate: string, endDate: string) {
  return {
    media_type: "Print",
    bursts: [
      {
        cost: 1500,
        amount: 1,
        budget: "1500",
        buyAmount: "1",
        calculatedValue: 1,
        startDate,
        endDate,
      },
    ],
  }
}

test("production burst on campaign start/end passes when dates use local YYYY-MM-DD emit", () => {
  const result = checkLineItemDatesOutsideCampaign({
    campaignStart: CAMPAIGN_START,
    campaignEnd: CAMPAIGN_END,
    mediaLineItems: {},
    productionLineItems: [productionApiLineItem("2026-07-02", "2026-09-30")],
  })

  assert.equal(result.hasViolation, false)
  assert.equal(result.offendingCount, 0)
})

test("production burst inside campaign window passes", () => {
  const result = checkLineItemDatesOutsideCampaign({
    campaignStart: CAMPAIGN_START,
    campaignEnd: CAMPAIGN_END,
    mediaLineItems: {},
    productionLineItems: [productionApiLineItem("2026-07-15", "2026-08-15")],
  })

  assert.equal(result.hasViolation, false)
  assert.equal(result.offendingCount, 0)
})

test("production burst starting before campaign window fails", () => {
  const result = checkLineItemDatesOutsideCampaign({
    campaignStart: CAMPAIGN_START,
    campaignEnd: CAMPAIGN_END,
    mediaLineItems: {},
    productionLineItems: [productionApiLineItem("2026-06-30", "2026-07-10")],
  })

  assert.equal(result.hasViolation, true)
  assert.equal(result.offendingCount, 1)
})

test("production burst ending after campaign window fails", () => {
  const result = checkLineItemDatesOutsideCampaign({
    campaignStart: CAMPAIGN_START,
    campaignEnd: CAMPAIGN_END,
    mediaLineItems: {},
    productionLineItems: [productionApiLineItem("2026-09-01", "2026-10-01")],
  })

  assert.equal(result.hasViolation, true)
  assert.equal(result.offendingCount, 1)
})
