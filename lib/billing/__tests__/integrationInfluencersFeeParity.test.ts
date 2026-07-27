/**
 * Integration = 0 when feeintegration absent; Influencers inherit feecontentcreator
 * (all clients). Billing feeTotal must match summed persisted line feeAmount.
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  collectPersistedFeeBillingMismatchIssues,
  sumBillingScheduleFeeTotal,
  sumPersistedLineItemFeeAmounts,
} from "../assertPersistedLineFeesMatchBilling.js"
import type { BillingMonth } from "../types.js"
import {
  computeCampaignFinancials,
  resolveFeePctFromFeeLoading,
} from "../../finance/computeCampaignFinancials.js"
import {
  buildEditorLineItemInputs,
  buildFeeLoadingFromEditorFees,
} from "../../finance/buildEditorLineItemInputs.js"
import { stampClientFeePctOnLineItems } from "../../finance/stampClientFeePctOnLineItems.js"
import { extractAndFormatBursts, parseBurstMoney } from "../../mediaplan/formatBurstsForPersist.js"

/** Krusty-shaped: no feeintegration/feeinfluencers; feecontentcreator=20. */
const KRUSTY_CLIENT_FEES = {
  feesearch: 20,
  feesocial: 20,
  feeprogdisplay: 20,
  feeprogvideo: 20,
  feeprogbvod: 20,
  feeprogaudio: 20,
  feeprogooh: 20,
  feecontentcreator: 20,
}

/** Non-Krusty client: different content-creator rate, still no feeinfluencers. */
const OTHER_CLIENT_FEES = {
  feesearch: 10,
  feesocial: 10,
  feecontentcreator: 15,
}

const ALL20_KEYS = [
  "television",
  "radio",
  "newspaper",
  "magazines",
  "ooh",
  "cinema",
  "digiDisplay",
  "digiAudio",
  "digiVideo",
  "bvod",
  "integration",
  "search",
  "socialMedia",
  "progDisplay",
  "progVideo",
  "progBvod",
  "progAudio",
  "progOoh",
  "influencers",
  "production",
] as const

function bareLine(budget = 10_000) {
  return {
    buy_type: "cpc",
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    bursts: [
      {
        budget,
        buyAmount: budget,
        startDate: "2026-07-01",
        endDate: "2026-07-31",
      },
    ],
  }
}

function month(feeTotal: string, mediaTotal = "$170,000.00"): BillingMonth {
  return {
    monthYear: "July 2026",
    mediaTotal,
    feeTotal,
    totalAmount: "$0.00",
    adservingTechFees: "$0.00",
    production: "$10,000.00",
    mediaCosts: {
      search: "$10,000.00",
      socialMedia: "$10,000.00",
      television: "$10,000.00",
      radio: "$10,000.00",
      newspaper: "$10,000.00",
      magazines: "$10,000.00",
      ooh: "$10,000.00",
      cinema: "$10,000.00",
      digiDisplay: "$10,000.00",
      digiAudio: "$10,000.00",
      digiVideo: "$10,000.00",
      bvod: "$10,000.00",
      integration: "$10,000.00",
      progDisplay: "$10,000.00",
      progVideo: "$10,000.00",
      progBvod: "$10,000.00",
      progAudio: "$10,000.00",
      progOoh: "$10,000.00",
      influencers: "$10,000.00",
      production: "$10,000.00",
    },
  }
}

function bareConfig(billingKey: (typeof ALL20_KEYS)[number] | string) {
  return {
    billingKey,
    lineItems: [bareLine()],
    containerBursts: [],
  }
}

test("resolve: Integration 0 (no feeintegration); Influencers inherit feecontentcreator; production 0", () => {
  const feeLoading = buildFeeLoadingFromEditorFees(KRUSTY_CLIENT_FEES)
  assert.equal(resolveFeePctFromFeeLoading("integration", feeLoading), 0)
  assert.equal(resolveFeePctFromFeeLoading("influencers", feeLoading), 20)
  assert.equal(resolveFeePctFromFeeLoading("production", feeLoading), 0)
  assert.equal(resolveFeePctFromFeeLoading("television", feeLoading), 0)
  assert.equal(resolveFeePctFromFeeLoading("search", feeLoading), 20)
})

