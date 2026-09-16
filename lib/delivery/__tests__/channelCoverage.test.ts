import assert from "node:assert/strict"
import test from "node:test"

import { channelMediaTypeColour } from "@/components/dashboard/delivery/channels/channelMediaTypeColour"
import type { ChannelSectionData } from "@/components/dashboard/delivery/channels/types"
import type { ProgressCardProps } from "@/components/dashboard/delivery/shared/ProgressCard"
import {
  channelCoverage,
  firstAheadChannelName,
  visibleCoverageCards,
  type ChannelCoverageBuckets,
} from "../channelCoverage"

const TODAY = "2026-03-01"

function emptyBuckets(): ChannelCoverageBuckets {
  return {
    socialLineItems: [],
    searchLineItems: [],
    progDisplayLineItems: [],
    progVideoLineItems: [],
    progOohLineItems: [],
    digitalDisplayLineItems: [],
    digitalVideoLineItems: [],
    digitalAudioLineItems: [],
    bvodLineItems: [],
  }
}

function progressCard(
  title: string,
  value: string,
  status: ProgressCardProps["status"] = "on-track",
  detail?: string,
): ProgressCardProps {
  return {
    title,
    value,
    detail: detail ?? `Delivered ${value} · Planned 0`,
    progress: 0.4,
    variance: 0,
    status,
  }
}

function section(partial: {
  key: ChannelSectionData["key"]
  lineIds?: string[]
  daily?: Array<Record<string, string | number>>
  spendValue?: string
  impressionsValue?: string
  impressionsTitle?: string
  impressionsDetail?: string
  spendStatus?: ProgressCardProps["status"]
  impressionsStatus?: ProgressCardProps["status"]
}): ChannelSectionData {
  const spend = progressCard("Spend", partial.spendValue ?? "$1,000.00", partial.spendStatus)
  const impressions = progressCard(
    partial.impressionsTitle ?? "Impressions",
    partial.impressionsValue ?? "50,000",
    partial.impressionsStatus,
    partial.impressionsDetail,
  )
  const daily = partial.daily ?? [{ date: "2026-02-01", spend: 100, impressions: 500 }]
  const lineIds = partial.lineIds ?? []
  return {
    key: partial.key,
    title: String(partial.key),
    dateRange: { startISO: "2026-01-01", endISO: "2026-06-01" },
    lastSyncedAt: null,
    connections: [],
    mediaTypeColour: "#000",
    aggregate: {
      summaryChips: [],
      progressCards: [spend, impressions],
      kpiBand: { tiles: [] },
      chart: { daily, series: [], asAtDate: null },
    },
    lineItems: lineIds.map((id) => ({
      id,
      block: {
        name: id,
        progressCards: [spend, impressions],
        kpiBand: { tiles: [] },
        chart: { kind: "daily-delivery", daily, series: [], asAtDate: null },
      },
    })),
  }
}

test("reporting when the group's section has a fact row in the window", () => {
  const buckets = emptyBuckets()
  buckets.socialLineItems = [
    {
      line_item_id: "mba001sm1",
      platform: "Meta",
      budget: 20_000,
      impressions: 0,
      bursts: [{ startDate: "2026-01-01", endDate: "2026-04-01", budget: 20_000 }],
    },
  ]
  const entries = channelCoverage({
    buckets,
    sections: [
      section({
        key: "social-meta",
        lineIds: ["mba001sm1"],
        spendValue: "$8,000.00",
        impressionsValue: "180,000",
        impressionsDetail: "Delivered 180,000 · Planned 400,000",
        spendStatus: "ahead",
        impressionsStatus: "on-track",
      }),
    ],
    todayISO: TODAY,
  })
  const meta = entries.find((e) => e.key === "social-meta")
  assert.ok(meta)
  assert.equal(meta.status, "reporting")
  assert.equal(meta.label, "Social · Meta")
  assert.equal(meta.colour, channelMediaTypeColour("social-meta"))
  assert.equal(meta.plannedSpend, 20_000)
  assert.equal(meta.plannedImpressions, 400_000)
  assert.equal(meta.deliverableLabel, "Impressions")
  assert.equal(meta.deliveredSpend, 8_000)
  assert.equal(meta.deliveredImpressions, 180_000)
  assert.equal(meta.deliveryStatus, "ahead")
})

