import assert from "node:assert/strict"
import test from "node:test"

import type { PacingRow } from "@/lib/snowflake/pacing-service"
import { PROGRAMMATIC_DELIVERY_SOURCE_SEED } from "@/lib/delivery/deliverySourceMap"
import {
  buildProgrammaticLineItemMetrics,
  mapCombinedRowToDv360,
  normalizeProgrammaticLineItems,
  type ProgrammaticLineItem,
} from "@/lib/delivery/programmatic/programmaticCompute"
import { buildProgrammaticDisplaySection } from "../programmaticDisplayAdapter"
import { buildProgrammaticVideoSection } from "../programmaticVideoAdapter"
import { buildProgrammaticOohSection } from "../programmaticOohAdapter"
import type { ChannelSectionData } from "../types"

const CAMPAIGN_START = "2026-03-01"
const CAMPAIGN_END = "2026-03-31"

function pacingRow(overrides: Partial<PacingRow> = {}): PacingRow {
  return {
    channel: "programmatic-display",
    dateDay: "2026-03-01",
    adsetName: null,
    entityName: null,
    campaignId: null,
    campaignName: null,
    adsetId: null,
    entityId: null,
    lineItemId: null,
    amountSpent: 0,
    impressions: 0,
    clicks: 0,
    results: 0,
    video3sViews: 0,
    maxFivetranSyncedAt: null,
    updatedAt: null,
    ...overrides,
  }
}

function burstLine(id: string, platform: string, publisher?: string): ProgrammaticLineItem {
  return {
    line_item_id: id,
    platform,
    ...(publisher !== undefined ? { publisher } : {}),
    buy_type: "cpm",
    bursts: [
      {
        start_date: CAMPAIGN_START,
        end_date: CAMPAIGN_END,
        budget_number: 1000,
        calculated_value_number: 100_000,
      },
    ],
  }
}

function modelledCpmLine(id: string, platform: string): ProgrammaticLineItem {
  return {
    line_item_id: id,
    platform,
    buy_type: "cpm",
    bursts: [
      {
        start_date: CAMPAIGN_START,
        end_date: CAMPAIGN_END,
        mediaAmount: 14,
        calculatedValue: 2000,
        buyAmount: "7.00",
        budget_number: 1000,
        calculated_value_number: 2000,
      },
    ],
  }
}

function lineMetrics(
  lines: ProgrammaticLineItem[],
  rows: PacingRow[],
  acceptedChannel: string,
  extra?: {
    mediaType?: "progdisplay" | "progvideo" | "progooh"
    reportedSpendByLineDate?: Map<string, Map<string, number>>
  },
) {
  const normalized = normalizeProgrammaticLineItems(lines)
  const dvRows = rows.map((row) => mapCombinedRowToDv360(row, new Set([acceptedChannel])))
  return buildProgrammaticLineItemMetrics(
    normalized,
    dvRows,
    [CAMPAIGN_START, "2026-03-02", "2026-03-03"],
    "2026-03-15",
    extra?.mediaType ?? "progdisplay",
    undefined,
    { startISO: CAMPAIGN_START, endISO: CAMPAIGN_END },
    CAMPAIGN_START,
    CAMPAIGN_END,
    undefined,
    extra?.reportedSpendByLineDate,
  )
}

function buildDisplay(input: {
  lines: unknown[]
  rows: PacingRow[]
}): ChannelSectionData | null {
  return buildProgrammaticDisplaySection({
    progDisplayLineItems: input.lines,
    combinedRows: input.rows,
    campaignStart: CAMPAIGN_START,
    campaignEnd: CAMPAIGN_END,
    mbaNumber: "TEST001",
    filterRange: { start: null, end: null },
    kpiVersionNumber: 1,
    kpiTargets: undefined,
    lineItemTargets: undefined,
    pacingWindow: {
      asAtISO: "2026-03-15",
      campaignStartISO: CAMPAIGN_START,
      campaignEndISO: CAMPAIGN_END,
    },
    lastSyncedAt: null,
  })
}

