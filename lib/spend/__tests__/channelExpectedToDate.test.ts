import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { deliveryStatusFromPct } from "@/lib/pacing/deliveryStatusFromPct"
import {
  assumedDeliveryPacePct,
  assumedLineToDateCents,
  type AssumedExpectedLine,
} from "@/lib/spend/assumedSpend"
import { resolveCampaignExpectedSpendToDate } from "@/lib/spend/resolveCampaignExpectedSpend"
import {
  channelExpectedToDate,
  reconcileLineExpected,
} from "@/lib/spend/channelExpectedToDate"

const START = "2026-04-09"
const END = "2026-12-06"

/** golf025-shaped: October media buckets plus earlier months, media basis. */
function golf025Schedule() {
  return [
    {
      month: "September 2026",
      mediaCosts: {
        socialMedia: "$26,636.45",
        digiDisplay: "$1,062.86",
        newspaper: "$12,177.90",
      },
      mediaTotal: "$39,877.21",
      feeTotal: "$0.00",
      totalAmount: "$39,877.21",
    },
    {
      month: "October 2026",
      mediaCosts: {
        socialMedia: "$11,466.00",
        digiDisplay: "$19,638.05",
        digiVideo: "$12,347.08",
        newspaper: "$2,000.00",
        progVideo: "$2,583.34",
      },
      mediaTotal: "$48,034.47",
      feeTotal: "$1,000.00",
      production: "$500.00",
      totalAmount: "$49,534.47",
    },
  ]
}

function headline(asOfISO: string): number {
  return resolveCampaignExpectedSpendToDate({
    billingSchedule: [],
    deliverySchedule: golf025Schedule(),
    monthlySpend: [],
    campaignStartISO: START,
    campaignEndISO: END,
    monthlyOpts: { campaignStartISO: START, campaignEndISO: END, asOfISO, basis: "media" },
    basis: "media",
  })
}

describe("channelExpectedToDate", () => {
  it("sums a golf025-shaped schedule to the headline within 1 cent", () => {
    const asOfISO = "2026-10-12"
    const slices = channelExpectedToDate({
      deliverySchedule: golf025Schedule(),
      campaignStartISO: START,
      campaignEndISO: END,
      asOfISO,
    })
    const sum = slices.reduce((total, slice) => total + slice.expected, 0)
    const campaign = headline(asOfISO)
    assert.ok(campaign > 0)
    assert.ok(Math.abs(Math.round(sum * 100) - Math.round(campaign * 100)) <= 1)
    assert.ok(slices.some((slice) => slice.key === "newspaper"))
    assert.equal(
      slices.reduce((total, slice) => total + Math.round(slice.expected * 100), 0),
      Math.round(campaign * 100),
    )
  })

  it("uses the same as-of as the campaign headline", () => {
    const early = channelExpectedToDate({
      deliverySchedule: golf025Schedule(),
      campaignStartISO: START,
      campaignEndISO: END,
      asOfISO: "2026-10-11",
    })
    const later = channelExpectedToDate({
      deliverySchedule: golf025Schedule(),
      campaignStartISO: START,
      campaignEndISO: END,
      asOfISO: "2026-10-12",
    })
    const earlySum = early.reduce((total, slice) => total + slice.expected, 0)
    const laterSum = later.reduce((total, slice) => total + slice.expected, 0)
    assert.equal(Math.round(earlySum * 100), Math.round(headline("2026-10-11") * 100))
    assert.equal(Math.round(laterSum * 100), Math.round(headline("2026-10-12") * 100))
    assert.ok(laterSum > earlySum)
  })
})

describe("reconcileLineExpected", () => {
  it("makes lines sum to their channel exactly", () => {
    const slices = channelExpectedToDate({
      deliverySchedule: golf025Schedule(),
      campaignStartISO: START,
      campaignEndISO: END,
      asOfISO: "2026-10-12",
    })
    const newspaper = slices.find((slice) => slice.key === "newspaper")
    assert.ok(newspaper)
    const allocated = reconcileLineExpected(newspaper.expected, [
      { id: "np1", lineExpected: 8177.9, plannedMedia: 8177.9 },
      { id: "np6", lineExpected: 4000, plannedMedia: 4000 },
      { id: "np7", lineExpected: 0, plannedMedia: 2000 },
    ])
    const sum = [...allocated.values()].reduce((total, value) => total + value, 0)
    assert.equal(Math.round(sum * 100), Math.round(newspaper.expected * 100))
    assert.equal(allocated.get("np7"), 0)
  })

  it("splits by planned media when every line expected is 0", () => {
    const allocated = reconcileLineExpected(10, [
      { id: "a", lineExpected: 0, plannedMedia: 25 },
      { id: "b", lineExpected: 0, plannedMedia: 75 },
    ])
    assert.equal(allocated.get("a"), 2.5)
    assert.equal(allocated.get("b"), 7.5)
  })

  it("keeps assumed lines fixed and gives the remainder to reported lines", () => {
    const allocated = reconcileLineExpected(
      150,
      [
        { id: "assumed", lineExpected: 0, plannedMedia: 50 },
        { id: "reported", lineExpected: 100, plannedMedia: 100 },
      ],
      new Map([["assumed", 50]]),
    )
    assert.equal(allocated.get("assumed"), 50)
    assert.equal(allocated.get("reported"), 100)
    const sum = [...allocated.values()].reduce((total, value) => total + value, 0)
    assert.equal(Math.round(sum * 100), 15000)
  })
})

function octoberSchedule() {
  return [
    {
      month: "October 2026",
      mediaCosts: { socialMedia: "$3,100.00", newspaper: "$3,100.00" },
      mediaTotal: "$6,200.00",
    },
  ]
}

