import assert from "node:assert/strict"
import test from "node:test"

import { computeCampaignFinancials } from "../computeCampaignFinancials.js"
import type { LineItemInput } from "../campaignFinancials.types.js"

test("computeCampaignFinancials: fee from feeLoading + budgetIncludesFees split", () => {
  const line: LineItemInput = {
    lineItemId: "S1",
    mediaType: "search",
    buyType: "cpc",
    rate: 2,
    enteredAmount: 1000,
    budgetIncludesFees: true,
    clientPaysForMedia: false,
    bursts: [
      {
        startDate: "2026-05-01",
        endDate: "2026-05-31",
        budget: 1000,
        buyAmount: 2,
      },
    ],
    approval: "approved",
  }

  const result = computeCampaignFinancials([line], {
    feeLoading: { feesearch: 20 },
  })

  assert.equal(result.perLine.length, 1)
  const pl = result.perLine[0]!
  // Gross 1000 @ 20% → media 800, fee 200
  assert.equal(pl.media, 800)
  assert.equal(pl.fee, 200)
  assert.equal(pl.nett, 1000)
  // CPC deliverables = net media / rate → 800 / 2 = 400
  assert.equal(pl.deliverables, 400)
  assert.equal(result.mbaScopeTotals.grossMedia, 800)
  assert.equal(result.mbaScopeTotals.fee, 200)
  assert.equal(result.validation.billableEqualsMba, true)
})

test("computeCampaignFinancials: client-pays zeros billing media; delta reason", () => {
  const line: LineItemInput = {
    lineItemId: "PD1",
    mediaType: "progDisplay",
    buyType: "cpm",
    rate: 10,
    enteredAmount: 8000,
    budgetIncludesFees: false,
    clientPaysForMedia: true,
    feePct: 20,
    bursts: [
      {
        startDate: "2026-05-01",
        endDate: "2026-05-31",
        budget: 8000,
        buyAmount: 10,
      },
    ],
    approval: "approved",
  }

  const result = computeCampaignFinancials([line], { feeLoading: {} })
  const pl = result.perLine[0]!
  assert.equal(pl.media, 8000)
  assert.ok(pl.fee > 0)
  assert.equal(pl.flags.clientPaysForMedia, true)
  // CPM deliverables = (media/rate)*1000 = 8000/10*1000 = 800_000
  assert.equal(pl.deliverables, 800_000)

  assert.ok(result.deliveryVsBillingDelta.length >= 1)
  assert.ok(
    result.deliveryVsBillingDelta.some((d) => d.reasons.includes("client_pays_media"))
  )
  assert.equal(result.validation.billableEqualsMba, true)
})

test("computeCampaignFinancials: excluded lines omit from MBA + billing", () => {
  const lines: LineItemInput[] = [
    {
      lineItemId: "A",
      mediaType: "search",
      buyType: "cpc",
      rate: 1,
      enteredAmount: 1000,
      budgetIncludesFees: false,
      clientPaysForMedia: false,
      feePct: 0,
      bursts: [
        {
          startDate: "2026-05-01",
          endDate: "2026-05-31",
          budget: 1000,
          buyAmount: 1,
        },
      ],
      approval: "approved",
    },
    {
      lineItemId: "B",
      mediaType: "search",
      buyType: "cpc",
      rate: 1,
      enteredAmount: 500,
      budgetIncludesFees: false,
      clientPaysForMedia: false,
      feePct: 0,
      bursts: [
        {
          startDate: "2026-05-01",
          endDate: "2026-05-31",
          budget: 500,
          buyAmount: 1,
        },
      ],
      approval: "excluded",
    },
  ]

  const result = computeCampaignFinancials(lines, { feeLoading: {} })
  assert.equal(result.mbaScopeTotals.grossMedia, 1000)
  assert.equal(result.perLine[1]!.flags.excluded, true)
  assert.ok(
    result.deliveryVsBillingDelta.some((d) => d.reasons.includes("excluded"))
  )
})