test("a Quantcast prog line with CM360 rows produces a section named CM360 (Quantcast)", () => {
  const section = buildDisplay({
    lines: [burstLine("TEST001PD9", "quantcast")],
    rows: [
      pacingRow({
        channel: "ad-serving",
        lineItemId: "TEST001PD9",
        impressions: 2_000,
        clicks: 20,
      }),
    ],
  })
  assert.ok(section, "expected a programmatic display section")
  assert.deepEqual(section.connections, [{ label: "CM360 (Quantcast)", tone: "cm360" }])
  assert.equal(section.lineItems.length, 1)
  assert.equal(section.lineItems[0]?.id, "test001pd9")
})

test("CM360 Quantcast rows with clicks produce placement clicks and non-zero CTR", () => {
  const section = buildDisplay({
    lines: [burstLine("sinch001pd1", "quantcast")],
    rows: [
      pacingRow({
        channel: "ad-serving",
        lineItemId: "sinch001pd1",
        entityId: "plc-mpu",
        entityName: "Homepage MPU",
        impressions: 400_000,
        clicks: 100,
      }),
      pacingRow({
        channel: "ad-serving",
        lineItemId: "sinch001pd1",
        entityId: "plc-ros",
        entityName: "ROS banner",
        impressions: 463_761,
        clicks: 56,
      }),
    ],
  })
  assert.ok(section, "expected a programmatic display section")
  const breakdown = section.lineItems[0]?.block.entityBreakdown
  assert.ok(breakdown, "expected a placement breakdown on the CM360 line")
  assert.equal(breakdown.columns, "delivery")
  assert.equal(breakdown.entityNoun.singular, "placement")
  const clickTotal = breakdown.rows.reduce((sum, row) => sum + Number(row.clicks ?? 0), 0)
  const impressionTotal = breakdown.rows.reduce((sum, row) => sum + Number(row.impressions ?? 0), 0)
  assert.equal(clickTotal, 156)
  assert.ok(impressionTotal > 0)
  assert.ok(clickTotal / impressionTotal > 0)
})

test("a DV360 line is byte-identical to the pre-map section (connections + line id)", () => {
  const dvRows = [
    pacingRow({
      channel: "programmatic-display",
      lineItemId: "TEST001PD1",
      amountSpent: 40,
      impressions: 8_000,
      clicks: 16,
    }),
  ]
  const section = buildDisplay({
    lines: [burstLine("TEST001PD1", "dv360")],
    rows: dvRows,
  })
  assert.ok(section)
  assert.deepEqual(section.connections, [{ label: "DV360 connected", tone: "dv360" }])
  assert.equal(section.lineItems.length, 1)
  assert.equal(section.lineItems[0]?.id, "test001pd1")
  assert.equal(section.key, "programmatic-display")
  assert.equal(section.title, "Programmatic – Display")
})

test("a Taboola line still says Taboola connected", () => {
  const section = buildDisplay({
    lines: [burstLine("TEST001PD5", "taboola")],
    rows: [
      pacingRow({
        channel: "programmatic-display",
        lineItemId: "TEST001PD5",
        amountSpent: 10,
        impressions: 1_000,
      }),
    ],
  })
  assert.ok(section)
  assert.deepEqual(section.connections, [{ label: "Taboola connected", tone: "dv360" }])
})

function buildVideo(input: {
  lines: unknown[]
  rows: PacingRow[]
  reportedSpendByLineDate?: Map<string, Map<string, number>>
}): ChannelSectionData | null {
  return buildProgrammaticVideoSection({
    progVideoLineItems: input.lines,
    combinedRows: input.rows,
    campaignStart: CAMPAIGN_START,
    campaignEnd: CAMPAIGN_END,
    mbaNumber: "BICAU002",
    filterRange: { start: null, end: null },
    kpiVersionNumber: 1,
    kpiTargets: undefined,
    lineItemTargets: undefined,
    pacingWindow: {
      asAtISO: "2026-03-15",
      campaignStartISO: CAMPAIGN_START,
      campaignEndISO: CAMPAIGN_END,
    },
    lastSyncedAt: null,
    reportedSpendByLineDate: input.reportedSpendByLineDate,
  })
}

function chip(section: ChannelSectionData, label: string) {
  return section.aggregate.summaryChips.find((c) => c.label === label)
}

