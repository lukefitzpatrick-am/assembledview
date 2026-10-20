import assert from "node:assert/strict"
import test from "node:test"

import { buildSearchSection } from "../searchAdapter"
import { applyConversionsToSection, type DeliveryConversions, type LineSpendDay } from "../conversionTiles"
import { resolvePacingWindowISO } from "@/lib/pacing/expectedForWindow"
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

// FX2a (parked) is now CF4: Revenue and ROAS show only when the client's
// conversions switch is on with "show revenue", from the chosen events.
// Raw Google revenue in the search payload never adds tiles on its own.

const WINDOW = resolvePacingWindowISO({
  campaignStartISO: "2026-01-01",
  campaignEndISO: "2026-01-31",
  asAtISO: "2026-01-15",
})

function conversions(
  lines: Array<{ id: string; conversions: number; revenue: number }>,
  overrides: Partial<DeliveryConversions> = {},
): DeliveryConversions {
  return {
    headline: "conversions",
    showRevenue: true,
    trackedPlatforms: ["google_ads"],
    valuePlatforms: ["google_ads"],
    lines: lines.map((l) => ({
      lineItemId: l.id,
      daily: [{ date: "2026-01-05", conversions: l.conversions, purchases: 0, leads: 0, revenue: l.revenue }],
    })),
    ...overrides,
  }
}

function spend(entries: Array<[string, number]>): Map<string, LineSpendDay[]> {
  return new Map(entries.map(([id, cost]) => [id, [{ date: "2026-01-05", spend: cost, clicks: 100 }]]))
}

const TWO_LINES = searchData({
  totals: totals({ cost: 350, revenue: 1050 }),
  lineItems: [
    lineItem("SE-REV", { cost: 250, revenue: 1050 }, [dailyRow({ cost: 250, clicks: 80, impressions: 1000, revenue: 1050 })]),
    lineItem("SE-NONE", { cost: 100, revenue: 0 }, [dailyRow({ cost: 100, clicks: 20, impressions: 400, revenue: 0 })]),
  ],
})

test("switch on with revenue: Revenue and ROAS tiles with money + 2dp x formatting", () => {
  const section = applyConversionsToSection(
    build(TWO_LINES),
    conversions([{ id: "se-rev", conversions: 10, revenue: 1050 }]),
    { window: WINDOW, spendByLine: spend([["se-rev", 250]]) },
  )
  const withRev = lineTiles(section, "se-rev")
  assert.deepEqual(
    withRev.map((t) => t.label),
    ["CPC", "CTR", "Conversions", "CVR", "CPA", "Top Impression Share", "Impressions", "Revenue", "ROAS"],
  )
  assert.equal(withRev.find((t) => t.label === "Revenue")?.value, formatMoney(1050))
  assert.equal(withRev.find((t) => t.label === "ROAS")?.value, "4.20x")
  assert.equal(withRev.find((t) => t.label === "Conversions")?.value, "10")
  assert.equal(withRev.find((t) => t.label === "CPA")?.value, "$25.00")
  assert.equal(section.aggregate.kpiBand.tiles.find((t) => t.label === "ROAS")?.value, "4.20x")
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
  // Raw search revenue alone adds no tiles (switch off).
  assert.deepEqual(withRevenue.aggregate.kpiBand.tiles, zero.aggregate.kpiBand.tiles)
})

test("switch off returns the section untouched", () => {
  const section = build(TWO_LINES)
  assert.equal(applyConversionsToSection(section, null, { window: WINDOW, spendByLine: new Map() }), section)
})

test("revenue with zero spend still shows both tiles; ROAS is a dash", () => {
  const section = applyConversionsToSection(
    build(TWO_LINES),
    conversions([{ id: "se-rev", conversions: 4, revenue: 500 }]),
    { window: WINDOW, spendByLine: spend([["se-rev", 0]]) },
  )
  const tiles = lineTiles(section, "se-rev")
  assert.equal(tiles.find((t) => t.label === "Revenue")?.value, formatMoney(500))
  assert.equal(tiles.find((t) => t.label === "ROAS")?.value, "—")
})

test("a line with no conversions reads zero revenue, not untracked", () => {
  const section = applyConversionsToSection(
    build(TWO_LINES),
    conversions([{ id: "se-rev", conversions: 10, revenue: 1050 }]),
    { window: WINDOW, spendByLine: spend([["se-rev", 250], ["se-none", 100]]) },
  )
  const without = lineTiles(section, "se-none")
  assert.equal(without.find((t) => t.label === "Revenue")?.value, formatMoney(0))
  assert.equal(without.find((t) => t.label === "ROAS")?.value, "0.00x")
  assert.equal(without.find((t) => t.label === "CPA")?.value, null)
})

test("no Google events chosen: tiles say not tracked", () => {
  const section = applyConversionsToSection(
    build(TWO_LINES),
    conversions([], { trackedPlatforms: ["meta_ads"], valuePlatforms: [] }),
    { window: WINDOW, spendByLine: spend([["se-rev", 250]]) },
  )
  const tile = section.aggregate.kpiBand.tiles.find((t) => t.label === "Conversions")
  assert.equal(tile?.value, null)
  assert.equal(tile?.emptyHint, "not-tracked")
})

test("headline label follows the client's choice", () => {
  const section = applyConversionsToSection(
    build(TWO_LINES),
    conversions([{ id: "se-rev", conversions: 10, revenue: 0 }], { headline: "leads", showRevenue: false }),
    { window: WINDOW, spendByLine: spend([["se-rev", 250]]) },
  )
  const labels = tileLabels(section)
  assert.ok(labels.includes("Leads"))
  assert.ok(!labels.includes("Conversions"))
  assert.ok(!labels.includes("Revenue"))
})