test("connecting when a delivery source exists but there are no fact rows yet", () => {
  const buckets = emptyBuckets()
  buckets.socialLineItems = [
    {
      line_item_id: "mba001sr1",
      platform: "Reddit",
      budget: 5_000,
      impressions: 80_000,
      bursts: [{ startDate: "2026-01-15", endDate: "2026-04-01", budget: 5_000 }],
    },
  ]
  const entries = channelCoverage({
    buckets,
    sections: [],
    todayISO: TODAY,
  })
  const reddit = entries.find((e) => e.key === "social-reddit")
  assert.ok(reddit)
  assert.equal(reddit.status, "connecting")
  assert.equal(reddit.label, "Social · Reddit")
  assert.equal(reddit.deliveredSpend, 0)
  assert.equal(reddit.deliveredImpressions, 0)
})

test("not_started when the group's earliest burst starts after today", () => {
  const buckets = emptyBuckets()
  buckets.progVideoLineItems = [
    {
      line_item_id: "mba001pv1",
      publisher: "Channel Factory",
      platform: "YouTube",
      budget: 12_000,
      impressions: 250_000,
      bursts: [{ startDate: "2026-06-01", endDate: "2026-07-01", budget: 12_000 }],
    },
  ]
  const entries = channelCoverage({
    buckets,
    sections: [],
    todayISO: TODAY,
  })
  const video = entries.find((e) => e.key === "programmatic-video:channel factory")
  assert.ok(video)
  assert.equal(video.status, "not_started")
  assert.equal(video.label, "Prog Video · Channel Factory")
  assert.equal(video.startsOn, "2026-06-01")
})

test("no_source when unclassified social has no map row or classifier hit", () => {
  const buckets = emptyBuckets()
  buckets.socialLineItems = [
    {
      line_item_id: "mba001sx1",
      platform: "LinkedIn",
      budget: 3_000,
      impressions: 10_000,
      bursts: [{ startDate: "2026-01-01", endDate: "2026-04-01", budget: 3_000 }],
    },
  ]
  const entries = channelCoverage({
    buckets,
    sections: [],
    todayISO: TODAY,
  })
  assert.equal(entries.length, 1)
  assert.equal(entries[0]?.status, "no_source")
  assert.deepEqual(visibleCoverageCards(entries), [])
})

test("CM360 Direct Booked Digital spend is hidden unless derive_spend_from_plan", () => {
  const buckets = emptyBuckets()
  buckets.digitalDisplayLineItems = [
    {
      line_item_id: "mba001dd1",
      publisher: "Nine",
      budget: 15_000,
      impressions: 900_000,
      bursts: [{ startDate: "2026-01-01", endDate: "2026-04-01", budget: 15_000 }],
    },
  ]
  const impressions = progressCard(
    "Impressions delivery",
    "120,000",
    "on-track",
    "Delivered 120,000 · Planned 900,000",
  )
  const clicks = progressCard("Clicks delivery", "100", "on-track", "Delivered 100 · Planned 0")
  const daily = [{ date: "2026-02-01", impressions: 500 }]
  const entries = channelCoverage({
    buckets,
    sections: [
      {
        key: "digital-display",
        title: "digital-display",
        dateRange: { startISO: "2026-01-01", endISO: "2026-06-01" },
        lastSyncedAt: null,
        connections: [],
        mediaTypeColour: "#000",
        aggregate: {
          summaryChips: [],
          progressCards: [impressions, clicks],
          kpiBand: { tiles: [] },
          chart: { daily, series: [], asAtDate: null },
        },
        lineItems: [
          {
            id: "mba001dd1",
            block: {
              name: "mba001dd1",
              progressCards: [impressions, clicks],
              kpiBand: { tiles: [] },
              chart: { kind: "daily-delivery", daily, series: [], asAtDate: null },
            },
          },
        ],
      },
    ],
    todayISO: TODAY,
  })
  const digital = entries.find((e) => e.key === "digital-display")
  assert.ok(digital)
  assert.equal(digital.status, "reporting")
  assert.equal(digital.deliveredSpend, null)
  assert.equal(digital.spendModelled, false)
  assert.equal(digital.deliveredImpressions, 120_000)
  assert.equal(digital.plannedSpend, 15_000)
})

