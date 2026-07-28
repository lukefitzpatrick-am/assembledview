import assert from "node:assert/strict"
import test from "node:test"

import { billingMonthsHaveDetailedLineItems } from "../../mediaplan/partialMba.js"
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

  // Exposed reconciliation reuses the same consts (no recompute).
  const recon = result.reconciliation!
  assert.equal(recon.clientPaysMedia, pl.media, "clientPaysMedia === line full media")
  assert.equal(
    recon.billableMbaExGst,
    Math.round((result.mbaScopeTotals.nettExGst - recon.clientPaysMedia) * 100) / 100
  )
  assert.equal(recon.billableMbaExGst, recon.billingScheduleTotalExGst)
  assert.equal(result.validation.billableEqualsMba, true)

  assert.ok(result.deliveryVsBillingDelta.length >= 1)
  assert.ok(
    result.deliveryVsBillingDelta.some((d) => d.reasons.includes("client_pays_media"))
  )
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

test("computeCampaignFinancials: selectedMonthYears scopes billing+MBA, keeps delivery full", () => {
  const line: LineItemInput = {
    lineItemId: "TV1",
    mediaType: "television",
    buyType: "cpm",
    rate: 10,
    enteredAmount: 2000,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    bursts: [
      {
        startDate: "2026-08-01",
        endDate: "2026-09-30",
        budget: 2000,
        buyAmount: 10,
      },
    ],
    approval: "approved",
  }

  const full = computeCampaignFinancials([line], { feeLoading: { feetelevision: 0 } }, {
    campaignStart: new Date(2026, 7, 1),
    campaignEnd: new Date(2026, 8, 30),
  })
  assert.ok(full.deliverySchedule.length >= 2)
  assert.ok(full.billingSchedule.length >= 2)

  const augOnly = computeCampaignFinancials([line], { feeLoading: { feetelevision: 0 } }, {
    campaignStart: new Date(2026, 7, 1),
    campaignEnd: new Date(2026, 8, 30),
    selectedMonthYears: ["August 2026"],
  })

  assert.equal(augOnly.deliverySchedule.length, full.deliverySchedule.length)
  assert.equal(augOnly.billingSchedule.length, 1)
  assert.equal(augOnly.billingSchedule[0]?.monthYear, "August 2026")
  assert.ok(augOnly.mbaScopeTotals.grossMedia < full.mbaScopeTotals.grossMedia)
  assert.ok(augOnly.mbaScopeTotals.grossMedia > 0)
})

