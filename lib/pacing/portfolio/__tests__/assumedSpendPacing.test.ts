import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  adServingFixture,
  directGroupFixture,
  directLineFixture,
  programmaticFixture,
  socialFixture,
} from "@/lib/pacing/channel/__tests__/fixtures"
import type { DirectDailyPoint, DirectLineItemRow } from "@/lib/pacing/direct/types"
import { assembleCampaignPacingRows } from "@/lib/pacing/portfolio/assembleCampaignPacingRows"
import { fromCents, toCents } from "@/lib/money/cents"
import { assumedLineToDateCents, type AssumedExpectedLine } from "@/lib/spend/assumedSpend"
import { channelSpendCaption } from "@/lib/pacing/portfolio/channelSpendCaption"
import type { ChannelPacingRow } from "@/lib/pacing/portfolio/types"

const AS_OF = "2026-10-12"
const EXPECTED = 2_000

function assumedDay(reportedSpend: number): DirectDailyPoint {
  return {
    dateDay: "2026-10-01",
    burstIndex: 0,
    reportedSpend,
    actualPlatformSpend: 0,
    actualDeliverables: 0,
    expectedDailyDeliverables: 0,
    reportedCumulative: reportedSpend,
    actualCumulative: 0,
    expectedCumulative: 0,
    isSquareupDay: false,
    isLocked: true,
    buyType: "spots",
    capApplied: "assumed_spend",
  }
}

function radioLine(id: string, reported: number, budget: number): DirectLineItemRow {
  return directLineFixture({
    lineItemId: id,
    mbaNumber: "golf025",
    lineItemName: "Radio",
    buyType: "spots",
    isCurrentlyFixedCost: false,
    totalBudget: budget,
    totalReported: reported,
    totalActual: 0,
    variance: reported,
    daily: [assumedDay(reported)],
  })
}

function assemble(args: {
  social?: ReturnType<typeof socialFixture>[]
  programmatic?: ReturnType<typeof programmaticFixture>[]
  adServing?: ReturnType<typeof adServingFixture>[]
  lines: DirectLineItemRow[]
  expected?: number
}) {
  const group = directGroupFixture({
    mbaNumber: "golf025",
    clientName: "Golf",
    campaignName: "Australian Open",
    campaignStatus: "booked",
    campaignStartDate: "2026-07-01",
    campaignEndDate: "2026-12-31",
    lineItems: args.lines,
    totalBudget: args.lines.reduce((sum, line) => sum + line.totalBudget, 0),
    totalReported: args.lines.reduce((sum, line) => sum + line.totalReported, 0),
    totalActual: 0,
    variance: 0,
  })
  const [row] = assembleCampaignPacingRows({
    asOfDate: AS_OF,
    allowedClientSlugs: null,
    liveOnly: true,
    search: [],
    social: args.social ?? [],
    programmatic: args.programmatic ?? [],
    adServing: args.adServing ?? [],
    direct: args.lines.length > 0 ? [group] : [],
    schedulesByMba: new Map([
      ["golf025", { metricsExpectedSpendToDate: args.expected ?? EXPECTED }],
    ]),
  })
  assert.ok(row)
  return row
}

