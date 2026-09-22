import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { lineCardFromSearch } from "../../channel/lineCardModel.js"
import { LINE_AS_OF, searchFixture } from "../../channel/__tests__/fixtures.js"
import type { NormalisedBurst } from "../../campaigns/types.js"
import type { DailyFactPoint } from "../dailyFromFacts.js"
import {
  NO_BURSTS_BOOKED,
  burstsFromLines,
  overlappingBurstRows,
} from "../burstsFromLines.js"

const B1: NormalisedBurst = {
  index: 0,
  startDate: "2026-07-01",
  endDate: "2026-07-31",
  budget: 10_000,
  buyAmount: 10_000,
  calculatedValue: 200_000,
}

const B2: NormalisedBurst = {
  index: 1,
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  budget: 10_000,
  buyAmount: 10_000,
  calculatedValue: 200_000,
}

function twoBurstLine(lineItemId = "jayco001se1") {
  return lineCardFromSearch(
    searchFixture({
      lineItemId,
      bursts: [B1, B2],
      totalBursts: 2,
      currentBurstIndex: 1,
      currentBurst: B2,
      spendToDateCurrentBurst: 4_000,
    }),
    LINE_AS_OF,
  )
}

function fact(overrides: Partial<DailyFactPoint> = {}): DailyFactPoint {
  return {
    date: "2026-09-01",
    channelKey: "search",
    channelLabel: "Search · Google Ads",
    lineItemId: "jayco001se1",
    spend: 0,
    impressions: 0,
    clicks: 0,
    views: 0,
    results: 0,
    ...overrides,
  }
}

describe("burstsFromLines", () => {
  it("returns real burst segments with pace for a two-burst line", () => {
    const line = twoBurstLine()
    const bursts = burstsFromLines(
      [line],
      LINE_AS_OF,
      [
        fact({
          date: "Wed Jul 15 2026 00:00:00 GMT+0000",
          spend: 5_000,
          impressions: 80_000,
          clicks: 400,
        }),
        fact({ date: "2026-09-10", spend: 4_000, impressions: 50_000, clicks: 200 }),
        fact({ date: "2026-08-15", spend: 99, impressions: 1, clicks: 1 }),
      ],
    )

    assert.equal(bursts.length, 2)
    assert.equal(bursts[0]?.start, "2026-07-01")
    assert.equal(bursts[0]?.end, "2026-07-31")
    assert.equal(bursts[0]?.budget, 10_000)
    assert.equal(bursts[0]?.spend, 5_000)
    assert.equal(bursts[0]?.impressions, 80_000)
    assert.ok(bursts[0]!.expected > 0)
    assert.ok(Number.isFinite(bursts[0]!.pct))
    assert.equal(bursts[1]?.start, "2026-09-01")
    assert.equal(bursts[1]?.end, "2026-09-30")
    assert.equal(bursts[1]?.spend, 4_000)
    assert.ok(bursts[1]!.pct > 0)
    assert.notEqual(bursts[0]?.pct, bursts[1]?.pct)
  })

  it("renders one no-bursts-booked lane when the line has no bursts", () => {
    const line = lineCardFromSearch(
      searchFixture({
        bursts: [],
        totalBursts: 0,
        currentBurst: null,
        currentBurstIndex: null,
        spendToDateCurrentBurst: 0,
      }),
      LINE_AS_OF,
    )
    const bursts = burstsFromLines([{ ...line, burstStart: null, burstEnd: null, burstBudget: null }], LINE_AS_OF, [])
    assert.equal(bursts.length, 1)
    assert.equal(bursts[0]?.empty, true)
    assert.equal(bursts[0]?.name, NO_BURSTS_BOOKED)
    assert.equal(bursts[0]?.lineItemId, line.lineItemId)
  })
})

describe("overlappingBurstRows", () => {
  it("includes only lines with overlapping bursts and the clicked line first", () => {
    const clicked = twoBurstLine("jayco001se1")
    const overlap = twoBurstLine("jayco001se2")
    const later = lineCardFromSearch(
      searchFixture({
        lineItemId: "jayco001se3",
        bursts: [
          {
            index: 0,
            startDate: "2026-12-01",
            endDate: "2026-12-31",
            budget: 8_000,
            buyAmount: 8_000,
            calculatedValue: 50_000,
          },
        ],
        totalBursts: 1,
        currentBurstIndex: null,
        currentBurst: null,
      }),
      LINE_AS_OF,
    )
    const all = burstsFromLines(
      [later, overlap, clicked],
      LINE_AS_OF,
      [
        fact({ lineItemId: "jayco001se1", date: "2026-07-10", spend: 1_000 }),
        fact({ lineItemId: "jayco001se2", date: "2026-07-20", spend: 2_000 }),
        fact({ lineItemId: "jayco001se3", date: "2026-12-10", spend: 3_000 }),
      ],
    )
    const rows = overlappingBurstRows(all, { start: "2026-07-01", end: "2026-07-31" }, "jayco001se1")
    assert.deepEqual(
      rows.map((row) => row.lineItemId),
      ["jayco001se1", "jayco001se2"],
    )
    assert.equal(rows[0]?.start, "2026-07-01")
    assert.equal(rows[1]?.start, "2026-07-01")
  })
})
