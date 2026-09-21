import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { dailyFromFacts, type DailyFactPoint } from "../dailyFromFacts.js"

function fact(overrides: Partial<DailyFactPoint> = {}): DailyFactPoint {
  return {
    date: "2026-09-01",
    channelKey: "search",
    channelLabel: "Search · Google Ads",
    lineItemId: "hartm001se1",
    spend: 100,
    impressions: 10,
    clicks: 1,
    views: 0,
    results: 0,
    ...overrides,
  }
}

describe("dailyFromFacts", () => {
  it("returns one series per day for mixed search and social rows", () => {
    const result = dailyFromFacts({
      facts: [
        fact({ date: "2026-09-01", channelKey: "search", spend: 100, impressions: 10, clicks: 1 }),
        fact({
          date: "2026-09-01",
          channelKey: "social",
          channelLabel: "Social · Meta",
          lineItemId: "hartm001sm1",
          spend: 50,
          impressions: 20,
          clicks: 2,
          views: 5,
          results: 1,
        }),
        fact({ date: "2026-09-02", spend: 80, impressions: 8, clicks: 1 }),
      ],
      asOf: "2026-09-02",
      metric: "spend",
    })

    assert.equal(result.series.length, 1)
    assert.equal(result.series[0]?.key, "combined")
    assert.equal(result.series[0]?.points.length, 2)
    assert.equal(result.series[0]?.points[0]?.date, "2026-09-01")
    assert.equal(result.series[0]?.points[0]?.actual, 150)
    assert.equal(result.series[0]?.points[0]?.byLine.length, 2)
    assert.equal(result.series[0]?.points[1]?.date, "2026-09-02")
    assert.equal(result.series[0]?.points[1]?.actual, 80)
    assert.equal(result.empty, false)
    assert.equal(result.table.length, 2)
    assert.equal(result.table[0]?.spend, 150)
    assert.equal(result.table[0]?.impressions, 30)
    assert.equal(result.table[0]?.results, 1)
  })

  it("normalises Snowflake Date strings onto the ISO day key", () => {
    const result = dailyFromFacts({
      facts: [
        fact({
          date: "Sat Sep 19 2026 00:00:00 GMT+0000",
          spend: 25,
        }),
      ],
      asOf: "2026-09-21",
      metric: "spend",
    })
    assert.equal(result.series[0]?.points.length, 1)
    assert.equal(result.series[0]?.points[0]?.date, "2026-09-19")
    assert.equal(result.series[0]?.points[0]?.actual, 25)
  })

  it("honours an optional date_from / date_to window", () => {
    const result = dailyFromFacts({
      facts: [
        fact({ date: "2026-09-01", spend: 10 }),
        fact({ date: "2026-09-10", spend: 40 }),
        fact({ date: "2026-09-20", spend: 90 }),
      ],
      asOf: "2026-09-21",
      metric: "spend",
      window: { date_from: "2026-09-10", date_to: "2026-09-15" },
    })
    assert.equal(result.series[0]?.points.length, 1)
    assert.equal(result.series[0]?.points[0]?.date, "2026-09-10")
    assert.equal(result.series[0]?.points[0]?.actual, 40)
  })

  it("returns an empty series when there are no daily rows", () => {
    const result = dailyFromFacts({
      facts: [],
      asOf: "2026-09-21",
      metric: "spend",
    })
    assert.equal(result.series.length, 0)
    assert.equal(result.table.length, 0)
    assert.equal(result.empty, true)
  })
})