describe("assumed spend pacing rows", () => {
  it("adds radio assumed spend beside social actual without double counting", () => {
    const row = assemble({
      social: [
        socialFixture({
          mbaNumber: "golf025",
          clientName: "Golf",
          campaignName: "Australian Open",
          lineItemId: "golf025SM1",
          spendToDateLineTotal: 500,
          totalLineItemBudget: 1_000,
          impressions: 10_000,
        }),
      ],
      lines: [radioLine("golf025RA1", 400, 800), radioLine("golf025RA2", 100, 200)],
    })
    const social = row.channels.find((channel) => channel.channelKey.startsWith("social-"))
    const radio = row.channels.find((channel) => channel.spendMode === "assumed")
    assert.equal(social?.spendToDate, 500)
    assert.equal(radio?.label, "Radio")
    assert.equal(radio?.spendToDate, 500)
    assert.deepEqual(radio?.lineItemIds, ["golf025RA1", "golf025RA2"])
    assert.equal(row.spendToDate, 1_000)
    assert.equal(row.expectedToDate, EXPECTED)
    assert.notEqual(row.pace, "no_source")
  })

  it("does not let an assumed channel force no_source, and still does when another channel has none", () => {
    const onlyAssumed = assemble({
      lines: [radioLine("golf025RA1", 500, 1_000)],
      expected: 1_000,
    })
    const radio = onlyAssumed.channels.find((channel) => channel.spendMode === "assumed")
    assert.equal(radio?.sourceState, "reporting")
    assert.notEqual(radio?.pace, "no_source")
    assert.notEqual(onlyAssumed.pace, "no_source")
    assert.equal(onlyAssumed.expectedToDate, 1_000)

    const withGap = assemble({
      lines: [radioLine("golf025RA1", 500, 1_000)],
      programmatic: [
        programmaticFixture({
          mbaNumber: "golf025",
          clientName: "Golf",
          campaignName: "Australian Open",
          lineItemId: "golf025PV9",
          platform: "Unmapped local site",
          platformLabel: "Unmapped local site",
          spendToDateLineTotal: 0,
          impressions: 0,
          deliverableActual: 0,
          totalLineItemBudget: 100,
        }),
      ],
      expected: 1_000,
    })
    const assumed = withGap.channels.find((channel) => channel.spendMode === "assumed")
    const unmapped = withGap.channels.find((channel) => channel.lineItemIds.includes("golf025PV9"))
    assert.equal(assumed?.sourceState, "reporting")
    assert.notEqual(assumed?.pace, "no_source")
    assert.equal(unmapped?.sourceState, "no_source")
    assert.equal(withGap.pace, "no_source")
  })

  it("drops assumed dollars once the line has a platform row", () => {
    const row = assemble({
      social: [
        socialFixture({
          mbaNumber: "golf025",
          clientName: "Golf",
          campaignName: "Australian Open",
          lineItemId: "golf025SM1",
          spendToDateLineTotal: 800,
          totalLineItemBudget: 1_000,
          impressions: 10_000,
        }),
      ],
      lines: [radioLine("golf025SM1", 400, 800)],
    })
    assert.equal(row.channels.some((channel) => channel.spendMode === "assumed"), false)
    assert.equal(row.channels.find((channel) => channel.channelKey.startsWith("social-"))?.spendToDate, 800)
    assert.equal(row.spendToDate, 800)
  })

  it("keeps a CM360 line on the estimate and a fixed-cost programmatic line on reported", () => {
    const cm = assemble({
      adServing: [
        adServingFixture({
          mbaNumber: "golf025",
          clientName: "Golf",
          campaignName: "Australian Open",
          lineItemId: "golf025DD1",
          platform: "CM360",
        }),
      ],
      lines: [radioLine("golf025DD1", 1_234, 2_000)],
    })
    const display = cm.channels.find((channel) => channel.channelKey === "digital-display")
    assert.ok(display)
    assert.notEqual(display.spendMode, "assumed")
    assert.notEqual(display.spendMode, "reported")
    assert.notEqual(display.spendToDate, 1_234)
    assert.equal(cm.channels.some((channel) => channel.spendMode === "assumed"), false)

    const fixed = assemble({
      programmatic: [
        programmaticFixture({
          mbaNumber: "golf025",
          clientName: "Golf",
          campaignName: "Australian Open",
          lineItemId: "golf025PV1",
          platform: "dv360",
          platformLabel: "DV360",
          fixedCostMedia: true,
          spendToDateLineTotal: 0,
          impressions: 0,
          deliverableActual: 0,
        }),
      ],
      lines: [
        directLineFixture({
          lineItemId: "golf025PV1",
          mbaNumber: "golf025",
          buyType: "fixed_cost",
          isCurrentlyFixedCost: true,
          totalReported: 2_500,
          totalBudget: 8_000,
          daily: [{ ...assumedDay(2_500), capApplied: "fixed_cost", buyType: "fixed_cost" }],
        }),
      ],
    })
    const prog = fixed.channels.find((channel) => channel.lineItemIds.includes("golf025PV1"))
    assert.equal(prog?.spendMode, "reported")
    assert.equal(prog?.spendToDate, 2_500)
    assert.equal(fixed.channels.some((channel) => channel.spendMode === "assumed"), false)
  })

  it("prints Assumed spend on the channel caption", () => {
    const channel = {
      channelKey: "assumed-ra",
      label: "Radio",
      spendToDate: 500,
      budget: 1_000,
      expectedToDate: 500,
      spendPct: 100,
      pace: "on_track",
      spendMode: "assumed",
      deliverable: null,
      sourceState: "reporting",
      lineItemIds: ["golf025RA1"],
    } satisfies ChannelPacingRow
    assert.equal(channelSpendCaption(channel), "Assumed spend $500 / $1,000")
  })

  it("keeps a newspaper burst that has not started On track, then matches two burst days", () => {
    const line: AssumedExpectedLine = {
      id: "golf025NP7",
      scheduleKey: "newspaper",
      plannedMedia: 3_100,
      buyType: "insertions",
      bursts: [
        {
          rawBudget: 3_100,
          budgetIncludesFees: false,
          clientPaysForMedia: true,
          feePct: 0,
          buyType: "insertions",
          startDate: "2026-10-25",
          endDate: "2026-10-31",
        },
      ],
    }
    const deliverySchedule = [
      {
        month: "October 2026",
        mediaCosts: { newspaper: "$3,100.00", socialMedia: "$3,100.00" },
        mediaTotal: "$6,200.00",
        feeTotal: "$0.00",
        totalAmount: "$6,200.00",
      },
    ]
    function rowAt(asOfDate: string) {
      const [row] = assembleCampaignPacingRows({
        asOfDate,
        allowedClientSlugs: null,
        liveOnly: true,
        search: [],
        social: [
          socialFixture({
            mbaNumber: "golf025",
            clientName: "Golf",
            campaignName: "Australian Open",
            lineItemId: "golf025SM1",
            spendToDateLineTotal: 100,
            totalLineItemBudget: 1_000,
          }),
        ],
        programmatic: [],
        adServing: [],
        direct: [],
        schedulesByMba: new Map([
          [
            "golf025",
            {
              deliverySchedule,
              campaignStartISO: "2026-07-01",
              campaignEndISO: "2026-12-31",
              assumedLines: [line],
            },
          ],
        ]),
      })
      assert.ok(row)
      return row
    }

    const early = rowAt("2026-10-12")
    const newspaper = early.channels.find((channel) => channel.channelKey === "assumed-np")
    assert.ok(newspaper)
    assert.equal(newspaper.spendToDate, 0)
    assert.equal(newspaper.expectedToDate, 0)
    assert.equal(newspaper.spendPct, 100)
    assert.equal(newspaper.pace, "on_track")
    assert.equal(newspaper.spendMode, "assumed")

    const later = rowAt("2026-10-26")
    const started = later.channels.find((channel) => channel.channelKey === "assumed-np")
    const twoDays = assumedLineToDateCents(line, "2026-10-26") / 100
    assert.ok(started)
    assert.ok(twoDays > 0)
    assert.equal(started.spendToDate, twoDays)
    assert.equal(started.expectedToDate, twoDays)
    assert.equal(started.pace, "on_track")

    const channelCents = later.channels.reduce((sum, channel) => sum + Math.round(channel.expectedToDate * 100), 0)
    assert.equal(channelCents, Math.round(later.expectedToDate * 100))
  })

  it("keeps a no-adserving digital line with CM360 rows on the estimate", () => {
    const burstDollars = 14_822.4
    const line: AssumedExpectedLine = {
      id: "golf025dv1",
      scheduleKey: "digital-video",
      plannedMedia: burstDollars,
      buyType: "cpm",
      bursts: [
        {
          rawBudget: burstDollars,
          budgetIncludesFees: false,
          clientPaysForMedia: true,
          feePct: 0,
          buyType: "cpm",
          startDate: "2026-10-01",
          endDate: "2026-10-31",
        },
      ],
    }
    const [row] = assembleCampaignPacingRows({
      asOfDate: "2026-10-13",
      allowedClientSlugs: null,
      liveOnly: true,
      search: [],
      social: [],
      programmatic: [],
      adServing: [
        adServingFixture({
          mbaNumber: "golf025",
          clientName: "Golf",
          campaignName: "Australian Open",
          campaignStatus: "booked",
          campaignStartDate: "2026-10-01",
          campaignEndDate: "2026-10-31",
          lineItemId: "golf025dv1",
          channelFamily: "digitalVideo",
          impressions: 114_656,
          clicks: 12,
          platform: "CM360",
        }),
      ],
      direct: [],
      schedulesByMba: new Map([
        [
          "golf025",
          {
            deliverySchedule: [
              {
                month: "October 2026",
                mediaCosts: { digiVideo: "$14,423.91" },
                mediaTotal: "$14,423.91",
                feeTotal: "$0.00",
                totalAmount: "$14,423.91",
              },
            ],
            campaignStartISO: "2026-10-01",
            campaignEndISO: "2026-10-31",
            assumedLines: [line],
          },
        ],
      ]),
    })
    assert.ok(row)
    const video = row.channels.find((channel) => channel.channelKey === "digital-video")
    assert.ok(video)
    assert.equal(video.spendMode, "estimated")
    assert.notEqual(toCents(video.spendToDate), toCents(burstDollars))
    assert.ok(video.spendToDate > 0)
    assert.equal(row.channels.some((channel) => channel.spendMode === "assumed"), false)
    assert.equal(toCents(video.expectedToDate), toCents(row.expectedToDate))
  })

  it("assumes a no-adserving digital line when no delivery rows are loaded", () => {
    const line: AssumedExpectedLine = {
      id: "golf025dv1",
      scheduleKey: "digital-video",
      plannedMedia: 3_100,
      buyType: "cpm",
      bursts: [
        {
          rawBudget: 3_100,
          budgetIncludesFees: false,
          clientPaysForMedia: true,
          feePct: 0,
          buyType: "cpm",
          startDate: "2026-10-01",
          endDate: "2026-10-31",
        },
      ],
    }
    const [row] = assembleCampaignPacingRows({
      asOfDate: "2026-10-13",
      allowedClientSlugs: null,
      liveOnly: true,
      search: [],
      social: [
        socialFixture({
          mbaNumber: "golf025",
          clientName: "Golf",
          campaignName: "Australian Open",
          lineItemId: "golf025SM1",
          spendToDateLineTotal: 100,
          totalLineItemBudget: 1_000,
          impressions: 10,
        }),
      ],
      programmatic: [],
      adServing: [],
      direct: [],
      schedulesByMba: new Map([
        [
          "golf025",
          {
            deliverySchedule: [
              {
                month: "October 2026",
                mediaCosts: { digiVideo: "$3,100.00" },
                mediaTotal: "$3,100.00",
                feeTotal: "$0.00",
                totalAmount: "$3,100.00",
              },
            ],
            campaignStartISO: "2026-07-01",
            campaignEndISO: "2026-12-31",
            assumedLines: [line],
          },
        ],
      ]),
    })
    assert.ok(row)
    const video = row.channels.find((channel) => channel.channelKey === "assumed-dv")
    assert.ok(video)
    assert.equal(video.spendMode, "assumed")
    assert.equal(video.spendPct, 100)
    assert.equal(video.pace, "on_track")
    assert.equal(toCents(video.spendToDate), toCents(video.expectedToDate))
  })

  it("sums golf025-shaped channels to the headline to the cent", () => {
    const newspaper: AssumedExpectedLine = {
      id: "golf025NP7",
      scheduleKey: "newspaper",
      plannedMedia: 3_100,
      buyType: "insertions",
      bursts: [
        {
          rawBudget: 3_100,
          budgetIncludesFees: false,
          clientPaysForMedia: true,
          feePct: 0,
          buyType: "insertions",
          startDate: "2026-10-25",
          endDate: "2026-10-31",
        },
      ],
    }
    const video: AssumedExpectedLine = {
      id: "golf025dv1",
      scheduleKey: "digital-video",
      plannedMedia: 14_822.4,
      buyType: "cpm",
      bursts: [
        {
          rawBudget: 14_822.4,
          budgetIncludesFees: false,
          clientPaysForMedia: true,
          feePct: 0,
          buyType: "cpm",
          startDate: "2026-10-01",
          endDate: "2026-10-31",
        },
      ],
    }
    const [row] = assembleCampaignPacingRows({
      asOfDate: "2026-10-13",
      allowedClientSlugs: null,
      liveOnly: true,
      search: [],
      social: [
        socialFixture({
          mbaNumber: "golf025",
          clientName: "Golf",
          campaignName: "Australian Open",
          campaignStatus: "booked",
          campaignStartDate: "2026-10-01",
          campaignEndDate: "2026-10-31",
          lineItemId: "golf025SM1",
          spendToDateLineTotal: 800,
          totalLineItemBudget: 1_000,
          impressions: 10_000,
        }),
      ],
      programmatic: [],
      adServing: [
        adServingFixture({
          mbaNumber: "golf025",
          clientName: "Golf",
          campaignName: "Australian Open",
          campaignStatus: "booked",
          campaignStartDate: "2026-10-01",
          campaignEndDate: "2026-10-31",
          lineItemId: "golf025dv1",
          channelFamily: "digitalVideo",
          impressions: 114_656,
          clicks: 12,
          platform: "CM360",
        }),
      ],
      direct: [],
      schedulesByMba: new Map([
        [
          "golf025",
          {
            deliverySchedule: [
              {
                month: "October 2026",
                mediaCosts: {
                  socialMedia: "$11,466.00",
                  digiVideo: "$14,423.91",
                  newspaper: "$2,000.00",
                },
                mediaTotal: "$27,889.91",
                feeTotal: "$0.00",
                totalAmount: "$27,889.91",
              },
            ],
            campaignStartISO: "2026-10-01",
            campaignEndISO: "2026-10-31",
            assumedLines: [newspaper, video],
          },
        ],
      ]),
    })
    assert.ok(row)
    const videoChannel = row.channels.find((channel) => channel.channelKey === "digital-video")
    const paper = row.channels.find((channel) => channel.channelKey === "assumed-np")
    assert.equal(videoChannel?.spendMode, "estimated")
    assert.equal(paper?.spendMode, "assumed")
    assert.equal(paper?.pace, "on_track")
    const channelCents = row.channels.reduce((sum, channel) => sum + toCents(channel.expectedToDate), 0)
    assert.equal(channelCents, toCents(row.expectedToDate))
    assert.equal(fromCents(channelCents), row.expectedToDate)
  })
})