test("a Channel Factory prog_video line with null publisher is included and consumes PACING_FACT video rows", () => {
  const section = buildVideo({
    lines: [burstLine("bicau002pv1", "Channel Factory")],
    rows: [
      pacingRow({
        channel: "programmatic-video",
        lineItemId: "bicau002pv1",
        impressions: 12_000,
        video3sViews: 4_000,
        amountSpent: 0,
      }),
    ],
  })
  assert.ok(section, "expected a programmatic video section")
  assert.equal(section.lineItems.length, 1)
  assert.equal(section.lineItems[0]?.id, "bicau002pv1")
  assert.deepEqual(section.connections, [
    { label: "Channel Factory (partner file)", tone: "partner-file" },
  ])
  const impressions = section.lineItems[0]?.block.progressCards.find((card) =>
    /impression|view|deliverable/i.test(card.title),
  )
  assert.ok(impressions, "expected a delivery card")
  assert.match(String(impressions.detail), /12,000|4,000/)
})

test("an unknown programmatic platform is still excluded", () => {
  const video = buildVideo({
    lines: [burstLine("bicau002pv9", "unknown-dsp")],
    rows: [
      pacingRow({
        channel: "programmatic-video",
        lineItemId: "bicau002pv9",
        impressions: 9_000,
      }),
    ],
  })
  assert.equal(video, null)
})

test("an unmapped platform still produces nothing", () => {
  const section = buildDisplay({
    lines: [burstLine("TEST001PD8", "the-trade-desk")],
    rows: [
      pacingRow({
        channel: "programmatic-display",
        lineItemId: "TEST001PD8",
        amountSpent: 99,
        impressions: 9_000,
      }),
    ],
  })
  assert.equal(section, null)
})

test("a mixed-platform container renders both DV360 and Quantcast lines", () => {
  const section = buildDisplay({
    lines: [
      burstLine("TEST001PD1", "dv360"),
      burstLine("TEST001PD9", "quantcast"),
    ],
    rows: [
      pacingRow({
        channel: "programmatic-display",
        lineItemId: "TEST001PD1",
        amountSpent: 40,
        impressions: 8_000,
      }),
      pacingRow({
        channel: "ad-serving",
        lineItemId: "TEST001PD9",
        impressions: 2_000,
      }),
    ],
  })
  assert.ok(section)
  const ids = section.lineItems.map((item) => item.id).toSorted()
  assert.deepEqual(ids, ["test001pd1", "test001pd9"])
  const labels = section.connections.map((c) => c.label)
  assert.ok(labels.includes("DV360 connected"))
  assert.ok(labels.includes("CM360 (Quantcast)"))
  assert.ok(!labels.includes("DV360 connected") || !labels.every((l) => l === "DV360 connected"))
})

test("normalizeProgrammaticLineItems attaches the resolved map row and keeps both Quantcast keys", () => {
  const direct = normalizeProgrammaticLineItems(
    [burstLine("TEST001PD2", "quantcast - direct")],
    PROGRAMMATIC_DELIVERY_SOURCE_SEED,
  )
  assert.equal(direct.length, 1)
  assert.equal(direct[0]?.deliverySourceMap?.publisher_key, "quantcast - direct")
  assert.equal(direct[0]?.deliverySourceMap?.delivery_source, "cm360")
  assert.equal(direct[0]?.deliverySourceMap?.derive_spend_from_plan, true)

  const bare = normalizeProgrammaticLineItems(
    [burstLine("TEST001PD3", "quantcast")],
    PROGRAMMATIC_DELIVERY_SOURCE_SEED,
  )
  assert.equal(bare.length, 1)
  assert.equal(bare[0]?.deliverySourceMap?.publisher_key, "quantcast")
})

test("normalizeProgrammaticLineItems includes Channel Factory when publisher is null", () => {
  const items = normalizeProgrammaticLineItems(
    [burstLine("bicau002pv1", "Channel Factory")],
    PROGRAMMATIC_DELIVERY_SOURCE_SEED,
  )
  assert.equal(items.length, 1)
  assert.equal(items[0]?.deliverySourceMap?.publisher_key, "channel factory")
  assert.equal(items[0]?.deliverySourceMap?.delivery_source, "partner_file")
})

