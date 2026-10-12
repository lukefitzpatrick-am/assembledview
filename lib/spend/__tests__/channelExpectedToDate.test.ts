import assert from "node:assert/strict"
import { describe, it } from "node:test"

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
})
