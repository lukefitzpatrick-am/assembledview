import assert from "node:assert/strict"
import test from "node:test"

import { computeCampaignFinancials } from "../computeCampaignFinancials.js"
import { panelIndicatorsFromCampaignFinancials } from "../panelIndicatorsFromCampaignFinancials.js"
import type { LineItemInput } from "../campaignFinancials.types.js"

function searchLine(overrides?: Partial<LineItemInput>): LineItemInput {
  return {
    lineItemId: "billing-search::S1",
    mediaType: "search",
    buyType: "cpc",
    rate: 1,
    enteredAmount: 1000,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: 10,
    bursts: [
      {
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        budget: 1000,
        buyAmount: 1,
      },
    ],
    approval: "approved",
    ...overrides,
  }
}

test("panel indicators: no overrides → only quiet billable=MBA ticks", () => {
  const financials = computeCampaignFinancials([searchLine()], { feeLoading: {} })
  const indicators = panelIndicatorsFromCampaignFinancials(financials)

  assert.equal(indicators.mbaDetails.billableEqualsMba, true)
  assert.equal(indicators.billingSchedule.billableEqualsMba, true)
  assert.equal(indicators.mbaDetails.partialLabel, null)
  assert.equal(indicators.billingSchedule.titlePills.length, 0)
  assert.equal(indicators.billingSchedule.editBillingHasOverride, false)
  assert.equal(Object.keys(indicators.billingSchedule.byMonth).length, 0)
})

test("panel indicators: manual + fee override surface pills and amber Edit Billing", () => {
  const financials = computeCampaignFinancials(
    [
      searchLine({
        billingOverride: {
          mode: "manual",
          reason: "prepayment",
          months: [{ month: "2026-06", amount: 1000 }],
          dateBasis: "2026-06-01|2026-06-30",
        },
        feeOverride: {
          mode: "manual",
          reason: "manual",
          months: [{ month: "2026-06", amount: 50 }],
          dateBasis: "2026-06-01|2026-06-30",
          component: "fee",
        },
      }),
    ],
    { feeLoading: {} }
  )
  const indicators = panelIndicatorsFromCampaignFinancials(financials)

  assert.equal(indicators.mbaDetails.byMediaType.search?.manual, true)
  assert.equal(indicators.mbaDetails.byMediaType.search?.feeAdjusted, true)
  assert.ok(indicators.billingSchedule.titlePills.some((p) => p.key === "manual-count"))
  assert.equal(indicators.billingSchedule.editBillingHasOverride, true)
  assert.equal(indicators.mbaDetails.mbaFeeAdjusted, true)
})

test("panel indicators: clientPays on media-type row when any in-scope line is client-pays", () => {
  const financials = computeCampaignFinancials(
    [
      searchLine({
        lineItemId: "billing-search::CP",
        clientPaysForMedia: true,
        feePct: 20,
      }),
    ],
    { feeLoading: {} }
  )
  const indicators = panelIndicatorsFromCampaignFinancials(financials)

  assert.equal(indicators.mbaDetails.byMediaType.search?.clientPays, true)
  assert.equal(indicators.mbaDetails.byMediaType.search?.manual, false)
})

test("panel indicators: clientPays false when only excluded lines are client-pays", () => {
  const financials = computeCampaignFinancials(
    [
      searchLine({
        lineItemId: "billing-search::IN",
        clientPaysForMedia: false,
      }),
      searchLine({
        lineItemId: "billing-search::OUT",
        clientPaysForMedia: true,
        approval: "excluded",
        enteredAmount: 500,
        bursts: [
          {
            startDate: "2026-06-01",
            endDate: "2026-06-30",
            budget: 500,
            buyAmount: 1,
          },
        ],
      }),
    ],
    { feeLoading: {} }
  )
  const indicators = panelIndicatorsFromCampaignFinancials(financials)

  assert.equal(indicators.mbaDetails.byMediaType.search?.clientPays, false)
})

test("panel indicators: partial scope amber label X of Y", () => {
  const financials = computeCampaignFinancials(
    [
      searchLine({ lineItemId: "billing-search::A", approval: "approved" }),
      searchLine({
        lineItemId: "billing-search::B",
        approval: "excluded",
        enteredAmount: 500,
        bursts: [
          {
            startDate: "2026-06-01",
            endDate: "2026-06-30",
            budget: 500,
            buyAmount: 1,
          },
        ],
      }),
    ],
    { feeLoading: {} }
  )
  const indicators = panelIndicatorsFromCampaignFinancials(financials, {
    isPartialMBA: true,
  })

  assert.equal(indicators.mbaDetails.partialLabel, "Partial MBA · 1 of 2")
})
