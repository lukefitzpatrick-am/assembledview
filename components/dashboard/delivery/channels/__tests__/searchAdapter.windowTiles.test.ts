import assert from "node:assert/strict"
import test from "node:test"

import { buildSearchSection, searchTotalsInWindow } from "../searchAdapter"
import { resolvePacingWindow } from "@/lib/pacing/expectedForWindow"
import type { KpiTileProps } from "../../shared/KpiTile"
import type { SearchPacingDailyRow, SearchPacingResponse } from "@/lib/snowflake/search-pacing-service"

// Bursts are Sydney midnights: 2026-09-30T14:00Z is 1 Oct, 2026-10-30T13:00Z is 31 Oct.
// A UTC day key would read 30 Sep to 30 Oct.
const SEARCH_LINE = {
  line_item_id: "hartm001se1",
  buy_type: "cpc",
  bursts: [
    {
      budget: "3100",
      buyAmount: "1",
      calculatedValue: 3100,
      startDate: "2026-09-30T14:00:00.000Z",
      endDate: "2026-10-30T13:00:00.000Z",
    },
  ],
}

function day(date: string): SearchPacingDailyRow {
  return { date, cost: 100, clicks: 100, conversions: 5, revenue: 0, impressions: 1000, topImpressionPct: 0.5 }
}

// 1 Oct to 20 Oct (today). Today must not count.
const DAILY = Array.from({ length: 20 }, (_, i) => day(`2026-10-${String(i + 1).padStart(2, "0")}`))

function data(): SearchPacingResponse {
  const totals = DAILY.reduce(
    (a, d) => ({
      cost: a.cost + d.cost,
      clicks: a.clicks + d.clicks,
      conversions: a.conversions + d.conversions,
      revenue: 0,
      impressions: a.impressions + d.impressions,
      topImpressionPct: 0.5,
    }),
    { cost: 0, clicks: 0, conversions: 0, revenue: 0, impressions: 0, topImpressionPct: 0.5 as number | null },
  )
  return {
    totals,
    daily: DAILY,
    lineItems: [{ lineItemId: "hartm001se1", lineItemName: "Search", totals, daily: DAILY }],
    keywords: [],
  }
}

function build(filterRange: { start: Date | null; end: Date | null } = { start: null, end: null }) {
  const section = buildSearchSection({
    searchLineItems: [SEARCH_LINE],
    searchData: data(),
    campaignStart: "2026-10-01",
    campaignEnd: "2026-10-31",
    filterRange,
    kpiTargets: undefined,
    mbaNumber: "hartm001",
    kpiVersionNumber: 1,
    lineItemTargets: undefined,
    // The old tiles ran to this date (Melbourne today).
    pacingWindow: { asAtISO: "2026-10-20", campaignStartISO: "2026-10-01", campaignEndISO: "2026-10-31" },
    pacingAsAtISO: "2026-10-19",
    lastSyncedAt: null,
  })
  assert.ok(section)
  return section
}

const tile = (tiles: readonly KpiTileProps[], label: string) => {
  const t = tiles.find((x) => x.label === label)
  assert.ok(t, `tile ${label}`)
  return t
}

test("search KPI tiles count Sydney days to Melbourne yesterday, like the cards", () => {
  const section = build()
  for (const tiles of [section.aggregate.kpiBand.tiles, section.lineItems[0]!.block.kpiBand.tiles]) {
    // 19 days delivered (1 to 19 Oct), not 20.
    assert.equal(tile(tiles, "Conversions").value, "95")
    assert.equal(tile(tiles, "Impressions").value, "19,000")
    // Expected clicks: 19 of 31 Sydney days of 3,100 = 1,900; at a 10% CTR that is 19,000.
    // The old UTC day key (30 Sep to 30 Oct, to 20 Oct) gave 2,100 clicks and 21,000.
    assert.equal(tile(tiles, "Impressions").expected, "19,000")
    assert.equal(tile(tiles, "CPC").expected, "$1.00")
  }
  const clicksCard = section.aggregate.progressCards[1]!
  assert.equal(clicksCard.expected, 1900)
})

test("a date filter narrows the tiles to the filter days", () => {
  const section = build({ start: new Date(2026, 9, 6), end: new Date(2026, 9, 10) })
  const lineTiles = section.lineItems[0]!.block.kpiBand.tiles
  assert.equal(tile(lineTiles, "Conversions").value, "25")
  assert.equal(tile(lineTiles, "Impressions").value, "5,000")
  assert.equal(tile(lineTiles, "Impressions").expected, "5,000")
})

test("searchTotalsInWindow skips days outside the window", () => {
  const window = resolvePacingWindow({ campaignStartISO: "2026-10-01", campaignEndISO: "2026-10-31", asAtISO: "2026-10-19" })
  const totals = searchTotalsInWindow(DAILY, window)
  assert.equal(totals.cost, 1900)
  assert.equal(totals.clicks, 1900)
})

test("line chart dates use Sydney burst days", () => {
  const section = build()
  const chart = section.lineItems[0]!.block.chart
  assert.equal(chart.kind, "daily-delivery")
  if (chart.kind === "daily-delivery") {
    assert.deepEqual(chart.lineDates, { startISO: "2026-10-01", endISO: "2026-10-31" })
  }
})
