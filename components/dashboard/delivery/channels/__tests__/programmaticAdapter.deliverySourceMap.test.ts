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

function lineMetrics(lines: ProgrammaticLineItem[], rows: PacingRow[], acceptedChannel: string) {
  const normalized = normalizeProgrammaticLineItems(lines)
  const dvRows = rows.map((row) => mapCombinedRowToDv360(row, new Set([acceptedChannel])))
  return buildProgrammaticLineItemMetrics(
    normalized,
    dvRows,
    [CAMPAIGN_START, "2026-03-02", "2026-03-03"],
    "2026-03-15",
    "progdisplay",
    undefined,
    { startISO: CAMPAIGN_START, endISO: CAMPAIGN_END },
    CAMPAIGN_START,
    CAMPAIGN_END,
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
