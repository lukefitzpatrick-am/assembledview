import assert from "node:assert/strict"
import test from "node:test"

import { channelMediaTypeColour } from "@/components/dashboard/delivery/channels/channelMediaTypeColour"
import type { ChannelSectionData } from "@/components/dashboard/delivery/channels/types"
import type { ProgressCardProps } from "@/components/dashboard/delivery/shared/ProgressCard"
import {
  channelCoverage,
  firstAheadChannelName,
  sumReportingExpectedImpressionsToDate,
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
  const lineIds = ["bicau002bv1", "bicau002bv2", "bicau002bv3"] as const
  const lineItems: ChannelSectionData["lineItems"] = lineIds.map((id, i) => ({
    id,
    block: {
      name: id,
      progressCards: [lineCards[i]!, clicks],
      kpiBand: { tiles: [] },
      chart: { kind: "daily-delivery", daily, series: [], asAtDate: null },
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

test("BVOD glance card sums reported spend when fixed-cost lines have a spend card", () => {
  const buckets = emptyBuckets()
  buckets.bvodLineItems = [
    {
      line_item_id: "bicau002bv2",
      publisher: "Seven",
      budget: 6_500,
      impressions: 0,
      fixedCostMedia: true,
      bursts: [{ startDate: "2026-01-01", endDate: "2026-04-01", budget: 6_500 }],
    },
    {
      line_item_id: "bicau002bv3",
      publisher: "Seven",
      budget: 6_500,
      impressions: 0,
      fixedCostMedia: true,
      bursts: [{ startDate: "2026-01-01", endDate: "2026-04-01", budget: 6_500 }],
    },
    {
      line_item_id: "bicau002bv4",
      publisher: "Seven",
      budget: 6_500,
      impressions: 0,
      fixedCostMedia: true,
      bursts: [{ startDate: "2026-01-01", endDate: "2026-04-01", budget: 6_500 }],
    },
  ]
  const spendCards = [
    progressCard(
      "Reported spend (fixed cost)",
      "$3,221.16",
      "behind",
      "Delivered $3,221.16 · Planned $6,500.00",
    ),
    progressCard(
      "Reported spend (fixed cost)",
      "$3,265.03",
      "behind",
      "Delivered $3,265.03 · Planned $6,500.00",
    ),
    progressCard(
      "Reported spend (fixed cost)",
      "$3,366.66",
      "behind",
      "Delivered $3,366.66 · Planned $6,500.00",
    ),
  ]
  const impressionCards = [
    progressCard("Impressions delivery", "80,000", "on-track", "Delivered 80,000 · Planned 100,000"),
    progressCard("Impressions delivery", "80,000", "on-track", "Delivered 80,000 · Planned 100,000"),
    progressCard("Impressions delivery", "80,000", "on-track", "Delivered 80,000 · Planned 100,000"),
  ]
  const daily = [{ date: "2026-02-01", impressions: 1_000 }]
  const lineIds = ["bicau002bv2", "bicau002bv3", "bicau002bv4"] as const
  const lineItems: ChannelSectionData["lineItems"] = lineIds.map((id, i) => ({
    id,
    block: {
      name: id,
      progressCards: [spendCards[i]!, impressionCards[i]!],
      kpiBand: { tiles: [] },
      chart: { kind: "daily-delivery", daily, series: [], asAtDate: null },
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
            progressCard(
              "Reported spend (fixed cost)",
              "$9,852.85",
              "behind",
              "Delivered $9,852.85 · Planned $19,500.00",
            ),
            progressCard("Impressions delivery", "240,000", "on-track", "Delivered 240,000 · Planned 300,000"),
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
  assert.equal(bvod.deliveredSpend, 9852.85)
  assert.equal(bvod.plannedSpend, 19_500)
  assert.equal(bvod.deliveredImpressions, 240_000)
})

test("direct-digital group with CM360 rows is reporting even without a map row", () => {
  const buckets = emptyBuckets()
  buckets.digitalVideoLineItems = [
    {
      line_item_id: "bicau002dv1",
      publisher: "Supercars",
      budget: 6_000,
      impressions: 0,
      bursts: [{ startDate: "2026-01-01", endDate: "2026-04-01", budget: 6_000 }],
    },
  ]
  const entries = channelCoverage({
    buckets,
    sections: [
      section({
        key: "digital-video",
        lineIds: ["bicau002dv1"],
        spendValue: "$0.00",
        impressionsValue: "10,000",
        impressionsDetail: "Delivered 10,000 · Planned 80,000",
      }),
    ],
    todayISO: TODAY,
  })
  const video = entries.find((e) => e.key === "digital-video")
  assert.ok(video)
  assert.equal(video.status, "reporting")
})

test("direct-digital group with a map row and no fact rows is connecting", () => {
  const buckets = emptyBuckets()
  buckets.digitalVideoLineItems = [
    {
      line_item_id: "mba001dv1",
      publisher: "Quantcast",
      budget: 6_000,
      impressions: 0,
      bursts: [{ startDate: "2026-01-01", endDate: "2026-04-01", budget: 6_000 }],
    },
  ]
  const entries = channelCoverage({
    buckets,
    sections: [],
    todayISO: TODAY,
  })
  const video = entries.find((e) => e.key === "digital-video")
  assert.ok(video)
  assert.equal(video.status, "connecting")
  assert.equal(video.label, "Digital Video")
})

test("direct-digital group with no map row and no fact rows is no_source", () => {
  const buckets = emptyBuckets()
  buckets.digitalVideoLineItems = [
    {
      line_item_id: "bicau002dv2",
      publisher: "Supercars",
      budget: 6_000,
      impressions: 0,
      bursts: [{ startDate: "2026-01-01", endDate: "2026-04-01", budget: 6_000 }],
    },
  ]
  const entries = channelCoverage({
    buckets,
    sections: [],
    todayISO: TODAY,
  })
  const video = entries.find((e) => e.key === "digital-video")
  assert.ok(video)
  assert.equal(video.status, "no_source")
  assert.deepEqual(visibleCoverageCards(entries), [])
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

test("programmatic OOH glance impressions come from IMPRESSIONS not plays", () => {
  const buckets = emptyBuckets()
  buckets.progOohLineItems = [
    {
      line_item_id: "sinch001po1",
      publisher: "Vistar",
      buy_type: "cpm",
      budget: 10_000,
      impressions: 0,
      bursts: [{ startDate: "2026-01-01", endDate: "2026-04-01", budget: 10_000 }],
    },
  ]
  const entries = channelCoverage({
    buckets,
    sections: [
      section({
        key: "programmatic-ooh",
        lineIds: ["sinch001po1"],
        spendValue: "$576.02",
        impressionsTitle: "Impressions delivery",
        impressionsValue: "257,094",
        impressionsDetail: "Delivered 257,094 · Planned 1,071,429",
      }),
    ],
    todayISO: TODAY,
  })
  const ooh = entries.find((e) => e.key === "programmatic-ooh:vistar")
  assert.ok(ooh)
  assert.equal(ooh.status, "reporting")
  assert.equal(ooh.deliveredImpressions, 257_094)
  assert.equal(ooh.plannedImpressions, 1_071_429)
  assert.equal(ooh.deliverableLabel, "Impressions")
  assert.notEqual(ooh.deliveredImpressions, 57_602)
})

/** 2026-10-04T13:00:00.000Z is 5 Oct in Melbourne (AEDT). */
const GOLF_TODAY = "2026-10-14"
const RADIO_INCLUSION_START = "2026-10-04T13:00:00.000Z"
const RADIO_PAID_START = "2026-11-15T13:00:00.000Z"
const OOH_INCLUSION_START = "2026-10-31T13:00:00.000Z"
const OOH_PAID_START = "2026-11-21T13:00:00.000Z"

function zeroBurstLine(id: string, start: string) {
  return {
    line_item_id: id,
    budget: 0,
    buy_type: "package_inclusions",
    bursts: [{ startDate: start, endDate: "2026-12-31T13:00:00.000Z", budget: 0 }],
  }
}

function paidBurstLine(id: string, start: string, budget: number, buyType: string) {
  return {
    line_item_id: id,
    budget,
    buy_type: buyType,
    bursts: [{ startDate: start, endDate: "2026-12-31T13:00:00.000Z", budget }],
  }
}

test("golf025 radio startsOn is the first paid burst, not a $0 inclusion", () => {
  const buckets = emptyBuckets()
  buckets.offlineLineItems = [
    ...Array.from({ length: 36 }, (_, index) =>
      zeroBurstLine(`golf025RA${index + 1}`, RADIO_INCLUSION_START),
    ),
    paidBurstLine("golf025RA37", RADIO_PAID_START, 8_000, "spots"),
  ]
  const radio = channelCoverage({
    buckets,
    sections: [],
    todayISO: GOLF_TODAY,
    channelExpected: [{ key: "radio", expected: 0, planned: 8_000 }],
  }).find((entry) => entry.key === "radio")
  assert.ok(radio)
  assert.equal(radio.startsOn, "2026-11-16")
  assert.equal(radio.spendAssumed, true)
  assert.equal(radio.expectedToDate, 0)
  assert.equal(radio.deliveredSpend, 0)
  assert.equal(radio.status, "reporting")
})

test("golf025 OOH startsOn is the paid package, not the $0 inclusion", () => {
  const buckets = emptyBuckets()
  buckets.offlineLineItems = [
    zeroBurstLine("golf025OH1", OOH_INCLUSION_START),
    paidBurstLine("golf025OH2", OOH_PAID_START, 22_000, "package"),
  ]
  const ooh = channelCoverage({
    buckets,
    sections: [],
    todayISO: GOLF_TODAY,
    channelExpected: [{ key: "ooh", expected: 0, planned: 22_000 }],
  }).find((entry) => entry.key === "ooh")
  assert.ok(ooh)
  assert.equal(ooh.startsOn, "2026-11-22")
  assert.equal(ooh.expectedToDate, 0)
  assert.equal(ooh.deliveredSpend, 0)
})

test("a channel with only $0 lines falls back to the earliest burst", () => {
  const buckets = emptyBuckets()
  buckets.offlineLineItems = [
    zeroBurstLine("golf025RA2", "2026-11-01T13:00:00.000Z"),
    zeroBurstLine("golf025RA1", RADIO_INCLUSION_START),
  ]
  const radio = channelCoverage({
    buckets,
    sections: [],
    todayISO: GOLF_TODAY,
  }).find((entry) => entry.key === "radio")
  assert.ok(radio)
  assert.equal(radio.startsOn, "2026-10-05")
})

test("a digital group startsOn ignores $0 bursts that begin before the paid flight", () => {
  const buckets = emptyBuckets()
  buckets.socialLineItems = [
    { ...zeroBurstLine("golf025SM1", RADIO_INCLUSION_START), platform: "Meta" },
    { ...paidBurstLine("golf025SM2", RADIO_PAID_START, 4_000, "cpm"), platform: "Meta" },
  ]
  const meta = channelCoverage({
    buckets,
    sections: [],
    todayISO: GOLF_TODAY,
  }).find((entry) => entry.key === "social-meta")
  assert.ok(meta)
  assert.equal(meta.startsOn, "2026-11-16")
})

test("assumed radio that has started stays on track when expected is above 0", () => {
  const buckets = emptyBuckets()
  buckets.offlineLineItems = [
    paidBurstLine("golf025RA1", "2026-10-01", 1_000, "spots"),
  ]
  const radio = channelCoverage({
    buckets,
    sections: [],
    todayISO: GOLF_TODAY,
    channelExpected: [{ key: "radio", expected: 400, planned: 1_000 }],
    assumedLines: [
      {
        id: "golf025RA1",
        scheduleKey: "radio",
        plannedMedia: 400,
        buyType: "spots",
        bursts: [
          {
            rawBudget: 400,
            budgetIncludesFees: false,
            clientPaysForMedia: true,
            feePct: 0,
            buyType: "spots",
            startDate: "2026-10-01",
            endDate: "2026-10-01",
          },
        ],
      },
    ],
  }).find((entry) => entry.key === "radio")
  assert.ok(radio)
  assert.equal(radio.startsOn, "2026-10-01")
  assert.equal(radio.status, "reporting")
  assert.equal(radio.expectedToDate, 400)
  assert.equal(radio.deliveredSpend, 400)
  assert.equal(radio.deliveryStatus, "on-track")
})

test("expected impressions come from the cards' numeric fields, not the detail text", () => {
  const buckets = emptyBuckets()
  buckets.socialLineItems = [
    {
      line_item_id: "mba001sm1",
      platform: "Meta",
      budget: 20_000,
      bursts: [{ startDate: "2026-01-01", endDate: "2026-04-01", budget: 20_000 }],
    },
  ]
  const s = section({ key: "social-meta", lineIds: ["mba001sm1"], impressionsValue: "180,000" })
  const card = {
    ...s.lineItems[0]!.block.progressCards[1],
    detail: "Delivered 180,000 · Expected 150,000 in period · 400,000 planned in total",
    expected: 150_000,
    expectedToDate: 200_000,
    plannedTotal: 400_000,
  }
  s.lineItems[0]!.block.progressCards = [s.lineItems[0]!.block.progressCards[0], card]
  const entries = channelCoverage({ buckets, sections: [s], todayISO: TODAY })
  const meta = entries.find((e) => e.key === "social-meta")
  assert.ok(meta)
  assert.equal(meta.plannedImpressions, 400_000)
  assert.equal(meta.expectedImpressions, 150_000)
  assert.equal(meta.expectedImpressionsToDate, 200_000)
  assert.equal(sumReportingExpectedImpressionsToDate(entries), 200_000)
})

test("expected impressions are null when a card has no numeric expected", () => {
  const buckets = emptyBuckets()
  buckets.socialLineItems = [
    { line_item_id: "mba001sm1", platform: "Meta", budget: 1, bursts: [{ startDate: "2026-01-01", endDate: "2026-04-01", budget: 1 }] },
  ]
  const entries = channelCoverage({
    buckets,
    sections: [section({ key: "social-meta", lineIds: ["mba001sm1"] })],
    todayISO: TODAY,
  })
  assert.equal(entries.find((e) => e.key === "social-meta")?.expectedImpressions, null)
  assert.equal(sumReportingExpectedImpressionsToDate(entries), null)
})

test("assumed spend on the glance counts only the pacing window", () => {
  const buckets = emptyBuckets()
  buckets.offlineLineItems = [paidBurstLine("golf025RA1", "2026-10-01", 1_000, "spots")]
  const line = {
    id: "golf025RA1",
    scheduleKey: "radio",
    plannedMedia: 1_000,
    buyType: "spots",
    bursts: [
      {
        rawBudget: 1_000,
        budgetIncludesFees: false,
        clientPaysForMedia: true,
        feePct: 0,
        buyType: "spots",
        startDate: "2026-10-01",
        endDate: "2026-10-10",
      },
    ],
  }
  const radio = channelCoverage({
    buckets,
    sections: [],
    todayISO: "2026-10-20",
    window: { startISO: "2026-10-06", endISO: "2026-10-08" },
    channelExpected: [{ key: "radio", expected: 300, planned: 1_000 }],
    assumedLines: [line],
  }).find((entry) => entry.key === "radio")
  assert.ok(radio)
  // $100 a day, 6 to 8 Oct.
  assert.equal(radio.deliveredSpend, 300)
  assert.equal(radio.expectedToDate, 300)
  assert.equal(radio.deliveryStatus, "on-track")
})
