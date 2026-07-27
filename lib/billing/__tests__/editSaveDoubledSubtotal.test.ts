/**
 * Repro: edit-save billing-integrity fails when C1 BillingMonth schedules
 * (mediaTotal + mediaCosts, no mediaTypes) are re-hydrated then append-seeded.
 *
 * Observed on krusty012-shaped plans: mediaTotal=$10k, mediaCosts.search=$10k,
 * no lineItems. Legacy hydrate kept mediaTotal but zeroed mediaCosts; append then
 * added the $10k line again → subtotal $20k vs columns $10k.
 */
import assert from "node:assert/strict"
import test from "node:test"

import type { BillingLineItem, BillingMonth } from "../types.js"
import { parsePersistedBillingScheduleToMonths } from "../parsePersistedBillingScheduleToMonths.js"
import {
  computeAppendNewMediaTypeBucket,
  sumTemplateLinesForMonth,
} from "../appendNewMediaTypeBucket.js"

const FEES = { searchFee: 0, socialFee: 0 }
const EPS = 0.02

function parseAudMoney(val: unknown): number {
  return parseFloat(String(val ?? "").replace(/[^0-9.-]/g, "")) || 0
}

/** Same comparison as edit-page collectBillingMonthStructuralBlockingIssues. */
function mediaSubtotalVsColumns(month: BillingMonth): {
  mediaTotal: number
  columnsSum: number
  ok: boolean
} {
  let columnsSum = 0
  const mc = month.mediaCosts
  if (mc) {
    for (const [mk, raw] of Object.entries(mc)) {
      if (mk === "production") continue
      columnsSum += parseAudMoney(raw)
    }
  }
  const mediaTotal = parseAudMoney(month.mediaTotal)
  return {
    mediaTotal,
    columnsSum,
    ok: Math.abs(columnsSum - mediaTotal) <= EPS,
  }
}

/** Mirrors appendNewMediaTypeIntoWorkingMonth bucket math (pre-fix = prior + sum). */
function appendSeedBucketLegacy(priorBucket: number, sumNewLines: number): {
  nextBucket: number
  bucketDelta: number
} {
  const nextBucket = priorBucket + sumNewLines
  return { nextBucket, bucketDelta: nextBucket - priorBucket }
}

function emptyMediaCosts(): BillingMonth["mediaCosts"] {
  return {
    search: "$0.00",
    socialMedia: "$0.00",
    television: "$0.00",
    radio: "$0.00",
    newspaper: "$0.00",
    magazines: "$0.00",
    ooh: "$0.00",
    cinema: "$0.00",
    digiDisplay: "$0.00",
    digiAudio: "$0.00",
    digiVideo: "$0.00",
    bvod: "$0.00",
    integration: "$0.00",
    progDisplay: "$0.00",
    progVideo: "$0.00",
    progBvod: "$0.00",
    progAudio: "$0.00",
    progOoh: "$0.00",
    influencers: "$0.00",
    production: "$0.00",
  }
}

/** krusty012 / create-side C1 schedule shape: headers only, no mediaTypes/lineItems. */
function krusty012ShapedSchedule(media = 10_000, fee = 2_500): unknown[] {
  const fmt = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const mediaCosts = emptyMediaCosts()
  mediaCosts.search = fmt.format(media)
  return [
    {
      monthYear: "July 2026",
      mediaTotal: fmt.format(media),
      feeTotal: fmt.format(fee),
      adservingTechFees: "$0.00",
      production: "$0.00",
      totalAmount: fmt.format(media + fee),
      mediaCosts,
    },
  ]
}

/**
 * Apply replace-seed for one media key into a working month (same rollup as
 * appendNewMediaTypeIntoWorkingMonth → mediaTotal += bucketDelta).
 */
function applyReplaceSeed(
  month: BillingMonth,
  mediaKey: keyof BillingMonth["mediaCosts"],
  sumNewLines: number
): void {
  const priorBucket = parseAudMoney(month.mediaCosts[mediaKey])
  const { nextBucket, bucketDelta } = computeAppendNewMediaTypeBucket(priorBucket, sumNewLines)
  month.mediaCosts[mediaKey] = `$${nextBucket.toFixed(2)}`
  month.mediaTotal = `$${(parseAudMoney(month.mediaTotal) + bucketDelta).toFixed(2)}`
}

test("STEP2 repro: C1 BillingMonth hydrate must keep mediaCosts (not zero them)", () => {
  const months = parsePersistedBillingScheduleToMonths(krusty012ShapedSchedule(), FEES)
  assert.ok(months)
  const m = months![0]
  const check = mediaSubtotalVsColumns(m)
  // Before fix: legacy path sets mediaTotal=$10k from totalAmount−fees but leaves search at $0.
  assert.equal(check.mediaTotal, 10_000)
  assert.equal(parseAudMoney(m.mediaCosts.search), 10_000)
  assert.equal(check.ok, true)
})