test("normalizeProgrammaticLineItems looks up publisher before platform", () => {
  const items = normalizeProgrammaticLineItems(
    [burstLine("TEST001PD4", "the-trade-desk", "dv360")],
    PROGRAMMATIC_DELIVERY_SOURCE_SEED,
  )
  assert.equal(items.length, 1)
  assert.equal(items[0]?.deliverySourceMap?.publisher_key, "dv360")
})

const MODELLED_SPEND_TITLE = "Delivered spend (modelled from plan rate)"

test("a cm360 Quantcast line uses modelled spend, not CM360 amountSpent", () => {
  const metrics = lineMetrics(
    [modelledCpmLine("TEST001PD9", "quantcast")],
    [
      pacingRow({
        channel: "ad-serving",
        lineItemId: "TEST001PD9",
        dateDay: "2026-03-01",
        amountSpent: 99,
        impressions: 1000,
      }),
      pacingRow({
        channel: "ad-serving",
        lineItemId: "TEST001PD9",
        dateDay: "2026-03-02",
        amountSpent: 99,
        impressions: 1000,
      }),
      pacingRow({
        channel: "ad-serving",
        lineItemId: "TEST001PD9",
        dateDay: "2026-03-03",
        amountSpent: 99,
        impressions: 1000,
      }),
    ],
    "ad-serving",
  )
  assert.equal(metrics.length, 1)
  assert.equal(metrics[0]?.spendModelledFromPlanRate, true)
  assert.deepEqual(
    metrics[0]?.actualsDaily.map((d) => [d.date, d.spend, d.impressions]),
    [
      ["2026-03-01", 7, 1000],
      ["2026-03-02", 7, 1000],
      ["2026-03-03", 0, 1000],
    ],
  )
})

test("a DSP line keeps Snowflake spend and is not relabelled", () => {
  const metrics = lineMetrics(
    [burstLine("TEST001PD1", "dv360")],
    [
      pacingRow({
        channel: "programmatic-display",
        lineItemId: "TEST001PD1",
        dateDay: "2026-03-01",
        amountSpent: 40,
        impressions: 8000,
      }),
    ],
    "programmatic-display",
  )
  assert.equal(metrics[0]?.spendModelledFromPlanRate, false)
  assert.equal(metrics[0]?.actualsDaily[0]?.spend, 40)
  assert.equal(metrics[0]?.actualsDaily[0]?.impressions, 8000)

  const section = buildDisplay({
    lines: [burstLine("TEST001PD1", "dv360")],
    rows: [
      pacingRow({
        channel: "programmatic-display",
        lineItemId: "TEST001PD1",
        amountSpent: 40,
        impressions: 8000,
      }),
    ],
  })
  assert.equal(section?.lineItems[0]?.block.progressCards[0]?.title, "Spend delivery")
  assert.equal(section?.lineItems[0]?.block.progressCards[0]?.titleTooltip, undefined)
})

test("Quantcast spend tile and chip read modelled-from-plan-rate copy", () => {
  const section = buildDisplay({
    lines: [modelledCpmLine("TEST001PD9", "quantcast")],
    rows: [
      pacingRow({
        channel: "ad-serving",
        lineItemId: "TEST001PD9",
        impressions: 1000,
      }),
    ],
  })
  assert.ok(section)
  const spendCard = section.lineItems[0]?.block.progressCards[0]
  assert.equal(spendCard?.title, MODELLED_SPEND_TITLE)
  assert.match(String(spendCard?.titleTooltip), /planned media/i)
  assert.match(String(spendCard?.titleTooltip), /capped at the planned total/i)
  const spendChip = section.aggregate.summaryChips.find((c) => c.label === MODELLED_SPEND_TITLE)
  assert.ok(spendChip, "expected modelled spend chip on a Quantcast-only section")
  assert.ok(!section.aggregate.summaryChips.some((c) => c.label === "Total spend"))
})

