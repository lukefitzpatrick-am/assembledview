import assert from "node:assert/strict"
import test from "node:test"

import { resolvePacingWindowISO } from "@/lib/pacing/expectedForWindow"
import { assumedLineToDateCents, type AssumedExpectedLine } from "@/lib/spend/assumedSpend"
import { deliveryStatusFromPct } from "@/lib/pacing/deliveryStatusFromPct"
import {
  resolveCampaignExpectedSpendForWindow,
  resolveCampaignExpectedSpendToDate,
} from "@/lib/spend/resolveCampaignExpectedSpend"

const START = "2026-10-01"
const END = "2026-10-31"

function schedule() {
  return [
    {
      month: "October 2026",
      mediaCosts: { socialMedia: "$3,100.00", newspaper: "$3,100.00" },
      mediaTotal: "$6,200.00",
    },
  ]
}

function newspaperLine(): AssumedExpectedLine {
  return {
    id: "golf025NP7",
    scheduleKey: "newspaper",
    plannedMedia: 3100,
    buyType: "package",
    bursts: [
      {
        rawBudget: 3100,
        budgetIncludesFees: false,
        clientPaysForMedia: false,
        feePct: 0,
        buyType: "package",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
      },
    ],
  }
}

function base(assumedLines?: AssumedExpectedLine[]) {
  return {
    billingSchedule: [],
    deliverySchedule: schedule(),
    monthlySpend: [],
    campaignStartISO: START,
    campaignEndISO: END,
    monthlyOpts: { campaignStartISO: START, campaignEndISO: END },
    basis: "media" as const,
    assumedLines,
  }
}

const atAsOf = (asOfISO: string, assumedLines?: AssumedExpectedLine[]) =>
  resolveCampaignExpectedSpendToDate({
    ...base(assumedLines),
    monthlyOpts: { ...base().monthlyOpts, asOfISO, basis: "media" },
  })

// 09:00 on 20 Oct in Melbourne.
const NOW = new Date("2026-10-19T22:00:00Z")

test("to date: the strip window ends Melbourne yesterday and expected stops there", () => {
  const window = resolvePacingWindowISO({ campaignStartISO: START, campaignEndISO: END, reference: NOW })
  assert.deepEqual(window, { startISO: START, endISO: "2026-10-19", filtered: false, empty: false })
  const expected = resolveCampaignExpectedSpendForWindow({ ...base(), window })
  assert.equal(expected, atAsOf("2026-10-19"))
  // 19 of 31 days of $6,200.
  assert.equal(expected, 3800)
  assert.ok(expected < atAsOf("2026-10-20"), "today is not expected")
})

test("a date filter narrows expected to the filter days", () => {
  const window = resolvePacingWindowISO({
    filterStartISO: "2026-10-11",
    filterEndISO: "2026-10-15",
    campaignStartISO: START,
    campaignEndISO: END,
    reference: NOW,
  })
  assert.equal(window.filtered, true)
  const expected = resolveCampaignExpectedSpendForWindow({ ...base(), window })
  // 5 days of $200 a day.
  assert.equal(expected, 1000)
  assert.equal(expected, atAsOf("2026-10-15") - atAsOf("2026-10-10"))
})

test("a filter that runs past yesterday is clamped to yesterday", () => {
  const window = resolvePacingWindowISO({
    filterStartISO: "2026-10-16",
    filterEndISO: "2026-10-31",
    campaignStartISO: START,
    campaignEndISO: END,
    reference: NOW,
  })
  assert.equal(window.endISO, "2026-10-19")
  assert.equal(resolveCampaignExpectedSpendForWindow({ ...base(), window }), 800)
})

test("a window that has not opened expects nothing", () => {
  const window = resolvePacingWindowISO({
    filterStartISO: "2026-10-25",
    filterEndISO: "2026-10-31",
    campaignStartISO: START,
    campaignEndISO: END,
    reference: NOW,
  })
  assert.equal(window.empty, true)
  assert.equal(resolveCampaignExpectedSpendForWindow({ ...base(), window }), 0)
})

test("assumed spend counted to the same day as expected reads On track, not Ahead", () => {
  const line = newspaperLine()
  const window = resolvePacingWindowISO({ campaignStartISO: START, campaignEndISO: END, reference: NOW })
  const expected = resolveCampaignExpectedSpendForWindow({ ...base([line]), window })
  const socialExpected = 19 * 100
  const assumedToWindowEnd = assumedLineToDateCents(line, window.endISO) / 100
  // Social delivered exactly on plan; newspaper is assumed spend.
  const delivered = socialExpected + assumedToWindowEnd
  assert.equal(expected, delivered)
  assert.equal(deliveryStatusFromPct((delivered / expected) * 100), "on-track")

  // Before: assumed counted through today against expected to yesterday.
  const assumedThroughToday = assumedLineToDateCents(line, "2026-10-20") / 100
  assert.ok(socialExpected + assumedThroughToday > expected)
})
