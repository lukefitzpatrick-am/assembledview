/**
 * C-159: direct digital completion rate. Tiles keep the same text as before
 * the fix (points to 2 dp); chart rows carry a ratio (1 = 100%).
 */
import assert from "node:assert/strict"
import { describe, it } from "vitest"

import { buildDirectDigitalChannelSection } from "../directDigitalAdapterShared"
import type { PacingRow } from "@/lib/snowflake/pacing-service"

const DATE = "2026-03-01"
const LINE_A = "mba001bv1"
const LINE_B = "mba001bv2"

function factRow(lineItemId: string, impressions: number, completes: number): PacingRow {
  return {
    channel: "ad-serving",
    dateDay: DATE,
    adsetName: null,
    entityName: "Preroll",
    campaignId: null,
    campaignName: null,
    adsetId: null,
    entityId: "plc-1",
    amountSpent: 0,
    impressions,
    clicks: 0,
    results: 0,
    video3sViews: completes,
    maxFivetranSyncedAt: null,
    updatedAt: null,
    lineItemId,
  }
}

function build(rows: PacingRow[]) {
  const section = buildDirectDigitalChannelSection({
    key: "digital-video",
    title: "Video",
    lineItems: [LINE_A, LINE_B].map((id) => ({ line_item_id: id, buy_type: "cpm" })),
    combinedRows: rows,
    campaignStart: "2026-01-01",
    campaignEnd: "2026-12-31",
    mbaNumber: "mba001",
    filterRange: { start: null, end: null },
    kpiVersionNumber: 1,
    lineItemTargets: undefined,
    lastSyncedAt: null,
  })
  assert.ok(section)
  return section
}

/** The tile text before C-159: `fmtPct(completionRatePct(c, i))`. */
function textBefore(completes: number, impressions: number): string {
  const points = (impressions === 0 ? 0 : completes / impressions) * 100
  return Number.isFinite(points) ? `${points.toFixed(2)}%` : "0.00%"
}

function completionValue(items: { label: string; value: string | null }[]): string | null | undefined {
  return items.find((item) => item.label === "Completion rate")?.value
}

// [line A impressions, completes], [line B impressions, completes]
const SAMPLES: Array<[[number, number], [number, number]]> = [
  [[1000, 605], [1000, 500]],
  [[3, 1], [3, 2]],
  [[1000, 5], [1000, 1]],
  [[1000, 1100], [10, 9]],
  [[10_000_000, 7], [1, 1]],
  [[1_000_000, 999_999], [1000, 333]],
  [[1000, 333], [7, 3]],
  [[150_000, 101_234], [61, 59]],
]

describe("direct digital completion rate after C-159", () => {
  it.each(SAMPLES)("tiles keep the same text: %j %j", ([aImps, aDone], [bImps, bDone]) => {
    const section = build([factRow(LINE_A, aImps, aDone), factRow(LINE_B, bImps, bDone)])
    const totalImps = aImps + bImps
    const totalDone = aDone + bDone

    assert.equal(completionValue(section.aggregate.summaryChips), textBefore(totalDone, totalImps))
    assert.equal(completionValue(section.aggregate.kpiBand.tiles), textBefore(totalDone, totalImps))

    const lineTiles = (id: string) => section.lineItems.find((item) => item.id === id)?.block.kpiBand.tiles ?? []
    assert.equal(completionValue(lineTiles(LINE_A)), textBefore(aDone, aImps))
    assert.equal(completionValue(lineTiles(LINE_B)), textBefore(bDone, bImps))
  })

  it("an overflowing ratio still shows 0.00%, as before", () => {
    // 1 / 5e-324 is Infinity. Counts never get here; this pins the old fallback.
    const section = build([factRow(LINE_A, 5e-324, 1), factRow(LINE_B, 1000, 605)])
    const lineTiles = section.lineItems.find((item) => item.id === LINE_A)?.block.kpiBand.tiles ?? []
    assert.equal(textBefore(1, 5e-324), "0.00%")
    assert.equal(completionValue(lineTiles), "0.00%")
  })

  it("names the example tile value", () => {
    const section = build([factRow(LINE_A, 1000, 605), factRow(LINE_B, 1000, 605)])
    assert.equal(completionValue(section.aggregate.summaryChips), "60.50%")
  })

  it.each(SAMPLES)("chart rows carry the ratio: %j %j", ([aImps, aDone], [bImps, bDone]) => {
    const section = build([factRow(LINE_A, aImps, aDone), factRow(LINE_B, bImps, bDone)])
    const day = section.aggregate.chart.daily.find((row) => row.date === DATE)
    assert.equal(day?.completionRate, (aDone + bDone) / (aImps + bImps))
    const lineDay = (id: string) => {
      const chart = section.lineItems.find((item) => item.id === id)?.block.chart
      if (!chart || chart.kind !== "daily-delivery") throw new Error("expected a daily chart")
      return chart.daily.find((row) => row.date === DATE)
    }
    assert.equal(lineDay(LINE_A)?.completionRate, aDone / aImps)
    assert.equal(lineDay(LINE_B)?.completionRate, bDone / bImps)
  })

  it("a completion rate above 100% stays above 1 on the chart", () => {
    const section = build([factRow(LINE_A, 1000, 1100), factRow(LINE_B, 1000, 1300)])
    const day = section.aggregate.chart.daily.find((row) => row.date === DATE)
    assert.equal(day?.completionRate, 1.2)
  })
})