test("BVOD glance card sums CM360 impressions and planned deliverables from line captions", () => {
  const buckets = emptyBuckets()
  buckets.bvodLineItems = [
    {
      line_item_id: "bicau002bv1",
      publisher: "7plus",
      budget: 8_000,
      impressions: 0,
      bursts: [{ startDate: "2026-01-01", endDate: "2026-04-01", budget: 8_000 }],
    },
    {
      line_item_id: "bicau002bv2",
      publisher: "9Now",
      budget: 8_000,
      impressions: 0,
      bursts: [{ startDate: "2026-01-01", endDate: "2026-04-01", budget: 8_000 }],
    },
    {
      line_item_id: "bicau002bv3",
      publisher: "10 Play",
      budget: 8_000,
      impressions: 0,
      bursts: [{ startDate: "2026-01-01", endDate: "2026-04-01", budget: 8_000 }],
    },
  ]
  const clicks = progressCard("Clicks delivery", "100", "on-track", "Delivered 100 · Planned 0")
  const lineCards = [
    progressCard("Impressions delivery", "200,000", "ahead", "Delivered 200,000 · Planned 150,000"),
    progressCard("Impressions delivery", "200,000", "ahead", "Delivered 200,000 · Planned 150,000"),
    progressCard("Impressions delivery", "124,600", "ahead", "Delivered 124,600 · Planned 164,286"),
  ]
  const daily = [{ date: "2026-02-01", impressions: 1_000 }]
  const lineItems = ["bicau002bv1", "bicau002bv2", "bicau002bv3"].map((id, i) => ({
    id,
    block: {
      name: id,
      progressCards: [lineCards[i]!, clicks],
      kpiBand: { tiles: [] },
      chart: { kind: "daily-delivery" as const, daily, series: [], asAtDate: null },
    },
  }))
  const entries = channelCoverage({
    buckets,
    sections: [
      {
        key: "bvod",
        title: "BVOD",
        dateRange: { startISO: "2026-01-01", endISO: "2026-06-01" },
        lastSyncedAt: null,
        connections: [],
        mediaTypeColour: "#000",
        aggregate: {
          summaryChips: [],
          progressCards: [
            progressCard("Impressions delivery", "0", "no-data", "Delivered 0 · Planned 0"),
            clicks,
          ],
          kpiBand: { tiles: [] },
          chart: { daily: [], series: [], asAtDate: null },
        },
        lineItems,
      },
    ],
    todayISO: TODAY,
  })
  const bvod = entries.find((e) => e.key === "bvod")
  assert.ok(bvod)
  assert.equal(bvod.status, "reporting")
  assert.equal(bvod.deliveredSpend, null)
  assert.equal(bvod.deliveredImpressions, 524_600)
  assert.equal(bvod.plannedImpressions, 464_286)
  assert.equal(bvod.deliverableLabel, "Impressions")
})

test("order is reporting, connecting, not_started; within each by plannedSpend desc", () => {
  const buckets = emptyBuckets()
  buckets.socialLineItems = [
    {
      line_item_id: "mba001sm1",
      platform: "Meta",
      budget: 4_000,
      impressions: 40_000,
      bursts: [{ startDate: "2026-01-01", endDate: "2026-04-01", budget: 4_000 }],
    },
    {
      line_item_id: "mba001st1",
      platform: "TikTok",
      budget: 9_000,
      impressions: 90_000,
      bursts: [{ startDate: "2026-01-01", endDate: "2026-04-01", budget: 9_000 }],
    },
  ]
  buckets.progOohLineItems = [
    {
      line_item_id: "mba001po1",
      publisher: "Vistar",
      budget: 7_000,
      impressions: 0,
      bursts: [{ startDate: "2026-01-01", endDate: "2026-04-01", budget: 7_000 }],
    },
  ]
  buckets.progVideoLineItems = [
    {
      line_item_id: "mba001pv1",
      publisher: "Channel Factory",
      budget: 11_000,
      impressions: 100_000,
      bursts: [{ startDate: "2026-08-01", endDate: "2026-09-01", budget: 11_000 }],
    },
  ]
  const cards = visibleCoverageCards(
    channelCoverage({
      buckets,
      sections: [
        section({
          key: "social-meta",
          lineIds: ["mba001sm1"],
          spendValue: "$1,000.00",
          impressionsValue: "10,000",
        }),
        section({
          key: "social-tiktok",
          lineIds: ["mba001st1"],
          spendValue: "$2,000.00",
          impressionsValue: "20,000",
        }),
      ],
      todayISO: TODAY,
    }),
  )
  assert.deepEqual(
    cards.map((e) => e.key),
    [
      "social-tiktok",
      "social-meta",
      "programmatic-ooh:vistar",
      "programmatic-video:channel factory",
    ],
  )
  assert.equal(cards[0]?.status, "reporting")
  assert.equal(cards[1]?.status, "reporting")
  assert.equal(cards[2]?.status, "connecting")
  assert.equal(cards[2]?.label, "Programmatic OOH · Vistar")
  assert.equal(cards[3]?.status, "not_started")
})

