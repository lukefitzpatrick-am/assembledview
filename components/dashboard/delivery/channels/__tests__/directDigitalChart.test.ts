import assert from "node:assert/strict"
import { describe, it } from "vitest"

import { buildDirectDigitalChannelSection } from "../directDigitalAdapterShared"
import type { PacingRow } from "@/lib/snowflake/pacing-service"

const DATE = "2026-03-01"
const LINE_A = "mba001bv1"
const LINE_B = "mba001bv2"

function factRow(
  overrides: Partial<PacingRow> & Pick<PacingRow, "lineItemId">,
): PacingRow {
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
    impressions: 0,
    clicks: 0,
    results: 0,
    video3sViews: 0,
    maxFivetranSyncedAt: null,
    updatedAt: null,
    ...overrides,
  }
}

function buildSection(rows: PacingRow[], lineIds: string[]) {
  return buildDirectDigitalChannelSection({
    key: "bvod",
    title: "BVOD",
    lineItems: lineIds.map((id) => ({ line_item_id: id, buy_type: "cpm" })),
    combinedRows: rows,
    campaignStart: "2026-01-01",
    campaignEnd: "2026-12-31",
    mbaNumber: "mba001",
    filterRange: { start: null, end: null },
    kpiVersionNumber: 1,
    lineItemTargets: undefined,
    lastSyncedAt: null,
  })
}

describe("buildDirectDigitalChannelSection daily chart", () => {
  it("video3sViews > 0 → impressions bars + completionRate percent line", () => {
    const section = buildSection(
      [
        factRow({
          lineItemId: LINE_A,
          impressions: 1000,
          clicks: 20,
          video3sViews: 400,
        }),
      ],
      [LINE_A],
    )

    assert.ok(section)
    const series = section.aggregate.chart.series
    assert.equal(series.length, 2)
    assert.deepEqual(series[0], {
      key: "impressions",
      label: "Impressions",
      yAxis: "left",
      format: "number",
    })
    assert.deepEqual(series[1], {
      key: "completionRate",
      label: "Completion rate",
      yAxis: "right",
      format: "percent",
    })
  })

  it("video3sViews all 0 → impressions bars + clicks number line", () => {
    const section = buildSection(
      [
        factRow({
          lineItemId: LINE_A,
          impressions: 800,
          clicks: 40,
          video3sViews: 0,
        }),
      ],
      [LINE_A],
    )

    assert.ok(section)
    const series = section.aggregate.chart.series
    assert.equal(series.length, 2)
    assert.deepEqual(series[0], {
      key: "impressions",
      label: "Impressions",
      yAxis: "left",
      format: "number",
    })
    assert.deepEqual(series[1], {
      key: "clicks",
      label: "Clicks",
      yAxis: "right",
      format: "number",
    })
  })

  it("ZERO-$ LAW: derive_spend_from_plan is OFF for Direct Booked Digital — no amount_spent series", () => {
    const section = buildSection(
      [
        factRow({
          lineItemId: LINE_A,
          impressions: 800,
          clicks: 40,
          amountSpent: 99,
        }),
      ],
      [LINE_A],
    )

    assert.ok(section)
    const keys = section.aggregate.chart.series.map((s) => s.key)
    assert.ok(!keys.includes("amountSpent"))
    assert.ok(!keys.includes("amount_spent"))
    assert.ok(!keys.includes("spend"))
    assert.equal(section.aggregate.chart.daily[0]?.amountSpent, undefined)
  })

  it("aggregate completionRate is volume-weighted (910/1100*100), not the mean of per-line rates", () => {
    // Line A 90% on 1,000 imps; line B 10% on 100 imps. Mean of rates = 50%.
    // Volume-weighted: (900+10) / (1000+100) * 100 = 82.727...
    const expected = (910 / 1100) * 100

    const section = buildSection(
      [
        factRow({
          lineItemId: LINE_A,
          impressions: 1000,
          video3sViews: 900,
        }),
        factRow({
          lineItemId: LINE_B,
          impressions: 100,
          video3sViews: 10,
        }),
      ],
      [LINE_A, LINE_B],
    )

    assert.ok(section)
    const day = section.aggregate.chart.daily.find((d) => d.date === DATE)
    assert.ok(day)
    assert.equal(day.completionRate, expected)
    assert.notEqual(day.completionRate, 50)
    assert.equal(day.impressions, 1100)
  })
})
