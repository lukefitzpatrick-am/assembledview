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

function buildSection(
  rows: PacingRow[],
  lineIds: string[],
  extra?: {
    lineItems?: unknown[]
    reportedSpendByLineDate?: Map<string, Map<string, number>>
    asOfDate?: string
  },
) {
  return buildDirectDigitalChannelSection({
    key: "bvod",
    title: "BVOD",
    lineItems: extra?.lineItems ?? lineIds.map((id) => ({ line_item_id: id, buy_type: "cpm" })),
    combinedRows: rows,
    campaignStart: "2026-01-01",
    campaignEnd: "2026-12-31",
    mbaNumber: "mba001",
    filterRange: { start: null, end: null },
    kpiVersionNumber: 1,
    lineItemTargets: undefined,
    lastSyncedAt: null,
    reportedSpendByLineDate: extra?.reportedSpendByLineDate,
    asOfDate: extra?.asOfDate,
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

  it("platform amount_spent is not charted; the estimate is a card, not a series", () => {
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

  it("one line with completes keeps clicks on the other line and on the channel chart", () => {
    const section = buildSection(
      [
        factRow({
          lineItemId: LINE_A,
          impressions: 1000,
          clicks: 20,
          video3sViews: 400,
        }),
        factRow({
          lineItemId: LINE_B,
          impressions: 800,
          clicks: 40,
          video3sViews: 0,
        }),
      ],
      [LINE_A, LINE_B],
    )

    assert.ok(section)
    assert.deepEqual(section.aggregate.chart.series[1], {
      key: "clicks",
      label: "Clicks",
      yAxis: "right",
      format: "number",
    })
    const seriesFor = (id: string) => {
      const chart = section.lineItems.find((item) => item.id === id)?.block.chart
      assert.equal(chart?.kind, "daily-delivery")
      if (!chart || chart.kind !== "daily-delivery") throw new Error("expected a daily chart")
      return chart.series[1]
    }
    assert.deepEqual(seriesFor(LINE_A), {
      key: "completionRate",
      label: "Completion rate",
      yAxis: "right",
      format: "percent",
    })
    assert.deepEqual(seriesFor(LINE_B), {
      key: "clicks",
      label: "Clicks",
      yAxis: "right",
      format: "number",
    })
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

  it("fixed-cost BVOD line with REPORTED_SPEND is labelled Reported spend (fixed cost)", () => {
    const section = buildSection(
      [
        factRow({
          lineItemId: LINE_A,
          impressions: 50_000,
          clicks: 10,
        }),
      ],
      [LINE_A],
      {
        lineItems: [
          {
            line_item_id: LINE_A,
            buy_type: "cpm",
            fixedCostMedia: true,
            budget: 6_500,
          },
        ],
        reportedSpendByLineDate: new Map([
          [
            LINE_A,
            new Map([
              ["2026-03-01", 3221.16],
            ]),
          ],
        ]),
      },
    )

    assert.ok(section)
    const spendCard = section.lineItems[0]?.block.progressCards.find((c) =>
      /spend/i.test(c.title),
    )
    assert.ok(spendCard)
    assert.equal(spendCard.title, "Reported spend (fixed cost)")
    assert.equal(spendCard.value, "$3,221.16")
    assert.equal(spendCard.varianceLabel, "vs plan spend")
    assert.equal(spendCard.detail, "Delivered $3,221.16 · Planned $6,500.00")
    assert.equal(spendCard.status, "behind")
    const keys = section.aggregate.chart.series.map((s) => s.key)
    assert.ok(!keys.includes("amountSpent"))
    assert.ok(!keys.includes("spend"))
    assert.equal(section.aggregate.chart.daily[0]?.impressions, 50_000)
  })

  it("planned deliverables 0 shows no estimate and says why; platform spend is ignored", () => {
    const section = buildSection(
      [
        factRow({
          lineItemId: LINE_A,
          impressions: 50_000,
          clicks: 10,
          amountSpent: 99,
        }),
      ],
      [LINE_A],
      {
        lineItems: [
          {
            line_item_id: LINE_A,
            buy_type: "cpm",
            fixedCostMedia: false,
            budget: 6_500,
            bursts: [{ budget: 6_500, calculatedValue: 0 }],
          },
        ],
        reportedSpendByLineDate: new Map([
          [LINE_A, new Map([["2026-03-01", 3221.16]])],
        ]),
      },
    )

    assert.ok(section)
    const spendCard = section.lineItems[0]?.block.progressCards.find((c) =>
      /spend/i.test(c.title),
    )
    assert.equal(spendCard, undefined)
    assert.equal(
      section.connections[0]?.label,
      "Ad server verification (CM360) — delivery counts",
    )
    assert.equal(section.aggregate.kpiBand.subtitle, "CM360 delivery counts")
    assert.equal(section.lineItems[0]?.block.progressCards[0]?.title, "Impressions delivery")
    assert.equal(section.lineItems[0]?.block.progressCards[0]?.value, "50,000")
    assert.match(section.lineItems[0]?.block.progressCards[0]?.detail ?? "", /No planned impressions/)
  })

  it("CPM line shows $2,000 estimated spend and a CPM at the plan rate", () => {
    const section = buildSection(
      [
        factRow({
          lineItemId: LINE_A,
          impressions: 100_000,
          clicks: 40,
          amountSpent: 99,
        }),
      ],
      [LINE_A],
      {
        lineItems: [
          {
            line_item_id: LINE_A,
            buy_type: "cpm",
            budget: 10_000,
            bursts: [{ budget: 10_000, calculatedValue: 500_000, buyAmount: 15 }],
          },
        ],
      },
    )

    assert.ok(section)
    const spendCard = section.lineItems[0]?.block.progressCards.find((c) =>
      /spend/i.test(c.title),
    )
    assert.ok(spendCard)
    assert.equal(spendCard.title, "Estimated spend")
    assert.equal(spendCard.value, "$2,000.00")
    assert.match(spendCard.detail, /Estimated/)
    const cpmTile = section.lineItems[0]?.block.kpiBand.tiles.find((tile) => tile.label === "CPM")
    assert.equal(cpmTile?.caption, "Estimated")
    assert.equal(cpmTile?.value, "$20.00")
    const cpcTile = section.lineItems[0]?.block.kpiBand.tiles.find((tile) => tile.label === "CPC")
    assert.equal(cpcTile, undefined)
  })

  it("BICAU002 bv2 at day 47 of 86 paces reported spend against expected to date", () => {
    const section = buildSection(
      [
        factRow({
          lineItemId: "bicau002bv2",
          dateDay: "2026-09-16",
          impressions: 174_000,
          clicks: 0,
        }),
      ],
      ["bicau002bv2"],
      {
        asOfDate: "2026-09-16",
        lineItems: [
          {
            line_item_id: "bicau002bv2",
            buy_type: "cpm",
            fixedCostMedia: true,
            budget: 8_600,
            bursts: [
              {
                startDate: "2026-08-01",
                endDate: "2026-10-25",
                budget: 8_600,
                calculatedValue: 174_000,
              },
            ],
          },
        ],
        reportedSpendByLineDate: new Map([
          ["bicau002bv2", new Map([["2026-09-16", 4_700]])],
        ]),
      },
    )

    assert.ok(section)
    const spendCard = section.lineItems[0]?.block.progressCards.find((c) =>
      /spend/i.test(c.title),
    )
    assert.ok(spendCard)
    assert.equal(spendCard.varianceLabel, "vs expected to date")
    assert.equal(
      spendCard.detail,
      "Reported $4,700.00 · Planned $8,600.00 · Expected to date $4,700.00",
    )
    assert.equal(spendCard.status, "on-track")
    assert.ok(Math.abs(spendCard.variance) < 0.02)
    assert.ok(Math.abs(spendCard.progress - 4_700 / 8_600) < 0.001)
    assert.equal(section.aggregate.progressCards[0]?.status, "on-track")
    assert.equal(section.aggregate.progressCards[0]?.varianceLabel, "vs expected to date")
  })
})