test("krusty013-shaped: feeTotal $20,000; Integration=0 Influencers=20% Production=0 on line+billing", () => {
  const feeLoading = buildFeeLoadingFromEditorFees(KRUSTY_CLIENT_FEES)
  const configs = ALL20_KEYS.map((billingKey) => bareConfig(billingKey))
  const financials = computeCampaignFinancials(
    buildEditorLineItemInputs(configs),
    { feeLoading },
    {
      campaignStart: new Date("2026-07-01"),
      campaignEnd: new Date("2026-07-31"),
      getRateForMediaType: () => 0,
      adservaudio: 0,
    }
  )

  // 7 biddable × $2,500 + Influencers $2,500 = $20,000 (Integration + Production = 0)
  assert.equal(financials.mbaScopeTotals.fee, 20_000)

  const stamped = ALL20_KEYS.flatMap((billingKey) =>
    stampClientFeePctOnLineItems([bareLine()], billingKey, feeLoading)
  )
  const persistedSum = sumPersistedLineItemFeeAmounts(stamped)
  const billingFee = sumBillingScheduleFeeTotal(financials.billingSchedule)
  assert.equal(persistedSum, billingFee)
  assert.equal(persistedSum, 20_000)

  const feeByType: Record<string, number> = {}
  for (const line of financials.perLine) {
    feeByType[line.mediaType] = (feeByType[line.mediaType] ?? 0) + line.fee
  }
  assert.equal(feeByType.integration, 0)
  assert.equal(feeByType.influencers, 2_500)
  assert.equal(feeByType.production, 0)

  for (const billingKey of ["integration", "influencers", "production"] as const) {
    const stampedLine = stampClientFeePctOnLineItems(
      [bareLine()],
      billingKey,
      feeLoading
    )[0]!
    const expectedPct = resolveFeePctFromFeeLoading(billingKey, feeLoading)
    assert.equal(stampedLine.feePct, expectedPct, `${billingKey} feePct`)
    const bursts = extractAndFormatBursts(stampedLine, stampedLine.feePct)
    const feeAmount = parseBurstMoney(bursts[0]?.feeAmount)
    const expectedFee =
      expectedPct === 0 ? 0 : (10_000 / (100 - expectedPct)) * expectedPct
    assert.ok(
      Math.abs(feeAmount - expectedFee) < 0.02,
      `${billingKey} feeAmount ${feeAmount} vs ${expectedFee}`
    )
  }
})

test("hardened guard FAILS mismatched fixture and PASSES matched", () => {
  const feeLoading = buildFeeLoadingFromEditorFees(KRUSTY_CLIENT_FEES)
  const matchedLines = stampClientFeePctOnLineItems(
    [bareLine()],
    "search",
    feeLoading
  ).concat(
    stampClientFeePctOnLineItems([bareLine()], "influencers", feeLoading)
  )
  // search $2500 + influencers $2500
  const matchedMonths = [month("$5,000.00")]
  assert.deepEqual(
    collectPersistedFeeBillingMismatchIssues({
      months: matchedMonths,
      lineItems: matchedLines,
    }),
    []
  )

  const mismatchedLines = matchedLines.map((li) => ({ ...li, feePct: 0 }))
  const issues = collectPersistedFeeBillingMismatchIssues({
    months: matchedMonths,
    lineItems: mismatchedLines,
  })
  assert.equal(issues.length, 1)
  assert.match(issues[0]!, /does not match the sum of persisted line-item fee/)
})

test("krusty002-shaped (Search + Social only) still reconciles", () => {
  const feeLoading = buildFeeLoadingFromEditorFees({
    feesearch: 20,
    feesocial: 20,
    feecontentcreator: 20,
  })
  const configs = [bareConfig("search"), bareConfig("socialMedia")]
  const financials = computeCampaignFinancials(
    buildEditorLineItemInputs(configs),
    { feeLoading },
    {
      campaignStart: new Date("2026-07-01"),
      campaignEnd: new Date("2026-07-31"),
      getRateForMediaType: () => 0,
      adservaudio: 0,
    }
  )
  assert.equal(financials.mbaScopeTotals.fee, 5_000)
  const stamped = stampClientFeePctOnLineItems(
    [bareLine()],
    "search",
    feeLoading
  ).concat(
    stampClientFeePctOnLineItems([bareLine()], "socialMedia", feeLoading)
  )
  assert.equal(
    sumPersistedLineItemFeeAmounts(stamped),
    sumBillingScheduleFeeTotal(financials.billingSchedule)
  )
})

test("0% traditional channel persists feeAmount 0 and bills 0", () => {
  const feeLoading = buildFeeLoadingFromEditorFees(KRUSTY_CLIENT_FEES)
  assert.equal(resolveFeePctFromFeeLoading("television", feeLoading), 0)
  const stampedLine = stampClientFeePctOnLineItems(
    [bareLine()],
    "television",
    feeLoading
  )[0]!
  const bursts = extractAndFormatBursts(stampedLine, stampedLine.feePct)
  assert.equal(parseBurstMoney(bursts[0]?.feeAmount), 0)
  const financials = computeCampaignFinancials(
    buildEditorLineItemInputs([bareConfig("television")]),
    { feeLoading },
    {
      campaignStart: new Date("2026-07-01"),
      campaignEnd: new Date("2026-07-31"),
      getRateForMediaType: () => 0,
      adservaudio: 0,
    }
  )
  assert.equal(financials.mbaScopeTotals.fee, 0)
})

test("Influencers->feecontentcreator fallback fires for a non-Krusty client", () => {
  const feeLoading = buildFeeLoadingFromEditorFees(OTHER_CLIENT_FEES)
  assert.equal(resolveFeePctFromFeeLoading("influencers", feeLoading), 15)
  assert.equal(resolveFeePctFromFeeLoading("integration", feeLoading), 0)

  const stamped = stampClientFeePctOnLineItems(
    [bareLine()],
    "influencers",
    feeLoading
  )[0]!
  assert.equal(stamped.feePct, 15)
  const bursts = extractAndFormatBursts(stamped, stamped.feePct)
  assert.ok(Math.abs(parseBurstMoney(bursts[0]?.feeAmount) - 1_764.705882) < 0.02)

  const financials = computeCampaignFinancials(
    buildEditorLineItemInputs([bareConfig("influencers")]),
    { feeLoading },
    {
      campaignStart: new Date("2026-07-01"),
      campaignEnd: new Date("2026-07-31"),
      getRateForMediaType: () => 0,
      adservaudio: 0,
    }
  )
  assert.equal(financials.mbaScopeTotals.fee, 1_764.71)
})
