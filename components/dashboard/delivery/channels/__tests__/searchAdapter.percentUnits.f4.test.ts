import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

import { buildSearchSection } from "../searchAdapter"
import type { KpiTileProps } from "../../shared/KpiTile"
import type { SearchPacingDailyRow, SearchPacingResponse } from "@/lib/snowflake/search-pacing-service"

/**
 * B3 (F4, MATH-10): client dashboard percents are decimal ratios formatted
 * without guessing the unit from the number's size (`lib/kpi/percentUnits.ts`).
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../..")

const LINE = {
  line_item_id: "hartm001se1",
  buy_type: "cpc",
  bursts: [{ budget: "3100", buyAmount: "1", calculatedValue: 3100, startDate: "2026-09-30T14:00:00.000Z", endDate: "2026-10-30T13:00:00.000Z" }],
}

function build(topImpressionPct: number | null) {
  const daily: SearchPacingDailyRow[] = Array.from({ length: 5 }, (_, i) => ({
    date: `2026-10-0${i + 1}`,
    cost: 100,
    clicks: 25,
    conversions: 1,
    revenue: 0,
    impressions: 1000,
    topImpressionPct,
  }))
  const totals = { cost: 500, clicks: 125, conversions: 5, revenue: 0, impressions: 5000, topImpressionPct }
  const data: SearchPacingResponse = {
    totals,
    daily,
    lineItems: [{ lineItemId: "hartm001se1", lineItemName: "Search", totals, daily }],
    keywords: [],
  }
  const section = buildSearchSection({
    searchLineItems: [LINE],
    searchData: data,
    campaignStart: "2026-10-01",
    campaignEnd: "2026-10-31",
    filterRange: { start: null, end: null },
    kpiTargets: undefined,
    mbaNumber: "hartm001",
    kpiVersionNumber: 1,
    lineItemTargets: undefined,
    pacingWindow: { asAtISO: "2026-10-06", campaignStartISO: "2026-10-01", campaignEndISO: "2026-10-31" },
    pacingAsAtISO: "2026-10-05",
    lastSyncedAt: null,
  })
  assert.ok(section)
  return section
}

const tile = (tiles: readonly KpiTileProps[], label: string) => {
  const t = tiles.find((x) => x.label === label)
  assert.ok(t, label)
  return t
}

test("CTR and top impression share are decimal ratios: 2.50% and 45.00%", () => {
  const section = build(0.45)
  for (const tiles of [section.aggregate.kpiBand.tiles, section.lineItems[0]!.block.kpiBand.tiles]) {
    assert.equal(tile(tiles, "CTR").value, "2.50%")
    assert.equal(tile(tiles, "Top Impression Share").value, "45.00%")
  }
})

test("no top impression data shows a dash, not 0%", () => {
  const section = build(null)
  assert.equal(tile(section.aggregate.kpiBand.tiles, "Top Impression Share").value, "—")
})

test("neither dashboard file guesses the percent unit from magnitude", () => {
  for (const rel of [
    "components/dashboard/delivery/channels/searchAdapter.ts",
    "components/dashboard/delivery/shared/EntityBreakdownTable.tsx",
  ]) {
    const src = readFileSync(join(ROOT, rel), "utf8")
    assert.doesNotMatch(src, /formatPercentAuto/, rel)
    assert.doesNotMatch(src, /<= 1 \? n \* 100/, rel)
    assert.match(src, /formatRatioAsPercent/, rel)
  }
})