test("BIC Channel Factory delivered spend equals REPORTED_SPEND, not PACING_FACT amountSpent", () => {
  const metrics = lineMetrics(
    [{ ...burstLine("bicau002pv1", "Channel Factory"), fixedCostMedia: true }],
    [
      pacingRow({
        channel: "programmatic-video",
        lineItemId: "bicau002pv1",
        dateDay: "2026-03-01",
        amountSpent: 0,
        impressions: 1000,
        video3sViews: 400,
      }),
      pacingRow({
        channel: "programmatic-video",
        lineItemId: "bicau002pv1",
        dateDay: "2026-03-02",
        amountSpent: 0,
        impressions: 2000,
        video3sViews: 800,
      }),
    ],
    "programmatic-video",
    {
      mediaType: "progvideo",
      reportedSpendByLineDate: new Map([
        [
          "bicau002pv1",
          new Map([
            ["2026-03-01", 25],
            ["2026-03-02", 15],
          ]),
        ],
      ]),
    },
  )
  assert.equal(metrics.length, 1)
  assert.equal(metrics[0]?.spendModelledFromPlanRate, false)
  assert.equal(metrics[0]?.spendFromFixedCostReport, true)
  const spend = metrics[0]!.actualsDaily.reduce((sum, day) => sum + day.spend, 0)
  assert.equal(spend, 40)
  assert.equal(metrics[0]?.actualsDaily[0]?.impressions, 1000)
  assert.equal(metrics[0]?.actualsDaily[1]?.impressions, 2000)
})

test("a DV360 line is unchanged when reported spend is present for another line", () => {
  const metrics = lineMetrics(
    [burstLine("TEST001PD1", "dv360")],
    [
      pacingRow({
        channel: "programmatic-display",
        lineItemId: "TEST001PD1",
        dateDay: "2026-03-01",
        amountSpent: 40,
        impressions: 8000,
      }),
    ],
    "programmatic-display",
    {
      reportedSpendByLineDate: new Map([
        ["bicau002pv1", new Map([["2026-03-01", 99]])],
      ]),
    },
  )
  assert.equal(metrics[0]?.spendModelledFromPlanRate, false)
  assert.equal(metrics[0]?.actualsDaily[0]?.spend, 40)
})

test("a Twitch prog_video line with CM360 rows is included with impressions and modelled spend", () => {
  const metrics = lineMetrics(
    [modelledCpmLine("bicau006pv2", "twitch")],
    [
      pacingRow({
        channel: "ad-serving",
        lineItemId: "bicau006pv2",
        impressions: 50_000,
        clicks: 10,
      }),
    ],
    "ad-serving",
    { mediaType: "progvideo" },
  )
  assert.equal(metrics.length, 1)
  assert.equal(metrics[0]?.spendModelledFromPlanRate, true)
  const impressions = metrics[0]!.actualsDaily.reduce((sum, day) => sum + day.impressions, 0)
  assert.equal(impressions, 50_000)

  const section = buildVideo({
    lines: [modelledCpmLine("bicau006pv2", "twitch")],
    rows: [
      pacingRow({
        channel: "ad-serving",
        lineItemId: "bicau006pv2",
        impressions: 50_000,
        clicks: 10,
      }),
    ],
  })
  assert.ok(section, "expected a programmatic video section")
  assert.equal(section.lineItems.length, 1)
  assert.equal(section.lineItems[0]?.block.progressCards[0]?.title, MODELLED_SPEND_TITLE)
})

function buildOoh(input: {
  lines: unknown[]
  rows: PacingRow[]
  reportedSpendByLineDate?: Map<string, Map<string, number>>
}): ChannelSectionData | null {
  return buildProgrammaticOohSection({
    progOohLineItems: input.lines,
    combinedRows: input.rows,
    campaignStart: CAMPAIGN_START,
    campaignEnd: CAMPAIGN_END,
    mbaNumber: "LEGAL004",
    filterRange: { start: null, end: null },
    kpiVersionNumber: 1,
    kpiTargets: undefined,
    lineItemTargets: undefined,
    pacingWindow: {
      asAtISO: "2026-03-15",
      campaignStartISO: CAMPAIGN_START,
      campaignEndISO: CAMPAIGN_END,
    },
    lastSyncedAt: null,
    reportedSpendByLineDate: input.reportedSpendByLineDate,
  })
}

