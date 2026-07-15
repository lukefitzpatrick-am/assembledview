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

  // MBA scope keeps FULL media (not billed 0).
  assert.equal(result.mbaScopeTotals.grossMedia, 8000)
  // Delivery still carries the media; billing media is zeroed (client pays supplier).
  const deliveryMedia = pl.deliveryMonths.reduce((s, m) => s + m.amount, 0)
  assert.equal(deliveryMedia, 8000)
  // moneyMapToMonthAmounts drops ~0 shares — empty billingMonths ≡ media billed 0.
  const billedLineMedia = pl.billingMonths.reduce((s, m) => s + m.amount, 0)
  assert.equal(billedLineMedia, 0)

  // Core validation: billable MBA = nett − client-pays media; schedule totals must match.
  const billableMbaExGst =
    Math.round((result.mbaScopeTotals.nettExGst - pl.media) * 100) / 100
  let scheduleMedia = 0
  let billingScheduleTotalExGst = 0
  for (const row of result.billingSchedule) {
    const media = Number(String(row.mediaTotal).replace(/[^0-9.-]/g, "")) || 0
    const fee = Number(String(row.feeTotal).replace(/[^0-9.-]/g, "")) || 0
    const ad = Number(String(row.adservingTechFees).replace(/[^0-9.-]/g, "")) || 0
    const prod = Number(String(row.production ?? "0").replace(/[^0-9.-]/g, "")) || 0
    scheduleMedia += media
    billingScheduleTotalExGst += media + fee + ad + prod
  }
  assert.equal(scheduleMedia, 0, "billing schedule must be fee-only for pure client-pays plan")
  assert.ok(
    Math.abs(billingScheduleTotalExGst - billableMbaExGst) < 0.02,
    `billingScheduleTotalExGst (${billingScheduleTotalExGst}) must equal billableMbaExGst (${billableMbaExGst})`
  )

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
  assert.equal(result.mbaScopeTotals.nettExGst, 1000)
  assert.equal(result.perLine[1]!.flags.excluded, true)

  // Excluded line stays in delivery schedule totals / per-line delivery months
  const deliveryMedia = result.deliverySchedule.reduce(
    (acc, m) => acc + (parseFloat(String(m.mediaTotal).replace(/[^0-9.-]/g, "")) || 0),
    0
  )
  assert.equal(deliveryMedia, 1500)
  assert.ok((result.perLine[1]!.deliveryMonths?.length ?? 0) > 0)

  // Excluded line omitted from billing schedule + MBA scope
  const billingMedia = result.billingSchedule.reduce(
    (acc, m) => acc + (parseFloat(String(m.mediaTotal).replace(/[^0-9.-]/g, "")) || 0),
    0
  )
  assert.equal(billingMedia, 1000)

  assert.equal(result.validation.billableEqualsMba, true)
  assert.ok(
    result.deliveryVsBillingDelta.some((d) => d.reasons.includes("excluded"))
  )
})

test("computeCampaignFinancials: fee/12 penny reconciliation keeps billableEqualsMba", () => {
  // $4,265.33 fee over a full calendar year: naive per-month round drifts ~5¢.
  const line: LineItemInput = {
    lineItemId: "FEE12",
    mediaType: "search",
    buyType: "cpc",
    rate: 1,
    enteredAmount: 42_653.3,
    budgetIncludesFees: true,
    clientPaysForMedia: false,
    feePct: 10,
    bursts: [
      {
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        budget: 42_653.3,
        buyAmount: 1,
      },
    ],
    approval: "approved",
  }

  const result = computeCampaignFinancials([line], { feeLoading: {} })
  const pl = result.perLine[0]!
  assert.equal(pl.fee, 4265.33)

  const monthlyFeeSum = result.billingSchedule.reduce((acc, m) => {
    const n = Number(String(m.feeTotal).replace(/[^0-9.-]/g, "")) || 0
    return acc + n
  }, 0)
  assert.equal(Math.round(monthlyFeeSum * 100), 426_533)
  assert.equal(result.validation.billableEqualsMba, true)
  assert.equal(result.validation.deltaExGst, 0)
})