test("CPV group planned views come from the section caption; card noun is Views", () => {
  const buckets = emptyBuckets()
  buckets.progVideoLineItems = [
    {
      line_item_id: "bicau006pv1",
      publisher: "Channel Factory",
      platform: "YouTube",
      buy_type: "cpv",
      budget: 12_000,
      impressions: 0,
      bursts: [{ startDate: "2026-01-01", endDate: "2026-04-01", budget: 12_000 }],
    },
  ]
  const entries = channelCoverage({
    buckets,
    sections: [
      section({
        key: "programmatic-video",
        lineIds: ["bicau006pv1"],
        spendValue: "$4,000.00",
        impressionsTitle: "Views delivery",
        impressionsValue: "86,956",
        impressionsDetail: "Delivered 86,956 · Planned 885,173",
      }),
    ],
    todayISO: TODAY,
  })
  const video = entries.find((e) => e.key === "programmatic-video:channel factory")
  assert.ok(video)
  assert.equal(video.status, "reporting")
  assert.equal(video.plannedImpressions, 885_173)
  assert.equal(video.deliveredImpressions, 86_956)
  assert.equal(video.deliverableLabel, "Views")
})

test("firstAheadChannelName follows glance card status, not impressions", () => {
  const buckets = emptyBuckets()
  buckets.socialLineItems = [
    {
      line_item_id: "mba001sm1",
      platform: "Meta",
      budget: 20_000,
      impressions: 0,
      bursts: [{ startDate: "2026-01-01", endDate: "2026-04-01", budget: 20_000 }],
    },
    {
      line_item_id: "mba001sr1",
      platform: "Reddit",
      budget: 5_000,
      impressions: 0,
      bursts: [{ startDate: "2026-01-01", endDate: "2026-04-01", budget: 5_000 }],
    },
  ]
  const noneAhead = channelCoverage({
    buckets,
    sections: [
      section({
        key: "social-meta",
        lineIds: ["mba001sm1"],
        spendValue: "$2,000.00",
        impressionsValue: "180,000",
        impressionsDetail: "Delivered 180,000 · Planned 400,000",
        spendStatus: "behind",
        impressionsStatus: "ahead",
      }),
      section({
        key: "social-reddit",
        lineIds: ["mba001sr1"],
        spendValue: "$1,000.00",
        impressionsValue: "40,000",
        impressionsDetail: "Delivered 40,000 · Planned 80,000",
        spendStatus: "on-track",
        impressionsStatus: "ahead",
      }),
    ],
    todayISO: TODAY,
  })
  assert.equal(firstAheadChannelName(noneAhead), null)

  const redditAhead = channelCoverage({
    buckets,
    sections: [
      section({
        key: "social-meta",
        lineIds: ["mba001sm1"],
        spendValue: "$2,000.00",
        impressionsValue: "180,000",
        impressionsDetail: "Delivered 180,000 · Planned 400,000",
        spendStatus: "behind",
        impressionsStatus: "ahead",
      }),
      section({
        key: "social-reddit",
        lineIds: ["mba001sr1"],
        spendValue: "$4,000.00",
        impressionsValue: "40,000",
        impressionsDetail: "Delivered 40,000 · Planned 80,000",
        spendStatus: "ahead",
        impressionsStatus: "behind",
      }),
    ],
    todayISO: TODAY,
  })
  assert.equal(firstAheadChannelName(redditAhead), "Social · Reddit")
})