test("a Vistar prog_ooh line with PACING_FACT rows delivers IMPRESSIONS not RESULTS", () => {
  const line: ProgrammaticLineItem = {
    ...burstLine("sinch001po1", "Vistar"),
    bursts: [
      {
        start_date: CAMPAIGN_START,
        end_date: CAMPAIGN_END,
        budget_number: 10_000,
        calculated_value_number: 1_071_429,
      },
    ],
  }
  const section = buildOoh({
    lines: [line],
    rows: [
      pacingRow({
        channel: "programmatic-ooh",
        lineItemId: "sinch001po1",
        impressions: 257_094,
        results: 57_602,
        amountSpent: 576.02,
      }),
    ],
  })
  assert.ok(section, "expected a programmatic OOH section")
  assert.equal(section.key, "programmatic-ooh")
  assert.equal(section.lineItems[0]?.id, "sinch001po1")
  assert.deepEqual(section.connections, [{ label: "Vistar (partner file)", tone: "partner-file" }])
  const impressionsCard = section.lineItems[0]?.block.progressCards[1]
  assert.equal(impressionsCard?.title, "Impressions delivery")
  assert.match(String(impressionsCard?.value), /257,094/)
  assert.match(String(impressionsCard?.detail), /Planned 1,071,429/)
  const playsDelivery = section.lineItems[0]?.block.progressCards.find((card) =>
    /plays delivery/i.test(card.title),
  )
  assert.equal(playsDelivery, undefined)
  const spendCard = section.lineItems[0]?.block.progressCards[0]
  assert.equal(spendCard?.title, "Delivered spend")
  const chart = section.lineItems[0]?.block.chart
  assert.equal(chart?.kind, "daily-delivery")
  if (!chart || chart.kind !== "daily-delivery") throw new Error("expected daily-delivery chart")
  assert.deepEqual(
    chart.series.map((s) => s.key),
    ["amount_spent", "impressions"],
  )
})

test("programmatic OOH KPI tiles are CPM, Plays and Cost per play", () => {
  const section = buildOoh({
    lines: [burstLine("sinch001po1", "Vistar")],
    rows: [
      pacingRow({
        channel: "programmatic-ooh",
        lineItemId: "sinch001po1",
        impressions: 257_094,
        results: 57_602,
        amountSpent: 576.02,
      }),
    ],
  })
  assert.ok(section)
  const labels = section.lineItems[0]?.block.kpiBand.tiles.map((tile) => tile.label) ?? []
  assert.deepEqual(labels, ["CPM", "Plays", "Cost per play"])
  assert.equal(labels.includes("CTR"), false)
  assert.equal(labels.includes("CPC"), false)
  assert.equal(labels.includes("CVR"), false)
  assert.equal(labels.includes("CPA"), false)
  const plays = section.lineItems[0]?.block.kpiBand.tiles.find((tile) => tile.label === "Plays")
  assert.match(String(plays?.value), /57,602/)
})

test("a Perion prog_ooh line with no map row is excluded", () => {
  const section = buildOoh({
    lines: [burstLine("legal004po9", "Perion")],
    rows: [
      pacingRow({
        channel: "programmatic-ooh",
        lineItemId: "legal004po9",
        impressions: 9_000,
        results: 100,
      }),
    ],
  })
  assert.equal(section, null)
})