function newspaperBurst(buyType = "package"): AssumedExpectedLine {
  return {
    id: "golf025NP7",
    scheduleKey: "newspaper",
    plannedMedia: 3100,
    buyType,
    bursts: [
      {
        rawBudget: 3100,
        budgetIncludesFees: false,
        clientPaysForMedia: false,
        feePct: 0,
        buyType,
        startDate: "2026-10-25",
        endDate: "2026-10-31",
      },
    ],
  }
}

function octoberInput(asOfISO: string, assumedLines?: AssumedExpectedLine[]) {
  return {
    deliverySchedule: octoberSchedule(),
    campaignStartISO: "2026-10-01",
    campaignEndISO: "2026-10-31",
    asOfISO,
    assumedLines,
    billingSchedule: [],
    monthlySpend: [],
    monthlyOpts: {
      campaignStartISO: "2026-10-01",
      campaignEndISO: "2026-10-31",
      asOfISO,
      basis: "media" as const,
    },
    basis: "media" as const,
  }
}

describe("assumed spend expected follows bursts", () => {
  it("is $0 on the 12th and two burst days on the 26th, both On track", () => {
    const line = newspaperBurst()
    const beforeStart = channelExpectedToDate(octoberInput("2026-10-12", [line]))
    const newspaperEarly = beforeStart.find((slice) => slice.key === "newspaper")
    assert.ok(newspaperEarly)
    assert.equal(newspaperEarly.expected, 0)
    assert.equal(assumedLineToDateCents(line, "2026-10-12"), 0)
    assert.equal(deliveryStatusFromPct(assumedDeliveryPacePct(0, 0)), "on-track")

    const started = channelExpectedToDate(octoberInput("2026-10-26", [line]))
    const newspaperLater = started.find((slice) => slice.key === "newspaper")
    const twoDays = assumedLineToDateCents(line, "2026-10-26") / 100
    assert.ok(newspaperLater)
    assert.equal(newspaperLater.expected, twoDays)
    assert.ok(twoDays > 0)
    assert.equal(deliveryStatusFromPct(assumedDeliveryPacePct(twoDays, twoDays)), "on-track")

    const unadjusted = channelExpectedToDate(octoberInput("2026-10-12"))
    const scheduleSlice = unadjusted.find((slice) => slice.key === "newspaper")
    assert.ok(scheduleSlice)
    assert.ok(scheduleSlice.expected > 0)
  })

  it("keeps a channel of only assumed lines on track and drops that slice from the headline", () => {
    const line = newspaperBurst()
    const slices = channelExpectedToDate(octoberInput("2026-10-12", [line]))
    const newspaper = slices.find((slice) => slice.key === "newspaper")
    assert.equal(newspaper?.expected, 0)
    assert.equal(deliveryStatusFromPct(assumedDeliveryPacePct(0, newspaper?.expected ?? 0)), "on-track")

    const headline = resolveCampaignExpectedSpendToDate(octoberInput("2026-10-12", [line]))
    const plain = resolveCampaignExpectedSpendToDate(octoberInput("2026-10-12"))
    const sum = slices.reduce((total, slice) => total + Math.round(slice.expected * 100), 0)
    assert.equal(sum, Math.round(headline * 100))
    assert.ok(plain > headline)
  })

  it("weights a mixed channel by expected, and lines still sum to the cent", () => {
    const mixed: AssumedExpectedLine = {
      ...newspaperBurst(),
      plannedMedia: 1550,
      bursts: [
        {
          ...newspaperBurst().bursts[0],
          rawBudget: 1550,
        },
      ],
    }
    const asOf = "2026-10-12"
    const slices = channelExpectedToDate(octoberInput(asOf, [mixed]))
    const plain = channelExpectedToDate(octoberInput(asOf))
    const newspaper = slices.find((slice) => slice.key === "newspaper")
    const schedule = plain.find((slice) => slice.key === "newspaper")
    assert.ok(newspaper && schedule)
    const assumedToDate = assumedLineToDateCents(mixed, asOf) / 100
    const reportedExpected = Math.round((schedule.expected / 2) * 100) / 100
    assert.equal(Math.round(newspaper.expected * 100), Math.round((reportedExpected + assumedToDate) * 100))

    const reportedSpend = reportedExpected / 2
    const delivered = reportedSpend + assumedToDate
    const expected = newspaper.expected
    assert.equal(
      Math.round(assumedDeliveryPacePct(delivered, expected) * 100) / 100,
      Math.round((delivered / expected) * 100 * 100) / 100,
    )

    const allocated = reconcileLineExpected(
      newspaper.expected,
      [
        { id: mixed.id, lineExpected: assumedToDate, plannedMedia: mixed.plannedMedia },
        { id: "reported", lineExpected: reportedExpected, plannedMedia: 1550 },
      ],
      new Map([[mixed.id, assumedToDate]]),
    )
    const lineSum = [...allocated.values()].reduce((total, value) => total + value, 0)
    assert.equal(Math.round(lineSum * 100), Math.round(newspaper.expected * 100))

    const headline = resolveCampaignExpectedSpendToDate(octoberInput(asOf, [mixed]))
    const channelSum = slices.reduce((total, slice) => total + Math.round(slice.expected * 100), 0)
    assert.equal(channelSum, Math.round(headline * 100))
  })

  it("does not treat bonus or package_inclusions as assumed", () => {
    const plain = channelExpectedToDate(octoberInput("2026-10-12"))
    for (const buyType of ["bonus", "package_inclusions"]) {
      const slices = channelExpectedToDate(octoberInput("2026-10-12", [newspaperBurst(buyType)]))
      const before = plain.find((slice) => slice.key === "newspaper")
      const after = slices.find((slice) => slice.key === "newspaper")
      assert.equal(after?.expected, before?.expected)
    }
  })
})