test("computeCampaignFinancials: mixed fixture schedules carry detailed lineItems", () => {
  const lines: LineItemInput[] = [
    {
      lineItemId: "AUTO-SEARCH",
      mediaType: "search",
      buyType: "cpc",
      rate: 1,
      enteredAmount: 10_000,
      budgetIncludesFees: false,
      clientPaysForMedia: false,
      feePct: 20,
      bursts: [
        { startDate: "2026-06-01", endDate: "2026-07-31", budget: 10_000, buyAmount: 1 },
      ],
      approval: "approved",
    },
    {
      lineItemId: "MANUAL-SOCIAL",
      mediaType: "socialMedia",
      buyType: "cpm",
      rate: 10,
      enteredAmount: 6_000,
      budgetIncludesFees: false,
      clientPaysForMedia: false,
      feePct: 15,
      bursts: [
        { startDate: "2026-06-01", endDate: "2026-07-31", budget: 6_000, buyAmount: 10 },
      ],
      approval: "approved",
      billingOverride: {
        mode: "manual",
        reason: "prepayment",
        dateBasis: "2026-06-01|2026-07-31",
        months: [
          { month: "2026-06", amount: 6_000 },
          { month: "2026-07", amount: 0 },
        ],
      },
    },
    {
      lineItemId: "CLIENT-PAYS-TV",
      mediaType: "television",
      buyType: "cpm",
      rate: 20,
      enteredAmount: 8_000,
      budgetIncludesFees: false,
      clientPaysForMedia: true,
      feePct: 10,
      bursts: [
        { startDate: "2026-06-01", endDate: "2026-07-31", budget: 8_000, buyAmount: 20 },
      ],
      approval: "approved",
    },
    {
      lineItemId: "ADSERV-DISPLAY",
      mediaType: "digiDisplay",
      buyType: "cpm",
      rate: 5,
      enteredAmount: 4_000,
      budgetIncludesFees: false,
      clientPaysForMedia: false,
      feePct: 12,
      bursts: [
        {
          startDate: "2026-06-01",
          endDate: "2026-07-31",
          budget: 4_000,
          buyAmount: 5,
          adServingRatePct: 2,
          adServingImpressions: 800_000,
        },
      ],
      approval: "approved",
    },
    {
      lineItemId: "PROD-1",
      mediaType: "production",
      buyType: "fixed cost",
      rate: 1,
      enteredAmount: 2_500,
      budgetIncludesFees: false,
      clientPaysForMedia: false,
      feePct: 0,
      bursts: [
        { startDate: "2026-06-01", endDate: "2026-06-30", budget: 2_500, buyAmount: 1 },
      ],
      approval: "approved",
    },
  ]

  const result = computeCampaignFinancials(
    lines,
    {
      feeLoading: {
        feesearch: 20,
        feesocial: 15,
        feetelevision: 10,
        feedigidisplay: 12,
      },
    },
    {
      campaignStart: new Date("2026-06-01"),
      campaignEnd: new Date("2026-07-31"),
      getRateForMediaType: () => 0.5,
    }
  )

  assert.ok(
    billingMonthsHaveDetailedLineItems(result.billingSchedule),
    "billing schedule must have detailed lineItems"
  )
  assert.ok(
    billingMonthsHaveDetailedLineItems(result.deliverySchedule),
    "delivery schedule must have detailed lineItems"
  )

  const expectedIds = new Set(
    result.perLine.filter((p) => !p.flags.excluded).map((p) => p.lineItemId)
  )

  for (const month of result.billingSchedule) {
    const ids = new Set<string>()
    for (const [mediaKey, items] of Object.entries(month.lineItems ?? {})) {
      assert.ok(Array.isArray(items))
      for (const item of items!) {
        ids.add(item.id)
        const pl = result.perLine.find((p) => p.lineItemId === item.id)
        assert.ok(pl, `missing perLine for ${item.id}`)
        assert.equal(pl!.mediaType, mediaKey)
        const expectedMedia =
          pl!.billingMonths.find((m) => m.month === month.monthYear)?.amount ?? 0
        assert.ok(
          Math.abs((item.monthlyAmounts[month.monthYear] ?? 0) - expectedMedia) <= 0.02,
          `${item.id} ${month.monthYear} media`
        )
        assert.ok(item.feeMonthlyAmounts, `${item.id} feeMonthlyAmounts`)
        assert.ok(item.adServingMonthlyAmounts, `${item.id} adServingMonthlyAmounts`)
        if (pl!.flags.clientPaysForMedia) {
          assert.equal(item.clientPaysForMedia, true)
          assert.ok(Math.abs(expectedMedia) < 0.02, "client-pays billing media is 0")
        }
        if (pl!.flags.manualBilling) {
          assert.equal(item.billingMode, "manual")
        }
        if (pl!.flags.prepaid) {
          assert.equal(item.preBill, true)
        }
      }
    }
    assert.deepEqual([...ids].sort(), [...expectedIds].sort())
  }

  const june = result.billingSchedule.find((m) => m.monthYear === "June 2026")!
  const ads = june.lineItems!.digiDisplay!.find((i) => i.id === "ADSERV-DISPLAY")!
  assert.ok(
    (ads.adServingMonthlyAmounts!["June 2026"] ?? 0) > 0,
    "adserving line must carry per-month adServing"
  )
  assert.ok(june.lineItems!.production!.some((i) => i.id === "PROD-1"))
  assert.ok(june.lineItems!.search!.some((i) => i.id === "AUTO-SEARCH"))

  // Delivery keeps full client-pays media while billing zeros it.
  const delJune = result.deliverySchedule.find((m) => m.monthYear === "June 2026")!
  const tvDel = delJune.lineItems!.television!.find((i) => i.id === "CLIENT-PAYS-TV")!
  const tvBill = june.lineItems!.television!.find((i) => i.id === "CLIENT-PAYS-TV")!
  assert.ok((tvDel.monthlyAmounts["June 2026"] ?? 0) > 0)
  assert.ok(Math.abs(tvBill.monthlyAmounts["June 2026"] ?? 0) < 0.02)
})
