import assert from "node:assert/strict"
import test from "node:test"

import { buildSearchSection } from "../searchAdapter"
import type { ChannelSectionData } from "../types"
import { formatMoney } from "@/lib/format/money"
import type {
  SearchPacingDailyRow,
  SearchPacingLineItemSeries,
  SearchPacingResponse,
  SearchPacingTotals,
} from "@/lib/snowflake/search-pacing-service"

const BASE_TOTALS: SearchPacingTotals = {
  cost: 250,
  clicks: 100,
  conversions: 10,
  revenue: 0,
  impressions: 2000,
  topImpressionPct: 40,
}

function totals(overrides: Partial<SearchPacingTotals> = {}): SearchPacingTotals {
  return { ...BASE_TOTALS, ...overrides }
}

function dailyRow(overrides: Partial<SearchPacingDailyRow> = {}): SearchPacingDailyRow {
  return {
    date: "2026-01-05",
    cost: 0,
    clicks: 0,
    conversions: 0,
    revenue: 0,
    impressions: 0,
    topImpressionPct: null,
    ...overrides,
  }
}

function lineItem(
  id: string,
  lineTotals: Partial<SearchPacingTotals>,
  daily: SearchPacingDailyRow[],
): SearchPacingLineItemSeries {
  return {
    lineItemId: id,
    lineItemName: id,
    totals: totals(lineTotals),
    daily,
  }
}

function searchData(overrides: Partial<SearchPacingResponse> = {}): SearchPacingResponse {
  return {
    totals: totals(),
    daily: [],
    lineItems: [],
    keywords: [],
    ...overrides,
  }
}

function build(data: SearchPacingResponse): ChannelSectionData {
  const section = buildSearchSection({
    searchLineItems: [],
    searchData: data,
    campaignStart: "2026-01-01",
    campaignEnd: "2026-01-31",
    filterRange: { start: null, end: null },
    kpiTargets: undefined,
    mbaNumber: "MBA0001",
    kpiVersionNumber: 1,
    lineItemTargets: undefined,
    pacingWindow: {
      asAtISO: "2026-01-15",
      campaignStartISO: "2026-01-01",
      campaignEndISO: "2026-01-31",
    },
    lastSyncedAt: null,
  })
  assert.ok(section, "expected a Search section")
  return section
}

function tileLabels(section: ChannelSectionData): string[] {
  return section.aggregate.kpiBand.tiles.map((t) => t.label)
}

function lineTiles(section: ChannelSectionData, id: string) {
  const item = section.lineItems.find((li) => li.id === id)
  assert.ok(item, `expected line item ${id}`)
  return item.block.kpiBand.tiles
}

test("revenue > 0 appends Revenue and ROAS tiles with money + 2dp x formatting", () => {
  const section = build(
    searchData({
      totals: totals({ cost: 250, revenue: 1050 }),
    }),
  )
  const labels = tileLabels(section)
  assert.deepEqual(labels, [
    "CPC",
    "CTR",
    "Conversions",
    "Top Impression Share",
    "Impressions",
    "Revenue",
    "ROAS",
  ])
  const revenue = section.aggregate.kpiBand.tiles.find((t) => t.label === "Revenue")
  const roas = section.aggregate.kpiBand.tiles.find((t) => t.label === "ROAS")
  assert.equal(revenue?.value, formatMoney(1050))
  assert.equal(roas?.value, "4.20x")
})

test("revenue === 0 leaves campaign tiles identical to a no-revenue snapshot", () => {
  const zero = build(searchData({ totals: totals({ revenue: 0 }) }))
  const omitted = build(
    searchData({ totals: { ...BASE_TOTALS, revenue: undefined as unknown as number } }),
  )
  const withRevenue = build(searchData({ totals: totals({ cost: 250, revenue: 1050 }) }))
  assert.deepEqual(tileLabels(zero), [
    "CPC",
    "CTR",
    "Conversions",
    "Top Impression Share",
    "Impressions",
  ])
  assert.deepEqual(zero.aggregate.kpiBand.tiles, omitted.aggregate.kpiBand.tiles)
  assert.deepEqual(withRevenue.aggregate.kpiBand.tiles.slice(0, 5), zero.aggregate.kpiBand.tiles)
})

test("revenue with zero spend still appends both tiles; ROAS is a dash", () => {
  const section = build(searchData({ totals: totals({ cost: 0, revenue: 500 }) }))
  assert.equal(section.aggregate.kpiBand.tiles.find((t) => t.label === "Revenue")?.value, formatMoney(500))
  assert.equal(section.aggregate.kpiBand.tiles.find((t) => t.label === "ROAS")?.value, "—")
})

test("only the line item with revenue shows Revenue and ROAS tiles", () => {
  const section = build(
    searchData({
      totals: totals({ cost: 350, revenue: 1050 }),
      lineItems: [
        lineItem(
          "SE-REV",
          { cost: 250, revenue: 1050 },
          [dailyRow({ cost: 250, clicks: 80, impressions: 1000, revenue: 1050 })],
        ),
        lineItem(
          "SE-NONE",
          { cost: 100, revenue: 0 },
          [dailyRow({ cost: 100, clicks: 20, impressions: 400, revenue: 0 })],
        ),
      ],
    }),
  )

  const withRev = lineTiles(section, "se-rev")
  const without = lineTiles(section, "se-none")
  assert.deepEqual(
    withRev.map((t) => t.label),
    ["CPC", "CTR", "Conversions", "Top Impression Share", "Impressions", "Revenue", "ROAS"],
  )
  assert.equal(withRev.find((t) => t.label === "Revenue")?.value, formatMoney(1050))
  assert.equal(withRev.find((t) => t.label === "ROAS")?.value, "4.20x")
  assert.deepEqual(
    without.map((t) => t.label),
    ["CPC", "CTR", "Conversions", "Top Impression Share", "Impressions"],
  )
})
