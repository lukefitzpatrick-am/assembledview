import assert from "node:assert/strict"
import test from "node:test"

import { computeCampaignFinancials } from "@/lib/finance/computeCampaignFinancials"
import type { LineItemInput } from "@/lib/finance/campaignFinancials.types"
import { channelSummaryTotals } from "@/lib/money/burst"
import { toCents } from "@/lib/money/cents"

const FEE = 15
const START = "2026-03-02"
const END = "2026-03-20"

type MixedLine = {
  id: string
  buyType: string
  budgetIncludesFees: boolean
  clientPaysForMedia: boolean
  budget: string
}

const mixed: MixedLine[] = [
  { id: "gross", buyType: "cpm", budgetIncludesFees: true, clientPaysForMedia: false, budget: "$1,000.00" },
  { id: "net", buyType: "cpm", budgetIncludesFees: false, clientPaysForMedia: false, budget: "1000" },
  { id: "client", buyType: "cpm", budgetIncludesFees: false, clientPaysForMedia: true, budget: "1000" },
  { id: "bonus", buyType: "bonus", budgetIncludesFees: false, clientPaysForMedia: false, budget: "1000" },
  { id: "inclusions", buyType: "package_inclusions", budgetIncludesFees: true, clientPaysForMedia: false, budget: "1000" },
  { id: "package", buyType: "package", budgetIncludesFees: true, clientPaysForMedia: false, budget: "1000" },
]

function financeLine(line: MixedLine): LineItemInput {
  return {
    lineItemId: line.id,
    mediaType: "digidisplay",
    buyType: line.buyType,
    rate: 1,
    enteredAmount: 0,
    budgetIncludesFees: line.budgetIncludesFees,
    clientPaysForMedia: line.clientPaysForMedia,
    noAdserving: true,
    feePct: FEE,
    approval: "approved",
    bursts: [{ startDate: START, endDate: END, budget: line.budget }],
  }
}

test("header total for a mixed plan equals gross media plus fee", () => {
  const header = channelSummaryTotals(
    mixed.map((line) => ({
      buyType: line.buyType,
      budgetIncludesFees: line.budgetIncludesFees,
      clientPaysForMedia: line.clientPaysForMedia,
      bursts: [{ budget: line.budget, startDate: START, endDate: END }],
    })),
    FEE,
  )
  const financials = computeCampaignFinancials(
    mixed.map(financeLine),
    { feeLoading: {} },
    {
      campaignStart: new Date(2026, 2, 1),
      campaignEnd: new Date(2026, 2, 31),
      getRateForMediaType: () => 0,
    },
  )
  const scope = financials.mbaScopeTotals
  assert.equal(toCents(header.overallMedia), toCents(scope.grossMedia))
  assert.equal(toCents(header.overallFee), toCents(scope.fee))
  assert.equal(
    toCents(header.overallMedia + header.overallFee),
    toCents(scope.grossMedia + scope.fee),
  )
  assert.equal(toCents(header.overallCost), toCents(scope.grossMedia + scope.fee))
  assert.equal(header.lines[2].media, 1000)
  assert.ok(header.lines[2].fee > 0)
  assert.equal(header.lines[3].media, 0)
  assert.equal(header.lines[3].fee, 0)
  assert.equal(header.lines[4].media, 0)
  assert.equal(header.lines[4].fee, 0)
  assert.equal(header.lines[5].media, 850)
  assert.equal(header.lines[5].fee, 150)
})
