import assert from "node:assert/strict"
import test from "node:test"

import { computeCampaignFinancials } from "../../finance/computeCampaignFinancials.js"
import type { LineItemInput } from "../../finance/campaignFinancials.types.js"
import {
  CAMPAIGN_BUDGET_REMAINING_BASIS_CAPTION,
  createPageBudgetRemaining,
  editPageBudgetRemaining,
  isCampaignBudgetOverspend,
  totalInvestmentAllocatedFromMbaScope,
} from "../campaignBudgetRemaining.js"

test("allocated total investment is nettExGst, not grossMedia", () => {
  const mbaScopeTotals = {
    grossMedia: 9_000,
    fee: 1_200,
    adServing: 0,
    production: 0,
    nettExGst: 10_200,
  }
  assert.equal(totalInvestmentAllocatedFromMbaScope(mbaScopeTotals), 10_200)
  assert.notEqual(
    totalInvestmentAllocatedFromMbaScope(mbaScopeTotals),
    mbaScopeTotals.grossMedia
  )
})

test("create and edit budgetRemaining match for the same plan inputs", () => {
  const campaignBudget = 10_000
  const mbaScopeTotals = {
    grossMedia: 9_000,
    fee: 1_200,
    adServing: 0,
    production: 0,
    nettExGst: 10_200,
  }
  // Edit wires totalInvestment from nettExGst (edit page effect).
  const totalInvestment = mbaScopeTotals.nettExGst

  const createRemaining = createPageBudgetRemaining(campaignBudget, mbaScopeTotals)
  const editRemaining = editPageBudgetRemaining(campaignBudget, totalInvestment)

  assert.equal(createRemaining, editRemaining)
  assert.equal(createRemaining, -200)
})

test("grossMedia under budget but nettExGst over → overspend on BOTH pages", () => {
  const campaignBudget = 10_000
  const mbaScopeTotals = {
    grossMedia: 9_000, // under budget
    fee: 1_200,
    adServing: 0,
    production: 0,
    nettExGst: 10_200, // over budget
  }
  assert.ok(mbaScopeTotals.grossMedia < campaignBudget)
  assert.ok(mbaScopeTotals.nettExGst > campaignBudget)

  const createRemaining = createPageBudgetRemaining(campaignBudget, mbaScopeTotals)
  const editRemaining = editPageBudgetRemaining(campaignBudget, mbaScopeTotals.nettExGst)

  assert.equal(createRemaining, editRemaining)
  assert.equal(isCampaignBudgetOverspend(createRemaining), true)
  assert.equal(isCampaignBudgetOverspend(editRemaining), true)
  // Old create bug (budget − grossMedia) would have falsely read as on-budget:
  const legacyCreateRemaining = campaignBudget - mbaScopeTotals.grossMedia
  assert.equal(isCampaignBudgetOverspend(legacyCreateRemaining), false)
})

test("DRAFT SUMMARY basis caption names total investment ex GST", () => {
  assert.equal(CAMPAIGN_BUDGET_REMAINING_BASIS_CAPTION, "total investment, ex GST")
})

test("net-entered media + stacked fee can produce a real sub-dollar overspend residual", () => {
  // Offline composition from mba-editor diagnosis: two net lines @ 12% stacked fee
  // against budget 42653 → nettExGst 42653.33 → remaining −0.33.
  const lines: LineItemInput[] = [
    {
      lineItemId: "A1",
      mediaType: "search",
      buyType: "cpc",
      rate: 1,
      enteredAmount: 5_000,
      budgetIncludesFees: false,
      clientPaysForMedia: false,
      feePct: 12,
      bursts: [
        {
          startDate: "2026-05-01",
          endDate: "2026-05-31",
          budget: 5_000,
          buyAmount: 1,
        },
      ],
      approval: "approved",
    },
    {
      lineItemId: "A2",
      mediaType: "search",
      buyType: "cpc",
      rate: 1,
      enteredAmount: 32_534.93,
      budgetIncludesFees: false,
      clientPaysForMedia: false,
      feePct: 12,
      bursts: [
        {
          startDate: "2026-05-01",
          endDate: "2026-05-31",
          budget: 32_534.93,
          buyAmount: 1,
        },
      ],
      approval: "approved",
    },
  ]

  const result = computeCampaignFinancials(lines, { feeLoading: { feesearch: 12 } })
  const campaignBudget = 42_653
  const remaining = createPageBudgetRemaining(campaignBudget, result.mbaScopeTotals)
  const editRemaining = editPageBudgetRemaining(
    campaignBudget,
    result.mbaScopeTotals.nettExGst
  )

  assert.equal(remaining, editRemaining)
  assert.equal(result.mbaScopeTotals.nettExGst, 42_653.33)
  assert.equal(remaining, -0.33)
  assert.equal(isCampaignBudgetOverspend(remaining), true)
  // Composition for the residual report:
  // grossMedia + fee (+ ads/prod) → nettExGst; remaining is exact cents, not float dust.
  assert.equal(result.mbaScopeTotals.adServing, 0)
  assert.equal(result.mbaScopeTotals.production, 0)
  assert.equal(
    result.mbaScopeTotals.nettExGst,
    Math.round(
      (result.mbaScopeTotals.grossMedia + result.mbaScopeTotals.fee) * 100
    ) / 100
  )
})