test("STEP2 repro: legacy hydrate + additive append yields 20k vs 10k (guard fail)", () => {
  // Simulate the broken hydrate outcome (mediaTotal kept, mediaCosts zeroed).
  const brokenHydrate: BillingMonth = {
    monthYear: "July 2026",
    mediaTotal: "$10,000.00",
    feeTotal: "$2,500.00",
    adservingTechFees: "$0.00",
    production: "$0.00",
    totalAmount: "$12,500.00",
    mediaCosts: emptyMediaCosts(),
  }
  const priorBucket = parseAudMoney(brokenHydrate.mediaCosts.search)
  const sumNewLines = 10_000
  const { nextBucket, bucketDelta } = appendSeedBucketLegacy(priorBucket, sumNewLines)
  brokenHydrate.mediaCosts.search = `$${nextBucket.toFixed(2)}`
  brokenHydrate.mediaTotal = `$${(parseAudMoney(brokenHydrate.mediaTotal) + bucketDelta).toFixed(2)}`

  const check = mediaSubtotalVsColumns(brokenHydrate)
  assert.equal(check.mediaTotal, 20_000)
  assert.equal(check.columnsSum, 10_000)
  assert.equal(check.ok, false)
})

test("after fix: hydrate then replace-seed keeps subtotal == columns == 10000", () => {
  const months = parsePersistedBillingScheduleToMonths(krusty012ShapedSchedule(), FEES)
  assert.ok(months)
  const m = months![0]!
  applyReplaceSeed(m, "search", 10_000)

  const check = mediaSubtotalVsColumns(m)
  assert.equal(check.mediaTotal, 10_000)
  assert.equal(check.columnsSum, 10_000)
  assert.equal(check.ok, true)
})

test("replace-seed: two media types accumulate (Search $10k + Social $10k → $20k)", () => {
  // Empty working month (mediaCosts zeros, mediaTotal 0) then seed Search then Social —
  // the exact spot where add→replace could silently under-count a multi-type month.
  const month: BillingMonth = {
    monthYear: "July 2026",
    mediaTotal: "$0.00",
    feeTotal: "$0.00",
    adservingTechFees: "$0.00",
    production: "$0.00",
    totalAmount: "$0.00",
    mediaCosts: emptyMediaCosts(),
    lineItems: {},
  }

  applyReplaceSeed(month, "search", 10_000)
  assert.equal(parseAudMoney(month.mediaCosts.search), 10_000)
  assert.equal(parseAudMoney(month.mediaTotal), 10_000)

  applyReplaceSeed(month, "socialMedia", 10_000)
  assert.equal(parseAudMoney(month.mediaCosts.search), 10_000)
  assert.equal(parseAudMoney(month.mediaCosts.socialMedia), 10_000)

  const check = mediaSubtotalVsColumns(month)
  assert.equal(check.mediaTotal, 20_000)
  assert.equal(check.columnsSum, 20_000)
  assert.equal(check.ok, true)
})

test("replace-seed: two lines/bursts of one media type sum (not collapsed to one)", () => {
  const monthYear = "July 2026"
  const twoBursts: BillingLineItem[] = [
    {
      id: "billing-search::1",
      header1: "Google",
      header2: "Brand",
      monthlyAmounts: { [monthYear]: 10_000 },
      totalAmount: 10_000,
    },
    {
      id: "billing-search::2",
      header1: "Google",
      header2: "Generic",
      monthlyAmounts: { [monthYear]: 10_000 },
      totalAmount: 10_000,
    },
  ]

  const sumNewLines = sumTemplateLinesForMonth(twoBursts, monthYear)
  assert.equal(sumNewLines, 20_000, "both burst lines must contribute to the bucket")

  // C1 header already shows $20k for search (legitimate two-line total). Replace-seed
  // must land on $20k, not silently collapse to a single $10k line.
  const month: BillingMonth = {
    monthYear,
    mediaTotal: "$20,000.00",
    feeTotal: "$0.00",
    adservingTechFees: "$0.00",
    production: "$0.00",
    totalAmount: "$20,000.00",
    mediaCosts: { ...emptyMediaCosts(), search: "$20,000.00" },
  }
  applyReplaceSeed(month, "search", sumNewLines)

  const check = mediaSubtotalVsColumns(month)
  assert.equal(parseAudMoney(month.mediaCosts.search), 20_000)
  assert.equal(check.mediaTotal, 20_000)
  assert.equal(check.columnsSum, 20_000)
  assert.equal(check.ok, true)
})

test("healthy pointer / single-version schedule still parses unchanged", () => {
  const schedule = [
    {
      monthYear: "July 2026",
      mediaTotal: "$10,000.00",
      feeTotal: "$0.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      totalAmount: "$10,000.00",
      mediaCosts: { ...emptyMediaCosts(), search: "$10,000.00" },
      lineItems: {
        search: [
          {
            id: "billing-search::1",
            header1: "Google",
            header2: "Brand",
            monthlyAmounts: { "July 2026": 10_000 },
            totalAmount: 10_000,
          } satisfies BillingLineItem,
        ],
      },
    },
  ]
  const months = parsePersistedBillingScheduleToMonths(schedule, FEES)
  assert.ok(months)
  const check = mediaSubtotalVsColumns(months![0]!)
  assert.equal(check.mediaTotal, 10_000)
  assert.equal(check.columnsSum, 10_000)
  assert.equal(check.ok, true)
  assert.equal(months![0]!.lineItems?.search?.length, 1)
})

test("edited value round-trip: 10k → 12k stays single-counted", () => {
  const months = parsePersistedBillingScheduleToMonths(krusty012ShapedSchedule(12_000, 3_000), FEES)
  assert.ok(months)
  const check = mediaSubtotalVsColumns(months![0]!)
  assert.equal(check.mediaTotal, 12_000)
  assert.equal(check.columnsSum, 12_000)
  assert.equal(check.ok, true)
})