test("fixedCostMedia OOH spend is REPORTED_SPEND, labelled reported; CPM keeps AMOUNT_SPENT", () => {
  const reported = lineMetrics(
    [{ ...burstLine("legal004po1", "Vistar"), fixedCostMedia: true }],
    [
      pacingRow({
        channel: "programmatic-ooh",
        lineItemId: "legal004po1",
        dateDay: "2026-03-01",
        amountSpent: 99,
        impressions: 1000,
        results: 40,
      }),
    ],
    "programmatic-ooh",
    {
      mediaType: "progooh",
      reportedSpendByLineDate: new Map([["legal004po1", new Map([["2026-03-01", 25]])]]),
    },
  )
  assert.equal(reported.length, 1)
  assert.equal(reported[0]?.spendModelledFromPlanRate, false)
  assert.equal(reported[0]?.spendFromFixedCostReport, true)
  assert.equal(reported[0]?.actualsDaily[0]?.spend, 25)
  assert.equal(reported[0]?.deliverableKey, "impressions")
  assert.equal(reported[0]?.actualsDaily[0]?.impressions, 1000)
  assert.equal(reported[0]?.actualsDaily[0]?.conversions, 40)

  const cpm = lineMetrics(
    [burstLine("legal004po2", "Vistar")],
    [
      pacingRow({
        channel: "programmatic-ooh",
        lineItemId: "legal004po2",
        dateDay: "2026-03-01",
        amountSpent: 61.5,
        impressions: 2000,
        results: 80,
      }),
    ],
    "programmatic-ooh",
    { mediaType: "progooh" },
  )
  assert.equal(cpm[0]?.spendModelledFromPlanRate, false)
  assert.equal(cpm[0]?.actualsDaily[0]?.spend, 61.5)

  const modelledSection = buildOoh({
    lines: [{ ...burstLine("legal004po1", "Vistar"), fixedCostMedia: true }],
    rows: [
      pacingRow({
        channel: "programmatic-ooh",
        lineItemId: "legal004po1",
        impressions: 1000,
        results: 40,
        amountSpent: 0,
      }),
    ],
    reportedSpendByLineDate: new Map([["legal004po1", new Map([["2026-03-01", 25]])]]),
  })
  assert.equal(
    modelledSection?.lineItems[0]?.block.progressCards[0]?.title,
    "Reported spend (fixed cost)",
  )
})

test("fixed-cost partner-file spend is Reported spend (fixed cost); Twitch stays modelled from plan rate", () => {
  const cf = buildVideo({
    lines: [{ ...burstLine("bicau006pv1", "Channel Factory"), fixedCostMedia: true }],
    rows: [
      pacingRow({
        channel: "programmatic-video",
        lineItemId: "bicau006pv1",
        impressions: 12_000,
        video3sViews: 4_000,
        amountSpent: 0,
      }),
    ],
  })
  assert.equal(
    cf?.lineItems[0]?.block.progressCards[0]?.title,
    "Reported spend (fixed cost)",
  )

  const twitch = buildVideo({
    lines: [modelledCpmLine("bicau006pv2", "twitch")],
    rows: [
      pacingRow({
        channel: "ad-serving",
        lineItemId: "bicau006pv2",
        impressions: 50_000,
        clicks: 10,
      }),
    ],
  })
  assert.equal(twitch?.lineItems[0]?.block.progressCards[0]?.title, MODELLED_SPEND_TITLE)
})

test("CM360 Twitch deliverable status is not no-data when delivered and planned are both > 0", () => {
  const section = buildVideo({
    lines: [modelledCpmLine("bicau006pv2", "twitch")],
    rows: [
      pacingRow({
        channel: "ad-serving",
        lineItemId: "bicau006pv2",
        impressions: 50_000,
        clicks: 10,
      }),
    ],
  })
  const deliverable = section?.lineItems[0]?.block.progressCards[1]
  assert.ok(deliverable)
  assert.notEqual(deliverable.status, "no-data")
  assert.ok(
    deliverable.status === "ahead" ||
      deliverable.status === "behind" ||
      deliverable.status === "on-track",
  )
})

test("partner-file Channel Factory deliverable status is not no-data when delivered and planned are both > 0", () => {
  const section = buildVideo({
    lines: [burstLine("bicau006pv1", "Channel Factory")],
    rows: [
      pacingRow({
        channel: "programmatic-video",
        lineItemId: "bicau006pv1",
        impressions: 12_000,
        video3sViews: 4_000,
        amountSpent: 0,
      }),
    ],
  })
  const deliverable = section?.lineItems[0]?.block.progressCards[1]
  assert.ok(deliverable)
  assert.notEqual(deliverable.status, "no-data")
  assert.ok(
    deliverable.status === "ahead" ||
      deliverable.status === "behind" ||
      deliverable.status === "on-track",
  )
})

