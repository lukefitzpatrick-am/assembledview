import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { formatMoney } from "@/lib/format/money"
import { lineCardFromSearch } from "../../channel/lineCardModel.js"
import { LINE_AS_OF, searchFixture } from "../../channel/__tests__/fixtures.js"
import type { CampaignPacingRow } from "../../portfolio/types.js"
import { assembleCampaignDetailPayload } from "../assembleCampaignDetailPayload.js"
import { kpisFromLines } from "../kpisFromLines.js"
import { lineDetailDescription, visibleLineDetailColumns } from "../lineDetailColumns.js"

function campaignRow(overrides: Partial<CampaignPacingRow> = {}): CampaignPacingRow {
  return {
    mbaNumber: "jayco001",
    versionNumber: 14,
    clientName: "Jayco",
    clientSlug: "jayco",
    campaignName: "Jayco AU",
    status: "booked",
    startDate: "2026-07-01",
    endDate: "2026-12-31",
    daysElapsed: 77,
    daysTotal: 184,
    daysLeft: 107,
    timePct: 42,
    budget: 50_000,
    spendToDate: 15_000,
    expectedToDate: 20_000,
    spendPct: 75,
    pace: "behind",
    projectedFinish: 40_000,
    spendYesterday: 400,
    dailyRateActual: 200,
    dailyRatePlan: 270,
    kpi: { tracked: 1, total: 2 },
    moneyAtRisk: 1_000,
    why: "Search is behind time.",
    channels: [
      {
        channelKey: "search",
        label: "Search · Google",
        spendToDate: 15_000,
        budget: 50_000,
        expectedToDate: 20_000,
        spendPct: 75,
        pace: "behind",
        spendMode: "actual",
        deliverable: null,
        sourceState: "reporting",
        lineItemIds: ["jayco001se1"],
      },
    ],
    ...overrides,
  }
}

describe("assembleCampaignDetailPayload", () => {
  it("returns the campaign-detail route shape from fixtures", () => {
    const line = lineCardFromSearch(searchFixture(), LINE_AS_OF)
    const payload = assembleCampaignDetailPayload({
      row: campaignRow(),
      lines: [line],
      asOf: LINE_AS_OF,
      dailyFacts: [
        {
          date: LINE_AS_OF,
          channelKey: "search",
          channelLabel: "Search · Google Ads",
          spend: 400,
          impressions: 2_000,
          clicks: 80,
          views: 0,
        },
      ],
      notes: [
        {
          id: "insight:1",
          at: `${LINE_AS_OF}T00:00:00.000Z`,
          author: "luke",
          body: "Watch CPC",
          source: "insight",
        },
      ],
    })

    assert.deepEqual(Object.keys(payload).toSorted(), [
      "bursts",
      "clientId",
      "daily",
      "kpis",
      "lines",
      "notes",
      "read",
      "row",
      "scenarioLines",
    ])
    assert.equal(payload.row.mbaNumber, "jayco001")
    assert.equal(payload.lines[0]?.lineItemId, "jayco001se1")
    assert.ok(payload.kpis.length >= 1)
    assert.ok(payload.bursts.length >= 1)
    assert.equal(payload.daily.metric, "spend")
    assert.ok(payload.daily.series.some((series) => series.key === "combined"))
    assert.ok(payload.daily.byMetric.impressions.some((series) => series.key === "combined"))
    assert.equal(payload.read, null)
    assert.equal(payload.notes[0]?.body, "Watch CPC")
  })
})

describe("visibleLineDetailColumns", () => {
  it("hides optional columns that are empty on every line", () => {
    const line = lineCardFromSearch(searchFixture(), LINE_AS_OF)
    const emptyCpm = { ...line, cpm: null, views: null, buyType: null, fixedCost: false }
    const keys = visibleLineDetailColumns([emptyCpm]).map((column) => column.key)
    assert.ok(keys.includes("line"))
    assert.ok(keys.includes("clicks"))
    assert.equal(keys.includes("cpm"), false)
    assert.equal(keys.includes("views"), false)
    assert.equal(keys.includes("buyType"), false)
    assert.equal(keys.includes("fixedCost"), false)
  })
})

describe("lineDetailDescription", () => {
  it("joins name, channel · platform, targeting, buy type and budget", () => {
    const line = lineCardFromSearch(searchFixture(), LINE_AS_OF)
    assert.equal(
      lineDetailDescription(line),
      `Jayco AU – Annual Plan, search · Google Ads, brand + generic RV, cpc, ${formatMoney(20_000, { decimals: 0 })}`,
    )
  })
})

describe("kpisFromLines", () => {
  it("groups KPI rows under one card per line", () => {
    const brand = lineCardFromSearch(
      searchFixture({ lineItemId: "jayco001se1", campaignName: "Brand search" }),
      LINE_AS_OF,
    )
    const generic = lineCardFromSearch(
      searchFixture({ lineItemId: "jayco001se2", campaignName: "Generic search", buyType: "cpm" }),
      LINE_AS_OF,
    )
    const cards = kpisFromLines([brand, generic])
    assert.equal(cards.length, 2)
    assert.equal(cards[0]?.key, "jayco001se1")
    assert.equal(cards[0]?.lineItemId, "jayco001se1")
    assert.equal(cards[0]?.name, "Brand search")
    assert.match(cards[0]?.channelPlatform ?? "", /search · Google Ads/)
    assert.deepEqual(
      cards[0]?.rows.map((row) => row.label),
      brand.kpis.map((kpi) => kpi.label),
    )
    assert.equal(cards[1]?.key, "jayco001se2")
    assert.equal(cards[1]?.name, "Generic search")
    assert.equal(cards[1]?.buyType, "cpm")
    assert.deepEqual(
      cards[1]?.rows.map((row) => row.label),
      generic.kpis.map((kpi) => kpi.label),
    )
    assert.ok(cards[0]?.rows.every((row) => row.targetCaption))
  })

  it("collapses a line whose every KPI is not tracked for this source", () => {
    const line = lineCardFromSearch(searchFixture(), LINE_AS_OF)
    const cards = kpisFromLines([
      {
        ...line,
        kpis: line.kpis.map((kpi) => ({
          ...kpi,
          delivered: "Not tracked for this source",
        })),
      },
    ])
    assert.equal(cards[0]?.untracked, true)
    assert.equal(cards[0]?.rows.length, 0)
  })
})
