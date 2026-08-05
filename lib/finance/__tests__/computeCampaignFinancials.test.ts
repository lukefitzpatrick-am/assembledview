import assert from "node:assert/strict"
import test from "node:test"

import { computeCampaignFinancials } from "../computeCampaignFinancials.js"
import { computeCampaignFinancialsFromVersion } from "../computeCampaignFinancialsFromVersion.js"
import type { LineItemInput } from "../campaignFinancials.types.js"

/** Radio + production — surfaces production double-count in mbaScopeTotals.grossMedia. */
function productionDoubleCountLines(): LineItemInput[] {
  return [
    {
      lineItemId: "RADIO1",
      mediaType: "radio",
      buyType: "cpm",
      rate: 10,
      enteredAmount: 100_000,
      budgetIncludesFees: false,
      clientPaysForMedia: false,
      feePct: 0,
      bursts: [
        {
          startDate: "2026-09-01",
          endDate: "2026-11-30",
          budget: 100_000,
          buyAmount: 10,
        },
      ],
      approval: "approved",
    },
    {
      lineItemId: "PROD1",
      mediaType: "production",
      buyType: "fixed_cost",
      rate: 0,
      enteredAmount: 1_000,
      budgetIncludesFees: false,
      clientPaysForMedia: false,
      feePct: 0,
      bursts: [
        {
          startDate: "2026-09-01",
          endDate: "2026-11-30",
          budget: 1_000,
        },
      ],
      approval: "approved",
    },
  ]
}

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

test("production is not gross media (main path)", () => {
  const result = computeCampaignFinancials(productionDoubleCountLines(), { feeLoading: {} })
  const t = result.mbaScopeTotals
  assert.equal(t.grossMedia, 100_000, "production EXCLUDED from grossMedia")
  assert.equal(t.production, 1_000)
  assert.equal(t.fee, 0)
  assert.equal(t.adServing, 0)
  assert.equal(t.nettExGst, 101_000, "production counted exactly once")
  assert.equal(
    t.nettExGst,
    t.grossMedia + t.fee + t.adServing + t.production,
    "nettExGst === grossMedia + fee + adServing + production"
  )
})

test("production is not gross media (month-scoped path)", () => {
  const result = computeCampaignFinancials(productionDoubleCountLines(), { feeLoading: {} }, {
    selectedMonthYears: ["September 2026", "October 2026", "November 2026"],
  })
  const t = result.mbaScopeTotals
  assert.equal(t.grossMedia, 100_000, "production EXCLUDED from grossMedia")
  assert.equal(t.production, 1_000)
  assert.equal(t.fee, 0)
  assert.equal(t.adServing, 0)
  assert.equal(t.nettExGst, 101_000, "production counted exactly once")
  assert.equal(
    t.nettExGst,
    t.grossMedia + t.fee + t.adServing + t.production,
    "nettExGst === grossMedia + fee + adServing + production"
  )
})

test("editor path agrees with persisted path on a plan with production", () => {
  const lines = productionDoubleCountLines()
  const editor = computeCampaignFinancials(lines, { feeLoading: {} })
  // Same shape as versionPathClientPays / deriveFromVersionCore: BillingMonth[] on the version.
  const fromVersion = computeCampaignFinancialsFromVersion({
    billingSchedule: editor.billingSchedule,
    deliverySchedule: editor.deliverySchedule,
  })
  assert.ok(fromVersion, "expected hydrated financials from persisted schedules")
  assert.equal(editor.mbaScopeTotals.grossMedia, fromVersion.mbaScopeTotals.grossMedia)
  assert.equal(editor.mbaScopeTotals.production, fromVersion.mbaScopeTotals.production)
  assert.equal(editor.mbaScopeTotals.nettExGst, fromVersion.mbaScopeTotals.nettExGst)
})

test("MBA totals block agrees with its own breakdown rows", () => {
  const result = computeCampaignFinancials(productionDoubleCountLines(), { feeLoading: {} })
  // Mirrors edit page: breakdown excludes mp_production; totals.gross_media = mbaScopeTotals.grossMedia.
  const gross_media = result.perLine
    .filter((l) => !l.flags.excluded && l.mediaType !== "production")
    .map((l) => ({ media_type: l.mediaType, gross_amount: l.media }))
  const totals = { gross_media: result.mbaScopeTotals.grossMedia }
  const rowsSum = gross_media.reduce((s, r) => s + r.gross_amount, 0)
  assert.equal(
    totals.gross_media,
    rowsSum,
    `totals.gross_media (${totals.gross_media}) must equal sum of gross_media[].gross_amount (${rowsSum})`
  )
})