test("display section summary chips are spend, impressions, Avg CPM, and deliverable Avg delivery", () => {
  const section = buildDisplay({
    lines: [burstLine("TEST001PD1", "dv360"), burstLine("TEST001PD2", "taboola")],
    rows: [
      pacingRow({
        channel: "programmatic-display",
        lineItemId: "TEST001PD1",
        amountSpent: 40,
        impressions: 8_000,
      }),
      pacingRow({
        channel: "programmatic-display",
        lineItemId: "TEST001PD2",
        amountSpent: 10,
        impressions: 2_000,
      }),
    ],
  })
  assert.ok(section)
  assert.equal(chip(section, "Total spend")?.value, "$50.00")
  assert.equal(chip(section, "Total impressions")?.value, "10,000")
  assert.equal(chip(section, "Avg CPM")?.value, "$5.00")
  assert.equal(chip(section, "Avg delivery")?.value, "5.0%")
  assert.equal(chip(section, "Avg CPV"), undefined)
  assert.deepEqual(
    section.aggregate.chart.series.map((s) => s.label),
    ["Spend", "Impressions"],
  )
})

test("mixed reported + modelled spend keeps Total spend with an includes-modelled caption", () => {
  const section = buildVideo({
    lines: [
      { ...burstLine("bicau006pv1", "Channel Factory"), fixedCostMedia: true },
      modelledCpmLine("bicau006pv2", "twitch"),
    ],
    rows: [
      pacingRow({
        channel: "programmatic-video",
        lineItemId: "bicau006pv1",
        impressions: 12_000,
        video3sViews: 4_000,
        amountSpent: 0,
      }),
      pacingRow({
        channel: "ad-serving",
        lineItemId: "bicau006pv2",
        impressions: 50_000,
        clicks: 10,
      }),
    ],
    reportedSpendByLineDate: new Map([["bicau006pv1", new Map([["2026-03-01", 25]])]]),
  })
  assert.ok(section)
  const spend = chip(section, "Total spend")
  assert.ok(spend)
  assert.equal(spend.caption, "includes modelled spend")
  assert.equal(chip(section, "Delivered spend (modelled from plan rate)"), undefined)
  assert.equal(chip(section, "Reported spend (fixed cost)"), undefined)
})

test("Channel Factory CPV section summary uses Avg CPV and a Spend + Views chart", () => {
  const section = buildVideo({
    lines: [{ ...burstLine("bicau006pv1", "Channel Factory"), buy_type: "cpv", fixedCostMedia: true }],
    rows: [
      pacingRow({
        channel: "programmatic-video",
        lineItemId: "bicau006pv1",
        impressions: 12_000,
        video3sViews: 4_000,
        amountSpent: 0,
      }),
    ],
    reportedSpendByLineDate: new Map([["bicau006pv1", new Map([["2026-03-01", 40]])]]),
  })
  assert.ok(section)
  assert.equal(chip(section, "Reported spend (fixed cost)")?.value, "$40.00")
  assert.equal(chip(section, "Avg CPV")?.value, "$0.01")
  assert.equal(chip(section, "Avg CPM"), undefined)
  assert.deepEqual(
    section.aggregate.chart.series.map((s) => s.label),
    ["Spend", "Views"],
  )
})

test("OOH section summary is spend, impressions, Avg CPM, Avg delivery, plus Plays", () => {
  const section = buildOoh({
    lines: [burstLine("legal004po1", "Vistar"), burstLine("legal004po2", "Broadsign")],
    rows: [
      pacingRow({
        channel: "programmatic-ooh",
        lineItemId: "legal004po1",
        dateDay: "2026-03-01",
        amountSpent: 40,
        impressions: 8_000,
        results: 120,
      }),
      pacingRow({
        channel: "programmatic-ooh",
        lineItemId: "legal004po2",
        dateDay: "2026-03-01",
        amountSpent: 10,
        impressions: 2_000,
        results: 80,
      }),
    ],
  })
  assert.ok(section)
  assert.equal(chip(section, "Total spend")?.value, "$50.00")
  assert.equal(chip(section, "Total impressions")?.value, "10,000")
  assert.equal(chip(section, "Avg CPM")?.value, "$5.00")
  assert.equal(chip(section, "Avg delivery")?.value, "5.0%")
  assert.equal(chip(section, "Plays")?.value, "200")
  assert.deepEqual(
    section.aggregate.chart.series.map((s) => s.label),
    ["Spend", "Impressions"],
  )
})
